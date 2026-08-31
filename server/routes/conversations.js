const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const router = express.Router();

const auth = require('../middleware/authMiddleware');
const chatUpload = require('../middleware/chatUploadMiddleware');
// Memory storage — a cropped avatar is a few hundred KB and goes straight to
// S3, so staging it on disk the way a 300MB screen recording needs would be
// two extra filesystem round trips for nothing.
const upload = require('../middleware/uploadMiddleware');

const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const VideoCompressionQueue = require('../models/VideoCompressionQueue');

const { processTaskFiles, discardStagedFiles, s3Folder } = require('../utils/taskMedia');
const { uploadToS3, deleteFromS3 } = require('../utils/s3Service');
const { emitToConversation, emitToUsers } = require('../utils/realtime');
const {
    IS_OVERSIGHT,
    idStr,
    memberRow,
    isMember,
    visibleMembers,
    memberIds,
    canRead,
    canPost,
    canManage,
    audit,
    previewFor,
    touchConversation,
    postSystemMessage,
    findOrCreateDirect
} = require('../utils/conversationAccess');

/**
 * Groups and internal chat — feature draft Module 3 (F3.1–F3.10).
 *
 * Mounted at /api/conversations, not /api/chat: that path is already the Gemini
 * assistant.
 *
 * Two kinds of group exist, and the difference is only in how membership
 * arrives. A *project* group is created with its project and grows as work is
 * assigned; a *custom* group is made by a person and grows because they add
 * people. Everything past that point — posting, attachments, mentions, search,
 * receipts — is one code path for both, and for direct messages too.
 */

const USER_FIELDS = 'name role employeeId profilePic department jobTitle';
const PAGE_SIZE = 40;

/** Populate the shape the client renders a message in. */
const populateMessage = (query) =>
    query
        .populate('sender', USER_FIELDS)
        .populate('mentions', 'name employeeId')
        .populate('systemEvent.actor', 'name')
        .populate('systemEvent.targets', 'name');

/**
 * Strip the content of a deleted message before it leaves the server.
 *
 * The row is kept so replies quoting it still resolve and the thread keeps its
 * shape, but "deleted" has to mean the words are actually gone — filtering it
 * in the client would ship the text to the browser and rely on it not being
 * looked at.
 */
const presentMessage = (doc) => {
    const m = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
    if (m.deletedAt) {
        m.text = '';
        m.attachments = [];
        m.mentions = [];
    }
    return m;
};

/** The per-viewer title and picture of a conversation. */
const decorate = (conversation, viewerId) => {
    const c = typeof conversation.toObject === 'function'
        ? conversation.toObject()
        : { ...conversation };

    c.members = visibleMembers(conversation, viewerId).map((m) => (
        typeof m.toObject === 'function' ? m.toObject() : { ...m }
    ));

    if (c.kind === 'direct') {
        // A DM has no stored name — it is titled by the other person, which is
        // different for each of the two people looking at it.
        const other = c.members.find((m) => idStr(m.user) !== String(viewerId));
        const person = other?.user;
        c.title = person?.name || 'Direct message';
        c.avatarUrl = person?.profilePic || '';
        c.otherUser = person || null;
    } else {
        c.title = c.name;
        c.avatarUrl = c.avatar || '';
    }

    const mine = memberRow(conversation, viewerId);
    c.myRole = mine?.role || null;
    c.muted = Boolean(mine?.muted);
    c.isMember = Boolean(mine);
    c.myHidden = Boolean(mine?.hidden);
    c.viaOversight = !mine;

    return c;
};

/**
 * The shape broadcast to a room of many people at once.
 *
 * decorate() answers "how does this look to *you*" — the title of a DM, your
 * role, whether you muted it. None of those are the same for two recipients, so
 * a broadcast must not carry them: a client merging this into its list would
 * otherwise overwrite its own membership with the first recipient's, and a
 * member would abruptly render as a non-member.
 *
 * Only the fields that are identical for everybody go out here; anything
 * viewer-specific is re-read by the client from GET /:id.
 */
const publicShape = (conversation) => {
    const c = typeof conversation.toObject === 'function'
        ? conversation.toObject()
        : { ...conversation };
    return {
        _id: c._id,
        kind: c.kind,
        groupType: c.groupType,
        name: c.name,
        title: c.kind === 'group' ? c.name : undefined,
        description: c.description,
        projectId: c.projectId,
        lastMessage: c.lastMessage,
        lastActivityAt: c.lastActivityAt,
        memberCount: (c.members || []).filter((m) => !m.leftAt && !m.hidden).length
    };
};

/* ================================================================== *
 * THE CHAT LIST
 * ================================================================== */

/**
 * GET /api/conversations
 * Everything this person is in, newest activity first, with unread counts.
 */
