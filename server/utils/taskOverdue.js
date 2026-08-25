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
const DEFAULT_SHIFT_START = { DAY: '09:30', NIGHT: '19:30' };

// One lookup for both ends of the shift, so a task's window can't be built
// from two different reads of Settings.
const shiftFor = async (assigneeId) => {
    const User = modelOrNull('User');
    const Settings = modelOrNull('Settings');

    const [assignee, settings] = await Promise.all([
        assigneeId && User ? User.findById(assigneeId).select('shiftType') : null,
        Settings ? Settings.findOne() : null
    ]);

    const isNight = assignee?.shiftType === 'NIGHT';
    return {
        isNight,
        start: (isNight ? settings?.nightShiftStartTime : settings?.dayShiftStartTime)
            || (isNight ? DEFAULT_SHIFT_START.NIGHT : DEFAULT_SHIFT_START.DAY),
        end: (isNight ? settings?.nightShiftEndTime : settings?.dayShiftEndTime)
            || (isNight ? DEFAULT_SHIFT_END.NIGHT : DEFAULT_SHIFT_END.DAY)
    };
};

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
    const { isNight, end } = await shiftFor(assigneeId);
    const [hh, mm] = end.split(':').map(Number);

    let dateStr = dueDateStr;
    if (isNight && hh < 14) {
        const d = new Date(`${dueDateStr}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        dateStr = d.toISOString().slice(0, 10);
    }
    return istWallClockToUTC(dateStr, hh, mm);
};

/**
 * The other end of the same window: when the working day opens.
 *
 * No rollover here, unlike shiftEndInstant — a night shift *starts* on the
 * evening of its own date (19:30) and only its end spills into the next
 * morning, so shifting this forward would put the start after the end.
 */
const shiftStartInstant = async (startDateStr, assigneeId) => {
    const { start } = await shiftFor(assigneeId);
    const [hh, mm] = start.split(':').map(Number);
    return istWallClockToUTC(startDateStr, hh, mm);
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
/**
 * Which calendar day a stored Date stands for.
 *
 * Deliberately takes an explicit `dayStr` override, because the two creation
 * paths encode the day differently and neither can be read the same way:
 * a task from the client carries a bare 'YYYY-MM-DD' cast to UTC midnight,
 * while the recurring cron writes dayBounds(), which is *local* midnight —
 * on an IST server that is 18:30 the previous UTC day, so slicing its ISO
 * string yields the day before. A recurring occurrence knows its own date as
 * a string, so it passes that and the ambiguity disappears.
 */
const dayOf = (value, dayStr) => dayStr || new Date(value).toISOString().slice(0, 10);

const computeOverdueAt = async ({ dueDate, dueTime, assignees, dayStr }) => {
    const dateStr = dayOf(dueDate, dayStr);

    if (dueTime) {
        const [hh, mm] = dueTime.split(':').map(Number);
        return istWallClockToUTC(dateStr, hh, mm);
    }

    const primaryAssignee = Array.isArray(assignees) ? assignees[0] : assignees;
    return shiftEndInstant(dateStr, primaryAssignee);
};

/**
 * When the clock should be considered to start — the mirror of
 * computeOverdueAt, and the other half of "the whole day is shift start to
 * shift end".
 *
 * Without this the only available start was startDate, which is stored at
 * midnight UTC (05:30 IST) and therefore charged a task four hours of
 * elapsed time before the employee's day had even begun.
 *
 * Falls back to the due date when no startDate was given, so a task always
 * has a window rather than none.
 */
const computeExpectedStartAt = async ({ startDate, dueDate, startTime, assignees, dayStr }) => {
    const dateStr = dayOf(startDate || dueDate, dayStr);

    if (startTime) {
        const [hh, mm] = startTime.split(':').map(Number);
        return istWallClockToUTC(dateStr, hh, mm);
    }

    const primaryAssignee = Array.isArray(assignees) ? assignees[0] : assignees;
    return shiftStartInstant(dateStr, primaryAssignee);
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

module.exports = {
    computeOverdueAt,
    computeExpectedStartAt,
    istWallClockToUTC,
    shiftEndInstant,
    shiftStartInstant,
    parseTimeWindow
};
