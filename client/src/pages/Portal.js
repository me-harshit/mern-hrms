import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faLock, faTriangleExclamation, faHourglassHalf, faArrowRight,
    faCircleCheck, faCommentDots, faXmark, faCircleInfo, faDiagramProject
} from '@fortawesome/free-solid-svg-icons';

import portalApi, {
    setActiveSession, getPortalToken, setPortalToken, clearPortalToken
} from '../utils/portalApi';
import { SERVER_URL } from '../utils/api';
import Avatar from '../components/Avatar';
import MessageBubble from '../components/chat/MessageBubble';
import MessageComposer from '../components/chat/MessageComposer';
import GroupIcon from '../components/chat/GroupIcon';
import '../styles/messenger.css';
import '../styles/portal.css';

/**
 * The external participant's whole view of this company — feature draft
 * Module 2.
 *
 * Rendered outside ProtectedRoute and outside DashboardLayout, so there is no
 * sidebar, no topbar and no navigation anywhere on the page. That is not only
 * styling: a vendor who is shown a menu of Attendance, Payroll and Employees
 * will try one, and every one of them would be a 401 they have no way to read.
 * The page they get is one conversation, which is exactly what they were
 * granted (F2.3).
 *
 * There is no password and no account. Management asked for a link that opens
 * the conversation directly, so possession of the emailed link is the
 * credential; the optional verification code is the only thing that can stand
 * between the click and the thread, and only when the inviter asked for it.
 */

/**
 * The portal's message shape, mapped onto the one MessageBubble draws.
 *
 * Reusing the internal bubble is worth this small translation: attachments,
 * the image lightbox, the voice-note player, file-type icons, quoted replies
 * and deleted-message handling all come with it, and a second implementation
 * of any of them would drift from the first the first time one was fixed.
 *
 * The server never sends this page an employee's full record (see
 * utils/portalShape.js), so the fields being spread here are only ever a name
 * and a picture.
 */
const toBubble = (m) => ({
    ...m,
    sender: m.author?.external ? null : { name: m.author?.name, profilePic: m.author?.profilePic },
    externalSender: m.author?.external ? { name: m.author.name } : null,
    mentions: [],
    readBy: []
});

const daySeparator = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** A full-page message for every state that is not "you are in the chat". */
const Notice = ({ icon, title, children, tone = '' }) => (
    <div className="portal-shell">
        <div className={`portal-card notice ${tone}`}>
            <div className="portal-notice-icon"><FontAwesomeIcon icon={icon} /></div>
            <h2>{title}</h2>
            {children}
        </div>
    </div>
);