router.get('/', auth, async (req, res) => {
    try {
        const conversations = await Conversation.find({
            // $elemMatch, not two dotted paths: 'members.user' and
            // 'members.leftAt' as separate keys may be satisfied by two
            // different members, matching a group I have actually left.
            members: { $elemMatch: { user: req.user.id, leftAt: null } },
            isArchived: false
        })
            .populate('members.user', USER_FIELDS)
            .populate('projectId', 'name status')
            .sort({ lastActivityAt: -1 })
            .limit(300);

        /*
         * Unread counts in ONE query rather than one per conversation.
         *
         * Each conversation has its own read watermark, so the match is an $or
         * of (thisConversation AND newer than my watermark). A per-conversation
         * countDocuments would be a query per row in the sidebar, on every
         * page load.
         */
        /*
         * A closed chat drops out of the list until it next moves.
         *
         * Filtered here rather than in the query because it compares a field
         * inside the member subdocument (closedAt) against a top-level field on
         * the conversation (lastActivityAt), which a plain find cannot express.
         * The list is capped at 300 rows, so doing it in memory costs nothing.
         */
        const open = conversations.filter((c) => {
            const row = memberRow(c, req.user.id);
            if (!row?.closedAt) return true;
            return new Date(c.lastActivityAt) > new Date(row.closedAt);
        });

        const clauses = open
            .map((c) => {
                const row = memberRow(c, req.user.id);
                if (!row) return null;
                // Cleared messages are not unread — they are gone from this
                // person's view, so counting them would leave a badge that
                // opening the chat cannot clear.
                const since = [row.lastReadAt, row.clearedAt]
                    .filter(Boolean)
                    .map((d) => new Date(d).getTime());
                return {
                    conversationId: c._id,
                    createdAt: { $gt: since.length ? new Date(Math.max(...since)) : new Date(0) }
                };
            })
            .filter(Boolean);

        let unreadBy = {};
        if (clauses.length) {
            const counts = await Message.aggregate([
                {
                    $match: {
                        $or: clauses,
                        // Your own messages are never unread to you, and a
                        // system line ("X added Y") should not raise a badge.
                        sender: { $ne: new mongoose.Types.ObjectId(req.user.id), $nin: [null] },
                        // Nor should a message that was deleted before you got
                        // to it — a badge you cannot clear by looking is worse
                        // than no badge, because the chat opens with nothing new
                        // in it and the count stays put.
                        deletedAt: null
                    }
                },
                { $group: { _id: '$conversationId', n: { $sum: 1 } } }
            ]);
            unreadBy = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
        }

        const payload = open.map((c) => ({
            ...decorate(c, req.user.id),
            unread: unreadBy[String(c._id)] || 0
        }));

        res.json(payload);
    } catch (err) {
        console.error('[CHAT] list error:', err.message);
        res.status(500).json({ message: 'Could not load your chats' });
    }
});

/**
 * GET /api/conversations/contacts
 *
 * Everyone messageable. Management's rule for internal chat is deliberately
 * flat — "all employees, admins, HRs and managers are visible, anyone can
 * message anyone" — so this is not scoped the way task assignment is.
 */
router.get('/contacts', auth, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        const filter = { status: 'ACTIVE', _id: { $ne: req.user.id } };
        if (q) {
            filter.$or = [
                { name: new RegExp(q, 'i') },
                { employeeId: new RegExp(q, 'i') },
                { department: new RegExp(q, 'i') }
            ];
        }

        const users = await User.find(filter).select(USER_FIELDS).sort({ name: 1 }).limit(500);
        res.json(users);
    } catch (err) {
        console.error('[CHAT] contacts error:', err.message);
        res.status(500).json({ message: 'Could not load contacts' });
    }
});

/* ================================================================== *
 * SEARCH  (F3.9)
 * ================================================================== */

/**
 * GET /api/conversations/search?q=&conversationId=
 *
 * Global by default, scoped to one conversation when conversationId is given.
 * Registered before /:id so "search" is not read as a conversation id.
 */
router.get('/search', auth, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 2) return res.json([]);

        // Only ever search inside conversations this person is actually in —
        // an oversight admin uses the oversight endpoints, which are logged.
        const mine = await Conversation.find({
            members: { $elemMatch: { user: req.user.id, leftAt: null } }
        }).select('_id kind name members').populate('members.user', 'name');

        let scope = mine;
        if (req.query.conversationId) {
            scope = mine.filter((c) => String(c._id) === String(req.query.conversationId));
            if (!scope.length) return res.status(403).json({ message: 'Not your conversation' });
        }

        const messages = await Message.find({
            conversationId: { $in: scope.map((c) => c._id) },
            deletedAt: null,
            // $text would need a compound index to combine with the id filter
            // efficiently; at this collection size an anchored regex over an
            // already-narrowed id set is both simpler and predictable.
            text: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        })
            .populate('sender', USER_FIELDS)
            .sort({ createdAt: -1 })
            .limit(60);

        const titleFor = (id) => {
            const c = scope.find((x) => String(x._id) === String(id));
            if (!c) return '';
            if (c.kind === 'group') return c.name;
            const other = (c.members || []).find((m) => idStr(m.user) !== String(req.user.id));
            return other?.user?.name || 'Direct message';
        };

        res.json(messages.map((m) => ({
            ...presentMessage(m),
            conversationTitle: titleFor(m.conversationId)
        })));
    } catch (err) {
        console.error('[CHAT] search error:', err.message);
        res.status(500).json({ message: 'Search failed' });
    }
});

