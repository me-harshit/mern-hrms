import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faSpinner, faLayerGroup, faPlus, faMicrophone } from '@fortawesome/free-solid-svg-icons';
import VoiceDraftCard, { rowIssues } from './VoiceDraftCard';
import VoiceCommandBar from './VoiceCommandBar';
import api from '../utils/api';
import { todayYmd } from '../utils/scheduleDates';
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

// Auto-expands a freshly parsed card when something on it needs attention,
// so problems are visible without hunting for them.
const toReviewItems = (drafts) => drafts.map((d) => {
    const item = toEditableItem(d);
    return { ...item, expanded: rowIssues(item).length > 0 };
});

// A blank card for "+ Add Task" — same shape as a voice-parsed one, minus
// anything to guess. Starts expanded and one-off; the manager can flip it to
// recurring from the same kind toggle a voice-parsed card has.
const toBlankItem = () => ({
    key: nextKey++,
    include: true,
    expanded: true,
    status: 'draft',
    errorMessage: null,
    kind: 'single',
    title: '',
    description: '',
    taskType: 'Project Task',
    priority: 'Medium',
    projectId: '',
    unmatchedProjectName: null,
    assigneeIds: [],
    unmatchedNames: [],
    notes: '',
    startDate: '',
    dueDate: ''
});

/**
 * Reviews several voice-parsed task drafts at once — "assign this to Rahul,
 * and separately have Priya do the daily report" comes back as two drafts
 * here rather than one form. Each is its own card (VoiceDraftCard):
 * collapsed to a summary by default (expanded automatically if something
 * needs attention), with its own Edit and Create so one can be fixed and
 * created without waiting on the rest. "Create All" up top just calls the
 * existing single/recurring create endpoints once per included draft
 * (BulkVoiceTask.md §4) — no bulk-create endpoint, no duplicated validation.
 *
 * "Add Task" adds one blank card to fill by hand; "Add by Voice" reopens
 * VoiceCommandBar and appends whatever it parses to the same batch — so
 * creating the next task (even after the first batch is fully done) doesn't
 * force a trip back through the typed form.
 */
const VoiceTaskDraftList = ({ drafts, employeesList, projectsList, onAllDone, onDiscard }) => {
    const [items, setItems] = useState(() => toReviewItems(drafts));
    const [running, setRunning] = useState(false);
    const [voiceOpen, setVoiceOpen] = useState(false);

    const update = (key, patch) => {
        setItems(prev => prev.map(it => (it.key === key ? { ...it, ...patch } : it)));
    };

    const removeItem = (key) => setItems(prev => prev.filter(it => it.key !== key));

    const addBlankCard = () => setItems(prev => [...prev, toBlankItem()]);

    // A second (or third...) voice pass just adds to the batch already under
    // review — nothing already created or being edited is disturbed.
    const handleMoreVoiceDrafts = (newDrafts) => {
        setItems(prev => [...prev, ...toReviewItems(newDrafts)]);
        setVoiceOpen(false);
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
    const blockingItems = items.filter(i => i.include && i.status !== 'done' && rowIssues(i).length > 0);
    const allDone = items.length > 0 && items.every(i => !i.include || i.status === 'done');
    const allIncluded = items.length > 0 && items.every(i => i.include);

    const handleCreateAll = async () => {
        setRunning(true);
        for (const item of items) {
            if (!item.include || item.status === 'done') continue;
            if (rowIssues(item).length > 0) continue;
            await createSingle(item);
        }
        setRunning(false);
    };

    const toggleSelectAll = () => {
        const next = !allIncluded;
        setItems(prev => prev.map(it => (it.status === 'done' ? it : { ...it, include: next })));
    };

    return (
        <div className="vdl-wrap">
            <div className="vdl-header">
                <div className="vdl-title">
                    <FontAwesomeIcon icon={faLayerGroup} /> {items.length} task{items.length === 1 ? '' : 's'}
                    {!allDone && items.length > 0 && (
                        <span className="vdl-subtitle">
                            {includedCount} to create{blockingItems.length > 0 ? ` · ${blockingItems.length} need attention` : ''}
                        </span>
                    )}
                </div>
                <div className="vdl-header-actions">
                    {items.length > 0 && !allDone && (
                        <label className="vdl-select-all">
                            <input type="checkbox" checked={allIncluded} onChange={toggleSelectAll} disabled={running} />
                            Select all
                        </label>
                    )}
                    <button type="button" className="gts-btn secondary" onClick={addBlankCard} disabled={running}>
                        <FontAwesomeIcon icon={faPlus} /> Add Task
                    </button>
                    <button
                        type="button"
                        className="gts-btn secondary"
                        onClick={() => setVoiceOpen(v => !v)}
                        disabled={running}
                    >
                        <FontAwesomeIcon icon={faMicrophone} /> Add by Voice
                    </button>
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
                            disabled={running || includedCount === 0 || blockingItems.length > 0}
                            title={blockingItems.length > 0 ? 'Fix the flagged cards first' : undefined}
                        >
                            {running
                                ? <><FontAwesomeIcon icon={faSpinner} spin /> Creating…</>
                                : <>Create All ({includedCount})</>}
                        </button>
                    )}
                </div>
            </div>

            {voiceOpen && (
                <VoiceCommandBar onParsed={handleMoreVoiceDrafts} onClose={() => setVoiceOpen(false)} />
            )}

            {items.length === 0 ? (
                <div className="vdl-empty">
                    Every draft has been removed.
                    <button type="button" className="gts-btn secondary" onClick={addBlankCard}>
                        <FontAwesomeIcon icon={faPlus} /> Add Task
                    </button>
                    <button type="button" className="gts-btn secondary" onClick={() => setVoiceOpen(true)}>
                        <FontAwesomeIcon icon={faMicrophone} /> Add by Voice
                    </button>
                    <button type="button" className="gts-btn secondary" onClick={onDiscard}>
                        Start Over
                    </button>
                </div>
            ) : (
                <div className="vdl-list">
                    {items.map((item) => (
                        <VoiceDraftCard
                            key={item.key}
                            item={item}
                            employeesList={employeesList}
                            projectsList={projectsList}
                            onChange={update}
                            onCreate={createSingle}
                            onRemove={removeItem}
                            disabled={running}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default VoiceTaskDraftList;
