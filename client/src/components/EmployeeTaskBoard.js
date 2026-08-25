import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSearch, faTimes, faChevronDown, faUsers, faUserCheck, faUserClock,
    faTriangleExclamation, faPlus, faFolderOpen, faBuilding, faPaperclip,
    faUserGroup, faCalendarMinus
} from '@fortawesome/free-solid-svg-icons';
import { slug, taskContextLabel, dueLabel, shortDate } from '../utils/taskHelpers';
import Avatar from './Avatar';
import TaskCountdown, { hasTimeWindow } from './TaskCountdown';

// Opens on the people who are carrying work — that's the question this view
// gets asked most. The "No tasks at all" tile is one click away.
const DEFAULT_WORKLOAD = 'with';
const UNASSIGNED_DEPT = 'Unassigned';

// department is free text with no validation, so real data carries case and
// whitespace variants of the same department ("Data Operations " vs "Data
// Operations"). Trimming is enough to collapse those without needing a data
// migration; blank/null goes in its own named bucket rather than vanishing.
const normDept = (d) => (d || '').trim() || UNASSIGNED_DEPT;

const WORKLOAD_OPTIONS = [
    { value: 'All', label: 'Everyone' },
    { value: 'with', label: 'Has tasks' },
    { value: 'without', label: 'No tasks at all' },
    { value: 'idle', label: 'Nothing open' },
    { value: 'overdue', label: 'Has overdue' },
    { value: 'today-empty', label: 'No task due today' }
];

// One badge of colour down a card's side, so a scan of the grid finds the
// people who need attention without reading every number.
const loadClassOf = (row) => {
    if (row.counts.total === 0) return 'empty';
    if (row.counts.overdue > 0) return 'heavy';
    if (row.openCount >= 3) return 'loaded';
    return 'light';
};

/**
 * The management list read from the other end: people and departments first,
 * their workload second. It answers "who is loaded up and who is free" — a
 * question the task-first table can't answer, because an employee with
 * nothing assigned simply doesn't appear there.
 *
 * Loaded once in full rather than paginated: department grouping and paging
 * don't compose (a "page" would slice a department in half), and at the
 * scale this runs at — tens to a couple hundred employees — one request for
 * everyone in scope is cheap. Search/department/workload filtering all
 * happen client-side against that one payload, so they're instant rather
 * than a round-trip per keystroke.
 */