/* ================================================================== *
 * ADMIN OVERSIGHT  (F3.10)
 * ================================================================== */

/**
 * GET /api/conversations/oversight
 *
 * Every conversation in the company, for ADMIN. Management chose silent
 * presence over the disclosed audit view recommended in the feature draft §4;
 * the read is invisible to members but recorded in ChatAuditLog either way, so
 * the company can always answer who looked at what.
 */
router.get('/oversight', auth, async (req, res) => {
    try {
        if (!IS_OVERSIGHT.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Groups only, and ALL of them — project and custom alike, whoever
        // created them. Direct messages are never listed here: an admin has no
        // route to a private 1-to-1 conversation, so it must not even appear as
        // something to open.
        const q = (req.query.q || '').trim();
        const filter = { kind: 'group' };
        if (q) filter.name = new RegExp(q, 'i');

        const conversations = await Conversation.find(filter)
            .populate('members.user', USER_FIELDS)
            .populate('projectId', 'name')
            .sort({ lastActivityAt: -1 })
            .limit(300);

        // Oversight sees the true membership, hidden rows included — the point
        // of the screen is to know who is actually in a group.
        res.json(conversations.map((c) => {
            const obj = c.toObject();
            obj.title = c.kind === 'group'
                ? c.name
                : (c.members || []).map((m) => m.user?.name).filter(Boolean).join(' ↔ ');
            obj.iAmHidden = Boolean(memberRow(c, req.user.id)?.hidden);
            obj.iAmMember = isMember(c, req.user.id);
            return obj;
        }));
    } catch (err) {
        console.error('[CHAT] oversight list error:', err.message);
        res.status(500).json({ message: 'Could not load conversations' });
    }
});

/**
 * POST /api/conversations/:id/oversight  { hidden: true|false }
 *
 * Join or leave a conversation as a hidden member. Separate from the ordinary
 * member endpoints so joining invisibly is always an explicit, logged act and
 * can never happen as a side effect of something else.
 */
router.post('/:id/oversight', auth, async (req, res) => {
    try {
        if (!IS_OVERSIGHT.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

        // Belt and braces alongside the oversight listing, which already hides
        // DMs: an id typed straight at this endpoint must not join one either.
        if (conversation.kind !== 'group') {
            return res.status(403).json({
                message: 'Oversight covers group chats only. Direct messages are private to the two people in them.'
            });
        }

        const join = req.body.hidden !== false;
        const existing = memberRow(conversation, req.user.id);

        if (join) {
            if (existing) {
                if (!existing.hidden) {
                    return res.status(400).json({
                        message: 'You are already an open member of this conversation.'
                    });
                }
                return res.json({ message: 'Already watching' });
            }
            conversation.members.push({
                user: req.user.id,
                role: 'member',
                hidden: true,
                addedBy: req.user.id
            });
            await conversation.save();
            await audit(req.user, conversation._id, 'join_hidden', '', req.ip);
            // Deliberately NO system message — that is what "silent" means.
            return res.json({ message: 'Watching silently' });
        }

        if (!existing?.hidden) {
            return res.status(400).json({ message: 'You are not watching this conversation.' });
        }
        conversation.members = conversation.members.filter(
            (m) => !(idStr(m.user) === String(req.user.id) && m.hidden)
        );
        await conversation.save();
        await audit(req.user, conversation._id, 'leave_hidden', '', req.ip);
        res.json({ message: 'Stopped watching' });
    } catch (err) {
        console.error('[CHAT] oversight toggle error:', err.message);
        res.status(500).json({ message: 'Could not update oversight' });
    }
});

/* ================================================================== *
 * CREATING CONVERSATIONS
 * ================================================================== */

/**
 * POST /api/conversations/direct  { userId }
 * Open (or reopen) the 1-to-1 thread with someone. Idempotent.
 */
router.post('/direct', auth, async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ message: 'Who do you want to message?' });
        if (String(userId) === String(req.user.id)) {
            return res.status(400).json({ message: 'You cannot message yourself' });
        }

        const other = await User.findById(userId).select('_id status');
        if (!other || other.status !== 'ACTIVE') {
            return res.status(404).json({ message: 'That employee is not available' });
        }

        const conversation = await findOrCreateDirect(req.user.id, userId);
        const populated = await Conversation.findById(conversation._id)
            .populate('members.user', USER_FIELDS);

        res.status(201).json(decorate(populated, req.user.id));
    } catch (err) {
        console.error('[CHAT] direct error:', err.message);
        res.status(500).json({ message: 'Could not open that chat' });
    }
});

/**
 * POST /api/conversations/group
 * A custom group (F3.1). Any employee may create one — that is the point of
 * F3.4's "Diwali Committee": it does not need a manager's involvement.
 */
