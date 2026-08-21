const Holiday = require('../models/Holiday');
const Leave = require('../models/Leave');
const User = require('../models/User');

/**
 * The rules engine behind recurring daily tasks (TaskPlan.md §13).
 *
 * Both the preview endpoint and the nightly cron consume this, so a manager
 * never sees a projection the generator would disagree with. Nothing in here
 * touches the database beyond three read queries — it is pure enough to reason
 * about and to test on its own.
 */

// A schedule may only trail this many days past its planned tail before we stop
// extending it. A fortnight of sick leave should stall and surface, not quietly
// drag a "daily" task into next quarter.
const MAX_ROLL_FORWARD_DAYS = 30;

// ============================================================
// DATE HELPERS — everything is a 'YYYY-MM-DD' string
// ============================================================
//
// Dates are strings, not Date objects, for the same reason Attendance.date is a
// string: a Date pins an instant, and "which calendar day is this task for" is
// not an instant. Storing Date objects here is how you get tasks landing a day
// early on a UTC server.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Round-tripping is the check that matters: new Date(2026, 12, 45) is not an
// error in JS, it rolls silently over into January 2027. Only a string that
// survives parse-and-reformat unchanged is a real calendar day.
const isValidDateStr = (s) =>
    typeof s === 'string' && DATE_RE.test(s) && fmt(parseDay(s)) === s;

const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// A local-midnight Date for that calendar day. Local rather than UTC so the
// weekday and the day arithmetic below are calendar-correct wherever this runs.
const parseDay = (dateStr) => {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    return new Date(y, m - 1, d);
};

// "Today" as the office experiences it. Derived from the instant rather than
// from server local time, because a preview request can arrive from anywhere
// and a UTC VPS rolls its date over at 05:30 IST.
const todayIST = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

const addDays = (dateStr, n) => {
    const d = parseDay(dateStr);
    d.setDate(d.getDate() + n);
    return fmt(d);
};

const weekday = (dateStr) => parseDay(dateStr).getDay(); // 0 = Sunday

