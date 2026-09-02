const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/authMiddleware');

const Project = require('../models/Project');
const Purchase = require('../models/Expense');
const Conversation = require('../models/Conversation');
const Task = require('../models/Task');
const TaskComment = require('../models/TaskComment');
const Message = require('../models/Message');
// The registry search below matches on project-lead name, which needs the
// user collection - it was referenced there without ever being required.
const User = require('../models/User');
const ExternalParticipant = require('../models/ExternalParticipant');
const ExternalUser = require('../models/ExternalUser');
const ProjectActivity = require('../models/ProjectActivity');

const { ensureProjectGroup, IS_OVERSIGHT } = require('../utils/conversationAccess');
const { getTaskVisibilityFilter } = require('../utils/taskScoping');
const {
    IS_PRIVILEGED,
    getMyProjectIds,
    getProjectMemberIds,
    requireProjectAccess
} = require('../utils/projectAccess');

// @route   GET /api/projects
// @desc    Get all active projects (For Dropdowns)
router.get('/', auth, async (req, res) => {
    try {
        const projects = await Project.find({ status: 'Active' }).sort({ name: 1 });
        res.json(projects);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/projects/all
// @desc    Get all projects + Auto-Calculate Total Spent (Paginated)
router.get('/all', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        // --- 1. PAGINATION SETUP ---
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let andConditions = [];

        // --- 2. SEARCH FILTERING ---
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            
            // First find users matching the search to allow searching by Project Lead name
            const matchingUsers = await User.find({ name: searchRegex }).distinct('_id');

            andConditions.push({
                $or: [
                    { name: searchRegex },
                    { description: searchRegex },
                    { projectLead: { $in: matchingUsers } }
                ]
            });
        }

        let query = {};
        if (andConditions.length > 0) {
            query.$and = andConditions;
        }

        // --- 3. COUNT AND FETCH ---
        const totalRecords = await Project.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        const projects = await Project.find(query)
            .populate('projectLead', 'name email profilePic')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // --- 4. CALCULATE AGGREGATES FOR VISIBLE PROJECTS ONLY ---
        const projectsWithStats = await Promise.all(projects.map(async (proj) => {
            const spentAgg = await Purchase.aggregate([
                { $match: { projectName: proj.name, status: 'Approved' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            
            const totalSpent = spentAgg.length > 0 ? spentAgg[0].total : 0;
            
            return {
                ...proj.toObject(),
                totalSpent,
                totalVendorPayments: 0 // Placeholder for next module
            };
        }));

        res.json({
            data: projectsWithStats,
            pagination: { totalRecords, totalPages, currentPage: page, limit }
        });

    } catch (err) {
        console.error("Project Fetch Error:", err);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/projects
// @desc    Create a new project
router.post('/', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const { name, description, status, projectLead, startDate, endDate, totalBudget } = req.body;
        
        let existingProject = await Project.findOne({ name: new RegExp(`^${name}$`, 'i') });
        if (existingProject) return res.status(400).json({ message: 'Project name already exists' });

        const project = new Project({
            name, description, status, projectLead, startDate, endDate, totalBudget, createdBy: req.user.id
        });

        await project.save();

        /*
         * Every project gets its conversation the moment it exists (F3.3).
         *
         * Seeded with the lead and the creator; everyone else joins as work is
         * assigned to them on this project — see the hook in routes/tasks.js.
         * Best-effort: a chat failure must never lose a project that has
         * already been written.
         */
        try {
            await ensureProjectGroup(project, req.user.id);
        } catch (chatErr) {
            console.error('[PROJECT] could not create project group:', chatErr.message);
        }

        res.status(201).json(project);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/projects/:id
// @desc    Update a project
router.put('/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const { name, description, status, projectLead, startDate, endDate, totalBudget } = req.body;
        const project = await Project.findByIdAndUpdate(
            req.params.id, 
            { name, description, status, projectLead, startDate, endDate, totalBudget }, 
            { new: true }
        );

        // The project group is named after its project, so a rename that only
        // moved one of the two would leave people talking in "Spectra" about a
        // project no longer called that.
        try {
            if (project?.name) {
                await Conversation.updateOne(
                    { projectId: project._id, groupType: 'project' },
                    { $set: { name: project.name } }
                );
            }
        } catch (chatErr) {
            console.error('[PROJECT] could not rename project group:', chatErr.message);
        }

        res.json(project);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/projects/:id
// @desc    Delete a project
router.delete('/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });
        await Project.findByIdAndDelete(req.params.id);
        res.json({ message: 'Project deleted' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// The four task statuses, in the order the workspace shows their badges.
// Mirrors TASK_STATUSES in models/Task.js.
const TASK_STATUSES = ['Pending', 'In Progress', 'On Hold', 'Completed'];

/**
 * What counts as a task on this project — for the health strip and the Tasks
 * tab alike, which is the point: a header that totals differently from the list
 * underneath it is a bug report waiting to be filed.
 *
 * Rejected work is not work. Work awaiting approval still is.
 *
 * This is the rule /tasks/by-employee already applies, and its reasoning holds
 * here word for word: approval decides whether self-assigned work is
 * *credited*, not whether it is being *done*. Excluding Pending as well was
 * tried and was worse — on live data it reported three projects as 100%
 * complete while unapproved work sat outstanding on them, and emptied a fourth
 * project whose only tasks were self-assigned, which is the opposite of what a
 * health number is for.
 *
 * The Regular Tasks list does exclude Pending, and that is not a contradiction:
 * it is an assignment screen, so it lists what there is to manage, and pending
 * work has its own tab there. This is a read-only lens on what is happening.
 *
 * $ne rather than an equality match on the allowed values, for the reason
 * routes/tasks.js documents at length: a schema default only applies when a
 * document is written, so every task created before approvalStatus existed has
 * no such field, and an equality test would silently drop all of them.
 */
const COUNTABLE = { approvalStatus: { $ne: 'Rejected' } };

/* ==================================================================== *
 * PROJECT WORKSPACE — feature draft Module 1
 *
 * The second lens on the same data. Everything above this line treats a
 * project as a registry row with a budget; everything below treats it as a
 * place you open to ask "what is happening on Spectra".
 *
 * Every one of these is behind requireProjectAccess, which resolves derived
 * membership (utils/projectAccess.js) and attaches req.project. None of them
 * re-checks by hand.
 * ==================================================================== */

/**
 * GET /api/projects/mine
 *
 * F1.1 — the project list as an employee sees it: only projects they are
 * actually on, and no financial columns. Admin/HR get every project, which is
 * what the draft means by "admin sees all".
 *
 * Not paginated. Membership caps this at the handful of projects one person is
 * involved in, and the management view that can run to hundreds already has
 * its own paginated endpoint at /all.
 */
router.get('/mine', auth, async (req, res) => {
    try {
        const isPrivileged = IS_PRIVILEGED.includes(req.user.role);

        const filter = {};
        if (!isPrivileged) {
            const mine = await getMyProjectIds(req.user.id);
            if (!mine.length) return res.json([]);
            filter._id = { $in: mine.map((id) => new mongoose.Types.ObjectId(id)) };
        }

        if (req.query.status && req.query.status !== 'All') {
            filter.status = req.query.status;
        }
        if (req.query.search) {
            const rx = new RegExp(req.query.search.trim(), 'i');
            filter.$or = [{ name: rx }, { description: rx }];
        }

        const projects = await Project.find(filter)
            .populate('projectLead', 'name email profilePic')
            .select('name description status projectLead startDate endDate')
            .sort({ status: 1, name: 1 });

        if (!projects.length) return res.json([]);

        const ids = projects.map((p) => p._id);
        const now = new Date();

        /*
         * Health per project in two aggregates over the whole set, not one pair
         * of counts per card. A twelve-project list would otherwise be
         * twenty-four round trips to render a strip of numbers.
         */
        const [taskStats, lastEvents] = await Promise.all([
            Task.aggregate([
                { $match: { projectId: { $in: ids }, isArchived: false, ...COUNTABLE } },
                {
                    $group: {
                        _id: '$projectId',
                        total: { $sum: 1 },
                        // Open, not completed. The card reports the state of
                        // the work, not a progress score — see the note on the
                        // health payload in /:id/overview.
                        open: { $sum: { $cond: [{ $ne: ['$status', 'Completed'] }, 1, 0] } },
                        overdue: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $ne: ['$status', 'Completed'] },
                                            { $lt: ['$overdueAt', now] }
                                        ]
                                    },
                                    1, 0
                                ]
                            }
                        }
                    }
                }
            ]),
            ProjectActivity.aggregate([
                { $match: { projectId: { $in: ids } } },
                { $sort: { at: -1 } },
                { $group: { _id: '$projectId', at: { $first: '$at' } } }
            ])
        ]);

        const statsBy = Object.fromEntries(taskStats.map((s) => [String(s._id), s]));
        const lastBy = Object.fromEntries(lastEvents.map((e) => [String(e._id), e.at]));

        res.json(projects.map((p) => {
            const s = statsBy[String(p._id)] || { total: 0, open: 0, overdue: 0 };
            return {
                ...p.toObject(),
                stats: {
                    totalTasks: s.total,
                    open: s.open,
                    overdue: s.overdue
                },
                lastActivityAt: lastBy[String(p._id)] || p.updatedAt || null
            };
        }));
    } catch (err) {
        console.error('[PROJECT] mine error:', err.message);
        res.status(500).json({ message: 'Could not load your projects' });
    }
});

/**
 * GET /api/projects/:id/overview
 *
 * The workspace header: which project this is, who leads it, and — for the
 * roles that can already see it on the registry — what has been spent.
 *
 * There are no task or team counts here any more, and that is the point.
 *
 * This used to return a whole `health` block that drew a six-tile strip above
 * the tab bar: total tasks, open, in progress, on hold, overdue, team size.
 * Every one of those numbers was about a thing that has its own tab directly
 * underneath, so the first thing anyone saw on opening a project was a row of
 * digits restating the tab bar, and none of them could be acted on without
 * moving to the tab anyway. The status counts now live in the Tasks tab where
 * each is also the filter that reaches it, team size is the Team tab's own
 * badge, and this endpoint no longer runs an aggregate, a membership
 * resolution (three queries) and an external-participant count on every open
 * to produce them.
 *
 * There is deliberately no completion percentage either. A ratio of completed
 * rows to total rows is unweighted, gives no credit for work in flight, and on
 * any project with a recurring schedule is dominated by daily occurrences — on
 * Spectra those were 56% of all rows, so the figure tracked whether a routine
 * had been ticked rather than whether the project was near delivery.
 */
router.get('/:id/overview', auth, requireProjectAccess, async (req, res) => {
    try {
        const payload = {
            project: {
                _id: req.project._id,
                name: req.project.name,
                description: req.project.description,
                status: req.project.status,
                projectLead: req.project.projectLead,
                startDate: req.project.startDate,
                endDate: req.project.endDate
            },
            canSeeBudget: req.projectIsPrivileged
        };

        if (req.projectIsPrivileged) {
            const spentAgg = await Purchase.aggregate([
                { $match: { projectName: req.project.name, status: 'Approved' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            payload.budget = {
                total: req.project.totalBudget || 0,
                spent: spentAgg.length ? spentAgg[0].total : 0
            };
        }

        res.json(payload);
    } catch (err) {
        console.error('[PROJECT] overview error:', err.message);
        res.status(500).json({ message: 'Could not load the project summary' });
    }
});

/**
 * GET /api/projects/:id/tasks
 *
 * F1.3 — the project's tasks.
 *
 * Scoped by getTaskVisibilityFilter, exactly as the main task list is: opening
 * a project workspace grants no task visibility a person did not already have.
 * The one addition is `assignees: me`, OR-ed in — that is not a widening, it is
 * the other half of what the same employee already sees at /api/tasks/my, and
 * without it their own project's tab would list only work they handed out and
 * none of the work they were given.
 */
router.get('/:id/tasks', auth, requireProjectAccess, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const skip = (page - 1) * limit;

        const andConditions = [{ projectId: req.project._id }, { isArchived: false }];

        const visibility = await getTaskVisibilityFilter(req.user);
        if (visibility) {
            andConditions.push({
                $or: [visibility, { assignees: new mongoose.Types.ObjectId(String(req.user.id)) }]
            });
        }

        if (req.query.priority && req.query.priority !== 'All') {
            andConditions.push({ priority: req.query.priority });
        }
        if (req.query.assigneeId && req.query.assigneeId !== 'All' && mongoose.isValidObjectId(req.query.assigneeId)) {
            andConditions.push({ assignees: new mongoose.Types.ObjectId(req.query.assigneeId) });
        }
        // Rejected work is not work; work awaiting sign-off still is, and is
        // listed here badged rather than hidden. See COUNTABLE.
        andConditions.push(COUNTABLE);

        if (req.query.search) {
            andConditions.push({ title: new RegExp(req.query.search.trim(), 'i') });
        }

        /*
         * Everything above narrows *which* tasks are in play; status and
         * overdue narrow which of those are on screen. The split matters
         * because the chips above the list have to keep showing the totals for
         * every status while one of them is selected — counting them from the
         * filtered set would zero every chip except the active one the moment
         * it was clicked.
         */
        const countBase = [...andConditions];

        if (req.query.status && req.query.status !== 'All') {
            andConditions.push({ status: req.query.status });
        }
        if (req.query.overdue === 'true') {
            andConditions.push({ overdueAt: { $lt: new Date() } }, { status: { $ne: 'Completed' } });
        }

        const query = { $and: andConditions };

        /*
         * The chip counts, over everything this viewer may see on the project
         * rather than over the page they happen to be on.
         *
         * countDocuments rather than one $group aggregate, deliberately:
         * getTaskVisibilityFilter returns `{ assignedBy: <string from the JWT> }`,
         * and an aggregation $match does not cast a string to an ObjectId the
         * way find() does. The aggregate version matched nothing and reported
         * every count as zero for exactly the roles the filter applies to.
         * These go through the query builder, which casts.
         */
        const [totalRecords, tasks, allCount, overdueCount, ...statusCounts] = await Promise.all([
            Task.countDocuments(query),
            Task.find(query)
                .populate('assignedBy', 'name profilePic')
                .populate('assignees', 'name email employeeId profilePic')
                .select('title status priority startDate dueDate dueTime overdueAt completedAt taskType assignedBy assignees attachments createdAt approvalStatus isSelfAssigned')
                .sort({ dueDate: 1 })
                .skip(skip)
                .limit(limit),
            Task.countDocuments({ $and: countBase }),
            Task.countDocuments({
                $and: [...countBase, { overdueAt: { $lt: new Date() } }, { status: { $ne: 'Completed' } }]
            }),
            ...TASK_STATUSES.map((s) => (
                Task.countDocuments({ $and: [...countBase, { status: s }] })
            ))
        ]);

        res.json({
            data: tasks,
            pagination: {
                totalRecords,
                totalPages: Math.ceil(totalRecords / limit) || 1,
                currentPage: page,
                limit
            },
            counts: {
                All: allCount,
                Overdue: overdueCount,
                ...Object.fromEntries(TASK_STATUSES.map((s, i) => [s, statusCounts[i]]))
            }
        });
    } catch (err) {
        console.error('[PROJECT] tasks error:', err.message);
        res.status(500).json({ message: 'Could not load the project tasks' });
    }
});

/**
 * GET /api/projects/:id/team
 *
 * F1.4 — who is on this project, how they got here, and how much they are
 * carrying on it.
 *
 * The open-task count is unscoped by design: it is a workload number about the
 * project, not a task list, and a team tab that showed different totals to
 * different colleagues would be worse than useless for balancing work.
 */
router.get('/:id/team', auth, requireProjectAccess, async (req, res) => {
    try {
        const projectId = req.project._id;

        const memberIds = await getProjectMemberIds(projectId);
        if (!memberIds.length) return res.json([]);

        const objectIds = memberIds.map((id) => new mongoose.Types.ObjectId(id));

        const [users, workload, group] = await Promise.all([
            User.find({ _id: { $in: objectIds } })
                .select('name email role jobTitle employeeId profilePic status')
                .sort({ name: 1 }),
            Task.aggregate([
                { $match: { projectId, isArchived: false } },
                { $unwind: '$assignees' },
                { $match: { assignees: { $in: objectIds } } },
                {
                    $group: {
                        _id: '$assignees',
                        open: { $sum: { $cond: [{ $ne: ['$status', 'Completed'] }, 1, 0] } },
                        completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
                        overdue: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $ne: ['$status', 'Completed'] },
                                            { $lt: ['$overdueAt', new Date()] }
                                        ]
                                    },
                                    1, 0
                                ]
                            }
                        }
                    }
                }
            ]),
            Conversation.findOne({ projectId, groupType: 'project' }).select('members')
        ]);

        const workloadBy = Object.fromEntries(workload.map((w) => [String(w._id), w]));
        const groupRoleBy = Object.fromEntries(
            (group?.members || [])
                .filter((m) => !m.leftAt && !m.hidden)
                .map((m) => [String(m.user), m.role])
        );
        const leadId = String(req.project.projectLead?._id || req.project.projectLead || '');

        res.json(users.map((u) => {
            const w = workloadBy[String(u._id)] || { open: 0, completed: 0, overdue: 0 };
            return {
                ...u.toObject(),
                projectRole: String(u._id) === leadId
                    ? 'Project Lead'
                    : groupRoleBy[String(u._id)] === 'owner' ? 'Owner'
                    : groupRoleBy[String(u._id)] === 'admin' ? 'Group Admin'
                    : 'Member',
                openTasks: w.open,
                completedTasks: w.completed,
                overdueTasks: w.overdue
            };
        }));
    } catch (err) {
        console.error('[PROJECT] team error:', err.message);
        res.status(500).json({ message: 'Could not load the project team' });
    }
});

/**
 * GET /api/projects/:id/conversations
 *
 * F1.5 and F1.6 in one response.
 *
 * `discussions` is every conversation on the project — F1.5 asks for "all
 * groups and conversations belonging to this project", and all means all.
 * `vendor` is the subset that currently holds a live external membership, which
 * is what the Vendors tab shows.
 *
 * The two overlap on purpose, and an earlier version that made them disjoint
 * was wrong in a way worth recording: Spectra's only group has one vendor in
 * it, so classifying the whole thread as "vendor" deleted the project's main
 * conversation from the Discussions tab entirely — the tab that exists to list
 * it showed nothing at all. A vendor being present does not stop a group being
 * where the team talks.
 *
 * A thread is a vendor thread when it holds a live external membership; there
 * is no separate conversation kind for it, because the whole point of Module 2
 * is that an outsider joins a group the team was already using. Keeping them
 * visually distinct (F1.6) is a rendering decision made from the `externals`
 * array on each row, not a second data model.
 *
 * Listed only where the viewer is a member, matching /api/conversations
 * exactly; an ADMIN's oversight of every group already has its own disclosed
 * route and is not silently widened here.
 */
router.get('/:id/conversations', auth, requireProjectAccess, async (req, res) => {
    try {
        const projectId = req.project._id;
        const isOversight = IS_OVERSIGHT.includes(req.user.role);

        const filter = { projectId, isArchived: false };
        if (!isOversight) {
            filter.members = { $elemMatch: { user: req.user.id, leftAt: null } };
        }

        const conversations = await Conversation.find(filter)
            .populate('members.user', 'name profilePic')
            .sort({ lastActivityAt: -1 })
            .limit(100);

        if (!conversations.length) return res.json({ discussions: [], vendor: [] });

        const ids = conversations.map((c) => c._id);

        const externals = await ExternalParticipant.find({
            conversationId: { $in: ids },
            status: 'active',
            revokedAt: null
        })
            .populate('externalUser', 'name email company type isActive')
            .select('conversationId externalUser expiresAt lastSeenAt');

        const externalsBy = {};
        externals.forEach((e) => {
            const key = String(e.conversationId);
            (externalsBy[key] = externalsBy[key] || []).push(e);
        });

        const shape = (c) => {
            const ext = externalsBy[String(c._id)] || [];
            return {
                _id: c._id,
                name: c.name,
                description: c.description,
                avatar: c.avatar,
                groupType: c.groupType,
                lastMessage: c.lastMessage,
                lastActivityAt: c.lastActivityAt,
                // Hidden oversight members are not counted or listed — the same
                // concealment utils/conversationAccess.js maintains everywhere.
                memberCount: (c.members || []).filter((m) => !m.leftAt && !m.hidden).length,
                members: (c.members || [])
                    .filter((m) => !m.leftAt && !m.hidden)
                    .slice(0, 5)
                    .map((m) => m.user),
                externals: ext.map((e) => ({
                    _id: e._id,
                    externalUser: e.externalUser,
                    expiresAt: e.expiresAt,
                    lastSeenAt: e.lastSeenAt
                }))
            };
        };

        // Every thread for Discussions; the ones carrying an outsider again for
        // Vendors. Not disjoint — see the note on this route.
        const discussions = conversations.map(shape);
        const vendor = discussions.filter((c) => c.externals.length > 0);

        res.json({ discussions, vendor });
    } catch (err) {
        console.error('[PROJECT] conversations error:', err.message);
        res.status(500).json({ message: 'Could not load the project conversations' });
    }
});

/**
 * GET /api/projects/:id/documents
 *
 * F1.7 — every file shared on this project, in one library.
 *
 * An aggregation over what already exists rather than a new collection: a file
 * is not a separate thing from the task or message that carried it, and
 * indexing it twice would mean a document that survives the deletion of its
 * own message. The three sources are task attachments, task-discussion
 * attachments and chat attachments (vendor uploads included, which is F2.5
 * arriving here for free).
 *
 * Read-only. There is no upload path into this library — files enter it by
 * being attached where the work is.
 *
 * Scoping mirrors the tabs the files come from: tasks through the same
 * visibility filter as the Tasks tab, chat through membership. A file is never
 * reachable here that its own source would not have shown.
 */
router.get('/:id/documents', auth, requireProjectAccess, async (req, res) => {
    try {
        const projectId = req.project._id;
        const meId = new mongoose.Types.ObjectId(String(req.user.id));

        const taskConditions = [{ projectId }, { isArchived: false }];
        const visibility = await getTaskVisibilityFilter(req.user);
        if (visibility) {
            taskConditions.push({ $or: [visibility, { assignees: meId }] });
        }

        const conversationFilter = { projectId, isArchived: false };
        if (!IS_OVERSIGHT.includes(req.user.role)) {
            conversationFilter.members = { $elemMatch: { user: req.user.id, leftAt: null } };
        }

        const [visibleTasks, conversationIds] = await Promise.all([
            Task.find({ $and: taskConditions }).select('_id title'),
            Conversation.find(conversationFilter).distinct('_id')
        ]);

        const taskIds = visibleTasks.map((t) => t._id);
        const titleBy = Object.fromEntries(visibleTasks.map((t) => [String(t._id), t.title]));

        /*
         * Three $unwind pipelines rather than three finds and a JS flatten: a
         * task with twelve attachments should cost twelve rows over the wire,
         * not a whole task document per file.
         */
        const [fromTasks, fromComments, fromChat] = await Promise.all([
            taskIds.length ? Task.aggregate([
                { $match: { _id: { $in: taskIds }, 'attachments.0': { $exists: true } } },
                { $unwind: '$attachments' },
                {
                    $project: {
                        _id: 0,
                        file: '$attachments',
                        sourceId: '$_id',
                        title: '$title',
                        at: '$createdAt',
                        by: { $ifNull: ['$attachments.uploadedBy', '$assignedBy'] }
                    }
                }
            ]) : [],
            taskIds.length ? TaskComment.aggregate([
                { $match: { taskId: { $in: taskIds }, ownerModel: 'Task', 'attachments.0': { $exists: true } } },
                { $unwind: '$attachments' },
                {
                    $project: {
                        _id: 0,
                        file: '$attachments',
                        sourceId: '$taskId',
                        at: '$createdAt',
                        by: '$author'
                    }
                }
            ]) : [],
            conversationIds.length ? Message.aggregate([
                {
                    $match: {
                        conversationId: { $in: conversationIds },
                        deletedAt: null,
                        'attachments.0': { $exists: true }
                    }
                },
                { $unwind: '$attachments' },
                {
                    $project: {
                        _id: 0,
                        file: '$attachments',
                        sourceId: '$conversationId',
                        at: '$createdAt',
                        by: '$sender',
                        externalBy: '$externalSender'
                    }
                }
            ]) : []
        ]);

        const rows = [
            ...fromTasks.map((r) => ({ ...r, source: 'task', sourceLabel: r.title || 'Task' })),
            ...fromComments.map((r) => ({
                ...r,
                source: 'discussion',
                sourceLabel: titleBy[String(r.sourceId)] || 'Task discussion'
            })),
            ...fromChat.map((r) => ({ ...r, source: 'chat', sourceLabel: 'Chat' }))
        ];

        // Resolve every uploader in two queries instead of populating three
        // pipelines. Externals are looked up separately so a vendor upload can
        // carry its badge (F2.4) without the client guessing from a null.
        const userIds = [...new Set(rows.map((r) => r.by).filter(Boolean).map(String))];
        const extIds = [...new Set(rows.map((r) => r.externalBy).filter(Boolean).map(String))];

        const [people, externals, chatNames] = await Promise.all([
            userIds.length ? User.find({ _id: { $in: userIds } }).select('name profilePic') : [],
            extIds.length ? ExternalUser.find({ _id: { $in: extIds } }).select('name company') : [],
            conversationIds.length
                ? Conversation.find({ _id: { $in: conversationIds } }).select('name')
                : []
        ]);

        const personBy = Object.fromEntries(people.map((p) => [String(p._id), p]));
        const extBy = Object.fromEntries(externals.map((e) => [String(e._id), e]));
        const chatNameBy = Object.fromEntries(chatNames.map((c) => [String(c._id), c.name]));

        let documents = rows.map((r) => ({
            url: r.file.url,
            fileName: r.file.fileName || '',
            type: r.file.type,
            status: r.file.status,
            durationMs: r.file.durationMs,
            source: r.source,
            sourceId: r.sourceId,
            sourceLabel: r.source === 'chat'
                ? (chatNameBy[String(r.sourceId)] || 'Chat')
                : r.sourceLabel,
            link: r.source === 'chat' ? `/chats/${r.sourceId}` : `/task/${r.sourceId}`,
            uploadedBy: r.externalBy
                ? { name: extBy[String(r.externalBy)]?.name || 'External', isExternal: true }
                : { ...(personBy[String(r.by)]?.toObject?.() || {}), isExternal: false },
            at: r.at
        }));

        if (req.query.type && req.query.type !== 'All') {
            documents = documents.filter((d) => d.type === req.query.type);
        }
        if (req.query.source && req.query.source !== 'All') {
            documents = documents.filter((d) => d.source === req.query.source);
        }
        if (req.query.search) {
            const rx = new RegExp(req.query.search.trim(), 'i');
            documents = documents.filter((d) => rx.test(d.fileName) || rx.test(d.sourceLabel));
        }

        documents.sort((a, b) => new Date(b.at) - new Date(a.at));

        res.json({
            data: documents.slice(0, 500),
            totalRecords: documents.length,
            // Sorting and filtering happen in memory, so the cap has to be
            // stated rather than silently applied — a project past it needs the
            // filters, not a longer scroll.
            truncated: documents.length > 500
        });
    } catch (err) {
        console.error('[PROJECT] documents error:', err.message);
        res.status(500).json({ message: 'Could not load the project documents' });
    }
});

/**
 * GET /api/projects/:id/activity
 *
 * F1.8 — the recent-events feed. Cursor-paginated on createdAt rather than
 * skip/limit: the feed grows at the head, and a skip would shift rows under
 * the reader every time somebody sent a message while they were scrolling.
 *
 * Rows carry no message text. Knowing that Riya wrote in the Design group is
 * what a project feed is for; reproducing what she said would make this a
 * second, unscoped copy of the chat.
 */
router.get('/:id/activity', auth, requireProjectAccess, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);

        const filter = { projectId: req.project._id };
        if (req.query.before) {
            const before = new Date(req.query.before);
            if (!Number.isNaN(before.getTime())) filter.at = { $lt: before };
        }
        if (req.query.type && req.query.type !== 'All') {
            filter.type = req.query.type;
        }

        // Sorted on `at`, not createdAt — a collapsed burst is moved back to
        // the top of the feed, and only `at` reflects that.
        const events = await ProjectActivity.find(filter)
            .populate('actor', 'name profilePic')
            .populate('externalActor', 'name company')
            .sort({ at: -1 })
            .limit(limit + 1);

        const hasMore = events.length > limit;
        const page = hasMore ? events.slice(0, limit) : events;

        res.json({
            data: page,
            nextCursor: hasMore ? page[page.length - 1].at : null
        });
    } catch (err) {
        console.error('[PROJECT] activity error:', err.message);
        res.status(500).json({ message: 'Could not load the project activity' });
    }
});

module.exports = router;