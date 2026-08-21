import React, { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarDay } from '@fortawesome/free-solid-svg-icons';
import ScheduleCalendar from './ScheduleCalendar';
import '../styles/recurring.css';

/**
 * A form field that opens the day picker as a popover anchored beneath it.
 *
 * Deliberately not a centred modal: dimming the whole page to pick a date is
 * far heavier than the action deserves, and it hides the form you are filling
 * in. This drops open under the field like a normal date input would, and the
 * page behind stays visible and usable.
 *
 * The trigger and the popover share one wrapper so the click-outside handler
 * can tell "clicked the button" from "clicked away" — without that, clicking
 * the trigger to close would close and immediately reopen.
 */
const DatePickerField = ({
    displayValue,
    countBadge,
    isEmpty,
    disabled,
    ...calendarProps
}) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);

    useEffect(() => {
        if (!open) return;

        const onDown = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };

        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div className="rt-date-wrap" ref={wrapRef}>
            <button
                type="button"
                className={`rt-date-field ${isEmpty ? 'is-empty' : ''} ${open ? 'is-open' : ''}`}
                onClick={() => setOpen(v => !v)}
                disabled={disabled}
                aria-expanded={open}
            >
                <FontAwesomeIcon icon={faCalendarDay} />
                <span className="rt-date-value">{displayValue}</span>
                {countBadge && <span className="rt-date-count">{countBadge}</span>}
            </button>

            {open && (
                <div className="rt-popover">
                    <ScheduleCalendar {...calendarProps} />
                    <div className="rt-popover-foot">
                        <button type="button" className="rt-popover-done" onClick={() => setOpen(false)}>
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatePickerField;
