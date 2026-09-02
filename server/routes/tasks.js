const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const taskUpload = require('../middleware/taskUploadMiddleware');
const { processTaskFiles, discardStagedFiles, s3Folder, isVideo } = require('../utils/taskMedia');
const { syncProjectGroupMembers } = require('../utils/conversationAccess');
const { buildTaskDateFilter } = require('../utils/taskDateFilter');
const { getAbsentToday } = require('../utils/attendanceToday');

const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const VideoCompressionQueue = require('../models/VideoCompressionQueue');
const TaskComment = require('../models/TaskComment');
// Required for its side effect: this file populates recurringTaskId, and
// Mongoose needs that schema registered. It only worked before because
// index.js loads the recurring cron, which is a fragile thing to rely on.
require('../models/RecurringTask');
const Nudge = require('../models/Nudge');
const { buildDiscussionHandlers } = require('../utils/taskDiscussion');
const {
    canNudgeOn,
    dispatchNudge,
    deliverWhatsApp,
    NUDGE_COOLDOWN_MINUTES
} = require('../utils/nudge');
const { emitToTask } = require('../utils/realtime');
const { deleteFromS3 } = require('../utils/s3Service');
const fs = require('fs');
const path = require('path');

// Roles and team scoping live in utils/taskScoping so the recurring-schedule
// routes enforce exactly the same rules.
const {
    CAN_ASSIGN,
    IS_PRIVILEGED,
    getScopedEmployeeFilter,
    getScopedEmployees,
    getScopedProjects,
    getApproversFor,
    canApproveFor,
    getTaskVisibilityFilter
} = require('../utils/taskScoping');
const { todayIST, addDays } = require('../utils/recurringSchedule');
const { buildTaskSearchFilter, escapeRegex } = require('../utils/taskSearch');
const { parseTimeWindow, istWallClockToUTC } = require('../utils/taskOverdue');

const TASK_STATUSES = ['Pending', 'In Progress', 'On Hold', 'Completed'];
const TASK_TYPES = ['Project Task', 'Regular Office Task'];

// Office work has no project, so its media lands in a shared folder.
const folderForTask = (taskType, projectName) =>
    taskType === 'Regular Office Task' ? s3Folder('Office') : s3Folder(projectName);

// Everyone on a task shares one status, and only the people actually doing
// the work may move it. An assigner watching from the outside deliberately
// cannot: reporting progress on someone else's behalf produces a timeline
// that says the work happened when really only the manager's opinion of it
// changed. What a manager gets instead is POST /:id/reopen below, which
// sends finished work back with a reason attached.
const isWorkingOnTask = (task, reqUser) =>
    task.assignees.some(id => id.toString() === reqUser.id);

// The other side of that split: whoever owns the task's outcome. They steer
// the brief (title, dates, reference media) and can send work back, but they
// never report progress themselves.
const ownsTaskOutcome = (task, reqUser) =>
    task.assignedBy.toString() === reqUser.id ||
    IS_PRIVILEGED.includes(reqUser.role);

// Multipart sends arrays inconsistently depending on how the client builds the
// FormData, so accept every shape.
const parseIdList = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[')) {
            try { return JSON.parse(trimmed).filter(Boolean); } catch (e) { /* fall through */ }
        }
        return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
};

// Multipart sends every field as a string, so a checkbox arrives as 'true' /
// 'false' rather than a boolean. Opt-in: anything that isn't an explicit yes
// is a no, which is what keeps the default off for tasks created by older
// clients that don't send the field at all.
const parseBool = (raw) => raw === true || raw === 'true';

const notify = async (recipientId, title, message, link) => {
    try {
        await Notification.create({ recipient: recipientId, title, message, type: 'TASK', link });
    } catch (err) {
        // A failed notification must never fail the underlying action.
        console.error('[TASK] Notification error:', err.message);
    }
};

// ==========================================
// 1. DROPDOWN DATA
// ==========================================
router.get('/assignable-employees', auth, async (req, res) => {
    try {
        if (!CAN_ASSIGN.includes(req.user.role)) return res.status(403).json({ message: 'Access Denied' });
        res.json(await getScopedEmployees(req.user));
    } catch (err) {
        console.error('Assignable Employees Error:', err);
        res.status(500).send('Server Error');
    }
});

router.get('/assignable-projects', auth, async (req, res) => {
    try {
        if (!CAN_ASSIGN.includes(req.user.role)) return res.status(403).json({ message: 'Access Denied' });
        res.json(await getScopedProjects());
    } catch (err) {
        console.error('Assignable Projects Error:', err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 2. CREATE TASK
// ==========================================
router.post('/', auth, taskUpload.array('attachments', 10), async (req, res) => {
    try {
        if (!CAN_ASSIGN.includes(req.user.role)) {
            discardStagedFiles(req.files);
            return res.status(403).json({ message: 'You are not allowed to assign tasks' });
        }

        const { title, description, projectId, priority, startDate, dueDate } = req.body;
        const timeWindow = parseTimeWindow(req.body);
        const assigneeIds = parseIdList(req.body.assigneeIds);
        const taskType = TASK_TYPES.includes(req.body.taskType) ? req.body.taskType : 'Project Task';
        const isOfficeTask = taskType === 'Regular Office Task';

        if (!title || !dueDate) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Title and due date are required' });
        }
        if (!isOfficeTask && !projectId) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Pick a project, or switch this to a Regular Office task' });
        }
        if (assigneeIds.length === 0) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Assign the task to at least one employee' });
        }

        // Office tasks skip the project check entirely.
        let project = null;
        if (!isOfficeTask) {
            const allowedProjects = await getScopedProjects();
            project = allowedProjects.find(p => p._id.toString() === projectId);
            if (!project) {
                discardStagedFiles(req.files);
                return res.status(400).json({ message: 'That project is not available. It may have been completed or put on hold.' });
            }
        }

        // Every assignee must be inside this user's team scope.
        const allowedEmployees = await getScopedEmployees(req.user);
        const allowedIds = new Set(allowedEmployees.map(e => e._id.toString()));
        const invalid = assigneeIds.filter(id => !allowedIds.has(id));
        if (invalid.length > 0) {
            discardStagedFiles(req.files);
            return res.status(403).json({ message: 'One or more selected employees are outside your team' });
        }

        const subFolder = folderForTask(taskType, project?.name);
        const { media, pendingVideos } = await processTaskFiles(req.files, subFolder);

        const task = new Task({
            title,
            description: description || "",
            taskType,
            projectId: isOfficeTask ? null : projectId,
            assignedBy: req.user.id,
            priority: priority || 'Medium',
            startDate: startDate || null,
            dueDate,
            ...timeWindow,
            requiresAttachment: parseBool(req.body.requiresAttachment),
            attachments: media,
            assignees: assigneeIds
        });

        await task.save();

        // Being given work on a project is what puts you in its conversation
        // (feature draft F3.3) — Project itself has no member list, so
        // assignment is the signal. Office tasks have no project and no group.
        if (!isOfficeTask && projectId) {
            syncProjectGroupMembers(projectId, assigneeIds, req.user.id);
        }

        // Videos staged on disk now get their queue rows, pointing at the task
        // that finally exists.
        if (pendingVideos.length > 0) {
            await VideoCompressionQueue.insertMany(pendingVideos.map(v => ({
                taskId: task._id,
                mediaId: v.mediaId,
                field: 'attachments',
                localPath: v.localPath,
                originalName: v.originalName,
                projectName: isOfficeTask ? 'Office' : project.name
            })));
        }

        const assigner = await User.findById(req.user.id).select('name');
        const due = new Date(dueDate).toLocaleDateString('en-GB');
        await Promise.all(assigneeIds.map(id => notify(
            id,
            'New Task Assigned',
            `${assigner?.name || 'Your manager'} assigned you "${title}" (due ${due}).`,
            `/task/${task._id}`
        )));

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic');

        res.status(201).json(populated);
    } catch (err) {
        discardStagedFiles(req.files);
        console.error('Task Creation Error:', err);
        res.status(500).json({ message: 'Server Error while creating task' });
    }
});

// ==========================================
// 3. MY TASKS (assignee view)
// ==========================================
router.get('/my', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const andConditions = [
            { isArchived: false },
            { assignees: req.user.id }
        ];

        if (req.query.status && req.query.status !== 'All') {
            andConditions.push({ status: req.query.status });
        }
        if (req.query.priority && req.query.priority !== 'All') {
            andConditions.push({ priority: req.query.priority });
        }
        if (req.query.projectId && req.query.projectId !== 'All') {
            andConditions.push({ projectId: req.query.projectId });
        }
        if (req.query.taskType && req.query.taskType !== 'All') {
            andConditions.push({ taskType: req.query.taskType });
        }
        // Today/Yesterday/Week/Month/All/Custom, on the day the task belongs to.
        const dateFilter = buildTaskDateFilter(req.query.filterType, req.query.fromDate, req.query.toDate);
        if (dateFilter) andConditions.push(dateFilter);
        // Matches the title, the people on it, whoever assigned it, the project
        // and the task type — everything the row actually displays.
        const searchFilter = await buildTaskSearchFilter(req.query.search);
        if (searchFilter) andConditions.push(searchFilter);

        const query = { $and: andConditions };

        const totalRecords = await Task.countDocuments(query);
        const tasks = await Task.find(query)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic')
            .populate('approvedBy', 'name profilePic')
            .sort({ dueDate: 1 })
            .skip(skip)
            .limit(limit);

        // Counters for the tab badges — computed over the whole set, not the page.
        const myOpen = await Task.countDocuments({
            isArchived: false,
            assignees: req.user.id,
            status: { $ne: 'Completed' }
        });
        const myOverdue = await Task.countDocuments({
            isArchived: false,
            assignees: req.user.id,
            status: { $ne: 'Completed' },
            overdueAt: { $lt: new Date() }
        });

        res.json({
            data: tasks,
            pagination: { totalRecords, totalPages: Math.ceil(totalRecords / limit) || 1, currentPage: page, limit },
            stats: { open: myOpen, overdue: myOverdue }
        });
    } catch (err) {
        console.error('My Tasks Error:', err);
        res.status(500).send('Server Error');
    }
});

