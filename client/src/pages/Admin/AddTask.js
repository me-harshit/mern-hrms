import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowLeft, faSave, faPaperclip, faInfoCircle, faUsers, faSpinner,
    faClipboardList, faFilm, faFolderOpen, faBuilding, faCalendarDay, faRepeat
} from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression';
import ScreenRecorder from '../../components/ScreenRecorder';
import EmployeeMultiSelect from '../../components/EmployeeMultiSelect';
import DatePickerField from '../../components/DatePickerField';
import TaskTimeWindow from '../../components/TaskTimeWindow';
import ScheduleProjection from '../../components/ScheduleProjection';
import { datesBetween, prettyDate } from '../../utils/scheduleDates';
import '../../styles/App.css';
import '../../styles/tasks.css';
import '../../styles/recurring.css';

const MAX_VIDEO_MB = 300;

const AddTask = () => {
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isCompressing, setIsCompressing] = useState(false);

    const [projectsList, setProjectsList] = useState([]);
    const [employeesList, setEmployeesList] = useState([]);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        taskType: 'Project Task',
        projectId: '',
        priority: 'Medium',
        startDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        startTime: '',
        dueTime: '',
        timeAllottedMinutes: ''
    });

    const [selectedAssignees, setSelectedAssignees] = useState([]);
    const [files, setFiles] = useState([]);

    // --- recurring schedule (TaskPlan.md §13) ---
    // Off by default: a one-off task is still the common case, and the whole
    // form below stays exactly as it was until this is switched on.
    const [isRecurring, setIsRecurring] = useState(false);
    const [plannedDates, setPlannedDates] = useState([]);
    const [visibleRange, setVisibleRange] = useState(null);
    const [annotations, setAnnotations] = useState({});
    const [projection, setProjection] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => {
        const fetchDropdowns = async () => {
            try {
                const [projRes, empRes] = await Promise.all([
                    api.get('/tasks/assignable-projects'),
                    api.get('/tasks/assignable-employees')
                ]);
                setProjectsList(projRes.data || []);
                setEmployeesList(empRes.data || []);
            } catch (err) {
                console.error('Could not fetch task dropdowns', err);
                Swal.fire('Error', 'Could not load projects or your team list.', 'error');
            }
        };
        fetchDropdowns();
    }, []);

    /**
     * Ask the server what this selection would actually do.
     *
     * One call covers both jobs: annotations for the months on screen (holidays
     * and per-person leave, so the calendar can grey and stripe them) and, once
     * days are picked, the projection that drives the footer.
     *
     * Debounced because it re-runs on every day clicked and every assignee
     * added, and dragging a range fires a burst of those.
     */
    useEffect(() => {
        if (!isRecurring || !visibleRange) return;

        const timer = setTimeout(async () => {
            setPreviewLoading(plannedDates.length > 0 && selectedAssignees.length > 0);
            try {
                const res = await api.post('/tasks/recurring/preview', {
                    from: visibleRange.from,
                    to: visibleRange.to,
                    assigneeIds: selectedAssignees,
                    // Omitted entirely until both are present — the endpoint
                    // rejects a projection with no one to project for.
                    ...(plannedDates.length && selectedAssignees.length ? { dates: plannedDates } : {})
                });
                setAnnotations(res.data.annotations || {});
                setProjection(res.data.projection || null);
            } catch (err) {
                console.error('Could not preview the schedule', err);
                setProjection(null);
            } finally {
                setPreviewLoading(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [isRecurring, visibleRange, plannedDates, selectedAssignees]);

    // Stable identity so the calendar's effect doesn't refire every render.
    const handleVisibleRange = useCallback((from, to) => {
        setVisibleRange(prev => (prev?.from === from && prev?.to === to ? prev : { from, to }));
    }, []);

    // A one-off task's start..due is just a contiguous range, so it drives the
    // same picker the recurring day set uses — one calendar, two modes.
    const oneOffDates = formData.dueDate
        ? datesBetween(formData.startDate || formData.dueDate, formData.dueDate)
        : (formData.startDate ? [formData.startDate] : []);

    const handleOneOffDates = (dates) => {
        setFormData(prev => ({
            ...prev,
            startDate: dates[0] || '',
            dueDate: dates.length ? dates[dates.length - 1] : ''
        }));
    };

    const dateFieldLabel = () => {
        if (isRecurring) {
            if (plannedDates.length === 0) return 'Pick the days this runs on';
            return `${prettyDate(plannedDates[0])} → ${prettyDate(plannedDates[plannedDates.length - 1])}`;
        }
        if (!formData.dueDate) return 'Pick the start and due date';
        if (formData.startDate === formData.dueDate) return prettyDate(formData.dueDate);
        return `${prettyDate(formData.startDate)} → ${prettyDate(formData.dueDate)}`;
    };

    // One line under the field, so the skip detail is visible without
    // reopening the popup. The full breakdown lives inside it.
    const projectionHeadline = () => {
        if (!isRecurring || !projection) return null;
        const skipped = projection.perUser.reduce(
            (max, u) => Math.max(max, u.timeline.filter(t => !t.willRun && t.date).length), 0);
        const bits = [`${projection.targetCount} task${projection.targetCount === 1 ? '' : 's'} each`];
        if (skipped > 0) bits.push(`${skipped} day${skipped === 1 ? '' : 's'} skipped, rolled forward`);
        if (projection.summary?.endsOn) bits.push(`ends ${prettyDate(projection.summary.endsOn)}`);
        return bits.join(' · ');
    };

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleFileChange = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        const processed = [];

        setIsCompressing(true);

        for (let file of selectedFiles) {
            const isImage = file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|heic|heif|webp)$/i);
            const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov|avi|mkv)$/i);

            if (isImage) {
                // Images are shrunk here in the browser — they go straight to S3
                // on the server, so there's no overnight step to lean on.
                try {
                    const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: false, fileType: 'image/jpeg' };
                    const compressedBlob = await imageCompression(file, options);
                    const safeName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                    processed.push(new File([compressedBlob], safeName, { type: 'image/jpeg', lastModified: Date.now() }));
                } catch (error) {
                    console.error('Error compressing image:', error);
                    processed.push(file);
                }
            } else if (isVideo) {
                // Videos upload raw and get compressed server-side overnight.
                if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
                    Swal.fire('Video Too Large', `"${file.name}" is over ${MAX_VIDEO_MB}MB and can't be uploaded.`, 'warning');
                } else {
                    processed.push(file);
                }
            } else {
                Swal.fire('Unsupported File', `"${file.name}" is not an image or video.`, 'warning');
            }
        }

        setFiles(prev => [...prev, ...processed]);
        setIsCompressing(false);
        e.target.value = ''; // let the same file be picked again after removal
    };

    const handleScreenRecordingAttach = (file) => {
        setFiles(prev => [...prev, file]);
    };

    const removeFile = (index) => setFiles(prev => prev.filter((_, i) => i !== index));

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.taskType === 'Project Task' && !formData.projectId) {
            return Swal.fire('Pick a Project', 'Choose a project, or switch this to a Regular Office task.', 'warning');
        }
        if (selectedAssignees.length === 0) {
            return Swal.fire('No Assignees', 'Select at least one employee to assign this task to.', 'warning');
        }
        if (isRecurring && plannedDates.length === 0) {
            return Swal.fire('Pick Some Days', 'Choose at least one day on the calendar for this task to run.', 'warning');
        }
        // The date field is a button now, so the browser can't enforce this.
        if (!isRecurring && !formData.dueDate) {
            return Swal.fire('Pick a Due Date', 'Choose when this task is due.', 'warning');
        }
        if (!isRecurring && formData.startDate && formData.dueDate && new Date(formData.dueDate) < new Date(formData.startDate)) {
            return Swal.fire('Check Dates', 'The due date cannot be before the start date.', 'warning');
        }
        if (!isRecurring && formData.startTime && formData.dueTime && formData.dueTime <= formData.startTime) {
            return Swal.fire('Check Times', 'The due/end time must be after the start time.', 'warning');
        }

        setLoading(true);
        setUploadProgress(0);

        try {
            const data = new FormData();
            files.forEach(f => data.append('attachments', f));
            data.append('assigneeIds', JSON.stringify(selectedAssignees));

            if (isRecurring) {
                // A schedule has no single due date — each generated task gets
                // its own, on the day it lands.
                ['title', 'description', 'taskType', 'projectId', 'priority']
                    .forEach(key => data.append(key, formData[key]));
                data.append('plannedDates', JSON.stringify(plannedDates));
            } else {
                Object.keys(formData).forEach(key => data.append(key, formData[key]));
            }

            const res = await api.post(isRecurring ? '/tasks/recurring' : '/tasks', data, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(percent);
                }
            });

            const hasVideo = files.some(f => f.type.startsWith('video/'));
            const videoNote = hasVideo
                ? ' Videos are viewable right away and will be optimised overnight.'
                : '';

            if (isRecurring) {
                const startedToday = res.data?.generatedToday > 0;
                await Swal.fire({
                    icon: 'success',
                    title: 'Daily Task Scheduled',
                    text: `${plannedDates.length} day${plannedDates.length === 1 ? '' : 's'} scheduled for `
                        + `${selectedAssignees.length} ${selectedAssignees.length === 1 ? 'person' : 'people'}. `
                        + (startedToday
                            ? "Today's task has already gone out."
                            : 'The first one goes out at 6am on the first scheduled day.')
                        + videoNote,
                    timer: hasVideo ? 4500 : 3200,
                    showConfirmButton: false
                });
                navigate('/tasks?view=recurring');
            } else {
                await Swal.fire({
                    icon: 'success',
                    title: 'Task Assigned',
                    text: 'Your team has been notified.' + videoNote,
                    timer: hasVideo ? 3500 : 1800,
                    showConfirmButton: false
                });
                navigate('/tasks');
            }
        } catch (err) {
            console.error('Task creation error:', err);
            const message = err.response?.status === 413
                ? `File too large. Videos must be under ${MAX_VIDEO_MB}MB.`
                : err.response?.data?.message || 'Failed to create the task. Please try again.';
            Swal.fire(isRecurring ? 'Could Not Schedule Task' : 'Could Not Assign Task', message, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="attendance-container fade-in">
            <div className="task-page-header">
                <button className="gts-btn secondary" onClick={() => navigate('/tasks')}>
                    <FontAwesomeIcon icon={faArrowLeft} /> Back
                </button>
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faClipboardList} style={{ marginRight: '10px', color: '#215D7B' }} />
                    {isRecurring ? 'Schedule a Daily Task' : 'Assign New Task'}
                </h1>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="task-form-grid">

                    {/* ---------- LEFT: what the task is ---------- */}
                    <section className="task-form-card">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faInfoCircle} /> Task Details
                        </div>

                        {/* Type comes first — it decides whether a project is even asked for. */}
                        <div className="form-group task-field">
                            <label className="input-label">Task Type</label>
                            <div className="type-toggle">
                                <button
                                    type="button"
                                    className={`type-toggle-btn ${formData.taskType === 'Project Task' ? 'active' : ''}`}
                                    onClick={() => setFormData(prev => ({ ...prev, taskType: 'Project Task' }))}
                                >
                                    <FontAwesomeIcon icon={faFolderOpen} /> Project Task
                                </button>
                                <button
                                    type="button"
                                    className={`type-toggle-btn ${formData.taskType === 'Regular Office Task' ? 'active' : ''}`}
                                    onClick={() => setFormData(prev => ({ ...prev, taskType: 'Regular Office Task', projectId: '' }))}
                                >
                                    <FontAwesomeIcon icon={faBuilding} /> Regular Office Task
                                </button>
                            </div>
                            <small className="task-hint">
                                {formData.taskType === 'Regular Office Task'
                                    ? 'Internal work not tied to any client project — no project needed.'
                                    : 'Work that belongs to a specific project.'}
                            </small>
                        </div>

                        <div className="form-group task-field">
                            <label className="input-label">Task Title *</label>
                            <input
                                type="text" name="title" className="custom-input"
                                value={formData.title} onChange={handleChange}
                                placeholder="e.g. Shoot 20 product clips for the Spectra launch"
                                required
                            />
                        </div>

                        <div className="form-group task-field field-grow">
                            <label className="input-label">Description</label>
                            <textarea
                                name="description" className="custom-input" rows="8"
                                value={formData.description} onChange={handleChange}
                                placeholder="What exactly needs to be done? Include any references or acceptance criteria."
                            />
                        </div>

                        {/* Project stays next to the toggle that decides whether it's asked for. */}
                        {formData.taskType === 'Project Task' && (
                            <div className="form-group task-field">
                                <label className="input-label">Project *</label>
                                <select name="projectId" className="swal2-select custom-select" value={formData.projectId} onChange={handleChange} required>
                                    <option value="">Select a project</option>
                                    {projectsList.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                                </select>
                                {projectsList.length === 0 && (
                                    <small className="task-hint">No active projects found. Ask an admin to create one first.</small>
                                )}
                            </div>
                        )}
                    </section>

                    {/* ---------- RIGHT: when it's due, who it goes to, what comes with it ---------- */}
                    <div className="task-form-col">
                        <section className="task-form-card">
                            <div className="expense-section-title">
                                <FontAwesomeIcon icon={faCalendarDay} /> Priority &amp; Schedule
                            </div>

                            {/* The switch that turns one task into a run of them. */}
                            <div className={`rt-switch-row ${isRecurring ? 'is-on' : ''}`}>
                                <button
                                    type="button"
                                    className={`rt-switch ${isRecurring ? 'is-on' : ''}`}
                                    onClick={() => setIsRecurring(v => !v)}
                                    aria-pressed={isRecurring}
                                    aria-label="Repeat this task daily"
                                />
                                <div className="rt-switch-text">
                                    <strong>
                                        <FontAwesomeIcon icon={faRepeat} style={{ marginRight: '6px', color: '#215D7B' }} />
                                        Repeat daily
                                    </strong>
                                    <small>
                                        {isRecurring
                                            ? 'A fresh copy goes out each morning. Sundays, holidays and approved leave are skipped, and the run rolls forward so the count still adds up.'
                                            : 'Assign the same task every day for a stretch of days — a daily post, a daily report.'}
                                    </small>
                                </div>
                            </div>

                            {/* Two columns, identical in both modes, so nothing
                                jumps around when the switch is flipped. */}
                            <div className="task-field-row cols-2">
                                <div className="form-group task-field">
                                    <label className="input-label">Priority</label>
                                    <select name="priority" className="swal2-select custom-select" value={formData.priority} onChange={handleChange}>
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                        <option value="Urgent">Urgent</option>
                                    </select>
                                </div>

                                <div className="form-group task-field">
                                    <label className="input-label">
                                        {isRecurring ? 'Which days? *' : 'Start & due date *'}
                                    </label>
                                    <DatePickerField
                                        displayValue={dateFieldLabel()}
                                        isEmpty={isRecurring ? plannedDates.length === 0 : !formData.dueDate}
                                        countBadge={isRecurring && plannedDates.length > 0
                                            ? `${plannedDates.length} days` : null}
                                        mode={isRecurring ? 'multi' : 'range'}
                                        selected={isRecurring ? plannedDates : oneOffDates}
                                        onChange={isRecurring ? setPlannedDates : handleOneOffDates}
                                        annotations={isRecurring ? annotations : {}}
                                        onVisibleRangeChange={isRecurring ? handleVisibleRange : undefined}
                                    />
                                    {isRecurring && projectionHeadline() && (
                                        <small className="task-hint">{projectionHeadline()}</small>
                                    )}
                                </div>
                            </div>

                            {!isRecurring && (
                                <div className="form-group task-field">
                                    <TaskTimeWindow
                                        startTime={formData.startTime}
                                        dueTime={formData.dueTime}
                                        timeAllottedMinutes={formData.timeAllottedMinutes}
                                        onChange={(patch) => setFormData(prev => ({ ...prev, ...patch }))}
                                    />
                                </div>
                            )}

                            {/* The full skip breakdown sits in the form, not in the
                                popover — it can run to several lines, and keeping it
                                here is what lets the popover stay small. */}
                            {isRecurring && plannedDates.length > 0 && (
                                <ScheduleProjection
                                    projection={projection}
                                    loading={previewLoading}
                                    selectedCount={plannedDates.length}
                                />
                            )}
                        </section>

                        <section className="task-form-card">
                            <div className="expense-section-title">
                                <FontAwesomeIcon icon={faUsers} /> Assign To
                                {selectedAssignees.length > 0 && (
                                    <span className="task-count-pill">{selectedAssignees.length} selected</span>
                                )}
                            </div>

                            <EmployeeMultiSelect
                                employees={employeesList}
                                selected={selectedAssignees}
                                onChange={setSelectedAssignees}
                                emptyText="No employees are mapped to you as their Team Lead yet — ask HR to set that up."
                            />

                            {employeesList.length > 0 && (
                                <small className="task-hint">
                                    Search by name or employee ID, then tick everyone who should own this task.
                                </small>
                            )}
                        </section>

                        <section className="task-form-card">
                            <div className="expense-section-title">
                                <FontAwesomeIcon icon={faPaperclip} /> Reference Images &amp; Videos
                            </div>

                            <ScreenRecorder onAttach={handleScreenRecordingAttach} />

                            <div className="task-file-drop">
                                <input
                                    className="custom-file-input" type="file" multiple
                                    accept="image/*,video/*" onChange={handleFileChange}
                                />
                            </div>

                            <div className="task-upload-note">
                                <FontAwesomeIcon icon={faFilm} />
                                <span>
                                    Videos up to {MAX_VIDEO_MB}MB upload as-is and are watchable immediately.
                                    They&apos;re compressed and moved to permanent storage automatically at midnight.
                                </span>
                            </div>

                            {isCompressing && (
                                <p className="file-success-text" style={{ color: '#d97706', marginTop: '8px', fontWeight: '600' }}>
                                    <FontAwesomeIcon icon={faSpinner} spin /> Preparing files...
                                </p>
                            )}

                            {files.length > 0 && (
                                <div className="file-chips-list task-file-chips">
                                    {files.map((f, i) => (
                                        <div key={i} className="file-chip">
                                            <span className="file-chip-name">
                                                {f.name} <em>({(f.size / 1048576).toFixed(1)}MB)</em>
                                            </span>
                                            <button type="button" className="file-chip-remove" onClick={() => removeFile(i)}>✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </div>

                {/* Sticky so the form never has to be scrolled back to reach Submit. */}
                <div className="task-form-footer">
                    {loading && uploadProgress > 0 && (
                        <div className="upload-progress-container">
                            <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }}>
                                {uploadProgress}%
                            </div>
                        </div>
                    )}
                    <div className="task-form-footer-actions">
                        <span className="task-form-summary">
                            {selectedAssignees.length > 0
                                ? `${selectedAssignees.length} assignee${selectedAssignees.length > 1 ? 's' : ''}`
                                : 'No assignees yet'}
                            {files.length > 0 && ` · ${files.length} attachment${files.length > 1 ? 's' : ''}`}
                            {isRecurring && plannedDates.length > 0 &&
                                ` · ${plannedDates.length} day${plannedDates.length > 1 ? 's' : ''} scheduled`}
                        </span>
                        <button type="submit" className="gts-btn primary" disabled={loading || isCompressing}>
                            {loading
                                ? <><FontAwesomeIcon icon={faSpinner} spin /> {isRecurring ? 'Scheduling...' : 'Assigning...'}</>
                                : isRecurring
                                    ? <><FontAwesomeIcon icon={faRepeat} /> Schedule Daily Task</>
                                    : <><FontAwesomeIcon icon={faSave} /> Assign Task</>}
                        </button>
                    </div>
                </div>
            </form>

        </div>
    );
};

export default AddTask;
