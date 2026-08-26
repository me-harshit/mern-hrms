import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBell, faTimes, faSpinner, faEnvelope, faCommentDots, faPaperPlane
} from '@fortawesome/free-solid-svg-icons';
import api from '../utils/api';
import Avatar from './Avatar';
import '../styles/nudge.css';

/**
 * "How long will this take?" — the compose side of a nudge.
 *
 * Shared by the task page and the task list so a quick chase from a table row
 * and a considered one from the task itself send exactly the same thing.
 *
 * The in-app notification is not offered as a choice. It always goes, because
 * it is the record of the nudge inside the product — the thing the employee
 * answers and the sender later looks back at. Email and WhatsApp are only ways
 * of getting somebody's attention away from their desk, which is why those two
 * are the toggles.
 */

const CHANNELS = [
    {
        key: 'email',
        label: 'Email',
        icon: faEnvelope,
        hint: 'One-tap answer buttons, no login needed'
    },
    {
        key: 'whatsapp',
        label: 'WhatsApp',
        icon: faCommentDots,
        hint: 'Sent to their WhatsApp number'
    }
];

const NudgeModal = ({ task, currentUserId, onClose, onSent }) => {
    // Everyone on the task except whoever is asking — you cannot nudge
    // yourself, and a lone self-assigned task therefore has nobody to nudge.
    const candidates = (task.assignees || []).filter(a => {
        const id = a?._id || a;
        return String(id) !== String(currentUserId);
    });

    const [selected, setSelected] = useState(() => candidates.map(a => String(a?._id || a)));
    const [message, setMessage] = useState('');
    const [channels, setChannels] = useState(['email']);
    const [sending, setSending] = useState(false);

    const toggle = (list, value, setter) =>
        setter(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

    const send = async () => {
        if (selected.length === 0) {
            return Swal.fire('Nobody selected', 'Pick at least one person to nudge.', 'warning');
        }

        setSending(true);
        try {
            const res = await api.post(`/tasks/${task._id}/nudge`, {
                recipientIds: selected,
                message: message.trim(),
                channels
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
                    title: `Nudge sent to ${sent.length} ${sent.length === 1 ? 'person' : 'people'}`,
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
                    <h3><FontAwesomeIcon icon={faBell} /> Nudge for an update</h3>
                    <button className="nudge-close" onClick={onClose} aria-label="Close">
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                </header>

                <div className="nudge-modal-body">
                    <p className="nudge-task-line" title={task.title}>{task.title}</p>

                    <label className="nudge-label">Who are you asking?</label>
                    {candidates.length === 0 ? (
                        <p className="nudge-empty">
                            There is nobody else on this task to nudge.
                        </p>
                    ) : (
                        <div className="nudge-people">
                            {candidates.map(a => {
                                const id = String(a?._id || a);
                                const on = selected.includes(id);
                                return (
                                    <button
                                        key={id} type="button"
                                        className={`nudge-person ${on ? 'is-on' : ''}`}
                                        onClick={() => toggle(selected, id, setSelected)}
                                        disabled={sending}
                                    >
                                        <Avatar name={a?.name} profilePic={a?.profilePic} className="nudge-person-avatar" />
                                        <span>{a?.name || 'Employee'}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <label className="nudge-label">What do you want to ask?</label>
                    <textarea
                        className="custom-input" rows="2" value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={500}
                        placeholder="How long will this take to complete?"
                        disabled={sending}
                    />
                    <p className="nudge-hint">
                        Leave it blank to ask the default question. They can answer with a
                        one-tap estimate.
                    </p>

                    <label className="nudge-label">Also send it as</label>
                    <div className="nudge-channels">
                        {CHANNELS.map(c => {
                            const on = channels.includes(c.key);
                            return (
                                <button
                                    key={c.key} type="button"
                                    className={`nudge-channel ${on ? 'is-on' : ''}`}
                                    onClick={() => toggle(channels, c.key, setChannels)}
                                    disabled={sending}
                                >
                                    <FontAwesomeIcon icon={c.icon} />
                                    <span className="nudge-channel-label">{c.label}</span>
                                    <span className="nudge-channel-hint">{c.hint}</span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="nudge-hint">
                        An in-app notification goes either way — these are extra.
                    </p>
                </div>

                <footer className="nudge-modal-foot">
                    <button className="gts-btn secondary" onClick={onClose} disabled={sending}>Cancel</button>
                    <button
                        className="gts-btn primary" onClick={send}
                        disabled={sending || candidates.length === 0}
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
