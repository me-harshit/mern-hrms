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
    getScopedProjects,
    getTaskVisibilityFilter
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
const { parseTimeWindow } = require('../utils/taskOverdue');

const Holiday = require('../models/Holiday');
const { buildDiscussionHandlers } = require('../utils/taskDiscussion');

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
const normaliseDates = (raw, { allowPast = false } = {}) => {
    const list = [...new Set(parseIdList(raw))];
    const invalid = list.filter(d => !isValidDateStr(d));
    if (invalid.length) return { error: `Not a valid date: ${invalid[0]}` };

    // Creating a schedule in the past is a mistake; re-saving one that has
    // already been running legitimately still contains its earlier days.
    const today = todayIST();
    const past = allowPast ? [] : list.filter(d => d < today);
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

// Who is allowed to look at a schedule. Its only caller is the GET detail
// route (view-only) — a Team Lead reaching a schedule this way only ever
// reads it, so widening this to their team doesn't touch edit/delete rights,
// which stay assigner-or-privileged as decided elsewhere.
const canTouchSchedule = async (schedule, reqUser) => {
    if (idOf(schedule.assignedBy) === reqUser.id) return true;
    if (IS_PRIVILEGED.includes(reqUser.role)) return true;
    if (schedule.assignees.some(a => idOf(a) === reqUser.id)) return true;

    const visibility = await getTaskVisibilityFilter(reqUser);
    if (!visibility) return false;
    return Boolean(await RecurringTask.exists({ _id: schedule._id, ...visibility }));
};

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
        const timeWindow = parseTimeWindow(req.body);
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
            ...timeWindow,
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
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic');

        res.status(201).json({ schedule: populated, generatedToday });
    } catch (err) {
        discardStagedFiles(req.files);
        console.error('Recurring Task Creation Error:', err);
        res.status(500).json({ message: 'Server Error while creating the schedule' });
    }
});

// ==========================================
// 2b. CONVERT AN EXISTING TASK INTO A SCHEDULE
// ==========================================
/**
 * "This one-off should actually repeat."
 *
 * Copies the task's brief, assignees and media onto a new schedule and archives
 * the original, so the schedule takes over rather than sitting beside a
 * duplicate of itself.
 *
 * The fiddly part is media: a video still waiting on the nightly compression has
 * a VideoCompressionQueue row pointing at the *task*. Left alone, the job would
 * write the S3 url back to the archived task and the schedule's copy would keep
 * a staged path that gets deleted — the §13.7 trap, arriving by a different
 * route. So the queue rows are re-pointed at the schedule as part of the move.
 */