// Lightweight counter for the sidebar badge.
router.get('/my/open-count', auth, async (req, res) => {
    try {
        const count = await Task.countDocuments({
            isArchived: false,
            assignees: req.user.id,
            status: { $ne: 'Completed' }
        });
        res.json({ count });
    } catch (err) {
        res.status(500).json({ count: 0 });
    }
});

// ==========================================
// 3b. SELF-ASSIGNED TASKS  (TaskPlan.md §15)
// ==========================================

/**
 * An employee logging work they were handed verbally.
 *
 * Unlike every other create path this is open to *any* signed-in user — that is
 * the point of the feature. The guard rails instead are: they can only assign it
 * to themselves, and it lands as `Pending` until someone in their chain of
 * command approves it.
 */
router.post('/self', auth, taskUpload.array('attachments', 10), async (req, res) => {
    try {
        const { title, description, projectId, priority, startDate, dueDate, assignedById } = req.body;
        const timeWindow = parseTimeWindow(req.body);
        const taskType = TASK_TYPES.includes(req.body.taskType) ? req.body.taskType : 'Project Task';
        const isOfficeTask = taskType === 'Regular Office Task';

        if (!title || !dueDate) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Title and due date are required' });
        }
        if (!assignedById) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Say who asked you to do this' });
        }
        if (!isOfficeTask && !projectId) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Pick a project, or switch this to a Regular Office task' });
        }

        // Naming someone is a statement of fact, not a grant of permission — any
        // active colleague is allowed here, and approval rights are worked out
        // separately from the employee's own reporting chain.
        const namedBy = await User.findOne({ _id: assignedById, status: 'ACTIVE' }).select('name');
        if (!namedBy) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'That person is not an active employee' });
        }

        let project = null;
        if (!isOfficeTask) {
            const allowedProjects = await getScopedProjects();
            project = allowedProjects.find(p => p._id.toString() === projectId);
            if (!project) {
                discardStagedFiles(req.files);
                return res.status(400).json({ message: 'That project is not available' });
            }
        }

        const subFolder = folderForTask(taskType, project?.name);
        const { media, pendingVideos } = await processTaskFiles(req.files, subFolder);

        const task = new Task({
            title,
            description: description || "",
            taskType,
            projectId: isOfficeTask ? null : projectId,
            assignedBy: assignedById,
            priority: priority || 'Medium',
            startDate: startDate || null,
            dueDate,
            ...timeWindow,
            attachments: media,
            // The whole point: they are the only assignee.
            assignees: [req.user.id],
            isSelfAssigned: true,
            approvalStatus: 'Pending'
        });

        await task.save();

        if (pendingVideos.length > 0) {
            await VideoCompressionQueue.insertMany(pendingVideos.map(v => ({
                taskId: task._id,
                mediaId: v.mediaId,
                field: 'attachments',
                localPath: v.localPath,
                originalName: v.originalName,
                projectName: isOfficeTask ? 'Office' : project.name
            })));
        }

        // Everyone who could act on it hears about it; whoever gets there first
        // decides.
        const me = await User.findById(req.user.id).select('name');
        const approvers = await getApproversFor(req.user.id);
        await Promise.all(approvers.map(a => notify(
            a._id,
            'Task needs approval',
            `${me?.name || 'An employee'} logged "${title}" as self-assigned and it needs your approval.`,
            `/task/${task._id}`
        )));

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic');

        res.status(201).json(populated);
    } catch (err) {
        discardStagedFiles(req.files);
        console.error('Self Task Creation Error:', err);
        res.status(500).json({ message: 'Server Error while creating the task' });
    }
});

/**
 * The employee fixing up a rejected request and sending it back.
 * Only their own, only while it is Rejected — an approved task is edited through
 * the ordinary edit route like any other.
 */
router.put('/self/:id', auth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const mine = task.assignees.some(a => a.toString() === req.user.id);
        if (!task.isSelfAssigned || !mine) {
            return res.status(403).json({ message: 'This is not your self-assigned task' });
        }
        // Pending too, not only Rejected: someone who mistypes their own request
        // should be able to correct it rather than wait to be turned down first.
        // Once approved it is an ordinary task and goes through the normal edit
        // route, so an employee cannot quietly rewrite work already signed off.
        if (!['Rejected', 'Pending'].includes(task.approvalStatus)) {
            return res.status(400).json({ message: 'This task has been approved — ask your manager to change it' });
        }
        const wasRejected = task.approvalStatus === 'Rejected';

        if (typeof req.body.title === 'string' && req.body.title.trim()) task.title = req.body.title.trim();
        if (typeof req.body.description === 'string') task.description = req.body.description;
        if (['Low', 'Medium', 'High', 'Urgent'].includes(req.body.priority)) task.priority = req.body.priority;
        if (req.body.dueDate) task.dueDate = req.body.dueDate;
        if (req.body.startDate !== undefined) task.startDate = req.body.startDate || null;
        if (req.body.startTime !== undefined || req.body.dueTime !== undefined || req.body.timeAllottedMinutes !== undefined) {
            Object.assign(task, parseTimeWindow(req.body));
        }

        if (TASK_TYPES.includes(req.body.taskType)) {
            task.taskType = req.body.taskType;
            task.projectId = req.body.taskType === 'Regular Office Task' ? null : (req.body.projectId || task.projectId);
        }
        if (req.body.assignedById) {
            const namedBy = await User.findOne({ _id: req.body.assignedById, status: 'ACTIVE' }).select('_id');
            if (namedBy) task.assignedBy = req.body.assignedById;
        }

        // Back into the queue, with the old verdict cleared so the reason shown
        // is never a stale one. Harmless on one that was already Pending.
        task.approvalStatus = 'Pending';
        task.approvalNote = "";
        task.approvedBy = null;
        task.approvedAt = null;
        await task.save();

        const me = await User.findById(req.user.id).select('name');
        const approvers = await getApproversFor(req.user.id);
        await Promise.all(approvers.map(a => notify(
            a._id,
            wasRejected ? 'Task resubmitted for approval' : 'Task updated',
            wasRejected
                ? `${me?.name || 'An employee'} updated "${task.title}" and sent it back for approval.`
                : `${me?.name || 'An employee'} changed "${task.title}", which is still waiting on your approval.`,
            `/task/${task._id}`
        )));

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic');

        res.json(populated);
    } catch (err) {
        console.error('Self Task Resubmit Error:', err);
        res.status(500).json({ message: 'Server Error while resubmitting' });
    }
});

/**
 * Approve or reject. Open to the employee's reporting managers and team leads,
 * plus Admin/HR — first one to act decides.
 */
router.put('/:id/approval', auth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });
        if (!task.isSelfAssigned) {
            return res.status(400).json({ message: 'This task did not need approval' });
        }

        const { decision, note } = req.body;
        if (!['Approved', 'Rejected'].includes(decision)) {
            return res.status(400).json({ message: 'Decision must be Approved or Rejected' });
        }
        if (decision === 'Rejected' && !(note || '').trim()) {
            return res.status(400).json({ message: 'Give a reason when rejecting, so it can be fixed' });
        }

        const employeeId = task.assignees[0];
        if (!await canApproveFor(employeeId, req.user)) {
            return res.status(403).json({ message: 'You are not an approver for this employee' });
        }
        // Their own request is not theirs to wave through.
        if (employeeId.toString() === req.user.id) {
            return res.status(403).json({ message: 'You cannot approve your own task' });
        }

        task.approvalStatus = decision;
        task.approvalNote = (note || '').trim();
        task.approvedBy = req.user.id;
        task.approvedAt = new Date();
        await task.save();

        const actor = await User.findById(req.user.id).select('name');
        await notify(
            employeeId,
            decision === 'Approved' ? 'Task approved' : 'Task rejected',
            decision === 'Approved'
                ? `${actor?.name || 'Your manager'} approved "${task.title}".`
                : `${actor?.name || 'Your manager'} rejected "${task.title}": ${task.approvalNote}`,
            `/task/${task._id}`
        );

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic')
            .populate('approvedBy', 'name profilePic');

        res.json(populated);
    } catch (err) {
        console.error('Task Approval Error:', err);
        res.status(500).json({ message: 'Server Error while recording the decision' });
    }
});

