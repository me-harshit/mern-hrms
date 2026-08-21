const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const taskUpload = require('../middleware/taskUploadMiddleware');
const { processTaskFiles, discardStagedFiles, s3Folder } = require('../utils/taskMedia');

const RecurringTask = require('../models/RecurringTask');
const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');
const VideoCompressionQueue = require('../models/VideoCompressionQueue');

const {
    CAN_ASSIGN,
    IS_PRIVILEGED,
    getScopedEmployees,
    getScopedProjects
} = require('../utils/taskScoping');

const {
    isValidDateStr,
    todayIST,
    buildEligibility,
    projectSchedule,
    dayBounds,
    dateToStr,
    addDays
} = require('../utils/recurringSchedule');

const Holiday = require('../models/Holiday');

const TASK_TYPES = ['Project Task', 'Regular Office Task'];

// A schedule longer than this is almost certainly a mis-click on the calendar.
const MAX_PLANNED_DAYS = 180;

// Same shape-tolerant parsing routes/tasks.js does — multipart sends arrays
// differently depending on how the client builds the FormData.
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
        console.error('[RECURRING] Notification error:', err.message);
    }
};

const folderForTask = (taskType, projectName) =>
    taskType === 'Regular Office Task' ? s3Folder('Office') : s3Folder(projectName);

// Clean up whatever the manager drew on the calendar: drop malformed entries,
// dedupe, reject the past, sort.
const normaliseDates = (raw) => {
    const list = [...new Set(parseIdList(raw))];
    const invalid = list.filter(d => !isValidDateStr(d));
    if (invalid.length) return { error: `Not a valid date: ${invalid[0]}` };

    const today = todayIST();
    const past = list.filter(d => d < today);
    if (past.length) return { error: `You can't schedule a task in the past (${past.sort()[0]})` };

    if (list.length === 0) return { error: 'Pick at least one day for this task to run' };
    if (list.length > MAX_PLANNED_DAYS) {
        return { error: `A schedule can cover at most ${MAX_PLANNED_DAYS} days` };
    }

    return { dates: list.sort() };
};

// Works whether or not the caller has populated the refs: a populated field is
// a document, and calling .toString() on one of those yields an inspect string,
// not an id — which silently locks the schedule's own creator out.
const idOf = (v) => String(v && v._id ? v._id : v);

// Who is allowed to look at a schedule.
const canTouchSchedule = (schedule, reqUser) =>
    idOf(schedule.assignedBy) === reqUser.id ||
    IS_PRIVILEGED.includes(reqUser.role) ||
    schedule.assignees.some(a => idOf(a) === reqUser.id);

// ==========================================
// 1. PREVIEW — powers the calendar
// ==========================================
/**
 * Two jobs in one call:
 *
 *   `annotations` — everything the calendar needs to grey out and stripe the
 *                   visible months (holidays, per-assignee leave days).
 *   `projection`  — only when `dates` are supplied: exactly which of them will
 *                   run, and where roll-forward lands the schedule.
 *
 * This is **advisory**. Leave approved after the schedule is created will not
 * appear here, and that is fine — the cron re-checks every morning against live
 * data and is the sole authority. The form says so in as many words.
 */
