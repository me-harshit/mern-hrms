import React, { useState, useRef, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faPaperPlane, faXmark, faMicrophone, faTimes
} from '@fortawesome/free-solid-svg-icons';

import AttachMenu from '../AttachMenu';
import Avatar from '../Avatar';

/**
 * The message box: text, @mentions, files, voice notes and screen recordings.
 *
 * Attaching is delegated to the shared <AttachMenu>, which tasks use too, so
 * the document types, the image compression and the recorder takeover are
 * defined once. What stays here is what is genuinely chat-specific: the text
 * box, @mention autocomplete, the reply and edit strips, and send.
 */

const MAX_MB = 300;

const MessageComposer = ({
    conversation,
    members = [],
    replyTo,
    onCancelReply,
    editing,
    onCancelEdit,
    onSend,
    onSaveEdit,
    onTyping,
    disabled,
    disabledReason
}) => {
    const [text, setText] = useState('');
    const [files, setFiles] = useState([]);
    const [audioMeta, setAudioMeta] = useState(null);
    const [sending, setSending] = useState(false);
    // AttachMenu reports true while it compresses a picked image set.
    const [preparing, setPreparing] = useState(false);

    // @mention autocomplete state
    const [mentionQuery, setMentionQuery] = useState(null);
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentioned, setMentioned] = useState([]);

    const textRef = useRef(null);
    const typingTimer = useRef(null);

    // Editing swaps the box's contents for the message being reworded.
    useEffect(() => {
        if (editing) {
            setText(editing.text || '');
            textRef.current?.focus();
        }
    }, [editing]);

    // Grow with the text, up to the CSS max-height.
    useEffect(() => {
        const el = textRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
    }, [text]);

    /* ------------------------------ mentions ------------------------------ */

    const mentionMatches = React.useMemo(() => {
        if (mentionQuery === null) return [];
        const q = mentionQuery.toLowerCase();
        return members
            .map((m) => m.user)
            .filter(Boolean)
            .filter((u) => !q || u.name?.toLowerCase().includes(q))
            .slice(0, 6);
    }, [mentionQuery, members]);

    /**
     * Only offer names when "@" starts a word — otherwise an email address
     * typed into the box opens the picker on every keystroke.
     */
    const detectMention = (value, caret) => {
        const upto = value.slice(0, caret);
        const match = upto.match(/(?:^|\s)@([\p{L}\p{N} ]{0,25})$/u);
        setMentionQuery(match ? match[1] : null);
        setMentionIndex(0);
    };

    const applyMention = (user) => {
        const el = textRef.current;
        const caret = el?.selectionStart ?? text.length;
        const upto = text.slice(0, caret);
        const start = upto.lastIndexOf('@');
        if (start === -1) return;

        const next = `${text.slice(0, start)}@${user.name} ${text.slice(caret)}`;
        setText(next);
        setMentioned((prev) =>
            prev.some((p) => p._id === user._id) ? prev : [...prev, user]
        );
        setMentionQuery(null);
        requestAnimationFrame(() => {
            el?.focus();
            const pos = start + user.name.length + 2;
            el?.setSelectionRange(pos, pos);
        });
    };

    /* ------------------------------ files ------------------------------ */

    /**
     * Where AttachMenu hands files back. `meta` is present only for a voice
     * note — the waveform and duration measured while recording, which travel
     * with the upload so a player never decodes the audio just to draw it.
     */
    const stage = useCallback((incoming, meta) => {
        setFiles((prev) => [...prev, ...incoming].slice(0, 10));
        if (meta) setAudioMeta(meta);
    }, []);

    const removeFile = (i) => {
        setFiles((prev) => prev.filter((_, idx) => idx !== i));
        // The waveform belongs to a specific voice note; dropping the file
        // without dropping its metadata would attach it to the next one.
        if (!files[i] || files[i].type?.startsWith('audio')) setAudioMeta(null);
    };

    /* ------------------------------ sending ------------------------------ */

    const reset = () => {
        setText('');
        setFiles([]);
        setAudioMeta(null);
        setMentioned([]);
        setMentionQuery(null);
    };

    const submit = async () => {
        if (sending || disabled) return;

        if (editing) {
            const trimmed = text.trim();
            if (!trimmed && !(editing.attachments || []).length) return;
            await onSaveEdit(editing, trimmed);
            reset();
            return;
        }

        if (!text.trim() && !files.length) return;

        setSending(true);
        try {
            // Only mentions whose name survives in the final text — deleting
            // "@Amit" after picking him should not still ping him.
            const kept = mentioned.filter((u) => text.includes(`@${u.name}`));
            await onSend({
                text: text.trim(),
                files,
                audioMeta,
                mentions: kept.map((u) => u._id),
                replyToId: replyTo?._id || null
            });
            reset();
            onCancelReply?.();
        } catch (err) {
            Swal.fire('Error', err?.response?.data?.message || 'Could not send your message.', 'error');
        } finally {
            setSending(false);
        }
    };

    const onKeyDown = (e) => {
        // Arrow keys drive the mention list while it is open.
        if (mentionQuery !== null && mentionMatches.length) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionIndex((i) => (i + 1) % mentionMatches.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                applyMention(mentionMatches[mentionIndex]);
                return;
            }
            if (e.key === 'Escape') { setMentionQuery(null); return; }
        }

        // Enter sends, Shift+Enter makes a new line — the convention every
        // chat app shares, and the one people's hands already expect.
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
        if (e.key === 'Escape') {
            if (editing) onCancelEdit?.();
            if (replyTo) onCancelReply?.();
        }
    };

    const onChange = (e) => {
        const value = e.target.value;
        setText(value);
        detectMention(value, e.target.selectionStart);

        // Typing indicator, debounced off rather than fired per keystroke.
        onTyping?.(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => onTyping?.(false), 1800);
    };

    useEffect(() => () => clearTimeout(typingTimer.current), []);

    if (disabled) {
        return (
            <div className="msgr-composer">
                <div style={{ textAlign: 'center', color: '#667781', fontSize: 13, padding: '10px 0' }}>
                    {disabledReason || 'You cannot post in this conversation.'}
                </div>
            </div>
        );
    }

    return (
        <div className="msgr-composer" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
            {editing && (
                <div className="msgr-reply-strip">
                    <div>
                        <strong>Editing message</strong>
                        <span>{editing.text || 'Attachment'}</span>
                    </div>
                    <button className="msgr-icon-btn" onClick={() => { onCancelEdit?.(); reset(); }}>
                        <FontAwesomeIcon icon={faXmark} />
                    </button>
                </div>
            )}

            {replyTo && !editing && (
                <div className="msgr-reply-strip">
                    <div>
                        <strong>{replyTo.sender?.name || 'Message'}</strong>
                        <span>{replyTo.text || 'Attachment'}</span>
                    </div>
                    <button className="msgr-icon-btn" onClick={onCancelReply}>
                        <FontAwesomeIcon icon={faXmark} />
                    </button>
                </div>
            )}

            {files.length > 0 && (
                <div className="msgr-staged">
                    {files.map((f, i) => (
                        <div className="msgr-staged-item" key={`${f.name}-${i}`}>
                            {f.type?.startsWith('image/') && (
                                <img src={URL.createObjectURL(f)} alt={f.name} />
                            )}
                            <span>{f.name}</span>
                            <button onClick={() => removeFile(i)} title="Remove">
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="msgr-input-row">
                <AttachMenu
                    className="compact"
                    onFiles={stage}
                    allowVoiceNote
                    onBusyChange={setPreparing}
                />

                <textarea
                    ref={textRef}
                    rows={1}
                    value={text}
                    placeholder={editing ? 'Edit your message…' : 'Type a message'}
                    onChange={onChange}
                    onKeyDown={onKeyDown}
                    onPaste={onPaste}
                />

                {/* Straight to the mic without opening the menu — a voice note is
                    the one attachment people reach for mid-sentence. */}
                {!text.trim() && !files.length && !editing && (
                    <button
                        className="msgr-icon-btn"
                        onClick={() => setRecorder('audio')}
                        title="Record a voice note"
                    >
                        <FontAwesomeIcon icon={faMicrophone} />
                    </button>
                )}

                <button
                    className="msgr-send"
                    onClick={submit}
                    disabled={sending || preparing || (!text.trim() && !files.length)}
                    title="Send"
                >
                    <FontAwesomeIcon icon={faPaperPlane} />
                </button>

                {mentionQuery !== null && mentionMatches.length > 0 && (
                    <div className="msgr-mention-pop">
                        {mentionMatches.map((u, i) => (
                            <button
                                key={u._id}
                                className={i === mentionIndex ? 'active' : ''}
                                onMouseEnter={() => setMentionIndex(i)}
                                onClick={() => applyMention(u)}
                            >
                                <Avatar
                                    name={u.name}
                                    profilePic={u.profilePic}
                                    className="msgr-avatar"
                                />
                                <div>
                                    <div style={{ fontWeight: 500 }}>{u.name}</div>
                                    <div style={{ fontSize: 11.5, color: '#667781' }}>
                                        {u.jobTitle || u.role}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MessageComposer;