/**
 * The admin's Self-Assigned tab: every self-logged task in this user's scope,
 * whatever its approval state, with the employee attached.
 */
router.get('/self-assigned', auth, async (req, res) => {
    try {
        if (!CAN_ASSIGN.includes(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const andConditions = [{ isSelfAssigned: true, isArchived: false }];

        // A Team Lead sees their own team's requests, not the whole company's.
        if (!IS_PRIVILEGED.includes(req.user.role)) {
            const scopeFilter = await getScopedEmployeeFilter(req.user);
            const scoped = scopeFilter ? await User.find(scopeFilter).select('_id') : [];
            andConditions.push({ assignees: { $in: scoped.map(u => u._id) } });
        }

        if (req.query.approvalStatus && req.query.approvalStatus !== 'All') {
            andConditions.push({ approvalStatus: req.query.approvalStatus });
        }
        if (req.query.employeeId && req.query.employeeId !== 'All') {
            andConditions.push({ assignees: req.query.employeeId });
        }
        // The work status, as distinct from the approval status above.
        if (req.query.status && req.query.status !== 'All' && TASK_STATUSES.includes(req.query.status)) {
            andConditions.push({ status: req.query.status });
        }
        // Matches the title, the people on it, whoever assigned it, the project
        // and the task type — everything the row actually displays.
        const searchFilter = await buildTaskSearchFilter(req.query.search);
        if (searchFilter) andConditions.push(searchFilter);

        const query = { $and: andConditions };

        const totalRecords = await Task.countDocuments(query);
        const tasks = await Task.find(query)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic')
            .populate('approvedBy', 'name profilePic')
            .sort({ approvalStatus: 1, createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // The number the tab badge shows.
        const pendingCount = await Task.countDocuments({
            $and: [...andConditions.filter(c => !c.approvalStatus), { approvalStatus: 'Pending' }]
        });

        res.json({
            data: tasks,
            pendingCount,
            pagination: { totalRecords, totalPages: Math.ceil(totalRecords / limit) || 1, currentPage: page, limit }
        });
    } catch (err) {
        console.error('Self-Assigned List Error:', err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 4. MANAGEMENT LIST (assigned by me / everything)
// ==========================================
router.get('/managed', auth, async (req, res) => {
    try {
        if (!CAN_ASSIGN.includes(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const andConditions = [{ isArchived: false }];

        // Admin/HR see everything; everyone else sees what they created.
        // A Team Lead sees their own team's work whoever assigned it; a Manager
        // sees what they handed out. Admin/HR see everything.
        const visibility = await getTaskVisibilityFilter(req.user);
        if (visibility) {
            andConditions.push(visibility);
        } else if (req.query.assignedBy && req.query.assignedBy !== 'All') {
            andConditions.push({ assignedBy: req.query.assignedBy });
        }

        if (req.query.status && req.query.status !== 'All') {
            andConditions.push({ status: req.query.status });
        }
        if (req.query.priority && req.query.priority !== 'All') {
            andConditions.push({ priority: req.query.priority });
        }
        if (req.query.projectId && req.query.projectId !== 'All') {
            andConditions.push({ projectId: req.query.projectId });
        }
        if (req.query.taskType && req.query.taskType !== 'All') {
            andConditions.push({ taskType: req.query.taskType });
        }
        if (req.query.assigneeId && req.query.assigneeId !== 'All') {
            andConditions.push({ assignees: req.query.assigneeId });
        }
        // The Normal Tasks tab lists one-off work only; days generated by a
        // recurring schedule are reached through the schedule itself. Opt-in, so
        // any other caller of /managed keeps seeing everything.
        if (req.query.excludeRecurring === 'true') {
            andConditions.push({ recurringTaskId: null });
        }
        // Pending and rejected requests belong to the Self-Assigned tab. Once
        // approved a self-assigned task is an ordinary task and shows up here
        // like any other.
        //
        // Written as $nin rather than `{ approvalStatus: 'Approved' }` because a
        // schema default only applies when a document is *written*: every task
        // created before this field existed has no approvalStatus at all, and an
        // equality match would hide every one of them. $nin matches a missing
        // field, so untouched historical tasks keep showing.
        andConditions.push({ approvalStatus: { $nin: ['Pending', 'Rejected'] } });
        if (req.query.overdue === 'true') {
            andConditions.push({ overdueAt: { $lt: new Date() } });
            andConditions.push({ status: { $ne: 'Completed' } });
        }
        // Today/Yesterday/Week/Month/All/Custom, on the day the task belongs to.
        // Stacks with every filter above rather than replacing them.
        const dateFilter = buildTaskDateFilter(req.query.filterType, req.query.fromDate, req.query.toDate);
        if (dateFilter) andConditions.push(dateFilter);
        // Matches the title, the people on it, whoever assigned it, the project
        // and the task type — everything the row actually displays.
        const searchFilter = await buildTaskSearchFilter(req.query.search);
        if (searchFilter) andConditions.push(searchFilter);

        const query = { $and: andConditions };

        const totalRecords = await Task.countDocuments(query);
        const tasks = await Task.find(query)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic')
            .populate('approvedBy', 'name profilePic')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            data: tasks,
            pagination: { totalRecords, totalPages: Math.ceil(totalRecords / limit) || 1, currentPage: page, limit }
        });
    } catch (err) {
        console.error('Managed Tasks Error:', err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 4b. ONE EMPLOYEE'S TASKS (for their profile page)
// ==========================================
router.get('/user/:userId', auth, async (req, res) => {
    try {
        // Mirrors who can open an employee profile at all: everyone except
        // plain employees, who may only ever see their own via /my.
        if (req.user.role === 'EMPLOYEE' && req.params.userId !== req.user.id) {
            return res.status(403).json({ message: 'Access Denied' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // 'assigned' = work handed to them, 'created' = work they handed out.
        const scope = req.query.scope === 'created' ? 'created' : 'assigned';
        const scopeFilter = scope === 'created'
            ? { assignedBy: req.params.userId }
            : { assignees: req.params.userId };

        const andConditions = [{ isArchived: false }, scopeFilter];

        if (req.query.status && req.query.status !== 'All') {
            andConditions.push({ status: req.query.status });
        }

        const query = { $and: andConditions };

        const totalRecords = await Task.countDocuments(query);
        const tasks = await Task.find(query)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name employeeId profilePic')
            .sort({ dueDate: 1 })
            .skip(skip)
            .limit(limit);

        // Counts span the whole scope, not just the page, so the summary tiles
        // don't change as you paginate.
        const baseScope = { isArchived: false, ...scopeFilter };
        const [pending, inProgress, onHold, completed, overdue] = await Promise.all([
            Task.countDocuments({ ...baseScope, status: 'Pending' }),
            Task.countDocuments({ ...baseScope, status: 'In Progress' }),
            Task.countDocuments({ ...baseScope, status: 'On Hold' }),
            Task.countDocuments({ ...baseScope, status: 'Completed' }),
            Task.countDocuments({ ...baseScope, status: { $ne: 'Completed' }, overdueAt: { $lt: new Date() } })
        ]);

        res.json({
            data: tasks,
            pagination: { totalRecords, totalPages: Math.ceil(totalRecords / limit) || 1, currentPage: page, limit },
            stats: { pending, inProgress, onHold, completed, overdue, total: pending + inProgress + onHold + completed }
        });
    } catch (err) {
        console.error('User Tasks Error:', err);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Employee not found' });
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 4c. EMPLOYEE VIEW — who is carrying work and who is free
//
// Flips the management list on its head: instead of tasks with assignees
// hanging off them, it lists people with their workload hanging off them, so an
// idle team member is as visible as a busy one. Scope follows the same rule as
// assignment — Admin/HR/Manager see everyone, a Team Lead sees only their team.
// Within that scope the counts cover *all* of an employee's live tasks, not
// just the ones the viewer handed out, otherwise "who is free" would be wrong
// the moment somebody else assigned them something.
// ==========================================
router.get('/by-employee', auth, async (req, res) => {
    try {
        if (!CAN_ASSIGN.includes(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const emptyResult = {
            data: [],
            pagination: { totalRecords: 0, totalPages: 1, currentPage: page, limit },
            // Same shape the populated response returns, so an empty scope
            // renders zeroed tiles rather than blank ones.
            summary: {
                totalEmployees: 0, outstandingToday: 0, doneToday: 0,
                noTaskToday: 0, noTaskAtAll: 0, overdue: 0
            }
        };

        const scopeFilter = await getScopedEmployeeFilter(req.user);
        if (!scopeFilter) return res.json(emptyResult);

        if (req.query.search) {
            // Escaped: an unescaped "(" or "+" here is a 500, not a no-match.
            const searchRegex = new RegExp(escapeRegex(req.query.search), 'i');
            scopeFilter.$or = [
                { name: searchRegex },
                { employeeId: searchRegex },
                { jobTitle: searchRegex },
                { department: searchRegex }
            ];
        }

        const employees = await User.find(scopeFilter)
            // shiftType and joiningDate feed the absence check below — each
            // shift is judged against its own start time, and someone who has
            // not joined yet is not expected in.
            .select('name email role employeeId jobTitle department profilePic shiftType joiningDate')
            .sort({ name: 1 })
            .lean();

        if (employees.length === 0) return res.json(emptyResult);

        const empIds = employees.map(e => e._id);
        const now = new Date();

        // Today, IST, as the same [start, nextDayStart) UTC bracket dueDate
        // values are actually stored in — see the note on computeOverdueAt for
        // why a bare due-date string always lands at UTC midnight regardless
        // of server timezone, which makes this bracket exact rather than
        // approximate.
        const todayStr = todayIST();
        const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
        const tomorrowStart = new Date(`${addDays(todayStr, 1)}T00:00:00.000Z`);

        // completedAt is a real instant, not a date-only value, so "finished
        // today" needs the actual IST midnight boundaries rather than the
        // UTC-midnight bracket dueDate lives in. Mixing the two would count
        // work finished between 00:00 and 05:30 IST against yesterday.
        const istDayStart = istWallClockToUTC(todayStr, 0, 0);
        const istDayEnd = istWallClockToUTC(addDays(todayStr, 1), 0, 0);

        // One pass over the team's live tasks. A task shared by three people
        // counts once against each of them — that is the workload they feel.
        // A self-assigned task nobody has approved yet isn't real work yet
        // either, so it's excluded the same way the Regular Tasks list already
        // excludes it — see the $nin comment there for why $nin rather than an
        // equality match.
        const counts = await Task.aggregate([
            {
                $match: {
                    isArchived: false,
                    assignees: { $in: empIds },
                    // Only Rejected work is excluded here, not Pending.
                    //
                    // This board answers "is this person occupied today", and
                    // approval decides whether self-assigned work is
                    // *credited*, not whether it is being *done* — somebody
                    // who has moved an unapproved task to In Progress is
                    // demonstrably working, and reporting them idle was wrong.
                    // The awaitingApproval counter below keeps the backlog
                    // visible instead of hiding it, which is what excluding
                    // these was really achieving.
                    approvalStatus: { $ne: 'Rejected' }
                }
            },
            { $unwind: '$assignees' },
            { $match: { assignees: { $in: empIds } } },
            {
                $group: {
                    _id: '$assignees',
                    total: { $sum: 1 },
                    pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
                    inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
                    onHold: { $sum: { $cond: [{ $eq: ['$status', 'On Hold'] }, 1, 0] } },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
                    overdue: {
                        $sum: {
                            $cond: [
                                { $and: [{ $ne: ['$status', 'Completed'] }, { $lt: ['$overdueAt', now] }] },
                                1, 0
                            ]
                        }
                    },
                    dueToday: {
                        $sum: {
                            $cond: [
                                { $and: [{ $gte: ['$dueDate', todayStart] }, { $lt: ['$dueDate', tomorrowStart] }] },
                                1, 0
                            ]
                        }
                    },

                    /**
                     * The two halves of "has work today".
                     *
                     * Open work counts as today's in exactly three cases:
                     *
                     *   1. it is due today;
                     *   2. it is already overdue, so it is still owed;
                     *   3. it is mid-flight — explicitly started on or before
                     *      today, and due later.
                     *
                     * Case 3 is why this is not a due-date-only rule: somebody
                     * three days into a five-day task is working today, and a
                     * due-date test alone reports them as idle.
                     *
                     * It requires an *explicit* startDate rather than treating
                     * a missing one as "already started". Without that guard a
                     * task assigned today and due next month counts as today's
                     * work, which would put half the company in the busy
                     * bucket for work nobody expects this week.
                     */
                    openToday: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ['$status', 'Completed'] },
                                        {
                                            $or: [
                                                // due today, or overdue and still owed
                                                { $lt: ['$dueDate', tomorrowStart] },
                                                // started, not yet due
                                                {
                                                    $and: [
                                                        { $ne: [{ $ifNull: ['$startDate', null] }, null] },
                                                        { $lt: ['$startDate', tomorrowStart] }
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                },
                                1, 0
                            ]
                        }
                    },

                    // Self-assigned work nobody has ruled on yet. Counted as
                    // real work above, and surfaced separately so a manager
                    // can see there is something waiting on them.
                    awaitingApproval: {
                        $sum: { $cond: [{ $eq: ['$approvalStatus', 'Pending'] }, 1, 0] }
                    },

                    // Finished today. Kept separate from openToday so someone
                    // who cleared their plate early reads as "done today"
                    // rather than being hidden among people who never had
                    // anything.
                    doneToday: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$status', 'Completed'] },
                                        { $gte: ['$completedAt', istDayStart] },
                                        { $lt: ['$completedAt', istDayEnd] }
                                    ]
                                },
                                1, 0
                            ]
                        }
                    }
                }
            }
        ]);

        const countsById = new Map(counts.map(c => [c._id.toString(), c]));
        const NO_TASKS = {
            total: 0, pending: 0, inProgress: 0, onHold: 0, completed: 0,
            overdue: 0, dueToday: 0, openToday: 0, doneToday: 0,
            awaitingApproval: 0
        };

        /**
         * Which of the four buckets this person is in today.
         *
         * Ordered, and every employee lands in exactly one, so the tiles are a
         * breakdown that sums to the roster rather than a set of overlapping
         * flags. The previous tiles counted *records* — a person whose tasks
         * were all completed still read as "has tasks" — which is what made
         * the numbers describe history instead of today.
         */
        const bucketOf = (c) => {
            if (c.total === 0) return 'none-ever';
            if (c.openToday > 0) return 'today-open';
            if (c.doneToday > 0) return 'today-done';
            return 'today-none';
        };

        // Who isn't in today. Only the "no task at all" tile acts on this —
        // a roster of people who were never going to be here today made that
        // list unreadable, since somebody on leave has no tasks for exactly
        // the reason you'd expect and needs no chasing.
        const absentToday = await getAbsentToday(employees);

        let rows = employees.map(emp => {
            const c = countsById.get(emp._id.toString());
            const counts = c ? {
                total: c.total, pending: c.pending, inProgress: c.inProgress,
                onHold: c.onHold, completed: c.completed, overdue: c.overdue,
                dueToday: c.dueToday, openToday: c.openToday, doneToday: c.doneToday,
                awaitingApproval: c.awaitingApproval
            } : { ...NO_TASKS };

            const absenceReason = absentToday.get(emp._id.toString()) || null;

            return {
                ...emp,
                counts,
                bucket: bucketOf(counts),
                // Reported rather than acted on here: the board decides what
                // to do with it, and every other bucket still shows everyone.
                absentToday: Boolean(absenceReason),
                absenceReason,
                // Open work overall, which is what "how loaded is this person"
                // means — completed tasks are history, not load.
                openCount: counts.total - counts.completed
            };
        });

        // Tiles describe the whole (searched) scope, so they don't shift as the
        // workload filter narrows the list below them.
        const summary = {
            totalEmployees: rows.length,
            outstandingToday: rows.filter(r => r.bucket === 'today-open').length,
            doneToday: rows.filter(r => r.bucket === 'today-done').length,
            noTaskToday: rows.filter(r => r.bucket === 'today-none').length,
            // The actionable number: people with nothing assigned who are
            // actually in today. Someone on leave with an empty plate is not
            // a gap to fill, and counting them made this tile useless.
            noTaskAtAll: rows.filter(r => r.bucket === 'none-ever' && !r.absentToday).length,
            // Kept alongside rather than folded in, so the board can say how
            // many it set aside instead of silently dropping them.
            noTaskAtAllAbsent: rows.filter(r => r.bucket === 'none-ever' && r.absentToday).length,
            // Cross-cutting, so this deliberately overlaps the buckets above
            // and is surfaced as a toggle rather than a further tile.
            //
            // Awaiting-approval work has no counterpart here on purpose: it is
            // just another state the work can be in, shown as a badge on the
            // card beside Pending and In Progress. It never changes which
            // bucket somebody is in, so a tile for it would only be a second
            // way to ask a question the badges already answer.
            overdue: rows.filter(r => r.counts.overdue > 0).length
        };

        if (['today-open', 'today-done', 'today-none', 'none-ever'].includes(req.query.workload)) {
            rows = rows.filter(r => r.bucket === req.query.workload);
            // Matches the summary tile above: "no task at all" means the
            // people who are here and have nothing to do.
            if (req.query.workload === 'none-ever') rows = rows.filter(r => !r.absentToday);
        }

        // Independent of the bucket, so "who has work today AND is overdue" is
        // answerable — the old flat filter list could not express it.
        if (req.query.overdueOnly === 'true') {
            rows = rows.filter(r => r.counts.overdue > 0);
        }


        if (req.query.sort === 'busiest') rows.sort((a, b) => b.openCount - a.openCount);
        else if (req.query.sort === 'freest') rows.sort((a, b) => a.openCount - b.openCount);

        const totalRecords = rows.length;
        const pageRows = rows.slice(skip, skip + limit);
        const pageIds = pageRows.map(r => r._id);

        // Only the visible page's tasks get loaded, so the payload stays flat
        // however big the company gets.
        const tasks = pageIds.length === 0 ? [] : await Task.find({
            isArchived: false,
            assignees: { $in: pageIds },
            // Matches the aggregate above, or a card would disagree with the
            // counts on its own header.
            approvalStatus: { $ne: 'Rejected' }
        })
            .select('title status priority startDate dueDate startTime dueTime expectedStartAt overdueAt completedAt createdAt taskType projectId assignedBy assignees attachments approvalStatus isSelfAssigned')
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .lean();

        const tasksByEmp = new Map(pageIds.map(id => [id.toString(), []]));
        tasks.forEach(task => {
            const trimmed = {
                _id: task._id,
                title: task.title,
                status: task.status,
                priority: task.priority,
                // createdAt is the moment it was handed over; startDate is when
                // the work is meant to begin. The board shows both.
                assignedAt: task.createdAt,
                startDate: task.startDate,
                dueDate: task.dueDate,
                startTime: task.startTime,
                dueTime: task.dueTime,
                expectedStartAt: task.expectedStartAt,
                overdueAt: task.overdueAt,
                taskType: task.taskType,
                projectId: task.projectId,
                assignedBy: task.assignedBy,
                shareCount: (task.assignees || []).length,
                attachmentCount: (task.attachments || []).length,
                isSelfAssigned: Boolean(task.isSelfAssigned),
                awaitingApproval: task.approvalStatus === 'Pending',
                // Same rule the openToday/doneToday counters use, so a card
                // can never disagree with the tile that led you to it.
                isToday: task.status === 'Completed'
                    ? Boolean(task.completedAt && task.completedAt >= istDayStart && task.completedAt < istDayEnd)
                    : task.dueDate < tomorrowStart ||
                      Boolean(task.startDate && task.startDate < tomorrowStart)
            };
            (task.assignees || []).forEach(a => {
                const bucket = tasksByEmp.get(a.toString());
                if (bucket) bucket.push(trimmed);
            });
        });

        // Today first, then live work, then soonest due — the order you
        // triage in, on a board whose whole question is "what about today".
        const byUrgency = (a, b) => {
            if (a.isToday !== b.isToday) return a.isToday ? -1 : 1;
            const aDone = a.status === 'Completed' ? 1 : 0;
            const bDone = b.status === 'Completed' ? 1 : 0;
            if (aDone !== bDone) return aDone - bDone;
            return new Date(a.dueDate) - new Date(b.dueDate);
        };

        const data = pageRows.map(row => ({
            ...row,
            tasks: (tasksByEmp.get(row._id.toString()) || []).sort(byUrgency)
        }));

        res.json({
            data,
            pagination: { totalRecords, totalPages: Math.ceil(totalRecords / limit) || 1, currentPage: page, limit },
            summary
        });
    } catch (err) {
        console.error('Tasks By Employee Error:', err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 4d. CALENDAR — company/team-wide due-date view (Task Report)
//
// Same scoping as /by-employee (getScopedEmployeeFilter: everyone for
// Admin/HR/Manager, own team for a Team Lead) rather than
// getTaskVisibilityFilter — this answers "who has what due when" across the
// scope, not "what did I personally hand out", the same distinction that
// route already draws.
// ==========================================
router.get('/calendar', auth, async (req, res) => {
    try {
        if (!CAN_ASSIGN.includes(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        // 'YYYY-MM'. A missing/malformed param falls back to the current IST
        // month rather than 400ing — the client always sends one anyway.
        const monthParam = /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : todayIST().slice(0, 7);
        const [y, m] = monthParam.split('-').map(Number);
        // Plain UTC month boundaries, deliberately not IST-shifted — dueDate
        // is itself always UTC-midnight-of-its-calendar-day (see the note on
        // computeOverdueAt), so this brackets the same calendar days dueDate
        // already anchors to, on any server timezone.
        const monthStart = new Date(Date.UTC(y, m - 1, 1));
        const nextMonthStart = new Date(Date.UTC(y, m, 1));

        const todayStr = todayIST();
        const emptyResult = {
            month: monthParam,
            tasks: [],
            todayIdle: { date: todayStr, count: 0, employees: [] }
        };

        const scopeFilter = await getScopedEmployeeFilter(req.user);
        if (!scopeFilter) return res.json(emptyResult);

        const employees = await User.find(scopeFilter).select('name profilePic').lean();
        if (employees.length === 0) return res.json(emptyResult);
        const empIds = employees.map(e => e._id);

        // Rejected work is not work; work awaiting a decision still is. This
        // matches /by-employee deliberately — the two halves of the Task
        // Report must not disagree about whether the same person is busy
        // today, which they would if one counted pending self-assigned work
        // and the other did not.
        const notRejected = { approvalStatus: { $ne: 'Rejected' } };

        const tasks = await Task.find({
            isArchived: false,
            assignees: { $in: empIds },
            ...notRejected,
            dueDate: { $gte: monthStart, $lt: nextMonthStart }
        })
            .select('title status priority dueDate overdueAt taskType isSelfAssigned recurringTaskId assignees')
            .populate('assignees', 'name profilePic')
            .sort({ dueDate: 1 })
            .lean();

        // "Nothing due today" doesn't depend on which month is on screen, so
        // it's computed independently of the range above.
        const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
        const tomorrowStart = new Date(`${addDays(todayStr, 1)}T00:00:00.000Z`);
        const dueTodayTasks = await Task.find({
            isArchived: false,
            assignees: { $in: empIds },
            ...notRejected,
            dueDate: { $gte: todayStart, $lt: tomorrowStart }
        }).select('assignees').lean();
        const busyTodayIds = new Set(dueTodayTasks.flatMap(t => t.assignees.map(String)));
        const idleEmployees = employees.filter(e => !busyTodayIds.has(e._id.toString()));

        res.json({
            month: monthParam,
            tasks: tasks.map(t => ({
                _id: t._id,
                title: t.title,
                status: t.status,
                priority: t.priority,
                dueDate: t.dueDate,
                overdueAt: t.overdueAt,
                taskType: t.taskType,
                // What the mockup called "type" — derived, not stored; see
                // TaskCountdown-adjacent code for the same pattern elsewhere.
                assignmentType: t.recurringTaskId ? 'Recurring' : t.isSelfAssigned ? 'Self-Assigned' : 'Regular',
                assignees: t.assignees
            })),
            todayIdle: { date: todayStr, count: idleEmployees.length, employees: idleEmployees }
        });
    } catch (err) {
        console.error('Task Calendar Error:', err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 4b. NUDGES — "someone is waiting on this"
// ==========================================

// Where the app lives, for the link inside a WhatsApp message. Same derivation
// the leave magic-links already use, with an override for local development
// where the React dev server is on a different port from the API.
const appUrlFor = (req) => process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;

/**
 * The nudge history on one task — who pinged whom, when, and how often.
 *
 * `byRecipient` is what the UI actually leads with: a task chased five times
 * reads differently from one never chased, and that should not require
 * counting rows by eye.
 */
router.get('/:id/nudges', auth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id).select('assignees assignedBy title');
        if (!task) return res.status(404).json({ message: 'Task not found' });

        if (!(await canNudgeOn(task, req.user))) {
            return res.status(403).json({ message: 'Unauthorized to view this task' });
        }

        const nudges = await Nudge.find({ taskId: task._id, ownerModel: 'Task' })
            .populate('nudgedBy', 'name profilePic')
            .populate('recipient', 'name profilePic')
            .sort({ createdAt: -1 })
            .limit(50);

        // Per-assignee tallies, so the panel can say "Harshit: 3" rather than
        // making the reader group the list themselves.
        const byRecipient = {};
        for (const n of nudges) {
            const id = String(n.recipient?._id || n.recipient);
            byRecipient[id] = (byRecipient[id] || 0) + 1;
        }

        /**
         * Who *this* user cannot nudge yet, and until when.
         *
         * Sent up front so the UI can grey the button and the person out with
         * the time remaining, rather than letting someone compose a nudge and
         * only discover the cooldown from a 429 after pressing send.
         *
         * Scoped to the requesting user because the cooldown is per sender —
         * a Team Lead being blocked says nothing about whether the Admin is.
         *
         * Its own query rather than a scan of `nudges` above: that list is
         * capped at 50 and ordered by recency across *all* senders, so on a
         * busy task this user's last nudge to someone may not appear in it.
         *
         * `until` is the authoritative field. The client counts down from it,
         * so the number stays right without refetching.
         */
        const cooldownSince = new Date(Date.now() - NUDGE_COOLDOWN_MINUTES * 60 * 1000);
        const mine = await Nudge.find({
            taskId: task._id,
            ownerModel: 'Task',
            nudgedBy: req.user.id,
            createdAt: { $gte: cooldownSince }
        }).select('recipient createdAt').sort({ createdAt: -1 });

        const cooldowns = {};
        for (const n of mine) {
            const rid = String(n.recipient);
            // Sorted newest-first, so the first hit per recipient is the one
            // that matters; later rows are older and would expire sooner.
            if (cooldowns[rid]) continue;
            cooldowns[rid] = {
                until: new Date(n.createdAt.getTime() + NUDGE_COOLDOWN_MINUTES * 60 * 1000).toISOString()
            };
        }

        res.json({
            data: nudges,
            total: nudges.length,
            byRecipient,
            cooldowns,
            cooldownMinutes: NUDGE_COOLDOWN_MINUTES
        });
    } catch (err) {
        console.error('Task Nudges Error:', err);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Task not found' });
        res.status(500).send('Server Error');
    }
});

/**
 * Send a nudge.
 *
 * One document per recipient, dispatched independently — see models/Nudge.js
 * for why. A recipient who is on cooldown is reported back in `skipped` rather
 * than failing the whole request, so nudging a pair where you have just chased
 * one of them still reaches the other.
 */
router.post('/:id/nudge', auth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id)
            .select('assignees assignedBy title dueDate dueTime status');
        if (!task) return res.status(404).json({ message: 'Task not found' });

        if (!(await canNudgeOn(task, req.user))) {
            return res.status(403).json({ message: 'You do not have access to this task' });
        }

        // Nothing to chase on finished work.
        if (task.status === 'Completed') {
            return res.status(400).json({ message: 'This task is already completed' });
        }

        // Default to everyone on the task except whoever is asking — an
        // assignee nudging their own co-assignees is legitimate, nudging
        // themselves is not.
        const requested = parseIdList(req.body.recipientIds);
        const assigneeIds = task.assignees.map(a => a.toString());
        const targets = (requested.length > 0 ? requested : assigneeIds)
            .filter(id => id !== req.user.id);

        const outsiders = targets.filter(id => !assigneeIds.includes(id));
        if (outsiders.length > 0) {
            return res.status(400).json({ message: 'You can only nudge people working on this task' });
        }
        if (targets.length === 0) {
            return res.status(400).json({ message: 'There is nobody on this task to nudge' });
        }

        // In-app is not optional — it is the record inside the product, and the
        // thing the per-task count counts. WhatsApp is the sender's choice on
        // top of it.
        const picked = Array.isArray(req.body.channels)
            ? req.body.channels
            : String(req.body.channels || '').split(',');
        const channels = ['inApp', ...picked
            .map(c => String(c).trim())
            .filter(c => c === 'whatsapp')];

        const sender = await User.findById(req.user.id).select('name');
        const appUrl = appUrlFor(req);
        const cooldownSince = new Date(Date.now() - NUDGE_COOLDOWN_MINUTES * 60 * 1000);

        const sent = [];
        const skipped = [];

        /**
         * Recipients are handled in parallel rather than one after another.
         *
         * Each is an independent set of round trips to a *remote* database, so
         * running them in sequence made nudging three people cost three times
         * one person for no reason — they share nothing and cannot conflict,
         * since a person appears at most once in `targets`.
         */
        const results = await Promise.all(targets.map(async (recipientId) => {
            const [recipient, recent] = await Promise.all([
                User.findById(recipientId)
                    .select('name phoneNumber whatsappNumber whatsappNotificationsEnabled'),
                // Purely time-based: a nudge expects no reply, so there is no
                // "still waiting on an answer" state to gate on. Chasing the
                // same person about the same task twice inside the window is
                // pestering.
                Nudge.findOne({
                    taskId: task._id,
                    ownerModel: 'Task',
                    nudgedBy: req.user.id,
                    recipient: recipientId,
                    createdAt: { $gte: cooldownSince }
                }).select('createdAt').sort({ createdAt: -1 })
            ]);

            if (!recipient) {
                return { skipped: { recipientId, reason: 'Employee not found' } };
            }

            if (recent) {
                const mins = Math.max(1, NUDGE_COOLDOWN_MINUTES -
                    Math.floor((Date.now() - recent.createdAt.getTime()) / 60000));
                return {
                    skipped: {
                        recipientId,
                        name: recipient.name,
                        reason: `Already nudged recently. You can nudge again in ${mins} min.`
                    }
                };
            }

            const nudge = await Nudge.create({
                ownerModel: 'Task',
                taskId: task._id,
                nudgedBy: req.user.id,
                recipient: recipientId,
                channels
            });

            const dispatched = await dispatchNudge({ nudge, doc: task, sender, recipient });
            return { dispatched, recipient, nudgeId: nudge._id };
        }));

        for (const r of results) {
            if (r.skipped) skipped.push(r.skipped);
            else sent.push(r.dispatched);
        }

        /**
         * WhatsApp goes out *after* the response, deliberately unawaited.
         *
         * A send runs through OpenWA's headless Chromium and its anti-ban typing
         * delay — seconds, not milliseconds — and nothing the sender does next
         * depends on the result. Blocking the button on it made a nudge feel
         * broken. The outcome lands on the delivery row and is pushed over the
         * socket, so a failure still surfaces on the task panel.
         *
         * `.catch` is not optional here: an unawaited rejection would be an
         * unhandled promise rejection, which takes the process down on Node 15+.
         */
        if (channels.includes('whatsapp')) {
            for (const r of results) {
                if (!r.dispatched) continue;
                deliverWhatsApp({
                    nudgeId: r.nudgeId,
                    doc: task,
                    sender,
                    recipient: r.recipient,
                    appUrl
                }).catch(err => console.error('[NUDGE] background send failed:', err.message));
            }
        }

        if (sent.length === 0) {
            // 429 only when the reason really was "you have already nudged" —
            // a missing employee is a bad request, not rate limiting, and
            // reporting it as one would send the client into a pointless wait.
            const allCooldown = skipped.every(s => s.reason.includes('Already nudged'));
            return res.status(allCooldown ? 429 : 400).json({
                message: skipped[0]?.reason || 'Nothing was sent',
                sent, skipped
            });
        }

        res.status(201).json({ sent, skipped });
    } catch (err) {
        console.error('Nudge Send Error:', err);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Task not found' });
        res.status(500).json({ message: 'Server Error while sending the nudge' });
    }
});


// ==========================================
// 5. SINGLE TASK
// ==========================================
router.get('/:id', auth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name email profilePic')
            .populate('assignees', 'name email employeeId profilePic')
            .populate('statusUpdatedBy', 'name profilePic')
            .populate('completionProof.uploadedBy', 'name profilePic')
            // Who signed the request off, so the task page can say so plainly.
            .populate('approvedBy', 'name profilePic')
            // A generated task carries no brief of its own — it points back at
            // the schedule's (TaskPlan.md 13.7). Null for ordinary tasks.
            .populate('recurringTaskId', 'title targetCount attachments occurrences');

        if (!task) return res.status(404).json({ message: 'Task not found' });

        const isAssignee = task.assignees.some(a => a && a._id.toString() === req.user.id);
        const isOwner = task.assignedBy._id.toString() === req.user.id;

        let allowed = isAssignee || isOwner || IS_PRIVILEGED.includes(req.user.role);

        // Neither assignee nor owner and not privileged doesn't rule out a Team
        // Lead looking at their own team's work — getTaskVisibilityFilter is
        // what /managed and /my already use for that; this checks the one task
        // already loaded against the same rule instead of duplicating it.
        if (!allowed) {
            const visibility = await getTaskVisibilityFilter(req.user);
            if (visibility) {
                allowed = Boolean(await Task.exists({ _id: task._id, ...visibility }));
            }
        }

        if (!allowed) {
            return res.status(403).json({ message: 'Unauthorized to view this task' });
        }

        const payload = task.toObject();

        // "Day 3 of 10" — this person's position in their own run, counting only
        // days that actually produced a task. Skipped days are not day numbers.
        if (task.recurringTaskId) {
            const mine = (task.recurringTaskId.occurrences || [])
                .filter(o => o.result === 'generated' &&
                    task.assignees.some(a => a && a._id.toString() === o.assignee.toString()))
                .sort((a, b) => a.date.localeCompare(b.date));

            const index = mine.findIndex(o => o.date === task.occurrenceDate);
            payload.recurringDayNumber = index === -1 ? mine.length : index + 1;

            // The log is only needed to work that number out; sending every
            // occurrence to render one badge is wasteful.
            delete payload.recurringTaskId.occurrences;
        }

        res.json(payload);
    } catch (err) {
        console.error('Task Fetch Error:', err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Task not found' });
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 6. EDIT TASK (shared fields + assignee list)
// ==========================================
router.put('/:id', auth, taskUpload.array('attachments', 10), async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) {
            discardStagedFiles(req.files);
            return res.status(404).json({ message: 'Task not found' });
        }

        const isOwner = task.assignedBy.toString() === req.user.id;
        let allowed = isOwner || IS_PRIVILEGED.includes(req.user.role);

        // Same reasoning as the delete route: on a self-assigned task
        // `assignedBy` is whoever the employee *named*, not necessarily anyone
        // with authority over it. Whoever can approve it can also correct it.
        if (!allowed && task.isSelfAssigned) {
            allowed = await canApproveFor(task.assignees[0], req.user);
        }

        if (!allowed) {
            discardStagedFiles(req.files);
            return res.status(403).json({ message: 'Only the assigner can edit this task' });
        }

        const { title, description, priority, startDate, dueDate, projectId } = req.body;

        if (title) task.title = title;
        if (description !== undefined) task.description = description;
        if (priority) task.priority = priority;
        if (startDate !== undefined) task.startDate = startDate || null;

        const dueDateChanged = dueDate && new Date(dueDate).getTime() !== new Date(task.dueDate).getTime();
        if (dueDate) task.dueDate = dueDate;
        if (req.body.startTime !== undefined || req.body.dueTime !== undefined || req.body.timeAllottedMinutes !== undefined) {
            Object.assign(task, parseTimeWindow(req.body));
        }
        // Only when the field is actually sent — an older client that omits
        // it must not silently switch the requirement off on an existing task.
        if (req.body.requiresAttachment !== undefined) {
            task.requiresAttachment = parseBool(req.body.requiresAttachment);
        }

        // Switching type clears or requires the project accordingly.
        if (req.body.taskType && TASK_TYPES.includes(req.body.taskType)) {
            task.taskType = req.body.taskType;
        }

        if (task.taskType === 'Regular Office Task') {
            task.projectId = null;
        } else if (projectId && projectId !== task.projectId?.toString()) {
            const allowedProjects = await getScopedProjects();
            if (!allowedProjects.find(p => p._id.toString() === projectId)) {
                discardStagedFiles(req.files);
                return res.status(400).json({ message: 'That project is not available. It may have been completed or put on hold.' });
            }
            task.projectId = projectId;
        } else if (!task.projectId) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Pick a project, or switch this to a Regular Office task' });
        }

        // Drop attachments the client removed, keeping the rest.
        if (req.body.keepAttachmentIds !== undefined) {
            const keepIds = new Set(parseIdList(req.body.keepAttachmentIds));
            task.attachments = task.attachments.filter(a => keepIds.has(a._id.toString()));
        }

        // Reconcile the assignee list.
        let addedIds = [];
        if (req.body.assigneeIds !== undefined) {
            const nextIds = parseIdList(req.body.assigneeIds);
            if (nextIds.length === 0) {
                discardStagedFiles(req.files);
                return res.status(400).json({ message: 'A task must have at least one assignee' });
            }

            const allowedEmployees = await getScopedEmployees(req.user);
            const allowedIds = new Set(allowedEmployees.map(e => e._id.toString()));
            const existingIds = new Set(task.assignees.map(a => a.toString()));

            // Only *newly added* people need to pass the scope check — an
            // existing assignee who has since moved teams should not block a
            // simple title edit.
            const invalid = nextIds.filter(id => !existingIds.has(id) && !allowedIds.has(id));
            if (invalid.length > 0) {
                discardStagedFiles(req.files);
                return res.status(403).json({ message: 'One or more selected employees are outside your team' });
            }

            addedIds = nextIds.filter(id => !existingIds.has(id));
            task.assignees = nextIds;
        }

        const project = task.projectId ? await Project.findById(task.projectId).select('name') : null;
        const { media, pendingVideos } = await processTaskFiles(req.files, folderForTask(task.taskType, project?.name));
        media.forEach(m => task.attachments.push(m));

        await task.save();

        if (pendingVideos.length > 0) {
            await VideoCompressionQueue.insertMany(pendingVideos.map(v => ({
                taskId: task._id,
                mediaId: v.mediaId,
                field: 'attachments',
                localPath: v.localPath,
                originalName: v.originalName,
                projectName: project?.name || 'Office'
            })));
        }

        // Newly added people join the project's group the same way they would
        // have on creation.
        if (addedIds.length > 0 && task.projectId) {
            syncProjectGroupMembers(task.projectId, addedIds, req.user.id);
        }

        // Newly added people always get told; everyone gets told if the
        // deadline moved.
        await Promise.all(addedIds.map(id => notify(
            id,
            'New Task Assigned',
            `You have been added to "${task.title}" (due ${new Date(task.dueDate).toLocaleDateString('en-GB')}).`,
            `/task/${task._id}`
        )));

        if (dueDateChanged) {
            const unchangedAssignees = task.assignees
                .map(a => a.toString())
                .filter(id => !addedIds.includes(id));
            await Promise.all(unchangedAssignees.map(id => notify(
                id,
                'Task Deadline Updated',
                `The due date for "${task.title}" is now ${new Date(task.dueDate).toLocaleDateString('en-GB')}.`,
                `/task/${task._id}`
            )));
        }

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic');

        res.json(populated);
    } catch (err) {
        discardStagedFiles(req.files);
        console.error('Task Update Error:', err);
        res.status(500).json({ message: 'Server Error while updating task' });
    }
});

// ==========================================
// 7. UPDATE THE TASK STATUS (shared by everyone on it)
// ==========================================
router.put('/:id/status', auth, taskUpload.array('completionProof', 10), async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) {
            discardStagedFiles(req.files);
            return res.status(404).json({ message: 'Task not found' });
        }

        // Only the people doing the work report on it — see isWorkingOnTask.
        if (!isWorkingOnTask(task, req.user)) {
            discardStagedFiles(req.files);
            return res.status(403).json({
                message: 'Only the people assigned to this task can update its status.'
            });
        }

        const { status, statusNote } = req.body;
        if (!TASK_STATUSES.includes(status)) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Invalid status' });
        }

        // The assigner asked for proof, so "Completed" has to come with some.
        // Checked here rather than only in the panel because the panel's
        // control can be bypassed, and counted across what is already on the
        // task *plus* what is arriving in this request — attaching the file
        // and ticking Completed is one action for the user, and splitting it
        // into two round-trips would be the wrong lesson to teach them.
        if (status === 'Completed' &&
            task.requiresAttachment &&
            task.completionProof.length === 0 &&
            (req.files || []).length === 0) {
            discardStagedFiles(req.files);
            return res.status(400).json({
                message: 'This task needs supporting material before it can be marked completed. Attach a file and try again.'
            });
        }

        const previousStatus = task.status;
        const changed = previousStatus !== status;

        task.status = status;
        task.statusUpdatedBy = req.user.id;
        if (statusNote !== undefined) task.statusNote = statusNote;
        task.completedAt = status === 'Completed' ? new Date() : null;

        // The actual timeline (TaskPlan.md §18). Only real transitions are
        // logged — re-saving the same status (which happens whenever proof is
        // attached without moving the task) would otherwise fill the history
        // with entries that mean nothing.
        if (changed) {
            const now = new Date();
            task.statusHistory.push({
                from: previousStatus,
                to: status,
                at: now,
                by: req.user.id,
                note: statusNote || ''
            });

            // Both are first-write-wins: they exist to survive a reopen, so
            // overwriting them on the second pass would defeat the point.
            if (status === 'In Progress' && !task.firstStartedAt) task.firstStartedAt = now;
            if (status === 'Completed' && !task.firstCompletedAt) task.firstCompletedAt = now;

            // A task finished without ever being moved to In Progress still
            // needs a start for duration to be computable at all. Recording
            // the completion instant makes that duration zero rather than
            // silently falling back to createdAt, which would report days of
            // waiting as time worked.
            if (status === 'Completed' && !task.firstStartedAt) task.firstStartedAt = now;
        }

        const project = task.projectId ? await Project.findById(task.projectId).select('name') : null;
        const proofFolder = task.taskType === 'Regular Office Task'
            ? s3Folder('Office', '/Proof')
            : s3Folder(project?.name, '/Proof');
        const { media, pendingVideos } = await processTaskFiles(req.files, proofFolder);
        media.forEach(m => {
            m.uploadedBy = req.user.id;
            task.completionProof.push(m);
        });

        await task.save();

        if (pendingVideos.length > 0) {
            await VideoCompressionQueue.insertMany(pendingVideos.map(v => ({
                taskId: task._id,
                mediaId: v.mediaId,
                field: 'completionProof',
                localPath: v.localPath,
                originalName: v.originalName,
                projectName: project?.name || 'Office'
            })));
        }

        // A task generated by a recurring schedule reports back, so the
        // compliance calendar turns green the moment it is submitted rather
        // than waiting for tomorrow's sweep. Only today's and future days are
        // touched — the sweep has already given past days their final verdict.
        if (changed && task.recurringTaskId) {
            try {
                const RecurringTask = require('../models/RecurringTask');
                const { todayIST } = require('../utils/recurringSchedule');

                if (task.occurrenceDate >= todayIST()) {
                    await RecurringTask.updateOne(
                        {
                            _id: task.recurringTaskId,
                            occurrences: {
                                $elemMatch: { date: task.occurrenceDate, taskId: task._id }
                            }
                        },
                        {
                            $set: {
                                'occurrences.$.outcome': status === 'Completed' ? 'completed' : 'pending'
                            }
                        }
                    );
                }
            } catch (err) {
                // Never fail a status update over its bookkeeping.
                console.error('[TASK] Could not sync recurring occurrence:', err.message);
            }
        }

        // The status is shared, so everyone involved hears about the move —
        // except whoever just made it.
        if (changed) {
            const actor = await User.findById(req.user.id).select('name');
            const recipients = [
                ...task.assignees.map(a => a.toString()),
                task.assignedBy.toString()
            ].filter((id, i, arr) => id !== req.user.id && arr.indexOf(id) === i);

            await Promise.all(recipients.map(id => notify(
                id,
                status === 'Completed' ? 'Task Completed' : 'Task Status Updated',
                `${actor?.name || 'Someone'} moved "${task.title}" from ${previousStatus} to ${status}.`,
                `/task/${task._id}`
            )));
        }

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic')
            .populate('statusUpdatedBy', 'name profilePic');

        res.json(populated);
    } catch (err) {
        discardStagedFiles(req.files);
        console.error('Task Status Error:', err);
        res.status(500).json({ message: 'Server Error while updating status' });
    }
});

// ==========================================
// 7b. REOPEN — send finished work back
// ==========================================
/**
 * The assigner's half of the status split (TaskPlan.md §20).
 *
 * A manager cannot move a task's status — see isWorkingOnTask — but they do
 * own the judgement of whether the work is actually done. This is that
 * judgement: it sends a Completed task back to Pending with a reason the
 * assignee has to read.
 *
 * The reason is mandatory on purpose. "Reopened" on its own tells the person
 * their work was rejected without telling them what to fix, which is the
 * failure mode this exists to prevent.
 *
 * firstCompletedAt is deliberately NOT cleared: it is first-write-wins so
 * that rework stays visible. A task with firstCompletedAt set and a status of
 * Pending is precisely the shape of "this was handed back", and the report
 * layer reads it that way.
 */
router.post('/:id/reopen', auth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        if (!ownsTaskOutcome(task, req.user)) {
            return res.status(403).json({
                message: 'Only the person who assigned this task can send it back.'
            });
        }

        if (task.status !== 'Completed') {
            return res.status(400).json({
                message: 'Only a completed task can be sent back.'
            });
        }

        const note = (req.body.note || '').trim();
        if (!note) {
            return res.status(400).json({
                message: 'Say what still needs doing — the assignee sees this note.'
            });
        }

        const now = new Date();
        const previousStatus = task.status;

        task.status = 'Pending';
        task.completedAt = null;
        task.statusUpdatedBy = req.user.id;
        // Replaces the assignee's "done" note, which is no longer the last
        // word on this task.
        task.statusNote = note;

        task.statusHistory.push({
            from: previousStatus,
            to: 'Pending',
            at: now,
            by: req.user.id,
            note
        });

        await task.save();

        // The compliance calendar has to un-tick this day too, or the schedule
        // still reads as satisfied. Mirrors the sync in PUT /:id/status.
        if (task.recurringTaskId) {
            try {
                const RecurringTask = require('../models/RecurringTask');
                const { todayIST } = require('../utils/recurringSchedule');

                if (task.occurrenceDate >= todayIST()) {
                    await RecurringTask.updateOne(
                        {
                            _id: task.recurringTaskId,
                            occurrences: { $elemMatch: { date: task.occurrenceDate, taskId: task._id } }
                        },
                        { $set: { 'occurrences.$.outcome': 'pending' } }
                    );
                }
            } catch (err) {
                console.error('[TASK] Could not sync reopened occurrence:', err.message);
            }
        }

        const actor = await User.findById(req.user.id).select('name');
        await Promise.all(task.assignees
            .map(a => a.toString())
            .filter(id => id !== req.user.id)
            .map(id => notify(
                id,
                'Task sent back',
                `${actor?.name || 'Your manager'} reopened "${task.title}": ${note}`,
                `/task/${task._id}`
            )));

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic')
            .populate('statusUpdatedBy', 'name profilePic');

        res.json(populated);
    } catch (err) {
        console.error('Task Reopen Error:', err);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Task not found' });
        res.status(500).json({ message: 'Server Error while reopening the task' });
    }
});

// ==========================================
// 8. ARCHIVE
// ==========================================
router.delete('/:id', auth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const isOwner = task.assignedBy.toString() === req.user.id;
        let allowed = isOwner || IS_PRIVILEGED.includes(req.user.role);

        // On a self-assigned task `assignedBy` is whoever the employee *named*,
        // which is not necessarily anyone with authority over it. Whoever can
        // approve the request can also throw it away — otherwise a Team Lead can
        // reject a request from their own team but not remove it.
        if (!allowed && task.isSelfAssigned) {
            allowed = await canApproveFor(task.assignees[0], req.user);
        }

        if (!allowed) {
            return res.status(403).json({ message: 'Only the assigner can remove this task' });
        }

        task.isArchived = true;
        await task.save();
        res.json({ message: 'Task archived successfully' });
    } catch (err) {
        console.error('Task Delete Error:', err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Task not found' });
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 8b. TASK MEDIA — add reference media, remove either kind
// ==========================================

// Reference media is the brief, so it follows edit rights rather than
// "is on the task".
const canEditTask = (task, reqUser) =>
    task.assignedBy.toString() === reqUser.id || IS_PRIVILEGED.includes(reqUser.role);

// POST /api/tasks/:id/media  — add more reference media
router.post('/:id/media', auth, taskUpload.array('attachments', 10), async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) {
            discardStagedFiles(req.files);
            return res.status(404).json({ message: 'Task not found' });
        }
        if (!canEditTask(task, req.user)) {
            discardStagedFiles(req.files);
            return res.status(403).json({ message: 'Only the assigner can add reference media' });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files were uploaded' });
        }

        const project = task.projectId ? await Project.findById(task.projectId).select('name') : null;
        const { media, pendingVideos } = await processTaskFiles(req.files, folderForTask(task.taskType, project?.name));
        media.forEach(m => task.attachments.push(m));
        await task.save();

        if (pendingVideos.length > 0) {
            await VideoCompressionQueue.insertMany(pendingVideos.map(v => ({
                taskId: task._id,
                mediaId: v.mediaId,
                field: 'attachments',
                localPath: v.localPath,
                originalName: v.originalName,
                projectName: project?.name || 'Office'
            })));
        }

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic')
            .populate('statusUpdatedBy', 'name profilePic');

        res.status(201).json(populated);
    } catch (err) {
        discardStagedFiles(req.files);
        console.error('Task Media Add Error:', err);
        res.status(500).json({ message: 'Server Error while adding media' });
    }
});

// DELETE /api/tasks/:id/media/:mediaId  — works for attachments or proof
router.delete('/:id/media/:mediaId', auth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const attachment = task.attachments.id(req.params.mediaId);
        const proof = attachment ? null : task.completionProof.id(req.params.mediaId);
        const item = attachment || proof;
        if (!item) return res.status(404).json({ message: 'Media not found on this task' });

        // The brief belongs to the assigner; proof belongs to whoever submitted
        // it, with the assigner and Admin/HR able to clean up either.
        const allowed = attachment
            ? canEditTask(task, req.user)
            : (item.uploadedBy?.toString() === req.user.id || canEditTask(task, req.user));

        if (!allowed) {
            return res.status(403).json({ message: 'You cannot remove this file' });
        }

        // Drop the underlying file too, so deleting doesn't leave orphans.
        if (item.url.startsWith('http')) {
            await deleteFromS3(item.url);
        } else {
            // Still staged on the VPS: remove the raw file and its queue row so
            // the nightly job doesn't process something no longer referenced.
            const localPath = path.join(__dirname, '..', item.url.replace(/^\//, ''));
            fs.unlink(localPath, (err) => {
                if (err && err.code !== 'ENOENT') console.error('[TASK] Could not remove staged file:', err.message);
            });
            await VideoCompressionQueue.deleteMany({ taskId: task._id, mediaId: item._id });
        }

        item.deleteOne();
        await task.save();

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic')
            .populate('statusUpdatedBy', 'name profilePic');

        res.json(populated);
    } catch (err) {
        console.error('Task Media Delete Error:', err);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Media not found' });
        res.status(500).json({ message: 'Server Error while removing media' });
    }
});

// ==========================================
// 9. DISCUSSION THREAD
// ==========================================
// The handlers are shared with recurring schedules, which have their own
// thread — see utils/taskDiscussion.js.
const taskDiscussion = buildDiscussionHandlers({
    ownerModel: 'Task',
    load: (id) => Task.findById(id).populate('projectId', 'name'),
    link: (task) => `/task/${task._id}`,
    notFound: 'Task not found'
});

router.get('/:id/comments', auth, taskDiscussion.list);
router.post('/:id/comments', auth, taskUpload.array('attachments', 5), taskDiscussion.create);
router.put('/:id/comments/:commentId', auth, taskDiscussion.update);
router.delete('/:id/comments/:commentId', auth, taskDiscussion.remove);

module.exports = router;