router.post('/group', auth, async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ message: 'Give the group a name' });

        const { description = '', projectId = null } = req.body;
        const requested = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];

        if (projectId) {
            const project = await Project.findById(projectId).select('_id');
            if (!project) return res.status(400).json({ message: 'That project does not exist' });
        }

        // Only real, active people — a stale id from a cached picker would
        // otherwise become a permanent ghost row in the member list.
        const valid = await User.find({
            _id: { $in: requested.filter((id) => mongoose.isValidObjectId(id)) },
            status: 'ACTIVE'
        }).select('_id name');

        const members = [
            { user: req.user.id, role: 'owner', addedBy: req.user.id },
            ...valid
                .filter((u) => String(u._id) !== String(req.user.id))
                .map((u) => ({ user: u._id, role: 'member', addedBy: req.user.id }))
        ];

        const conversation = await Conversation.create({
            kind: 'group',
            groupType: 'custom',
            name,
            description,
            projectId: projectId || null,
            createdBy: req.user.id,
            members,
            lastActivityAt: new Date()
        });

        const me = await User.findById(req.user.id).select('name');
        await postSystemMessage(conversation._id, {
            type: 'created',
            actor: req.user.id,
            actorName: me?.name || 'Someone'
        });
        if (valid.length) {
            await postSystemMessage(conversation._id, {
                type: 'added',
                actor: req.user.id,
                actorName: me?.name || 'Someone',
                targets: valid.map((u) => u._id),
                targetNames: valid.map((u) => u.name)
            });
        }

        const populated = await Conversation.findById(conversation._id)
            .populate('members.user', USER_FIELDS)
            .populate('projectId', 'name status');

        // Everyone added sees it appear without refreshing.
        emitToUsers(memberIds(populated), 'conversation:new', publicShape(populated));

        res.status(201).json(decorate(populated, req.user.id));
    } catch (err) {
        console.error('[CHAT] group create error:', err.message);
        res.status(500).json({ message: 'Could not create the group' });
    }
});

/* ================================================================== *
 * JOIN BY LINK  (F3.2)
 * ================================================================== */

/** POST /api/conversations/:id/invite — mint or rotate the link. */
router.post('/:id/invite', auth, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
        if (!canManage(conversation, req.user)) {
            return res.status(403).json({ message: 'Only group admins can create an invite link' });
        }

        if (req.body.revoke) {
            conversation.inviteToken = null;
            conversation.inviteExpiresAt = null;
            await conversation.save();
            return res.json({ token: null });
        }

        const days = Math.min(parseInt(req.body.days, 10) || 7, 30);
        conversation.inviteToken = crypto.randomBytes(16).toString('hex');
        conversation.inviteExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await conversation.save();

        res.json({ token: conversation.inviteToken, expiresAt: conversation.inviteExpiresAt });
    } catch (err) {
        console.error('[CHAT] invite error:', err.message);
        res.status(500).json({ message: 'Could not create an invite link' });
    }
});

/**
 * POST /api/conversations/join/:token
 *
 * Internal convenience only: the joiner is already an authenticated employee,
 * so a leaked link exposes a group to colleagues, not to the internet. The
 * vendor flow in Module 2 is a different, stricter mechanism.
 */
router.post('/join/:token', auth, async (req, res) => {
    try {
        const conversation = await Conversation.findOne({ inviteToken: req.params.token });
        if (!conversation) return res.status(404).json({ message: 'That invite link is not valid' });

        if (conversation.inviteExpiresAt && conversation.inviteExpiresAt < new Date()) {
            return res.status(410).json({ message: 'That invite link has expired' });
        }

        if (isMember(conversation, req.user.id)) {
            return res.json(decorate(conversation, req.user.id));
        }

        conversation.members.push({ user: req.user.id, role: 'member' });
        await conversation.save();

        const me = await User.findById(req.user.id).select('name');
        await postSystemMessage(conversation._id, {
            type: 'joined_via_link',
            actor: req.user.id,
            actorName: me?.name || 'Someone'
        });

        const populated = await Conversation.findById(conversation._id)
            .populate('members.user', USER_FIELDS);

        emitToUsers(memberIds(populated), 'conversation:updated', publicShape(populated));
        res.json(decorate(populated, req.user.id));
    } catch (err) {
        console.error('[CHAT] join error:', err.message);
        res.status(500).json({ message: 'Could not join that group' });
    }
});

/* ================================================================== *
 * ONE CONVERSATION
 * ================================================================== */

router.get('/:id', auth, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id)
            .populate('members.user', USER_FIELDS)
            .populate('projectId', 'name status');
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

        const access = canRead(conversation, req.user);
        if (!access.ok) return res.status(403).json({ message: 'You are not in this conversation' });
        if (access.viaOversight) await audit(req.user, conversation._id, 'read', 'opened', req.ip);

        res.json(decorate(conversation, req.user.id));
    } catch (err) {
        console.error('[CHAT] detail error:', err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Conversation not found' });
        res.status(500).json({ message: 'Could not load that chat' });
    }
});

