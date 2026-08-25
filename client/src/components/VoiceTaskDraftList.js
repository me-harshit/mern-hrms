import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faCircleCheck, faCircleXmark, faSpinner, faTrash, faRepeat, faPen,
    faTriangleExclamation, faWandMagicSparkles, faLayerGroup, faCheck
} from '@fortawesome/free-solid-svg-icons';
import EmployeeMultiSelect from './EmployeeMultiSelect';
import api from '../utils/api';
import { nextWorkingDays, prettyDate, todayYmd } from '../utils/scheduleDates';
import '../styles/voiceTask.css';

let nextKey = 1;

// Server drafts carry *guesses* (names, not ids) — this turns each one into
// the same shape the manual form already edits, so the rest of this
// component (and the requests it eventually sends) never has to know the
// task came from voice at all. See BulkVoiceTask.md §4.
const toEditableItem = (draft) => {
    const matchedAssigneeIds = draft.resolvedAssignees.filter(a => a.matched).map(a => a.id);
    const unmatchedNames = draft.resolvedAssignees.filter(a => !a.matched).map(a => a.nameHeard);

    const base = {
        key: nextKey++,
        include: true,
        expanded: false,
        status: 'draft',      // draft | submitting | done | error
        errorMessage: null,
        kind: draft.kind,
        title: draft.title,
        description: draft.description || '',
        taskType: draft.taskType,
        priority: draft.priority,
        projectId: draft.resolvedProject?.matched ? draft.resolvedProject.id : '',
        unmatchedProjectName: draft.resolvedProject && !draft.resolvedProject.matched ? draft.resolvedProject.nameHeard : null,
        assigneeIds: matchedAssigneeIds,
        unmatchedNames,
        notes: draft.notes || ''
    };

    if (draft.kind === 'recurring') {
        const count = draft.resolvedDates.targetCount || draft.resolvedDates.plannedDates.length || 5;
        const start = draft.resolvedDates.plannedDates[0] || todayYmd();
        return {
            ...base,
            recurStart: start,
            recurCount: count,
            plannedDates: draft.resolvedDates.plannedDates
        };
    }

    return {
        ...base,
        startDate: draft.resolvedDates.startDate || '',
        dueDate: draft.resolvedDates.dueDate || ''
    };
};

const rowIssues = (item) => {
    const issues = [];
    if (!item.title.trim()) issues.push('Needs a title');
    if (item.assigneeIds.length === 0) issues.push('Pick at least one assignee');
    if (item.taskType === 'Project Task' && !item.projectId) issues.push('Pick a project');
    if (item.kind === 'single' && !item.dueDate) issues.push('Pick a due date');
    if (item.kind === 'recurring' && item.plannedDates.length === 0) issues.push('Pick how many days');
    return issues;
};

/**
 * Reviews several voice-parsed task drafts at once — "assign this to Rahul,
 * and separately have Priya do the daily report" comes back as two drafts
 * here rather than one form. Each is its own card: collapsed to a summary by
 * default (expanded automatically if something needs attention), with its
 * own Edit and Create so one can be fixed and created without waiting on the
 * rest. "Create All" up top just calls the existing single/recurring create
 * endpoints once per included draft (BulkVoiceTask.md §4) — no bulk-create
 * endpoint, no duplicated validation logic.
 */
