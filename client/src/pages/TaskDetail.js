import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowLeft, faSpinner, faPaperclip, faUsers, faSave, faFolderOpen,
    faCheckCircle, faCalendarAlt, faUserTie, faEdit, faBuilding, faRepeat,
    faHourglassHalf, faCircleXmark, faUserPen, faRotateLeft, faPen,
    faTriangleExclamation
} from '@fortawesome/free-solid-svg-icons';
import api from '../utils/api';
import TaskThreads from '../components/TaskThreads';
import TaskMediaGrid from '../components/TaskMediaGrid';
import ScreenRecorder from '../components/ScreenRecorder';
import EmployeeAvatar from '../components/EmployeeAvatar';
import TaskCountdown, { hasTimeWindow } from '../components/TaskCountdown';
import TaskNudges from '../components/TaskNudges';
import { STATUS_OPTIONS, slug, dueLabel, taskContextLabel } from '../utils/taskHelpers';
import '../styles/App.css';
import '../styles/tasks.css';
import '../styles/recurring.css';
import '../styles/selftask.css';
import SelfTaskForm from '../components/SelfTaskForm';
import CopyLinkButton from '../components/CopyLinkButton';

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
    const [deletingMediaId, setDeletingMediaId] = useState(null);
    const [resubmitOpen, setResubmitOpen] = useState(false);

    // The two optional halves of the submit panel. Both start folded so the
    // common case is just "pick a pill and save"; each opens itself when the
    // task gives it a reason to be open (see the load effect below).
    const [proofOpen, setProofOpen] = useState(false);
    const [noteOpen, setNoteOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await api.get(`/tasks/${id}`);
            setTask(res.data);
            setStatus(res.data.status || 'Pending');
            setNote(res.data.statusNote || '');
            // Proof is demanded, or already there to be seen; a note that
            // already exists must not be hidden behind a link.
            setProofOpen(Boolean(res.data.requiresAttachment) || (res.data.completionProof || []).length > 0);
            setNoteOpen(Boolean(res.data.statusNote));
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

    /**
     * Send a completed task back, with a reason.
     *
     * The reason is required by the route as well as by this prompt — the
     * assignee is told their work was not finished, so they have to be told
     * what is missing along with it.
     */
    const openReopen = async () => {
        const { value: reopenNote } = await Swal.fire({
            title: 'Send this task back?',
            input: 'textarea',
            inputLabel: 'What still needs doing?',
            inputPlaceholder: 'The assignee sees this, so be specific...',
            inputAttributes: { 'aria-label': 'What still needs doing' },
            showCancelButton: true,
            confirmButtonText: 'Send back',
            confirmButtonColor: '#b45309',
            inputValidator: (v) => (v && v.trim() ? undefined : 'Please say what still needs doing.')
        });
        if (!reopenNote) return;

        try {
            const res = await api.post(`/tasks/${id}/reopen`, { note: reopenNote.trim() });
            setTask(res.data);
            setStatus(res.data.status);
            setNote(res.data.statusNote || '');
            Swal.fire({
                icon: 'success', title: 'Sent back', toast: true,
                position: 'top-end', timer: 1800, showConfirmButton: false
            });
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not reopen the task.', 'error');
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
    const canEdit = isOwner || ['ADMIN', 'HR'].includes(currentUser?.role);

    // Doing the work and owning the outcome are different jobs, and this page
    // shows one or the other — never both stacked on top of each other.
    // Only an assignee reports progress; assigning a task to yourself makes
    // you an assignee, so your role never decides what you see here.
    const canChangeStatus = isAssignee;
    // The assigner's counterpart to the status pills: send finished work back
    // with a reason. Redundant for an assignee, who can simply move the pill.
    const canReopen = !isAssignee && canEdit && task.status === 'Completed';
    const due = dueLabel(task.dueDate, task.status === 'Completed', task.overdueAt);
    const dirty = status !== task.status || note !== (task.statusNote || '') || proofFiles.length > 0;

    // Counts what is already on the task plus what is staged in this form —
    // attaching and completing is one action, so the requirement is met the
    // moment a file is picked, not only after a prior save.
    const proofSatisfied = (task.completionProof?.length || 0) > 0 || proofFiles.length > 0;
    // Mirrors the server's guard in PUT /:id/status so the button explains
    // itself rather than letting the request bounce.
    const blockedByProof = Boolean(task.requiresAttachment) && status === 'Completed' && !proofSatisfied;

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
                        {task.requiresAttachment && (
                            <span
                                className={`atr-badge ${proofSatisfied ? 'is-met' : ''}`}
                                title={proofSatisfied
                                    ? 'Supporting material has been attached'
                                    : 'Supporting material is required before this can be completed'}
                            >
                                <FontAwesomeIcon icon={proofSatisfied ? faCheckCircle : faPaperclip} />
                                {proofSatisfied ? 'Proof attached' : 'Proof required'}
                            </span>
                        )}
                        {task.recurringTaskId && (
                            <span
                                className="rt-day-badge"
                                title="Open the whole schedule"
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigate(`/tasks/recurring/${task.recurringTaskId._id}`)}
                            >
                                <FontAwesomeIcon icon={faRepeat} />
                                Day {task.recurringDayNumber} of {task.recurringTaskId.targetCount}
                            </span>
                        )}
                    </div>
                </div>

                <div className="td-header-actions">
                    {/* Everyone who can see the task can share it: the link
                        grants nothing on its own, so whoever receives it is
                        checked exactly as they would be navigating here. */}
                    <CopyLinkButton
                        path={`/task/${task._id}`}
                        label="Copy link to this task"
                        className="gts-btn secondary td-copy-btn"
                    />
                    {canEdit && (
                        <button className="gts-btn secondary" onClick={() => navigate(`/edit-task/${task._id}`)}>
                            <FontAwesomeIcon icon={faEdit} /> Edit
                        </button>
                    )}
                </div>
            </header>

            {/* ---------- Two columns: discussion left, details right ---------- */}
            <div className="td-layout">
                <div className="td-main">
                    {/* A generated day carries two conversations: today's, and the
                        run's. TaskThreads shows both rather than hiding the one
                        the messages are actually in. */}
                    <TaskThreads task={task} currentUserId={currentUserId} />
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

                                {/* Attachments. Expanded and stated as a rule when the
                                    assigner asked for proof; otherwise folded away behind
                                    one line, because most tasks are finished by moving a
                                    pill and nothing else. */}
                                {proofOpen ? (
                                    <>
                                        {task.requiresAttachment ? (
                                            <div className={`td-required-note ${proofSatisfied ? 'is-met' : ''}`}>
                                                <FontAwesomeIcon icon={proofSatisfied ? faCheckCircle : faTriangleExclamation} />
                                                <span>
                                                    {proofSatisfied
                                                        ? 'Supporting material attached.'
                                                        : 'This task needs supporting material before it can be completed.'}
                                                </span>
                                            </div>
                                        ) : (
                                            <label className="td-label">Attach supporting material</label>
                                        )}

                                        <ScreenRecorder onAttach={handleProofRecordingAttach} />
                                        <input
                                            className="custom-file-input" type="file" multiple
                                            accept="image/*,video/*,.html,.htm,text/html" onChange={handleProofChange} disabled={saving}
                                            style={{ marginTop: '10px' }}
                                        />
                                        <p className="td-field-hint">
                                            Anything that backs up the work — files, screenshots, recordings.
                                        </p>
                                    </>
                                ) : (
                                    <button type="button" className="td-disclose" onClick={() => setProofOpen(true)}>
                                        <FontAwesomeIcon icon={faPaperclip} /> Attach supporting material
                                    </button>
                                )}

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

                                {/* The note is genuinely optional on every task, so it
                                    stays folded until asked for — but opens by itself if
                                    the task already carries one, which would otherwise be
                                    invisible until you went looking. */}
                                {noteOpen ? (
                                    <>
                                        <label className="td-label">Note</label>
                                        <textarea
                                            className="custom-input" rows="2" value={note}
                                            onChange={(e) => setNote(e.target.value)}
                                            placeholder="Anything the team should know?"
                                            disabled={saving}
                                        />
                                    </>
                                ) : (
                                    <button type="button" className="td-disclose" onClick={() => setNoteOpen(true)}>
                                        <FontAwesomeIcon icon={faPen} /> Add a note
                                    </button>
                                )}

                                {blockedByProof && (
                                    <p className="td-blocked-hint">
                                        Attach a file to mark this completed.
                                    </p>
                                )}

                                {saving && uploadProgress > 0 && (
                                    <div className="upload-progress-container" style={{ margin: '10px 0' }}>
                                        <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }}>{uploadProgress}%</div>
                                    </div>
                                )}

                                <button className="gts-btn primary td-full-btn" onClick={saveStatus} disabled={saving || !dirty || blockedByProof}>
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
                                <div className="status-pill-row is-readonly">
                                    <span className={`status-pill ${slug(task.status)} selected`}>{task.status}</span>
                                </div>

                                <p className="td-muted-line">
                                    Only the {task.assignees.length === 1 ? 'person' : 'people'} working on
                                    this task can move it. {canEdit
                                        ? 'You can change the brief from Edit, or send the work back once it is submitted.'
                                        : ''}
                                </p>

                                {task.statusNote && <p className="td-status-note">“{task.statusNote}”</p>}

                                {canReopen && (
                                    <button className="gts-btn secondary td-full-btn" onClick={openReopen}>
                                        <FontAwesomeIcon icon={faRotateLeft} /> Send back for more work
                                    </button>
                                )}

                                {task.statusUpdatedBy && (
                                    <p className="td-muted-line">
                                        Last moved by <strong>{task.statusUpdatedBy.name}</strong>
                                        {task.completedAt && ` · completed ${new Date(task.completedAt).toLocaleDateString('en-GB')}`}
                                    </p>
                                )}
                            </div>
                        )}
                    </section>

                    {/* Chasing an ETA, and the record of who has already been
                        chased. Above Details because an unanswered check-in is
                        something to act on, and the details are only reference. */}
                    <TaskNudges task={task} currentUserId={currentUserId} />

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
                                        <EmployeeAvatar
                                            person={task.assignees[0]}
                                            className="sa-prov-avatar"
                                        />
                                        <span className="sa-prov-name">{task.assignees[0]?.name || 'Unknown'}</span>
                                        <span className="sa-prov-role">logged this</span>
                                    </li>
                                    <li>
                                        <EmployeeAvatar
                                            person={task.assignedBy}
                                            className="sa-prov-avatar"
                                        />
                                        <span className="sa-prov-name">{task.assignedBy?.name || 'Unknown'}</span>
                                        <span className="sa-prov-role">asked for it</span>
                                    </li>
                                    <li>
                                        {task.approvedBy ? (
                                            <>
                                                <EmployeeAvatar
                                                    person={task.approvedBy}
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
                                    <dd>
                                        {task.startDate ? new Date(task.startDate).toLocaleDateString('en-GB') : '—'}
                                        {task.startTime && <span className="td-time-suffix"> · {task.startTime}</span>}
                                    </dd>
                                </div>
                                <div>
                                    <dt><FontAwesomeIcon icon={faCalendarAlt} /> Due</dt>
                                    <dd className={due.tone === 'overdue' ? 'overdue' : ''}>
                                        {new Date(task.dueDate).toLocaleDateString('en-GB')}
                                        {task.dueTime
                                            ? <span className="td-time-suffix"> · {task.dueTime}</span>
                                            : (!task.recurringTaskId && <span className="td-time-suffix"> · end of shift</span>)}
                                    </dd>
                                </div>
                            </dl>

                            {/* The assignee sees this even without an explicit time window —
                                the fallback shift-end is still a real cutoff, and it's their
                                own workday it's counting down. Someone just looking in on the
                                task (an admin who didn't set a time) doesn't get the same
                                unsolicited precision. */}
                            {hasTimeWindow(task, { requireExplicit: !isAssignee }) && (
                                <div className="td-countdown">
                                    <TaskCountdown task={task} />
                                </div>
                            )}

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
                                        <EmployeeAvatar person={a} className="assignee-avatar" />
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

                    {/* Reference media — the brief, so it is read-only on this
                        page for everyone. The assigner changes it on the edit
                        form, which is the one place the brief is authored;
                        having a second half-editor here is what let an owner
                        record a screen capture against a task they were only
                        supposed to be reading. */}
                    {task.attachments?.length > 0 && (
                        <section className="td-panel">
                            <header className="td-panel-head">
                                <h2><FontAwesomeIcon icon={faPaperclip} /> Reference media</h2>
                                <span className="td-count">{task.attachments.length}</span>
                            </header>
                            <div className="td-panel-body">
                                <TaskMediaGrid media={task.attachments} />
                                {canEdit && (
                                    <p className="td-field-hint">
                                        Add or remove reference material from{' '}
                                        <Link to={`/edit-task/${task._id}`}>Edit</Link>.
                                    </p>
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
                                    onDelete={isAssignee ? deleteMedia : undefined}
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
