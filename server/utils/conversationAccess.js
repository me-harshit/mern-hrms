const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const ChatAuditLog = require('../models/ChatAuditLog');
const User = require('../models/User');

/**
 * Membership, permissions and the project-group lifecycle.
 *
 * Every rule about who may read or write a conversation lives here rather than
 * in routes/conversations.js, for the same reason utils/taskScoping.js exists:
 * the rules are consulted from several places (the routes, the project hook,
 * the task-assignment hook, the socket layer) and a second copy is how two
 * copies quietly disagree.
 */

// Sees every conversation, whether or not they are a member.
const IS_OVERSIGHT = ['ADMIN'];

// May create a project group / rename one, beyond its own members.
const IS_PRIVILEGED = ['ADMIN', 'HR'];

const idStr = (v) => (v ? String(v._id || v) : '');

/* ------------------------------------------------------------------ *
 * Membership queries
 * ------------------------------------------------------------------ */

/** The member row for this user, or undefined. Includes hidden members. */
const memberRow = (conversation, userId) =>
    (conversation.members || []).find(
        (m) => idStr(m.user) === String(userId) && !m.leftAt
    );

/** Ordinary participant — excludes an oversight admin who is not a member. */
const isMember = (conversation, userId) => Boolean(memberRow(conversation, userId));

const isHiddenMember = (conversation, userId) => Boolean(memberRow(conversation, userId)?.hidden);

/**
 * The members a given viewer is allowed to know about.
 *
 * This is the ONE place hidden membership is applied. F3.10 as management
 * specified it means an admin sitting in a group is not listed to the others;
 * everything else in the module reads membership through this function, so
 * flipping to the disclosed model recommended in the feature draft §4 is a
 * change to this function alone.
 */
const visibleMembers = (conversation, viewerId) => {
    const viewerIsHidden = isHiddenMember(conversation, viewerId);
    return (conversation.members || []).filter((m) => {
        if (m.leftAt) return false;
        if (!m.hidden) return true;
        // A hidden member sees themselves, and sees other hidden members —
        // otherwise two admins in the same group would each post believing
        // they were alone in overseeing it.
        return viewerIsHidden || idStr(m.user) === String(viewerId);
    });
};

/** Member ids to notify — hidden members included; they asked to be there. */
const memberIds = (conversation) =>
    (conversation.members || []).filter((m) => !m.leftAt).map((m) => idStr(m.user));

/* ------------------------------------------------------------------ *
 * Permissions
 * ------------------------------------------------------------------ */

/**
 * Can this person open the conversation at all?
 *
 * Returns { ok, viaOversight } — the caller needs to know *how* access was
 * granted, because an oversight read gets logged and a member read does not.
 */
const canRead = (conversation, reqUser) => {
    if (isMember(conversation, reqUser.id)) return { ok: true, viaOversight: false };

    /*
     * Oversight covers GROUPS ONLY — every group, whoever created it, project
     * or custom, whether or not the admin was ever a member.
     *
     * A direct message is readable by the two people in it and by nobody else,
     * admin included. This is the single gate for that: canRead is what
     * GET /:id and GET /:id/messages both go through, so there is no oversight
     * path to a private 1-to-1 conversation anywhere in the module.
     */
    if (conversation.kind === 'group' && IS_OVERSIGHT.includes(reqUser.role)) {
        return { ok: true, viaOversight: true };
    }

    return { ok: false, viaOversight: false };
};

/**
 * Can this person post?
 *
 * Only members — including hidden ones. An oversight admin who has not joined
 * reads without speaking; to speak they join (openly or hidden), which is an
 * explicit act and therefore an auditable one.
 */
const canPost = (conversation, reqUser) => isMember(conversation, reqUser.id);

/**
 * Can this person change the group — rename it, add or remove members?
 *
 * Group owners and group admins, plus company ADMIN/HR. A project group's
 * membership is largely maintained by the task hook, but a lead still needs to
 * be able to pull someone in who is not assigned a task yet.
 */