const VoiceTaskDraftList = ({ drafts, employeesList, projectsList, onAllDone, onDiscard }) => {
    const [items, setItems] = useState(() => drafts.map(d => {
        const item = toEditableItem(d);
        return { ...item, expanded: rowIssues(item).length > 0 };
    }));
    const [running, setRunning] = useState(false);

    const update = (key, patch) => {
        setItems(prev => prev.map(it => (it.key === key ? { ...it, ...patch } : it)));
    };

    const updateRecurrence = (key, { start, count }) => {
        setItems(prev => prev.map(it => {
            if (it.key !== key) return it;
            const recurStart = start ?? it.recurStart;
            const recurCount = count ?? it.recurCount;
            const n = Math.max(1, Math.min(60, Number(recurCount) || 1));
            return { ...it, recurStart, recurCount: n, plannedDates: nextWorkingDays(recurStart, n) };
        }));
    };

    const removeItem = (key) => setItems(prev => prev.filter(it => it.key !== key));

    const employeeName = (id) => employeesList.find(e => e._id === id)?.name || '?';
    const projectName = (id) => projectsList.find(p => p._id === id)?.name || '?';

    const summaryLine = (item) => {
        const who = item.assigneeIds.length > 0
            ? item.assigneeIds.map(employeeName).join(', ')
            : 'No one yet';
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

    const createOne = async (item) => {
        const data = new FormData();
        data.append('title', item.title);
        data.append('description', item.description || '');
        data.append('taskType', item.taskType);
        data.append('projectId', item.taskType === 'Project Task' ? item.projectId : '');
        data.append('priority', item.priority);
        data.append('assigneeIds', JSON.stringify(item.assigneeIds));

        if (item.kind === 'recurring') {
            data.append('plannedDates', JSON.stringify(item.plannedDates));
            await api.post('/tasks/recurring', data, { headers: { 'Content-Type': 'multipart/form-data' } });
        } else {
            data.append('startDate', item.startDate || '');
            data.append('dueDate', item.dueDate);
            await api.post('/tasks', data, { headers: { 'Content-Type': 'multipart/form-data' } });
        }
    };

    const createSingle = async (item) => {
        if (rowIssues(item).length > 0) return;
        update(item.key, { status: 'submitting', errorMessage: null });
        try {
            await createOne(item);
            update(item.key, { status: 'done', expanded: false });
        } catch (err) {
            update(item.key, {
                status: 'error',
                errorMessage: err.response?.data?.message || 'Could not create this task.'
            });
        }
    };

    const includedCount = items.filter(i => i.include && i.status !== 'done').length;
    const blockingCount = items.filter(i => i.include && i.status !== 'done' && rowIssues(i).length > 0).length;
    const allDone = items.length > 0 && items.every(i => !i.include || i.status === 'done');

    const handleCreateAll = async () => {
        setRunning(true);
        for (const item of items) {
            if (!item.include || item.status === 'done') continue;
            if (rowIssues(item).length > 0) continue;
            await createSingle(item);
        }
        setRunning(false);
    };

    return (
        <div className="vdl-wrap">
            <div className="vdl-header">
                <div className="vdl-title">
                    <FontAwesomeIcon icon={faLayerGroup} /> {items.length} task{items.length === 1 ? '' : 's'} heard
                    {!allDone && (
                        <span className="vdl-subtitle">
                            {includedCount} to create{blockingCount > 0 ? ` · ${blockingCount} need attention` : ''}
                        </span>
                    )}
                </div>
                <div className="vdl-header-actions">
                    <button type="button" className="gts-btn secondary" onClick={onDiscard} disabled={running}>
                        Start Over
                    </button>
                    {allDone ? (
                        <button type="button" className="gts-btn primary" onClick={onAllDone}>
                            <FontAwesomeIcon icon={faCircleCheck} /> Done — Go to Tasks
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="gts-btn primary"
                            onClick={handleCreateAll}
                            disabled={running || includedCount === 0 || blockingCount > 0}
                        >
                            {running
                                ? <><FontAwesomeIcon icon={faSpinner} spin /> Creating…</>
                                : <>Create All ({includedCount})</>}
                        </button>
                    )}
                </div>
            </div>

            <div className="vdl-list">
                {items.map((item) => {
                    const issues = rowIssues(item);
                    const busy = item.status === 'submitting' || running;
                    return (
                        <div key={item.key} className={`vdl-card ${!item.include ? 'is-excluded' : ''} status-${item.status}`}>
                            <div className="vdl-card-top">
                                <label className="vdl-include">
                                    <input
                                        type="checkbox"
                                        checked={item.include}
                                        onChange={(e) => update(item.key, { include: e.target.checked })}
                                        disabled={busy || item.status === 'done'}
                                    />
                                </label>

                                <div className="vdl-card-heading">
                                    <span className="vdl-card-title">
                                        {item.title || <em>Untitled task</em>}
                                        {item.kind === 'recurring' && (
                                            <span className="vdl-badge"><FontAwesomeIcon icon={faRepeat} /> Daily</span>
                                        )}
                                    </span>
                                    {!item.expanded && <span className="vdl-summary">{summaryLine(item)}</span>}
                                </div>

                                {item.status === 'done' && <FontAwesomeIcon icon={faCircleCheck} className="vdl-status-icon done" />}
                                {item.status === 'submitting' && <FontAwesomeIcon icon={faSpinner} spin className="vdl-status-icon" />}
                                {item.status === 'error' && <FontAwesomeIcon icon={faCircleXmark} className="vdl-status-icon error" />}

                                {item.status !== 'done' && (
                                    <div className="vdl-card-actions">
                                        <button
                                            type="button"
                                            className="gts-btn secondary sm"
                                            onClick={() => update(item.key, { expanded: !item.expanded })}
                                            disabled={busy}
                                        >
                                            <FontAwesomeIcon icon={item.expanded ? faCheck : faPen} /> {item.expanded ? 'Done' : 'Edit'}
                                        </button>
                                        <button
                                            type="button"
                                            className="gts-btn primary sm"
                                            onClick={() => createSingle(item)}
                                            disabled={busy || !item.include || issues.length > 0}
                                        >
                                            {item.status === 'submitting'
                                                ? <FontAwesomeIcon icon={faSpinner} spin />
                                                : 'Create'}
                                        </button>
                                        <button
                                            type="button"
                                            className="vdl-remove"
                                            onClick={() => removeItem(item.key)}
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
                                    <textarea
                                        className="custom-input"
                                        rows={2}
                                        value={item.description}
                                        onChange={(e) => update(item.key, { description: e.target.value })}
                                        placeholder="Description (optional)"
                                        disabled={busy}
                                    />

                                    <div className="vdl-row">
                                        <div className="vdl-field">
                                            <label>Type</label>
                                            <select
                                                className="swal2-select custom-select"
                                                value={item.taskType}
                                                onChange={(e) => update(item.key, { taskType: e.target.value, projectId: '' })}
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
                                                    onChange={(e) => update(item.key, { projectId: e.target.value })}
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
                                                onChange={(e) => update(item.key, { priority: e.target.value })}
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
                                        <div className="vdl-row">
                                            <div className="vdl-field">
                                                <label>Starts</label>
                                                <input
                                                    type="date"
                                                    className="custom-input"
                                                    value={item.recurStart}
                                                    onChange={(e) => updateRecurrence(item.key, { start: e.target.value })}
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
                                                    onChange={(e) => updateRecurrence(item.key, { count: e.target.value })}
                                                    disabled={busy}
                                                />
                                            </div>
                                            <div className="vdl-field vdl-static">
                                                <label>Ends</label>
                                                <span>
                                                    {item.plannedDates.length > 0
                                                        ? prettyDate(item.plannedDates[item.plannedDates.length - 1])
                                                        : '—'}
                                                    {' '}(Sundays skipped)
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="vdl-row">
                                            <div className="vdl-field">
                                                <label>Start date</label>
                                                <input
                                                    type="date"
                                                    className="custom-input"
                                                    value={item.startDate}
                                                    onChange={(e) => update(item.key, { startDate: e.target.value })}
                                                    disabled={busy}
                                                />
                                            </div>
                                            <div className="vdl-field">
                                                <label>Due date *</label>
                                                <input
                                                    type="date"
                                                    className="custom-input"
                                                    value={item.dueDate}
                                                    onChange={(e) => update(item.key, { dueDate: e.target.value })}
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
                                            onChange={(ids) => update(item.key, { assigneeIds: ids })}
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
                })}
            </div>
        </div>
    );
};

export default VoiceTaskDraftList;
