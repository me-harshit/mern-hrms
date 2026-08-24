import React, { useEffect, useState } from 'react';
import '../styles/taskCountdown.css';

/**
 * A live-reducing progress bar for a task's explicit time window
 * (TaskPlan.md §16). Deliberately not shown for tasks that only have the
 * shift-end fallback — that instant isn't something the assigner actually
 * chose, so putting a countdown on it would read as a precision the app
 * doesn't have.
 *
 * hasTimeWindow() is the gate every call site uses to decide whether to
 * mount <TaskCountdown> at all, rather than TaskCountdown early-returning
 * internally — a card list can have dozens of tasks with no window, and
 * each of those would otherwise still subscribe to the shared clock below
 * for nothing every render.
 */
export const hasTimeWindow = (task) =>
    Boolean(task && task.startTime && task.dueTime && task.status !== 'Completed');

// One ticking clock shared by every mounted countdown, rather than a
// setInterval per card — a board can have a few dozen of these at once.
const listeners = new Set();
let tickId = null;
const startTicking = () => {
    if (tickId) return;
    tickId = setInterval(() => listeners.forEach((fn) => fn(Date.now())), 1000);
};
const stopTickingIfIdle = () => {
    if (listeners.size === 0 && tickId) {
        clearInterval(tickId);
        tickId = null;
    }
};

const useClockNow = () => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        startTicking();
        listeners.add(setNow);
        return () => {
            listeners.delete(setNow);
            stopTickingIfIdle();
        };
    }, []);
    return now;
};

const formatDuration = (ms) => {
    const totalSec = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};

// A clock time on the task's due date, as the UTC instant it actually is —
// mirrors istWallClockToUTC on the server, but the browser's Date parser
// already does this correctly given an explicit offset, so there's no need
// to hand-roll the arithmetic here.
const istInstant = (dueDate, hhmm) => new Date(`${new Date(dueDate).toISOString().slice(0, 10)}T${hhmm}:00+05:30`).getTime();

const TaskCountdown = ({ task, compact = false }) => {
    const now = useClockNow();

    const start = istInstant(task.dueDate, task.startTime);
    // overdueAt is the same instant the server's own overdue queries use —
    // preferring it here keeps this bar and every "Overdue" badge elsewhere
    // in perfect agreement. Falls back to recomputing it only if a caller
    // somehow has the time fields but not overdueAt.
    const end = task.overdueAt ? new Date(task.overdueAt).getTime() : istInstant(task.dueDate, task.dueTime);
    if (!(end > start)) return null; // a malformed window shouldn't render nonsense

    const total = end - start;
    const elapsed = Math.min(Math.max(now - start, 0), total);
    const pct = Math.min((elapsed / total) * 100, 100);
    const remaining = end - now;
    const overdue = remaining <= 0;

    const tone = overdue ? 'over' : pct >= 85 ? 'critical' : pct >= 50 ? 'warn' : 'ok';

    return (
        <div className={`tcd tcd-${tone} ${compact ? 'is-compact' : ''}`}>
            <div className="tcd-bar">
                <div className="tcd-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="tcd-text">
                {overdue ? `Overdue by ${formatDuration(-remaining)}` : `${formatDuration(remaining)} left`}
            </span>
        </div>
    );
};

export default TaskCountdown;
