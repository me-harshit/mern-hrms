const mongoose = require('mongoose');

const Project = require('../models/Project');
const Task = require('../models/Task');
const Conversation = require('../models/Conversation');
const ProjectActivity = require('../models/ProjectActivity');

/**
 * Who is on a project, who may open its workspace, and how events get logged.
 *
 * Lives here for the same reason utils/taskScoping.js and
 * utils/conversationAccess.js do: the answers are needed by the project routes,
 * the task routes, the chat routes and the vendor routes, and a second copy of
 * "is this person on this project" is how two copies quietly disagree.
 *
 * The central decision — feature draft Module 1 — is that project membership is
 * DERIVED, never declared. Project has no members array and deliberately gains
 * none. Three existing facts already say who is involved:
 *
 *   - you lead it;
 *   - you have been assigned work on it;
 *   - you are in one of its conversations.
 *
 * Adding a fourth, hand-maintained list would mean a list that drifts from all
 * three. The cost of deriving is that somebody with no task and no group
 * membership cannot be "added" to a project directly — they are added to its
 * group, which is the same act, and is already a screen that exists.
 */

// Sees every project whether or not they are on it. Matches the roles that
// already see every task in utils/taskScoping.js — this introduces no new
// notion of privilege.
const IS_PRIVILEGED = ['ADMIN', 'HR'];

const idStr = (v) => (v ? String(v._id || v) : '');

const asObjectId = (v) => new mongoose.Types.ObjectId(String(v));

/* ------------------------------------------------------------------ *
 * Membership
 * ------------------------------------------------------------------ */

/**
 * Every user id involved in a project, from all three signals.
 *
 * Hidden members are excluded on purpose. An oversight admin sitting silently
 * in a project group (F3.10) is not part of the project team, and listing them
 * in the Team tab would undo in one screen the concealment that
 * utils/conversationAccess.js → visibleMembers maintains everywhere else.
 *
 * @returns {Promise<string[]>} de-duplicated ids as strings
 */
const getProjectMemberIds = async (projectId) => {
    if (!projectId) return [];

    const [project, assigneeIds, conversations] = await Promise.all([
        Project.findById(projectId).select('projectLead createdBy'),
        // Anyone who has been given work on this project, whatever its state —
        // finishing a task does not take you off the project.
        Task.distinct('assignees', { projectId, isArchived: false }),
        Conversation.find({ projectId }).select('members')
    ]);

    if (!project) return [];

    const ids = [
        idStr(project.projectLead),
        idStr(project.createdBy),
        ...assigneeIds.map(idStr)
    ];

    conversations.forEach((c) => {
        (c.members || []).forEach((m) => {
            if (m.leftAt || m.hidden) return;
            ids.push(idStr(m.user));
        });
    });

    return [...new Set(ids.filter(Boolean))];
};

/**
 * The reverse question: which projects is this person on?
 *
 * Drives the employee project list (F1.1). Runs the three signals as three
 * indexed queries and unions the results, rather than walking every project and
 * asking getProjectMemberIds — that would be one membership resolution per
 * project in the company to render one list.
 */
const getMyProjectIds = async (userId) => {
    const uid = asObjectId(userId);

    const [led, fromTasks, fromChats] = await Promise.all([
        Project.find({ projectLead: uid }).distinct('_id'),
        Task.distinct('projectId', {
            isArchived: false,
            projectId: { $ne: null },
            $or: [{ assignees: uid }, { assignedBy: uid }]
        }),
        Conversation.distinct('projectId', {
            projectId: { $ne: null },
            // $elemMatch, not two dotted paths — the same trap
            // routes/conversations.js documents: separate keys can be satisfied
            // by two different members, matching a group I have actually left.
            members: { $elemMatch: { user: uid, leftAt: null, hidden: { $ne: true } } }
        })
    ]);

    return [...new Set([...led, ...fromTasks, ...fromChats].map(idStr).filter(Boolean))];
};

/**
 * May this person open this project's workspace?
 *
 * Returns the project too — every caller needs it immediately afterwards, and
 * this has already paid for the lookup.
 *
 * @returns {Promise<{ ok: boolean, project: object|null, isPrivileged: boolean }>}
 */