/** PUT /api/conversations/:id — rename / re-describe a group. */
router.put('/:id', auth, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
        if (!canManage(conversation, req.user)) {
            return res.status(403).json({ message: 'Only group admins can edit this group' });
        }

        const name = (req.body.name ?? conversation.name).trim();
        if (!name) return res.status(400).json({ message: 'A group needs a name' });

        const renamed = name !== conversation.name;
        conversation.name = name;
        if (req.body.description !== undefined) conversation.description = req.body.description;
        await conversation.save();

        if (renamed) {
            const me = await User.findById(req.user.id).select('name');
            await postSystemMessage(conversation._id, {
                type: 'renamed',
                actor: req.user.id,
                actorName: me?.name || 'Someone',
                extra: name
            });
        }

        const populated = await Conversation.findById(conversation._id)
            .populate('members.user', USER_FIELDS)
            .populate('projectId', 'name status');

        emitToUsers(memberIds(populated), 'conversation:updated', publicShape(populated));
        res.json(decorate(populated, req.user.id));
    } catch (err) {
        console.error('[CHAT] update error:', err.message);
        res.status(500).json({ message: 'Could not update the group' });
    }
});

/**
 * PUT /api/conversations/:id/avatar
 *
 * The group's picture. Same permission as renaming it — an owner, a group
 * admin, or company ADMIN/HR — because a group's icon and its name are the same
 * kind of claim about what the group is.
 *
 * Multipart with an `avatar` field, matching /api/auth/upload-avatar so the
 * client can reuse the ImageEditor crop flow unchanged.
 */
router.put('/:id/avatar', auth, upload.single('avatar'), async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

        if (conversation.kind !== 'group') {
            return res.status(400).json({ message: 'A direct chat shows the photo of the person you are talking to' });
        }
        if (!canManage(conversation, req.user)) {
            return res.status(403).json({ message: 'Only group admins can change the icon' });
        }

        const previous = conversation.avatar;

        if (req.body.remove === 'true') {
            conversation.avatar = '';
        } else {
            if (!req.file) return res.status(400).json({ message: 'Choose an image' });
            if (!req.file.mimetype.startsWith('image/')) {
                return res.status(400).json({ message: 'That file is not an image' });
            }
            // uploadToS3 re-encodes anything image/* to an 800px JPEG, so the
            // stored icon is already the right size for every place it renders.
            conversation.avatar = await uploadToS3(req.file, 'GroupIcons');
        }

        await conversation.save();

        // Best-effort, and only once the new one is safely saved: a failed
        // cleanup must never cost the group the icon it just set.
        if (previous && previous !== conversation.avatar) {
            deleteFromS3(previous);
        }

        const populated = await Conversation.findById(conversation._id)
            .populate('members.user', USER_FIELDS)
            .populate('projectId', 'name status');

        emitToUsers(memberIds(populated), 'conversation:updated', publicShape(populated));
        res.json(decorate(populated, req.user.id));
    } catch (err) {
        console.error('[CHAT] avatar error:', err.message);
        res.status(500).json({ message: 'Could not update the group icon' });
    }
});

/** PUT /api/conversations/:id/mute  { muted } */
router.put('/:id/mute', auth, async (req, res) => {
    try {
        const result = await Conversation.updateOne(
            { _id: req.params.id, 'members.user': req.user.id },
            { $set: { 'members.$.muted': Boolean(req.body.muted) } }
        );
        if (!result.matchedCount) return res.status(404).json({ message: 'Conversation not found' });
        res.json({ muted: Boolean(req.body.muted) });
    } catch (err) {
        console.error('[CHAT] mute error:', err.message);
        res.status(500).json({ message: 'Could not update notifications' });
    }
});

/**
 * POST /api/conversations/:id/clear
 *
 * Hide this conversation's history from the caller. Nothing is deleted: see the
 * note on Conversation.members.clearedAt for why a chat in a system of record
 * cannot offer a clear that erases the thread for everybody in it.
 */
router.post('/:id/clear', auth, async (req, res) => {
    try {
        const now = new Date();
        const result = await Conversation.updateOne(
            { _id: req.params.id, 'members.user': req.user.id },
            { $set: { 'members.$.clearedAt': now, 'members.$.lastReadAt': now } }
        );
        if (!result.matchedCount) {
            return res.status(404).json({ message: 'Conversation not found' });
        }
        res.json({ clearedAt: now });
    } catch (err) {
        console.error('[CHAT] clear error:', err.message);
        res.status(500).json({ message: 'Could not clear the chat' });
    }
});

/**
 * POST /api/conversations/:id/close   { closed: true|false }
 *
 * Take it out of the caller's list until it next moves. Membership and history
 * are untouched, so the row returns by itself on the next message.
 */
