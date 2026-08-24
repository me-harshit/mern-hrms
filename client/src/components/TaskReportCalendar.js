import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight, faCircleUser } from '@fortawesome/free-solid-svg-icons';
import api from '../utils/api';
import Avatar from './Avatar';
import { slug } from '../utils/taskHelpers';
import '../styles/taskReportCalendar.css';

const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_LABEL = { pending: 'Pending', inprogress: 'In Progress', onhold: 'On Hold', completed: 'Completed' };

const pad2 = (n) => String(n).padStart(2, '0');
const monthStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// dueDate is UTC-midnight-of-its-calendar-day (see the server-side note on
// computeOverdueAt) — read it with UTC getters, not local ones, or a viewer
// west of Greenwich sees every task shifted a day early.
const dueDateKey = (iso) => {
    const d = new Date(iso);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

// Overdue overrides the visual bucket (red) unless the task is done — the
// same rule every other overdue badge in the app already follows; it is a
// modifier on the real status, not a fifth status of its own.
const bucketOf = (task, now) => {
    if (task.status === 'Completed') return 'completed';
    if (task.overdueAt && new Date(task.overdueAt) < now) return 'blocked';
    return slug(task.status);
};

const TaskReportCalendar = () => {
    const today = useMemo(() => new Date(), []);
    const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
    const [data, setData] = useState({ tasks: [], todayIdle: { date: '', count: 0, employees: [] } });
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/tasks/calendar', { params: { month: monthStr(cursor) } });
            setData(res.data);
        } catch (err) {
            console.error('Failed to load the task calendar', err);
            Swal.fire('Error', 'Could not load the calendar.', 'error');
        } finally {
            setLoading(false);
        }
    }, [cursor]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { setSelectedDay(null); }, [cursor]);

    const tasksByDay = useMemo(() => {
        const map = new Map();
        data.tasks.forEach((t) => {
            const key = dueDateKey(t.dueDate);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(t);
        });
        return map;
    }, [data.tasks]);

    const todayKey = dateKey(today);
    const cells = useMemo(() => {
        const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const startPad = firstOfMonth.getDay();
        const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        const list = [];
        for (let i = 0; i < startPad; i++) list.push(null);
        for (let d = 1; d <= daysInMonth; d++) list.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
        return list;
    }, [cursor]);

    const dayTasks = selectedDay ? (tasksByDay.get(selectedDay) || []) : [];
    const isTodaySelected = selectedDay === todayKey;

    return (
        <div className="trc">
            <div className="trc-head">
                <h2>{cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
                <div className="trc-nav">
                    <button type="button" onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))} aria-label="Previous month">
                        <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    <button
                        type="button" className="trc-today-btn"
                        onClick={() => { const t = new Date(); setCursor(new Date(t.getFullYear(), t.getMonth(), 1)); setSelectedDay(dateKey(t)); }}
                    >
                        Today
                    </button>
                    <button type="button" onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))} aria-label="Next month">
                        <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                </div>
            </div>

            <div className="trc-legend">
                <span><i className="dot pending" />Pending</span>
                <span><i className="dot inprogress" />In progress</span>
                <span><i className="dot onhold" />On hold</span>
                <span><i className="dot completed" />Completed</span>
                <span><i className="dot blocked" />Overdue</span>
            </div>

            {loading ? (
                <div className="trc-loading">Loading…</div>
            ) : (
                <div className="trc-grid">
                    {DOWS.map(d => <div key={d} className="trc-dow">{d}</div>)}
                    {cells.map((d, i) => {
                        if (!d) return <div key={'e' + i} className="trc-cell empty" />;
                        const key = dateKey(d);
                        const dayTs = tasksByDay.get(key) || [];
                        const buckets = {};
                        dayTs.forEach(t => { const b = bucketOf(t, today); buckets[b] = (buckets[b] || 0) + 1; });
                        const overdueCount = buckets.blocked || 0;
                        return (
                            <button
                                type="button" key={key}
                                className={`trc-cell ${key === todayKey ? 'is-today' : ''} ${key === selectedDay ? 'is-selected' : ''}`}
                                onClick={() => setSelectedDay(key === selectedDay ? null : key)}
                            >
                                <span className="trc-daynum">{d.getDate()}</span>
                                {dayTs.length > 0 && (
                                    <>
                                        <span className="trc-bars">
                                            {Object.entries(buckets).map(([b, c]) => (
                                                <span key={b} className={`trc-bar ${b}`} style={{ width: `${Math.min(100, c * 24)}%` }} />
                                            ))}
                                        </span>
                                        <span className={`trc-count ${overdueCount ? 'has-overdue' : ''}`}>
                                            {dayTs.length} task{dayTs.length > 1 ? 's' : ''}{overdueCount ? ` · ${overdueCount} overdue` : ''}
                                        </span>
                                    </>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {selectedDay && (
                <div className="trc-panel">
                    <h3>
                        {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' })}
                        {' — '}{dayTasks.length} task{dayTasks.length !== 1 ? 's' : ''} due
                    </h3>

                    {dayTasks.length === 0 ? (
                        <p className="trc-empty">Nothing due this day.</p>
                    ) : (
                        <div className="trc-items">
                            {dayTasks.map(t => (
                                <a key={t._id} className="trc-item" href={`/task/${t._id}`}>
                                    <span className={`dot ${bucketOf(t, today)}`} />
                                    <span className="trc-item-title">{t.title}</span>
                                    <span className="trc-item-type">{t.assignmentType}</span>
                                    <span className="trc-item-who">
                                        {(t.assignees || []).map(a => (
                                            <Avatar key={a._id} name={a.name} profilePic={a.profilePic} className="assignee-avatar tiny" title={a.name} />
                                        ))}
                                        {(t.assignees || []).length === 1 && <span>{t.assignees[0].name}</span>}
                                    </span>
                                    <span className={`trc-item-status ${bucketOf(t, today)}`}>
                                        {bucketOf(t, today) === 'blocked' ? 'Overdue' : STATUS_LABEL[bucketOf(t, today)]}
                                    </span>
                                </a>
                            ))}
                        </div>
                    )}

                    {isTodaySelected && (
                        <div className="trc-idle">
                            <h4><FontAwesomeIcon icon={faCircleUser} /> Nothing due today ({data.todayIdle.count})</h4>
                            {data.todayIdle.count === 0 ? (
                                <p className="trc-empty">Everyone in scope has something due today.</p>
                            ) : (
                                <div className="trc-idle-list">
                                    {data.todayIdle.employees.map(e => (
                                        <span key={e._id} className="trc-idle-chip">
                                            <Avatar name={e.name} profilePic={e.profilePic} className="assignee-avatar tiny" title={e.name} />
                                            {e.name}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TaskReportCalendar;
