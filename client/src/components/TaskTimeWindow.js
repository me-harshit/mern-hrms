import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import '../styles/taskTimeWindow.css';

// "HH:MM" now, rounded down to the nearest 5 minutes so it doesn't read like
// a random number when the assigner glances back at it.
const nowClock = () => {
    const d = new Date();
    const m = Math.floor(d.getMinutes() / 5) * 5;
    return `${String(d.getHours()).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const addMinutes = (hhmm, mins) => {
    const [h, m] = hhmm.split(':').map(Number);
    const total = (h * 60 + m + mins) % 1440; // wraps past midnight rather than overflowing the input
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * The optional time-of-day window on a task's due date (TaskPlan.md §16):
 * an optional amount of time allotted, and a start/due clock time either
 * derived from it or set directly.
 *
 * Deliberately not shown for recurring schedules — see the note on
 * overdueAt in models/Task.js for why those keep their existing, more
 * lenient end-of-day behaviour untouched.
 *
 * Collapsed by default so the common case (no time window) stays a one-line
 * affordance; opens automatically if the task being edited already has one.
 */
const TaskTimeWindow = ({ startTime, dueTime, timeAllottedMinutes, onChange }) => {
    const hasWindow = Boolean(startTime || dueTime || timeAllottedMinutes);
    const [open, setOpen] = useState(hasWindow);

    const allottedHours = timeAllottedMinutes ? timeAllottedMinutes / 60 : '';

    const openPanel = () => {
        setOpen(true);
        if (!startTime) onChange({ startTime: nowClock() });
    };

    const setAllotted = (hoursStr) => {
        const hours = hoursStr === '' ? '' : Number(hoursStr);
        const minutes = hours === '' ? '' : Math.round(hours * 60);
        const start = startTime || nowClock();
        onChange({
            timeAllottedMinutes: minutes,
            startTime: start,
            dueTime: minutes === '' ? dueTime : addMinutes(start, minutes)
        });
    };

    const setStart = (value) => {
        onChange({
            startTime: value,
            dueTime: timeAllottedMinutes ? addMinutes(value, timeAllottedMinutes) : dueTime
        });
    };

    if (!open) {
        return (
            <button type="button" className="ttw-toggle" onClick={openPanel}>
                <FontAwesomeIcon icon={faClock} /> Set a specific time window
                <span className="ttw-toggle-hint">Optional — otherwise due at end of shift</span>
            </button>
        );
    }

    return (
        <div className="ttw-panel">
            <button type="button" className="ttw-toggle is-open" onClick={() => setOpen(false)}>
                <FontAwesomeIcon icon={faClock} /> Time window
                <FontAwesomeIcon icon={faChevronUp} className="ttw-collapse-icon" />
            </button>

            <div className="ttw-row">
                <div className="ttw-field">
                    <label className="input-label">Allotted (hrs)</label>
                    <input
                        type="number" min="0.5" step="0.5" className="custom-input"
                        placeholder="2"
                        value={allottedHours}
                        onChange={(e) => setAllotted(e.target.value)}
                    />
                </div>
                <div className="ttw-field">
                    <label className="input-label">Start time</label>
                    <input
                        type="time" className="custom-input"
                        value={startTime || ''}
                        onChange={(e) => setStart(e.target.value)}
                    />
                </div>
                <div className="ttw-field">
                    <label className="input-label">Due / end time</label>
                    <input
                        type="time" className="custom-input"
                        value={dueTime || ''}
                        onChange={(e) => onChange({ dueTime: e.target.value })}
                    />
                </div>
            </div>
            <small className="ttw-hint">
                Overdue is measured from this time. Leave it blank and the task is only
                overdue once the assignee's shift ends on the due date.
            </small>
        </div>
    );
};

export default TaskTimeWindow;
