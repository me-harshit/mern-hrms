import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSearch, faTimes, faChevronDown, faUsers, faUserCheck, faUserClock,
    faTriangleExclamation, faPlus, faFolderOpen, faBuilding, faPaperclip,
    faUserGroup, faCalendarMinus, faListCheck, faCircleCheck, faHourglassHalf
} from '@fortawesome/free-solid-svg-icons';
import { slug, taskContextLabel, dueLabel, shortDate } from '../utils/taskHelpers';
import Avatar from './Avatar';
import TaskCountdown, { hasTimeWindow } from './TaskCountdown';

// Opens on the people with work outstanding today — this board answers "what
// about today", and anything else is one click away on the tile row.
const DEFAULT_WORKLOAD = 'today-open';
const UNASSIGNED_DEPT = 'Unassigned';

// department is free text with no validation, so real data carries case and
// whitespace variants of the same department ("Data Operations " vs "Data
// Operations"). Trimming is enough to collapse those without needing a data
// migration; blank/null goes in its own named bucket rather than vanishing.
const normDept = (d) => (d || '').trim() || UNASSIGNED_DEPT;

/**
 * The four buckets are mutually exclusive and cover the whole roster, so the
 * tiles read as a breakdown rather than a set of overlapping flags.
 *
 * What they replaced counted *records*: "Has tasks" was `total > 0`, which
 * included people whose every task was finished — 13 of the 48 it reported.
 * Nothing here counts a completed task as work outstanding.
 */
const WORKLOAD_OPTIONS = [
    { value: 'All', label: 'Everyone' },
    { value: 'today-open', label: 'Task today — outstanding' },
    { value: 'today-done', label: 'Task today — all done' },
    { value: 'today-none', label: 'No task today' },
    { value: 'none-ever', label: 'No task at all' }
];

