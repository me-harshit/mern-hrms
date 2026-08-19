import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowLeft, faSave, faPaperclip, faInfoCircle, faUsers, faSpinner,
    faClipboardList, faFilm, faSearch, faFolderOpen, faBuilding
} from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression';
import '../../styles/App.css';
import '../../styles/tasks.css';

const MAX_VIDEO_MB = 300;

const AddTask = () => {
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isCompressing, setIsCompressing] = useState(false);

    const [projectsList, setProjectsList] = useState([]);
    const [employeesList, setEmployeesList] = useState([]);
    const [employeeSearch, setEmployeeSearch] = useState('');

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        taskType: 'Project Task',
        projectId: '',
        priority: 'Medium',
        startDate: new Date().toISOString().split('T')[0],
        dueDate: ''
    });

    const [selectedAssignees, setSelectedAssignees] = useState([]);
    const [files, setFiles] = useState([]);

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

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const toggleAssignee = (id) => {
        setSelectedAssignees(prev =>
            prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
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

    const removeFile = (index) => setFiles(prev => prev.filter((_, i) => i !== index));

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.taskType === 'Project Task' && !formData.projectId) {
            return Swal.fire('Pick a Project', 'Choose a project, or switch this to a Regular Office task.', 'warning');
        }
        if (selectedAssignees.length === 0) {
            return Swal.fire('No Assignees', 'Select at least one employee to assign this task to.', 'warning');
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
            files.forEach(f => data.append('attachments', f));

            await api.post('/tasks', data, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(percent);
                }
            });

            const hasVideo = files.some(f => f.type.startsWith('video/'));
            await Swal.fire({
                icon: 'success',
                title: 'Task Assigned',
                text: hasVideo
                    ? 'Your team has been notified. Videos are viewable right away and will be optimised overnight.'
                    : 'Your team has been notified.',
                timer: hasVideo ? 3500 : 1800,
                showConfirmButton: false
            });
            navigate('/tasks');
        } catch (err) {
            console.error('Task creation error:', err);
            const message = err.response?.status === 413
                ? `File too large. Videos must be under ${MAX_VIDEO_MB}MB.`
                : err.response?.data?.message || 'Failed to create the task. Please try again.';
            Swal.fire('Could Not Assign Task', message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const filteredEmployees = employeesList.filter(emp =>
        emp.name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
        (emp.employeeId || '').toLowerCase().includes(employeeSearch.toLowerCase())
    );

    return (
        <div className="attendance-container fade-in">
            <div className="task-page-header">
                <button className="gts-btn secondary" onClick={() => navigate('/tasks')}>
                    <FontAwesomeIcon icon={faArrowLeft} /> Back
                </button>
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faClipboardList} style={{ marginRight: '10px', color: '#215D7B' }} />
                    Assign New Task
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
                            <input
                                type="text" name="title" className="custom-input"
                                value={formData.title} onChange={handleChange}
                                placeholder="e.g. Shoot 20 product clips for the Spectra launch"
                                required
                            />
                        </div>

                        <div className="form-group grid-span-2">
                            <label className="input-label">Description</label>
                            <textarea
                                name="description" className="custom-input" rows="4"
                                value={formData.description} onChange={handleChange}
                                placeholder="What exactly needs to be done? Include any references or acceptance criteria."
                            />
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
                                {projectsList.length === 0 && (
                                    <small className="task-hint">No active projects found. Ask an admin to create one first.</small>
                                )}
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
                        <FontAwesomeIcon icon={faUsers} /> Assign To
                        {selectedAssignees.length > 0 && (
                            <span className="task-count-pill">{selectedAssignees.length} selected</span>
                        )}
                    </div>

                    {employeesList.length === 0 ? (
                        <p className="text-muted">No employees are mapped to you as their Team Lead yet — ask HR to set that up.</p>
                    ) : (
                        <>
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
                                {filteredEmployees.length === 0 && (
                                    <p className="text-muted" style={{ padding: '10px' }}>No one matches "{employeeSearch}".</p>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="control-card">
                    <div className="expense-section-title">
                        <FontAwesomeIcon icon={faPaperclip} /> Reference Images & Videos
                    </div>

                    <div className="form-group expense-file-area">
                        <input
                            className="custom-file-input" type="file" multiple
                            accept="image/*,video/*" onChange={handleFileChange}
                        />

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

                        {files.length > 0 && (
                            <div className="file-chips-list">
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
                    </div>
                </div>

                <div className="profile-actions mt-30" style={{ flexDirection: 'column', gap: '15px' }}>
                    {loading && uploadProgress > 0 && (
                        <div className="upload-progress-container">
                            <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }}>
                                {uploadProgress}%
                            </div>
                        </div>
                    )}
                    <button type="submit" className="gts-btn primary" disabled={loading || isCompressing}>
                        {loading
                            ? <><FontAwesomeIcon icon={faSpinner} spin /> Assigning...</>
                            : <><FontAwesomeIcon icon={faSave} /> Assign Task</>}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AddTask;
