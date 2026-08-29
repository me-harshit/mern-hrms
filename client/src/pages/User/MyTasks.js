import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faClipboardList, faSearch, faFolderOpen, faPaperclip,
    faCheckCircle, faExclamationTriangle, faTableColumns, faListUl,
    faTimes, faComment, faSpinner, faInbox, faGripVertical, faBuilding, faRepeat,
    faPlus, faHourglassHalf, faCircleXmark, faUserPen
} from '@fortawesome/free-solid-svg-icons';
import Avatar from '../../components/Avatar';
import AssigneePopup from '../../components/AssigneePopup';
import TaskCountdown, { hasTimeWindow } from '../../components/TaskCountdown';
import { slug, dueLabel, taskContextLabel } from '../../utils/taskHelpers';
import '../../styles/App.css';
import '../../styles/tasks.css';
import '../../styles/recurring.css';
import '../../styles/selftask.css';
import SelfTaskForm from '../../components/SelfTaskForm';

const COLUMNS = ['Pending', 'In Progress', 'On Hold', 'Completed'];
const VIEW_KEY = 'mytasks_view';

const TaskCard = ({
    task, compact, currentUser, currentUserId,
    isDragging, isMoving, onDragStart, onDragEnd, onOpen
}) => {
    const due = dueLabel(task.dueDate, task.status === 'Completed', task.overdueAt);
    const others = task.assignees.filter(a => a._id !== currentUserId);
    const [showPeople, setShowPeople] = useState(false);

    return (
        <article
            className={`tk-card ${isDragging ? 'is-dragging' : ''} ${isMoving ? 'is-moving' : ''} ${compact ? 'compact' : ''}`}
            draggable
            onDragStart={(e) => onDragStart(e, task)}
            onDragEnd={onDragEnd}
            onClick={() => onOpen(task)}
        >
            <div className="tk-card-head">
                <span className={`tk-priority ${slug(task.priority)}`}>{task.priority}</span>
                {isMoving
                    ? <FontAwesomeIcon icon={faSpinner} spin className="tk-card-spinner" />
                    : <FontAwesomeIcon icon={faGripVertical} className="tk-card-grip" />}
            </div>

            <h4 className="tk-card-title">{task.title}</h4>

            {/* Rendered even when empty: it is the flexible block that holds the
                footer down, so omitting it would shorten the card. */}
            {!compact && (
                <p className={`tk-card-desc ${task.description ? '' : 'is-empty'}`}>
                    {task.description || 'No description'}
                </p>
            )}

            <div className="tk-card-tags">
                <span className="tk-chip">
                    <FontAwesomeIcon icon={task.taskType === 'Regular Office Task' ? faBuilding : faFolderOpen} />
                    {taskContextLabel(task)}
                </span>
                {task.recurringTaskId && (
                    <span className="rt-day-badge" title="Part of a daily task - a fresh one arrives each morning">
                        <FontAwesomeIcon icon={faRepeat} /> Daily
                    </span>
                )}
                {/* Approval state matters more than anything else on the card,
                    so it sits with the tags rather than hidden in the detail. */}
                {task.isSelfAssigned && task.approvalStatus === 'Pending' && (
                    <span className="ap-badge pending" title="Waiting for your manager to approve">
                        <FontAwesomeIcon icon={faHourglassHalf} /> Awaiting
                    </span>
                )}
                {task.isSelfAssigned && task.approvalStatus === 'Rejected' && (
                    <span className="ap-badge rejected" title={task.approvalNote || 'Rejected'}>
                        <FontAwesomeIcon icon={faCircleXmark} /> Rejected
                    </span>
                )}
                {task.isSelfAssigned && task.approvalStatus === 'Approved' && (
                    <span
                        className="ap-badge self"
                        title={task.approvedBy
                            ? `You logged this · approved by ${task.approvedBy.name}`
                            : 'You logged this task yourself'}
                    >
                        <FontAwesomeIcon icon={faUserPen} /> Self Assigned
                    </span>
                )}
                <span className={`tk-due ${due.tone}`}>{due.text}</span>
            </div>

            {hasTimeWindow(task, { requireExplicit: false }) && <TaskCountdown task={task} compact />}

            <div className="tk-card-foot">
                <div
                    className="tk-avatars is-clickable"
                    role="button"
                    tabIndex={0}
                    title="See who is working on this"
                    /* The card navigates to the task, so this must not bubble. */
                    onClick={(e) => { e.stopPropagation(); setShowPeople(true); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault(); e.stopPropagation(); setShowPeople(true);
                        }
                    }}
                >
                    <Avatar name={currentUser?.name} profilePic={currentUser?.profilePic} className="assignee-avatar me" title={`${currentUser?.name} (you)`} />
                    {others.slice(0, 2).map(a => (
                        <Avatar key={a._id} name={a.name} profilePic={a.profilePic} className="assignee-avatar" title={a.name} />
                    ))}
                    {others.length > 2 && (
                        <span className="assignee-avatar avatar-more">+{others.length - 2}</span>
                    )}
                </div>

                <div className="tk-meta">
                    {task.attachments?.length > 0 && (
                        <span title={`${task.attachments.length} attachment(s)`}>
                            <FontAwesomeIcon icon={faPaperclip} /> {task.attachments.length}
                        </span>
                    )}
                    {task.completionProof?.length > 0 && (
                        <span title="Supporting Documents/Materials attached">
                            <FontAwesomeIcon icon={faCheckCircle} /> {task.completionProof.length}
                        </span>
                    )}
                    <span title="Open discussion"><FontAwesomeIcon icon={faComment} /></span>
                </div>
            </div>

            {/* The card's own roster. `currentUser` is listed first because the
                stack shows it first, so the popup reads in the same order. */}
            <AssigneePopup
                open={showPeople}
                onClose={() => setShowPeople(false)}
                title="Working on this"
                subtitle={task.title}
                people={[currentUser, ...others]}
            />
        </article>
    );
};