// One badge of colour down a card's side, so a scan of the grid finds the
// people who need attention without reading every number.
const loadClassOf = (row) => {
    if (row.counts.total === 0) return 'empty';
    if (row.counts.overdue > 0) return 'heavy';
    // Today's outstanding work drives the accent, not the lifetime pile —
    // three tasks finished last week is not a loaded day.
    if (row.counts.openToday >= 3) return 'loaded';
    if (row.counts.openToday > 0) return 'light';
    return 'empty';
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
    const [overdueOnly, setOverdueOnly] = useState(false);

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
            // Overdue is a state of today's work rather than an alternative
            // to it, so it narrows whichever bucket is selected instead of
            // replacing it.
            if (overdueOnly && r.counts.overdue === 0) return false;

            if (workload === 'All') return true;
            // "No task at all" is a list of gaps to fill, so it only counts
            // people who are actually in today — otherwise everyone on leave
            // lands in it, having no tasks for exactly the reason you'd
            // expect, and buries the handful who genuinely need work.
            if (workload === 'none-ever' && r.absentToday) return false;
            return r.bucket === workload;
        });
    }, [rows, searchTerm, department, workload, overdueOnly]);

    // Only for the line that says so — these rows are never rendered.
    const hiddenAbsent = useMemo(
        () => (workload === 'none-ever'
            ? rows.filter(r => r.bucket === 'none-ever' && r.absentToday).length
            : 0),
        [rows, workload]
    );

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
    const viewKey = `${searchTerm}|${department}|${workload}|${overdueOnly}`;
    useEffect(() => { setExpanded(new Set()); }, [viewKey]);

    const activeFilterCount = (workload !== DEFAULT_WORKLOAD ? 1 : 0) +
        (searchTerm ? 1 : 0) + (department !== 'All' ? 1 : 0) + (overdueOnly ? 1 : 0);

    const clearFilters = () => {
        setWorkload(DEFAULT_WORKLOAD);
        setSearchTerm('');
        setDepartment('All');
        setOverdueOnly(false);
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
                            <span className="emp-task-title">
                                {task.isToday && <span className="emp-task-today" title="On this person's plate today">Today</span>}
                                {task.title}
                            </span>
                            <span className="emp-task-meta">
                                <span className={`task-context ${task.taskType === 'Regular Office Task' ? 'is-office' : ''}`}>
                                    <FontAwesomeIcon icon={task.taskType === 'Regular Office Task' ? faBuilding : faFolderOpen} />
                                    <span className="task-context-label">{taskContextLabel(task)}</span>
                                </span>
                                {task.awaitingApproval && (
                                    <span className="emp-task-awaiting" title="Waiting on an approval decision">
                                        <FontAwesomeIcon icon={faHourglassHalf} /> Awaiting approval
                                    </span>
                                )}
                                {task.assignedBy?.name && (
                                    <span className="emp-task-by">
                                        {task.isSelfAssigned ? 'self-assigned, via ' : 'by '}{task.assignedBy.name}
                                    </span>
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
                <>
                    {/* A breakdown, not a set of flags: the four buckets are
                        exclusive and add up to the roster, so the row can be
                        read left to right as "where did today go". */}
                    <div className="emp-stat-row">
                        <button type="button" className={`emp-stat ${workload === 'All' ? 'active' : ''}`} onClick={() => setWorkload('All')}>
                            <span className="emp-stat-icon all"><FontAwesomeIcon icon={faUsers} /></span>
                            <span className="emp-stat-text"><strong>{summary.totalEmployees}</strong><small>In your scope</small></span>
                        </button>
                        <button type="button" className={`emp-stat ${workload === 'today-open' ? 'active' : ''}`} onClick={() => setWorkload('today-open')}>
                            <span className="emp-stat-icon busy"><FontAwesomeIcon icon={faListCheck} /></span>
                            <span className="emp-stat-text"><strong>{summary.outstandingToday}</strong><small>Task today — outstanding</small></span>
                        </button>
                        <button type="button" className={`emp-stat ${workload === 'today-done' ? 'active' : ''}`} onClick={() => setWorkload('today-done')}>
                            <span className="emp-stat-icon done"><FontAwesomeIcon icon={faCircleCheck} /></span>
                            <span className="emp-stat-text"><strong>{summary.doneToday}</strong><small>Task today — all done</small></span>
                        </button>
                        <button type="button" className={`emp-stat ${workload === 'today-none' ? 'active' : ''}`} onClick={() => setWorkload('today-none')}>
                            <span className="emp-stat-icon today"><FontAwesomeIcon icon={faCalendarMinus} /></span>
                            <span className="emp-stat-text"><strong>{summary.noTaskToday}</strong><small>No task today</small></span>
                        </button>
                        <button type="button" className={`emp-stat ${workload === 'none-ever' ? 'active' : ''}`} onClick={() => setWorkload('none-ever')}>
                            <span className="emp-stat-icon free"><FontAwesomeIcon icon={faUserClock} /></span>
                            <span className="emp-stat-text"><strong>{summary.noTaskAtAll}</strong><small>No task at all</small></span>
                        </button>
                        {/* Deliberately outside the breakdown: overdue cuts
                            across every bucket, so it toggles rather than
                            selects. */}
                        <button
                            type="button"
                            className={`emp-stat is-toggle ${overdueOnly ? 'active' : ''}`}
                            onClick={() => setOverdueOnly(v => !v)}
                            title="Narrow whichever group is selected to just the people running late"
                        >
                            <span className="emp-stat-icon late"><FontAwesomeIcon icon={faTriangleExclamation} /></span>
                            <span className="emp-stat-text"><strong>{summary.overdue}</strong><small>Overdue now</small></span>
                        </button>
                    </div>
                </>
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

            {/* Said out loud rather than left as a silent omission — a count
                that doesn't match the roster is unsettling if nothing explains
                where the rest went. */}
            {!loading && hiddenAbsent > 0 && grouped.length > 0 && (
                <div className="wl-absent-note">
                    <FontAwesomeIcon icon={faCalendarMinus} />
                    <span>
                        {hiddenAbsent} more {hiddenAbsent === 1 ? 'person has' : 'people have'} nothing
                        assigned but {hiddenAbsent === 1 ? 'is' : 'are'} not in today — hidden from this list.
                    </span>
                </div>
            )}

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
                                : hiddenAbsent > 0
                                    ? 'Nobody here is short of work'
                                    : 'Nobody falls into this group'}
                    </h3>
                    <p className="text-muted">
                        {searchTerm
                            ? `Nothing matched "${searchTerm}".`
                            : rosterIsEmpty
                                ? 'Nobody is mapped to you yet — ask HR to set up your team.'
                                : hiddenAbsent > 0
                                    ? `Everyone with nothing assigned (${hiddenAbsent}) is out today.`
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

                        {/* Uniform card heights only while nothing is expanded —
                            see .wl-grid.is-uniform for why an open card has to
                            drop it. */}
                        <div className={`wl-grid ${expanded.size === 0 ? 'is-uniform' : ''}`}>
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
                                                    {/* Today first and stated plainly. The lifetime
                                                        "N Done" pill used to dominate this row, which
                                                        is what made a card with one open task read as
                                                        finished. */}
                                                    {c.overdue > 0 && <span className="task-status-badge blocked">{c.overdue} Overdue</span>}
                                                    {c.openToday > 0
                                                        ? <span className="task-status-badge today">{c.openToday} due today</span>
                                                        : c.doneToday > 0
                                                            ? <span className="task-status-badge completed">Today’s work done</span>
                                                            : <span className="task-status-badge muted">Nothing today</span>}
                                                    {c.pending > 0 && <span className="task-status-badge pending">{c.pending} Pending</span>}
                                                    {c.inProgress > 0 && <span className="task-status-badge inprogress">{c.inProgress} In Progress</span>}
                                                    {c.onHold > 0 && <span className="task-status-badge onhold">{c.onHold} On Hold</span>}
                                                    {/* Just another state the work can be in, sitting
                                                        with the rest — it counts toward today either
                                                        way, so it needs no filter of its own. */}
                                                    {c.awaitingApproval > 0 && (
                                                        <span className="task-status-badge awaiting" title="Self-assigned work waiting on an approval decision">
                                                            {c.awaitingApproval} Awaiting approval
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        <div className="wl-foot">
                                            <span>{emp.openCount} open</span>
                                            <span className="wl-open">{c.completed} done all-time</span>
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