router.post('/:id/close', auth, async (req, res) => {
    try {
        const closing = req.body.closed !== false;
        const result = await Conversation.updateOne(
            { _id: req.params.id, 'members.user': req.user.id },
            { $set: { 'members.$.closedAt': closing ? new Date() : null } }
        );
        if (!result.matchedCount) {
            return res.status(404).json({ message: 'Conversation not found' });
        }
        res.json({ closed: closing });
    } catch (err) {
        console.error('[CHAT] close error:', err.message);
        res.status(500).json({ message: 'Could not close the chat' });
    }
});

/* ================================================================== *
 * MEMBERS
 * ================================================================== */

router.post('/:id/members', auth, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
        if (conversation.kind === 'direct') {
            return res.status(400).json({ message: 'A direct chat is between two people' });
        }
        if (!canManage(conversation, req.user)) {
            return res.status(403).json({ message: 'Only group admins can add people' });
        }

        const requested = (Array.isArray(req.body.memberIds) ? req.body.memberIds : [])
            .filter((id) => mongoose.isValidObjectId(id));
        const already = new Set(memberIds(conversation));

        const users = await User.find({
            _id: { $in: requested },
            status: 'ACTIVE'
        }).select('_id name');

        const toAdd = users.filter((u) => !already.has(String(u._id)));
        if (!toAdd.length) return res.status(400).json({ message: 'Nobody new to add' });

        toAdd.forEach((u) => conversation.members.push({
            user: u._id, role: 'member', addedBy: req.user.id
        }));
        await conversation.save();

        const me = await User.findById(req.user.id).select('name');
        await postSystemMessage(conversation._id, {
            type: 'added',
            actor: req.user.id,
            actorName: me?.name || 'Someone',
            targets: toAdd.map((u) => u._id),
            targetNames: toAdd.map((u) => u.name)
        });

        const populated = await Conversation.findById(conversation._id)
            .populate('members.user', USER_FIELDS)
            .populate('projectId', 'name status');

        emitToUsers(memberIds(populated), 'conversation:updated', publicShape(populated));
        emitToUsers(toAdd.map((u) => String(u._id)), 'conversation:new', publicShape(populated));

        res.json(decorate(populated, req.user.id));
    } catch (err) {
        console.error('[CHAT] add member error:', err.message);
        res.status(500).json({ message: 'Could not add those people' });
    }
});

router.delete('/:id/members/:userId', auth, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

        const removingSelf = String(req.params.userId) === String(req.user.id);
        if (!removingSelf && !canManage(conversation, req.user)) {
            return res.status(403).json({ message: 'Only group admins can remove people' });
        }

        const row = memberRow(conversation, req.params.userId);
        if (!row) return res.status(404).json({ message: 'They are not in this group' });

        if (row.role === 'owner' && !removingSelf) {
            return res.status(400).json({ message: 'The group owner cannot be removed' });
        }

        const before = memberIds(conversation);

        // Hard-remove rather than tombstone: leftAt exists so old messages stay
        // attributable, but a removed member must stop matching the
        // 'members.user' list query immediately.
        conversation.members = conversation.members.filter(
            (m) => idStr(m.user) !== String(req.params.userId)
        );
        await conversation.save();

        const actor = await User.findById(req.user.id).select('name');
        const target = await User.findById(req.params.userId).select('name');
        await postSystemMessage(conversation._id, {
            type: removingSelf ? 'left' : 'removed',
            actor: req.user.id,
            actorName: actor?.name || 'Someone',
            targets: [req.params.userId],
            targetNames: [target?.name || 'Someone']
        });

        const populated = await Conversation.findById(conversation._id)
            .populate('members.user', USER_FIELDS)
            .populate('projectId', 'name status');

        // The person removed is told too, so the group disappears from their
        // sidebar instead of sitting there returning 403 on every click.
        emitToUsers(before, 'conversation:updated', publicShape(populated));
        emitToUsers([String(req.params.userId)], 'conversation:removed', { _id: conversation._id });

        res.json({ message: removingSelf ? 'You left the group' : 'Removed' });
    } catch (err) {
        console.error('[CHAT] remove member error:', err.message);
        res.status(500).json({ message: 'Could not remove them' });
    }
});

/* ================================================================== *
 * MESSAGES
 * ================================================================== */

/**
 * GET /api/conversations/:id/messages?before=<ISO>
 *
 * Newest page first, walking backwards — the same direction a chat scrolls.
 * Cursor is a timestamp rather than a skip count: with an active conversation,
 * skip/limit shifts under you and duplicates or drops messages mid-scroll.
 */
router.get('/:id/messages', auth, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

        const access = canRead(conversation, req.user);
        if (!access.ok) return res.status(403).json({ message: 'You are not in this conversation' });

        const filter = { conversationId: conversation._id };
        if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

        // Everything this person cleared stays on the server for everyone else
        // — it just stops being sent to them.
        const cleared = memberRow(conversation, req.user.id)?.clearedAt;
        if (cleared) {
            filter.createdAt = { ...(filter.createdAt || {}), $gt: new Date(cleared) };
        }

        const messages = await populateMessage(
            Message.find(filter).sort({ createdAt: -1 }).limit(PAGE_SIZE)
        );

        if (access.viaOversight) {
            await audit(req.user, conversation._id, 'read', `${messages.length} messages`, req.ip);
        }

        // Back into reading order for the client.
        res.json({
            messages: messages.reverse().map(presentMessage),
            hasMore: messages.length === PAGE_SIZE
        });
    } catch (err) {
        console.error('[CHAT] messages error:', err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Conversation not found' });
        res.status(500).json({ message: 'Could not load messages' });
    }
});

