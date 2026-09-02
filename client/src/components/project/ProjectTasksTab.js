import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faListCheck, faClock, faUserPen } from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';
import EmployeeAvatar from '../EmployeeAvatar';
import Pagination from '../Pagination';
import { fmtDate, pillClass, isOverdue } from './projectShared';

/**
 * Tasks on this project — feature draft F1.3.
 *
 * This tab owns the project's task numbers. They used to sit on the page
 * header as read-only tiles, which made the top of the workspace a row of
 * digits you had to decode before you could read anything, duplicated what the
 * tab badges already said, and — being one screen away from the list — could
 * not be acted on. Here each count is also the filter that reaches it.
 *
 * The server scopes this exactly as the main task list does; opening a project
 * grants no task visibility a person did not already have. So an employee sees
 * their own work on the project plus anything they handed out, and a manager
 * sees what they assigned — the same rows, gathered by project instead of by
 * person. Nothing is hidden here that another screen would show.
 */

const PRIORITIES = ['All', 'Urgent', 'High', 'Medium', 'Low'];

// The chip row, left to right. `tone` picks the dot colour in project.css.
const CHIPS = [
    { key: 'All', label: 'All' },
    { key: 'Pending', label: 'Pending' },
    { key: 'In Progress', label: 'In Progress', tone: 'tone-progress' },
    { key: 'On Hold', label: 'On Hold', tone: 'tone-hold' },
    { key: 'Completed', label: 'Completed', tone: 'tone-done' }
];

const ProjectTasksTab = ({ projectId, onCount }) => {
    const navigate = useNavigate();

    const [rows, setRows] = useState([]);
    const [counts, setCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('All');
    const [overdueOnly, setOverdueOnly] = useState(false);
    const [priority, setPriority] = useState('All');
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(15);
    const [pagination, setPagination] = useState({ totalPages: 1, totalRecords: 0 });

    useEffect(() => {
        const t = setTimeout(() => setDebounced(search), 400);
        return () => clearTimeout(t);
    }, [search]);

    // Any filter change invalidates the page number — staying on page 4 of a
    // result set that now has one page shows an empty list.
    useEffect(() => { setPage(1); }, [status, overdueOnly, priority, debounced, limit]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/projects/${projectId}/tasks`, {
                params: {
                    status,
                    priority,
                    overdue: overdueOnly ? 'true' : undefined,
                    search: debounced || undefined,
                    page,
                    limit
                }
            });
            setRows(res.data.data || []);
            setCounts(res.data.counts || {});
            setPagination(res.data.pagination || { totalPages: 1, totalRecords: 0 });
            // The tab badge shows the project's whole task count, not the
            // filtered subset — a badge that moved when you filtered would be
            // reporting the filter rather than the project.
            if (onCount) onCount(res.data.counts?.All ?? 0);
        } catch {
            setRows([]);
        } finally {
            setLoading(false);
        }
        // onCount is recreated by the parent on every render; including it here
        // would refetch the list on each keystroke elsewhere on the page.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, status, priority, overdueOnly, debounced, page, limit]);

    useEffect(() => { load(); }, [load]);

    // Picking a status clears the overdue lens and vice versa: they are two
    // ways of slicing the same list, and combining them silently produced
    // "Completed + Overdue", which is always empty and looks like a bug.
    const pickStatus = (key) => { setStatus(key); setOverdueOnly(false); };

    const overdueCount = counts.Overdue ?? 0;

    return (
        <>
            <div className="pw-chips">
                {CHIPS.map((chip) => (
                    <button
                        key={chip.key}
                        type="button"
                        className={`pw-chip ${chip.tone || ''} ${status === chip.key && !overdueOnly ? 'is-active' : ''}`}
                        onClick={() => pickStatus(chip.key)}
                    >
                        {chip.tone && <span className="pw-chip-dot" />}
                        {chip.label}
                        <span className="pw-chip-n">{counts[chip.key] ?? 0}</span>
                    </button>
                ))}

                {/* Overdue is a lens across statuses, not a status. Disabled
                    when there is nothing overdue — good news is not a button. */}
                <button
                    type="button"
                    disabled={overdueCount === 0}
                    className={`pw-chip tone-late ${overdueOnly ? 'is-active' : ''} ${overdueCount === 0 ? 'is-empty' : ''}`}
                    onClick={() => { setOverdueOnly((v) => !v); setStatus('All'); }}
                >
                    <span className="pw-chip-dot" />
                    Overdue
                    <span className="pw-chip-n">{overdueCount}</span>
                </button>
            </div>

            <div className="pw-toolbar">
                <input
                    className="pw-search"
                    placeholder="Search tasks…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select
                    className={`pw-select ${priority !== 'All' ? 'is-active' : ''}`}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                >
                    {PRIORITIES.map((p) => (
                        <option key={p} value={p}>{p === 'All' ? 'Any priority' : p}</option>
                    ))}
                </select>
            </div>

            <div className="pw-panel">
                {loading ? (
                    <div className="pw-empty">Loading tasks…</div>
                ) : rows.length === 0 ? (
                    <div className="pw-empty">
                        <FontAwesomeIcon icon={faListCheck} className="pw-empty-icon" />
                        <strong>Nothing here</strong>
                        No tasks on this project match the filters above.
                    </div>
                ) : rows.map((task) => (
                    <div
                        key={task._id}
                        className="pw-row is-clickable"
                        onClick={() => navigate(`/task/${task._id}`)}
                    >
                        <div className="pw-row-main">
                            <p className="pw-row-title">
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {task.title}
                                </span>
                                {task.approvalStatus === 'Pending' && (
                                    <span className="pw-pill on-hold">Awaiting approval</span>
                                )}
                            </p>
                            <div className="pw-row-sub">
                                <span>
                                    <FontAwesomeIcon icon={faClock} />
                                    Due {fmtDate(task.dueDate)}{task.dueTime ? ` · ${task.dueTime}` : ''}
                                </span>
                                <span>
                                    <FontAwesomeIcon icon={faUserPen} />
                                    {task.assignedBy?.name || 'Unknown'}
                                </span>
                            </div>
                        </div>

                        <div className="pw-row-side">
                            {isOverdue(task) && <span className="pw-pill overdue">Overdue</span>}
                            <span className={`pw-pill ${pillClass(task.priority)} is-ghost`}>
                                {task.priority}
                            </span>
                            <span className={`pw-pill ${pillClass(task.status)}`}>
                                {task.status}
                            </span>
                            <div className="pw-avatars">
                                {(task.assignees || []).slice(0, 3).map((a) => (
                                    <EmployeeAvatar key={a._id} person={a} className="table-avatar" />
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {!loading && rows.length > 0 && (
                <Pagination
                    currentPage={page}
                    totalPages={pagination.totalPages}
                    totalRecords={pagination.totalRecords}
                    limit={limit}
                    onPageChange={setPage}
                    onLimitChange={(n) => { setLimit(n); setPage(1); }}
                />
            )}
        </>
    );
};

export default ProjectTasksTab;
