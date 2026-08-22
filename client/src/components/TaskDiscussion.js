import React, { useState, useEffect, useCallback, useRef } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSpinner, faPaperPlane, faTrash, faImage, faComments
} from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression';
import api from '../utils/api';
import { getSocket, onSocket } from '../utils/socket';
import { resolveMediaUrl, timeAgo } from '../utils/taskHelpers';
import MediaLightbox from './MediaLightbox';
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

        return () => {
            socket.emit('task:leave', taskId);
            offNew();
            offDel();
        };
    }, [taskId]);

    // Keep the newest message in view as the thread grows.
    useEffect(() => {
        if (threadRef.current) {
            threadRef.current.scrollTop = threadRef.current.scrollHeight;
        }
    }, [comments]);

    const handleImagePick = async (e) => {
        const picked = Array.from(e.target.files).filter(f => {
            if (!f.type.startsWith('image/')) {
                Swal.fire('Images only', 'Attach videos to the task itself, not to a message.', 'info');
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

            const res = await api.post(`${basePath}/${taskId}/comments`, data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setComments(prev => (prev.some(c => c._id === res.data._id) ? prev : [...prev, res.data]));
            setMessage('');
            setImages([]);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not send your message.', 'error');
        } finally {
            setSending(false);
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
    const galleryItems = comments.flatMap(c =>
        (c.attachments || []).map(a => ({ ...a, type: 'image', _id: `${c._id}-${a.url}` }))
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
                                        {mine && (
                                            <button className="discussion-delete" title="Delete message" onClick={() => remove(c)}>
                                                <FontAwesomeIcon icon={faTrash} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="discussion-bubble">
                                        {c.message && <p className="discussion-text">{c.message}</p>}
                                        {c.attachments?.length > 0 && (
                                            <div className="discussion-images">
                                                {c.attachments.map((a, i) => (
                                                    <button
                                                        key={i} type="button" className="discussion-image-btn"
                                                        onClick={() => setLightboxIndex(galleryIndexOf(a.url))}
                                                        title="View image"
                                                    >
                                                        <img src={resolveMediaUrl(a.url)} alt={a.fileName || 'attachment'} />
                                                    </button>
                                                ))}
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
                {images.length > 0 && (
                    <div className="file-chips-list" style={{ marginBottom: '8px' }}>
                        {images.map((f, i) => (
                            <div key={i} className="file-chip">
                                <span className="file-chip-name">{f.name}</span>
                                <button type="button" className="file-chip-remove" onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="discussion-input-row">
                    <textarea
                        className="discussion-input"
                        rows="1"
                        placeholder="Write a message..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={onKeyDown}
                        disabled={sending}
                    />

                    <label className="icon-btn" title="Attach image" style={{ cursor: 'pointer' }}>
                        <FontAwesomeIcon icon={faImage} />
                        <input type="file" accept="image/*" multiple hidden onChange={handleImagePick} disabled={sending} />
                    </label>

                    <button
                        className="icon-btn discussion-send"
                        title="Send"
                        onClick={send}
                        disabled={sending || (!message.trim() && images.length === 0)}
                    >
                        <FontAwesomeIcon icon={sending ? faSpinner : faPaperPlane} spin={sending} />
                    </button>
                </div>
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
