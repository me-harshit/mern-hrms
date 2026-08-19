import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowLeft, faSave, faPaperclip, faInfoCircle, faUsers, faSpinner,
    faClipboardList, faFilm, faSearch, faFolderOpen, faBuilding
} from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression';
import { resolveMediaUrl } from '../../utils/taskHelpers';
import '../../styles/App.css';
import '../../styles/tasks.css';

const MAX_VIDEO_MB = 300;

const EditTask = () => {
    const navigate = useNavigate();
    const { id } = useParams();

    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isCompressing, setIsCompressing] = useState(false);

    const [projectsList, setProjectsList] = useState([]);
    const [employeesList, setEmployeesList] = useState([]);
    const [employeeSearch, setEmployeeSearch] = useState('');

    const [formData, setFormData] = useState({
        title: '', description: '', taskType: 'Project Task', projectId: '', priority: 'Medium', startDate: '', dueDate: ''
    });

    const [selectedAssignees, setSelectedAssignees] = useState([]);
    // Assignees already on the task, so we can show people who have since moved
    // out of the manager's team rather than silently dropping them.
    const [existingAssignees, setExistingAssignees] = useState([]);
    const [existingAttachments, setExistingAttachments] = useState([]);
    const [newFiles, setNewFiles] = useState([]);

    useEffect(() => {
        const load = async () => {
            try {
                const [taskRes, projRes, empRes] = await Promise.all([
                    api.get(`/tasks/${id}`),
                    api.get('/tasks/assignable-projects'),
                    api.get('/tasks/assignable-employees')
                ]);

                const task = taskRes.data;
                setFormData({
                    title: task.title || '',
                    description: task.description || '',
                    taskType: task.taskType || 'Project Task',
                    projectId: task.projectId?._id || '',
                    priority: task.priority || 'Medium',
                    startDate: task.startDate ? new Date(task.startDate).toISOString().split('T')[0] : '',
                    dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''
                });
                setSelectedAssignees(task.assignees.map(a => a._id));
                setExistingAssignees(task.assignees);
                setExistingAttachments(task.attachments || []);

                setProjectsList(projRes.data || []);
                setEmployeesList(empRes.data || []);
            } catch (err) {
                console.error('Could not load task', err);
                Swal.fire('Error', err.response?.data?.message || 'Could not load this task.', 'error');
                navigate('/tasks');
            } finally {
                setFetching(false);
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const toggleAssignee = (userId) => {
        setSelectedAssignees(prev =>
            prev.includes(userId) ? prev.filter(a => a !== userId) : [...prev, userId]
        );
    };

    const handleFileChange = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        const processed = [];
        setIsCompressing(true);

        for (let file of selectedFiles) {
            const isImage = file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|heic|heif|webp)$/i);
            const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov|avi|mkv)$/i);

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
            } else {
                Swal.fire('Unsupported File', `"${file.name}" is not an image or video.`, 'warning');
            }
        }

        setNewFiles(prev => [...prev, ...processed]);
        setIsCompressing(false);
        e.target.value = '';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.taskType === 'Project Task' && !formData.projectId) {
            return Swal.fire('Pick a Project', 'Choose a project, or switch this to a Regular Office task.', 'warning');
        }
        if (selectedAssignees.length === 0) {
            return Swal.fire('No Assignees', 'A task must have at least one assignee.', 'warning');
        }
        if (formData.startDate && formData.dueDate && new Date(formData.dueDate) < new Date(formData.startDate)) {
            return Swal.fire('Check Dates', 'The due date cannot be before the start date.', 'warning');
        }

        setLoading(true);
        setUploadProgress(0);

        try {
            const data = new FormData();
            Object.keys(formData).forEach(key => data.append(key, formData[key]));
            data.append('assigneeIds', JSON.stringify(selectedAssignees));
            data.append('keepAttachmentIds', JSON.stringify(existingAttachments.map(a => a._id)));
            newFiles.forEach(f => data.append('attachments', f));

            await api.put(`/tasks/${id}`, data, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (evt) => {
                    if (evt.total) setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
                }
            });

            await Swal.fire({
                icon: 'success', title: 'Task Updated',
                timer: 1600, showConfirmButton: false
            });
            navigate('/tasks');
        } catch (err) {
            console.error('Task update error:', err);
            Swal.fire('Update Failed', err.response?.data?.message || 'Could not update the task.', 'error');
        } finally {
            setLoading(false);
        }
    };

    // People currently on the task always stay visible in the picker, even if
    // they are no longer inside this manager's team scope.
    const pickerOptions = [...employeesList];
    existingAssignees.forEach(ex => {
        if (ex && !pickerOptions.find(e => e._id === ex._id)) pickerOptions.push(ex);
    });

    const filteredEmployees = pickerOptions.filter(emp =>
        emp.name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
        (emp.employeeId || '').toLowerCase().includes(employeeSearch.toLowerCase())
    );

    if (fetching) {
        return (
            <div className="attendance-container fade-in" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                <FontAwesomeIcon icon={faSpinner} spin /> Loading task...
            </div>
        );
    }

    return (
        <div className="attendance-container fade-in">
            <div className="task-page-header">
                <button className="gts-btn secondary" onClick={() => navigate('/tasks')}>
                    <FontAwesomeIcon icon={faArrowLeft} /> Back
                </button>
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faClipboardList} style={{ marginRight: '10px', color: '#215D7B' }} />
                    Edit Task
                </h1>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="control-card">
                    <div className="expense-section-title">
                        <FontAwesomeIcon icon={faInfoCircle} /> Task Details
                    </div>

                    <div className="expense-grid">
                        <div className="form-group grid-span-2">
                            <label className="input-label">Task Title *</label>
                            <input type="text" name="title" className="custom-input" value={formData.title} onChange={handleChange} required />
                        </div>

                        <div className="form-group grid-span-2">
                            <label className="input-label">Description</label>
                            <textarea name="description" className="custom-input" rows="4" value={formData.description} onChange={handleChange} />
                        </div>

                        <div className="form-group grid-span-2">
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

                        {formData.taskType === 'Project Task' && (
                            <div className="form-group">
                                <label className="input-label">Project *</label>
                                <select name="projectId" className="swal2-select custom-select" value={formData.projectId} onChange={handleChange} required>
                                    <option value="">Select a project</option>
                                    {projectsList.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                                </select>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="input-label">Priority</label>
                            <select name="priority" className="swal2-select custom-select" value={formData.priority} onChange={handleChange}>
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                                <option value="Urgent">Urgent</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="input-label">Start Date</label>
                            <input type="date" name="startDate" className="custom-input" value={formData.startDate} onChange={handleChange} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Due Date *</label>
                            <input type="date" name="dueDate" className="custom-input" value={formData.dueDate} onChange={handleChange} required />
                        </div>
                    </div>
                </div>

                <div className="control-card">
                    <div className="expense-section-title">
                        <FontAwesomeIcon icon={faUsers} /> Assigned To
                        {selectedAssignees.length > 0 && (
                            <span className="task-count-pill">{selectedAssignees.length} selected</span>
                        )}
                    </div>

                    <p className="task-hint" style={{ marginBottom: '12px' }}>
                        Removing someone deletes their progress on this task. People you add are notified immediately.
                    </p>

                    <div className="task-search-wrap">
                        <FontAwesomeIcon icon={faSearch} className="task-search-icon" />
                        <input
                            type="text" className="custom-input" placeholder="Search your team..."
                            value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)}
                        />
                    </div>

                    <div className="assignee-picker">
                        {filteredEmployees.map(emp => (
                            <label
                                key={emp._id}
                                className={`assignee-option ${selectedAssignees.includes(emp._id) ? 'selected' : ''}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedAssignees.includes(emp._id)}
                                    onChange={() => toggleAssignee(emp._id)}
                                />
                                <div className="assignee-avatar">
                                    {emp.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                </div>
                                <div className="assignee-meta">
                                    <span className="assignee-name">{emp.name}</span>
                                    <span className="assignee-role">{emp.employeeId || emp.role}</span>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="control-card">
                    <div className="expense-section-title">
                        <FontAwesomeIcon icon={faPaperclip} /> Reference Images & Videos
                    </div>

                    {existingAttachments.length > 0 && (
                        <>
                            <label className="input-label">Current attachments</label>
                            <div className="task-media-grid" style={{ marginBottom: '18px' }}>
                                {existingAttachments.map(m => (
                                    <div key={m._id} className="task-media-item">
                                        {m.type === 'video' ? (
                                            <video src={resolveMediaUrl(m.url)} controls preload="metadata" />
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
                        </>
                    )}

                    <div className="form-group expense-file-area">
                        <label className="input-label">Add more</label>
                        <input className="custom-file-input" type="file" multiple accept="image/*,video/*" onChange={handleFileChange} />

                        <div className="task-upload-note">
                            <FontAwesomeIcon icon={faFilm} />
                            <span>
                                Videos up to {MAX_VIDEO_MB}MB upload as-is and are watchable immediately.
                                They're compressed and moved to permanent storage automatically at midnight.
                            </span>
                        </div>

                        {isCompressing && (
                            <p className="file-success-text" style={{ color: '#d97706', marginTop: '5px', fontWeight: '600' }}>
                                <FontAwesomeIcon icon={faSpinner} spin /> Preparing files...
                            </p>
                        )}

                        {newFiles.length > 0 && (
                            <div className="file-chips-list">
                                {newFiles.map((f, i) => (
                                    <div key={i} className="file-chip">
                                        <span className="file-chip-name">{f.name} <em>({(f.size / 1048576).toFixed(1)}MB)</em></span>
                                        <button
                                            type="button" className="file-chip-remove"
                                            onClick={() => setNewFiles(prev => prev.filter((_, idx) => idx !== i))}
                                        >✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="profile-actions mt-30" style={{ flexDirection: 'column', gap: '15px' }}>
                    {loading && uploadProgress > 0 && (
                        <div className="upload-progress-container">
                            <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }}>{uploadProgress}%</div>
                        </div>
                    )}
                    <button type="submit" className="gts-btn primary" disabled={loading || isCompressing}>
                        {loading
                            ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</>
                            : <><FontAwesomeIcon icon={faSave} /> Save Changes</>}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default EditTask;
