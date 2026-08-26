import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBell, faSpinner, faCommentDots, faTriangleExclamation, faPaperPlane, faClock
} from '@fortawesome/free-solid-svg-icons';
import api from '../utils/api';
import { getSocket } from '../utils/socket';
import Avatar from './Avatar';
import NudgeModal from './NudgeModal';
import { isOnCooldown, cooldownTitle, msLeft, formatLeft } from '../utils/nudgeCooldown';
import '../styles/nudge.css';

/**
 * The nudge panel on a task page.
 *
 * Leads with the count, because that is the number the feature exists to
 * produce: a task chased five times reads differently from one never chased,
 * and nobody should have to count rows by eye to see it. The log below it
 * answers "by whom, and when".
 *
 * There is nothing to reply to here — a nudge is a ping, not a question.
 */

const CHANNEL_ICON = { whatsapp: faCommentDots };

const when = (iso) => new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
});

/**
 * When a nudge sent at `createdAt` frees its recipient up again.
 *
 * Used to start a cooldown locally the instant a nudge goes out, rather than
 * leaving the button live until the next fetch. The server remains the
 * authority — its `cooldowns` map overwrites this on the next load.
 */
const cooldownUntil = (createdAt, minutes) =>
    new Date(new Date(createdAt).getTime() + minutes * 60 * 1000).toISOString();

/**
 * What actually happened on the channels the sender picked.
 *
 * Shown only when something did *not* work. A sender who chose WhatsApp and
 * whose employee has no number on file needs to know that; a sender whose
 * message went out fine does not need a receipt.
 */
const DeliveryTrouble = ({ deliveries = [] }) => {
    // `pending` means the background send has not reported back yet — in
    // flight, not failed. Showing it as trouble would flag every fresh nudge
    // as broken for the second or two before the result lands.
    const bad = deliveries.filter(d =>
        d.channel !== 'inApp' && d.status !== 'sent' && d.status !== 'pending');
    if (bad.length === 0) return null;

    return (
        <div className="nudge-trouble">
            {bad.map(d => (
                <span key={d.channel} className={`nudge-trouble-row ${d.status}`}>
                    <FontAwesomeIcon icon={CHANNEL_ICON[d.channel] || faTriangleExclamation} />
                    WhatsApp not sent — {d.detail}
                </span>
            ))}
        </div>
    );
};

