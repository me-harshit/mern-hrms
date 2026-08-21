/**
 * Calendar-day helpers for recurring task schedules (TaskPlan.md §13).
 *
 * Everything here speaks 'YYYY-MM-DD' strings, matching what the API stores and
 * returns. A Date pins an instant; "which day is this task for" is not an
 * instant, and mixing the two is how a task ends up on the wrong day for anyone
 * not in the server's timezone.
 */

export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const ymd = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Local midnight for that calendar day, so weekday and day-arithmetic stay
// calendar-correct rather than drifting with the browser's offset.
export const parseYmd = (str) => {
    const [y, m, d] = String(str).split('-').map(Number);
    return new Date(y, m - 1, d);
};

export const todayYmd = () => ymd(new Date());

export const addDays = (str, n) => {
    const d = parseYmd(str);
    d.setDate(d.getDate() + n);
    return ymd(d);
};

export const weekdayOf = (str) => parseYmd(str).getDay();   // 0 = Sunday

export const isSunday = (str) => weekdayOf(str) === 0;

// "24 Aug 2026" — unambiguous, unlike 08/24/2026 which reads differently
// depending on who is looking at it. Matches shortDate() in taskHelpers.
export const prettyDate = (str) => {
    if (!str) return '—';
    return parseYmd(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const prettyDayMonth = (str) => {
    if (!str) return '—';
    return parseYmd(str).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

export const monthLabel = (year, month) =>
    new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/**
 * Weeks of a month as a 7-column grid, padded with nulls so every row is full
 * and the columns line up under the weekday headers.
 */
export const monthMatrix = (year, month) => {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = first.getDay();

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(ymd(new Date(year, month, d)));
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
};

// Every day from a..b inclusive, in order, whichever way round they were given.
export const datesBetween = (a, b) => {
    const [from, to] = a <= b ? [a, b] : [b, a];
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
};

export const addMonths = (year, month, n) => {
    const d = new Date(year, month + n, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
};