/**
 * POST /api/conversations/:id/messages
 *
 * Text, files, voice notes and screen recordings, multipart in one request.
 * Attachments ride the pipeline tasks already use: images/audio/documents to S3
 * immediately, video staged on the VPS so it plays back at once and compressed
 * overnight by cron/videoCompressionCron.js.
 */
router.post('/:id/messages', auth, chatUpload.array('attachments', 10), async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id).populate('projectId', 'name');
        if (!conversation) {
            discardStagedFiles(req.files);
            return res.status(404).json({ message: 'Conversation not found' });
        }

        if (!canPost(conversation, req.user)) {
            discardStagedFiles(req.files);
            return res.status(403).json({
                message: IS_OVERSIGHT.includes(req.user.role)
                    ? 'Join this conversation before posting in it'
                    : 'You are not in this conversation'
            });
        }

        const text = (req.body.text || '').trim();
        if (!text && !(req.files || []).length) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Write something or attach a file' });
        }

        // Chat media is grouped by project where there is one, so a project's
        // document library (F1.7) can later be assembled from a prefix rather
        // than a scan.
        const subFolder = conversation.projectId?.name
            ? s3Folder(conversation.projectId.name, '/Chat')
            : s3Folder('Chats', `/${conversation.kind === 'group' ? 'Groups' : 'Direct'}`);

        const { media, pendingVideos } = await processTaskFiles(
            req.files, subFolder, '/uploads/chat'
        );

        // The browser measured the voice note while recording, so the player can
        // draw its waveform without downloading and decoding every note in the
        // thread. Same contract the task discussion uses.
        let waveform = null;
        try {
            if (req.body.waveform) waveform = JSON.parse(req.body.waveform);
        } catch (e) { /* a bad payload just means no waveform */ }

        media.forEach((m) => {
            if (m.type !== 'audio') return;
            m.durationMs = parseInt(req.body.durationMs, 10) || 0;
            if (Array.isArray(waveform) && waveform.length) {
                m.waveform = waveform.slice(0, 200).map(Number).filter((n) => !Number.isNaN(n));
            }
        });

        // Mentions are only meaningful for people who can actually read the
        // thread; anything else is a notification to a conversation they cannot
        // open.
        let mentions = [];
        try {
            const claimed = JSON.parse(req.body.mentions || '[]');
            const allowed = new Set(memberIds(conversation));
            mentions = (Array.isArray(claimed) ? claimed : [])
                .map(String)
                .filter((id) => allowed.has(id) && id !== String(req.user.id));
        } catch (e) { /* no mentions */ }

        let replyTo = { messageId: null, text: '', senderName: '', kind: 'text' };
        if (req.body.replyToId && mongoose.isValidObjectId(req.body.replyToId)) {
            const parent = await Message.findOne({
                _id: req.body.replyToId,
                conversationId: conversation._id
            }).populate('sender', 'name');
            if (parent) {
                const preview = previewFor(parent);
                replyTo = {
                    messageId: parent._id,
                    text: preview.text,
                    senderName: parent.sender?.name || '',
                    kind: preview.kind
                };
            }
        }

        const message = await Message.create({
            conversationId: conversation._id,
            sender: req.user.id,
            text,
            attachments: media,
            mentions,
            replyTo,
            // The sender has necessarily seen their own message; seeding this
            // keeps the tick logic from having to special-case them.
            readBy: [{ user: req.user.id, at: new Date() }]
        });

        if (pendingVideos.length) {
            await VideoCompressionQueue.insertMany(pendingVideos.map((v) => ({
                ownerModel: 'Message',
                taskId: message._id,
                mediaId: v.mediaId,
                field: 'attachments',
                localPath: v.localPath,
                originalName: v.originalName,
                projectName: conversation.projectId?.name || 'Chats'
            })));
        }

        const me = await User.findById(req.user.id).select('name');
        await touchConversation(conversation._id, message, me?.name || '');

        const populated = presentMessage(await populateMessage(Message.findById(message._id)));

        // Two audiences: people with the thread open get the message, everyone
        // in it gets a nudge to re-sort their sidebar and bump the badge.
        emitToConversation(conversation._id, 'message:new', populated);
        emitToUsers(
            memberIds(conversation).filter((id) => id !== String(req.user.id)),
            'conversation:activity',
            {
                conversationId: String(conversation._id),
                lastMessage: previewFor(message),
                senderName: me?.name || '',
                at: message.createdAt
            }
        );

        /*
         * Notifications.
         *
         * A bell for every message in every group would be unusable, so the
         * standing rule is: an @mention always notifies, an ordinary group
         * message never does (the unread badge is the signal), and a direct
         * message does — a DM is addressed to one person and has no badge
         * anywhere else to catch their eye.
         */
        const preview = previewFor(message).text || 'sent an attachment';
        const notifyIds = new Set(mentions);
        if (conversation.kind === 'direct') {
            memberIds(conversation)
                .filter((id) => id !== String(req.user.id))
                .forEach((id) => notifyIds.add(id));
        }

        await Promise.all([...notifyIds].map(async (id) => {
            if (memberRow(conversation, id)?.muted) return;
            try {
                await Notification.create({
                    recipient: id,
                    title: conversation.kind === 'group'
                        ? `${me?.name || 'Someone'} mentioned you in ${conversation.name}`
                        : `New message from ${me?.name || 'Someone'}`,
                    message: preview.slice(0, 140),
                    type: 'CHAT',
                    link: `/chats/${conversation._id}`
                });
            } catch (e) {
                console.error('[CHAT] notification failed:', e.message);
            }
        }));

        if (memberRow(conversation, req.user.id)?.hidden) {
            await audit(req.user, conversation._id, 'post', preview.slice(0, 100), req.ip);
        }

        res.status(201).json(populated);
    } catch (err) {
        discardStagedFiles(req.files);
        console.error('[CHAT] send error:', err);
        res.status(500).json({ message: 'Could not send your message' });
    }
});