const TaskNudges = ({ task, currentUserId }) => {
    const [nudges, setNudges] = useState([]);
    const [byRecipient, setByRecipient] = useState({});
    const [cooldowns, setCooldowns] = useState({});
    const [loading, setLoading] = useState(true);
    const [composing, setComposing] = useState(false);

    /**
     * The window length, straight from the server so the client never hardcodes
     * a number the backend can change via NUDGE_COOLDOWN_MINUTES.
     *
     * A ref rather than state: it is read inside the socket subscription, and
     * as state it would be a dependency that re-runs the effect and re-emits
     * task:join/leave for no reason.
     */
    const cooldownMinutesRef = useRef(120);

    // Nudge ids already accounted for in the count. A ref rather than derived
    // from `nudges`, because the socket handler needs a synchronous answer and
    // React state inside a subscription closure is a render behind.
    const seenRef = useRef(new Set());

    // Drives the countdown on the disabled button. 30s is fine — the text is
    // rounded to whole minutes, so a finer tick would repaint for nothing.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(t);
    }, []);

    const load = useCallback(async () => {
        try {
            const res = await api.get(`/tasks/${task._id}/nudges`);
            const rows = res.data?.data || [];
            rows.forEach(n => seenRef.current.add(String(n._id)));
            setNudges(rows);
            setByRecipient(res.data?.byRecipient || {});
            setCooldowns(res.data?.cooldowns || {});
            if (res.data?.cooldownMinutes) cooldownMinutesRef.current = res.data.cooldownMinutes;
        } catch (err) {
            // Not being allowed to see the history is not an error worth
            // shouting about — the panel simply stays empty.
            setNudges([]);
            setByRecipient({});
            setCooldowns({});
        } finally {
            setLoading(false);
        }
    }, [task._id]);

    useEffect(() => { load(); }, [load]);

    // Anyone with the task open sees the count go up without refreshing — the
    // same room TaskDiscussion already joins.
    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        socket.emit('task:join', task._id);

        /**
         * A nudge arrives here twice: once when it is created, and again when
         * its background WhatsApp delivery reports back. The second is an
         * *update*, not a new nudge — so it replaces the row in place, and must
         * not touch the count or the cooldown a second time.
         */
        const onNudge = (incoming) => {
            if (String(incoming.taskId) !== String(task._id)) return;

            const nid = String(incoming._id);
            const isUpdate = seenRef.current.has(nid);
            seenRef.current.add(nid);

            setNudges(prev => {
                const idx = prev.findIndex(n => String(n._id) === nid);
                if (idx === -1) return [incoming, ...prev];
                // Swap in the fresher copy so the delivery status is current.
                const next = [...prev];
                next[idx] = incoming;
                return next;
            });

            if (isUpdate) return;

            const rid = String(incoming.recipient?._id || incoming.recipient);
            setByRecipient(prev => ({ ...prev, [rid]: (prev[rid] || 0) + 1 }));

            // Only *my* nudges start *my* cooldown — the rule is per sender, so
            // a colleague chasing the same person must not grey out my button.
            const senderId = String(incoming.nudgedBy?._id || incoming.nudgedBy);
            if (senderId === String(currentUserId)) {
                setCooldowns(prev => ({
                    ...prev,
                    [rid]: { until: cooldownUntil(incoming.createdAt, cooldownMinutesRef.current) }
                }));
            }
        };

        socket.on('task:nudge', onNudge);
        return () => {
            socket.off('task:nudge', onNudge);
            socket.emit('task:leave', task._id);
        };
    }, [task._id, currentUserId]);

    // Nobody to nudge: a solo task you are on yourself. The button would open a
    // dialog whose only message is that it cannot do anything.
    const others = (task.assignees || [])
        .filter(a => String(a?._id || a) !== String(currentUserId));
    const hasSomeoneToNudge = others.length > 0;

    // Everyone already chased. The button opens a dialog in which nothing can
    // be selected, so it is disabled with the wait time on hover instead.
    const allCooling = hasSomeoneToNudge &&
        others.every(a => isOnCooldown(cooldowns, String(a?._id || a), now));

    // Soonest moment any of them frees up — what the tooltip counts down to.
    const nextFreeMs = hasSomeoneToNudge
        ? Math.min(...others.map(a => msLeft(cooldowns, String(a?._id || a), now)))
        : 0;

    const triggerTitle = !allCooling
        ? undefined
        : others.length === 1
            ? cooldownTitle(cooldowns, String(others[0]?._id || others[0]), now)
            : `Everyone on this task was just nudged — you can nudge again in ${formatLeft(nextFreeMs)}`;

    const total = nudges.length;

    return (
        <section className="td-panel nudge-panel">
            <header className="td-panel-head">
                <h2><FontAwesomeIcon icon={faBell} /> Nudges</h2>
                {total > 0 && <span className="td-count">{total}</span>}
                {task.status !== 'Completed' && hasSomeoneToNudge && (
                    <button
                        className={`nudge-trigger ${allCooling ? 'is-cooling' : ''}`}
                        onClick={() => setComposing(true)}
                        disabled={allCooling}
                        title={triggerTitle}
                    >
                        <FontAwesomeIcon icon={allCooling ? faClock : faPaperPlane} />
                        {allCooling ? formatLeft(nextFreeMs) : 'Nudge'}
                    </button>
                )}
            </header>

            <div className="td-panel-body">
                {loading ? (
                    <p className="td-muted-line"><FontAwesomeIcon icon={faSpinner} spin /> Loading…</p>
                ) : total === 0 ? (
                    <p className="td-muted-line">
                        No nudges on this task yet.
                    </p>
                ) : (
                    <>
                        {/* Per-person tallies first — the summary anyone actually
                            wants before reading the log. */}
                        <div className="nudge-tallies">
                            {(task.assignees || []).map(a => {
                                const id = String(a?._id || a);
                                const count = byRecipient[id] || 0;
                                if (count === 0) return null;
                                return (
                                    <div key={id} className="nudge-tally">
                                        <Avatar
                                            name={a?.name}
                                            profilePic={a?.profilePic}
                                            className="nudge-person-avatar"
                                        />
                                        <span className="nudge-tally-name">{a?.name || 'Employee'}</span>
                                        <span className="nudge-tally-count">{count}</span>
                                    </div>
                                );
                            })}
                        </div>

                        <ul className="nudge-history">
                            {nudges.map(n => (
                                <li key={n._id} className="nudge-item">
                                    <div className="nudge-item-head">
                                        <Avatar
                                            name={n.nudgedBy?.name}
                                            profilePic={n.nudgedBy?.profilePic}
                                            className="nudge-person-avatar"
                                        />
                                        <span className="nudge-item-line">
                                            <strong>{n.nudgedBy?.name || 'Someone'}</strong> nudged{' '}
                                            <strong>{n.recipient?.name || 'an assignee'}</strong>
                                            {n.channels?.includes('whatsapp') && (
                                                <FontAwesomeIcon
                                                    icon={faCommentDots}
                                                    className="nudge-via-wa"
                                                    title="Also sent on WhatsApp"
                                                />
                                            )}
                                        </span>
                                        <span className="nudge-ago">{when(n.createdAt)}</span>
                                    </div>

                                    <DeliveryTrouble deliveries={n.deliveries} />
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>

            {composing && (
                <NudgeModal
                    task={task}
                    currentUserId={currentUserId}
                    cooldowns={cooldowns}
                    onClose={() => setComposing(false)}
                    onSent={(sent) => {
                        // The socket push usually beats this, so merge by id
                        // rather than prepending a second copy of each nudge.
                        setNudges(prev => {
                            const fresh = sent.map(n => String(n._id));
                            fresh.forEach(id => seenRef.current.add(id));
                            return [...sent, ...prev.filter(n => !fresh.includes(String(n._id)))];
                        });
                        setByRecipient(prev => {
                            const next = { ...prev };
                            sent.forEach(n => {
                                const rid = String(n.recipient?._id || n.recipient);
                                next[rid] = (next[rid] || 0) + 1;
                            });
                            return next;
                        });
                        // Start the cooldown immediately rather than waiting for
                        // the next fetch, so the button greys out on the spot.
                        setCooldowns(prev => {
                            const next = { ...prev };
                            sent.forEach(n => {
                                const rid = String(n.recipient?._id || n.recipient);
                                next[rid] = { until: cooldownUntil(n.createdAt, cooldownMinutesRef.current) };
                            });
                            return next;
                        });
                    }}
                />
            )}
        </section>
    );
};

export default TaskNudges;