router.post('/preview', auth, async (req, res) => {
    try {
        if (!CAN_ASSIGN.includes(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        const assigneeIds = parseIdList(req.body.assigneeIds);
        const rules = {
            skipSundays: req.body.skipSundays !== false,
            skipHolidays: req.body.skipHolidays !== false,
            skipOnLeave: req.body.skipOnLeave !== false
        };

        // --- annotations for the visible range ---
        const { from, to } = req.body;
        const annotations = { holidays: {}, leaves: {} };

        if (isValidDateStr(from) && isValidDateStr(to) && from <= to) {
            const holidayDocs = await Holiday.find({
                date: { $gte: dayBounds(from).start, $lte: dayBounds(to).end }
            }).select('name date');

            for (const h of holidayDocs) annotations.holidays[dateToStr(h.date)] = h.name;

            // Walk the range once per assignee so the calendar can stripe the
            // exact days that person is away.
            if (assigneeIds.length) {
                const days = [];
                for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

                const { check, users } = await buildEligibility(days, assigneeIds, {
                    ...rules,
                    // Sundays and holidays are annotated separately above; here
                    // we only want the per-person leave overlay.
                    skipSundays: false,
                    skipHolidays: false
                });

                for (const id of assigneeIds) {
                    const away = days.filter(d => !check(d, id).ok);
                    annotations.leaves[String(id)] = {
                        name: users.get(String(id))?.name || 'Unknown',
                        dates: away
                    };
                }
            }
        }

        // --- projection for the selected days ---
        let projection = null;
        if (req.body.dates) {
            const parsed = normaliseDates(req.body.dates);
            if (parsed.error) return res.status(400).json({ message: parsed.error });

            if (assigneeIds.length === 0) {
                return res.status(400).json({ message: 'Pick who this task is for before previewing' });
            }

            const result = await projectSchedule(parsed.dates, assigneeIds, rules);

            const endsOn = result.perUser
                .map(u => u.endsOn)
                .filter(Boolean)
                .sort()
                .pop() || null;

            projection = {
                ...result,
                summary: {
                    selected: parsed.dates.length,
                    endsOn,
                    anyStalled: result.perUser.some(u => u.stalled)
                }
            };
        }

        res.json({ annotations, projection });
    } catch (err) {
        console.error('Recurring Preview Error:', err);
        res.status(500).json({ message: 'Server Error while previewing the schedule' });
    }
});

// ==========================================
// 2. CREATE SCHEDULE
// ==========================================
router.post('/', auth, taskUpload.array('attachments', 10), async (req, res) => {
    try {
        if (!CAN_ASSIGN.includes(req.user.role)) {
            discardStagedFiles(req.files);
            return res.status(403).json({ message: 'You are not allowed to assign tasks' });
        }

        const { title, description, projectId, priority } = req.body;
        const assigneeIds = parseIdList(req.body.assigneeIds);
        const taskType = TASK_TYPES.includes(req.body.taskType) ? req.body.taskType : 'Project Task';
        const isOfficeTask = taskType === 'Regular Office Task';

        if (!title) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Title is required' });
        }

        const parsed = normaliseDates(req.body.plannedDates);
        if (parsed.error) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: parsed.error });
        }

        if (!isOfficeTask && !projectId) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Pick a project, or switch this to a Regular Office task' });
        }
        if (assigneeIds.length === 0) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Assign the task to at least one employee' });
        }

        let project = null;
        if (!isOfficeTask) {
            const allowedProjects = await getScopedProjects();
            project = allowedProjects.find(p => p._id.toString() === projectId);
            if (!project) {
                discardStagedFiles(req.files);
                return res.status(400).json({ message: 'That project is not available. It may have been completed or put on hold.' });
            }
        }

        // Every assignee must be inside this user's team scope — same check as
        // one-off task creation.
        const allowedEmployees = await getScopedEmployees(req.user);
        const allowedIds = new Set(allowedEmployees.map(e => e._id.toString()));
        const invalid = assigneeIds.filter(id => !allowedIds.has(id));
        if (invalid.length > 0) {
            discardStagedFiles(req.files);
            return res.status(403).json({ message: 'One or more selected employees are outside your team' });
        }

        const subFolder = folderForTask(taskType, project?.name);
        const { media, pendingVideos } = await processTaskFiles(req.files, subFolder);

        const schedule = new RecurringTask({
            title,
            description: description || "",
            taskType,
            projectId: isOfficeTask ? null : projectId,
            priority: priority || 'Medium',
            attachments: media,
            assignedBy: req.user.id,
            assignees: assigneeIds,
            plannedDates: parsed.dates,
            targetCount: parsed.dates.length,
            skipSundays: req.body.skipSundays !== 'false' && req.body.skipSundays !== false,
            skipHolidays: req.body.skipHolidays !== 'false' && req.body.skipHolidays !== false,
            skipOnLeave: req.body.skipOnLeave !== 'false' && req.body.skipOnLeave !== false,
            assigneeState: assigneeIds.map(id => ({ user: id, extraDates: [], generatedCount: 0, status: 'Active' }))
        });

        await schedule.save();

        // The brief's videos are staged on disk exactly like a one-off task's,
        // and the same midnight job moves them to S3. `field` says which array
        // to write back into; 'attachments' is right for both models.
        if (pendingVideos.length > 0) {
            await VideoCompressionQueue.insertMany(pendingVideos.map(v => ({
                ownerModel: 'RecurringTask',
                taskId: schedule._id,
                mediaId: v.mediaId,
                field: 'attachments',
                localPath: v.localPath,
                originalName: v.originalName,
                projectName: isOfficeTask ? 'Office' : project.name
            })));
        }

        const assigner = await User.findById(req.user.id).select('name');
        await Promise.all(assigneeIds.map(id => notify(
            id,
            'Daily Task Scheduled',
            `${assigner?.name || 'Your manager'} scheduled "${title}" for you — ${parsed.dates.length} day(s), starting ${parsed.dates[0]}.`,
            `/my-tasks`
        )));

        // A schedule that starts today should start today, not tomorrow morning.
        // Reusing the cron's own generator keeps that path identical to every
        // other day, including the duplicate guard.
        let generatedToday = 0;
        if (parsed.dates.includes(todayIST())) {
            try {
                const { generateForSchedule } = require('../cron/recurringTaskCron');
                generatedToday = await generateForSchedule(schedule, todayIST());
            } catch (err) {
                // The schedule is saved; tomorrow's run will pick it up.
                console.error('[RECURRING] Immediate generation failed:', err.message);
            }
        }

        const populated = await RecurringTask.findById(schedule._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name')
            .populate('assignees', 'name email employeeId');

        res.status(201).json({ schedule: populated, generatedToday });
    } catch (err) {
        discardStagedFiles(req.files);
        console.error('Recurring Task Creation Error:', err);
        res.status(500).json({ message: 'Server Error while creating the schedule' });
    }
});

