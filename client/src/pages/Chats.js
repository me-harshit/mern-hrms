import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faMagnifyingGlass, faPenToSquare, faUserGroup,
    faComments, faXmark, faShieldHalved
} from '@fortawesome/free-solid-svg-icons';

import api from '../utils/api';
import { getSocket, onSocket } from '../utils/socket';
import ConversationList, { stamp } from '../components/chat/ConversationList';
import ChatWindow from '../components/chat/ChatWindow';
import GroupInfoPanel from '../components/chat/GroupInfoPanel';
import NewGroupModal from '../components/chat/NewGroupModal';
import PeoplePicker from '../components/chat/PeoplePicker';
import ChatContextMenu from '../components/chat/ChatContextMenu';
import EmployeeAvatar from '../components/EmployeeAvatar';
import '../styles/messenger.css';

/**
 * Groups & internal chat — feature draft Module 3.
 *
 * Owns the conversation list and which one is open; ChatWindow owns the
 * messages inside it. The split matters because the list has to keep updating
 * for conversations that are *not* open — that is what the unread badge is —
 * so its socket subscription lives here rather than in the window.
 */

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'groups', label: 'Groups' },
    { key: 'projects', label: 'Projects' },
    { key: 'direct', label: 'Direct' },
    { key: 'people', label: 'People' }
];