const EmployeeTaskBoard = () => {
    const navigate = useNavigate();

    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(() => new Set());

    const [searchTerm, setSearchTerm] = useState('');
    const [department, setDepartment] = useState('All');
    const [workload, setWorkload] = useState(DEFAULT_WORKLOAD);

    useEffect(() => {
        setLoading(true);
        api.get('/tasks/by-employee', { params: { limit: 500 } })
            .then(res => {
                setRows(res.data.data || []);
                setSummary(res.data.summary || null);
            })
            .catch(err => {
                console.error('Failed to load employee workload', err);
                Swal.fire('Error', 'Could not load the employee view.', 'error');
            })
            .finally(() => setLoading(false));
    }, []);

    const toggleRow = (id) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const departmentOptions = useMemo(
        () => [...new Set(rows.map(r => normDept(r.department)))].sort(),
        [rows]
    );

    const filteredRows = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return rows.filter(r => {
            if (department !== 'All' && normDept(r.department) !== department) return false;
            if (q) {
                const hay = [r.name, r.employeeId, r.jobTitle, normDept(r.department)]
                    .filter(Boolean).join(' ').toLowerCase();
                if (!hay.includes(q)) return false;
            }
            switch (workload) {
                case 'with': return r.counts.total > 0;
                case 'without': return r.counts.total === 0;
                case 'idle': return r.openCount === 0;
                case 'overdue': return r.counts.overdue > 0;
                case 'today-empty': return r.counts.dueToday === 0;
                default: return true;
            }
        });
    }, [rows, searchTerm, department, workload]);

    const grouped = useMemo(() => {
        const map = new Map();
        filteredRows.forEach(r => {
            const d = normDept(r.department);
            if (!map.has(d)) map.set(d, []);
            map.get(d).push(r);
        });
        return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [filteredRows]);

    // Changing any filter remounts the sections below, which both re-runs
    // their entrance animation and drops any open card — a card must never
    // stay expanded over somebody else's data.
    const viewKey = `${searchTerm}|${department}|${workload}`;
    useEffect(() => { setExpanded(new Set()); }, [viewKey]);

    const activeFilterCount = (workload !== DEFAULT_WORKLOAD ? 1 : 0) +
        (searchTerm ? 1 : 0) + (department !== 'All' ? 1 : 0);

    const clearFilters = () => {
        setWorkload(DEFAULT_WORKLOAD);
        setSearchTerm('');
        setDepartment('All');
    };

    const rosterIsEmpty = !searchTerm && (summary?.totalEmployees ?? 0) === 0;
    const workloadLabel = WORKLOAD_OPTIONS.find(o => o.value === workload)?.label || 'this group';

    const renderTaskList = (emp) => (
        <div className="emp-task-list">
            {/* Shares its column template with every row below, so the values
                sit in real columns instead of drifting with the width of each
                badge. */}
            <div className="emp-task-head">
                <span />
                <span>Task</span>
                <span>Assigned</span>
                <span>Due</span>
                <span>Priority</span>
                <span>Status</span>
            </div>

            {emp.tasks.map(task => {
                const due = dueLabel(task.dueDate, task.status === 'Completed', task.overdueAt);
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

                        <span className="emp-task-cell" data-label="Assigned">
                            <span className="emp-task-date-value">{shortDate(task.assignedAt)}</span>
                        </span>

                        <span className="emp-task-cell" data-label="Due">
                            <span className={`emp-task-date-value ${due.tone}`}>
                                {shortDate(task.dueDate)}
                            </span>
                            {['overdue', 'today', 'soon'].includes(due.tone) && (
                                <span className={`emp-task-due-note ${due.tone}`}>{due.text}</span>
                            )}
                            {hasTimeWindow(task) && <TaskCountdown task={task} compact />}
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
    );

    return (
        <>
            {summary && (
                <div className="emp-stat-row">
                    <button type="button" className={`emp-stat ${workload === 'All' ? 'active' : ''}`} onClick={() => setWorkload('All')}>
                        <span className="emp-stat-icon all"><FontAwesomeIcon icon={faUsers} /></span>
                        <span className="emp-stat-text"><strong>{summary.totalEmployees}</strong><small>In your scope</small></span>
                    </button>
                    <button type="button" className={`emp-stat ${workload === 'with' ? 'active' : ''}`} onClick={() => setWorkload('with')}>
                        <span className="emp-stat-icon busy"><FontAwesomeIcon icon={faUserCheck} /></span>
                        <span className="emp-stat-text"><strong>{summary.withTasks}</strong><small>Has tasks</small></span>
                    </button>
                    <button type="button" className={`emp-stat ${workload === 'without' ? 'active' : ''}`} onClick={() => setWorkload('without')}>
                        <span className="emp-stat-icon free"><FontAwesomeIcon icon={faUserClock} /></span>
                        <span className="emp-stat-text"><strong>{summary.withoutTasks}</strong><small>No tasks at all</small></span>
                    </button>
                    <button type="button" className={`emp-stat ${workload === 'idle' ? 'active' : ''}`} onClick={() => setWorkload('idle')}>
                        <span className="emp-stat-icon idle"><FontAwesomeIcon icon={faUserClock} /></span>
                        <span className="emp-stat-text"><strong>{summary.idle}</strong><small>Nothing open</small></span>
                    </button>
                    <button type="button" className={`emp-stat ${workload === 'overdue' ? 'active' : ''}`} onClick={() => setWorkload('overdue')}>
                        <span className="emp-stat-icon late"><FontAwesomeIcon icon={faTriangleExclamation} /></span>
                        <span className="emp-stat-text"><strong>{summary.overloaded}</strong><small>Has overdue</small></span>
                    </button>
                    <button type="button" className={`emp-stat ${workload === 'today-empty' ? 'active' : ''}`} onClick={() => setWorkload('today-empty')}>
                        <span className="emp-stat-icon today"><FontAwesomeIcon icon={faCalendarMinus} /></span>
                        <span className="emp-stat-text"><strong>{summary.noTaskToday}</strong><small>No task due today</small></span>
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
                        className={`task-filter-select ${department !== 'All' ? 'is-active' : ''}`}
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                    >
                        <option value="All">All departments</option>
                        {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>

                    <select
                        className={`task-filter-select ${workload !== DEFAULT_WORKLOAD ? 'is-active' : ''}`}
                        value={workload}
                        onChange={(e) => setWorkload(e.target.value)}
                    >
                        {WORKLOAD_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
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
            ) : grouped.length === 0 ? (
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
                /* Keyed on the filter state so a change remounts the sections and
                   replays their entrance animation. */
                <div key={viewKey}>
                {grouped.map(([deptName, members]) => (
                    <div className="wl-dept-section" key={deptName}>
                        <div className="wl-dept-title">
                            {deptName}
                            <span className="wl-dept-count">{members.length}</span>
                        </div>

                        <div className="wl-grid">
                            {members.map((emp, idx) => {
                                const isOpen = expanded.has(emp._id);
                                const c = emp.counts;
                                const hasNone = c.total === 0;

                                return (
                                    <div
                                        key={emp._id}
                                        className={`wl-card wl-${loadClassOf(emp)} ${isOpen ? 'is-open' : ''}`}
                                        /* Capped, so a large department still finishes
                                           settling in well under half a second. */
                                        style={{ animationDelay: `${Math.min(idx * 18, 260)}ms` }}
                                    >
                                        <div
                                            className="wl-card-head"
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
                                            <Avatar name={emp.name} profilePic={emp.profilePic} className="assignee-avatar" />
                                            <div className="wl-identity">
                                                <span className="wl-name">{emp.name}</span>
                                                <span className="wl-role">
                                                    {[emp.employeeId, emp.jobTitle || emp.role].filter(Boolean).join(' · ')}
                                                </span>
                                            </div>
                                            <button
                                                type="button" className="icon-btn wl-add"
                                                title={`Assign a task to ${emp.name}`}
                                                aria-label={`Assign a task to ${emp.name}`}
                                                onClick={(e) => { e.stopPropagation(); navigate('/add-task'); }}
                                            >
                                                <FontAwesomeIcon icon={faPlus} />
                                            </button>
                                        </div>

                                        <div className="wl-badges">
                                            {hasNone ? (
                                                <span className="emp-none-pill">No tasks assigned</span>
                                            ) : (
                                                <>
                                                    {c.overdue > 0 && <span className="task-status-badge blocked">{c.overdue} Overdue</span>}
                                                    {c.pending > 0 && <span className="task-status-badge pending">{c.pending} Pending</span>}
                                                    {c.inProgress > 0 && <span className="task-status-badge inprogress">{c.inProgress} In Progress</span>}
                                                    {c.onHold > 0 && <span className="task-status-badge onhold">{c.onHold} On Hold</span>}
                                                    {c.completed > 0 && <span className="task-status-badge completed">{c.completed} Done</span>}
                                                    {c.dueToday === 0 && <span className="task-status-badge today">Nothing due today</span>}
                                                </>
                                            )}
                                        </div>

                                        <div className="wl-foot">
                                            <span>{c.total} total assigned</span>
                                            <span className="wl-open">{emp.openCount} open</span>
                                            {!hasNone && (
                                                <FontAwesomeIcon
                                                    icon={faChevronDown}
                                                    className={`emp-caret ${isOpen ? 'flip' : ''}`}
                                                    onClick={() => toggleRow(emp._id)}
                                                />
                                            )}
                                        </div>

                                        {/* Mounted only while open, rather than always-rendered
                                            and collapsed: every task list holds TaskCountdown
                                            instances that subscribe to a shared clock, and
                                            mounting all of them for every collapsed card is the
                                            cost hasTimeWindow() exists to avoid. The open
                                            animation is a keyframe so it runs on mount with no
                                            class flip; collapse is instant, which reads far less
                                            oddly than an instant expand would. */}
                                        {isOpen && (
                                            <div className="wl-expand">
                                                <div>{renderTaskList(emp)}</div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
                </div>
            )}
        </>
    );
};

export default EmployeeTaskBoard;
