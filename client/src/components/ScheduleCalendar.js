import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import {
    WEEKDAY_LABELS, monthMatrix, monthLabel, addMonths, addDays,
    datesBetween, todayYmd, isSunday, parseYmd
} from '../utils/scheduleDates';
import '../styles/recurring.css';

/**
 * Two-month day picker for recurring task schedules (TaskPlan.md §13.6).
 *
 * Hand-rolled rather than pulled from a library because the value here is the
 * per-day annotation — greyed Sundays, named holidays, striped leave days for
 * the specific people being assigned. A generic picker fights that.
 *
 * Two modes:
 *
 *   mode="multi"  (recurring) drag a range Airbnb-style, then click individual
 *                 days to add or drop them.
 *                   click an empty day     -> anchors a range
 *                   click a selected day   -> removes just that day
 *                   click the anchor again -> selects that single day
 *
 *   mode="range"  (one-off task) a single contiguous start..due range. A second
 *                 range replaces the first rather than adding to it, because a
 *                 task has one start and one due date, not a set of days.
 *
 * Sundays and holidays stay *selectable* on purpose. Selecting one is not a
 * mistake — it counts toward the target, gets skipped on the day, and rolls the
 * schedule forward so the promised number of tasks still happens. The footer
 * spells that out rather than the calendar silently refusing the click.
 */

const QUICK_PICKS = [
    { label: 'Next 5 working days', days: 5 },
    { label: 'Next 7 working days', days: 7 },
    { label: 'Next 14 working days', days: 14 }
];

