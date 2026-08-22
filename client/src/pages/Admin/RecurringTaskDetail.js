import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowLeft, faRepeat, faPause, faPlay, faBan, faFolderOpen,
    faBuilding, faPaperclip, faUserTie, faTriangleExclamation, faTrash, faEdit
} from '@fortawesome/free-solid-svg-icons';
import TaskMediaGrid from '../../components/TaskMediaGrid';
import Avatar from '../../components/Avatar';
import { slug, taskContextLabel, confirmDeleteSchedule } from '../../utils/taskHelpers';
import { prettyDate, todayYmd, parseYmd } from '../../utils/scheduleDates';
import '../../styles/App.css';
import '../../styles/tasks.css';
import '../../styles/recurring.css';

/**
 * The compliance calendar (TaskPlan.md §13.8) — the view that answers
 * "did he actually post for ten days".
 *
 * One row per person, one cell per day, colour-coded. Skipped days carry their
 * reason so a red-looking run that was actually a public holiday reads
 * correctly. Generated days link through to the real task, including the
 * missed ones, which are archived off the board but never deleted.
 */

const MARKS = {
    done: { cls: 'done', mark: '✅', label: 'Done' },
    missed: { cls: 'missed', mark: '❌', label: 'Missed' },
    skipped: { cls: 'skipped', mark: '⬜', label: 'Skipped' },
    open: { cls: 'open', mark: '\u{1F535}', label: 'Open' },
    scheduled: { cls: 'scheduled', mark: '·', label: 'Scheduled' }
};

// What a given day should look like, from the occurrence log plus the calendar.
const dayState = (date, occurrence) => {
    if (!occurrence) return date < todayYmd() ? MARKS.skipped : MARKS.scheduled;
    if (occurrence.result === 'skipped') return MARKS.skipped;
    if (occurrence.outcome === 'completed') return MARKS.done;
    if (occurrence.outcome === 'missed') return MARKS.missed;
    return MARKS.open;
};

const RecurringTaskDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await api.get(`/tasks/recurring/${id}`);
            setData(res.data);
        } catch (err) {
            console.error('Could not load schedule', err);
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const act = async (action) => {
        if (action === 'cancel') {
            const result = await Swal.fire({
                title: 'End this schedule?',
                text: 'It will stop generating new tasks. Tasks already sent out are unaffected.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc2626',
                confirmButtonText: 'Yes, end it'
            });
            if (!result.isConfirmed) return;
        }

        try {
            await api.put(`/tasks/recurring/${id}`, { action });
            load();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not update the schedule.', 'error');
        }
    };

    const remove = async () => {
        const choice = await confirmDeleteSchedule(data?.schedule?.title || 'this schedule');
        if (!choice) return;

        try {
            await api.delete(`/tasks/recurring/${id}`, { params: { clearOpen: choice.clearOpen } });
            navigate('/tasks?view=recurring');
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not delete the schedule.', 'error');
        }
    };

    if (loading) {
        return (
            <div className="attendance-container fade-in">
                <div className="control-card text-center" style={{ padding: '50px 20px', color: '#64748b' }}>
                    Loading schedule...
                </div>
            </div>
        );
    }

    if (notFound || !data) {
        return (
            <div className="attendance-container fade-in">
                <div className="control-card text-center" style={{ padding: '60px 20px' }}>
                    <h3 style={{ color: '#475569' }}>Schedule not found</h3>
                    <p className="text-muted">It may have been removed, or you may not have access to it.</p>
                    <button className="gts-btn secondary" style={{ marginTop: '12px' }} onClick={() => navigate('/tasks?view=recurring')}>
                        <FontAwesomeIcon icon={faArrowLeft} /> Back to schedules
                    </button>
                </div>
            </div>
        );
    }

    const { schedule, byAssignee } = data;

    // Roll the whole log up once for the stat tiles.
    const all = schedule.occurrences || [];
    const stats = {
        done: all.filter(o => o.outcome === 'completed').length,
        missed: all.filter(o => o.outcome === 'missed').length,
        open: all.filter(o => o.result === 'generated' && o.outcome === 'pending').length,
        skipped: all.filter(o => o.result === 'skipped').length
    };

    return (
        <div className="attendance-container fade-in">
            <button className="gts-btn secondary rt-back" onClick={() => navigate('/tasks?view=recurring')}>
                <FontAwesomeIcon icon={faArrowLeft} /> Back
            </button>

            <header className="rt-head">
                <div className="rt-head-main">
                    <h1 className="rt-head-title" title={schedule.title}>
                        <FontAwesomeIcon icon={faRepeat} />
                        <span>{schedule.title}</span>
                    </h1>
                    <div className="rt-head-meta">
                        <span className={`rt-status-badge ${slug(schedule.status)}`}>{schedule.status}</span>
                        <span className="rt-head-dot" />
                        <span>{taskContextLabel(schedule)}</span>
                        <span className="rt-head-dot" />
                        <span>by {schedule.assignedBy?.name || 'Unknown'}</span>
                    </div>
                </div>

                <div className="rt-head-actions">
                    <button className="gts-btn secondary" onClick={() => navigate(`/tasks/recurring/${id}/edit`)}>
                        <FontAwesomeIcon icon={faEdit} /> Edit
                    </button>
                    {schedule.status === 'Active' && (
                        <button className="gts-btn secondary" onClick={() => act('pause')}>
                            <FontAwesomeIcon icon={faPause} /> Pause
                        </button>
                    )}
                    {schedule.status === 'Paused' && (
                        <button className="gts-btn secondary" onClick={() => act('resume')}>
                            <FontAwesomeIcon icon={faPlay} /> Resume
                        </button>
                    )}
                    {['Active', 'Paused'].includes(schedule.status) && (
                        <button className="gts-btn secondary" onClick={() => act('cancel')}>
                            <FontAwesomeIcon icon={faBan} /> End
                        </button>
                    )}
                    {/* Destructive, so it is an icon rather than a fifth full
                        button competing for the same row. */}
                    <button className="icon-btn danger rt-head-delete" title="Delete schedule"
                        aria-label="Delete schedule" onClick={remove}>
                        <FontAwesomeIcon icon={faTrash} />
                    </button>
                </div>
            </header>

            {/* --- What this schedule is --- */}
            <div className="control-card" style={{ marginBottom: '18px' }}>
                <div className="td-badges" style={{ marginBottom: '10px' }}>
                    <span className={`priority-badge ${slug(schedule.priority)}`}>{schedule.priority}</span>
                    <span className={`task-context ${schedule.taskType === 'Regular Office Task' ? 'is-office' : ''}`}>
                        <FontAwesomeIcon icon={schedule.taskType === 'Regular Office Task' ? faBuilding : faFolderOpen} />
                        <span className="task-context-label">{taskContextLabel(schedule)}</span>
                    </span>
                    <span className="task-media-count byline">
                        {schedule.assignedBy ? (
                            <>
                                <Avatar
                                    name={schedule.assignedBy.name}
                                    profilePic={schedule.assignedBy.profilePic}
                                    className="byline-avatar"
                                />
                                {schedule.assignedBy.name}
                            </>
                        ) : (
                            <><FontAwesomeIcon icon={faUserTie} /> Unknown</>
                        )}
                    </span>
                </div>

                {schedule.description && (
                    <p style={{ color: '#475569', whiteSpace: 'pre-wrap', margin: '0 0 10px' }}>
                        {schedule.description}
                    </p>
                )}

                {schedule.attachments?.length > 0 && (
                    <>
                        <div className="expense-section-title" style={{ marginTop: '10px' }}>
                            <FontAwesomeIcon icon={faPaperclip} /> Brief
                        </div>
                        <p className="rt-brief-note">
                            Every task in this run shows this same brief. Editing it here updates all of them.
                        </p>
                        <TaskMediaGrid media={schedule.attachments} />
                    </>
                )}
            </div>

            {/* --- Stat tiles --- */}
            <div className="rc-stat-row">
                <div className="rc-stat">
                    <span className="rc-stat-value" style={{ color: '#16a34a' }}>{stats.done}</span>
                    <span className="rc-stat-label">Done</span>
                </div>
                <div className="rc-stat">
                    <span className="rc-stat-value" style={{ color: '#dc2626' }}>{stats.missed}</span>
                    <span className="rc-stat-label">Missed</span>
                </div>
                <div className="rc-stat">
                    <span className="rc-stat-value" style={{ color: '#2563eb' }}>{stats.open}</span>
                    <span className="rc-stat-label">Open</span>
                </div>
                <div className="rc-stat">
                    <span className="rc-stat-value" style={{ color: '#94a3b8' }}>{stats.skipped}</span>
                    <span className="rc-stat-label">Skipped</span>
                </div>
            </div>

            <div className="rc-legend">
                {Object.values(MARKS).map(m => (
                    <span key={m.label}>{m.mark} {m.label}</span>
                ))}
            </div>

            {/* --- One calendar per person --- */}
            {byAssignee.map(person => {
                const occByDate = {};
                person.occurrences.forEach(o => { occByDate[o.date] = o; });

                return (
                    <div className="rc-person" key={person.user._id}>
                        <div className="rc-person-head">
                            <Avatar name={person.user.name} profilePic={person.user.profilePic} className="assignee-avatar" />
                            <span className="rc-person-name">{person.user.name}</span>

                            {person.status === 'Stalled' && (
                                <span className="sp-chip stalled">
                                    <FontAwesomeIcon icon={faTriangleExclamation} /> Stalled
                                </span>
                            )}
                            {person.status === 'Completed' && (
                                <span className="sp-chip run">Run complete</span>
                            )}

                            <span className="rc-person-count">
                                {person.generatedCount} of {person.targetCount} sent out
                            </span>
                        </div>

                        <div className="rc-days">
                            {person.dates.map(date => {
                                const occ = occByDate[date];
                                const state = dayState(date, occ);
                                const taskId = occ?.taskId?._id || occ?.taskId;

                                return (
                                    <div
                                        key={date}
                                        className={`rc-day ${state.cls} ${taskId ? 'clickable' : ''}`}
                                        title={occ?.skipReason || state.label}
                                        onClick={() => taskId && navigate(`/task/${taskId}`)}
                                    >
                                        <span className="rc-day-date">
                                            {parseYmd(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                        </span>
                                        <span className="rc-day-mark">{state.mark}</span>
                                        <span className="rc-day-note">
                                            {occ?.skipReason || state.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {person.status === 'Stalled' && (
                            <p className="sp-note" style={{ color: '#991b1b' }}>
                                This run stopped early — the schedule was pushed forward as far as it goes
                                without finding enough working days. Check their leave, or schedule the
                                remaining days fresh.
                            </p>
                        )}
                    </div>
                );
            })}

            <p className="sp-note">
                Scheduled days are re-checked each morning at 6am. A day is only skipped when it
                lands on a Sunday, a company holiday, or approved full-day leave — and when that
                happens the run rolls forward so the agreed number of tasks still goes out.
                Started {prettyDate(schedule.plannedDates?.[0])}.
            </p>
        </div>
    );
};

export default RecurringTaskDetail;
