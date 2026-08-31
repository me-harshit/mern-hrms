/**
 * Casual leave is credited on the 1st of every month: one day, to everyone.
 *
 * `user.leavesLastReset` records the month last credited, always stored as the
 * 1st of that month. Accrual runs opportunistically — whenever a page reads the
 * balance — so it must not matter *when* it runs. Crediting advances the marker
 * past the month it paid for, so a month is never credited twice, and an
 * employee who does not log in from January to June gets all six days the first
 * time anyone looks.
 *
 * Anything that sets a balance by hand must stamp the marker at the same time,
 * or the next accrual will back-fill every month since the old one and undo the
 * correction. `stampBalanceAnchor` exists so that is one call, not a line
 * someone can forget.
 */

// Casual leave credited on the 1st of each month.
const CL_PER_MONTH = 1;

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

// Months are counted as calendar boundaries crossed, not elapsed days: from any
// day in July to any day in August is one crossing, because the 1st of August
// fell between them.
const monthIndex = (date) => date.getFullYear() * 12 + date.getMonth();

/**
 * Brings a user's casual leave up to date. Mutates the user document and
 * returns true when something changed, so the caller can decide to save.
 * Does not save.
 */
const accrueCasualLeave = (user, now = new Date()) => {
    if (!user.leavesLastReset) {
        // No marker to measure from: treat this month as already credited
        // rather than guessing at history.
        user.leavesLastReset = startOfMonth(now);
        return true;
    }

    const anchor = new Date(user.leavesLastReset);
    const months = monthIndex(now) - monthIndex(anchor);
    if (months <= 0) return false;

    let balance = user.casualLeaveBalance || 0;
    for (let i = 1; i <= months; i++) {
        const credited = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
        // Casual leave does not carry across a calendar year.
        if (credited.getMonth() === 0) balance = 0;
        balance += CL_PER_MONTH;
    }

    user.casualLeaveBalance = balance;
    user.leavesLastReset = startOfMonth(now);
    return true;
};

/**
 * Call whenever a balance is set by hand. Marks this month as already credited,
 * so the figure just entered is the figure that stands until the 1st of next
 * month.
 */
const stampBalanceAnchor = (target) => {
    target.leavesLastReset = startOfMonth(new Date());
    return target;
};

module.exports = { CL_PER_MONTH, startOfMonth, monthIndex, accrueCasualLeave, stampBalanceAnchor };
