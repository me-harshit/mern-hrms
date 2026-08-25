import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faPlus, faSearch, faTimes, faPause, faPlay, faBan, faTrash, faEdit,
    faFolderOpen, faBuilding, faCalendarCheck, faRepeat
} from '@fortawesome/free-solid-svg-icons';
import Pagination from './Pagination';
import { slug, taskContextLabel, confirmDeleteSchedule } from '../utils/taskHelpers';
import Avatar from './Avatar';
import '../styles/App.css';
import '../styles/tasks.css';
import '../styles/taskCards.css';
import '../styles/recurring.css';

/**
 * Every recurring schedule this user can see, with the number that actually
 * matters at a glance: how many of the promised tasks have been done, and how
 * many were missed (TaskPlan.md §13.8).
 *
 * Rendered inside the Tasks page as its third view rather than owning a route
 * of its own — a recurring task is still just task assignment, so it belongs
 * beside "By Task" and "By Employee", not in a separate sidebar entry.
 */
const RecurringTaskList = () => {
    const navigate = useNavigate();

    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => setCurrentPage(1), [debouncedSearch, status]);

    const fetchSchedules = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/tasks/recurring', {
                params: { page: currentPage, limit: itemsPerPage, search: debouncedSearch, status }
            });
            setSchedules(res.data.data || []);
            setTotalPages(res.data.pagination.totalPages);
            setTotalRecords(res.data.pagination.totalRecords);
        } catch (err) {
            console.error('Failed to load schedules', err);
            Swal.fire('Error', 'Could not load recurring tasks.', 'error');
        } finally {
            setLoading(false);
        }
    }, [currentPage, itemsPerPage, debouncedSearch, status]);

    useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

    const act = async (schedule, action) => {
        // Cancelling cannot be undone, so it asks; pause/resume are cheap and don't.
        if (action === 'cancel') {
            const result = await Swal.fire({
                title: 'End this schedule?',
                text: `"${schedule.title}" will stop generating new tasks. Tasks already sent out are unaffected.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc2626',
                confirmButtonText: 'Yes, end it'
            });
            if (!result.isConfirmed) return;
        }

        try {
            await api.put(`/tasks/recurring/${schedule._id}`, { action });
            Swal.fire({
                icon: 'success',
                title: action === 'pause' ? 'Paused' : action === 'resume' ? 'Resumed' : 'Schedule ended',
                toast: true, position: 'top-end', timer: 1800, showConfirmButton: false
            });
            fetchSchedules();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not update the schedule.', 'error');
        }
    };

    const remove = async (schedule) => {
        const choice = await confirmDeleteSchedule(schedule.title);
        if (!choice) return;

        try {
            const res = await api.delete(`/tasks/recurring/${schedule._id}`, {
                params: { clearOpen: choice.clearOpen }
            });
            Swal.fire({
                icon: 'success',
                title: 'Schedule deleted',
                text: res.data.clearedTasks
                    ? `${res.data.clearedTasks} unfinished day(s) removed from boards.`
                    : 'Tasks it already created were left as they are.',
                toast: true, position: 'top-end', timer: 2600, showConfirmButton: false
            });
            fetchSchedules();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not delete the schedule.', 'error');
        }
    };

    const activeFilterCount = (status !== 'All' ? 1 : 0) + (searchTerm ? 1 : 0);

    const clearFilters = () => {
        setStatus('All');
        setSearchTerm('');
    };

    return (
        <div className="fade-in">
            <div className="task-toolbar">
                <div className="task-toolbar-search">
                    <FontAwesomeIcon icon={faSearch} className="task-search-icon" />
                    <input
                        type="text"
                        placeholder="Search schedules by title..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="task-toolbar-filters">
                    <select
                        className={`task-filter-select ${status !== 'All' ? 'is-active' : ''}`}
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                    >
                        <option value="All">All Statuses</option>
                        <option value="Active">Active</option>
                        <option value="Paused">Paused</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                    </select>

                    {activeFilterCount > 0 && (
                        <button className="task-filter-clear" onClick={clearFilters}>
                            <FontAwesomeIcon icon={faTimes} /> Clear ({activeFilterCount})
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="control-card text-center" style={{ padding: '50px 20px', color: '#64748b' }}>
                    Loading schedules...
                </div>
            ) : schedules.length === 0 ? (
                <div className="control-card text-center" style={{ padding: '60px 20px' }}>
                    <FontAwesomeIcon icon={faCalendarCheck} style={{ fontSize: '3.5rem', color: '#cbd5e1', marginBottom: '15px' }} />
                    <h3 style={{ color: '#475569' }}>
                        {activeFilterCount > 0 ? 'No matching schedules' : 'No recurring tasks yet'}
                    </h3>
                    <p className="text-muted">
                        {activeFilterCount > 0
                            ? 'Try clearing your filters.'
                            : 'Assign a task and switch on "Repeat daily" to schedule one.'}
                    </p>
                    {activeFilterCount === 0 && (
                        <button className="gts-btn primary" style={{ marginTop: '12px' }} onClick={() => navigate('/add-task')}>
                            <FontAwesomeIcon icon={faPlus} /> Schedule a Daily Task
                        </button>
                    )}
                </div>
            ) : (
                <div className="tgrid">
                    {schedules.map((s, idx) => {
                        const p = s.progress || {};
                        const total = p.total || 1;
                        // Two-colour bar: what got done, and what was let slip.
                        const donePct = Math.round(((p.done || 0) / total) * 100);
                        const missedPct = Math.round(((p.missed || 0) / total) * 100);

                        const tone = s.status === 'Completed' ? 'green'
                            : s.status === 'Cancelled' ? 'red'
                                : s.status === 'Paused' ? 'amber' : 'blue';

                        return (
                            <div
                                key={s._id}
                                className={`tcard tone-${tone}`}
                                style={{ animationDelay: `${Math.min(idx * 18, 220)}ms` }}
                                onClick={() => navigate(`/tasks/recurring/${s._id}`)}
                            >
                                <div className="tcard-head">
                                    <div className="tcard-titlewrap">
                                        <span className="tcard-title" title={s.title}>{s.title}</span>
                                        <div className="tcard-badges">
                                            <span className={`rt-status-badge ${slug(s.status)}`}>{s.status}</span>
                                            <span className={`priority-badge ${slug(s.priority)}`}>{s.priority}</span>
                                            <span className="task-media-count">
                                                <FontAwesomeIcon icon={faRepeat} /> {s.targetCount} day{s.targetCount === 1 ? '' : 's'} each
                                            </span>
                                        </div>
                                    </div>

                                    <div className="tcard-actions" onClick={(e) => e.stopPropagation()}>
                                        <button className="icon-btn" title="Edit schedule" aria-label="Edit schedule"
                                            onClick={() => navigate(`/tasks/recurring/${s._id}/edit`)}>
                                            <FontAwesomeIcon icon={faEdit} />
                                        </button>
                                        {s.status === 'Active' && (
                                            <button className="icon-btn" title="Pause schedule" aria-label="Pause schedule"
                                                onClick={() => act(s, 'pause')}>
                                                <FontAwesomeIcon icon={faPause} />
                                            </button>
                                        )}
                                        {s.status === 'Paused' && (
                                            <button className="icon-btn" title="Resume schedule" aria-label="Resume schedule"
                                                onClick={() => act(s, 'resume')}>
                                                <FontAwesomeIcon icon={faPlay} />
                                            </button>
                                        )}
                                        {['Active', 'Paused'].includes(s.status) && (
                                            <button className="icon-btn" title="End schedule (keep it in the list)" aria-label="End schedule"
                                                onClick={() => act(s, 'cancel')}>
                                                <FontAwesomeIcon icon={faBan} />
                                            </button>
                                        )}
                                        <button className="icon-btn danger" title="Delete schedule" aria-label="Delete schedule"
                                            onClick={() => remove(s)}>
                                            <FontAwesomeIcon icon={faTrash} />
                                        </button>
                                    </div>
                                </div>

                                <div className="tcard-meta">
                                    <div className="tcard-field">
                                        <span className="tcard-label">Type / Project</span>
                                        <span className="tcard-value">
                                            <span className={`task-context ${s.taskType === 'Regular Office Task' ? 'is-office' : ''}`}>
                                                <FontAwesomeIcon icon={s.taskType === 'Regular Office Task' ? faBuilding : faFolderOpen} />
                                                <span className="task-context-label">{taskContextLabel(s)}</span>
                                            </span>
                                        </span>
                                    </div>

                                    <div className="tcard-field">
                                        <span className="tcard-label">Running for</span>
                                        <span className="tcard-value">
                                            <span className="avatar-stack" title={s.assignees.map(a => a?.name).join(', ')}>
                                                {s.assignees.slice(0, 4).map(a => (
                                                    <Avatar key={a._id} name={a?.name} profilePic={a?.profilePic} className="assignee-avatar" />
                                                ))}
                                                {s.assignees.length > 4 && (
                                                    <span className="assignee-avatar avatar-more">+{s.assignees.length - 4}</span>
                                                )}
                                            </span>
                                        </span>
                                    </div>
                                </div>

                                <div className="tcard-foot">
                                    <span className="tcard-label">Progress</span>
                                    <div className="rt-progress-wrap">
                                        <div className="rt-progress-track">
                                            <div className="rt-progress-done" style={{ width: `${donePct}%` }} />
                                            <div className="rt-progress-missed" style={{ width: `${missedPct}%` }} />
                                        </div>
                                        <span className="rt-progress-label">
                                            {p.done || 0} done
                                            {p.missed > 0 && ` · ${p.missed} missed`}
                                            {p.skipped > 0 && ` · ${p.skipped} skipped`}
                                            {` · of ${total}`}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {!loading && totalRecords > 0 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalRecords={totalRecords}
                    limit={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onLimitChange={(val) => { setItemsPerPage(val); setCurrentPage(1); }}
                />
            )}
        </div>
    );
};

export default RecurringTaskList;