const canViewProject = async (projectId, reqUser) => {
    if (!mongoose.Types.ObjectId.isValid(String(projectId))) {
        return { ok: false, project: null, isPrivileged: false };
    }

    const project = await Project.findById(projectId)
        .populate('projectLead', 'name email role employeeId profilePic');

    if (!project) return { ok: false, project: null, isPrivileged: false };

    if (IS_PRIVILEGED.includes(reqUser.role)) {
        return { ok: true, project, isPrivileged: true };
    }

    /*
     * A MANAGER is not privileged here.
     *
     * Their assign scope is company-wide (CAN_ASSIGN_ANYONE), but their task
     * *view* is deliberately creator-based — see getTaskVisibilityFilter — and
     * opening a workspace on a project they have nothing to do with would be a
     * wider view than the task list they already have. So a manager reaches a
     * project the same way anyone else does: by being on it.
     */
    const members = await getProjectMemberIds(projectId);
    return {
        ok: members.includes(String(reqUser.id)),
        project,
        isPrivileged: false
    };
};

/**
 * Express guard for the workspace endpoints.
 *
 * Attaches req.project and req.projectIsPrivileged. Written as middleware
 * rather than a call at the top of each handler because there are seven of
 * these endpoints and the one that forgets the check is the one that leaks.
 */
const requireProjectAccess = async (req, res, next) => {
    try {
        const { ok, project, isPrivileged } = await canViewProject(req.params.id, req.user);

        if (!project) return res.status(404).json({ message: 'Project not found' });
        if (!ok) return res.status(403).json({ message: 'You do not have access to this project' });

        req.project = project;
        req.projectIsPrivileged = isPrivileged;
        next();
    } catch (err) {
        console.error('[PROJECT] access check failed:', err.message);
        res.status(500).json({ message: 'Could not open that project' });
    }
};

/* ------------------------------------------------------------------ *
 * Activity feed (F1.8)
 * ------------------------------------------------------------------ */

/**
 * Append one event to a project's feed.
 *
 * Best-effort by contract: this is called from inside task assignment, message
 * send and vendor invitation, and none of those may fail because a feed row
 * could not be written. Callers do not await it for correctness and must never
 * wrap it in their own try/catch expecting it to throw.
 *
 * Silently does nothing when there is no project — office tasks and standalone
 * groups have none, and making every call site check first would put the same
 * `if` in a dozen places.
 */
const recordActivity = async (projectId, event = {}) => {
    try {
        if (!projectId) return null;

        // Populated refs arrive here from callers that needed the name — take
        // the id rather than relying on the cast.
        const pid = projectId._id || projectId;

        /*
         * Collapse a burst into one row.
         *
         * Only the caller knows whether its event is the kind that repeats:
         * chat messages are (a group can produce fifty in an hour), a task
         * being created is not. So this is opt-in via collapseMs, and the
         * match is deliberately narrow — same type, same author, same place —
         * so that two people talking stay two rows.
         *
         * meta.count is what the row renders as "5 messages". The first,
         * uncollapsed event has no count, which the client reads as one.
         */
        if (event.collapseMs) {
            const query = {
                projectId: pid,
                type: event.type,
                at: { $gt: new Date(Date.now() - event.collapseMs) }
            };
            if (event.actor) query.actor = event.actor;
            if (event.externalActor) query.externalActor = event.externalActor;
            if (event.meta?.conversationId) {
                query['meta.conversationId'] = String(event.meta.conversationId);
            }

            const recent = await ProjectActivity.findOne(query).sort({ at: -1 });
            if (recent) {
                const count = (recent.meta?.count || 1) + 1;
                await ProjectActivity.updateOne(
                    { _id: recent._id },
                    {
                        $set: {
                            at: new Date(),
                            text: event.text || recent.text,
                            'meta.count': count
                        }
                    }
                );
                return recent;
            }
        }

        return await ProjectActivity.create({
            projectId: pid,
            at: new Date(),
            type: event.type,
            actor: event.actor || null,
            externalActor: event.externalActor || null,
            actorName: event.actorName || '',
            text: event.text || '',
            refModel: event.refModel || null,
            refId: event.refId || null,
            link: event.link || '',
            meta: event.meta || {}
        });
    } catch (err) {
        console.error('[PROJECT ACTIVITY] could not record', event.type, '-', err.message);
        return null;
    }
};

module.exports = {
    IS_PRIVILEGED,
    idStr,
    getProjectMemberIds,
    getMyProjectIds,
    canViewProject,
    requireProjectAccess,
    recordActivity
};
