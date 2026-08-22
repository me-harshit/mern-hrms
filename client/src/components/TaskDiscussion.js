import React, { useState, useEffect, useCallback, useRef } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSpinner, faPaperPlane, faTrash, faImage, faComments, faFilm,
    faPaperclip, faMicrophone, faVideo, faPen, faXmark, faCheck
} from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression';
import api from '../utils/api';
import { getSocket, onSocket } from '../utils/socket';
import { resolveMediaUrl, timeAgo } from '../utils/taskHelpers';
import MediaLightbox from './MediaLightbox';
import '../styles/discussion.css';
import ScreenRecorder from './ScreenRecorder';
import AudioRecorder from './AudioRecorder';
import AudioNote from './AudioNote';
import Avatar from './Avatar';

/**
 * `basePath` is what lets a recurring schedule have its own thread: the routes
 * are identical in shape, only mounted under /tasks/recurring instead. The
 * socket room is keyed by the id either way, so live updates need no change.
 */
const TaskDiscussion = ({ taskId, currentUserId, basePath = '/tasks', title = 'Discussion' }) => {
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [images, setImages] = useState([]);
    const [sending, setSending] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(null);
    const threadRef = useRef(null);

    const fetchComments = useCallback(async () => {
        try {
            const res = await api.get(`${basePath}/${taskId}/comments`);
            setComments(res.data);
        } catch (err) {
            console.error('Could not load discussion', err);
        } finally {
            setLoading(false);
        }
    }, [taskId]);

    useEffect(() => { fetchComments(); }, [fetchComments]);

    // Live updates — join this task's room so other people's messages land
    // without a reload.
    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        socket.emit('task:join', taskId);

        const offNew = onSocket('task:comment', (incoming) => {
            if (incoming.taskId !== taskId) return;
            setComments(prev => (
                // Our own message is already in state from the POST response,
                // and a reconnect can replay events we've seen.
                prev.some(c => c._id === incoming._id) ? prev : [...prev, incoming]
            ));
        });

        const offDel = onSocket('task:comment-deleted', ({ _id }) => {
            setComments(prev => prev.filter(c => c._id !== _id));
        });

        const offEdit = onSocket('task:comment-edited', (updated) => {
            setComments(prev => prev.map(c => (c._id === updated._id ? updated : c)));
        });

        return () => {
            socket.emit('task:leave', taskId);
            offNew();
            offDel();
            offEdit();
        };
    }, [taskId]);

    // Keep the newest message in view as the thread grows.
    useEffect(() => {
        if (threadRef.current) {
            threadRef.current.scrollTop = threadRef.current.scrollHeight;
        }
    }, [comments]);

    // A voice note carries the waveform measured while recording, so the player
    // never has to download and decode the audio just to draw it.
    const [audioMeta, setAudioMeta] = useState(null);

    // Which recorder, if any, has taken over the composer row.
    const [mode, setMode] = useState('text');      // text | voice | screen
    const [attachOpen, setAttachOpen] = useState(false);
    const attachRef = useRef(null);

    // The message being reworded, and its draft text.
    const [editingId, setEditingId] = useState(null);
    const [editDraft, setEditDraft] = useState('');

    // The attach menu is a popover, so it closes the way popovers do.
    useEffect(() => {
        if (!attachOpen) return;
        const onDown = (e) => {
            if (attachRef.current && !attachRef.current.contains(e.target)) setAttachOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setAttachOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [attachOpen]);

    const handleRecordingAttach = (file) => setImages(prev => [...prev, file]);

    const handleVoiceAttach = (file, meta) => {
        setImages(prev => [...prev, file]);
        setAudioMeta(meta);
    };

    const handleImagePick = async (e) => {
        const picked = Array.from(e.target.files).filter(f => {
            if (!f.type.startsWith('image/')) {
                Swal.fire('Images here', 'Use the record buttons for video or voice.', 'info');
                return false;
            }
            return true;
        });

        const processed = [];
        for (const f of picked) {
            try {
                const blob = await imageCompression(f, { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: false, fileType: 'image/jpeg' });
                processed.push(new File([blob], f.name.replace(/\.[^/.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
            } catch {
                processed.push(f);
            }
        }
        setImages(prev => [...prev, ...processed]);
        e.target.value = '';
    };

    const send = async () => {
        if (!message.trim() && images.length === 0) return;

        setSending(true);
        try {
            const data = new FormData();
            data.append('message', message);
            images.forEach(f => data.append('attachments', f));
            if (audioMeta) {
                data.append('waveform', JSON.stringify(audioMeta.waveform || []));
                data.append('durationMs', String(audioMeta.durationMs || 0));
            }

            const res = await api.post(`${basePath}/${taskId}/comments`, data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setComments(prev => (prev.some(c => c._id === res.data._id) ? prev : [...prev, res.data]));
            setMessage('');
            setImages([]);
            setAudioMeta(null);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not send your message.', 'error');
        } finally {
            setSending(false);
        }
    };

    const beginEdit = (comment) => {
        setEditingId(comment._id);
        setEditDraft(comment.message || '');
    };

    const saveEdit = async (comment) => {
        const text = editDraft.trim();
        if (!text && (comment.attachments || []).length === 0) return;
        if (text === (comment.message || '')) { setEditingId(null); return; }

        try {
            const res = await api.put(`${basePath}/${taskId}/comments/${comment._id}`, { message: text });
            setComments(prev => prev.map(c => (c._id === comment._id ? res.data : c)));
            setEditingId(null);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not edit the message.', 'error');
        }
    };

    const remove = async (comment) => {
        const ok = await Swal.fire({
            title: 'Delete this message?', icon: 'warning',
            showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'Delete'
        });
        if (!ok.isConfirmed) return;

        try {
            await api.delete(`${basePath}/${taskId}/comments/${comment._id}`);
            setComments(prev => prev.filter(c => c._id !== comment._id));
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not delete the message.', 'error');
        }
    };

    // Flattened so the lightbox can page through the whole conversation's
    // images, not just the ones in a single message.
    // Images only: the lightbox is a picture viewer, and a voice note or a
    // screen recording has its own player in the bubble. Comments written before
    // `type` existed were always images.
    const galleryItems = comments.flatMap(c =>
        (c.attachments || [])
            .filter(a => (a.type || 'image') === 'image')
            .map(a => ({ ...a, type: 'image', _id: `${c._id}-${a.url}` }))
    );
    const galleryIndexOf = (url) => galleryItems.findIndex(g => g.url === url);

    // Enter sends, Shift+Enter makes a new line.
    const onKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    };

    return (
        <section className="td-discussion">
            <header className="td-panel-head">
                <h2><FontAwesomeIcon icon={faComments} /> {title}</h2>
                {comments.length > 0 && <span className="td-count">{comments.length}</span>}
            </header>

            <div className="td-thread" ref={threadRef}>
                {loading ? (
                    <p className="td-thread-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading...</p>
                ) : comments.length === 0 ? (
                    <div className="td-thread-empty">
                        <FontAwesomeIcon icon={faComments} className="td-empty-icon" />
                        <p>No messages yet.</p>
                        <span>Ask a question or post an update — everyone on this task will be notified.</span>
                    </div>
                ) : (
                    comments.map(c => {
                        const mine = c.author?._id === currentUserId;
                        return (
                            <div key={c._id} className={`discussion-msg ${mine ? 'mine' : ''}`}>
                                <Avatar name={c.author?.name} profilePic={c.author?.profilePic} className="assignee-avatar" />
                                <div className="discussion-bubble-wrap">
                                    <div className="discussion-meta">
                                        <span className="discussion-author">{mine ? 'You' : (c.author?.name || 'Unknown')}</span>
                                        <span className="discussion-time">{timeAgo(c.createdAt)}</span>
                                        {mine && editingId !== c._id && (
                                            <>
                                                {/* Only the words can change; swapping the
                                                    attachments after people replied would
                                                    change what was agreed. */}
                                                {c.message && (
                                                    <button
                                                        className="discussion-delete"
                                                        title="Edit message"
                                                        onClick={() => beginEdit(c)}
                                                    >
                                                        <FontAwesomeIcon icon={faPen} />
                                                    </button>
                                                )}
                                                <button
                                                    className="discussion-delete"
                                                    title="Delete message"
                                                    onClick={() => remove(c)}
                                                >
                                                    <FontAwesomeIcon icon={faTrash} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    <div className="discussion-bubble">
                                        {editingId === c._id ? (
                                            <div className="dc-edit">
                                                <textarea
                                                    className="dc-edit-input"
                                                    value={editDraft}
                                                    autoFocus
                                                    rows="2"
                                                    onChange={(e) => setEditDraft(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(c); }
                                                        if (e.key === 'Escape') setEditingId(null);
                                                    }}
                                                />
                                                <div className="dc-edit-actions">
                                                    <button type="button" className="dc-edit-btn" onClick={() => setEditingId(null)}>
                                                        <FontAwesomeIcon icon={faXmark} /> Cancel
                                                    </button>
                                                    <button type="button" className="dc-edit-btn is-save" onClick={() => saveEdit(c)}>
                                                        <FontAwesomeIcon icon={faCheck} /> Save
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            c.message && (
                                                <p className="discussion-text">
                                                    {c.message}
                                                    {c.editedAt && <span className="dc-edited" title="This message was edited">edited</span>}
                                                </p>
                                            )
                                        )}
                                        {c.attachments?.length > 0 && (
                                            <div className="discussion-images">
                                                {c.attachments.map((a, i) => {
                                                    // Older comments predate `type` and were always images.
                                                    const kind = a.type || 'image';

                                                    if (kind === 'audio') {
                                                        return <AudioNote key={i} media={a} mine={mine} />;
                                                    }

                                                    if (kind === 'video') {
                                                        return (
                                                            <div key={i} className="dv-video">
                                                                <video src={resolveMediaUrl(a.url)} controls preload="metadata" />
                                                                {a.status === 'processing_compression' && (
                                                                    <span className="dv-processing">
                                                                        <FontAwesomeIcon icon={faFilm} /> Optimising overnight
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <button
                                                            key={i} type="button" className="discussion-image-btn"
                                                            onClick={() => setLightboxIndex(galleryIndexOf(a.url))}
                                                            title="View image"
                                                        >
                                                            <img src={resolveMediaUrl(a.url)} alt={a.fileName || 'attachment'} />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="discussion-composer">
                {images.length > 0 && mode === 'text' && (
                    <div className="dc-chips">
                        {images.map((f, i) => (
                            <span key={i} className="dc-chip">
                                <FontAwesomeIcon icon={f.type.startsWith('audio') ? faMicrophone
                                    : f.type.startsWith('video') ? faVideo : faImage} />
                                <span className="dc-chip-name">{f.name}</span>
                                <button type="button" className="dc-chip-x"
                                    onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}>
                                    <FontAwesomeIcon icon={faXmark} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                {/* Recording takes over the row entirely: half a composer with a
                    waveform crammed beside it reads as broken. */}
                {mode === 'voice' && (
                    <AudioRecorder
                        autoStart
                        onAttach={handleVoiceAttach}
                        onClose={() => setMode('text')}
                    />
                )}

                {mode === 'screen' && (
                    <ScreenRecorder
                        autoStart
                        onAttach={handleRecordingAttach}
                        onClose={() => setMode('text')}
                    />
                )}

                {mode === 'text' && (
                    <div className="dc-row">
                        <div className="dc-attach" ref={attachRef}>
                            <button
                                type="button"
                                className={`dc-btn ${attachOpen ? 'is-open' : ''}`}
                                onClick={() => setAttachOpen(o => !o)}
                                title="Attach"
                                aria-haspopup="menu"
                                aria-expanded={attachOpen}
                                disabled={sending}
                            >
                                <FontAwesomeIcon icon={faPaperclip} />
                            </button>

                            {attachOpen && (
                                <div className="dc-menu" role="menu">
                                    <label className="dc-menu-item" role="menuitem">
                                        <span className="dc-menu-icon is-file"><FontAwesomeIcon icon={faImage} /></span>
                                        <span>
                                            <strong>Attach file</strong>
                                            <small>Images from your device</small>
                                        </span>
                                        <input type="file" accept="image/*" multiple hidden
                                            onChange={(e) => { setAttachOpen(false); handleImagePick(e); }} />
                                    </label>

                                    <button type="button" className="dc-menu-item" role="menuitem"
                                        onClick={() => { setAttachOpen(false); setMode('screen'); }}>
                                        <span className="dc-menu-icon is-screen"><FontAwesomeIcon icon={faVideo} /></span>
                                        <span>
                                            <strong>Record screen</strong>
                                            <small>Capture with narration</small>
                                        </span>
                                    </button>
                                </div>
                            )}
                        </div>

                        <textarea
                            className="dc-input"
                            rows="1"
                            placeholder="Write a message..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={onKeyDown}
                            disabled={sending}
                        />

                        <button
                            type="button"
                            className="dc-btn is-mic"
                            title="Record a voice note"
                            onClick={() => setMode('voice')}
                            disabled={sending}
                        >
                            <FontAwesomeIcon icon={faMicrophone} />
                        </button>

                        <button
                            className="dc-btn is-send"
                            title="Send"
                            onClick={send}
                            disabled={sending || (!message.trim() && images.length === 0)}
                        >
                            <FontAwesomeIcon icon={sending ? faSpinner : faPaperPlane} spin={sending} />
                        </button>
                    </div>
                )}
            </div>

            {lightboxIndex !== null && lightboxIndex >= 0 && (
                <MediaLightbox
                    items={galleryItems}
                    index={lightboxIndex}
                    onIndexChange={setLightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                />
            )}
        </section>
    );
};

export default TaskDiscussion;
