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
import DateRangeFilter from '../../components/DateRangeFilter';

const COLUMNS = ['Pending', 'In Progress', 'On Hold', 'Completed'];
const VIEW_KEY = 'mytasks_view';

// How many finished tasks the Completed column shows before asking. Whatever
// this is, it must be small: the column is history, and history only grows.
const COMPLETED_PAGE = 12;

// Which window the board opens on. 'All' here restores the previous
// show-everything behaviour without touching anything else.
const DEFAULT_DATE_FILTER = 'Today';

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

    // Outstanding work and finished history are fetched separately.
    //
    // They grow at completely different rates -- open work stays small
    // because people finish things, history never shrinks -- so one shared
    // request meant the Completed column made the page enormous and, past the
    // page limit, pushed live work out of the response entirely.
    const [tasks, setTasks] = useState([]);
    const [done, setDone] = useState([]);
    const [doneTotal, setDoneTotal] = useState(0);
    const [donePages, setDonePages] = useState(1);
    const [donePage, setDonePage] = useState(1);
    const [doneLoading, setDoneLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'board');

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [priority, setPriority] = useState('All');
    const [project, setProject] = useState('All');

    // Opens on today's work rather than the whole backlog — the board is a
    // "what am I doing now" view, and every other day is one button away.
    const [dateFilter, setDateFilter] = useState(DEFAULT_DATE_FILTER);
    const [customDates, setCustomDates] = useState({ from: '', to: '' });

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
            const res = await api.get('/tasks/my', {
                params: {
                    page: 1,
                    limit: 200,
                    /*
                     * Open work only; the Completed column loads its own pages.
                     *
                     * A flag rather than a status value, so an API that predates
                     * it ignores the parameter and returns everything -- which
                     * this page renders correctly anyway, because the open
                     * columns filter by status and the Completed column reads
                     * its own list. Sending `status=Open` to such an API would
                     * match nothing and blank the board.
                     */
                    excludeCompleted: true,
                    search: debouncedSearch,
                    filterType: dateFilter,
                    fromDate: customDates.from,
                    toDate: customDates.to,
                    /*
                     * The project filter is server-side (feature draft F1.9).
                     *
                     * It used to be derived from whatever the 200-task page
                     * happened to contain, which meant a project with nothing
                     * in the current date window simply had no option to pick,
                     * and picking one could only ever narrow what was already
                     * on screen. Asking the server means the filter selects
                     * from the real set of the reader's projects.
                     */
                    projectId: project !== 'All' && project !== 'OFFICE' ? project : undefined,
                    taskType: project === 'OFFICE' ? 'Regular Office Task' : undefined
                }
            });
            setTasks(res.data.data);
        } catch (err) {
            console.error('Failed to load tasks', err);
            Swal.fire('Error', 'Could not load your tasks.', 'error');
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, dateFilter, customDates, project]);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    /**
     * One page of finished work, appended to what is already shown.
     *
     * `reset` is what a filter change needs: the pages already loaded belong
     * to the old query and would otherwise be stacked underneath the new one.
     */
    const fetchDone = useCallback(async (pageToGet, { reset = false } = {}) => {
        setDoneLoading(true);
        try {
            const res = await api.get('/tasks/my', {
                params: {
                    page: pageToGet,
                    limit: COMPLETED_PAGE,
                    status: 'Completed',
                    search: debouncedSearch,
                    filterType: dateFilter,
                    fromDate: customDates.from,
                    toDate: customDates.to,
                    projectId: project !== 'All' && project !== 'OFFICE' ? project : undefined,
                    taskType: project === 'OFFICE' ? 'Regular Office Task' : undefined
                }
            });
            const rows = res.data.data || [];
            setDone(prev => (reset ? rows : [...prev, ...rows]));
            setDoneTotal(res.data.pagination?.totalRecords ?? rows.length);
            setDonePages(res.data.pagination?.totalPages ?? 1);
            setDonePage(pageToGet);
        } catch (err) {
            console.error('Failed to load completed tasks', err);
        } finally {
            setDoneLoading(false);
        }
    }, [debouncedSearch, dateFilter, customDates, project]);

    // Any change to the query restarts the history at page one.
    useEffect(() => { fetchDone(1, { reset: true }); }, [fetchDone]);

    // Deep link from a notification.
    useEffect(() => {
        const taskId = searchParams.get('task');
        if (!taskId) return;
        
        searchParams.delete('task');
        setSearchParams(searchParams, { replace: true });
        navigate(`/task/${taskId}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // The reader's own projects, from the workspace endpoint — an employee
    // cannot list every project in the company, and does not need to: this
    // filter only ever narrows work that is already theirs.
    const [projectOptions, setProjectOptions] = useState([]);
    useEffect(() => {
        api.get('/projects/mine')
            .then(res => setProjectOptions(res.data || []))
            .catch(() => setProjectOptions([]));
    }, []);

    // Project filtering now happens server-side; only priority is left to do
    // here, because it never changes which tasks were fetched.
    const byPriority = useCallback(
        (t) => priority === 'All' || t.priority === priority,
        [priority]
    );

    // Open work only. The Completed column reads `visibleDone` instead, since
    // it is paged and the two must not be concatenated into one array.
    const visibleTasks = useMemo(() => tasks.filter(byPriority), [tasks, byPriority]);
    const visibleDone = useMemo(() => done.filter(byPriority), [done, byPriority]);

    const stats = useMemo(() => {
        const now = new Date();
        return {
            // `doneTotal` is the server's count of the whole history, not the
            // page in hand, so the tiles do not shrink to whatever happens to
            // be loaded. The priority filter is client-side, so it can only be
            // reflected in what is on screen -- an acknowledged approximation
            // while a priority is selected.
            total: visibleTasks.length + (priority === 'All' ? doneTotal : visibleDone.length),
            active: visibleTasks.filter(t => t.status === 'In Progress').length,
            overdue: visibleTasks.filter(t => new Date(t.overdueAt || t.dueDate) < now).length,
            done: priority === 'All' ? doneTotal : visibleDone.length
        };
    }, [visibleTasks, visibleDone, doneTotal, priority]);

    // Tracked apart from the date window so an empty list can say which of the
    // two emptied it — "nothing due today" and "nothing matches your search"
    // send the reader somewhere quite different.
    const otherFilters = (priority !== 'All' ? 1 : 0) + (project !== 'All' ? 1 : 0) + (searchTerm ? 1 : 0);
    // The date window counts as a filter only when it has been moved off the
    // default, so landing on the page doesn't look like something is already
    // narrowing the list.
    const activeFilters = otherFilters + (dateFilter !== DEFAULT_DATE_FILTER ? 1 : 0);
    const windowLabel = {
        Today: 'today',
        Yesterday: 'yesterday',
        Week: 'in the last 7 days',
        Month: 'in the last 30 days',
        Custom: 'in this date range'
    }[dateFilter];
    const clearFilters = () => {
        setPriority('All');
        setProject('All');
        setSearchTerm('');
        setDateFilter(DEFAULT_DATE_FILTER);
        setCustomDates({ from: '', to: '' });
    };

    // --- Drag to move between columns ---
    /**
     * Move a card between columns.
     *
     * Crossing the Completed boundary means moving the task between the two
     * lists, not just relabelling it: `tasks` holds open work and `done` holds
     * the loaded page of history. The count moves with it so the column header
     * and the tiles stay honest without a refetch.
     */
    const place = useCallback((task, nextStatus) => {
        const wasDone = task.status === 'Completed';
        const nowDone = nextStatus === 'Completed';
        const moved = { ...task, status: nextStatus };

        if (wasDone === nowDone) {
            const put = (prev) => prev.map(t => (t._id === task._id ? moved : t));
            if (nowDone) setDone(put); else setTasks(put);
            return;
        }

        if (nowDone) {
            setTasks(prev => prev.filter(t => t._id !== task._id));
            // Newest-first, matching the order the server returns history in.
            setDone(prev => [moved, ...prev]);
            setDoneTotal(n => n + 1);
        } else {
            setDone(prev => prev.filter(t => t._id !== task._id));
            setTasks(prev => [...prev, moved]);
            setDoneTotal(n => Math.max(0, n - 1));
        }
    }, []);

    const moveTask = async (task, newStatus) => {
        if (!task || task.status === newStatus) return;

        const previous = task.status;
        setMovingId(task._id);
        // Optimistic: the card lands in the new column immediately.
        place(task, newStatus);

        try {
            const data = new FormData();
            data.append('status', newStatus);
            const res = await api.put(`/tasks/${task._id}/status`, data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            // Replace the optimistic copy with the server's, in whichever list
            // it now belongs to.
            const saved = res.data;
            const swap = (prev) => prev.map(t => (t._id === saved._id ? saved : t));
            if (saved.status === 'Completed') setDone(swap); else setTasks(swap);
        } catch (err) {
            // Put it back where it came from, list included.
            place({ ...task, status: newStatus }, previous);
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

            {/* ---------- Toolbar: date window, filters and search on one line ---------- */}
            <div className="tk-toolbar">
                <DateRangeFilter
                    value={dateFilter}
                    onChange={setDateFilter}
                    custom={customDates}
                    onCustomChange={setCustomDates}
                    inline
                />

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
                    {projectOptions.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                    {/* Office work has no project, so it cannot be one of the
                        options above — but it is still a thing people want to
                        filter down to. */}
                    <option value="OFFICE">Regular Office</option>
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
            ) : visibleTasks.length === 0 && visibleDone.length === 0 ? (
                <div className="tk-empty big">
                    <FontAwesomeIcon icon={faInbox} className="tk-empty-icon" />
                    {otherFilters > 0 ? (
                        <>
                            <h3>No tasks match your filters</h3>
                            <p>Try widening your search.</p>
                            <button className="gts-btn secondary" onClick={clearFilters}>Clear filters</button>
                        </>
                    ) : dateFilter !== 'All' ? (
                        <>
                            <h3>Nothing due {windowLabel}</h3>
                            <p>You may still have work outside this window.</p>
                            <button className="gts-btn secondary" onClick={() => setDateFilter('All')}>
                                Show all tasks
                            </button>
                        </>
                    ) : (
                        <>
                            <h3>Nothing assigned to you</h3>
                            <p>When someone assigns you work, it'll show up here.</p>
                        </>
                    )}
                </div>
            ) : view === 'board' ? (
                <div className="tk-board">
                    {COLUMNS.map(col => {
                        const isDone = col === 'Completed';
                        // History comes from its own paged list; the other three
                        // columns are the open set, which is loaded in full.
                        const colTasks = isDone ? visibleDone : visibleTasks.filter(t => t.status === col);
                        const more = isDone && donePage < donePages;
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
                                    <span className="tk-col-count">
                                        {isDone && priority === 'All' ? doneTotal : colTasks.length}
                                    </span>
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
                                        <div className="tk-col-empty">
                                            {isDone ? 'Nothing finished yet' : 'Drop a task here'}
                                        </div>
                                    )}

                                    {more && (
                                        <button
                                            type="button"
                                            className="tk-load-more"
                                            onClick={() => fetchDone(donePage + 1)}
                                            disabled={doneLoading}
                                        >
                                            {doneLoading
                                                ? 'Loading...'
                                                : `Show more (${Math.max(0, doneTotal - colTasks.length)} left)`}
                                        </button>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
            ) : (
                <div className="tk-list">
                    {COLUMNS.map(col => {
                        const isDone = col === 'Completed';
                        const rows = isDone ? visibleDone : visibleTasks.filter(t => t.status === col);
                        if (rows.length === 0) return null;
                        const more = isDone && donePage < donePages;
                        return (
                            <div key={col} className="tk-list-group">
                                <div className={`tk-list-group-head ${slug(col)}`}>
                                    <span className="tk-col-dot" />
                                    {col}
                                    <span className="tk-col-count">
                                        {isDone && priority === 'All' ? doneTotal : rows.length}
                                    </span>
                                </div>
                                <div className="tk-list-rows">
                                    {rows.map(t => (
                                        <TaskCard
                                            key={t._id} task={t} compact
                                            currentUser={currentUser} currentUserId={currentUserId}
                                            isDragging={draggingId === t._id} isMoving={movingId === t._id}
                                            onDragStart={onDragStart} onDragEnd={onDragEnd} onOpen={(t) => navigate(`/task/${t._id}`)}
                                        />
                                    ))}
                                    {more && (
                                        <button
                                            type="button"
                                            className="tk-load-more"
                                            onClick={() => fetchDone(donePage + 1)}
                                            disabled={doneLoading}
                                        >
                                            {doneLoading
                                                ? 'Loading...'
                                                : `Show more (${Math.max(0, doneTotal - rows.length)} left)`}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {view === 'board' && !loading && (visibleTasks.length > 0 || visibleDone.length > 0) && (
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
