const mongoose = require('mongoose');

/**
 * Computes the one instant a task actually flips overdue (see TaskPlan.md
 * §16 — time-based due dates).
 *
 * The bug this replaces: dueDate has always been a full Date, but the client
 * only ever sent a bare 'YYYY-MM-DD'. Mongoose casts that as UTC midnight,
 * which is 05:30 IST — so every task due "today" was already in the past for
 * `dueDate: { $lt: now }` by the time anyone got to the office. dueDate stays
 * exactly as it was (it's still the right value for "which calendar day is
 * this due", used for display and sorting); this module is only about the
 * separate question of when that day's deadline actually passes.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// mongoose.model() rather than require()ing User/Settings directly: this file
// loads before those models are guaranteed to be registered, and by the time
// this actually runs (inside a pre-save hook, mid-request) the model graph is
// always complete regardless of require order.
const modelOrNull = (name) => {
    try { return mongoose.model(name); } catch (e) { return null; }
};

// A clock time on a specific IST calendar day, expressed as the UTC instant
// it actually is. Not `new Date(y,m,d).setHours(...)`, which mutates in
// whatever timezone the Node process happens to be running in — the same trap
// recurringSchedule.js was written to avoid.
const istWallClockToUTC = (dateStr, hh, mm) => {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, mo - 1, d, hh, mm, 0) - IST_OFFSET_MS);
};

const DEFAULT_SHIFT_END = { DAY: '18:30', NIGHT: '04:00' };

/**
 * "End of shift" on a given due date, for whichever employee the task is
 * measured against.
 *
 * Night shift end times are small hours (e.g. 04:00), which are really the
 * next calendar morning — the same rollover attendanceCron already applies to
 * a night-shift punch. Without it, a night-shift task due "today" would be
 * marked overdue while that employee's shift hasn't even started yet.
 */
const shiftEndInstant = async (dueDateStr, assigneeId) => {
    const User = modelOrNull('User');
    const Settings = modelOrNull('Settings');

    const [assignee, settings] = await Promise.all([
        assigneeId && User ? User.findById(assigneeId).select('shiftType') : null,
        Settings ? Settings.findOne() : null
    ]);

    const isNight = assignee?.shiftType === 'NIGHT';
    const endStr = (isNight ? settings?.nightShiftEndTime : settings?.dayShiftEndTime)
        || (isNight ? DEFAULT_SHIFT_END.NIGHT : DEFAULT_SHIFT_END.DAY);
    const [hh, mm] = endStr.split(':').map(Number);

    let dateStr = dueDateStr;
    if (isNight && hh < 14) {
        const d = new Date(`${dueDateStr}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        dateStr = d.toISOString().slice(0, 10);
    }
    return istWallClockToUTC(dateStr, hh, mm);
};

/**
 * The instant a task should flip overdue. An explicit due time wins; absent
 * one, it's the primary assignee's shift end on the due date.
 *
 * "Primary assignee" (assignees[0]) rather than every assignee: Task already
 * treats the whole task as one unit with one status (see the model's own
 * comment on that), so one overdue instant for the group is consistent with
 * that, not a new inconsistency.
 */
const computeOverdueAt = async ({ dueDate, dueTime, assignees }) => {
    const dateStr = new Date(dueDate).toISOString().slice(0, 10);

    if (dueTime) {
        const [hh, mm] = dueTime.split(':').map(Number);
        return istWallClockToUTC(dateStr, hh, mm);
    }

    const primaryAssignee = Array.isArray(assignees) ? assignees[0] : assignees;
    return shiftEndInstant(dateStr, primaryAssignee);
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * A multipart body carries these as plain strings, empty when the assigner
 * left the time window closed — normalises all three together so a route
 * can't end up with a timeAllottedMinutes but no startTime, or a malformed
 * clock string reaching the schema.
 *
 * Shared by both routes/tasks.js and routes/recurringTasks.js — a schedule's
 * time window works exactly the same way a one-off task's does, just copied
 * onto each day's generated Task at creation instead of set once.
 */
const parseTimeWindow = (body) => ({
    startTime: TIME_RE.test(body.startTime) ? body.startTime : null,
    dueTime: TIME_RE.test(body.dueTime) ? body.dueTime : null,
    timeAllottedMinutes: body.timeAllottedMinutes && Number(body.timeAllottedMinutes) > 0
        ? Number(body.timeAllottedMinutes)
        : null
});

module.exports = { computeOverdueAt, istWallClockToUTC, shiftEndInstant, parseTimeWindow };
