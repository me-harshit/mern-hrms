import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faCircleCheck, faCircleXmark, faSpinner, faTrash, faRepeat, faPen,
    faTriangleExclamation, faWandMagicSparkles, faCheck, faCalendarDay
} from '@fortawesome/free-solid-svg-icons';
import EmployeeMultiSelect from './EmployeeMultiSelect';
import ScheduleProjection from './ScheduleProjection';
import api from '../utils/api';
import { nextWorkingDays, prettyDate, todayYmd } from '../utils/scheduleDates';

export const rowIssues = (item) => {
    const issues = [];
    if (!item.title.trim()) issues.push('Needs a title');
    if (item.assigneeIds.length === 0) issues.push('Pick at least one assignee');
    if (item.taskType === 'Project Task' && !item.projectId) issues.push('Pick a project');
    if (item.kind === 'single' && !item.dueDate) issues.push('Pick a due date');
    if (item.kind === 'recurring' && item.plannedDates.length === 0) issues.push('Pick how many days');
    return issues;
};

/**
 * One task card in the voice-assign review list (VoiceTaskDraftList.js).
 *
 * Kept at module scope in its own file rather than defined inside the list's
 * render — a component redefined on every render remounts instead of
 * updating, which is exactly the drag-and-drop bug TaskPlan.md §11 already
 * hit once with the task board's cards.
 *
 * Owns its own recurring-schedule preview (debounced call to the same
 * POST /tasks/recurring/preview the manual calendar uses) — that's display
 * detail local to this card, not something the parent list needs to know
 * about to create the task.
 */
