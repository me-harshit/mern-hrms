const Holiday = require('../models/Holiday');

// A day of salary is always a thirtieth of the base, whatever the calendar
// says. February and August both pay base/30 per day, so a day of absence
// costs an employee the same amount in every month of the year.
const STANDARD_MONTH_DAYS = 30;

// Attendance stores dates unpadded as D/M/YYYY. Everything here speaks the
// same key so calendar days and attendance rows can be matched directly.
const dateKey = (d) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

/**
 * Splits a payroll month into working days, Sundays and official holidays,
 * and works out every stretch of consecutive days off along with the working
 * day on each side of it — the two days that decide whether that stretch is
 * sandwiched between absences.
 *
 * Saturday is a working day here; Sunday is the weekly off. A holiday that
 * lands on a Sunday is counted once, as the Sunday.
 */
const buildMonthCalendar = async (month, year) => {
    const daysInMonth = new Date(year, month, 0).getDate();

    // Reach a fortnight either side of the month: a run of days off at the
    // very start or end needs the working day beyond the month boundary, and
    // that neighbouring day may itself be a holiday.
    const rangeStart = new Date(year, month - 1, 1 - 14);
    const rangeEnd = new Date(year, month - 1, daysInMonth + 14, 23, 59, 59, 999);
    const holidayDocs = await Holiday.find({ date: { $gte: rangeStart, $lte: rangeEnd } }).sort({ date: 1 });

    const holidayNames = new Map();
    holidayDocs.forEach(h => holidayNames.set(dateKey(new Date(h.date)), h.name));

    const isNonWorking = (d) => d.getDay() === 0 || holidayNames.has(dateKey(d));

    const allDates = [], sundayDates = [], holidayDates = [], workingDates = [];
    // date -> 'sunday' | 'holiday' | 'working', so a day can be labelled
    // without re-deriving what kind of day it is.
    const dayTypes = {};
    const holidayNameByDate = {};
    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month - 1, day);
        const key = dateKey(d);
        allDates.push(key);
        if (d.getDay() === 0) {
            sundayDates.push(key);
            dayTypes[key] = 'sunday';
            // A holiday that lands on a Sunday is still worth naming.
            if (holidayNames.has(key)) holidayNameByDate[key] = holidayNames.get(key);
        } else if (holidayNames.has(key)) {
            holidayDates.push(key);
            dayTypes[key] = 'holiday';
            holidayNameByDate[key] = holidayNames.get(key);
        } else {
            workingDates.push(key);
            dayTypes[key] = 'working';
        }
    }

    const nonWorkingRuns = [];
    for (let day = 1; day <= daysInMonth; day++) {
        if (!isNonWorking(new Date(year, month - 1, day))) continue;

        const dates = [];
        let end = day;
        while (end <= daysInMonth && isNonWorking(new Date(year, month - 1, end))) {
            dates.push(dateKey(new Date(year, month - 1, end)));
            end++;
        }

        const before = new Date(year, month - 1, day - 1);
        while (isNonWorking(before)) before.setDate(before.getDate() - 1);
        const after = new Date(year, month - 1, end);
        while (isNonWorking(after)) after.setDate(after.getDate() + 1);

        nonWorkingRuns.push({
            dates,
            // Only the Sundays in the run can ever be charged. A holiday is a
            // day the company gave; it stays paid even when it falls between
            // two absences.
            sundayDates: dates.filter(k => dayTypes[k] === 'sunday'),
            prevWorkingDate: dateKey(before),
            nextWorkingDate: dateKey(after)
        });
        day = end - 1;
    }

    // The flanking days a sandwich check needs, including the ones that fall
    // in the previous or next month, so attendance can be fetched for them.
    const flankDates = [...new Set(nonWorkingRuns.flatMap(r => [r.prevWorkingDate, r.nextWorkingDate]))];

    return {
        daysInMonth,
        sundays: sundayDates.length,
        holidays: holidayDates.length,
        workingDays: workingDates.length,
        holidayList: holidayDates.map(key => ({ date: key, name: holidayNames.get(key) })),
        sundayDates,
        holidayDates,
        allDates,
        dayTypes,
        holidayNameByDate,
        nonWorkingRuns,
        flankDates
    };
};

/**
 * The sandwich rule: a Sunday surrounded by absence is not a paid day off.
 * If someone is away on the Saturday and away again on the Monday, the Sunday
 * between them is deducted too.
 *
 * Official holidays are never charged, even when they sit inside the same
 * stretch — a holiday is the company's day to give, so being absent around it
 * does not take it away. A holiday still counts for working out which working
 * days flank the stretch; it just is not billed.
 *
 * `isAwayOn(dateKey)` decides what "away" means for one employee.
 * Returns the dates to deduct, so the payslip can name them.
 */
const sandwichedDates = (nonWorkingRuns, isAwayOn) => {
    const dates = [];
    nonWorkingRuns.forEach(run => {
        if (isAwayOn(run.prevWorkingDate) && isAwayOn(run.nextWorkingDate)) {
            dates.push(...run.sundayDates);
        }
    });
    return dates;
};

module.exports = { STANDARD_MONTH_DAYS, dateKey, buildMonthCalendar, sandwichedDates };
