const mongoose = require('mongoose');
const { computeOverdueAt, computeExpectedStartAt } = require('../utils/taskOverdue');

const TASK_STATUSES = ['Pending', 'In Progress', 'On Hold', 'Completed'];
const TASK_TYPES = ['Project Task', 'Regular Office Task'];

// A single file attached to a task — an image, video, audio note, or a
// generic document (currently just HTML briefs).
// Images and documents go straight to S3. Videos are staged on the VPS first
// (`url` points at /uploads/tasks/...) and only swap to an S3 url after the
// nightly compression job runs — that's why `status` exists.
const mediaSchema = new mongoose.Schema({
    url: { type: String, required: true },
    fileName: { type: String, default: "" },
    type: { type: String, enum: ['image', 'video', 'audio', 'document'], required: true },

    // Audio notes only. The peaks are computed in the browser at record time
    // and stored, so a player can draw the waveform without fetching and
    // decoding the file again for every message in a thread.
    durationMs: { type: Number, default: 0 },
    waveform: { type: [Number], default: undefined },
    status: {
        type: String,
        enum: ['ready', 'processing_compression', 'failed'],
        default: 'ready'
    },
    // Only set on completion proof — who submitted this piece of evidence.
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const taskSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    // Mirrors Expense.expenseType — not all work belongs to a client project.
    taskType: {
        type: String,
        enum: ['Project Task', 'Regular Office Task'],
        default: 'Project Task'
    },

    // Only meaningful for project work; office tasks leave this null.
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: function () { return this.taskType === 'Project Task'; }
    },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High', 'Urgent'],
        default: 'Medium'
    },

    // One status for the whole task. However many people are on it, they are
    // working towards the same outcome — whoever moves it, moves it for everyone.
    status: {
        type: String,
        enum: TASK_STATUSES,
        default: 'Pending'
    },
    statusNote: { type: String, default: "" },
    statusUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    /**
     * When the task was last marked Completed.
     *
     * Cleared when it moves back out of Completed, so it always answers "is
     * this finished, and when" — but that also means it cannot answer "was
     * this ever finished before". firstCompletedAt below is the one that
     * survives a reopen, and statusHistory has the full picture.
     */
    completedAt: { type: Date },

    /**
     * The actual timeline, for the performance reporting in TaskPlan.md §18.
     *
     * The planned times (startDate/startTime/dueDate/dueTime) say what was
     * asked for; these say what happened. Kept as an append-only log rather
     * than a few summary fields because the interesting questions are about
     * transitions — how long it sat On Hold, whether it was reopened after
     * being called done, who moved it at each step — and none of those can be
     * reconstructed from statusUpdatedBy, which only ever holds the last
     * person to touch it.
     *
     * Nothing backfills this: tasks that predate it simply have an empty
     * array, and any report has to treat "no history" as unknown rather than
     * as zero.
     */
    statusHistory: [{
        from: { type: String, default: null },   // null on the very first entry
        to: { type: String, required: true },
        at: { type: Date, required: true },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: { type: String, default: "" }
    }],

    /**
     * Set once, the first time work actually starts, and never rewritten.
     *
     * This is the field that makes "how long did it take" answerable at all.
     * completedAt - createdAt measures time since it was *assigned*, which
     * includes however long it sat waiting for its start date; against a task
     * created three days before its due date that overstates the effort by
     * days.
     */
    firstStartedAt: { type: Date, default: null },

    // Survives a reopen, so rework is visible: a task with firstCompletedAt
    // set and status back to In Progress was handed back.
    firstCompletedAt: { type: Date, default: null },

    startDate: { type: Date },
    dueDate: { type: Date, required: true },

    /**
     * Optional time-of-day window on the due date (TaskPlan.md §16). Stored as
     * 'HH:MM' rather than combined into a Date, so editing dueDate later never
     * requires re-deriving a clock time out of an existing timestamp.
     *
     * Not offered on recurring-generated tasks — those already get a lenient
     * end-of-day dueDate from the schedule, and overdueAt leaves them alone
     * below.
     */
    startTime: { type: String, default: null },
    dueTime: { type: String, default: null },
    timeAllottedMinutes: { type: Number, default: null },

    /**
     * The single precomputed instant this task flips overdue. Every overdue
     * query in the app reads this, never dueDate directly — dueDate alone
     * can't answer "overdue" because that also depends on dueTime or, absent
     * one, the assignee's shift end (a Settings + User lookup no simple query
     * can express). Kept in step by the pre-save hook below.
     */
    overdueAt: { type: Date, required: true },

    /**
     * The other end of the window overdueAt closes: when the clock starts.
     *
     * An explicit startTime if one was given, otherwise the assignee's shift
     * start on the start date — so "no time allotted" means the whole working
     * day, 09:30 to 18:00, rather than midnight to 18:00. Stored rather than
     * derived for the same reason overdueAt is: it depends on a Settings and
     * User lookup that no query can express.
     */
    expectedStartAt: { type: Date, default: null },

    attachments: [mediaSchema],
    completionProof: [mediaSchema],

    // Simple membership list — everyone here shares the one status above.
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    /**
     * Self-assigned work (TaskPlan.md §15).
     *
     * An employee logging work they were given verbally. `assignedBy` carries
     * whoever they name as having handed it to them, exactly as it does on a
     * manager-created task — the field already means the right thing.
     *
     * approvalStatus defaults to 'Approved' so every task that already exists,
     * and every task a manager creates, is unaffected with no migration.
     */
    isSelfAssigned: { type: Boolean, default: false },
    approvalStatus: {
        type: String,
        enum: ['Approved', 'Pending', 'Rejected'],
        default: 'Approved'
    },
    approvalNote: { type: String, default: "" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },

    // Set only on tasks generated by a recurring schedule (TaskPlan.md §13).
    // A generated task is an ordinary task in every other respect — these two
    // fields exist so it can find its brief and report back to the schedule.
    recurringTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringTask', default: null },
    occurrenceDate: { type: String, default: null },   // YYYY-MM-DD

    isArchived: { type: Boolean, default: false }
}, { timestamps: true });

