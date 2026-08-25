import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSearch, faTimes, faCheck, faBan, faInbox, faTrash, faEdit,
    faFolderOpen, faBuilding, faUserPen
} from '@fortawesome/free-solid-svg-icons';
import Pagination from './Pagination';
import Avatar from './Avatar';
import TaskCountdown, { hasTimeWindow } from './TaskCountdown';
import { slug, taskContextLabel, shortDate } from '../utils/taskHelpers';
import '../styles/tasks.css';
import '../styles/taskCards.css';
import '../styles/selftask.css';

/**
 * Work employees logged for themselves, waiting on someone to sign it off
 * (TaskPlan.md §15).
 *
 * Rendered as the fourth view on the Tasks page rather than its own route, for
 * the same reason Recurring is: it is still task assignment, just arriving from
 * the other direction.
 *
 * Scoping is enforced server-side — a Team Lead only ever receives their own
 * team's requests — so there is nothing role-specific in here.
 */
const SelfAssignedList = () => {
    const navigate = useNavigate();

    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [approvalStatus, setApprovalStatus] = useState('Pending');
    // The work status (Pending / In Progress / On Hold / Completed), which is a
    // different question from whether the request was approved.
    const [workStatus, setWorkStatus] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [deciding, setDeciding] = useState(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(t);
    }, [searchTerm]);

    useEffect(() => setCurrentPage(1), [debouncedSearch, approvalStatus, workStatus]);

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/tasks/self-assigned', {
                params: {
                    page: currentPage, limit: itemsPerPage,
                    search: debouncedSearch, approvalStatus,
                    ...(workStatus !== 'All' ? { status: workStatus } : {})
                }
            });
            setTasks(res.data.data || []);
            setTotalPages(res.data.pagination.totalPages);
            setTotalRecords(res.data.pagination.totalRecords);
        } catch (err) {
            console.error('Failed to load self-assigned tasks', err);
            Swal.fire('Error', 'Could not load self-assigned tasks.', 'error');
        } finally {
            setLoading(false);
        }
    }, [currentPage, itemsPerPage, debouncedSearch, approvalStatus, workStatus]);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    const decide = async (task, decision) => {
        let note = '';

        // A rejection without a reason leaves the employee nothing to act on,
        // so the server requires one and so does this.
        if (decision === 'Rejected') {
            const { value, isConfirmed } = await Swal.fire({
                title: 'Reject this task?',
                input: 'textarea',
                inputLabel: `Tell ${task.assignees[0]?.name?.split(' ')[0] || 'them'} what to change`,
                inputPlaceholder: 'e.g. Log this under the Spectra project, not office work',
                inputValidator: (v) => (!v || !v.trim()) && 'Please give a reason',
                showCancelButton: true,
                confirmButtonColor: '#dc2626',
                confirmButtonText: 'Reject'
            });
            if (!isConfirmed) return;
            note = value;
        }

        setDeciding(task._id);
        try {
            await api.put(`/tasks/${task._id}/approval`, { decision, note });
            Swal.fire({
                icon: 'success',
                title: decision === 'Approved' ? 'Approved' : 'Rejected',
                toast: true, position: 'top-end', timer: 1800, showConfirmButton: false
            });
            fetchTasks();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not record the decision.', 'error');
        } finally {
            setDeciding(null);
        }
    };

    const remove = async (task) => {
        const who = task.assignees[0]?.name || 'this employee';
        const result = await Swal.fire({
            title: 'Delete this task?',
            html: `<p style="margin:0 0 4px">“${task.title}” will be removed from ${who}’s board.</p>`
                + `<p style="margin:0;font-size:0.85rem;color:#64748b">Rejecting instead lets them fix it and resubmit — deleting does not.</p>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            confirmButtonText: 'Yes, delete it'
        });
        if (!result.isConfirmed) return;

        setDeciding(task._id);
        try {
            await api.delete(`/tasks/${task._id}`);
            Swal.fire({
                icon: 'success', title: 'Task deleted',
                toast: true, position: 'top-end', timer: 1800, showConfirmButton: false
            });
            fetchTasks();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not delete the task.', 'error');
        } finally {
            setDeciding(null);
        }
    };

    // "21 Aug 2026 -> 28 Aug 2026" is wide enough to wrap the column onto three
    // lines, and the year is the same on both ends nine times out of ten.
    const timeline = (start, due) => {
        if (!due) return '—';
        if (!start) return shortDate(due);
        const a = new Date(start), b = new Date(due);
        if (a.getFullYear() === b.getFullYear()) {
            const left = a.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            return `${left} → ${shortDate(due)}`;
        }
        return `${shortDate(start)} → ${shortDate(due)}`;
    };

    const activeFilterCount = (approvalStatus !== 'All' ? 1 : 0)
        + (workStatus !== 'All' ? 1 : 0) + (searchTerm ? 1 : 0);

    return (
        <div className="fade-in">
            <div className="task-toolbar">
                <div className="task-toolbar-search">
                    <FontAwesomeIcon icon={faSearch} className="task-search-icon" />
                    <input
                        type="text"
                        placeholder="Search by task title..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="task-toolbar-filters">
                    <select
                        className={`task-filter-select ${approvalStatus !== 'All' ? 'is-active' : ''}`}
                        value={approvalStatus}
                        onChange={(e) => setApprovalStatus(e.target.value)}
                    >
                        <option value="Pending">Awaiting approval</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                        <option value="All">All</option>
                    </select>

                    <select
                        className={`task-filter-select ${workStatus !== 'All' ? 'is-active' : ''}`}
                        value={workStatus}
                        onChange={(e) => setWorkStatus(e.target.value)}
                    >
                        <option value="All">Any work status</option>
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="On Hold">On Hold</option>
                        <option value="Completed">Completed</option>
                    </select>

                    {activeFilterCount > 0 && (
                        <button
                            className="task-filter-clear"
                            onClick={() => { setApprovalStatus('All'); setWorkStatus('All'); setSearchTerm(''); }}
                        >
                            <FontAwesomeIcon icon={faTimes} /> Clear ({activeFilterCount})
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="control-card text-center" style={{ padding: '50px 20px', color: '#64748b' }}>
                    Loading...
                </div>
            ) : tasks.length === 0 ? (
                <div className="control-card text-center" style={{ padding: '60px 20px' }}>
                    <FontAwesomeIcon icon={faInbox} style={{ fontSize: '3.5rem', color: '#cbd5e1', marginBottom: '15px' }} />
                    <h3 style={{ color: '#475569' }}>
                        {approvalStatus === 'Pending' ? 'Nothing waiting on you' : 'Nothing here'}
                    </h3>
                    <p className="text-muted">
                        {approvalStatus === 'Pending'
                            ? 'Tasks employees log for themselves will appear here for approval.'
                            : 'Try a different filter.'}
                    </p>
                </div>
            ) : (
                <div className="tgrid">
                    {tasks.map((task, idx) => {
                        const emp = task.assignees[0];
                        const busy = deciding === task._id;
                        const tone = task.approvalStatus === 'Approved' ? 'green'
                            : task.approvalStatus === 'Rejected' ? 'red' : 'amber';

                        return (
                            <div
                                key={task._id}
                                className={`tcard tone-${tone}`}
                                style={{ animationDelay: `${Math.min(idx * 18, 220)}ms` }}
                                onClick={() => navigate(`/task/${task._id}`)}
                            >
                                <div className="tcard-head">
                                    <div className="tcard-titlewrap">
                                        <span className="tcard-title" title={task.title}>{task.title}</span>
                                        <div className="tcard-badges">
                                            <span
                                                className={`ap-badge ${slug(task.approvalStatus)}`}
                                                title={task.approvedBy ? `Decided by ${task.approvedBy.name}` : 'Waiting on approval'}
                                            >
                                                {task.approvalStatus === 'Pending' ? 'Awaiting' : task.approvalStatus}
                                            </span>
                                            {/* Approval and progress are different questions: a task can be
                                                approved and untouched, or half done and still unapproved. */}
                                            <span className={`task-status-badge ${slug(task.status)}`} title="Work status">
                                                {task.status}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="tcard-actions" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            className="icon-btn" title="Edit task" aria-label="Edit task"
                                            disabled={busy} onClick={() => navigate(`/edit-task/${task._id}`)}
                                        >
                                            <FontAwesomeIcon icon={faEdit} />
                                        </button>
                                        {task.approvalStatus !== 'Approved' && (
                                            <button
                                                className="icon-btn" title="Approve" aria-label="Approve"
                                                disabled={busy} onClick={() => decide(task, 'Approved')}
                                            >
                                                <FontAwesomeIcon icon={faCheck} />
                                            </button>
                                        )}
                                        {task.approvalStatus !== 'Rejected' && (
                                            <button
                                                className="icon-btn" title="Reject (they can fix and resubmit)" aria-label="Reject"
                                                disabled={busy} onClick={() => decide(task, 'Rejected')}
                                            >
                                                <FontAwesomeIcon icon={faBan} />
                                            </button>
                                        )}
                                        <button
                                            className="icon-btn danger" title="Delete task" aria-label="Delete task"
                                            disabled={busy} onClick={() => remove(task)}
                                        >
                                            <FontAwesomeIcon icon={faTrash} />
                                        </button>
                                    </div>
                                </div>

                                <div className="tcard-meta">
                                    <div className="tcard-field">
                                        <span className="tcard-label">Logged by</span>
                                        <span className="tcard-value">
                                            <span className="tcard-person">
                                                <Avatar name={emp?.name} profilePic={emp?.profilePic} className="assignee-avatar" />
                                                <span className="tcard-ellipsis">{emp?.name || 'Unknown'}</span>
                                            </span>
                                        </span>
                                    </div>

                                    <div className="tcard-field">
                                        <span className="tcard-label">Asked by</span>
                                        <span className="tcard-value is-muted">
                                            <span className="tcard-person">
                                                <Avatar name={task.assignedBy?.name} profilePic={task.assignedBy?.profilePic} className="assignee-avatar" />
                                                <span className="tcard-ellipsis">{task.assignedBy?.name || 'someone'}</span>
                                            </span>
                                        </span>
                                    </div>

                                    <div className="tcard-field">
                                        <span className="tcard-label">Type / Project</span>
                                        <span className="tcard-value">
                                            <span className={`task-context ${task.taskType === 'Regular Office Task' ? 'is-office' : ''}`}>
                                                <FontAwesomeIcon icon={task.taskType === 'Regular Office Task' ? faBuilding : faFolderOpen} />
                                                <span className="task-context-label">{taskContextLabel(task)}</span>
                                            </span>
                                        </span>
                                    </div>

                                    <div className="tcard-field">
                                        <span className="tcard-label">Timeline</span>
                                        <span className="tcard-value">
                                            <span className="task-due-date">{timeline(task.startDate, task.dueDate)}</span>
                                        </span>
                                        {hasTimeWindow(task) && <TaskCountdown task={task} compact />}
                                    </div>

                                    {task.approvedBy && (
                                        <div className="tcard-field is-wide">
                                            <span className="tcard-label">{task.approvalStatus} by</span>
                                            <span className="tcard-value is-muted">
                                                <span className="tcard-person">
                                                    <Avatar name={task.approvedBy.name} profilePic={task.approvedBy.profilePic} className="assignee-avatar" />
                                                    <span className="tcard-ellipsis">{task.approvedBy.name}</span>
                                                </span>
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {task.approvalStatus === 'Rejected' && task.approvalNote && (
                                    <div className="tcard-note">“{task.approvalNote}”</div>
                                )}
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
                    onLimitChange={(v) => { setItemsPerPage(v); setCurrentPage(1); }}
                />
            )}
        </div>
    );
};

export default SelfAssignedList;
