import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faXmark, faCopy, faCheck, faEnvelope, faUserTie, faTriangleExclamation
} from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';

/**
 * "Invite someone from outside" — feature draft F2.1.
 *
 * Two steps in one dialog, because the second is the point of the first: you
 * type a name and an address, and what comes back is the link. Management asked
 * for the link to be visible as well as emailed, since a vendor whose mail
 * server swallows the invitation is otherwise stuck with no way in and no way
 * to say so.
 *
 * The options are folded away by default. The plain path is a name, an email
 * and a button; the code and the approval step are there for the invitations
 * that warrant them, and asking about them up front would make the common case
 * look harder than it is.
 */

const DAY_CHOICES = [7, 14, 30, 90];

const InviteExternalModal = ({ conversation, onClose, onInvited }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [company, setCompany] = useState('');
    const [note, setNote] = useState('');
    const [days, setDays] = useState(7);
    const [requireCode, setRequireCode] = useState(false);
    const [requireApproval, setRequireApproval] = useState(false);
    const [showOptions, setShowOptions] = useState(false);

    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [copied, setCopied] = useState(false);

    const submit = async () => {
        if (!name.trim() || !email.trim()) return;
        setBusy(true);
        try {
            const res = await api.post(`/conversations/${conversation._id}/externals`, {
                name: name.trim(),
                email: email.trim(),
                company: company.trim(),
                note: note.trim(),
                days,
                requireCode,
                requireApproval
            });
            setResult(res.data);
            onInvited?.(res.data.participant);
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Could not send that invitation.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const copy = () => {
        navigator.clipboard?.writeText(result.link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    /* ------------------------------------------------------------------ *
     * Step 2 — the link
     * ------------------------------------------------------------------ */
    if (result) {
        return (
            <div className="msgr-modal-back" onClick={onClose}>
                <div className="msgr-modal ext-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="msgr-modal-head">
                        <h4>{result.participant.name} has been invited</h4>
                        <button className="msgr-icon-btn" onClick={onClose}>
                            <FontAwesomeIcon icon={faXmark} />
                        </button>
                    </div>

                    <div className="msgr-modal-body">
                        <p className={`ext-mail-state ${result.emailed ? 'ok' : 'warn'}`}>
                            <FontAwesomeIcon icon={result.emailed ? faCheck : faTriangleExclamation} />
                            {result.emailed
                                ? `The invitation was emailed to ${result.participant.email}.`
                                : `The email could not be sent to ${result.participant.email}. Send them the link below instead.`}
                        </p>

                        <label className="ext-label">Their joining link</label>
                        <div className="ext-link-box">
                            <input readOnly value={result.link} onFocus={(e) => e.target.select()} />
                            <button className="msgr-btn primary" onClick={copy}>
                                <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>

                        {result.code && (
                            <>
                                <label className="ext-label" style={{ marginTop: 16 }}>
                                    Their verification code
                                </label>
                                <div className="ext-code">{result.code}</div>
                                <p className="ext-hint">
                                    This was emailed to them. They will be asked for it when they
                                    open the link — so if you send the link another way, do not
                                    send the code the same way.
                                </p>
                            </>
                        )}

                        <p className="ext-hint" style={{ marginTop: 16 }}>
                            The link opens this conversation and nothing else. They will see
                            messages from now on, not what was said before they were invited.
                        </p>
                    </div>

                    <div className="msgr-modal-foot">
                        <button className="msgr-btn primary" onClick={onClose}>Done</button>
                    </div>
                </div>
            </div>
        );
    }

    /* ------------------------------------------------------------------ *
     * Step 1 — who
     * ------------------------------------------------------------------ */
    return (
        <div className="msgr-modal-back" onClick={onClose}>
            <div className="msgr-modal ext-modal" onClick={(e) => e.stopPropagation()}>
                <div className="msgr-modal-head">
                    <h4>Invite someone from outside</h4>
                    <button className="msgr-icon-btn" onClick={onClose}>
                        <FontAwesomeIcon icon={faXmark} />
                    </button>
                </div>

                <div className="msgr-modal-body">
                    <p className="ext-hint" style={{ marginTop: 0 }}>
                        They will be able to read and reply in <strong>{conversation.name}</strong>,
                        and nothing else — no tasks, no other conversations, no employee records.
                    </p>

                    <label className="ext-label">
                        <FontAwesomeIcon icon={faUserTie} /> Their name
                    </label>
                    <input
                        className="ext-input"
                        value={name}
                        autoFocus
                        placeholder="Ramesh Kumar"
                        onChange={(e) => setName(e.target.value)}
                    />

                    <label className="ext-label">
                        <FontAwesomeIcon icon={faEnvelope} /> Their email
                    </label>
                    <input
                        className="ext-input"
                        type="email"
                        value={email}
                        placeholder="ramesh@vendor.com"
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && name && email) submit(); }}
                    />

                    <label className="ext-label">Company (optional)</label>
                    <input
                        className="ext-input"
                        value={company}
                        placeholder="VendorCo Pvt Ltd"
                        onChange={(e) => setCompany(e.target.value)}
                    />

                    <button
                        type="button"
                        className="ext-toggle"
                        onClick={() => setShowOptions((o) => !o)}
                    >
                        {showOptions ? 'Hide options' : 'More options'}
                    </button>

                    {showOptions && (
                        <div className="ext-options">
                            <label className="ext-label">A note in the email (optional)</label>
                            <textarea
                                className="ext-input"
                                rows={2}
                                value={note}
                                placeholder="Please share the revised drawings."
                                onChange={(e) => setNote(e.target.value)}
                            />

                            <label className="ext-label">Their access lasts</label>
                            <div className="ext-days">
                                {DAY_CHOICES.map((d) => (
                                    <button
                                        key={d}
                                        type="button"
                                        className={days === d ? 'active' : ''}
                                        onClick={() => setDays(d)}
                                    >
                                        {d} days
                                    </button>
                                ))}
                            </div>

                            <label className="ext-check">
                                <input
                                    type="checkbox"
                                    checked={requireCode}
                                    onChange={(e) => setRequireCode(e.target.checked)}
                                />
                                <span>
                                    Ask for a verification code
                                    <small>
                                        Emails them a six-digit code as well as the link, so a
                                        forwarded invitation does not let somebody else in.
                                    </small>
                                </span>
                            </label>

                            <label className="ext-check">
                                <input
                                    type="checkbox"
                                    checked={requireApproval}
                                    onChange={(e) => setRequireApproval(e.target.checked)}
                                />
                                <span>
                                    Approve them before they can read anything
                                    <small>
                                        Opening the link asks you first, rather than admitting
                                        them straight away.
                                    </small>
                                </span>
                            </label>
                        </div>
                    )}
                </div>

                <div className="msgr-modal-foot">
                    <button className="msgr-btn" onClick={onClose}>Cancel</button>
                    <button
                        className="msgr-btn primary"
                        onClick={submit}
                        disabled={busy || !name.trim() || !email.trim()}
                    >
                        {busy ? 'Sending…' : 'Send invitation'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InviteExternalModal;