const canManage = (conversation, reqUser) => {
    if (conversation.kind === 'direct') return false;
    if (IS_PRIVILEGED.includes(reqUser.role)) return true;
    const row = memberRow(conversation, reqUser.id);
    return Boolean(row && (row.role === 'owner' || row.role === 'admin'));
};

/* ------------------------------------------------------------------ *
 * Audit
 * ------------------------------------------------------------------ */

/** Best-effort; never allowed to fail the request that prompted it. */
const audit = async (reqUser, conversationId, action, detail = '', ip = '') => {
    try {
        await ChatAuditLog.create({
            actor: reqUser.id,
            actorRole: reqUser.role,
            conversationId,
            action,
            detail: String(detail).slice(0, 500),
            ip
        });
    } catch (err) {
        console.error('[CHAT AUDIT] could not record', action, '-', err.message);
    }
};

/* ------------------------------------------------------------------ *
 * Writing activity back to the conversation
 * ------------------------------------------------------------------ */

/**
 * The preview line the sidebar shows for a message.
 *
 * Attachment-only messages still need words, or the chat list shows a blank row
 * for a voice note.
 */
const previewFor = (message) => {
    if (message.deletedAt) return { text: 'This message was deleted', kind: 'text' };
    if (message.systemEvent?.type) return { text: message.text || '', kind: 'system' };

    const first = (message.attachments || [])[0];
    if (message.text) {
        return { text: message.text.slice(0, 140), kind: first ? first.type : 'text' };
    }
    if (!first) return { text: '', kind: 'text' };

    const labels = {
        image: '📷 Photo',
        audio: '🎤 Voice note',
        video: '🎬 Recording',
        document: '📎 File'
    };
    const count = message.attachments.length;
    const label = labels[first.type] || '📎 Attachment';
    return { text: count > 1 ? `${label} +${count - 1}` : label, kind: first.type };
};

/**
 * Update the denormalised preview and the sidebar sort key.
 *
 * Kept here so no route has to remember it — a conversation whose lastMessage
 * drifts out of sync shows the wrong preview forever, and nothing surfaces the
 * error.
 */
const touchConversation = async (conversationId, message, senderName) => {
    const preview = previewFor(message);
    await Conversation.updateOne(
        { _id: conversationId },
        {
            $set: {
                lastMessage: {
                    text: preview.text,
                    sender: message.sender || null,
                    senderName: senderName || '',
                    kind: preview.kind,
                    at: message.createdAt || new Date()
                },
                lastActivityAt: message.createdAt || new Date()
            }
        }
    );
};

/**
 * Record a membership change as a message in the thread.
 *
 * WhatsApp shows these inline, and it is the only way a group explains itself:
 * without them, people appear and vanish from the member list with no trace of
 * who did it.
 */
const postSystemMessage = async (conversationId, { type, actor, actorName, targets = [], targetNames = [], extra = '' }) => {
    const names = targetNames.join(', ');
    const sentences = {
        created: `${actorName} created this group`,
        added: `${actorName} added ${names}`,
        removed: `${actorName} removed ${names}`,
        left: `${actorName} left`,
        renamed: `${actorName} changed the group name to "${extra}"`,
        joined_via_link: `${actorName} joined via invite link`
    };

    const message = await Message.create({
        conversationId,
        sender: null,
        text: sentences[type] || '',
        systemEvent: { type, actor, targets }
    });

    await touchConversation(conversationId, message, '');
    return message;
};

/* ------------------------------------------------------------------ *
 * Project groups
 * ------------------------------------------------------------------ */

/**
 * Create the group that belongs to a project, or return the existing one.
 *
 * Called when a project is created, and again lazily whenever someone is
 * assigned a task on a project — projects that predate this feature have no
 * group, and creating it on first need means nobody has to run a migration or
 * re-save every old project by hand.
 *
 * Seeded with the project lead and whoever created the project; everyone else
 * arrives through syncProjectGroupMembers as work is assigned to them.
 */
