import React, { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBell, faSpinner, faEnvelope, faCommentDots, faCircleCheck,
    faTriangleExclamation, faClock, faPaperPlane
} from '@fortawesome/free-solid-svg-icons';
import api from '../utils/api';
import { getSocket } from '../utils/socket';
import Avatar from './Avatar';
import NudgeModal from './NudgeModal';
import '../styles/nudge.css';

/**
 * The nudge panel on a task page — both halves of the feature in one place.
 *
 * If you were asked, you see the question and the answer buttons. If you can
 * ask, you see the button and the history of what has been asked. Most people
 * on a task see both at different moments, and splitting them into two
 * components would mean two places that have to agree about the same list.
 *
 * The presets mirror server/utils/nudge.js ETA_PRESETS exactly. They are
 * duplicated rather than fetched because a five-item list is not worth a round
 * trip on every task open — but the server is the authority: it maps the key it
 * is given and ignores anything it does not recognise, so a stale client can
 * never write a label the server did not choose.
 */

const PRESETS = [
    { key: '30m', label: 'About 30 minutes' },
    { key: '2h', label: 'About 2 hours' },
    { key: 'today', label: 'By end of today' },
    { key: 'tomorrow', label: 'By end of tomorrow' },
    { key: 'blocked', label: "I'm blocked" }
];

const CHANNEL_ICON = { email: faEnvelope, whatsapp: faCommentDots };

const when = (iso) => new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
});

/**
 * What actually happened on the channels the sender picked.
 *
 * Shown only when something did *not* work. A sender who chose WhatsApp and
 * whose employee has no number on file needs to know that; a sender whose
 * message went out fine does not need a receipt.
 */
const DeliveryTrouble = ({ deliveries = [] }) => {
    const bad = deliveries.filter(d => d.channel !== 'inApp' && d.status !== 'sent');
    if (bad.length === 0) return null;

    return (
        <div className="nudge-trouble">
            {bad.map(d => (
                <span key={d.channel} className={`nudge-trouble-row ${d.status}`}>
                    <FontAwesomeIcon icon={CHANNEL_ICON[d.channel] || faTriangleExclamation} />
                    {d.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} not sent — {d.detail}
                </span>
            ))}
        </div>
    );
};

