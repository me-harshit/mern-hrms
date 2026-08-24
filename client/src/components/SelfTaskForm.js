import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faSpinner, faPaperPlane, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import api from '../utils/api';
import DatePickerField from './DatePickerField';
import PersonPicker from './PersonPicker';
import TaskTimeWindow from './TaskTimeWindow';
import { datesBetween, prettyDate, todayYmd } from '../utils/scheduleDates';
import '../styles/recurring.css';
import '../styles/selftask.css';

/**
 * An employee logging work they were handed verbally (TaskPlan.md §15).
 *
 * A dialog rather than a page: this is a short form reached from the board, and
 * sending someone to a separate route to fill in six fields would lose their
 * place. Doubles as the resubmit form for a rejected request — same fields, so
 * the same component, with `task` supplied.
 */
const SelfTaskForm = ({ open, onClose, onSaved, task = null }) => {
    const isResubmit = Boolean(task);

    const [saving, setSaving] = useState(false);
    const [people, setPeople] = useState([]);
    const [projects, setProjects] = useState([]);
    const [form, setForm] = useState({
        title: '', description: '', taskType: 'Regular Office Task',
        projectId: '', priority: 'Medium', assignedById: '',
        startTime: '', dueTime: '', timeAllottedMinutes: ''
    });
    const [dates, setDates] = useState([]);

    useEffect(() => {
        if (!open) return;

        // Anyone active can be named as the person who gave out the work —
        // naming someone is a statement of fact, not a grant of approval rights.
        api.get('/employees/directory')
            .then(res => setPeople(res.data || []))
            .catch(() => setPeople([]));

        // Employees can't reach the management project list, so a failure here
        // just means the project option stays unavailable to them.
        api.get('/projects')
            .then(res => setProjects(res.data || []))
            .catch(() => setProjects([]));
    }, [open]);

    // Reopening for a different task must not show the previous one's values.
    useEffect(() => {
        if (!open) return;
        if (task) {
            setForm({
                title: task.title || '',
                description: task.description || '',
                taskType: task.taskType || 'Regular Office Task',
                projectId: task.projectId?._id || task.projectId || '',
                priority: task.priority || 'Medium',
                assignedById: task.assignedBy?._id || task.assignedBy || '',
                startTime: task.startTime || '',
                dueTime: task.dueTime || '',
                timeAllottedMinutes: task.timeAllottedMinutes || ''
            });
            const start = task.startDate ? task.startDate.slice(0, 10) : null;
            const due = task.dueDate ? task.dueDate.slice(0, 10) : null;
            setDates(due ? datesBetween(start || due, due) : []);
        } else {
            setForm({
                title: '', description: '', taskType: 'Regular Office Task',
                projectId: '', priority: 'Medium', assignedById: '',
                startTime: '', dueTime: '', timeAllottedMinutes: ''
            });
            setDates([]);
        }
    }, [open, task]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [open, saving, onClose]);

    if (!open) return null;

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const dateLabel = () => {
        if (dates.length === 0) return 'Pick the start and due date';
        if (dates.length === 1) return prettyDate(dates[0]);
        return `${prettyDate(dates[0])} → ${prettyDate(dates[dates.length - 1])}`;
    };

    const submit = async (e) => {
        e.preventDefault();

        if (!form.title.trim()) return Swal.fire('Add a title', 'Say what the work is.', 'warning');
        if (!form.assignedById) return Swal.fire('Who asked you?', 'Pick the person who gave you this work.', 'warning');
        if (form.taskType === 'Project Task' && !form.projectId) {
            return Swal.fire('Pick a project', 'Choose a project, or switch this to a Regular Office task.', 'warning');
        }
        if (dates.length === 0) return Swal.fire('Pick the dates', 'Choose when this starts and when it is due.', 'warning');
        if (form.startTime && form.dueTime && form.dueTime <= form.startTime) {
            return Swal.fire('Check times', 'The due/end time must be after the start time.', 'warning');
        }

        const payload = {
            ...form,
            startDate: dates[0],
            dueDate: dates[dates.length - 1]
        };

        setSaving(true);
        try {
            if (isResubmit) {
                await api.put(`/tasks/self/${task._id}`, payload);
            } else {
                await api.post('/tasks/self', payload);
            }
            await Swal.fire({
                icon: 'success',
                title: isResubmit ? 'Sent back for approval' : 'Task logged',
                text: 'Your manager has been notified. You can start on it right away.',
                timer: 2400,
                showConfirmButton: false
            });
            onSaved?.();
            onClose();
        } catch (err) {
            Swal.fire('Could not save', err.response?.data?.message || 'Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="st-overlay" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
            <div className="st-dialog" role="dialog" aria-modal="true" aria-label="Log a task">
                <header className="st-head">
                    <div>
                        <h3 className="st-title">{isResubmit ? 'Edit and resubmit' : 'Log a task for yourself'}</h3>
                        <p className="st-subtitle">
                            {isResubmit
                                ? 'Fix what was flagged and send it back for approval.'
                                : 'For work you were handed directly. It needs your manager’s approval, but you can start straight away.'}
                        </p>
                    </div>
                    <button type="button" className="st-close" onClick={onClose} disabled={saving} aria-label="Close">
                        <FontAwesomeIcon icon={faXmark} />
                    </button>
                </header>

                <form onSubmit={submit}>
                    <div className="st-body">
                        {/* Left: what the work actually is. */}
                        <div className="st-col left">
                            <div className="form-group">
                                <label className="input-label">What needs doing? *</label>
                                <input
                                    className="custom-input" type="text" value={form.title}
                                    onChange={(e) => set('title', e.target.value)}
                                    placeholder="e.g. Rework the Spectra pitch deck"
                                    autoFocus
                                />
                            </div>

                            <div className="form-group st-details">
                                <label className="input-label">Details</label>
                                <textarea
                                    className="custom-input" value={form.description}
                                    onChange={(e) => set('description', e.target.value)}
                                    placeholder="Anything worth recording about what was asked for \u2014 what was agreed, what done looks like."
                                />
                            </div>
                        </div>

                        {/* Right: everything about it. */}
                        <div className="st-col">
                            <div className="form-group">
                                <label className="input-label">Who asked you to do this? *</label>
                                <PersonPicker
                                    people={people}
                                    value={form.assignedById}
                                    onChange={(id) => set('assignedById', id)}
                                    placeholder="Search for a person..."
                                />
                            </div>

                            <div className="st-pair">
                                <div className="form-group">
                                    <label className="input-label">Priority</label>
                                    <select
                                        className="swal2-select custom-select"
                                        value={form.priority}
                                        onChange={(e) => set('priority', e.target.value)}
                                    >
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                        <option value="Urgent">Urgent</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="input-label">Type</label>
                                    <select
                                        className="swal2-select custom-select"
                                        value={form.taskType}
                                        onChange={(e) => {
                                            set('taskType', e.target.value);
                                            if (e.target.value === 'Regular Office Task') set('projectId', '');
                                        }}
                                    >
                                        <option value="Regular Office Task">Regular Office</option>
                                        <option value="Project Task">Project Task</option>
                                    </select>
                                </div>
                            </div>

                            {form.taskType === 'Project Task' && (
                                <div className="form-group">
                                    <label className="input-label">Project *</label>
                                    <select
                                        className="swal2-select custom-select"
                                        value={form.projectId}
                                        onChange={(e) => set('projectId', e.target.value)}
                                    >
                                        <option value="">Select a project</option>
                                        {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                                    </select>
                                    {projects.length === 0 && (
                                        <small className="task-hint">
                                            No projects available to you \u2014 log it as Regular Office instead.
                                        </small>
                                    )}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="input-label">Timeline *</label>
                                <DatePickerField
                                    displayValue={dateLabel()}
                                    isEmpty={dates.length === 0}
                                    mode="range"
                                    selected={dates}
                                    onChange={setDates}
                                    minDate={todayYmd()}
                                />
                            </div>

                            <div className="form-group">
                                <TaskTimeWindow
                                    startTime={form.startTime}
                                    dueTime={form.dueTime}
                                    timeAllottedMinutes={form.timeAllottedMinutes}
                                    onChange={(patch) => setForm(f => ({ ...f, ...patch }))}
                                />
                            </div>
                        </div>
                    </div>

                    <footer className="st-foot">
                        <p className="st-note">
                            <FontAwesomeIcon icon={faCircleInfo} />
                            {/* One span, not loose text: .st-note is a flex row, so every bare
                                text node and every <strong> would become its own flex item and
                                the sentence would break into columns. */}
                            <span>
                                Your reporting manager, team lead and HR can approve this. It shows on
                                your board as <strong>Awaiting approval</strong> until one of them does.
                            </span>
                        </p>
                        <div className="st-foot-actions">
                            <button type="button" className="gts-btn secondary" onClick={onClose} disabled={saving}>
                                Cancel
                            </button>
                            <button type="submit" className="gts-btn primary" disabled={saving}>
                                {saving
                                    ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</>
                                    : <><FontAwesomeIcon icon={faPaperPlane} /> {isResubmit ? 'Resubmit' : 'Send for approval'}</>}
                            </button>
                        </div>
                    </footer>
                </form>
            </div>
        </div>
    );
};

export default SelfTaskForm;