const ensureProjectGroup = async (project, actorId = null) => {
    if (!project?._id) return null;

    const existing = await Conversation.findOne({
        projectId: project._id,
        groupType: 'project'
    });
    if (existing) return existing;

    const seed = [project.projectLead, project.createdBy, actorId]
        .map(idStr)
        .filter(Boolean);

    const unique = [...new Set(seed)];

    const owner = idStr(project.projectLead) || idStr(project.createdBy) || idStr(actorId);

    const conversation = await Conversation.create({
        kind: 'group',
        groupType: 'project',
        name: project.name,
        description: project.description || `Project group for ${project.name}`,
        projectId: project._id,
        createdBy: project.createdBy || actorId || null,
        members: unique.map((id) => ({
            user: id,
            role: id === owner ? 'owner' : 'member',
            addedBy: actorId || project.createdBy || null
        })),
        lastActivityAt: new Date()
    });

    return conversation;
};

/**
 * Pull a set of people into a project's group.
 *
 * The chosen model for "who is in a project group" is derived, not declared:
 * Project has no members field, and adding one would mean a second list to keep
 * in step with reality. Being assigned work on a project *is* the signal that
 * you belong in its conversation, so routes/tasks.js calls this on assignment.
 *
 * Idempotent, and silent on failure — a chat-membership hiccup must never stop
 * a task from being assigned.
 *
 * `actorLabel` is what the system line in the thread attributes the join to.
 * It defaults to the live case ("Task assignment added Rahul"); the backfill
 * script passes its own wording, because "Task assignment" is untrue for people
 * pulled in from work they were given months ago.
 */
const syncProjectGroupMembers = async (projectId, userIds = [], actorId = null, actorLabel = 'Task assignment') => {
    try {
        if (!projectId || !userIds.length) return null;

        const Project = mongoose.model('Project');
        const project = await Project.findById(projectId);
        if (!project) return null;

        const conversation = await ensureProjectGroup(project, actorId);
        if (!conversation) return null;

        const already = new Set(memberIds(conversation));
        const toAdd = [...new Set(userIds.map(idStr).filter(Boolean))]
            .filter((id) => !already.has(id));

        if (!toAdd.length) return conversation;

        await Conversation.updateOne(
            { _id: conversation._id },
            {
                $push: {
                    members: {
                        $each: toAdd.map((id) => ({
                            user: id,
                            role: 'member',
                            addedBy: actorId || null,
                            joinedAt: new Date()
                        }))
                    }
                }
            }
        );

        // Say so in the thread, the same as a manual add.
        const users = await User.find({ _id: { $in: toAdd } }).select('name');
        if (users.length) {
            await postSystemMessage(conversation._id, {
                type: 'added',
                actor: actorId,
                actorName: actorLabel,
                targets: toAdd,
                targetNames: users.map((u) => u.name)
            });
        }

        return conversation;
    } catch (err) {
        console.error('[CHAT] project group sync failed:', err.message);
        return null;
    }
};

/**
 * The DM between two people, created on first message.
 *
 * The unique index on directKey is the real guard: two people pressing send at
 * the same moment would both find nothing and both insert, so the duplicate is
 * caught at the database and the loser re-reads.
 */
const findOrCreateDirect = async (userA, userB) => {
    const pair = [String(userA), String(userB)].sort();
    const directKey = pair.join(':');

    const existing = await Conversation.findOne({ directKey });
    if (existing) return existing;

    try {
        return await Conversation.create({
            kind: 'direct',
            directKey,
            members: pair.map((id) => ({ user: id, role: 'member' })),
            createdBy: userA,
            lastActivityAt: new Date()
        });
    } catch (err) {
        if (err.code === 11000) return Conversation.findOne({ directKey });
        throw err;
    }
};

module.exports = {
    IS_OVERSIGHT,
    IS_PRIVILEGED,
    idStr,
    memberRow,
    isMember,
    isHiddenMember,
    visibleMembers,
    memberIds,
    canRead,
    canPost,
    canManage,
    audit,
    previewFor,
    touchConversation,
    postSystemMessage,
    ensureProjectGroup,
    syncProjectGroupMembers,
    findOrCreateDirect
};