const VoiceDraftCard = ({ item, employeesList, projectsList, onChange, onCreate, onRemove, disabled }) => {
    const update = (patch) => onChange(item.key, patch);

    const switchKind = (kind) => {
        if (kind === item.kind) return;
        if (kind === 'recurring') {
            const start = item.startDate || todayYmd();
            const count = 5;
            update({ kind, recurStart: start, recurCount: count, plannedDates: nextWorkingDays(start, count) });
        } else {
            update({ kind, startDate: item.recurStart || todayYmd(), dueDate: item.dueDate || '' });
        }
    };

    const updateRecurrence = ({ start, count }) => {
        const recurStart = start ?? item.recurStart;
        const recurCount = count ?? item.recurCount;
        const n = Math.max(1, Math.min(60, Number(recurCount) || 1));
        update({ recurStart, recurCount: n, plannedDates: nextWorkingDays(recurStart, n) });
    };

    // ---- recurring skip/holiday preview — mirrors AddTask.js's own debounced
    // call to the same endpoint, scoped to just this card. ----
    const [projection, setProjection] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => {
        if (item.kind !== 'recurring' || !item.expanded || item.plannedDates.length === 0 || item.assigneeIds.length === 0) {
            setProjection(null);
            return;
        }

        const timer = setTimeout(async () => {
            setPreviewLoading(true);
            try {
                const res = await api.post('/tasks/recurring/preview', {
                    assigneeIds: item.assigneeIds,
                    dates: item.plannedDates
                });
                setProjection(res.data.projection || null);
            } catch (err) {
                console.error('Could not preview the schedule', err);
                setProjection(null);
            } finally {
                setPreviewLoading(false);
            }
        }, 350);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.kind, item.expanded, item.recurStart, item.recurCount, JSON.stringify(item.assigneeIds)]);

    const employeeName = (id) => employeesList.find(e => e._id === id)?.name || '?';
    const projectName = (id) => projectsList.find(p => p._id === id)?.name || '?';

    const summaryLine = () => {
        const who = item.assigneeIds.length > 0 ? item.assigneeIds.map(employeeName).join(', ') : 'No one yet';
        const what = item.taskType === 'Project Task'
            ? (item.projectId ? projectName(item.projectId) : 'No project yet')
            : 'Office task';
        const when = item.kind === 'recurring'
            ? (item.plannedDates.length > 0
                ? `${item.plannedDates.length} days, ends ${prettyDate(item.plannedDates[item.plannedDates.length - 1])}`
                : 'No days yet')
            : (item.dueDate ? `due ${prettyDate(item.dueDate)}` : 'No due date yet');
        return `${who} · ${what} · ${item.priority} · ${when}`;
    };

    const issues = rowIssues(item);
    const busy = item.status === 'submitting' || disabled;

    return (
        <div className={`vdl-card ${!item.include ? 'is-excluded' : ''} status-${item.status}`}>
            <div className="vdl-card-top">
                <label className="vdl-include">
                    <input
                        type="checkbox"
                        checked={item.include}
                        onChange={(e) => update({ include: e.target.checked })}
                        disabled={busy || item.status === 'done'}
                    />
                </label>

                <div className="vdl-card-heading">
                    <span className="vdl-card-title">
                        {item.title || <em>Untitled task</em>}
                        {item.kind === 'recurring' && (
                            <span className="vdl-badge"><FontAwesomeIcon icon={faRepeat} /> Daily</span>
                        )}
                        {item.notes && !item.expanded && (
                            <span className="vdl-note-dot" title={item.notes}>
                                <FontAwesomeIcon icon={faWandMagicSparkles} />
                            </span>
                        )}
                    </span>
                    {!item.expanded && <span className="vdl-summary">{summaryLine()}</span>}
                </div>

                {item.status === 'done' && <FontAwesomeIcon icon={faCircleCheck} className="vdl-status-icon done" />}
                {item.status === 'submitting' && <FontAwesomeIcon icon={faSpinner} spin className="vdl-status-icon" />}
                {item.status === 'error' && <FontAwesomeIcon icon={faCircleXmark} className="vdl-status-icon error" />}

                {item.status !== 'done' && (
                    <div className="vdl-card-actions">
                        <button
                            type="button"
                            className="gts-btn secondary sm"
                            onClick={() => update({ expanded: !item.expanded })}
                            disabled={busy}
                        >
                            <FontAwesomeIcon icon={item.expanded ? faCheck : faPen} /> {item.expanded ? 'Done' : 'Edit'}
                        </button>
                        <button
                            type="button"
                            className="gts-btn primary sm"
                            onClick={() => onCreate(item)}
                            disabled={busy || !item.include || issues.length > 0}
                            title={issues.length > 0 ? issues.join(' · ') : undefined}
                        >
                            {item.status === 'submitting' ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Create'}
                        </button>
                        <button
                            type="button"
                            className="vdl-remove"
                            onClick={() => onRemove(item.key)}
                            disabled={busy}
                            aria-label="Remove this draft"
                        >
                            <FontAwesomeIcon icon={faTrash} />
                        </button>
                    </div>
                )}
            </div>

            {item.expanded && item.status !== 'done' && (
                <div className="vdl-card-body">
                    <input
                        type="text"
                        className="custom-input"
                        value={item.title}
                        onChange={(e) => update({ title: e.target.value })}
                        placeholder="Task title"
                        disabled={busy}
                    />

                    <textarea
                        className="custom-input"
                        rows={2}
                        value={item.description}
                        onChange={(e) => update({ description: e.target.value })}
                        placeholder="Description (optional)"
                        disabled={busy}
                    />

                    <div className="type-toggle vdl-kind-toggle">
                        <button
                            type="button"
                            className={`type-toggle-btn ${item.kind === 'single' ? 'active' : ''}`}
                            onClick={() => switchKind('single')}
                            disabled={busy}
                        >
                            <FontAwesomeIcon icon={faCalendarDay} /> One-off
                        </button>
                        <button
                            type="button"
                            className={`type-toggle-btn ${item.kind === 'recurring' ? 'active' : ''}`}
                            onClick={() => switchKind('recurring')}
                            disabled={busy}
                        >
                            <FontAwesomeIcon icon={faRepeat} /> Repeats daily
                        </button>
                    </div>

                    <div className="vdl-row">
                        <div className="vdl-field">
                            <label>Type</label>
                            <select
                                className="swal2-select custom-select"
                                value={item.taskType}
                                onChange={(e) => update({ taskType: e.target.value, projectId: '' })}
                                disabled={busy}
                            >
                                <option value="Project Task">Project Task</option>
                                <option value="Regular Office Task">Regular Office Task</option>
                            </select>
                        </div>

                        {item.taskType === 'Project Task' && (
                            <div className="vdl-field">
                                <label>Project</label>
                                <select
                                    className="swal2-select custom-select"
                                    value={item.projectId}
                                    onChange={(e) => update({ projectId: e.target.value })}
                                    disabled={busy}
                                >
                                    <option value="">
                                        {item.unmatchedProjectName ? `Heard "${item.unmatchedProjectName}" — pick one` : 'Select a project'}
                                    </option>
                                    {projectsList.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                                </select>
                            </div>
                        )}

                        <div className="vdl-field">
                            <label>Priority</label>
                            <select
                                className="swal2-select custom-select"
                                value={item.priority}
                                onChange={(e) => update({ priority: e.target.value })}
                                disabled={busy}
                            >
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                                <option value="Urgent">Urgent</option>
                            </select>
                        </div>
                    </div>

                    {item.kind === 'recurring' ? (
                        <>
                            <div className="vdl-row">
                                <div className="vdl-field">
                                    <label>Starts</label>
                                    <input
                                        type="date"
                                        className="custom-input"
                                        value={item.recurStart}
                                        onChange={(e) => updateRecurrence({ start: e.target.value })}
                                        disabled={busy}
                                    />
                                </div>
                                <div className="vdl-field">
                                    <label>How many days</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={60}
                                        className="custom-input"
                                        value={item.recurCount}
                                        onChange={(e) => updateRecurrence({ count: e.target.value })}
                                        disabled={busy}
                                    />
                                </div>
                                <div className="vdl-field vdl-static">
                                    <label>Ends</label>
                                    <span>
                                        {item.plannedDates.length > 0
                                            ? prettyDate(item.plannedDates[item.plannedDates.length - 1])
                                            : '—'}
                                    </span>
                                </div>
                            </div>
                            <ScheduleProjection
                                projection={projection}
                                loading={previewLoading}
                                selectedCount={item.plannedDates.length}
                            />
                        </>
                    ) : (
                        <div className="vdl-row">
                            <div className="vdl-field">
                                <label>Start date</label>
                                <input
                                    type="date"
                                    className="custom-input"
                                    value={item.startDate}
                                    onChange={(e) => update({ startDate: e.target.value })}
                                    disabled={busy}
                                />
                            </div>
                            <div className="vdl-field">
                                <label>Due date *</label>
                                <input
                                    type="date"
                                    className="custom-input"
                                    value={item.dueDate}
                                    onChange={(e) => update({ dueDate: e.target.value })}
                                    disabled={busy}
                                />
                            </div>
                        </div>
                    )}

                    <div className="vdl-field">
                        <label>Assign to</label>
                        <EmployeeMultiSelect
                            employees={employeesList}
                            selected={item.assigneeIds}
                            onChange={(ids) => update({ assigneeIds: ids })}
                            emptyText="No employees available to assign."
                        />
                        {item.unmatchedNames.length > 0 && (
                            <small className="vdl-warning">
                                <FontAwesomeIcon icon={faTriangleExclamation} /> Heard but couldn't match: {item.unmatchedNames.join(', ')} — add manually above if intended.
                            </small>
                        )}
                    </div>

                    {item.notes && (
                        <small className="vdl-note"><FontAwesomeIcon icon={faWandMagicSparkles} /> {item.notes}</small>
                    )}
                </div>
            )}

            {issues.length > 0 && item.status !== 'done' && (
                <small className="vdl-warning vdl-card-footer-note">
                    <FontAwesomeIcon icon={faTriangleExclamation} /> {issues.join(' · ')}
                </small>
            )}

            {item.status === 'error' && (
                <small className="vdl-error vdl-card-footer-note">
                    <FontAwesomeIcon icon={faCircleXmark} /> {item.errorMessage}
                </small>
            )}
        </div>
    );
};

export default VoiceDraftCard;
