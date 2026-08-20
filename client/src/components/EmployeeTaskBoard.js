import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSearch, faTimes, faChevronDown, faUsers, faUserCheck, faUserClock,
    faTriangleExclamation, faPlus, faFolderOpen, faBuilding, faPaperclip,
    faUserGroup
} from '@fortawesome/free-solid-svg-icons';
import Pagination from './Pagination';
import { slug, initials, taskContextLabel, dueLabel, shortDate } from '../utils/taskHelpers';

// Opens on the people who are carrying work — that's the question this view
// gets asked most. The "No tasks at all" tile is one click away.
const DEFAULT_WORKLOAD = 'with';

const WORKLOAD_OPTIONS = [
    { value: 'All', label: 'Everyone' },
    { value: 'with', label: 'Has tasks' },
    { value: 'without', label: 'No tasks at all' },
    { value: 'idle', label: 'Nothing open' },
    { value: 'overdue', label: 'Has overdue' }
];

/**
 * The management list read from the other end: people first, their workload
 * second. It answers "who is loaded up and who is free" — a question the
 * task-first table can't answer, because an employee with nothing assigned
 * simply doesn't appear there.
 */
const EmployeeTaskBoard = () => {
    const navigate = useNavigate();

    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(() => new Set());

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [workload, setWorkload] = useState(DEFAULT_WORKLOAD);
    const [sort, setSort] = useState('name');

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => setCurrentPage(1), [debouncedSearch, workload, sort]);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/tasks/by-employee', {
                params: {
                    page: currentPage,
                    limit: itemsPerPage,
                    search: debouncedSearch,
                    workload,
                    sort
                }
            });
            setRows(res.data.data || []);
            setSummary(res.data.summary || null);
            setTotalPages(res.data.pagination.totalPages);
            setTotalRecords(res.data.pagination.totalRecords);
        } catch (err) {
            console.error('Failed to load employee workload', err);
            Swal.fire('Error', 'Could not load the employee view.', 'error');
        } finally {
            setLoading(false);
        }
    }, [currentPage, itemsPerPage, debouncedSearch, workload, sort]);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    // Collapse everything when the result set changes underneath us, so a row
    // never stays open against somebody else's data.
    useEffect(() => { setExpanded(new Set()); }, [currentPage, debouncedSearch, workload, sort]);

    const toggleRow = (id) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const activeFilterCount = (workload !== DEFAULT_WORKLOAD ? 1 : 0) + (searchTerm ? 1 : 0);

    const clearFilters = () => {
        setWorkload(DEFAULT_WORKLOAD);
        setSearchTerm('');
    };

    // Summary counts the whole (searched) scope, so it tells an empty *filter*
    // apart from an empty roster.
    const rosterIsEmpty = !searchTerm && (summary?.totalEmployees ?? 0) === 0;
    const workloadLabel = WORKLOAD_OPTIONS.find(o => o.value === workload)?.label || 'this group';

    return (
        <>
            {summary && (
                <div className="emp-stat-row">
                    <button
                        type="button"
                        className={`emp-stat ${workload === 'All' ? 'active' : ''}`}
                        onClick={() => setWorkload('All')}
                    >
                        <span className="emp-stat-icon all"><FontAwesomeIcon icon={faUsers} /></span>
                        <span className="emp-stat-text">
                            <strong>{summary.totalEmployees}</strong>
                            <small>In your scope</small>
                        </span>
                    </button>

                    <button
                        type="button"
                        className={`emp-stat ${workload === 'with' ? 'active' : ''}`}
                        onClick={() => setWorkload('with')}
                    >
                        <span className="emp-stat-icon busy"><FontAwesomeIcon icon={faUserCheck} /></span>
                        <span className="emp-stat-text">
                            <strong>{summary.withTasks}</strong>
                            <small>Has tasks</small>
                        </span>
                    </button>

                    <button
                        type="button"
                        className={`emp-stat ${workload === 'without' ? 'active' : ''}`}
                        onClick={() => setWorkload('without')}
                    >
                        <span className="emp-stat-icon free"><FontAwesomeIcon icon={faUserClock} /></span>
                        <span className="emp-stat-text">
                            <strong>{summary.withoutTasks}</strong>
                            <small>No tasks at all</small>
                        </span>
                    </button>

                    <button
                        type="button"
                        className={`emp-stat ${workload === 'idle' ? 'active' : ''}`}
                        onClick={() => setWorkload('idle')}
                    >
                        <span className="emp-stat-icon idle"><FontAwesomeIcon icon={faUserClock} /></span>
                        <span className="emp-stat-text">
                            <strong>{summary.idle}</strong>
                            <small>Nothing open</small>
                        </span>
                    </button>

                    <button
                        type="button"
                        className={`emp-stat ${workload === 'overdue' ? 'active' : ''}`}
                        onClick={() => setWorkload('overdue')}
                    >
                        <span className="emp-stat-icon late"><FontAwesomeIcon icon={faTriangleExclamation} /></span>
                        <span className="emp-stat-text">
                            <strong>{summary.overloaded}</strong>
                            <small>Has overdue</small>
                        </span>
                    </button>
                </div>
            )}

            <div className="task-toolbar">
                <div className="task-toolbar-search">
                    <FontAwesomeIcon icon={faSearch} className="task-search-icon" />
                    <input
                        type="text"
                        placeholder="Search employees by name, ID, title or department..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="task-toolbar-filters">
                    <select
                        className={`task-filter-select ${workload !== DEFAULT_WORKLOAD ? 'is-active' : ''}`}
                        value={workload}
                        onChange={(e) => setWorkload(e.target.value)}
                    >
                        {WORKLOAD_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>

                    <select
                        className={`task-filter-select ${sort !== 'name' ? 'is-active' : ''}`}
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                    >
                        <option value="name">Sort: Name</option>
                        <option value="busiest">Sort: Busiest first</option>
                        <option value="freest">Sort: Most free first</option>
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
                    Loading employees...
                </div>
            ) : rows.length === 0 ? (
                /* The view opens pre-filtered, so an empty list usually means the
                   filter hid everyone — not that the roster is empty. */
                <div className="control-card text-center" style={{ padding: '60px 20px' }}>
                    <FontAwesomeIcon icon={faUsers} style={{ fontSize: '3.5rem', color: '#cbd5e1', marginBottom: '15px' }} />
                    <h3 style={{ color: '#475569' }}>
                        {searchTerm
                            ? 'No employee matches that search'
                            : rosterIsEmpty
                                ? 'No employees in your scope'
                                : 'Nobody falls into this group'}
                    </h3>
                    <p className="text-muted">
                        {searchTerm
                            ? `Nothing matched "${searchTerm}".`
                            : rosterIsEmpty
                                ? 'Nobody is mapped to you yet — ask HR to set up your team.'
                                : `${summary?.totalEmployees ?? 0} employee${summary?.totalEmployees === 1 ? ' is' : 's are'} in your scope, but none are in "${workloadLabel}".`}
                    </p>
                    {!rosterIsEmpty && (
                        <button className="gts-btn secondary" style={{ marginTop: '12px' }} onClick={clearFilters}>
                            <FontAwesomeIcon icon={faTimes} /> Reset filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="emp-board">
                    {rows.map(emp => {
                        const isOpen = expanded.has(emp._id);
                        const c = emp.counts;
                        const hasNone = c.total === 0;

                        return (
                            <div
                                key={emp._id}
                                className={`emp-row ${isOpen ? 'open' : ''} ${hasNone ? 'is-free' : ''}`}
                            >
                                <div
                                    className="emp-row-head"
                                    onClick={() => !hasNone && toggleRow(emp._id)}
                                    role={hasNone ? undefined : 'button'}
                                    tabIndex={hasNone ? undefined : 0}
                                    onKeyDown={(e) => {
                                        if (!hasNone && (e.key === 'Enter' || e.key === ' ')) {
                                            e.preventDefault();
                                            toggleRow(emp._id);
                                        }
                                    }}
                                >
                                    <div className="assignee-avatar">{initials(emp.name)}</div>

                                    <div className="emp-identity">
                                        <span className="emp-name">{emp.name}</span>
                                        <span className="emp-sub">
                                            {[emp.employeeId, emp.jobTitle || emp.role, emp.department]
                                                .filter(Boolean).join(' · ')}
                                        </span>
                                    </div>

                                    <div className="emp-counts">
                                        {hasNone ? (
                                            <span className="emp-none-pill">No tasks assigned</span>
                                        ) : (
                                            <>
                                                {c.pending > 0 && <span className="task-status-badge pending">{c.pending} Pending</span>}
                                                {c.inProgress > 0 && <span className="task-status-badge inprogress">{c.inProgress} In Progress</span>}
                                                {c.onHold > 0 && <span className="task-status-badge onhold">{c.onHold} On Hold</span>}
                                                {c.completed > 0 && <span className="task-status-badge completed">{c.completed} Done</span>}
                                                {c.overdue > 0 && <span className="task-status-badge blocked">{c.overdue} Overdue</span>}
                                            </>
                                        )}
                                    </div>

                                    <div className="emp-row-actions" onClick={(e) => e.stopPropagation()}>
                                        <span className="emp-open-count" title="Tasks still open">
                                            {emp.openCount} open
                                        </span>
                                        <button
                                            className="icon-btn"
                                            title={`Assign a task to ${emp.name}`}
                                            aria-label={`Assign a task to ${emp.name}`}
                                            onClick={() => navigate('/add-task')}
                                        >
                                            <FontAwesomeIcon icon={faPlus} />
                                        </button>
                                        {!hasNone && (
                                            <FontAwesomeIcon
                                                icon={faChevronDown}
                                                className={`emp-caret ${isOpen ? 'flip' : ''}`}
                                                onClick={() => toggleRow(emp._id)}
                                            />
                                        )}
                                    </div>
                                </div>

                                {isOpen && (
                                    <div className="emp-task-list">
                                        {/* Shares its column template with every row below, so
                                            the values sit in real columns instead of drifting
                                            with the width of each badge. */}
                                        <div className="emp-task-head">
                                            <span />
                                            <span>Task</span>
                                            <span>Assigned</span>
                                            <span>Due</span>
                                            <span>Priority</span>
                                            <span>Status</span>
                                        </div>

                                        {emp.tasks.map(task => {
                                            const due = dueLabel(task.dueDate, task.status === 'Completed');
                                            return (
                                                <div
                                                    key={task._id}
                                                    className="emp-task"
                                                    onClick={() => navigate(`/task/${task._id}`)}
                                                >
                                                    <span className={`emp-task-bar ${slug(task.status)}`} />

                                                    <div className="emp-task-main">
                                                        <span className="emp-task-title">{task.title}</span>
                                                        <span className="emp-task-meta">
                                                            <span className={`task-context ${task.taskType === 'Regular Office Task' ? 'is-office' : ''}`}>
                                                                <FontAwesomeIcon icon={task.taskType === 'Regular Office Task' ? faBuilding : faFolderOpen} />
                                                                <span className="task-context-label">{taskContextLabel(task)}</span>
                                                            </span>
                                                            {task.assignedBy?.name && (
                                                                <span className="emp-task-by">by {task.assignedBy.name}</span>
                                                            )}
                                                            {task.shareCount > 1 && (
                                                                <span className="emp-task-by" title="Shared task">
                                                                    <FontAwesomeIcon icon={faUserGroup} /> {task.shareCount}
                                                                </span>
                                                            )}
                                                            {task.attachmentCount > 0 && (
                                                                <span className="emp-task-by">
                                                                    <FontAwesomeIcon icon={faPaperclip} /> {task.attachmentCount}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>

                                                    {/* One cell per column. The relative note hangs
                                                        under the due date rather than replacing it. */}
                                                    <span className="emp-task-cell" data-label="Assigned">
                                                        <span className="emp-task-date-value">
                                                            {shortDate(task.assignedAt)}
                                                        </span>
                                                    </span>

                                                    <span className="emp-task-cell" data-label="Due">
                                                        <span className={`emp-task-date-value ${due.tone}`}>
                                                            {shortDate(task.dueDate)}
                                                        </span>
                                                        {['overdue', 'today', 'soon'].includes(due.tone) && (
                                                            <span className={`emp-task-due-note ${due.tone}`}>{due.text}</span>
                                                        )}
                                                    </span>

                                                    <span className="emp-task-cell" data-label="Priority">
                                                        <span className={`priority-badge ${slug(task.priority)}`}>{task.priority}</span>
                                                    </span>

                                                    <span className="emp-task-cell" data-label="Status">
                                                        <span className={`task-status-badge ${slug(task.status)}`}>{task.status}</span>
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
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
                    onLimitChange={(val) => { setItemsPerPage(val); setCurrentPage(1); }}
                />
            )}
        </>
    );
};

export default EmployeeTaskBoard;