const MyTasks = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user'));
    const currentUserId = currentUser?.id || currentUser?._id;
    const [searchParams, setSearchParams] = useSearchParams();

    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'board');

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [priority, setPriority] = useState('All');
    const [project, setProject] = useState('All');

    // `editing` doubles as the resubmit target: null means "new task".
    const [selfFormOpen, setSelfFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);

    const [draggingId, setDraggingId] = useState(null);
    const [dragOverCol, setDragOverCol] = useState(null);
    const [movingId, setMovingId] = useState(null);

    useEffect(() => localStorage.setItem(VIEW_KEY, view), [view]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // A board needs the whole set at once, so this view is deliberately unpaginated.
    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/tasks/my', { params: { page: 1, limit: 200, search: debouncedSearch } });
            setTasks(res.data.data);
        } catch (err) {
            console.error('Failed to load tasks', err);
            Swal.fire('Error', 'Could not load your tasks.', 'error');
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch]);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    // Deep link from a notification.
    useEffect(() => {
        const taskId = searchParams.get('task');
        if (!taskId) return;
        
        searchParams.delete('task');
        setSearchParams(searchParams, { replace: true });
        navigate(`/task/${taskId}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Project options come from the tasks themselves — employees can't list projects.
    const projectOptions = useMemo(() => {
        const names = new Set(tasks.map(t => taskContextLabel(t)).filter(Boolean));
        return Array.from(names).sort();
    }, [tasks]);

    const visibleTasks = useMemo(() => tasks.filter(t =>
        (priority === 'All' || t.priority === priority) &&
        (project === 'All' || taskContextLabel(t) === project)
    ), [tasks, priority, project]);

    const stats = useMemo(() => {
        const now = new Date();
        return {
            total: visibleTasks.length,
            active: visibleTasks.filter(t => t.status === 'In Progress').length,
            overdue: visibleTasks.filter(t => t.status !== 'Completed' && new Date(t.overdueAt || t.dueDate) < now).length,
            done: visibleTasks.filter(t => t.status === 'Completed').length
        };
    }, [visibleTasks]);

    const activeFilters = (priority !== 'All' ? 1 : 0) + (project !== 'All' ? 1 : 0) + (searchTerm ? 1 : 0);
    const clearFilters = () => { setPriority('All'); setProject('All'); setSearchTerm(''); };

    // --- Drag to move between columns ---
    const moveTask = async (task, newStatus) => {
        if (!task || task.status === newStatus) return;

        const previous = task.status;
        setMovingId(task._id);
        // Optimistic: the card lands in the new column immediately.
        setTasks(prev => prev.map(t => (t._id === task._id ? { ...t, status: newStatus } : t)));

        try {
            const data = new FormData();
            data.append('status', newStatus);
            const res = await api.put(`/tasks/${task._id}/status`, data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setTasks(prev => prev.map(t => (t._id === task._id ? res.data : t)));
        } catch (err) {
            // Put it back where it came from.
            setTasks(prev => prev.map(t => (t._id === task._id ? { ...t, status: previous } : t)));
            Swal.fire('Could not move task', err.response?.data?.message || 'Please try again.', 'error');
        } finally {
            setMovingId(null);
        }
    };

    const onDragStart = (e, task) => {
        setDraggingId(task._id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task._id);
    };

    const onDragEnd = useCallback(() => {
        setDraggingId(null);
        setDragOverCol(null);
    }, []);

    const onDrop = (e, status) => {
        e.preventDefault();
        setDragOverCol(null);
        setDraggingId(null);
        const id = e.dataTransfer.getData('text/plain');
        moveTask(tasks.find(t => t._id === id), status);
    };

    return (
        <div className="attendance-container fade-in tk-page">
            {/* ---------- Header ---------- */}
            <header className="tk-header">
                <div>
                    <h1 className="tk-title">
                        <FontAwesomeIcon icon={faClipboardList} /> My Tasks
                    </h1>
                    <p className="tk-subtitle">Everything assigned to you, across every project.</p>
                </div>

                <button
                    className="gts-btn primary"
                    style={{ marginLeft: 'auto', marginRight: '10px' }}
                    onClick={() => { setEditing(null); setSelfFormOpen(true); }}
                >
                    <FontAwesomeIcon icon={faPlus} /> Log a task
                </button>

                <div className="tk-view-toggle" role="group" aria-label="View">
                    <button
                        className={view === 'board' ? 'active' : ''}
                        onClick={() => setView('board')}
                    >
                        <FontAwesomeIcon icon={faTableColumns} /> Board
                    </button>
                    <button
                        className={view === 'list' ? 'active' : ''}
                        onClick={() => setView('list')}
                    >
                        <FontAwesomeIcon icon={faListUl} /> List
                    </button>
                </div>
            </header>

            {/* ---------- Stat tiles ---------- */}
            <div className="tk-stats">
                <div className="tk-stat">
                    <span className="tk-stat-label">Total</span>
                    <span className="tk-stat-value">{stats.total}</span>
                </div>
                <div className="tk-stat">
                    <span className="tk-stat-label">In Progress</span>
                    <span className="tk-stat-value accent">{stats.active}</span>
                </div>
                <div className="tk-stat">
                    <span className="tk-stat-label">Overdue</span>
                    <span className={`tk-stat-value ${stats.overdue > 0 ? 'danger' : ''}`}>{stats.overdue}</span>
                </div>
                <div className="tk-stat">
                    <span className="tk-stat-label">Completed</span>
                    <span className="tk-stat-value success">{stats.done}</span>
                </div>
            </div>

            {/* ---------- Toolbar ---------- */}
            <div className="tk-toolbar">
                <div className="tk-search">
                    <FontAwesomeIcon icon={faSearch} />
                    <input
                        type="text" placeholder="Search by task, colleague or project..."
                        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <select
                    className={`tk-select ${priority !== 'All' ? 'is-active' : ''}`}
                    value={priority} onChange={(e) => setPriority(e.target.value)}
                >
                    <option value="All">All Priorities</option>
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                </select>

                <select
                    className={`tk-select ${project !== 'All' ? 'is-active' : ''}`}
                    value={project} onChange={(e) => setProject(e.target.value)}
                >
                    <option value="All">All Projects</option>
                    {projectOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>

                {activeFilters > 0 && (
                    <button className="tk-clear" onClick={clearFilters}>
                        <FontAwesomeIcon icon={faTimes} /> Clear
                    </button>
                )}
            </div>

            {/* ---------- Content ---------- */}
            {loading ? (
                <div className="tk-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading your tasks...</div>
            ) : visibleTasks.length === 0 ? (
                <div className="tk-empty big">
                    <FontAwesomeIcon icon={faInbox} className="tk-empty-icon" />
                    <h3>{activeFilters > 0 ? 'No tasks match your filters' : 'Nothing assigned to you'}</h3>
                    <p>{activeFilters > 0 ? 'Try widening your search.' : "When someone assigns you work, it'll show up here."}</p>
                    {activeFilters > 0 && (
                        <button className="gts-btn secondary" onClick={clearFilters}>Clear filters</button>
                    )}
                </div>
            ) : view === 'board' ? (
                <div className="tk-board">
                    {COLUMNS.map(col => {
                        const colTasks = visibleTasks.filter(t => t.status === col);
                        return (
                            <section
                                key={col}
                                className={`tk-col ${slug(col)} ${dragOverCol === col ? 'drag-over' : ''}`}
                                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col); }}
                                onDragLeave={() => setDragOverCol(prev => (prev === col ? null : prev))}
                                onDrop={(e) => onDrop(e, col)}
                            >
                                <header className="tk-col-head">
                                    <span className="tk-col-dot" />
                                    <span className="tk-col-name">{col}</span>
                                    <span className="tk-col-count">{colTasks.length}</span>
                                </header>

                                <div className="tk-col-body">
                                    {colTasks.map(t => (
                                        <TaskCard
                                            key={t._id} task={t}
                                            currentUser={currentUser} currentUserId={currentUserId}
                                            isDragging={draggingId === t._id} isMoving={movingId === t._id}
                                            onDragStart={onDragStart} onDragEnd={onDragEnd} onOpen={(t) => navigate(`/task/${t._id}`)}
                                        />
                                    ))}
                                    {colTasks.length === 0 && (
                                        <div className="tk-col-empty">Drop a task here</div>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
            ) : (
                <div className="tk-list">
                    {COLUMNS.filter(col => visibleTasks.some(t => t.status === col)).map(col => (
                        <div key={col} className="tk-list-group">
                            <div className={`tk-list-group-head ${slug(col)}`}>
                                <span className="tk-col-dot" />
                                {col}
                                <span className="tk-col-count">{visibleTasks.filter(t => t.status === col).length}</span>
                            </div>
                            <div className="tk-list-rows">
                                {visibleTasks.filter(t => t.status === col).map(t => (
                                    <TaskCard
                                        key={t._id} task={t} compact
                                        currentUser={currentUser} currentUserId={currentUserId}
                                        isDragging={draggingId === t._id} isMoving={movingId === t._id}
                                        onDragStart={onDragStart} onDragEnd={onDragEnd} onOpen={(t) => navigate(`/task/${t._id}`)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {view === 'board' && !loading && visibleTasks.length > 0 && (
                <p className="tk-hint">
                    Tip: drag a card to another column to change its status. The status is shared, so everyone on the task sees the change.
                </p>
            )}

            <SelfTaskForm
                open={selfFormOpen}
                task={editing}
                onClose={() => { setSelfFormOpen(false); setEditing(null); }}
                onSaved={fetchTasks}
            />
        </div>
    );
};

export default MyTasks;
