import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faClipboardList, faPlus, faSearch, faEdit, faTrash,
    faPaperclip, faClipboardCheck, faTimes
} from '@fortawesome/free-solid-svg-icons';
import Pagination from '../../components/Pagination';
import { slug, initials, taskContextLabel } from '../../utils/taskHelpers';
import '../../styles/App.css';
import '../../styles/tasks.css';

const DEFAULT_FILTERS = { status: 'All', priority: 'All', projectId: 'All', taskType: 'All' };

// The progress bar reflects the task's shared status rather than a headcount.
const STATUS_PROGRESS = {
    'Pending': 0,
    'In Progress': 50,
    'On Hold': 50,
    'Completed': 100
};

const Tasks = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user'));
    const currentUserId = currentUser?.id || currentUser?._id;
    const isPrivileged = ['ADMIN', 'HR'].includes(currentUser?.role);
    const [searchParams] = useSearchParams();

    const [tasks, setTasks] = useState([]);
    const [projectsList, setProjectsList] = useState([]);
    const [loading, setLoading] = useState(true);

    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);


    useEffect(() => {
        api.get('/tasks/assignable-projects')
            .then(res => setProjectsList(res.data || []))
            .catch(() => setProjectsList([]));
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => setCurrentPage(1), [debouncedSearch, filters]);

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/tasks/managed', {
                params: {
                    page: currentPage,
                    limit: itemsPerPage,
                    search: debouncedSearch,
                    ...filters
                }
            });
            setTasks(res.data.data);
            setTotalPages(res.data.pagination.totalPages);
            setTotalRecords(res.data.pagination.totalRecords);
        } catch (err) {
            console.error('Failed to load tasks', err);
            Swal.fire('Error', 'Could not load tasks.', 'error');
        } finally {
            setLoading(false);
        }
    }, [currentPage, itemsPerPage, debouncedSearch, filters]);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    // Older notifications link here as /tasks?task=<id>; send them to the page.
    useEffect(() => {
        const taskId = searchParams.get('task');
        if (taskId) navigate(`/task/${taskId}`, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleFilterChange = (e) =>
        setFilters({ ...filters, [e.target.name]: e.target.value });

    const clearFilters = () => {
        setFilters(DEFAULT_FILTERS);
        setSearchTerm('');
    };

    const activeFilterCount =
        Object.keys(DEFAULT_FILTERS).filter(k => filters[k] !== 'All').length +
        (searchTerm ? 1 : 0);

    const handleDelete = async (task) => {
        const result = await Swal.fire({
            title: 'Remove this task?',
            text: `"${task.title}" will be archived and disappear from everyone's list.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            confirmButtonText: 'Yes, remove it'
        });
        if (!result.isConfirmed) return;

        try {
            await api.delete(`/tasks/${task._id}`);
            Swal.fire({
                icon: 'success', title: 'Task removed', toast: true,
                position: 'top-end', timer: 1800, showConfirmButton: false
            });
            fetchTasks();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not remove the task.', 'error');
        }
    };

    const isOverdue = (task) =>
        new Date(task.dueDate) < new Date() && task.status !== 'Completed';

    return (
        <div className="attendance-container fade-in">
            <div className="task-page-header">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faClipboardList} style={{ marginRight: '10px', color: '#215D7B' }} />
                    {isPrivileged ? 'All Tasks' : 'Assigned Tasks'}
                </h1>
                <button className="gts-btn primary" style={{ marginLeft: 'auto' }} onClick={() => navigate('/add-task')}>
                    <FontAwesomeIcon icon={faPlus} /> Assign Task
                </button>
            </div>

            {/* --- Search + filters in a single bar --- */}
            <div className="task-toolbar">
                <div className="task-toolbar-search">
                    <FontAwesomeIcon icon={faSearch} className="task-search-icon" />
                    <input
                        type="text"
                        placeholder="Search tasks by title or description..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="task-toolbar-filters">
                    <select
                        className={`task-filter-select ${filters.status !== 'All' ? 'is-active' : ''}`}
                        name="status" value={filters.status} onChange={handleFilterChange}
                    >
                        <option value="All">All Statuses</option>
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="On Hold">On Hold</option>
                        <option value="Completed">Completed</option>
                    </select>

                    <select
                        className={`task-filter-select ${filters.priority !== 'All' ? 'is-active' : ''}`}
                        name="priority" value={filters.priority} onChange={handleFilterChange}
                    >
                        <option value="All">All Priorities</option>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                    </select>

                    <select
                        className={`task-filter-select ${filters.taskType !== 'All' ? 'is-active' : ''}`}
                        name="taskType" value={filters.taskType} onChange={handleFilterChange}
                    >
                        <option value="All">All Types</option>
                        <option value="Project Task">Project Task</option>
                        <option value="Regular Office Task">Regular Office</option>
                    </select>

                    <select
                        className={`task-filter-select ${filters.projectId !== 'All' ? 'is-active' : ''}`}
                        name="projectId" value={filters.projectId} onChange={handleFilterChange}
                    >
                        <option value="All">All Projects</option>
                        {projectsList.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                    </select>

                    {activeFilterCount > 0 && (
                        <button className="task-filter-clear" onClick={clearFilters}>
                            <FontAwesomeIcon icon={faTimes} /> Clear ({activeFilterCount})
                        </button>
                    )}
                </div>
            </div>

            {!loading && totalRecords > 0 && (
                <div className="task-result-count">
                    Showing {tasks.length} of {totalRecords} task{totalRecords === 1 ? '' : 's'}
                    {activeFilterCount > 0 && ' (filtered)'}
                </div>
            )}

            {loading ? (
                <div className="control-card text-center" style={{ padding: '50px 20px', color: '#64748b' }}>
                    Loading tasks...
                </div>
            ) : tasks.length === 0 ? (
                <div className="control-card text-center" style={{ padding: '60px 20px' }}>
                    <FontAwesomeIcon icon={faClipboardCheck} style={{ fontSize: '3.5rem', color: '#cbd5e1', marginBottom: '15px' }} />
                    <h3 style={{ color: '#475569' }}>
                        {activeFilterCount > 0 ? 'No matching tasks' : 'No tasks yet'}
                    </h3>
                    <p className="text-muted">
                        {activeFilterCount > 0
                            ? 'Try clearing your filters to see everything.'
                            : 'Assign your first task to get started.'}
                    </p>
                    {activeFilterCount > 0 && (
                        <button className="gts-btn secondary" style={{ marginTop: '12px' }} onClick={clearFilters}>
                            <FontAwesomeIcon icon={faTimes} /> Clear filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="employee-table-container">
                    <table className="employee-table task-table">
                        <thead>
                            <tr>
                                <th className="col-task">Task</th>
                                <th className="col-project">Project</th>
                                <th className="col-assignees">Assignees</th>
                                <th className="col-priority">Priority</th>
                                <th className="col-due">Due Date</th>
                                <th className="col-progress">Progress</th>
                                <th className="col-actions">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map(task => {
                                const pct = STATUS_PROGRESS[task.status] ?? 0;

                                return (
                                    <tr key={task._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/task/${task._id}`)}>
                                        <td data-label="Task" className="col-task">
                                            <span className="task-title-cell" title={task.title}>{task.title}</span>
                                            <span className="task-title-sub">
                                                <span className={`task-status-badge ${slug(task.status)}`}>
                                                    {task.status}
                                                </span>
                                                {task.attachments?.length > 0 && (
                                                    <span className="task-media-count">
                                                        <FontAwesomeIcon icon={faPaperclip} /> {task.attachments.length}
                                                    </span>
                                                )}
                                            </span>
                                        </td>

                                        <td data-label="Project" className="col-project">
                                            <span className={`task-project-cell ${task.taskType === 'Regular Office Task' ? 'is-office' : ''}`}>
                                                {taskContextLabel(task)}
                                            </span>
                                        </td>

                                        <td data-label="Assignees" className="col-assignees">
                                            <div className="avatar-stack" title={task.assignees.map(a => a?.name).join(', ')}>
                                                {task.assignees.slice(0, 4).map(a => (
                                                    <div key={a._id} className="assignee-avatar">{initials(a?.name)}</div>
                                                ))}
                                                {task.assignees.length > 4 && (
                                                    <div className="assignee-avatar avatar-more">+{task.assignees.length - 4}</div>
                                                )}
                                            </div>
                                        </td>

                                        <td data-label="Priority" className="col-priority">
                                            <span className={`priority-badge ${slug(task.priority)}`}>{task.priority}</span>
                                        </td>

                                        <td data-label="Due Date" className="col-due">
                                            <span className={`task-due-date ${isOverdue(task) ? 'overdue' : ''}`}>
                                                {new Date(task.dueDate).toLocaleDateString()}
                                            </span>
                                        </td>

                                        <td data-label="Progress" className="col-progress">
                                            <div className="task-progress">
                                                <div className="task-progress-track">
                                                    <div
                                                        className={`task-progress-fill ${slug(task.status)}`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <span className="task-progress-label">{pct}%</span>
                                            </div>
                                        </td>

                                        <td
                                            data-label="Actions"
                                            className="col-actions task-actions-cell"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="task-actions-inner">
                                                <button
                                                    className="icon-btn" title="Edit task" aria-label="Edit task"
                                                    onClick={() => navigate(`/edit-task/${task._id}`)}
                                                >
                                                    <FontAwesomeIcon icon={faEdit} />
                                                </button>
                                                <button
                                                    className="icon-btn danger" title="Remove task" aria-label="Remove task"
                                                    onClick={() => handleDelete(task)}
                                                >
                                                    <FontAwesomeIcon icon={faTrash} />
                                                </button>
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

export default Tasks;