const ScheduleCalendar = ({
    selected = [],
    onChange,
    annotations = {},
    onVisibleRangeChange,
    minDate = todayYmd(),
    disabled = false,
    mode = 'multi'
}) => {
    const isRange = mode === 'range';
    const start = parseYmd(minDate);
    const [cursor, setCursor] = useState({ year: start.getFullYear(), month: start.getMonth() });
    const [anchor, setAnchor] = useState(null);
    const [hover, setHover] = useState(null);

    const second = addMonths(cursor.year, cursor.month, 1);

    // The parent owns annotation fetching, so it needs to know what is on screen.
    useEffect(() => {
        if (!onVisibleRangeChange) return;
        const from = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(second.year, second.month + 1, 0).getDate();
        const to = `${second.year}-${String(second.month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        onVisibleRangeChange(from, to);
    }, [cursor.year, cursor.month, second.year, second.month, onVisibleRangeChange]);

    const selectedSet = useMemo(() => new Set(selected), [selected]);

    // date -> [names], so a day can say who is away without a lookup per cell.
    const leaveByDate = useMemo(() => {
        const map = {};
        Object.values(annotations.leaves || {}).forEach(({ name, dates }) => {
            (dates || []).forEach(d => {
                if (!map[d]) map[d] = [];
                map[d].push(name);
            });
        });
        return map;
    }, [annotations.leaves]);

    const holidays = annotations.holidays || {};

    // The range being previewed between the anchor and whatever is hovered.
    const previewSet = useMemo(() => {
        if (!anchor || !hover) return new Set();
        return new Set(datesBetween(anchor, hover));
    }, [anchor, hover]);

    const commit = useCallback((dates) => {
        onChange([...new Set(dates)].sort());
    }, [onChange]);

    const handleClick = (day) => {
        if (disabled || !day || day < minDate) return;

        if (anchor === null) {
            // In range mode any click starts a fresh range; in multi mode a
            // click on something already chosen means "drop this one".
            if (!isRange && selectedSet.has(day)) {
                commit(selected.filter(d => d !== day));
            } else {
                setAnchor(day);
                if (isRange) commit([day]);
            }
            return;
        }

        // Second click closes the range — a single day if it lands on the anchor.
        const range = datesBetween(anchor, day).filter(d => d >= minDate);
        commit(isRange ? range : [...selected, ...range]);
        setAnchor(null);
        setHover(null);
    };

    const quickPick = (count) => {
        // "Working days" means what the schedule will actually skip: Sundays and
        // company holidays. Leave is per-person and handled on the day itself.
        const out = [];
        let d = todayYmd();
        let guard = 0;
        while (out.length < count && guard++ < 120) {
            if (!isSunday(d) && !holidays[d]) out.push(d);
            d = addDays(d, 1);
        }
        commit(out);
        setAnchor(null);
    };

    const clearAll = () => {
        commit([]);
        setAnchor(null);
        setHover(null);
    };

    const renderMonth = ({ year, month }) => (
        <div className="sc-month" key={`${year}-${month}`}>
            <div className="sc-month-label">{monthLabel(year, month)}</div>

            <div className="sc-weekdays">
                {WEEKDAY_LABELS.map((w, i) => (
                    <span key={i} className={i === 0 ? 'sc-weekday is-sun' : 'sc-weekday'}>{w}</span>
                ))}
            </div>

            <div className="sc-grid">
                {monthMatrix(year, month).map((week, wi) =>
                    week.map((day, di) => {
                        if (!day) return <span key={`${wi}-${di}`} className="sc-day is-empty" />;

                        const past = day < minDate;
                        const holidayName = holidays[day];
                        const away = leaveByDate[day];
                        const isSelected = selectedSet.has(day);
                        const inPreview = previewSet.has(day);

                        const title = [
                            holidayName ? `Holiday: ${holidayName}` : null,
                            away?.length ? `${away.join(', ')} on leave` : null,
                            isSunday(day) ? 'Sunday' : null,
                            past ? 'In the past' : null
                        ].filter(Boolean).join(' · ');

                        const classes = [
                            'sc-day',
                            past ? 'is-past' : '',
                            isSelected ? 'is-selected' : '',
                            inPreview && !isSelected ? 'in-preview' : '',
                            anchor === day ? 'is-anchor' : '',
                            isSunday(day) ? 'is-sunday' : '',
                            holidayName ? 'is-holiday' : '',
                            away?.length ? 'is-leave' : '',
                            day === todayYmd() ? 'is-today' : ''
                        ].filter(Boolean).join(' ');

                        return (
                            <button
                                type="button"
                                key={day}
                                className={classes}
                                title={title || undefined}
                                disabled={past || disabled}
                                onClick={() => handleClick(day)}
                                onMouseEnter={() => anchor && setHover(day)}
                            >
                                {parseYmd(day).getDate()}
                                {(holidayName || away?.length) && <span className="sc-dot" />}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );

    return (
        <div className={`sc-wrap ${disabled ? 'is-disabled' : ''}`}>
            {(!isRange || selected.length > 0) && (
                <div className="sc-quickpicks">
                    {!isRange && QUICK_PICKS.map(q => (
                        <button type="button" key={q.days} className="sc-quick" onClick={() => quickPick(q.days)}>
                            {q.label}
                        </button>
                    ))}
                    {selected.length > 0 && (
                        <button type="button" className="sc-quick is-clear" onClick={clearAll}>
                            Clear
                        </button>
                    )}
                </div>
            )}

            <div className="sc-head">
                <button
                    type="button" className="sc-nav" aria-label="Previous month"
                    onClick={() => setCursor(addMonths(cursor.year, cursor.month, -1))}
                >
                    <FontAwesomeIcon icon={faChevronLeft} />
                </button>
                <span className="sc-hint">
                    {anchor
                        ? (isRange ? 'Now click the due date' : 'Now click the last day of the range')
                        : isRange
                            ? 'Click the start date, then the due date'
                            : 'Click a day to start a range, or click a chosen day to drop it'}
                </span>
                <button
                    type="button" className="sc-nav" aria-label="Next month"
                    onClick={() => setCursor(addMonths(cursor.year, cursor.month, 1))}
                >
                    <FontAwesomeIcon icon={faChevronRight} />
                </button>
            </div>

            <div className="sc-months" onMouseLeave={() => setHover(null)}>
                {renderMonth(cursor)}
                {renderMonth(second)}
            </div>

            <div className="sc-legend">
                <span><i className="sc-key is-selected" /> Selected</span>
                <span><i className="sc-key is-sunday" /> Sunday</span>
                <span><i className="sc-key is-holiday" /> Holiday</span>
                <span><i className="sc-key is-leave" /> On leave</span>
            </div>
        </div>
    );
};

export default ScheduleCalendar;