// The list views constantly ask "tasks for this user" and "tasks I created".
taskSchema.index({ assignees: 1, isArchived: 1 });
taskSchema.index({ assignedBy: 1, isArchived: 1 });
taskSchema.index({ status: 1, isArchived: 1 });

/**
 * The one index this feature cannot work without.
 *
 * node-cron does not fire while the process is down, so recurringTaskCron also
 * runs a catch-up sweep on boot — which means a restart shortly after 06:00 can
 * genuinely try to generate the same day twice. This makes the second attempt a
 * duplicate-key error the cron swallows, rather than a second copy of today's
 * task landing on someone's board.
 *
 * The partial filter is load-bearing: without it every ordinary task (which has
 * recurringTaskId: null and occurrenceDate: null) would collide with every
 * other ordinary task on the very first insert.
 */
taskSchema.index(
    { recurringTaskId: 1, occurrenceDate: 1, assignees: 1 },
    { unique: true, partialFilterExpression: { recurringTaskId: { $type: 'objectId' } } }
);

// The admin's Self-Assigned tab: "what is waiting on me to approve".
taskSchema.index({ isSelfAssigned: 1, approvalStatus: 1, isArchived: 1 });

// Feeding the schedule's compliance view.
taskSchema.index({ recurringTaskId: 1, occurrenceDate: 1 });

// Every overdue query in the app filters on this.
taskSchema.index({ overdueAt: 1, status: 1 });

/**
 * Keeps overdueAt in step with whatever actually determines it.
 *
 * The `!this.overdueAt` arm matters beyond first save: overdueAt is required,
 * so a document that somehow reached the database without one (a bulk write
 * that bypassed this hook, a pre-migration record loaded from a backup) would
 * otherwise fail validation the moment anything next calls .save() on it,
 * on a field the caller never touched. This makes that self-healing instead.
 *
 * Recurring-generated tasks default to the schedule's lenient end-of-local-
 * day dueDate (recurringSchedule.js's dayBounds) rather than the shift-end
 * fallback below, which would make them overdue *earlier* than that default —
 * but a schedule *with* an explicit time window (TaskPlan.md §16) copies its
 * dueTime onto every occurrence at generation time, and that explicit choice
 * still wins here exactly like it does for a one-off task. Only the absence
 * of one falls back to end-of-day instead of shift-end.
 *
 * pre('validate'), not pre('save'): overdueAt is `required`, and Mongoose
 * runs schema validation before user pre('save') hooks fire — a save with
 * overdueAt still unset at that point fails validation before this ever gets
 * a chance to set it.
 */
/**
 * Seeds the timeline with the moment the task came into existence, so a
 * report never has to special-case "the history starts at the first move".
 * Lives on the model rather than in the routes because all three creation
 * paths — manager-assigned, self-assigned, and the recurring cron — go
 * through save().
 *
 * `by` is deliberately left unset: the model doesn't know who called save(),
 * and assignedBy would be wrong for a self-assigned task, where it holds the
 * person the employee *named* rather than the person who created it. Who
 * created a task is already answerable from assignedBy plus isSelfAssigned.
 */
taskSchema.pre('validate', function () {
    if (this.isNew && this.statusHistory.length === 0) {
        this.statusHistory.push({
            from: null,
            to: this.status,
            at: new Date(),
            note: 'Created'
        });
    }
});

taskSchema.pre('validate', async function () {
    const needsRecompute = this.isNew || !this.overdueAt || !this.expectedStartAt ||
        this.isModified('dueDate') || this.isModified('dueTime') ||
        this.isModified('startDate') || this.isModified('startTime') ||
        this.isModified('assignees');
    if (!needsRecompute) return;

    // One rule for every kind of task: an explicit time window if the
    // assigner set one, otherwise the assignee's working day. Recurring
    // occurrences used to be exempt and kept their end-of-day dueDate, which
    // made a daily task due at 23:59 while an identical one-off was due at
    // shift end — the same work with two different deadlines.
    // occurrenceDate is the authoritative calendar day for a generated task —
    // see dayOf() for why its startDate/dueDate cannot be read directly.
    const dayStr = this.occurrenceDate || undefined;

    this.overdueAt = await computeOverdueAt({
        dueDate: this.dueDate,
        dueTime: this.dueTime,
        assignees: this.assignees,
        dayStr
    });

    this.expectedStartAt = await computeExpectedStartAt({
        startDate: this.startDate,
        dueDate: this.dueDate,
        startTime: this.startTime,
        assignees: this.assignees,
        dayStr
    });
});

module.exports = mongoose.model('Task', taskSchema);
module.exports.TASK_STATUSES = TASK_STATUSES;
module.exports.TASK_TYPES = TASK_TYPES;
module.exports.APPROVAL_STATUSES = ['Approved', 'Pending', 'Rejected'];
// Reused verbatim by RecurringTask so a brief's attachments and a task's
// attachments can never drift apart in shape.
module.exports.mediaSchema = mediaSchema;
