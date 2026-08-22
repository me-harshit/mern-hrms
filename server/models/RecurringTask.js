const mongoose = require('mongoose');
const { mediaSchema } = require('./Task');

/**
 * A recurring task is a *template*, never a task itself (TaskPlan.md §13.1).
 *
 * recurringTaskCron materialises a real Task from it each morning, one per
 * assignee per day, so every day is a genuine blank slate with its own status,
 * its own completion proof and its own discussion thread — and so the entire
 * existing task stack (board, /task/:id, sockets, compression queue) works on
 * generated tasks without knowing they were generated.
 */

const SCHEDULE_STATUSES = ['Active', 'Paused', 'Completed', 'Cancelled'];

/**
 * The audit log. Deliberately not derivable from the Task collection, because
 * skipped days never produce a Task — this is the only place the full picture
 * of "what was meant to happen and what did" lives, and it is what the
 * compliance calendar renders.
 */
const occurrenceSchema = new mongoose.Schema({
    date: { type: String, required: true },              // YYYY-MM-DD
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Null on a skipped day — nothing was created to point at.
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },

    result: { type: String, enum: ['generated', 'skipped'], required: true },
    skipReason: { type: String, default: "" },

    // Denormalised off the Task so the compliance view is one document read
    // rather than an N-day fan-out. Kept in step by the cron's nightly sweep
    // and by the task status route.
    outcome: {
        type: String,
        enum: ['pending', 'completed', 'missed', 'not-applicable'],
        default: 'pending'
    }
}, { _id: true, timestamps: true });

/**
 * Per-assignee progress. Roll-forward is evaluated per person: if Rahul is on
 * leave on Wednesday but Priya is not, Rahul's run extends by a day and
 * Priya's does not. plannedDates is the shared baseline; extraDates is how far
 * this particular person has been pushed past it.
 */
const assigneeStateSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    extraDates: [{ type: String }],          // YYYY-MM-DD, appended on system skips
    generatedCount: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['Active', 'Completed', 'Stalled'],
        default: 'Active'
    }
}, { _id: false });

const recurringTaskSchema = new mongoose.Schema({
    // ---- the brief, mirroring Task ----
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    taskType: {
        type: String,
        enum: ['Project Task', 'Regular Office Task'],
        default: 'Project Task'
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: function () { return this.taskType === 'Project Task'; }
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High', 'Urgent'],
        default: 'Medium'
    },

    /**
     * Reference media for the brief. Generated tasks *point back* at this array
     * rather than copying it (TaskPlan.md §13.7): a video here is staged on the
     * VPS until the midnight job moves it to S3 and deletes the local file, so
     * any copy taken before then is left pointing at a path that no longer
     * exists. Referencing means the compression job's one update fixes every
     * day at once.
     */
    attachments: [mediaSchema],

    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],

    // ---- the schedule ----

    // The plan as the manager drew it, sorted 'YYYY-MM-DD'. Days they
    // deliberately deselected are simply absent, and their absence must never
    // trigger roll-forward — see §13.4.
    plannedDates: [{ type: String, required: true }],

    // plannedDates.length at save time: the promise being kept. Roll-forward
    // extends the run until this many tasks have actually been created.
    targetCount: { type: Number, required: true },

    skipSundays: { type: Boolean, default: true },
    skipHolidays: { type: Boolean, default: true },
    skipOnLeave: { type: Boolean, default: true },

    status: { type: String, enum: SCHEDULE_STATUSES, default: 'Active' },

    // Soft delete, exactly as Task.isArchived works: the schedule leaves the
    // list but its occurrence log survives, so the generated tasks that point
    // back at it keep their brief and their "Day 3 of 10".
    isArchived: { type: Boolean, default: false },

    assigneeState: [assigneeStateSchema],
    occurrences: [occurrenceSchema]
}, { timestamps: true });

// The cron's one hot query: active schedules that still have work left.
recurringTaskSchema.index({ status: 1, 'assigneeState.status': 1 });
recurringTaskSchema.index({ assignedBy: 1, status: 1 });
// Powers the yesterday-sweep without scanning every schedule.
recurringTaskSchema.index({ 'occurrences.date': 1, 'occurrences.outcome': 1 });

// Every date this person is expected to act on: the shared plan plus whatever
// roll-forward has appended for them.
recurringTaskSchema.methods.datesFor = function (userId) {
    const state = this.assigneeState.find((s) => String(s.user) === String(userId));
    return [...this.plannedDates, ...(state?.extraDates || [])];
};

module.exports = mongoose.model('RecurringTask', recurringTaskSchema);
module.exports.SCHEDULE_STATUSES = SCHEDULE_STATUSES;
