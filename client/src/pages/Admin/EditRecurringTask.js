import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowLeft, faSave, faPaperclip, faInfoCircle, faUsers, faSpinner,
    faRepeat, faFilm, faFolderOpen, faBuilding, faCalendarDay, faLock, faFileCode
} from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression';
import ScreenRecorder from '../../components/ScreenRecorder';
import EmployeeMultiSelect from '../../components/EmployeeMultiSelect';
import DatePickerField from '../../components/DatePickerField';
import TaskTimeWindow from '../../components/TaskTimeWindow';
import AttachmentRequirement from '../../components/AttachmentRequirement';
import ScheduleProjection from '../../components/ScheduleProjection';
import { resolveMediaUrl } from '../../utils/taskHelpers';
import { prettyDate, todayYmd } from '../../utils/scheduleDates';
import '../../styles/App.css';
import '../../styles/tasks.css';
import '../../styles/recurring.css';

const MAX_VIDEO_MB = 300;

/**
 * Editing a recurring schedule, laid out exactly like Add Task.
 *
 * The one thing this form has to be honest about is that the schedule may
 * already be running: days that have gone out cannot be unpicked, and the
 * calendar shows them as locked rather than silently re-adding them on save.
 */
const EditRecurringTask = () => {
    const navigate = useNavigate();
    const { id } = useParams();

    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isCompressing, setIsCompressing] = useState(false);

    const [projectsList, setProjectsList] = useState([]);
    const [employeesList, setEmployeesList] = useState([]);

    const [formData, setFormData] = useState({
        title: '', description: '', taskType: 'Project Task', projectId: '', priority: 'Medium',
        startTime: '', dueTime: '', timeAllottedMinutes: '', requiresAttachment: false
    });

    const [selectedAssignees, setSelectedAssignees] = useState([]);
    const [existingAssignees, setExistingAssignees] = useState([]);
    const [existingAttachments, setExistingAttachments] = useState([]);
    const [newFiles, setNewFiles] = useState([]);

    const [plannedDates, setPlannedDates] = useState([]);
    // Days that already produced a task or a logged skip. The server keeps them
    // whatever the form sends, so the form must not pretend otherwise.
    const [lockedDates, setLockedDates] = useState([]);

    const [visibleRange, setVisibleRange] = useState(null);
    const [annotations, setAnnotations] = useState({});
    const [projection, setProjection] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const [schedRes, projRes, empRes] = await Promise.all([
                    api.get(`/tasks/recurring/${id}`),
                    api.get('/tasks/assignable-projects'),
                    api.get('/tasks/assignable-employees')
                ]);

                const s = schedRes.data.schedule;
                setFormData({
                    title: s.title || '',
                    description: s.description || '',
                    taskType: s.taskType || 'Project Task',
                    projectId: s.projectId?._id || '',
                    priority: s.priority || 'Medium',
                    startTime: s.startTime || '',
                    dueTime: s.dueTime || '',
                    timeAllottedMinutes: s.timeAllottedMinutes || '',
                    requiresAttachment: Boolean(s.requiresAttachment)
                });
                setSelectedAssignees(s.assignees.map(a => a._id));
                setExistingAssignees(s.assignees);
                setExistingAttachments(s.attachments || []);
                setPlannedDates([...(s.plannedDates || [])].sort());
                setLockedDates([...new Set((s.occurrences || []).map(o => o.date))].sort());

                setProjectsList(projRes.data || []);
                setEmployeesList(empRes.data || []);
            } catch (err) {
                console.error('Could not load schedule', err);
                Swal.fire('Error', err.response?.data?.message || 'Could not load this schedule.', 'error');
                navigate('/tasks?view=recurring');
            } finally {
                setFetching(false);
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        if (!visibleRange) return;

        const timer = setTimeout(async () => {
            setPreviewLoading(plannedDates.length > 0 && selectedAssignees.length > 0);
            try {
                const res = await api.post('/tasks/recurring/preview', {
                    from: visibleRange.from,
                    to: visibleRange.to,
                    assigneeIds: selectedAssignees,
                    // The projection endpoint rejects past dates, so it only ever
                    // sees the part of the plan that is still ahead.
                    ...(plannedDates.length && selectedAssignees.length
                        ? { dates: plannedDates.filter(d => d >= todayYmd()) }
                        : {})
                });
                setAnnotations(res.data.annotations || {});
                setProjection(res.data.projection || null);
            } catch (err) {
                setProjection(null);
            } finally {
                setPreviewLoading(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [visibleRange, plannedDates, selectedAssignees]);

    const handleVisibleRange = useCallback((from, to) => {
        setVisibleRange(prev => (prev?.from === from && prev?.to === to ? prev : { from, to }));
    }, []);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    // A locked day cannot be removed, so put it straight back if it is dropped.
    const handleDates = (dates) => {
        const merged = [...new Set([...dates, ...lockedDates])].sort();
        setPlannedDates(merged);
    };

    const dateFieldLabel = () => {
        if (plannedDates.length === 0) return 'Pick the days this runs on';
        return `${prettyDate(plannedDates[0])} → ${prettyDate(plannedDates[plannedDates.length - 1])}`;
    };

    const projectionHeadline = () => {
        if (!projection) return null;
        const skipped = projection.perUser.reduce(
            (max, u) => Math.max(max, u.timeline.filter(t => !t.willRun && t.date).length), 0);
        const bits = [`${projection.targetCount} remaining`];
        if (skipped > 0) bits.push(`${skipped} skipped, rolled forward`);
        if (projection.summary?.endsOn) bits.push(`ends ${prettyDate(projection.summary.endsOn)}`);
        return bits.join(' · ');
    };

    const handleFileChange = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        const processed = [];
        setIsCompressing(true);

        for (let file of selectedFiles) {
            const isImage = file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|heic|heif|webp)$/i);
            const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov|avi|mkv)$/i);
            const isDocument = file.type === 'text/html' || file.name.match(/\.(html|htm)$/i);

            if (isImage) {
                try {
                    const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: false, fileType: 'image/jpeg' };
                    const compressedBlob = await imageCompression(file, options);
                    const safeName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                    processed.push(new File([compressedBlob], safeName, { type: 'image/jpeg', lastModified: Date.now() }));
                } catch (error) {
                    processed.push(file);
                }
            } else if (isVideo) {
                if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
                    Swal.fire('Video Too Large', `"${file.name}" is over ${MAX_VIDEO_MB}MB.`, 'warning');
                } else {
                    processed.push(file);
                }
            } else if (isDocument) {
                processed.push(file);
            } else {
                Swal.fire('Unsupported File', `"${file.name}" is not an image, video, or HTML document.`, 'warning');
            }
        }

        setNewFiles(prev => [...prev, ...processed]);
        setIsCompressing(false);
        e.target.value = '';
    };

    const handleScreenRecordingAttach = (file) => setNewFiles(prev => [...prev, file]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.taskType === 'Project Task' && !formData.projectId) {
            return Swal.fire('Pick a Project', 'Choose a project, or switch this to a Regular Office task.', 'warning');
        }
        if (selectedAssignees.length === 0) {
            return Swal.fire('No Assignees', 'A schedule needs at least one assignee.', 'warning');
        }
        if (plannedDates.length === 0) {
            return Swal.fire('Pick Some Days', 'Choose at least one day for this task to run.', 'warning');
        }
        if (formData.startTime && formData.dueTime && formData.dueTime <= formData.startTime) {
            return Swal.fire('Check Times', 'The due/end time must be after the start time.', 'warning');
        }

        setLoading(true);
        setUploadProgress(0);

        try {
            const data = new FormData();
            Object.keys(formData).forEach(key => data.append(key, formData[key]));
            data.append('assigneeIds', JSON.stringify(selectedAssignees));
            data.append('plannedDates', JSON.stringify(plannedDates));
            data.append('keepAttachmentIds', JSON.stringify(existingAttachments.map(a => a._id)));
            newFiles.forEach(f => data.append('attachments', f));

            await api.put(`/tasks/recurring/${id}`, data, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (evt) => {
                    if (evt.total) setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
                }
            });

            await Swal.fire({
                icon: 'success', title: 'Schedule Updated',
                text: 'The brief updates for every day, past and future.',
                timer: 2000, showConfirmButton: false
            });
            navigate(`/tasks/recurring/${id}`);
        } catch (err) {
            console.error('Schedule update error:', err);
            Swal.fire('Update Failed', err.response?.data?.message || 'Could not update the schedule.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const pickerOptions = [...employeesList];
    existingAssignees.forEach(ex => {
        if (ex && !pickerOptions.find(e => e._id === ex._id)) pickerOptions.push(ex);
    });

    if (fetching) {
        return (
            <div className="attendance-container fade-in" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                <FontAwesomeIcon icon={faSpinner} spin /> Loading schedule...
            </div>
        );
    }

    const futureCount = plannedDates.filter(d => d >= todayYmd()).length;

    return (
        <div className="attendance-container fade-in">
            <div className="task-page-header">
                <button className="gts-btn secondary" onClick={() => navigate(`/tasks/recurring/${id}`)}>
                    <FontAwesomeIcon icon={faArrowLeft} /> Back
                </button>
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faRepeat} style={{ marginRight: '10px', color: '#215D7B' }} />
                    Edit Daily Task
                </h1>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="task-form-grid">

                    {/* ---------- LEFT: what the task is ---------- */}
                    <section className="task-form-card">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faInfoCircle} /> Task Details
                        </div>

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
                        </div>

                        <div className="form-group task-field">
                            <label className="input-label">Task Title *</label>
                            <input
                                type="text" name="title" className="custom-input"
                                value={formData.title} onChange={handleChange} required
                            />
                        </div>

                        <div className="form-group task-field field-grow">
                            <label className="input-label">Description</label>
                            <textarea
                                name="description" className="custom-input" rows="8"
                                value={formData.description} onChange={handleChange}
                            />
                        </div>

                        {formData.taskType === 'Project Task' && (
                            <div className="form-group task-field">
                                <label className="input-label">Project *</label>
                                <select
                                    name="projectId" className="swal2-select custom-select"
                                    value={formData.projectId} onChange={handleChange} required
                                >
                                    <option value="">Select a project</option>
                                    {projectsList.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                                </select>
                            </div>
                        )}
                    </section>

                    {/* ---------- RIGHT ---------- */}
                    <div className="task-form-col">
                        <section className="task-form-card">
                            <div className="expense-section-title">
                                <FontAwesomeIcon icon={faCalendarDay} /> Priority &amp; Schedule
                            </div>

                            <div className="task-field-row cols-2">
                                <div className="form-group task-field">
                                    <label className="input-label">Priority</label>
                                    <select
                                        name="priority" className="swal2-select custom-select"
                                        value={formData.priority} onChange={handleChange}
                                    >
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                        <option value="Urgent">Urgent</option>
                                    </select>
                                </div>

                                <div className="form-group task-field">
                                    <label className="input-label">Which days? *</label>
                                    <DatePickerField
                                        displayValue={dateFieldLabel()}
                                        isEmpty={plannedDates.length === 0}
                                        countBadge={plannedDates.length > 0 ? `${plannedDates.length} days` : null}
                                        mode="multi"
                                        selected={plannedDates}
                                        onChange={handleDates}
                                        annotations={annotations}
                                        onVisibleRangeChange={handleVisibleRange}
                                        minDate="2000-01-01"
                                    />
                                    {projectionHeadline() && (
                                        <small className="task-hint">{projectionHeadline()}</small>
                                    )}
                                </div>
                            </div>

                            {lockedDates.length > 0 && (
                                <p className="task-hint" style={{ marginTop: '4px' }}>
                                    <FontAwesomeIcon icon={faLock} style={{ marginRight: '6px' }} />
                                    {lockedDates.length} day{lockedDates.length === 1 ? '' : 's'} already went out and
                                    stay on the plan. {futureCount} still ahead.
                                </p>
                            )}

                            {/* Only days generated after this save pick up a change here —
                                days already sent out keep whatever they were given. */}
                            <div className="form-group task-field">
                                <TaskTimeWindow
                                    startTime={formData.startTime}
                                    dueTime={formData.dueTime}
                                    timeAllottedMinutes={formData.timeAllottedMinutes}
                                    onChange={(patch) => setFormData(prev => ({ ...prev, ...patch }))}
                                    fallbackLabel="that day ends"
                                />
                            </div>

                            <div className="form-group task-field">
                                <AttachmentRequirement
                                    value={formData.requiresAttachment}
                                    onChange={(v) => setFormData(prev => ({ ...prev, requiresAttachment: v }))}
                                    noun="each day of this task"
                                />
                            </div>

                            {plannedDates.length > 0 && (
                                <ScheduleProjection
                                    projection={projection}
                                    loading={previewLoading}
                                    selectedCount={futureCount}
                                />
                            )}
                        </section>

                        <section className="task-form-card">
                            <div className="expense-section-title">
                                <FontAwesomeIcon icon={faUsers} /> Assigned To
                                {selectedAssignees.length > 0 && (
                                    <span className="task-count-pill">{selectedAssignees.length} selected</span>
                                )}
                            </div>

                            <EmployeeMultiSelect
                                employees={pickerOptions}
                                selected={selectedAssignees}
                                onChange={setSelectedAssignees}
                                emptyText="No employees are mapped to you as their Team Lead yet."
                            />

                            <small className="task-hint">
                                Someone added starts their own run from the next scheduled day. Someone
                                removed stops getting new days, but keeps the tasks already sent to them.
                            </small>
                        </section>

                        <section className="task-form-card">
                            <div className="expense-section-title">
                                <FontAwesomeIcon icon={faPaperclip} /> Brief Images, Videos &amp; Documents
                            </div>

                            <small className="task-hint" style={{ marginBottom: '10px', display: 'block' }}>
                                Shared by every day of this run — changing it changes all of them.
                            </small>

                            {existingAttachments.length > 0 && (
                                <div className="task-media-grid" style={{ marginBottom: '14px' }}>
                                    {existingAttachments.map(m => (
                                        <div key={m._id} className="task-media-item">
                                            {m.type === 'video' ? (
                                                <video src={resolveMediaUrl(m.url)} controls preload="metadata" />
                                            ) : m.type === 'document' ? (
                                                <a
                                                    className="task-media-doc"
                                                    href={resolveMediaUrl(m.url)} target="_blank" rel="noopener noreferrer"
                                                    title={m.fileName || 'Open document'}
                                                >
                                                    <FontAwesomeIcon icon={faFileCode} />
                                                    <span>{m.fileName || 'Document'}</span>
                                                </a>
                                            ) : (
                                                <img src={resolveMediaUrl(m.url)} alt={m.fileName || 'attachment'} />
                                            )}
                                            <button
                                                type="button" className="task-media-remove" title="Remove"
                                                onClick={() => setExistingAttachments(prev => prev.filter(a => a._id !== m._id))}
                                            >✕</button>
                                            {m.status === 'processing_compression' && (
                                                <span className="media-processing-chip">
                                                    <FontAwesomeIcon icon={faFilm} /> Optimising
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <ScreenRecorder onAttach={handleScreenRecordingAttach} />

                            <div className="task-file-drop">
                                <input
                                    className="custom-file-input" type="file" multiple
                                    accept="image/*,video/*,.html,.htm,text/html" onChange={handleFileChange}
                                />
                            </div>

                            {isCompressing && (
                                <p className="file-success-text" style={{ color: '#d97706', marginTop: '8px', fontWeight: '600' }}>
                                    <FontAwesomeIcon icon={faSpinner} spin /> Preparing files...
                                </p>
                            )}

                            {newFiles.length > 0 && (
                                <div className="file-chips-list task-file-chips">
                                    {newFiles.map((f, i) => (
                                        <div key={i} className="file-chip">
                                            <span className="file-chip-name">
                                                {f.name} <em>({(f.size / 1048576).toFixed(1)}MB)</em>
                                            </span>
                                            <button
                                                type="button" className="file-chip-remove"
                                                onClick={() => setNewFiles(prev => prev.filter((_, idx) => idx !== i))}
                                            >✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </div>

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
                            {selectedAssignees.length} assignee{selectedAssignees.length === 1 ? '' : 's'}
                            {` · ${plannedDates.length} day${plannedDates.length === 1 ? '' : 's'}`}
                            {existingAttachments.length + newFiles.length > 0 &&
                                ` · ${existingAttachments.length + newFiles.length} attachment${existingAttachments.length + newFiles.length > 1 ? 's' : ''}`}
                        </span>
                        <button type="submit" className="gts-btn primary" disabled={loading || isCompressing}>
                            {loading
                                ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</>
                                : <><FontAwesomeIcon icon={faSave} /> Save Changes</>}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default EditRecurringTask;
