const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const taskUpload = require('../middleware/taskUploadMiddleware');
const { processTaskFiles, discardStagedFiles, s3Folder, isVideo } = require('../utils/taskMedia');

const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const VideoCompressionQueue = require('../models/VideoCompressionQueue');
const TaskComment = require('../models/TaskComment');
const { emitToTask } = require('../utils/realtime');
const { deleteFromS3 } = require('../utils/s3Service');
const fs = require('fs');
const path = require('path');

const CAN_ASSIGN = ['MANAGER', 'TEAM LEAD', 'ADMIN', 'HR'];
// Sees and edits every task, not just their own.
const IS_PRIVILEGED = ['ADMIN', 'HR'];
// May hand work to anyone in the company. Team Leads are deliberately absent —
// they stay scoped to their own team members.
const CAN_ASSIGN_ANYONE = ['ADMIN', 'HR', 'MANAGER'];

// ==========================================
// SCOPING HELPERS
// ==========================================

// Who this user is allowed to hand work to. Managers run work across the whole
// company, so they get everyone; a Team Lead only gets the people who list them
// as their team lead.
const getScopedEmployees = async (reqUser) => {
    if (CAN_ASSIGN_ANYONE.includes(reqUser.role)) {
        return User.find({ status: 'ACTIVE' }).select('name email role employeeId').sort({ name: 1 });
    }

    const me = await User.findById(reqUser.id);
    if (!me) return [];

    return User.find({ status: 'ACTIVE', teamLeadsEmail: me.email.toLowerCase() })
        .select('name email role employeeId')
        .sort({ name: 1 });
};

// Which projects this user may file tasks against. Any Active project is fair
// game for anyone who can assign — Team Leads don't own projects, so limiting
// this to projects you lead would lock the whole role out of the feature.
// The real guardrail is the team scoping above, which limits *who* you can
// hand work to.
const getScopedProjects = async () => {
    return Project.find({ status: 'Active' }).select('name status').sort({ name: 1 });
};

const TASK_STATUSES = ['Pending', 'In Progress', 'On Hold', 'Completed'];
const TASK_TYPES = ['Project Task', 'Regular Office Task'];

// Office work has no project, so its media lands in a shared folder.
const folderForTask = (taskType, projectName) =>
    taskType === 'Regular Office Task' ? s3Folder('Office') : s3Folder(projectName);

