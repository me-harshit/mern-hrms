import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBell, faTimes, faSpinner, faCommentDots, faPaperPlane
} from '@fortawesome/free-solid-svg-icons';
import api from '../utils/api';
import Avatar from './Avatar';
import { isOnCooldown, cooldownTitle } from '../utils/nudgeCooldown';
import '../styles/nudge.css';

/**
 * "Someone is waiting on this" — the compose side of a nudge.
 *
 * Shared by the task page and the task list so a quick chase from a table row
 * and a considered one from the task itself send exactly the same thing.
 *
 * There is no message box. A nudge is a fixed, one-tap ping — a free-text field
 * on a chase button invites the exact messages a chase should not carry, and
 * anything worth actually saying belongs in the task's discussion thread, which
 * already exists and is better at it.
 *
 * The in-app notification is not offered as a choice either. It always goes,
 * because it is the record of the nudge inside the product and the thing the
 * per-task count counts. WhatsApp is the one real decision here.
 */

const NudgeModal = ({ task, currentUserId, cooldowns: given, onClose, onSent }) => {
    /**
     * Who this user cannot nudge yet.
     *
     * Passed in from the task page, which already has it. Fetched here when
     * opened from the task list, which does not — working it out for every row
     * would be a query per task for a panel most people never open, so the cost
     * is paid once, on demand, by whoever actually opens the dialog.
     */
    const [cooldowns, setCooldowns] = useState(given || {});

    useEffect(() => {
        if (given) return;
        let alive = true;
        api.get(`/tasks/${task._id}/nudges`)
            .then(res => { if (alive) setCooldowns(res.data?.cooldowns || {}); })
            // A failure here only costs the greying-out; the server still
            // refuses the send and the dialog reports it as a skip.
            .catch(() => { });
        return () => { alive = false; };
    }, [task._id, given]);

    // Everyone on the task except whoever is asking — you cannot nudge
    // yourself, and a lone self-assigned task therefore has nobody to nudge.
    const candidates = (task.assignees || []).filter(a => {
        const id = a?._id || a;
        return String(id) !== String(currentUserId);
    });

    // Ticks so a cooldown that lapses while the dialog is open re-enables the
    // person, instead of leaving them greyed out until a manual refresh.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(t);
    }, []);

    const blocked = (id) => isOnCooldown(cooldowns, id, now);
    const available = candidates.filter(a => !blocked(String(a?._id || a)));

    // Pre-select only the people who can actually be nudged. Selecting someone
    // on cooldown by default would guarantee a partial send on every press.
    const [selected, setSelected] = useState(() => available.map(a => String(a?._id || a)));
    const [viaWhatsApp, setViaWhatsApp] = useState(true);
    const [sending, setSending] = useState(false);

    const togglePerson = (value) => {
        if (blocked(value)) return;
        setSelected(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));
    };

    /**
     * Drop anyone who is blocked from the selection.
     *
     * Runs on `cooldowns` as well as `now`: opened from the task list, the
     * cooldown map arrives *after* mount, so the initial pre-selection was made
     * without it and would otherwise keep someone ticked who cannot be nudged.
     *
     * Only ever removes. Someone the user deliberately unticked stays off.
     */
    useEffect(() => {
        setSelected(prev => prev.filter(id => !blocked(id)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [now, cooldowns]);

    const send = async () => {
        if (selected.length === 0) {
            return Swal.fire('Nobody selected', 'Pick at least one person to nudge.', 'warning');
        }

        setSending(true);
        try {
            const res = await api.post(`/tasks/${task._id}/nudge`, {
                recipientIds: selected,
                channels: viaWhatsApp ? ['whatsapp'] : []
            });

            const { sent = [], skipped = [] } = res.data;

            // A partial send is the interesting case: one person was chased
            // five minutes ago and the other was not. Saying "sent!" would hide
            // that half of it did not go.
            if (skipped.length > 0) {
                await Swal.fire({
                    icon: 'info',
                    title: `Nudged ${sent.length} of ${sent.length + skipped.length}`,
                    html: skipped.map(s => `<div style="font-size:13px;color:#475569;margin-top:6px;">
                        <strong>${s.name || 'Someone'}</strong> — ${s.reason}</div>`).join('')
                });
            } else {
                Swal.fire({
                    icon: 'success',
                    title: `Nudged ${sent.length} ${sent.length === 1 ? 'person' : 'people'}`,
                    toast: true, position: 'top-end', timer: 2200, showConfirmButton: false
                });
            }

            onSent?.(sent);
            onClose();
        } catch (err) {
            Swal.fire(
                'Could not send',
                err.response?.data?.message || 'Something went wrong sending the nudge.',
                'error'
            );
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="nudge-overlay" onClick={onClose}>
            <div className="nudge-modal" onClick={(e) => e.stopPropagation()}>
                <header className="nudge-modal-head">
                    <h3><FontAwesomeIcon icon={faBell} /> Nudge</h3>
                    <button className="nudge-close" onClick={onClose} aria-label="Close">
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                </header>

                <div className="nudge-modal-body">
                    <p className="nudge-task-line" title={task.title}>{task.title}</p>

                    <label className="nudge-label">Who are you nudging?</label>
                    {candidates.length === 0 ? (
                        <p className="nudge-empty">
                            There is nobody else on this task to nudge.
                        </p>
                    ) : (
                        <div className="nudge-people">
                            {candidates.map(a => {
                                const id = String(a?._id || a);
                                const on = selected.includes(id);
                                const cooling = blocked(id);
                                return (
                                    <button
                                        key={id} type="button"
                                        className={`nudge-person ${on ? 'is-on' : ''} ${cooling ? 'is-cooling' : ''}`}
                                        onClick={() => togglePerson(id)}
                                        disabled={sending || cooling}
                                        title={cooling ? cooldownTitle(cooldowns, id, now) : undefined}
                                    >
                                        <Avatar name={a?.name} profilePic={a?.profilePic} className="nudge-person-avatar" />
                                        <span>{a?.name || 'Employee'}</span>
                                        {cooling && <span className="nudge-person-wait">on cooldown</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <label className="nudge-label">Where should it go?</label>
                    <div className="nudge-channels">
                        <div className="nudge-channel is-fixed">
                            <FontAwesomeIcon icon={faBell} />
                            <span className="nudge-channel-label">In app</span>
                            <span className="nudge-channel-hint">Always sent</span>
                        </div>

                        <button
                            type="button"
                            className={`nudge-channel ${viaWhatsApp ? 'is-on' : ''}`}
                            onClick={() => setViaWhatsApp(v => !v)}
                            disabled={sending}
                        >
                            <FontAwesomeIcon icon={faCommentDots} />
                            <span className="nudge-channel-label">WhatsApp</span>
                            <span className="nudge-channel-hint">
                                {viaWhatsApp ? 'Will be sent' : 'Off'}
                            </span>
                        </button>
                    </div>
                    <p className="nudge-hint">
                        They just get the nudge — there is nothing for them to reply to.
                        The task keeps a count of how many it has had.
                    </p>
                </div>

                <footer className="nudge-modal-foot">
                    <button className="gts-btn secondary" onClick={onClose} disabled={sending}>Cancel</button>
                    <button
                        className="gts-btn primary" onClick={send}
                        disabled={sending || selected.length === 0}
                    >
                        {sending
                            ? <><FontAwesomeIcon icon={faSpinner} spin /> Sending...</>
                            : <><FontAwesomeIcon icon={faPaperPlane} /> Send nudge</>}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default NudgeModal;
