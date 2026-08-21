import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faPlus, faSearch, faTimes, faPause, faPlay, faBan,
    faFolderOpen, faBuilding, faCalendarCheck
} from '@fortawesome/free-solid-svg-icons';
import Pagination from './Pagination';
import { slug, initials, taskContextLabel } from '../utils/taskHelpers';
import '../styles/App.css';
import '../styles/tasks.css';
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
                <div className="employee-table-container">
                    <table className="employee-table task-table">
                        <thead>
                            <tr>
                                <th className="col-task">Schedule</th>
                                <th className="col-project">Type / Project</th>
                                <th className="col-assignees">Assignees</th>
                                <th className="col-progress">Progress</th>
                                <th className="col-priority">Status</th>
                                <th className="col-actions">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {schedules.map(s => {
                                const p = s.progress || {};
                                const total = p.total || 1;
                                // Two-colour bar: what got done, and what was let slip.
                                const donePct = Math.round(((p.done || 0) / total) * 100);
                                const missedPct = Math.round(((p.missed || 0) / total) * 100);

                                return (
                                    <tr key={s._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tasks/recurring/${s._id}`)}>
                                        <td data-label="Schedule" className="col-task">
                                            <span className="task-title-cell" title={s.title}>{s.title}</span>
                                            <span className="task-title-sub">
                                                <span className={`priority-badge ${slug(s.priority)}`}>{s.priority}</span>
                                                <span className="task-media-count">
                                                    {s.targetCount} day{s.targetCount === 1 ? '' : 's'} each
                                                </span>
                                            </span>
                                        </td>

                                        <td data-label="Type / Project" className="col-project">
                                            <span className={`task-context ${s.taskType === 'Regular Office Task' ? 'is-office' : ''}`}>
                                                <FontAwesomeIcon icon={s.taskType === 'Regular Office Task' ? faBuilding : faFolderOpen} />
                                                <span className="task-context-label">{taskContextLabel(s)}</span>
                                            </span>
                                        </td>

                                        <td data-label="Assignees" className="col-assignees">
                                            <div className="avatar-stack" title={s.assignees.map(a => a?.name).join(', ')}>
                                                {s.assignees.slice(0, 4).map(a => (
                                                    <div key={a._id} className="assignee-avatar">{initials(a?.name)}</div>
                                                ))}
                                                {s.assignees.length > 4 && (
                                                    <div className="assignee-avatar avatar-more">+{s.assignees.length - 4}</div>
                                                )}
                                            </div>
                                        </td>

                                        <td data-label="Progress" className="col-progress">
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
                                        </td>

                                        <td data-label="Status" className="col-priority">
                                            <span className={`rt-status-badge ${slug(s.status)}`}>{s.status}</span>
                                        </td>

                                        <td
                                            data-label="Actions"
                                            className="col-actions task-actions-cell"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="task-actions-inner">
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
                                                    <button className="icon-btn danger" title="End schedule" aria-label="End schedule"
                                                        onClick={() => act(s, 'cancel')}>
                                                        <FontAwesomeIcon icon={faBan} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
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
