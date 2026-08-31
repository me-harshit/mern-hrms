import React, { useState, useEffect, useRef, useCallback } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowLeft, faEye, faEyeSlash, faCircleInfo
} from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';
import { getSocket, onSocket } from '../../utils/socket';
import EmployeeAvatar from '../EmployeeAvatar';
import GroupIcon from './GroupIcon';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';

/**
 * The right pane: one open conversation.
 *
 * Owns the message list, the socket subscription for this thread, and the
 * read-state round trip. The parent owns the conversation list, so anything
 * that changes the sidebar (a new message, a rename) is passed back up rather
 * than duplicated here.
 */

const daySeparator = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const ChatWindow = ({
    conversation,
    myId,
    myRole,
    onBack,
    onToggleInfo,
    onConversationChanged
}) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [replyTo, setReplyTo] = useState(null);
    const [editing, setEditing] = useState(null);
    const [typingNames, setTypingNames] = useState([]);

    const threadRef = useRef(null);
    const bottomRef = useRef(null);
    // Whether the user is parked at the bottom. A new message must not yank the
    // view down while someone is reading back through history.
    const atBottomRef = useRef(true);

    const conversationId = conversation?._id;

    /* --------------------------- loading messages --------------------------- */

    const load = useCallback(async () => {
        if (!conversationId) return;
        setLoading(true);
        try {
            const res = await api.get(`/conversations/${conversationId}/messages`);
            setMessages(res.data.messages || []);
            setHasMore(Boolean(res.data.hasMore));
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not load messages.', 'error');
        } finally {
            setLoading(false);
        }
    }, [conversationId]);

    useEffect(() => {
        setMessages([]);
        setReplyTo(null);
        setEditing(null);
        setTypingNames([]);
        atBottomRef.current = true;
        load();
    }, [conversationId, load]);

    const loadOlder = async () => {
        if (!messages.length || loadingMore) return;
        setLoadingMore(true);

        const thread = threadRef.current;
        const prevHeight = thread?.scrollHeight || 0;

        try {
            const res = await api.get(`/conversations/${conversationId}/messages`, {
                params: { before: messages[0].createdAt }
            });
            setMessages((prev) => [...(res.data.messages || []), ...prev]);
            setHasMore(Boolean(res.data.hasMore));

            // Keep the reader's eye where it was: prepending content otherwise
            // shifts everything they were reading off the top of the pane.
            requestAnimationFrame(() => {
                if (thread) thread.scrollTop = thread.scrollHeight - prevHeight;
            });
        } catch {
            /* leaving the thread as it was is the right failure here */
        } finally {
            setLoadingMore(false);
        }
    };

    /* ------------------------------- realtime ------------------------------- */

    useEffect(() => {
        if (!conversationId) return;
        const socket = getSocket();
        socket?.emit('conversation:join', conversationId);

        const offNew = onSocket('message:new', (msg) => {
            if (String(msg.conversationId) !== String(conversationId)) return;
            setMessages((prev) => (
                // The sender already has this from the POST response; the echo
                // would otherwise render it twice.
                prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]
            ));
        });

        const offEdit = onSocket('message:edited', (msg) => {
            if (String(msg.conversationId) !== String(conversationId)) return;
            setMessages((prev) => prev.map((m) => (m._id === msg._id ? msg : m)));
        });

        const offDelete = onSocket('message:deleted', ({ _id, conversationId: cid }) => {
            if (String(cid) !== String(conversationId)) return;
            setMessages((prev) => prev.map((m) => (
                m._id === _id
                    ? { ...m, deletedAt: new Date().toISOString(), text: '', attachments: [] }
                    : m
            )));
        });

        const offRead = onSocket('message:read', ({ conversationId: cid, userId, at }) => {
            if (String(cid) !== String(conversationId)) return;
            setMessages((prev) => prev.map((m) => (
                (m.readBy || []).some((r) => String(r.user) === String(userId))
                    ? m
                    : { ...m, readBy: [...(m.readBy || []), { user: userId, at }] }
            )));
        });

        const offTyping = onSocket('conversation:typing', ({ conversationId: cid, name, typing }) => {
            if (String(cid) !== String(conversationId) || !name) return;
            setTypingNames((prev) => {
                if (typing) return prev.includes(name) ? prev : [...prev, name];
                return prev.filter((n) => n !== name);
            });
        });

        return () => {
            socket?.emit('conversation:leave', conversationId);
            offNew(); offEdit(); offDelete(); offRead(); offTyping();
        };
    }, [conversationId]);

    // A typing indicator that never clears is worse than none — drop stale ones.
    useEffect(() => {
        if (!typingNames.length) return;
        const t = setTimeout(() => setTypingNames([]), 5000);
        return () => clearTimeout(t);
    }, [typingNames]);

    /* ---------------------------- scroll & read ---------------------------- */

    useEffect(() => {
        if (atBottomRef.current) {
            bottomRef.current?.scrollIntoView({ block: 'end' });
        }
    }, [messages]);

    const onScroll = () => {
        const el = threadRef.current;
        if (!el) return;
        atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };

    // Mark read once the thread has actually been rendered to the person.
    useEffect(() => {
        if (!conversationId || loading || !messages.length) return;
        const t = setTimeout(async () => {
            try {
                await api.post(`/conversations/${conversationId}/read`);
                onConversationChanged?.({ _id: conversationId, unread: 0 });
            } catch { /* a failed read receipt is not worth surfacing */ }
        }, 600);
        return () => clearTimeout(t);
    }, [conversationId, loading, messages.length, onConversationChanged]);

    /* ------------------------------- actions ------------------------------- */

    const send = async ({ text, files, audioMeta, mentions, replyToId }) => {
        const data = new FormData();
        data.append('text', text);
        files.forEach((f) => data.append('attachments', f));
        if (audioMeta) {
            data.append('waveform', JSON.stringify(audioMeta.waveform || []));
            data.append('durationMs', String(audioMeta.durationMs || 0));
        }
        if (mentions?.length) data.append('mentions', JSON.stringify(mentions));
        if (replyToId) data.append('replyToId', replyToId);

        const res = await api.post(`/conversations/${conversationId}/messages`, data, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        atBottomRef.current = true;
        setMessages((prev) => (
            prev.some((m) => m._id === res.data._id) ? prev : [...prev, res.data]
        ));
        onConversationChanged?.({ _id: conversationId, bump: true, lastMessage: res.data });
    };

    const saveEdit = async (message, text) => {
        try {
            const res = await api.put(
                `/conversations/${conversationId}/messages/${message._id}`,
                { text }
            );
            setMessages((prev) => prev.map((m) => (m._id === message._id ? res.data : m)));
            setEditing(null);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not edit the message.', 'error');
        }
    };

    const remove = async (message) => {
        const ok = await Swal.fire({
            title: 'Delete this message?',
            text: 'It will be removed for everyone in this chat.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            confirmButtonText: 'Delete'
        });
        if (!ok.isConfirmed) return;

        try {
            await api.delete(`/conversations/${conversationId}/messages/${message._id}`);
            setMessages((prev) => prev.map((m) => (
                m._id === message._id
                    ? { ...m, deletedAt: new Date().toISOString(), text: '', attachments: [] }
                    : m
            )));
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not delete it.', 'error');
        }
    };

    const jumpTo = (messageId) => {
        const el = document.getElementById(`msg-${messageId}`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'background .4s';
        el.style.background = 'rgba(18,140,126,.12)';
        setTimeout(() => { el.style.background = ''; }, 1200);
    };

    const emitTyping = (typing) => {
        getSocket()?.emit('conversation:typing', {
            conversationId,
            name: conversation.myName,
            typing
        });
    };

    /** Join or leave a group silently (F3.10). Admin only. */
    const toggleOversight = async () => {
        const joining = !conversation.isMember;
        try {
            await api.post(`/conversations/${conversationId}/oversight`, { hidden: joining });
            onConversationChanged?.({ _id: conversationId, refetch: true });
            Swal.fire(
                joining ? 'Watching' : 'Stopped',
                joining
                    ? 'You can now post here. You are not shown in the member list, and this access is logged.'
                    : 'You are no longer watching this conversation.',
                'success'
            );
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not update oversight.', 'error');
        }
    };

    if (!conversation) return null;

    const isGroup = conversation.kind === 'group';
    const members = conversation.members || [];
    const subtitle = isGroup
        ? members.map((m) => m.user?.name).filter(Boolean).slice(0, 6).join(', ')
        : (conversation.otherUser?.jobTitle || conversation.otherUser?.role || '');

    let lastDay = null;
    let lastSender = null;

    return (
        <div className="msgr-main">
            <div className="msgr-main-head">
                <button className="msgr-icon-btn msgr-back-btn" onClick={onBack} title="Back">
                    <FontAwesomeIcon icon={faArrowLeft} />
                </button>

                {isGroup ? (
                    <GroupIcon conversation={conversation} className="msgr-avatar" />
                ) : (
                    <EmployeeAvatar
                        person={conversation.otherUser || {
                            name: conversation.title,
                            profilePic: conversation.avatarUrl
                        }}
                        className="msgr-avatar"
                    />
                )}

                <div className="msgr-main-title" onClick={onToggleInfo}>
                    <strong>{conversation.title}</strong>
                    <div className="msgr-main-sub">
                        {typingNames.length > 0 ? (
                            <span className="msgr-typing">
                                {typingNames.slice(0, 2).join(', ')} {typingNames.length > 1 ? 'are' : 'is'} typing…
                            </span>
                        ) : subtitle}
                    </div>
                </div>

                <button className="msgr-icon-btn" onClick={onToggleInfo} title="Details">
                    <FontAwesomeIcon icon={faCircleInfo} />
                </button>
            </div>

            {/* Only an ADMIN ever sees this strip; ordinary members are always
                members, and the server refuses oversight to everyone else. */}
            {myRole === 'ADMIN' && (!conversation.isMember || conversation.myHidden) && (
                <div className="msgr-oversight-bar">
                    <FontAwesomeIcon icon={conversation.isMember ? faEyeSlash : faEye} />
                    {conversation.isMember
                        ? 'You are in this chat silently — members cannot see you here. This access is logged.'
                        : 'Oversight view. You are reading a conversation you are not a member of; this is logged.'}
                    <button onClick={toggleOversight}>
                        {conversation.isMember ? 'Stop watching' : 'Watch silently'}
                    </button>
                </div>
            )}

            <div className="msgr-thread" ref={threadRef} onScroll={onScroll}>
                {hasMore && (
                    <button className="msgr-load-more" onClick={loadOlder} disabled={loadingMore}>
                        {loadingMore ? 'Loading…' : 'Load earlier messages'}
                    </button>
                )}

                {loading && <div className="msgr-empty">Loading…</div>}

                {!loading && !messages.length && (
                    <div className="msgr-empty">No messages yet. Say hello.</div>
                )}

                {messages.map((m) => {
                    const day = daySeparator(m.createdAt);
                    const showDay = day !== lastDay;
                    lastDay = day;

                    const senderId = m.sender?._id || m.sender;
                    const mine = String(senderId) === String(myId);
                    const firstOfRun = String(senderId) !== String(lastSender);
                    lastSender = senderId;

                    /*
                     * Mirrors the server's rule exactly (canManage returns
                     * false for a direct chat). Without the isGroup guard an
                     * admin saw a delete button on the other person's messages
                     * in their OWN DMs and got a 403 for pressing it — nobody
                     * moderates a private two-person conversation.
                     */
                    const canDelete = mine || (isGroup && (
                        conversation.myRole === 'owner'
                        || conversation.myRole === 'admin'
                        || myRole === 'ADMIN'
                        || myRole === 'HR'
                    ));

                    return (
                        <React.Fragment key={m._id}>
                            {showDay && <div className="msgr-daysep">{day}</div>}
                            {/* No wrapper element here: the bubble must be a
                                direct child of the flex column for align-self
                                to put it on the correct side. */}
                            <MessageBubble
                                id={`msg-${m._id}`}
                                message={m}
                                mine={mine}
                                showAuthor={isGroup && firstOfRun}
                                firstOfRun={firstOfRun}
                                memberCount={members.length}
                                onReply={setReplyTo}
                                onEdit={setEditing}
                                onDelete={canDelete ? remove : null}
                                onJumpTo={jumpTo}
                            />
                        </React.Fragment>
                    );
                })}

                <div ref={bottomRef} />
            </div>

            <MessageComposer
                conversation={conversation}
                members={members}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                editing={editing}
                onCancelEdit={() => setEditing(null)}
                onSend={send}
                onSaveEdit={saveEdit}
                onTyping={emitTyping}
                disabled={!conversation.isMember}
                disabledReason="You are reading this as an admin. Choose “Watch silently” above to post here."
            />
        </div>
    );
};

export default ChatWindow;