const Portal = () => {
    const { token: inviteToken } = useParams();

    // loading | gate | pending | chat | blocked
    const [phase, setPhase] = useState('loading');
    const [invite, setInvite] = useState(null);
    const [blocked, setBlocked] = useState({ title: '', detail: '' });

    const [code, setCode] = useState('');
    const [joining, setJoining] = useState(false);
    const [codeError, setCodeError] = useState('');

    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingThread, setLoadingThread] = useState(true);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [replyTo, setReplyTo] = useState(null);

    /*
     * The "you are an external participant" strip.
     *
     * Shown by default and dismissible for the visit rather than remembered:
     * it is the one thing on this page a first-time reader needs, and most
     * vendors open the link a handful of times over a project. Persisting the
     * dismissal would save a click and cost the explanation to the person who
     * comes back a month later having forgotten what this page is.
     */
    const [showStrip, setShowStrip] = useState(true);

    const threadRef = useRef(null);
    const socketRef = useRef(null);
    const meId = conversation?.me?._id;

    /* ------------------------------------------------------------------ *
     * Opening the link
     * ------------------------------------------------------------------ */

    const enterChat = useCallback((sessionToken, conversationPayload) => {
        setPortalToken(inviteToken, sessionToken);
        setActiveSession(sessionToken);
        setConversation(conversationPayload);
        setPhase('chat');
    }, [inviteToken]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            /*
             * A session from a previous visit is tried first, so somebody who
             * bookmarks the link is not re-joining every time they open it. If
             * it has been revoked or has expired the server says so and we fall
             * through to the invitation itself, which will explain why.
             */
            const saved = getPortalToken(inviteToken);
            if (saved) {
                setActiveSession(saved);
                try {
                    const res = await portalApi.get('/conversation');
                    if (cancelled) return;
                    setConversation(res.data);
                    setPhase('chat');
                    return;
                } catch {
                    clearPortalToken(inviteToken);
                    setActiveSession(null);
                }
            }

            try {
                const res = await portalApi.get(`/invite/${inviteToken}`);
                if (cancelled) return;
                setInvite(res.data);

                if (res.data.revoked) {
                    setBlocked({
                        title: 'This invitation has been withdrawn',
                        detail: 'Your contact at the company can send you a new one if you still need access.'
                    });
                    setPhase('blocked');
                } else if (res.data.expired) {
                    setBlocked({
                        title: 'This invitation has expired',
                        detail: 'Invitation links stop working after a set time. Ask your contact to send a fresh one.'
                    });
                    setPhase('blocked');
                } else if (res.data.status === 'pending') {
                    setPhase('pending');
                } else {
                    setPhase('gate');
                }
            } catch (err) {
                if (cancelled) return;
                setBlocked({
                    title: 'This link is not valid',
                    detail: err.response?.data?.message
                        || 'Check that you copied the whole link from your email.'
                });
                setPhase('blocked');
            }
        })();

        return () => { cancelled = true; };
    }, [inviteToken]);

    const join = async () => {
        setJoining(true);
        setCodeError('');
        try {
            const res = await portalApi.post(`/invite/${inviteToken}/join`,
                invite?.requiresCode ? { code: code.trim() } : {});

            // 202 — an approval-gated invitation (F2.2). No session yet.
            if (res.status === 202) {
                setPhase('pending');
                return;
            }
            enterChat(res.data.token, res.data.conversation);
        } catch (err) {
            const status = err.response?.status;
            const message = err.response?.data?.message || 'Could not open the conversation.';
            if (status === 401 || status === 429) {
                setCodeError(message);
            } else {
                setBlocked({ title: 'Cannot open this conversation', detail: message });
                setPhase('blocked');
            }
        } finally {
            setJoining(false);
        }
    };

    /* ------------------------------------------------------------------ *
     * The thread
     * ------------------------------------------------------------------ */

    const scrollToBottom = (behavior = 'auto') => {
        requestAnimationFrame(() => {
            const el = threadRef.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior });
        });
    };

    useEffect(() => {
        if (phase !== 'chat') return;
        let cancelled = false;

        (async () => {
            setLoadingThread(true);
            try {
                const res = await portalApi.get('/messages');
                if (cancelled) return;
                setMessages(res.data.messages);
                setHasMore(res.data.hasMore);
                scrollToBottom();
                portalApi.post('/read').catch(() => { });
            } catch (err) {
                if (cancelled) return;
                setBlocked({
                    title: 'Your access has ended',
                    detail: err.response?.data?.message
                        || 'This conversation is no longer available to you.'
                });
                setPhase('blocked');
            } finally {
                if (!cancelled) setLoadingThread(false);
            }
        })();

        return () => { cancelled = true; };
    }, [phase]);

    const loadOlder = async () => {
        if (!messages.length || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await portalApi.get('/messages', {
                params: { before: messages[0].createdAt }
            });
            const el = threadRef.current;
            const before = el?.scrollHeight || 0;
            setMessages((prev) => [...res.data.messages, ...prev]);
            setHasMore(res.data.hasMore);
            // Hold the reading position rather than jumping to the top of the
            // page the moment older messages are spliced in above.
            requestAnimationFrame(() => {
                if (el) el.scrollTop = el.scrollHeight - before;
            });
        } catch {
            /* the older page simply does not arrive */
        } finally {
            setLoadingMore(false);
        }
    };

    /* Live updates over the participant's own socket session. */
    useEffect(() => {
        if (phase !== 'chat' || !conversation) return undefined;

        const sessionToken = getPortalToken(inviteToken);
        if (!sessionToken) return undefined;

        const socket = io(SERVER_URL || window.location.origin, {
            auth: { token: sessionToken },
            transports: ['websocket', 'polling']
        });
        socketRef.current = socket;

        socket.on('connect', () => socket.emit('conversation:join', conversation._id));

        socket.on('message:new', (m) => {
            setMessages((prev) => (prev.some((x) => x._id === m._id) ? prev : [...prev, m]));
            scrollToBottom('smooth');
            portalApi.post('/read').catch(() => { });
        });

        socket.on('message:edited', (m) => {
            setMessages((prev) => prev.map((x) => (x._id === m._id ? m : x)));
        });

        socket.on('message:deleted', ({ _id }) => {
            // Mirrors what the server already withholds: the row stays so the
            // thread keeps its shape, the words do not.
            setMessages((prev) => prev.map((x) => (
                x._id === _id
                    ? { ...x, deletedAt: new Date().toISOString(), text: '', attachments: [] }
                    : x
            )));
        });

        socket.on('external:revoked', (payload) => {
            if (String(payload.participantId) !== String(meId)) return;
            clearPortalToken(inviteToken);
            setBlocked({
                title: 'Your access has been withdrawn',
                detail: 'You can no longer read or reply in this conversation.'
            });
            setPhase('blocked');
        });

        return () => {
            socket.emit('conversation:leave', conversation._id);
            socket.disconnect();
            socketRef.current = null;
        };
    }, [phase, conversation, inviteToken, meId]);

    const send = async ({ text, files, audioMeta, replyToId }) => {
        const form = new FormData();
        form.append('text', text || '');
        if (replyToId) form.append('replyToId', replyToId);
        (files || []).forEach((f) => form.append('attachments', f));
        if (audioMeta) {
            form.append('durationMs', audioMeta.durationMs || 0);
            form.append('waveform', JSON.stringify(audioMeta.waveform || []));
        }

        const res = await portalApi.post('/messages', form, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        setMessages((prev) => (prev.some((m) => m._id === res.data._id)
            ? prev
            : [...prev, res.data]));
        setReplyTo(null);
        scrollToBottom('smooth');
    };

    /* ------------------------------------------------------------------ *
     * Render
     * ------------------------------------------------------------------ */

    if (phase === 'loading') {
        return (
            <div className="portal-shell">
                <div className="portal-card notice">
                    <div className="portal-spinner" />
                    <p>Opening your conversation…</p>
                </div>
            </div>
        );
    }

    if (phase === 'blocked') {
        return (
            <Notice icon={faTriangleExclamation} title={blocked.title} tone="warn">
                <p>{blocked.detail}</p>
            </Notice>
        );
    }

    if (phase === 'pending') {
        return (
            <Notice icon={faHourglassHalf} title="Waiting for approval">
                <p>
                    Your request to join
                    {invite?.groupName ? <strong> {invite.groupName}</strong> : ' this conversation'}
                    {' '}has been sent to {invite?.invitedByName || 'your contact'}.
                </p>
                <p className="portal-muted">
                    You will be able to open this link once it is approved. Nothing else is
                    needed from you — keep the link and try again shortly.
                </p>
            </Notice>
        );
    }

    if (phase === 'gate') {
        return (
            <div className="portal-shell">
                <div className="portal-card">
                    <div className="portal-brand">GTS</div>
                    <p className="portal-eyebrow">You have been invited</p>
                    <h2>
                        {invite.invitedByName} invited you to
                        <span className="portal-group">{invite.groupName}</span>
                    </h2>
                    {invite.projectName && (
                        <span className="portal-chip">
                            <FontAwesomeIcon icon={faDiagramProject} />
                            {invite.projectName}
                        </span>
                    )}

                    <p className="portal-intro">
                        Hello {invite.name}. This link opens one conversation with the team,
                        so you can talk to them and share files directly. There is no account
                        to create and no password to remember.
                    </p>

                    {invite.requiresCode && (
                        <>
                            <label className="portal-label">
                                Enter the six-digit code from your invitation email
                            </label>
                            <input
                                className="portal-code"
                                value={code}
                                inputMode="numeric"
                                maxLength={6}
                                autoFocus
                                placeholder="000000"
                                onChange={(e) => {
                                    setCode(e.target.value.replace(/\D/g, ''));
                                    setCodeError('');
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') join(); }}
                            />
                        </>
                    )}

                    {codeError && <p className="portal-error">{codeError}</p>}

                    <button
                        className="portal-primary"
                        onClick={join}
                        disabled={joining || (invite.requiresCode && code.length !== 6)}
                    >
                        {joining ? 'Opening…' : (
                            <>
                                {invite.requiresApproval ? 'Request access' : 'Open the conversation'}
                                <FontAwesomeIcon icon={faArrowRight} />
                            </>
                        )}
                    </button>

                    <p className="portal-foot">
                        <FontAwesomeIcon icon={faLock} />
                        You will only be able to see this one conversation.
                    </p>
                </div>
            </div>
        );
    }

    /* ---------------------------- the chat ---------------------------- */
    let lastDay = null;

    const team = conversation.members || [];
    const faces = team.slice(0, 4);
    const moreFaces = team.length - faces.length;

    return (
        <div className="portal-chat">
            <div className="portal-frame">
                <header className="portal-head">
                    <GroupIcon
                        conversation={{ name: conversation.name, avatar: conversation.avatar }}
                        className="msgr-avatar"
                    />
                    <div className="portal-head-body">
                        <h1>{conversation.name}</h1>
                        <div className="portal-head-sub">
                            {conversation.projectName && (
                                <>
                                    <span>{conversation.projectName}</span>
                                    <i className="portal-dot" />
                                </>
                            )}
                            <span>
                                {team.length} {team.length === 1 ? 'person' : 'people'} from the team
                            </span>
                        </div>
                    </div>

                    {/* Who is on the other side. A vendor writing into what looks
                        like an empty inbox has no idea whether anyone is there. */}
                    {faces.length > 0 && (
                        <div className="portal-faces">
                            {faces.map((u) => (
                                <Avatar
                                    key={u._id}
                                    name={u.name}
                                    profilePic={u.profilePic}
                                    className="msgr-avatar"
                                />
                            ))}
                            {moreFaces > 0 && (
                                <div className="portal-faces-more">+{moreFaces}</div>
                            )}
                        </div>
                    )}

                    <div className="portal-you">
                        <span className="ext-badge">External</span>
                        <span className="portal-you-name">{conversation.me.name}</span>
                    </div>
                </header>

                {showStrip && (
                    <div className="portal-strip">
                        <FontAwesomeIcon icon={faCircleInfo} />
                        <p>
                            You are in this conversation as an external participant. You can see
                            messages from the point you were invited, and everyone here can see
                            that you are from outside the company.
                        </p>
                        <button onClick={() => setShowStrip(false)} title="Dismiss">
                            <FontAwesomeIcon icon={faXmark} />
                        </button>
                    </div>
                )}

                <div className="msgr-thread portal-thread" ref={threadRef}>
                    {loadingThread && (
                        <div className="portal-empty">
                            <div className="portal-spinner" />
                            <p>Loading the conversation…</p>
                        </div>
                    )}

                    {!loadingThread && hasMore && (
                        <button className="msgr-load-more" onClick={loadOlder} disabled={loadingMore}>
                            {loadingMore ? 'Loading…' : 'Load earlier messages'}
                        </button>
                    )}

                    {!loadingThread && !messages.length && (
                        <div className="portal-empty">
                            <div className="portal-empty-icon">
                                <FontAwesomeIcon icon={faCommentDots} />
                            </div>
                            <h3>No messages yet</h3>
                            <p>
                                Say hello, ask a question, or attach a file — the team at GTS
                                will see it straight away.
                            </p>
                        </div>
                    )}

                    {messages.map((m) => {
                        const day = daySeparator(m.createdAt);
                        const showDay = day !== lastDay;
                        lastDay = day;

                        const mine = Boolean(m.author?.external
                            && String(m.author.externalId) === String(meId));

                        return (
                            <React.Fragment key={m._id}>
                                {showDay && <div className="msgr-daysep">{day}</div>}
                                <MessageBubble
                                    id={`m-${m._id}`}
                                    message={toBubble(m)}
                                    mine={mine}
                                    showAuthor
                                    firstOfRun
                                    memberCount={0}
                                    onReply={setReplyTo}
                                />
                            </React.Fragment>
                        );
                    })}
                </div>

                <div className="portal-composer">
                    <MessageComposer
                        conversation={conversation}
                        /* No mentions: @-tagging a colleague would need the employee
                           directory, which an outsider does not get to have. */
                        members={[]}
                        replyTo={replyTo ? toBubble(replyTo) : null}
                        onCancelReply={() => setReplyTo(null)}
                        onSend={send}
                    />
                    <p className="portal-composer-note">
                        <FontAwesomeIcon icon={faCircleCheck} />
                        Messages and files you send here go to the project team at GTS.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Portal;