const Chats = () => {
    const { id: routeId, token: joinToken } = useParams();
    const navigate = useNavigate();

    const me = JSON.parse(localStorage.getItem('user') || '{}');
    const myId = me?._id || me?.id;
    const myRole = me?.role;

    const [conversations, setConversations] = useState([]);
    const [activeId, setActiveId] = useState(routeId || null);
    const [active, setActive] = useState(null);
    const [loading, setLoading] = useState(true);

    const [filter, setFilter] = useState('all');
    const [listQuery, setListQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState([]);

    // The employee directory, shown under the People tab. Loaded lazily: most
    // visits never open that tab, and it is the one list here that can run to
    // hundreds of rows.
    const [contacts, setContacts] = useState([]);
    const [contactsLoaded, setContactsLoaded] = useState(false);

    const [showInfo, setShowInfo] = useState(false);
    const [showNewGroup, setShowNewGroup] = useState(false);
    const [showNewChat, setShowNewChat] = useState(false);
    const [oversightMode, setOversightMode] = useState(false);
    // { x, y, conversation } while a right-click menu is open on a list row.
    const [ctxMenu, setCtxMenu] = useState(null);

    const activeIdRef = useRef(activeId);
    useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

    /* ----------------------------- loading ----------------------------- */

    const loadList = useCallback(async () => {
        try {
            const url = oversightMode ? '/conversations/oversight' : '/conversations';
            const res = await api.get(url);
            setConversations(res.data || []);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not load your chats.', 'error');
        } finally {
            setLoading(false);
        }
    }, [oversightMode]);

    useEffect(() => { loadList(); }, [loadList]);

    const loadActive = useCallback(async (id) => {
        if (!id) { setActive(null); return; }
        try {
            const res = await api.get(`/conversations/${id}`);
            setActive({ ...res.data, myName: me?.name });
        } catch (err) {
            setActive(null);
            setActiveId(null);
            Swal.fire('Error', err.response?.data?.message || 'Could not open that chat.', 'error');
        }
        // `me.name` is read from localStorage once at mount and never changes
        // during a session, so it does not belong in the dependency list.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { loadActive(activeId); }, [activeId, loadActive]);

    // Deep link: /chats/:id — the target of a chat notification.
    useEffect(() => {
        if (routeId && routeId !== activeId) setActiveId(routeId);
    }, [routeId, activeId]);

    /* --------------------------- join by link --------------------------- */

    useEffect(() => {
        if (!joinToken) return;
        (async () => {
            try {
                const res = await api.post(`/conversations/join/${joinToken}`);
                await loadList();
                navigate(`/chats/${res.data._id}`, { replace: true });
            } catch (err) {
                Swal.fire('Error', err.response?.data?.message || 'That invite link did not work.', 'error');
                navigate('/chats', { replace: true });
            }
        })();
    }, [joinToken, navigate, loadList]);

    /* ------------------------------ realtime ------------------------------ */

    useEffect(() => {
        getSocket();

        // A message in a conversation that is NOT open: bump it to the top of
        // the list and raise its badge. The open one is handled by ChatWindow,
        // which also clears the badge by marking it read.
        const offActivity = onSocket('conversation:activity', (payload) => {
            const cid = String(payload.conversationId);
            const isOpen = String(activeIdRef.current) === cid;

            setConversations((prev) => {
                const idx = prev.findIndex((c) => String(c._id) === cid);
                if (idx === -1) {
                    // A conversation we have never seen — usually a first DM.
                    loadList();
                    return prev;
                }
                const next = [...prev];
                const [row] = next.splice(idx, 1);
                next.unshift({
                    ...row,
                    lastMessage: {
                        ...payload.lastMessage,
                        senderName: payload.senderName,
                        at: payload.at
                    },
                    lastActivityAt: payload.at,
                    unread: isOpen ? 0 : (row.unread || 0) + 1
                });
                return next;
            });
        });

        const offNew = onSocket('conversation:new', () => loadList());
        const offUpdated = onSocket('conversation:updated', (payload) => {
            setConversations((prev) => prev.map((c) => (
                String(c._id) === String(payload._id) ? { ...c, ...payload, unread: c.unread } : c
            )));
            if (String(activeIdRef.current) === String(payload._id)) loadActive(payload._id);
        });

        const offRemoved = onSocket('conversation:removed', ({ _id }) => {
            setConversations((prev) => prev.filter((c) => String(c._id) !== String(_id)));
            if (String(activeIdRef.current) === String(_id)) {
                setActiveId(null);
                setActive(null);
            }
        });

        return () => { offActivity(); offNew(); offUpdated(); offRemoved(); };
    }, [loadList, loadActive]);

    useEffect(() => {
        if (filter !== 'people' || contactsLoaded) return;
        api.get('/conversations/contacts')
            .then((res) => { setContacts(res.data || []); setContactsLoaded(true); })
            .catch(() => setContactsLoaded(true));
    }, [filter, contactsLoaded]);

    /* ------------------------------- search ------------------------------- */

    useEffect(() => {
        if (!searching || listQuery.trim().length < 2) { setResults([]); return; }
        let cancelled = false;

        const t = setTimeout(async () => {
            try {
                const res = await api.get('/conversations/search', {
                    params: { q: listQuery.trim() }
                });
                if (!cancelled) setResults(res.data || []);
            } catch {
                if (!cancelled) setResults([]);
            }
        }, 300);

        return () => { cancelled = true; clearTimeout(t); };
    }, [listQuery, searching]);

    /* ------------------------------- actions ------------------------------- */

    const openConversation = (c) => {
        setActiveId(c._id);
        setShowInfo(false);
        navigate(`/chats/${c._id}`, { replace: true });
    };

    const startDirect = async (ids) => {
        try {
            const res = await api.post('/conversations/direct', { userId: ids[0] });
            setShowNewChat(false);
            await loadList();
            openConversation(res.data);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not open that chat.', 'error');
        }
    };

    const onGroupCreated = async (group) => {
        setShowNewGroup(false);
        await loadList();
        openConversation(group);
    };

    /**
     * Applied when a child changes something the list also shows. `refetch`
     * means "I changed membership, re-read from the server" — cheaper to do
     * once here than to reconcile a member array in three components.
     */
    const onConversationChanged = useCallback((patch) => {
        if (!patch) return;

        if (patch.refetch) {
            loadList();
            loadActive(patch._id || activeIdRef.current);
            return;
        }

        if (patch.unread === 0) {
            setConversations((prev) => prev.map((c) => (
                String(c._id) === String(patch._id) ? { ...c, unread: 0 } : c
            )));
            return;
        }

        if (patch.bump) {
            setConversations((prev) => {
                const idx = prev.findIndex((c) => String(c._id) === String(patch._id));
                if (idx === -1) return prev;
                const next = [...prev];
                const [row] = next.splice(idx, 1);
                next.unshift({ ...row, lastActivityAt: new Date().toISOString() });
                return next;
            });
            return;
        }

        // A full conversation document came back (rename, membership change).
        setConversations((prev) => prev.map((c) => (
            String(c._id) === String(patch._id) ? { ...c, ...patch, unread: c.unread } : c
        )));
        if (String(activeIdRef.current) === String(patch._id)) {
            setActive((prev) => ({ ...prev, ...patch }));
        }
    }, [loadList, loadActive]);

    /**
     * Close chat — take it out of my list until it next moves. Membership and
     * history are untouched, so it returns by itself on the next message.
     */
    const closeChat = async (c) => {
        try {
            await api.post(`/conversations/${c._id}/close`, { closed: true });
            setConversations((prev) => prev.filter((x) => String(x._id) !== String(c._id)));
            if (String(activeIdRef.current) === String(c._id)) {
                setActiveId(null);
                setActive(null);
                navigate('/chats', { replace: true });
            }
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not close the chat.', 'error');
        }
    };

    /**
     * Clear chat — hide the history from me alone.
     *
     * The wording is deliberate: people arrive expecting WhatsApp's clear, and
     * they should not have to discover from the result that this one does not
     * remove anything for the other person.
     */
    const clearChat = async (c) => {
        const ok = await Swal.fire({
            title: `Clear this chat?`,
            text: 'The messages will be hidden from your view only. Everyone else keeps their copy, and nothing is removed from the company record.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            confirmButtonText: 'Clear for me'
        });
        if (!ok.isConfirmed) return;

        try {
            await api.post(`/conversations/${c._id}/clear`);
            setConversations((prev) => prev.map((x) => (
                String(x._id) === String(c._id)
                    ? { ...x, unread: 0, lastMessage: { ...x.lastMessage, text: '' } }
                    : x
            )));
            // Force the open thread to re-read, so it empties immediately
            // rather than showing history the server will no longer serve.
            if (String(activeIdRef.current) === String(c._id)) loadActive(c._id);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not clear the chat.', 'error');
        }
    };

    const toggleMute = async (c) => {
        try {
            const res = await api.put(`/conversations/${c._id}/mute`, { muted: !c.muted });
            setConversations((prev) => prev.map((x) => (
                String(x._id) === String(c._id) ? { ...x, muted: res.data.muted } : x
            )));
        } catch {
            Swal.fire('Error', 'Could not update notifications.', 'error');
        }
    };

    const onLeft = (id) => {
        setConversations((prev) => prev.filter((c) => String(c._id) !== String(id)));
        setActiveId(null);
        setActive(null);
        setShowInfo(false);
        navigate('/chats', { replace: true });
    };

    /* ------------------------------ filtering ------------------------------ */

    /*
     * The DM I already have with each colleague, keyed by their user id.
     *
     * Built from the conversation list that is already loaded rather than
     * fetched again — the People tab needs the same previews the All tab shows,
     * and the data for them is sitting in state.
     */
    const directByUser = React.useMemo(() => {
        const map = new Map();
        for (const c of conversations) {
            if (c.kind !== 'direct') continue;
            const other = c.otherUser?._id
                || c.members?.find((m) => String(m.user?._id || m.user) !== String(myId))?.user?._id;
            if (other) map.set(String(other), c);
        }
        return map;
    }, [conversations, myId]);

    // The search box at the top filters whichever list is on screen, so it
    // narrows the directory under the People tab exactly as it narrows chats.
    const people = contacts.filter((p) => {
        if (!listQuery) return true;
        const q = listQuery.toLowerCase();
        return [p.name, p.employeeId, p.department, p.jobTitle]
            .filter(Boolean)
            .some((f) => f.toLowerCase().includes(q));
    });

    const visible = conversations.filter((c) => {
        if (listQuery && !searching) {
            const title = (c.title || c.name || '').toLowerCase();
            if (!title.includes(listQuery.toLowerCase())) return false;
        }
        if (filter === 'unread') return c.unread > 0;
        if (filter === 'groups') return c.kind === 'group';
        if (filter === 'projects') return c.groupType === 'project';
        if (filter === 'direct') return c.kind === 'direct';
        // 'people' renders the directory instead of this list, never reaching here.
        return true;
    });

    return (
        <div className={`msgr ${activeId ? 'has-open' : ''}`}>
            {/* ------------------------------ LEFT ------------------------------ */}
            <div className="msgr-sidebar">
                <div className="msgr-sidebar-head">
                    <div className="msgr-sidebar-title">
                        <h3>{oversightMode ? 'All conversations' : 'Chats'}</h3>
                        <div className="msgr-head-actions">
                            {myRole === 'ADMIN' && (
                                <button
                                    className={`msgr-icon-btn ${oversightMode ? 'is-on' : ''}`}
                                    onClick={() => { setOversightMode((o) => !o); setActiveId(null); }}
                                    title="Oversight — every conversation in the company"
                                >
                                    <FontAwesomeIcon icon={faShieldHalved} />
                                </button>
                            )}
                            <button
                                className={`msgr-icon-btn ${searching ? 'is-on' : ''}`}
                                onClick={() => { setSearching((s) => !s); setListQuery(''); }}
                                title="Search messages"
                            >
                                <FontAwesomeIcon icon={searching ? faXmark : faMagnifyingGlass} />
                            </button>
                            <button
                                className="msgr-icon-btn"
                                onClick={() => setShowNewChat(true)}
                                title="New chat"
                            >
                                <FontAwesomeIcon icon={faPenToSquare} />
                            </button>
                            <button
                                className="msgr-icon-btn"
                                onClick={() => setShowNewGroup(true)}
                                title="New group"
                            >
                                <FontAwesomeIcon icon={faUserGroup} />
                            </button>
                        </div>
                    </div>

                    <div className="msgr-search">
                        <FontAwesomeIcon icon={faMagnifyingGlass} className="msgr-search-icon" />
                        <input
                            placeholder={searching ? 'Search all messages…' : 'Search chats'}
                            value={listQuery}
                            onChange={(e) => setListQuery(e.target.value)}
                        />
                    </div>
                </div>

                {!searching && (
                    <div className="msgr-filters">
                        {FILTERS.map((f) => (
                            <button
                                key={f.key}
                                className={`msgr-chip ${filter === f.key ? 'active' : ''}`}
                                onClick={() => setFilter(f.key)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                )}

                {searching ? (
                    <div className="msgr-list">
                        {listQuery.trim().length < 2 && (
                            <div className="msgr-empty">Type at least two characters.</div>
                        )}
                        {listQuery.trim().length >= 2 && !results.length && (
                            <div className="msgr-empty">No messages found.</div>
                        )}
                        {results.map((r) => (
                            <div
                                key={r._id}
                                className="msgr-result"
                                onClick={() => {
                                    setSearching(false);
                                    setListQuery('');
                                    openConversation({ _id: r.conversationId });
                                }}
                            >
                                <div className="msgr-result-top">
                                    <strong>{r.conversationTitle}</strong>
                                    <span>{new Date(r.createdAt).toLocaleDateString('en-GB')}</span>
                                </div>
                                <div className="msgr-result-text">
                                    {r.sender?.name ? `${r.sender.name}: ` : ''}{r.text}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filter === 'people' ? (
                    /*
                     * The employee directory, in the left pane beside the chats.
                     *
                     * WhatsApp keeps contacts behind a button, but here everyone
                     * in the company is messageable and most of them will never
                     * have an existing thread — so hiding the directory one
                     * level down would make "message a colleague you have not
                     * spoken to" the slowest thing in the app.
                     */
                    <div className="msgr-list">
                        {!contactsLoaded && <div className="msgr-empty">Loading…</div>}
                        {contactsLoaded && !people.length && (
                            <div className="msgr-empty">Nobody matches that.</div>
                        )}
                        {people.map((p) => {
                            /*
                             * A colleague you already have a thread with reads
                             * as a chat row — last message, time, unread badge —
                             * exactly as they do under All. Only someone you
                             * have never messaged falls back to their job title,
                             * because there is no conversation to preview yet.
                             */
                            const dm = directByUser.get(String(p._id));
                            const last = dm?.lastMessage || {};
                            const mine = last.sender && String(last.sender) === String(myId);

                            return (
                                <div
                                    key={p._id}
                                    className={`msgr-row ${dm && dm.unread > 0 ? 'unread' : ''}`}
                                    onClick={() => (dm ? openConversation(dm) : startDirect([p._id]))}
                                >
                                    <EmployeeAvatar person={p} className="msgr-avatar" />
                                    <div className="msgr-row-body">
                                        <div className="msgr-row-top">
                                            <span className="msgr-row-name">{p.name}</span>
                                            {last.at && <span className="msgr-row-time">{stamp(last.at)}</span>}
                                        </div>
                                        <div className="msgr-row-bottom">
                                            <span className="msgr-row-preview">
                                                {last.text
                                                    ? `${mine ? 'You: ' : ''}${last.text}`
                                                    : [p.jobTitle || p.role, p.department].filter(Boolean).join(' · ')}
                                            </span>
                                            {dm?.unread > 0 && (
                                                <span className="msgr-badge">
                                                    {dm.unread > 99 ? '99+' : dm.unread}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : loading ? (
                    <div className="msgr-empty">Loading…</div>
                ) : (
                    <ConversationList
                        conversations={visible}
                        activeId={activeId}
                        onSelect={openConversation}
                        onContextMenu={(e, c) => setCtxMenu({ x: e.clientX, y: e.clientY, conversation: c })}
                        myId={myId}
                    />
                )}
            </div>

            {/* ------------------------------ RIGHT ------------------------------ */}
            {active ? (
                <ChatWindow
                    key={active._id}
                    conversation={active}
                    myId={myId}
                    myRole={myRole}
                    onBack={() => { setActiveId(null); setActive(null); navigate('/chats', { replace: true }); }}
                    onToggleInfo={() => setShowInfo((s) => !s)}
                    onConversationChanged={onConversationChanged}
                />
            ) : (
                <div className="msgr-main">
                    <div className="msgr-placeholder">
                        <FontAwesomeIcon icon={faComments} />
                        <h3>Your conversations</h3>
                        <p>
                            Pick a chat on the left, or start a new one. Project groups are
                            created automatically and everyone assigned a task on the project
                            joins them.
                        </p>
                    </div>
                </div>
            )}

            {showInfo && active && (
                <GroupInfoPanel
                    conversation={active}
                    myId={myId}
                    myRole={myRole}
                    onClose={() => setShowInfo(false)}
                    onChanged={onConversationChanged}
                    onLeft={onLeft}
                />
            )}

            {showNewGroup && (
                <NewGroupModal
                    onClose={() => setShowNewGroup(false)}
                    onCreated={onGroupCreated}
                />
            )}

            {ctxMenu && (
                <ChatContextMenu
                    x={ctxMenu.x}
                    y={ctxMenu.y}
                    conversation={ctxMenu.conversation}
                    onClose={() => setCtxMenu(null)}
                    onCloseChat={closeChat}
                    onClearChat={clearChat}
                    onToggleMute={toggleMute}
                />
            )}

            {showNewChat && (
                <PeoplePicker
                    title="New chat"
                    multi={false}
                    onCancel={() => setShowNewChat(false)}
                    onConfirm={startDirect}
                />
            )}
        </div>
    );
};

export default Chats;