// Local day bounds, matching how attendanceCron queries Leave and Holiday, so
// records created by either path are found by both.
const dayBounds = (dateStr) => {
    const start = parseDay(dateStr);
    const end = parseDay(dateStr);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

// A stored Date -> the calendar day it represents.
const dateToStr = (d) => fmt(new Date(d));

// ============================================================
// LEAVE: full day vs half day
// ============================================================

/**
 * A half day does not excuse the task — someone in for half a day can still
 * write a LinkedIn post. Only the first and last day of a leave range can be
 * halves (see Leave.startHalf / endHalf); everything in between is full.
 */
const isFullDayLeave = (leave, dateStr) => {
    const from = dateToStr(leave.fromDate);
    const to = dateToStr(leave.toDate);

    if (dateStr === from && leave.startHalf && leave.startHalf !== 'FULL') return false;
    if (dateStr === to && leave.endHalf && leave.endHalf !== 'FULL') return false;

    return true;
};

// ============================================================
// ELIGIBILITY CONTEXT
// ============================================================

const DEFAULT_RULES = { skipSundays: true, skipHolidays: true, skipOnLeave: true };

/**
 * Pre-loads everything needed to answer "should <user> get a task on <date>?"
 * for a whole date range in three queries, then answers each question in
 * memory. A 30-day preview across 5 assignees is 150 checks; doing those as
 * queries would be absurd.
 *
 * Note WFH is deliberately not consulted. Working from home is working.
 */
const buildEligibility = async (dateStrs, userIds, rules = {}) => {
    const { skipSundays, skipHolidays, skipOnLeave } = { ...DEFAULT_RULES, ...rules };

    const sorted = [...new Set(dateStrs)].filter(isValidDateStr).sort();
    const ids = userIds.map(String);

    // An empty range still has to produce a working checker.
    if (sorted.length === 0 || ids.length === 0) {
        return { check: () => ({ ok: true }), users: new Map(), holidays: new Map() };
    }

    const rangeStart = dayBounds(sorted[0]).start;
    const rangeEnd = dayBounds(sorted[sorted.length - 1]).end;

    const [holidayDocs, leaveDocs, userDocs] = await Promise.all([
        skipHolidays
            ? Holiday.find({ date: { $gte: rangeStart, $lte: rangeEnd } }).select('name date')
            : [],
        skipOnLeave
            ? Leave.find({
                userId: { $in: ids },
                status: 'Approved',
                fromDate: { $lte: rangeEnd },
                toDate: { $gte: rangeStart }
            }).select('userId fromDate toDate startHalf endHalf')
            : [],
        User.find({ _id: { $in: ids } }).select('name status')
    ]);

    const holidays = new Map();
    for (const h of holidayDocs) holidays.set(dateToStr(h.date), h.name);

    // userId -> leaves, so the per-day check is a short walk not a full scan.
    const leavesByUser = new Map();
    for (const l of leaveDocs) {
        const key = String(l.userId);
        if (!leavesByUser.has(key)) leavesByUser.set(key, []);
        leavesByUser.get(key).push(l);
    }

    const users = new Map();
    for (const u of userDocs) users.set(String(u._id), u);

    /**
     * @returns {{ok: true}} or {{ok: false, reason: string}}
     *
     * Order matters: the reason shown to the manager should be the most
     * fundamental one. Someone deactivated while on leave reads better as
     * "no longer active" than "on leave".
     */
    const check = (dateStr, userId) => {
        const key = String(userId);

        const user = users.get(key);
        if (!user) return { ok: false, reason: 'Employee not found' };
        if (user.status !== 'ACTIVE') return { ok: false, reason: 'Employee no longer active' };

        if (skipSundays && weekday(dateStr) === 0) return { ok: false, reason: 'Sunday' };

        if (skipHolidays && holidays.has(dateStr)) {
            return { ok: false, reason: `Holiday: ${holidays.get(dateStr)}` };
        }

        if (skipOnLeave) {
            const onLeave = (leavesByUser.get(key) || []).some((l) => {
                const from = dateToStr(l.fromDate);
                const to = dateToStr(l.toDate);
                return dateStr >= from && dateStr <= to && isFullDayLeave(l, dateStr);
            });
            if (onLeave) return { ok: false, reason: 'On approved leave' };
        }

        return { ok: true };
    };

    return { check, users, holidays };
};

// ============================================================
// ROLL-FORWARD
// ============================================================

/**
 * Projects how a schedule will actually play out for one person.
 *
 * The rule that matters (TaskPlan.md §13.4): a day the manager *deselected* is
 * simply not in plannedDates and does not extend anything. A day the *system*
 * skips — Sunday, holiday, leave — appends one more day at the tail, so the
 * agreed number of tasks still gets done.
 *
 * Extension is one calendar day at a time rather than "next working day",
 * deliberately. If the appended day is itself a Sunday it will skip and extend
 * again when it comes around. That converges on the same answer without this
 * function having to predict leave that has not been approved yet.
 */
const projectForUser = (plannedDates, userId, check, targetCount) => {
    const timeline = [];
    let generated = 0;
    let cursor = 0;
    let extras = 0;

    // plannedDates is already sorted and deduped by the caller.
    const queue = [...plannedDates];

    while (cursor < queue.length && generated < targetCount) {
        const date = queue[cursor++];
        const verdict = check(date, userId);

        if (verdict.ok) {
            generated++;
            timeline.push({ date, willRun: true, reason: null });
            continue;
        }

        timeline.push({ date, willRun: false, reason: verdict.reason });

        // Deactivated employees are not a scheduling problem — extending the
        // schedule would never find them a working day.
        const permanent = verdict.reason === 'Employee no longer active' ||
            verdict.reason === 'Employee not found';
        if (permanent) break;

        if (extras >= MAX_ROLL_FORWARD_DAYS) {
            timeline.push({ date: null, willRun: false, reason: 'Roll-forward limit reached', stalled: true });
            break;
        }

        extras++;
        queue.push(addDays(queue[queue.length - 1], 1));
    }

    const runDays = timeline.filter((t) => t.willRun);

    return {
        timeline,
        generated,
        extraDates: queue.slice(plannedDates.length),
        stalled: extras >= MAX_ROLL_FORWARD_DAYS && generated < targetCount,
        endsOn: runDays.length ? runDays[runDays.length - 1].date : null
    };
};

/**
 * Same projection across every assignee. Used by the preview endpoint to render
 * the calendar footer, and nowhere else — the cron re-evaluates day by day
 * against live data rather than trusting a projection made days earlier.
 */
const projectSchedule = async (plannedDates, userIds, rules = {}) => {
    const planned = [...new Set(plannedDates)].filter(isValidDateStr).sort();
    const targetCount = planned.length;

    // Look far enough past the tail that roll-forward can be projected too.
    const lookahead = [];
    if (planned.length) {
        let d = planned[planned.length - 1];
        for (let i = 0; i < MAX_ROLL_FORWARD_DAYS + 1; i++) lookahead.push((d = addDays(d, 1)));
    }

    const { check, users } = await buildEligibility([...planned, ...lookahead], userIds, rules);

    const perUser = userIds.map((id) => {
        const projection = projectForUser(planned, id, check, targetCount);
        return {
            userId: String(id),
            name: users.get(String(id))?.name || 'Unknown',
            ...projection
        };
    });

    return { plannedDates: planned, targetCount, perUser };
};

module.exports = {
    MAX_ROLL_FORWARD_DAYS,
    isValidDateStr,
    todayIST,
    addDays,
    weekday,
    dayBounds,
    dateToStr,
    fmt,
    parseDay,
    isFullDayLeave,
    buildEligibility,
    projectForUser,
    projectSchedule
};