// ==========================================
// 3. LIST SCHEDULES
// ==========================================
router.get('/', auth, async (req, res) => {
    try {
        if (!CAN_ASSIGN.includes(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const andConditions = [];

        // Admin/HR see everything; everyone else sees what they created.
        if (!IS_PRIVILEGED.includes(req.user.role)) {
            andConditions.push({ assignedBy: req.user.id });
        } else if (req.query.assignedBy && req.query.assignedBy !== 'All') {
            andConditions.push({ assignedBy: req.query.assignedBy });
        }

        if (req.query.status && req.query.status !== 'All') {
            andConditions.push({ status: req.query.status });
        }
        if (req.query.assigneeId && req.query.assigneeId !== 'All') {
            andConditions.push({ assignees: req.query.assigneeId });
        }
        if (req.query.search) {
            andConditions.push({ title: new RegExp(req.query.search, 'i') });
        }

        const query = andConditions.length ? { $and: andConditions } : {};

        const totalRecords = await RecurringTask.countDocuments(query);
        const schedules = await RecurringTask.find(query)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name')
            .populate('assignees', 'name email employeeId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Roll the occurrence log up into the numbers the list actually shows,
        // so the client never has to walk it.
        const data = schedules.map(s => {
            const done = s.occurrences.filter(o => o.outcome === 'completed').length;
            const missed = s.occurrences.filter(o => o.outcome === 'missed').length;
            const skipped = s.occurrences.filter(o => o.result === 'skipped').length;
            const generated = s.occurrences.filter(o => o.result === 'generated').length;

            return {
                ...s,
                progress: {
                    generated,
                    // One run per assignee per planned day.
                    total: s.targetCount * (s.assignees.length || 1),
                    done,
                    missed,
                    skipped
                }
            };
        });

        res.json({
            data,
            pagination: { totalRecords, totalPages: Math.ceil(totalRecords / limit) || 1, currentPage: page, limit }
        });
    } catch (err) {
        console.error('Recurring List Error:', err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 4. ONE SCHEDULE (compliance view)
// ==========================================
router.get('/:id', auth, async (req, res) => {
    try {
        const schedule = await RecurringTask.findById(req.params.id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name')
            .populate('assignees', 'name email employeeId')
            .populate('occurrences.taskId', 'status title');

        if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
        if (!canTouchSchedule(schedule, req.user)) return res.status(403).json({ message: 'Access Denied' });

        // The calendar is drawn per person, so group the log that way rather
        // than making the client bucket a flat array.
        const byAssignee = schedule.assignees.map(a => {
            const state = schedule.assigneeState.find(s => String(s.user) === String(a._id));
            const rows = schedule.occurrences
                .filter(o => String(o.assignee) === String(a._id))
                .sort((x, y) => x.date.localeCompare(y.date));

            return {
                user: a,
                status: state?.status || 'Active',
                generatedCount: state?.generatedCount || 0,
                targetCount: schedule.targetCount,
                dates: [...schedule.plannedDates, ...(state?.extraDates || [])].sort(),
                occurrences: rows
            };
        });

        res.json({ schedule, byAssignee });
    } catch (err) {
        console.error('Recurring Detail Error:', err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 5. UPDATE / PAUSE / RESUME / CANCEL / EXTEND
// ==========================================
/**
 * Editing the brief affects every day, past and future — that is the point of
 * referencing the template rather than copying it. Pausing stops generation
 * from tomorrow; already-generated tasks are left alone, because they are real
 * work someone may already be part-way through.
 */
router.put('/:id', auth, async (req, res) => {
    try {
        const schedule = await RecurringTask.findById(req.params.id);
        if (!schedule) return res.status(404).json({ message: 'Schedule not found' });

        // Assignees can view a schedule but not steer it.
        const canEdit = idOf(schedule.assignedBy) === req.user.id ||
            IS_PRIVILEGED.includes(req.user.role);
        if (!canEdit) return res.status(403).json({ message: 'Access Denied' });

        const { action } = req.body;

        if (action === 'pause') {
            if (schedule.status !== 'Active') return res.status(400).json({ message: 'Only an active schedule can be paused' });
            schedule.status = 'Paused';
        } else if (action === 'resume') {
            if (schedule.status !== 'Paused') return res.status(400).json({ message: 'Only a paused schedule can be resumed' });
            schedule.status = 'Active';
        } else if (action === 'cancel') {
            if (['Completed', 'Cancelled'].includes(schedule.status)) {
                return res.status(400).json({ message: 'This schedule has already ended' });
            }
            schedule.status = 'Cancelled';
        } else if (action === 'extend') {
            const parsed = normaliseDates(req.body.plannedDates);
            if (parsed.error) return res.status(400).json({ message: parsed.error });

            const merged = [...new Set([...schedule.plannedDates, ...parsed.dates])].sort();
            if (merged.length > MAX_PLANNED_DAYS) {
                return res.status(400).json({ message: `A schedule can cover at most ${MAX_PLANNED_DAYS} days` });
            }

            schedule.plannedDates = merged;
            schedule.targetCount = merged.length;

            // Extending revives anyone who had already finished their run.
            for (const state of schedule.assigneeState) {
                if (state.status === 'Completed' && state.generatedCount < schedule.targetCount) {
                    state.status = 'Active';
                }
            }
            if (schedule.status === 'Completed') schedule.status = 'Active';
        } else {
            // Plain brief edit.
            if (typeof req.body.title === 'string' && req.body.title.trim()) schedule.title = req.body.title.trim();
            if (typeof req.body.description === 'string') schedule.description = req.body.description;
            if (['Low', 'Medium', 'High', 'Urgent'].includes(req.body.priority)) schedule.priority = req.body.priority;
        }

        await schedule.save();

        const populated = await RecurringTask.findById(schedule._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name')
            .populate('assignees', 'name email employeeId');

        res.json(populated);
    } catch (err) {
        console.error('Recurring Update Error:', err);
        res.status(500).json({ message: 'Server Error while updating the schedule' });
    }
});

module.exports = router;
