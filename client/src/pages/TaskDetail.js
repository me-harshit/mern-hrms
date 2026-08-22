import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowLeft, faSpinner, faPaperclip, faUsers, faSave, faFolderOpen,
    faCheckCircle, faCalendarAlt, faUserTie, faEdit, faPlus, faBuilding, faRepeat,
    faHourglassHalf, faCircleXmark, faUserPen, faRotateLeft
} from '@fortawesome/free-solid-svg-icons';
import api from '../utils/api';
import TaskDiscussion from '../components/TaskDiscussion';
import TaskMediaGrid from '../components/TaskMediaGrid';
import ScreenRecorder from '../components/ScreenRecorder';
import Avatar from '../components/Avatar';
import { STATUS_OPTIONS, slug, dueLabel, taskContextLabel } from '../utils/taskHelpers';
import '../styles/App.css';
import '../styles/tasks.css';
import '../styles/recurring.css';
import '../styles/selftask.css';
import SelfTaskForm from '../components/SelfTaskForm';

const MAX_VIDEO_MB = 300;

const TaskDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user'));
    const currentUserId = currentUser?.id || currentUser?._id;
    const isManagement = ['HR', 'ADMIN', 'MANAGER', 'TEAM LEAD', 'ACCOUNTS'].includes(currentUser?.role);

    const [task, setTask] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const [status, setStatus] = useState('Pending');
    const [note, setNote] = useState('');
    const [proofFiles, setProofFiles] = useState([]);
    const [saving, setSaving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [addingMedia, setAddingMedia] = useState(false);
    const [deletingMediaId, setDeletingMediaId] = useState(null);
    const [resubmitOpen, setResubmitOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await api.get(`/tasks/${id}`);
            setTask(res.data);
            setStatus(res.data.status || 'Pending');
            setNote(res.data.statusNote || '');
        } catch (err) {
            console.error('Could not load task', err);
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const handleProofChange = (e) => {
        const picked = Array.from(e.target.files).filter(f => {
            if (f.size > MAX_VIDEO_MB * 1024 * 1024) {
                Swal.fire('Too Large', `"${f.name}" is over ${MAX_VIDEO_MB}MB.`, 'warning');
                return false;
            }
            return true;
        });
        setProofFiles(prev => [...prev, ...picked]);
        e.target.value = '';
    };

    const handleProofRecordingAttach = (file) => {
        setProofFiles(prev => [...prev, file]);
    };

    // Reference media can be topped up from here rather than only on the
    // edit page — the brief often grows after the task is handed over.
    const addReferenceMedia = async (e) => {
        const files = Array.from(e.target.files);
        e.target.value = '';
        if (files.length === 0) return;

        const tooBig = files.find(f => f.size > MAX_VIDEO_MB * 1024 * 1024);
        if (tooBig) {
            return Swal.fire('Too Large', `"${tooBig.name}" is over ${MAX_VIDEO_MB}MB.`, 'warning');
        }

        setAddingMedia(true);
        try {
            const data = new FormData();
            files.forEach(f => data.append('attachments', f));
            const res = await api.post(`/tasks/${id}/media`, data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setTask(res.data);
            Swal.fire({
                icon: 'success', title: 'Media added', toast: true,
                position: 'top-end', timer: 1600, showConfirmButton: false
            });
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not add media.', 'error');
        } finally {
            setAddingMedia(false);
        }
    };

    const addReferenceScreenRecording = async (file) => {
        if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
            return Swal.fire('Too Large', `"${file.name}" is over ${MAX_VIDEO_MB}MB.`, 'warning');
        }

        setAddingMedia(true);
        try {
            const data = new FormData();
            data.append('attachments', file);
            const res = await api.post(`/tasks/${id}/media`, data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setTask(res.data);
            Swal.fire({
                icon: 'success', title: 'Media added', toast: true,
                position: 'top-end', timer: 1600, showConfirmButton: false
            });
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not add media.', 'error');
        } finally {
            setAddingMedia(false);
        }
    };

    const deleteMedia = async (item) => {
        const ok = await Swal.fire({
            title: 'Remove this file?',
            text: item.fileName || 'It will be deleted permanently.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            confirmButtonText: 'Remove'
        });
        if (!ok.isConfirmed) return;

        setDeletingMediaId(item._id);
        try {
            const res = await api.delete(`/tasks/${id}/media/${item._id}`);
            setTask(res.data);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not remove the file.', 'error');
        } finally {
            setDeletingMediaId(null);
        }
    };

    const saveStatus = async () => {
        setSaving(true);
        setUploadProgress(0);
        try {
            const data = new FormData();
            data.append('status', status);
            data.append('statusNote', note);
            proofFiles.forEach(f => data.append('completionProof', f));

            const res = await api.put(`/tasks/${id}/status`, data, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (evt) => {
                    if (evt.total) setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
                }
            });

            setTask(res.data);
            setProofFiles([]);
            Swal.fire({
                icon: 'success', title: 'Task status updated', toast: true,
                position: 'top-end', timer: 1800, showConfirmButton: false
            });
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not update the status.', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="attendance-container fade-in td-loading">
                <FontAwesomeIcon icon={faSpinner} spin /> Loading task...
            </div>
        );
    }

    if (notFound || !task) {
        return (
            <div className="attendance-container fade-in">
                <div className="tk-empty big">
                    <h3>Task not available</h3>
                    <p>It may have been removed, or you may not have access to it.</p>
                    <Link to="/my-tasks" className="gts-btn secondary">Back to My Tasks</Link>
                </div>
            </div>
        );
    }

    const isAssignee = task.assignees.some(a => a && a._id === currentUserId);
    const isOwner = task.assignedBy?._id === currentUserId;
    const canChangeStatus = isAssignee || isOwner || ['ADMIN', 'HR'].includes(currentUser?.role);
    const canEdit = isOwner || ['ADMIN', 'HR'].includes(currentUser?.role);
    const due = dueLabel(task.dueDate, task.status === 'Completed');
    const dirty = status !== task.status || note !== (task.statusNote || '') || proofFiles.length > 0;

    return (
        <div className="attendance-container fade-in td-page">
            {/* ---------- Header ---------- */}
            <header className="td-header">
                <button className="td-back" onClick={() => navigate(-1)}>
                    <FontAwesomeIcon icon={faArrowLeft} /> Back
                </button>

                <div className="td-headings">
                    <h1 className="td-title">{task.title}</h1>
                    <div className="td-badges">
                        <span className={`task-status-badge ${slug(task.status)}`}>{task.status}</span>
                        <span className={`tk-priority ${slug(task.priority)}`}>{task.priority}</span>
                        <span className={`tk-due ${due.tone}`}>{due.text}</span>
                        {task.taskType === 'Regular Office Task' && (
                            <span className="task-type-badge office">
                                <FontAwesomeIcon icon={faBuilding} /> Regular Office
                            </span>
                        )}
                        {/* Generated by a recurring schedule: say where in the run
                            this one sits, so a blank slate still has context. */}
                        {task.isSelfAssigned && task.approvalStatus === 'Pending' && (
                            <span className="ap-badge pending">
                                <FontAwesomeIcon icon={faHourglassHalf} /> Awaiting approval
                            </span>
                        )}
                        {task.isSelfAssigned && task.approvalStatus === 'Rejected' && (
                            <span className="ap-badge rejected">
                                <FontAwesomeIcon icon={faCircleXmark} /> Rejected
                            </span>
                        )}
                        {task.isSelfAssigned && task.approvalStatus === 'Approved' && (
                            <span className="ap-badge self" title="Logged by the assignee themselves">
                                <FontAwesomeIcon icon={faUserPen} /> Self Assigned
                            </span>
                        )}
                        {task.recurringTaskId && (
                            <span
                                className="rt-day-badge"
                                title={isManagement ? 'View the whole schedule' : 'Part of a daily task'}
                                style={{ cursor: isManagement ? 'pointer' : 'default' }}
                                onClick={() => isManagement && navigate(`/tasks/recurring/${task.recurringTaskId._id}`)}
                            >
                                <FontAwesomeIcon icon={faRepeat} />
                                Day {task.recurringDayNumber} of {task.recurringTaskId.targetCount}
                            </span>
                        )}
                    </div>
                </div>

                {canEdit && (
                    <button className="gts-btn secondary" onClick={() => navigate(`/edit-task/${task._id}`)}>
                        <FontAwesomeIcon icon={faEdit} /> Edit
                    </button>
                )}
            </header>

            {/* ---------- Two columns: discussion left, details right ---------- */}
            <div className="td-layout">
                <div className="td-main">
                    <TaskDiscussion taskId={task._id} currentUserId={currentUserId} />
                </div>

                <aside className="td-side">
                    {/* Why it was turned down, and the way back in. Shown only to
                        the person who has to act on it. */}
                    {task.isSelfAssigned && task.approvalStatus === 'Rejected' && isAssignee && (
                        <div className="ap-rejected-box">
                            <div className="ap-rejected-head">
                                <FontAwesomeIcon icon={faCircleXmark} />
                                Rejected{task.approvedBy?.name ? ` by ${task.approvedBy.name}` : ''}
                            </div>
                            {task.approvalNote && (
                                <p className="ap-rejected-note">“{task.approvalNote}”</p>
                            )}
                            <button className="gts-btn secondary" onClick={() => setResubmitOpen(true)}>
                                <FontAwesomeIcon icon={faRotateLeft} /> Edit and resubmit
                            </button>
                        </div>
                    )}

                    {task.isSelfAssigned && task.approvalStatus === 'Pending' && isAssignee && (
                        <div className="st-note" style={{ marginBottom: '14px', flexWrap: 'wrap' }}>
                            <FontAwesomeIcon icon={faHourglassHalf} />
                            <span>
                                Waiting on your manager to approve this. You can carry on with it
                                in the meantime.
                            </span>
                            {/* Correcting your own request before anyone rules on it
                                should not require being turned down first. */}
                            <button
                                type="button"
                                className="gts-btn secondary"
                                style={{ marginLeft: 'auto' }}
                                onClick={() => setResubmitOpen(true)}
                            >
                                <FontAwesomeIcon icon={faEdit} /> Edit
                            </button>
                        </div>
                    )}

                    {/* Status control */}
                    <section className="td-panel">
                        <header className="td-panel-head">
                            <h2>Status</h2>
                        </header>

                        {canChangeStatus ? (
                            <div className="td-panel-body">
                                <p className="td-shared-note">
                                    <FontAwesomeIcon icon={faUsers} /> Shared by all {task.assignees.length} assignee{task.assignees.length === 1 ? '' : 's'} — changing it changes it for everyone.
                                </p>

                                <div className="status-pill-row">
                                    {STATUS_OPTIONS.map(s => (
                                        <button
                                            key={s} type="button"
                                            className={`status-pill ${slug(s)} ${status === s ? 'selected' : ''}`}
                                            onClick={() => setStatus(s)}
                                            disabled={saving}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>

                                <label className="td-label">Note</label>
                                <textarea
                                    className="custom-input" rows="2" value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Anything the team should know?"
                                    disabled={saving}
                                />

                                <label className="td-label">Attach Supporting Documents/Materials</label>
                                <ScreenRecorder onAttach={handleProofRecordingAttach} />
                                <input
                                    className="custom-file-input" type="file" multiple
                                    accept="image/*,video/*" onChange={handleProofChange} disabled={saving}
                                    style={{ marginTop: '10px' }}
                                />
                                <p className="td-field-hint">
                                    Anything that backs up the work — files, screenshots, recordings.
                                    To add briefing material instead, use Reference media below.
                                </p>
                                {proofFiles.length > 0 && (
                                    <div className="file-chips-list">
                                        {proofFiles.map((f, i) => (
                                            <div key={i} className="file-chip">
                                                <span className="file-chip-name">{f.name}</span>
                                                <button type="button" className="file-chip-remove"
                                                    onClick={() => setProofFiles(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {saving && uploadProgress > 0 && (
                                    <div className="upload-progress-container" style={{ margin: '10px 0' }}>
                                        <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }}>{uploadProgress}%</div>
                                    </div>
                                )}

                                <button className="gts-btn primary td-full-btn" onClick={saveStatus} disabled={saving || !dirty}>
                                    {saving
                                        ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</>
                                        : <><FontAwesomeIcon icon={faSave} /> Update Status</>}
                                </button>

                                {task.statusUpdatedBy && (
                                    <p className="td-muted-line">
                                        Last moved by <strong>{task.statusUpdatedBy.name}</strong>
                                        {task.completedAt && ` · completed ${new Date(task.completedAt).toLocaleDateString('en-GB')}`}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="td-panel-body">
                                <p className="td-muted-line">You are not working on this task, so you cannot change its status.</p>
                                {task.statusNote && <p className="td-muted-line">“{task.statusNote}”</p>}
                            </div>
                        )}
                    </section>

                    {/* Where this task came from. Self-assigned work has two people
                        behind it — whoever the employee says asked for it, and
                        whoever signed it off — and conflating them hides who is
                        actually accountable. */}
                    {task.isSelfAssigned && (
                        <section className="td-panel">
                            <header className="td-panel-head">
                                <h2><FontAwesomeIcon icon={faUserPen} /> Self Assigned</h2>
                            </header>
                            <div className="td-panel-body">
                                <ul className="sa-prov">
                                    <li>
                                        <Avatar
                                            name={task.assignees[0]?.name}
                                            profilePic={task.assignees[0]?.profilePic}
                                            className="sa-prov-avatar"
                                        />
                                        <span className="sa-prov-name">{task.assignees[0]?.name || 'Unknown'}</span>
                                        <span className="sa-prov-role">logged this</span>
                                    </li>
                                    <li>
                                        <Avatar
                                            name={task.assignedBy?.name}
                                            profilePic={task.assignedBy?.profilePic}
                                            className="sa-prov-avatar"
                                        />
                                        <span className="sa-prov-name">{task.assignedBy?.name || 'Unknown'}</span>
                                        <span className="sa-prov-role">asked for it</span>
                                    </li>
                                    <li>
                                        {task.approvedBy ? (
                                            <>
                                                <Avatar
                                                    name={task.approvedBy.name}
                                                    profilePic={task.approvedBy.profilePic}
                                                    className="sa-prov-avatar"
                                                />
                                                <span className="sa-prov-name">{task.approvedBy.name}</span>
                                                <span className={`sa-prov-role ${task.approvalStatus === 'Rejected' ? 'is-rejected' : 'is-approved'}`}>
                                                    {task.approvalStatus === 'Rejected' ? 'rejected it' : 'approved it'}
                                                    {task.approvedAt && ` · ${new Date(task.approvedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="sa-prov-avatar is-waiting">
                                                    <FontAwesomeIcon icon={faHourglassHalf} />
                                                </span>
                                                <span className="sa-prov-name muted">Not yet decided</span>
                                                <span className="sa-prov-role">awaiting approval</span>
                                            </>
                                        )}
                                    </li>
                                </ul>
                            </div>
                        </section>
                    )}

                    {/* Details */}
                    <section className="td-panel">
                        <header className="td-panel-head"><h2>Details</h2></header>
                        <div className="td-panel-body">
                            <dl className="td-meta">
                                <div>
                                    <dt>
                                        <FontAwesomeIcon icon={task.taskType === 'Regular Office Task' ? faBuilding : faFolderOpen} />
                                        {task.taskType === 'Regular Office Task' ? 'Type' : 'Project'}
                                    </dt>
                                    <dd>{taskContextLabel(task)}</dd>
                                </div>
                                <div>
                                    <dt><FontAwesomeIcon icon={faUserTie} /> Assigned by</dt>
                                    <dd>{task.assignedBy?.name || '—'}</dd>
                                </div>
                                <div>
                                    <dt><FontAwesomeIcon icon={faCalendarAlt} /> Start</dt>
                                    <dd>{task.startDate ? new Date(task.startDate).toLocaleDateString('en-GB') : '—'}</dd>
                                </div>
                                <div>
                                    <dt><FontAwesomeIcon icon={faCalendarAlt} /> Due</dt>
                                    <dd className={due.tone === 'overdue' ? 'overdue' : ''}>
                                        {new Date(task.dueDate).toLocaleDateString('en-GB')}
                                    </dd>
                                </div>
                            </dl>

                            {task.description && (
                                <>
                                    <label className="td-label">Description</label>
                                    <p className="task-description-text">{task.description}</p>
                                </>
                            )}
                        </div>
                    </section>

                    {/* People */}
                    <section className="td-panel">
                        <header className="td-panel-head">
                            <h2><FontAwesomeIcon icon={faUsers} /> Working on this</h2>
                            <span className="td-count">{task.assignees.length}</span>
                        </header>
                        <div className="td-panel-body">
                            <div className="assignee-chip-list">
                                {task.assignees.map(a => (
                                    <div key={a._id} className={`assignee-chip ${a._id === currentUserId ? 'is-me' : ''}`}>
                                        <Avatar name={a.name} profilePic={a.profilePic} className="assignee-avatar" />
                                        <span className="assignee-name">
                                            {a.name || 'Unknown'}
                                            {a._id === currentUserId && <span className="you-tag">You</span>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* The brief inherited from a recurring schedule. Referenced,
                        never copied: a copy taken before the nightly compression
                        job runs would point at a staged file it then deletes. */}
                    {task.recurringTaskId?.attachments?.length > 0 && (
                        <section className="td-panel">
                            <header className="td-panel-head">
                                <h2><FontAwesomeIcon icon={faRepeat} /> Daily brief</h2>
                                <span className="td-count">{task.recurringTaskId.attachments.length}</span>
                            </header>
                            <div className="td-panel-body">
                                <p className="rt-brief-note">
                                    Shared by every day of &quot;{task.recurringTaskId.title}&quot;.
                                </p>
                                <TaskMediaGrid media={task.recurringTaskId.attachments} />
                            </div>
                        </section>
                    )}

                    {/* Reference media */}
                    {(task.attachments?.length > 0 || canEdit) && (
                        <section className="td-panel">
                            <header className="td-panel-head">
                                <h2><FontAwesomeIcon icon={faPaperclip} /> Reference media</h2>
                                <span className="td-count">{task.attachments.length}</span>
                            </header>
                            <div className="td-panel-body">
                                {task.attachments.length > 0 ? (
                                    <TaskMediaGrid
                                        media={task.attachments}
                                        onDelete={canEdit ? deleteMedia : undefined}
                                        deletingId={deletingMediaId}
                                    />
                                ) : (
                                    <p className="td-muted-line" style={{ margin: 0 }}>
                                        No reference material yet.
                                    </p>
                                )}

                                {canEdit && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <ScreenRecorder onAttach={addReferenceScreenRecording} />
                                        <label className={`td-add-media ${addingMedia ? 'busy' : ''}`}>
                                            <FontAwesomeIcon icon={addingMedia ? faSpinner : faPlus} spin={addingMedia} />
                                            {addingMedia ? 'Uploading...' : 'Add reference media'}
                                            <input
                                                type="file" multiple accept="image/*,video/*" hidden
                                                onChange={addReferenceMedia} disabled={addingMedia}
                                            />
                                        </label>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Supporting documents / materials */}
                    {task.completionProof?.length > 0 && (
                        <section className="td-panel">
                            <header className="td-panel-head">
                                <h2><FontAwesomeIcon icon={faCheckCircle} /> Supporting Documents/Materials</h2>
                                <span className="td-count">{task.completionProof.length}</span>
                            </header>
                            <div className="td-panel-body">
                                <TaskMediaGrid
                                    media={task.completionProof}
                                    onDelete={canChangeStatus ? deleteMedia : undefined}
                                    deletingId={deletingMediaId}
                                />
                            </div>
                        </section>
                    )}

                    <Link to={isManagement ? '/tasks' : '/my-tasks'} className="td-back-link">
                        <FontAwesomeIcon icon={faArrowLeft} /> {isManagement ? 'All tasks' : 'My tasks'}
                    </Link>
                </aside>
            </div>

            <SelfTaskForm
                open={resubmitOpen}
                task={task}
                onClose={() => setResubmitOpen(false)}
                onSaved={load}
            />
        </div>
    );
};

export default TaskDetail;