router.post('/from-task/:taskId', auth, async (req, res) => {
    try {
        if (!CAN_ASSIGN.includes(req.user.role)) {
            return res.status(403).json({ message: 'You are not allowed to assign tasks' });
        }

        const task = await Task.findById(req.params.taskId).populate('projectId', 'name');
        if (!task) return res.status(404).json({ message: 'Task not found' });

        if (task.recurringTaskId) {
            return res.status(400).json({ message: 'This task already belongs to a recurring schedule' });
        }
        if (task.isArchived) {
            return res.status(400).json({ message: 'This task has been removed' });
        }
        if (task.isSelfAssigned && task.approvalStatus !== 'Approved') {
            return res.status(400).json({ message: 'Approve this task before making it recurring' });
        }

        const canConvert = idOf(task.assignedBy) === req.user.id || IS_PRIVILEGED.includes(req.user.role);
        if (!canConvert) {
            return res.status(403).json({ message: 'Only the assigner can convert this task' });
        }

        const parsed = normaliseDates(req.body.plannedDates);
        if (parsed.error) return res.status(400).json({ message: parsed.error });

        const assigneeIds = task.assignees.map(a => a.toString());
        if (assigneeIds.length === 0) {
            return res.status(400).json({ message: 'This task has nobody assigned to it' });
        }

        const schedule = new RecurringTask({
            title: task.title,
            description: task.description,
            taskType: task.taskType,
            projectId: task.taskType === 'Regular Office Task' ? null : (task.projectId?._id || task.projectId),
            priority: task.priority,
            // Carried over by value; the queue rows below are what keep a
            // still-compressing video pointing at the right document.
            attachments: task.attachments,
            assignedBy: task.assignedBy,
            assignees: assigneeIds,
            plannedDates: parsed.dates,
            targetCount: parsed.dates.length,
            skipSundays: req.body.skipSundays !== false,
            skipHolidays: req.body.skipHolidays !== false,
            skipOnLeave: req.body.skipOnLeave !== false,
            assigneeState: assigneeIds.map(id => ({ user: id, extraDates: [], generatedCount: 0, status: 'Active' }))
        });

        await schedule.save();

        await VideoCompressionQueue.updateMany(
            { taskId: task._id, field: 'attachments', status: { $in: ['queued', 'failed'] } },
            { $set: { ownerModel: 'RecurringTask', taskId: schedule._id } }
        );

        // The schedule replaces it, so the one-off comes off the boards.
        task.isArchived = true;
        await task.save();

        const actor = await User.findById(req.user.id).select('name');
        await Promise.all(assigneeIds.map(id => notify(
            id,
            'Task is now a daily task',
            `${actor?.name || 'Your manager'} turned "${task.title}" into a daily task for ${parsed.dates.length} day(s).`,
            `/my-tasks`
        )));

        let generatedToday = 0;
        if (parsed.dates.includes(todayIST())) {
            try {
                const { generateForSchedule } = require('../cron/recurringTaskCron');
                generatedToday = await generateForSchedule(schedule, todayIST());
            } catch (err) {
                console.error('[RECURRING] Immediate generation failed:', err.message);
            }
        }

        const populated = await RecurringTask.findById(schedule._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic');

        res.status(201).json({ schedule: populated, generatedToday });
    } catch (err) {
        console.error('Convert To Recurring Error:', err);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Task not found' });
        res.status(500).json({ message: 'Server Error while converting the task' });
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

        // $ne rather than `false`: schedules created before isArchived existed
        // have no such field, and an equality match would hide every one of them
        // — the same trap that hid historical tasks from the admin list.
        const andConditions = [{ isArchived: { $ne: true } }];

        // Same rule as the one-off task list: a Team Lead sees schedules running
        // for their own team, whoever set them up.
        const visibility = await getTaskVisibilityFilter(req.user);
        if (visibility) {
            andConditions.push(visibility);
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

        const query = { $and: andConditions };

        const totalRecords = await RecurringTask.countDocuments(query);
        const schedules = await RecurringTask.find(query)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic')
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
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic')
            .populate('occurrences.taskId', 'status title');

        if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
        if (!(await canTouchSchedule(schedule, req.user))) return res.status(403).json({ message: 'Access Denied' });

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
 *
 * The full edit (no `action`) can change everything the create form can, with
 * two rules that keep a running schedule honest:
 *
 *   - a day that already produced an occurrence cannot be unscheduled. It
 *     happened; removing it from the plan would make the compliance log lie.
 *   - removing an assignee stops their future days but leaves the tasks they
 *     already received, for the same reason.
 */
router.put('/:id', auth, taskUpload.array('attachments', 10), async (req, res) => {
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
            // ---- full edit ----
            if (typeof req.body.title === 'string' && req.body.title.trim()) schedule.title = req.body.title.trim();
            if (typeof req.body.description === 'string') schedule.description = req.body.description;
            if (['Low', 'Medium', 'High', 'Urgent'].includes(req.body.priority)) schedule.priority = req.body.priority;

            // --- type / project ---
            if (TASK_TYPES.includes(req.body.taskType)) {
                const isOffice = req.body.taskType === 'Regular Office Task';
                if (!isOffice) {
                    const wanted = req.body.projectId || idOf(schedule.projectId);
                    const allowed = await getScopedProjects();
                    if (!allowed.find(p => p._id.toString() === String(wanted))) {
                        discardStagedFiles(req.files);
                        return res.status(400).json({ message: 'That project is not available' });
                    }
                    schedule.projectId = wanted;
                } else {
                    schedule.projectId = null;
                }
                schedule.taskType = req.body.taskType;
            }

            // --- assignees ---
            if (req.body.assigneeIds !== undefined) {
                const wanted = parseIdList(req.body.assigneeIds);
                if (wanted.length === 0) {
                    discardStagedFiles(req.files);
                    return res.status(400).json({ message: 'A schedule needs at least one assignee' });
                }

                const allowedEmployees = await getScopedEmployees(req.user);
                const allowedIds = new Set(allowedEmployees.map(e => e._id.toString()));
                const current = new Set(schedule.assignees.map(a => a.toString()));
                // Someone already on the schedule stays selectable even if they
                // have since moved out of this manager's team.
                const invalid = wanted.filter(id => !allowedIds.has(id) && !current.has(id));
                if (invalid.length > 0) {
                    discardStagedFiles(req.files);
                    return res.status(403).json({ message: 'One or more selected employees are outside your team' });
                }

                schedule.assignees = wanted;
                // Newcomers start a run of their own; people dropped lose their
                // future days but keep the tasks already generated for them.
                schedule.assigneeState = wanted.map(id => {
                    const existing = schedule.assigneeState.find(st => String(st.user) === String(id));
                    return existing || { user: id, extraDates: [], generatedCount: 0, status: 'Active' };
                });
            }

            // --- the day set ---
            if (req.body.plannedDates !== undefined) {
                const parsed = normaliseDates(req.body.plannedDates, { allowPast: true });
                if (parsed.error) {
                    discardStagedFiles(req.files);
                    return res.status(400).json({ message: parsed.error });
                }

                // A day that already ran cannot be taken off the plan.
                const occurred = new Set(schedule.occurrences.map(o => o.date));
                const locked = schedule.plannedDates.filter(d => occurred.has(d));
                // Adding a day in the past is meaningless — the cron never
                // backfills — so only today onwards, plus whatever is locked.
                const today = todayIST();
                const incoming = parsed.dates.filter(d => d >= today || occurred.has(d));

                const merged = [...new Set([...locked, ...incoming])].sort();
                if (merged.length === 0) {
                    discardStagedFiles(req.files);
                    return res.status(400).json({ message: 'Pick at least one day for this task to run' });
                }
                if (merged.length > MAX_PLANNED_DAYS) {
                    discardStagedFiles(req.files);
                    return res.status(400).json({ message: `A schedule can cover at most ${MAX_PLANNED_DAYS} days` });
                }

                schedule.plannedDates = merged;
                schedule.targetCount = merged.length;

                // A longer run revives anyone who had already finished theirs.
                for (const state of schedule.assigneeState) {
                    if (state.status === 'Completed' && state.generatedCount < schedule.targetCount) {
                        state.status = 'Active';
                    }
                }
                if (schedule.status === 'Completed' &&
                    schedule.assigneeState.some(st => st.status === 'Active')) {
                    schedule.status = 'Active';
                }
            }

            // --- the time window --- only occurrences generated *after* this
            // edit pick it up, same as every other brief field above.
            if (req.body.startTime !== undefined || req.body.dueTime !== undefined || req.body.timeAllottedMinutes !== undefined) {
                Object.assign(schedule, parseTimeWindow(req.body));
            }

            // --- the brief's media ---
            if (req.body.keepAttachmentIds !== undefined) {
                const keep = new Set(parseIdList(req.body.keepAttachmentIds));
                const dropped = schedule.attachments.filter(m => !keep.has(m._id.toString()));
                schedule.attachments = schedule.attachments.filter(m => keep.has(m._id.toString()));

                // Anything still queued for compression has nothing to write
                // back to once its media entry is gone.
                if (dropped.length > 0) {
                    await VideoCompressionQueue.deleteMany({
                        taskId: schedule._id,
                        mediaId: { $in: dropped.map(m => m._id) }
                    });
                }
            }

            if (req.files && req.files.length > 0) {
                const project = schedule.taskType === 'Regular Office Task'
                    ? null
                    : await require('../models/Project').findById(schedule.projectId).select('name');
                const subFolder = folderForTask(schedule.taskType, project?.name);
                const { media, pendingVideos } = await processTaskFiles(req.files, subFolder);

                media.forEach(m => schedule.attachments.push(m));

                if (pendingVideos.length > 0) {
                    await VideoCompressionQueue.insertMany(pendingVideos.map(v => ({
                        ownerModel: 'RecurringTask',
                        taskId: schedule._id,
                        mediaId: v.mediaId,
                        field: 'attachments',
                        localPath: v.localPath,
                        originalName: v.originalName,
                        projectName: project?.name || 'Office'
                    })));
                }
            }
        }

        await schedule.save();

        // An edit can hand someone a task that's owed *today* — a newly added
        // assignee, a day just merged into the plan (full edit or 'extend'),
        // or a run revived out of 'Completed' — none of which the 6am cron
        // will see again until tomorrow. The create routes already generate
        // immediately when today is in the plan; an edit needs the same
        // catch-up, or that person simply never gets today's task. Safe to
        // call unconditionally: it's a no-op unless something is actually due
        // today, and the occurrence log makes it idempotent either way.
        try {
            const { generateForSchedule } = require('../cron/recurringTaskCron');
            await generateForSchedule(schedule, todayIST());
        } catch (err) {
            console.error('[RECURRING] Immediate generation after edit failed:', err.message);
        }

        const populated = await RecurringTask.findById(schedule._id)
            .populate('projectId', 'name')
            .populate('assignedBy', 'name profilePic')
            .populate('assignees', 'name email employeeId profilePic');

        res.json(populated);
    } catch (err) {
        discardStagedFiles(req.files);
        console.error('Recurring Update Error:', err);
        res.status(500).json({ message: 'Server Error while updating the schedule' });
    }
});

// ==========================================
// 6. DELETE A SCHEDULE
// ==========================================
/**
 * Soft delete, matching how `DELETE /api/tasks/:id` archives rather than
 * destroys. The document stays so that tasks it already generated keep their
 * brief and their day number — a hard delete would strip those from real work
 * people have already done.
 *
 * `clearOpen=true` additionally takes unfinished days off employees' boards.
 * Completed days are never touched: they are a record of work that happened.
 */
router.delete('/:id', auth, async (req, res) => {
    try {
        const schedule = await RecurringTask.findById(req.params.id);
        if (!schedule) return res.status(404).json({ message: 'Schedule not found' });

        const canDelete = idOf(schedule.assignedBy) === req.user.id ||
            IS_PRIVILEGED.includes(req.user.role);
        if (!canDelete) return res.status(403).json({ message: 'Access Denied' });

        schedule.isArchived = true;
        // Cancelled as well as archived: the cron looks for status 'Active', so
        // this is what actually stops tomorrow morning's run.
        if (!['Completed', 'Cancelled'].includes(schedule.status)) {
            schedule.status = 'Cancelled';
        }
        await schedule.save();

        let clearedTasks = 0;
        if (req.query.clearOpen === 'true') {
            const result = await Task.updateMany(
                {
                    recurringTaskId: schedule._id,
                    status: { $ne: 'Completed' },
                    isArchived: { $ne: true }
                },
                { $set: { isArchived: true } }
            );
            clearedTasks = result.modifiedCount || 0;

            // Keep the compliance log honest — those days were not missed, they
            // were withdrawn.
            schedule.occurrences.forEach(o => {
                if (o.outcome === 'pending') o.outcome = 'not-applicable';
            });
            await schedule.save();
        }

        res.json({ message: 'Schedule deleted', clearedTasks });
    } catch (err) {
        console.error('Recurring Delete Error:', err);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Schedule not found' });
        res.status(500).json({ message: 'Server Error while deleting the schedule' });
    }
});

// ==========================================
// 7. DISCUSSION THREAD ON THE SCHEDULE
// ==========================================
/**
 * Separate from the threads on the days it generates: a note about the run as a
 * whole ("stop tagging the client on these") belongs with the schedule, not
 * buried in one arbitrary morning's task.
 */
const scheduleDiscussion = buildDiscussionHandlers({
    ownerModel: 'RecurringTask',
    load: (id) => RecurringTask.findById(id).populate('projectId', 'name'),
    link: (schedule) => `/tasks/recurring/${schedule._id}`,
    notFound: 'Schedule not found'
});

router.get('/:id/comments', auth, scheduleDiscussion.list);
router.post('/:id/comments', auth, taskUpload.array('attachments', 5), scheduleDiscussion.create);
router.put('/:id/comments/:commentId', auth, scheduleDiscussion.update);
router.delete('/:id/comments/:commentId', auth, scheduleDiscussion.remove);

module.exports = router;