/** PUT /api/conversations/:id/messages/:messageId — reword your own text. */
router.put('/:id/messages/:messageId', auth, async (req, res) => {
    try {
        const message = await Message.findOne({
            _id: req.params.messageId,
            conversationId: req.params.id
        });
        if (!message) return res.status(404).json({ message: 'Message not found' });
        if (message.deletedAt) return res.status(400).json({ message: 'That message was deleted' });

        // Only the author, and only the words. Swapping the attachments after
        // people have replied would change what the thread appears to be about
        // — the same rule the task discussion enforces.
        if (String(message.sender) !== String(req.user.id)) {
            return res.status(403).json({ message: 'You can only edit your own messages' });
        }

        const text = (req.body.text || '').trim();
        if (!text && !message.attachments.length) {
            return res.status(400).json({ message: 'A message cannot be left empty' });
        }

        message.text = text;
        message.editedAt = new Date();
        await message.save();

        const populated = presentMessage(await populateMessage(Message.findById(message._id)));
        emitToConversation(req.params.id, 'message:edited', populated);
        res.json(populated);
    } catch (err) {
        console.error('[CHAT] edit error:', err.message);
        res.status(500).json({ message: 'Could not edit the message' });
    }
});

/** DELETE /api/conversations/:id/messages/:messageId — delete for everyone. */
router.delete('/:id/messages/:messageId', auth, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

        const message = await Message.findOne({
            _id: req.params.messageId,
            conversationId: req.params.id
        });
        if (!message) return res.status(404).json({ message: 'Message not found' });

        const mine = String(message.sender) === String(req.user.id);
        if (!mine && !canManage(conversation, req.user)) {
            return res.status(403).json({ message: 'You can only delete your own messages' });
        }

        message.deletedAt = new Date();
        message.deletedBy = req.user.id;
        await message.save();

        emitToConversation(req.params.id, 'message:deleted', {
            _id: message._id,
            conversationId: req.params.id
        });
        res.json({ message: 'Message deleted' });
    } catch (err) {
        console.error('[CHAT] delete error:', err.message);
        res.status(500).json({ message: 'Could not delete the message' });
    }
});

/**
 * POST /api/conversations/:id/read
 *
 * Moves this person's watermark (which clears the badge) and stamps the
 * per-message receipts (which draw the ticks). Two mechanisms because they
 * answer different questions — see the comments on both schemas.
 */
router.post('/:id/read', auth, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
        if (!isMember(conversation, req.user.id)) {
            // An oversight read must not mark anything as seen — that would be
            // the admin's presence leaking into the members' view of the thread.
            return res.json({ ok: true, silent: true });
        }

        const now = new Date();
        await Conversation.updateOne(
            { _id: conversation._id, 'members.user': req.user.id },
            { $set: { 'members.$.lastReadAt': now } }
        );

        const hidden = Boolean(memberRow(conversation, req.user.id)?.hidden);
        if (!hidden) {
            // A hidden member leaves no receipt; a tick appearing from someone
            // not in the member list is exactly the tell that would give the
            // oversight away.
            await Message.updateMany(
                {
                    conversationId: conversation._id,
                    sender: { $ne: req.user.id },
                    'readBy.user': { $ne: req.user.id }
                },
                { $addToSet: { readBy: { user: req.user.id, at: now } } }
            );

            emitToConversation(conversation._id, 'message:read', {
                conversationId: String(conversation._id),
                userId: String(req.user.id),
                at: now
            });
        }

        res.json({ ok: true, at: now });
    } catch (err) {
        console.error('[CHAT] read error:', err.message);
        res.status(500).json({ message: 'Could not update read state' });
    }
});

module.exports = router;