const TaskNudges = ({ task, currentUserId }) => {
    const [nudges, setNudges] = useState([]);
    const [loading, setLoading] = useState(true);
    const [composing, setComposing] = useState(false);
    const [answering, setAnswering] = useState(null);   // nudge id being answered
    const [note, setNote] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await api.get(`/tasks/${task._id}/nudges`);
            setNudges(res.data || []);
        } catch (err) {
            // Not being allowed to see the history is not an error worth
            // shouting about — the panel simply stays empty.
            setNudges([]);
        } finally {
            setLoading(false);
        }
    }, [task._id]);

    useEffect(() => { load(); }, [load]);

    // Anyone with the task open sees a nudge land, and sees it answered,
    // without refreshing — the same room TaskDiscussion already joins.
    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        socket.emit('task:join', task._id);
        const onNudge = (incoming) => {
            if (String(incoming.taskId) !== String(task._id)) return;
            setNudges(prev => {
                const rest = prev.filter(n => String(n._id) !== String(incoming._id));
                return [incoming, ...rest];
            });
        };

        socket.on('task:nudge', onNudge);
        return () => {
            socket.off('task:nudge', onNudge);
            socket.emit('task:leave', task._id);
        };
    }, [task._id]);

    const isAssignee = (task.assignees || []).some(a => String(a?._id || a) === String(currentUserId));

    // Nobody to ask: a solo task you are on yourself. The button would open a
    // dialog whose only message is that it cannot do anything.
    const hasSomeoneToNudge = (task.assignees || [])
        .some(a => String(a?._id || a) !== String(currentUserId));

    const mine = nudges.filter(n => String(n.recipient?._id || n.recipient) === String(currentUserId) && n.status === 'pending');
    const history = nudges.filter(n => !mine.some(m => m._id === n._id));

    const respond = async (nudge, preset) => {
        setAnswering(nudge._id);
        try {
            const res = await api.post(`/tasks/${task._id}/nudges/${nudge._id}/respond`, {
                preset,
                note: note.trim()
            });
            setNudges(prev => prev.map(n => (n._id === nudge._id ? res.data : n)));
            setNote('');
            Swal.fire({
                icon: 'success', title: 'Reply sent', toast: true,
                position: 'top-end', timer: 1800, showConfirmButton: false
            });
        } catch (err) {
            Swal.fire('Could not reply', err.response?.data?.message || 'Please try again.', 'error');
        } finally {
            setAnswering(null);
        }
    };

    return (
        <section className="td-panel nudge-panel">
            <header className="td-panel-head">
                <h2><FontAwesomeIcon icon={faBell} /> Check-ins</h2>
                {task.status !== 'Completed' && hasSomeoneToNudge && (
                    <button className="nudge-trigger" onClick={() => setComposing(true)}>
                        <FontAwesomeIcon icon={faPaperPlane} /> Nudge
                    </button>
                )}
            </header>

            <div className="td-panel-body">
                {/* --- Being asked. Sits above the history because answering is
                    the one thing on this panel that is urgent. --- */}
                {mine.map(nudge => (
                    <div key={nudge._id} className="nudge-ask">
                        <div className="nudge-ask-head">
                            <Avatar
                                name={nudge.nudgedBy?.name}
                                profilePic={nudge.nudgedBy?.profilePic}
                                className="nudge-person-avatar"
                            />
                            <div>
                                <strong>{nudge.nudgedBy?.name || 'Someone'}</strong> asked
                                <span className="nudge-ago"> · {when(nudge.createdAt)}</span>
                            </div>
                        </div>

                        <p className="nudge-question">
                            “{nudge.message || 'How long will this take to complete?'}”
                        </p>

                        <div className="nudge-presets">
                            {PRESETS.map(p => (
                                <button
                                    key={p.key} type="button"
                                    className={`nudge-preset ${p.key === 'blocked' ? 'is-blocked' : ''}`}
                                    onClick={() => respond(nudge, p.key)}
                                    disabled={answering === nudge._id}
                                >
                                    {answering === nudge._id
                                        ? <FontAwesomeIcon icon={faSpinner} spin />
                                        : p.label}
                                </button>
                            ))}
                        </div>

                        <textarea
                            className="custom-input nudge-note" rows="2" value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Add a note (optional) — it goes with whichever estimate you pick"
                            disabled={answering === nudge._id}
                        />
                    </div>
                ))}

                {loading ? (
                    <p className="td-muted-line"><FontAwesomeIcon icon={faSpinner} spin /> Loading check-ins…</p>
                ) : history.length === 0 && mine.length === 0 ? (
                    <p className="td-muted-line">
                        {isAssignee
                            ? 'Nobody has asked for an update on this yet.'
                            : 'No check-ins yet. Nudge an assignee to ask how long this will take.'}
                    </p>
                ) : (
                    <ul className="nudge-history">
                        {history.map(n => (
                            <li key={n._id} className={`nudge-item is-${n.status}`}>
                                <div className="nudge-item-head">
                                    <Avatar
                                        name={n.nudgedBy?.name}
                                        profilePic={n.nudgedBy?.profilePic}
                                        className="nudge-person-avatar"
                                    />
                                    <span className="nudge-item-line">
                                        <strong>{n.nudgedBy?.name || 'Someone'}</strong> asked{' '}
                                        <strong>{n.recipient?.name || 'an assignee'}</strong>
                                    </span>
                                    <span className="nudge-ago">{when(n.createdAt)}</span>
                                </div>

                                {n.message && <p className="nudge-item-msg">“{n.message}”</p>}

                                {n.status === 'answered' ? (
                                    <div className="nudge-answer">
                                        <FontAwesomeIcon icon={faCircleCheck} />
                                        <span className="nudge-answer-eta">
                                            {n.response?.etaLabel
                                                || (n.response?.etaAt ? `by ${when(n.response.etaAt)}` : 'Replied')}
                                        </span>
                                        {n.response?.note && <span className="nudge-answer-note">“{n.response.note}”</span>}
                                        <span className="nudge-ago">
                                            {n.response?.via === 'email' ? 'via email' : 'in app'}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="nudge-waiting">
                                        <FontAwesomeIcon icon={faClock} /> Waiting for a reply
                                    </div>
                                )}

                                <DeliveryTrouble deliveries={n.deliveries} />
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {composing && (
                <NudgeModal
                    task={task}
                    currentUserId={currentUserId}
                    onClose={() => setComposing(false)}
                    onSent={(sent) => setNudges(prev => {
                        // The socket push usually beats this, so merge by id
                        // rather than prepending a second copy of each nudge.
                        const fresh = sent.map(n => n._id);
                        return [...sent, ...prev.filter(n => !fresh.includes(n._id))];
                    })}
                />
            )}
        </section>
    );
};

export default TaskNudges;
