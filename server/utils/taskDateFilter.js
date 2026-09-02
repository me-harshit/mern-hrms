const { todayIST, addDays, dayBounds, isValidDateStr } = require('./recurringSchedule');

/**
 * The Today/Yesterday/Week/Month/All/Custom window the task lists share with
 * the attendance and expense screens.
 *
 * Week and Month are rolling windows (the last 7 and 30 days) rather than
 * calendar boundaries, because that is what /attendance/all-logs and
 * /expenses already mean by those labels and two pages offering the same
 * six buttons should not quietly disagree about which days they cover.
 */
const PRESETS = ['Today', 'Yesterday', 'Week', 'Month', 'All', 'Custom'];

const windowFor = (filterType, fromDate, toDate) => {
    const today = todayIST();

    switch (filterType) {
        case 'Today':
            return { from: today, to: today };
        case 'Yesterday': {
            const y = addDays(today, -1);
            return { from: y, to: y };
        }
        case 'Week':
            return { from: addDays(today, -7), to: today };
        case 'Month':
            return { from: addDays(today, -30), to: today };
        case 'Custom': {
            // Either end may stand alone: "everything since the 1st" and
            // "everything up to the 15th" are both things people ask for, and
            // one end is also the halfway state while a range is being picked.
            // Neither end means no restriction at all.
            const from = isValidDateStr(fromDate) ? fromDate : null;
            const to = isValidDateStr(toDate) ? toDate : null;
            if (!from && !to) return null;
            if (from && to && from > to) return { from: to, to: from };
            return { from, to };
        }
        default:
            return null; // 'All', absent, or anything unrecognised
    }
};

/**
 * Mongo condition restricting tasks to that window, or null for no restriction.
 *
 * Which day a task belongs to is not simply its dueDate. For a task generated
 * by a recurring schedule, occurrenceDate is the authoritative calendar day —
 * the same rule taskOverdue's dayOf() follows — because a generated task
 * carries the schedule's end-of-day dueDate, which can land on the next day
 * once a time window is applied. Reading dueDate for those would file a
 * Monday occurrence under Tuesday.
 *
 * So the two kinds are matched on their own terms: occurrenceDate as a
 * YYYY-MM-DD string (lexicographic comparison is calendar-correct in that
 * format), and dueDate against local day bounds, matching how the rest of the
 * app queries Date fields. `occurrenceDate: null` also matches documents that
 * predate the field, which is why the one-off arm is written that way.
 */
const buildTaskDateFilter = (filterType, fromDate, toDate) => {
    const win = windowFor(filterType, fromDate, toDate);
    if (!win) return null;

    // Built up a bound at a time so an open-ended Custom range stays open at
    // the end the caller left blank.
    const occ = { $ne: null };
    const due = {};
    if (win.from) {
        occ.$gte = win.from;
        due.$gte = dayBounds(win.from).start;
    }
    if (win.to) {
        occ.$lte = win.to;
        due.$lte = dayBounds(win.to).end;
    }

    return {
        $or: [
            { occurrenceDate: occ },
            { occurrenceDate: null, dueDate: due }
        ]
    };
};

module.exports = { PRESETS, windowFor, buildTaskDateFilter };