// Everyone on a task shares one status, so "who is allowed to move it" is
// simply: anyone working on it, whoever assigned it, or Admin/HR.
const canTouchTask = (task, reqUser) =>
    task.assignees.some(id => id.toString() === reqUser.id) ||
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
            attachments: media,
            assignees: assigneeIds
        });

        await task.save();

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
        const due = new Date(dueDate).toLocaleDateString();
        await Promise.all(assigneeIds.map(id => notify(
            id,
            'New Task Assigned',
            `${assigner?.name || 'Your manager'} assigned you "${title}" (due ${due}).`,
            `/task/${task._id}`
        )));

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name')
            .populate('assignees', 'name email employeeId');

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
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            andConditions.push({ $or: [{ title: searchRegex }, { description: searchRegex }] });
        }

        const query = { $and: andConditions };

        const totalRecords = await Task.countDocuments(query);
        const tasks = await Task.find(query)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name')
            .populate('assignees', 'name email employeeId')
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
            dueDate: { $lt: new Date() }
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
        if (!IS_PRIVILEGED.includes(req.user.role)) {
            andConditions.push({ assignedBy: req.user.id });
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
        if (req.query.overdue === 'true') {
            andConditions.push({ dueDate: { $lt: new Date() } });
            andConditions.push({ status: { $ne: 'Completed' } });
        }
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            andConditions.push({ $or: [{ title: searchRegex }, { description: searchRegex }] });
        }

        const query = { $and: andConditions };

        const totalRecords = await Task.countDocuments(query);
        const tasks = await Task.find(query)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name')
            .populate('assignees', 'name email employeeId')
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
            .populate('assignedBy', 'name')
            .populate('assignees', 'name employeeId')
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
            Task.countDocuments({ ...baseScope, status: { $ne: 'Completed' }, dueDate: { $lt: new Date() } })
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
// 5. SINGLE TASK
// ==========================================
router.get('/:id', auth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name email')
            .populate('assignees', 'name email employeeId')
            .populate('statusUpdatedBy', 'name')
            .populate('completionProof.uploadedBy', 'name');

        if (!task) return res.status(404).json({ message: 'Task not found' });

        const isAssignee = task.assignees.some(a => a && a._id.toString() === req.user.id);
        const isOwner = task.assignedBy._id.toString() === req.user.id;

        if (!isAssignee && !isOwner && !IS_PRIVILEGED.includes(req.user.role)) {
            return res.status(403).json({ message: 'Unauthorized to view this task' });
        }

        res.json(task);
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
        if (!isOwner && !IS_PRIVILEGED.includes(req.user.role)) {
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

        // Newly added people always get told; everyone gets told if the
        // deadline moved.
        await Promise.all(addedIds.map(id => notify(
            id,
            'New Task Assigned',
            `You have been added to "${task.title}" (due ${new Date(task.dueDate).toLocaleDateString()}).`,
            `/task/${task._id}`
        )));

        if (dueDateChanged) {
            const unchangedAssignees = task.assignees
                .map(a => a.toString())
                .filter(id => !addedIds.includes(id));
            await Promise.all(unchangedAssignees.map(id => notify(
                id,
                'Task Deadline Updated',
                `The due date for "${task.title}" is now ${new Date(task.dueDate).toLocaleDateString()}.`,
                `/task/${task._id}`
            )));
        }

        const populated = await Task.findById(task._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name')
            .populate('assignees', 'name email employeeId');

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

        // One shared status, so anyone working on the task can move it.
        if (!canTouchTask(task, req.user)) {
            discardStagedFiles(req.files);
            return res.status(403).json({ message: 'You are not working on this task' });
        }

        const { status, statusNote } = req.body;
        if (!TASK_STATUSES.includes(status)) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Invalid status' });
        }

        const previousStatus = task.status;
        const changed = previousStatus !== status;

        task.status = status;
        task.statusUpdatedBy = req.user.id;
        if (statusNote !== undefined) task.statusNote = statusNote;
        task.completedAt = status === 'Completed' ? new Date() : null;

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
            .populate('assignedBy', 'name')
            .populate('assignees', 'name email employeeId')
            .populate('statusUpdatedBy', 'name');

        res.json(populated);
    } catch (err) {
        discardStagedFiles(req.files);
        console.error('Task Status Error:', err);
        res.status(500).json({ message: 'Server Error while updating status' });
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
        if (!isOwner && !IS_PRIVILEGED.includes(req.user.role)) {
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
            .populate('assignedBy', 'name')
            .populate('assignees', 'name email employeeId')
            .populate('statusUpdatedBy', 'name');

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
            .populate('assignedBy', 'name')
            .populate('assignees', 'name email employeeId')
            .populate('statusUpdatedBy', 'name');

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

// Anyone involved in the task can read and post: the assignees, the person who
// assigned it, and Admin/HR.
const loadTaskForDiscussion = async (taskId, reqUser) => {
    const task = await Task.findById(taskId).populate('projectId', 'name');
    if (!task) return { error: { code: 404, message: 'Task not found' } };

    const isAssignee = task.assignees.some(a => a.toString() === reqUser.id);
    const isOwner = task.assignedBy.toString() === reqUser.id;

    if (!isAssignee && !isOwner && !IS_PRIVILEGED.includes(reqUser.role)) {
        return { error: { code: 403, message: 'Unauthorized to view this discussion' } };
    }
    return { task };
};

// GET /api/tasks/:id/comments
router.get('/:id/comments', auth, async (req, res) => {
    try {
        const { task, error } = await loadTaskForDiscussion(req.params.id, req.user);
        if (error) return res.status(error.code).json({ message: error.message });

        const comments = await TaskComment.find({ taskId: task._id })
            .populate('author', 'name role employeeId')
            .sort({ createdAt: 1 });

        res.json(comments);
    } catch (err) {
        console.error('Task Comments Fetch Error:', err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Task not found' });
        res.status(500).send('Server Error');
    }
});

// POST /api/tasks/:id/comments
router.post('/:id/comments', auth, taskUpload.array('attachments', 5), async (req, res) => {
    try {
        const { task, error } = await loadTaskForDiscussion(req.params.id, req.user);
        if (error) {
            discardStagedFiles(req.files);
            return res.status(error.code).json({ message: error.message });
        }

        const message = (req.body.message || '').trim();
        if (!message && (!req.files || req.files.length === 0)) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Write something or attach an image' });
        }

        // Videos belong in task attachments, where the overnight pipeline can
        // handle them — a discussion image is expected to appear instantly.
        if ((req.files || []).some(f => isVideo(f))) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Only images can be attached to a message. Add videos to the task itself.' });
        }

        const { media } = await processTaskFiles(
            req.files,
            task.taskType === 'Regular Office Task'
                ? s3Folder('Office', '/Discussion')
                : s3Folder(task.projectId?.name, '/Discussion')
        );

        const comment = await TaskComment.create({
            taskId: task._id,
            author: req.user.id,
            message,
            attachments: media.map(m => ({ url: m.url, fileName: m.fileName }))
        });

        // Everyone involved except whoever just spoke.
        const author = await User.findById(req.user.id).select('name');
        const recipients = [
            ...task.assignees.map(a => a.toString()),
            task.assignedBy.toString()
        ].filter((id, i, arr) => id !== req.user.id && arr.indexOf(id) === i);

        const preview = message.length > 80 ? message.slice(0, 80) + '…' : (message || 'shared an image');
        await Promise.all(recipients.map(id => notify(
            id,
            `New message on "${task.title}"`,
            `${author?.name || 'Someone'}: ${preview}`,
            `/task/${task._id}`
        )));

        const populated = await TaskComment.findById(comment._id).populate('author', 'name role employeeId');

        // Anyone with this task open sees the message appear immediately.
        emitToTask(task._id, 'task:comment', populated.toObject());

        res.status(201).json(populated);
    } catch (err) {
        discardStagedFiles(req.files);
        console.error('Task Comment Error:', err);
        res.status(500).json({ message: 'Server Error while posting message' });
    }
});

// DELETE /api/tasks/:id/comments/:commentId
router.delete('/:id/comments/:commentId', auth, async (req, res) => {
    try {
        const comment = await TaskComment.findOne({ _id: req.params.commentId, taskId: req.params.id });
        if (!comment) return res.status(404).json({ message: 'Message not found' });

        // Your own words, or Admin/HR moderating.
        if (comment.author.toString() !== req.user.id && !IS_PRIVILEGED.includes(req.user.role)) {
            return res.status(403).json({ message: 'You can only delete your own messages' });
        }

        await comment.deleteOne();
        emitToTask(req.params.id, 'task:comment-deleted', { _id: comment._id });
        res.json({ message: 'Message deleted' });
    } catch (err) {
        console.error('Task Comment Delete Error:', err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Message not found' });
        res.status(500).send('Server Error');
    }
});

module.exports = router;
