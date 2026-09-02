import React, { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faXmark, faCopy, faCheck, faEnvelope, faUserTie, faTriangleExclamation,
    faMagnifyingGlass, faPlus, faArrowLeft, faBuilding
} from '@fortawesome/free-solid-svg-icons';

import api from '../../utils/api';

/**
 * Adding somebody from outside to this group — feature draft F2.1.
 *
 * Three steps, and the first one is the reason this was rewritten: you PICK a
 * person from the directory rather than describing them again. Adding the same
 * supplier to a second project used to mean retyping their name and email,
 * which produced two records for one human that could disagree about who they
 * were.
 *
 * "Add someone new" is still one click away, because the first time you deal
 * with a vendor they are genuinely not in the directory yet — it just creates
 * the directory record rather than burying the details in this group.
 *
 * The access options (validity, verification code, approval) stay per group.
 * They are facts about this invitation, not about the person: revoking a vendor
 * from one project must leave another untouched.
 */

const DAY_CHOICES = [7, 14, 30, 90];

const TYPE_LABEL = {
    VENDOR: 'Vendor', CLIENT: 'Client', CONSULTANT: 'Consultant',
    CONTRACTOR: 'Contractor', OTHER: 'Other'
};

const InviteExternalModal = ({ conversation, existingIds = [], onClose, onInvited }) => {
    // pick | new | options | done
    const [step, setStep] = useState('pick');

    const [directory, setDirectory] = useState([]);
    const [loadingDir, setLoadingDir] = useState(true);
    const [query, setQuery] = useState('');
    const [chosen, setChosen] = useState(null);

    const [fresh, setFresh] = useState({ name: '', email: '', company: '', type: 'VENDOR' });

    const [note, setNote] = useState('');
    const [days, setDays] = useState(7);
    const [requireCode, setRequireCode] = useState(false);
    const [requireApproval, setRequireApproval] = useState(false);

    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [copied, setCopied] = useState(false);

    const loadDirectory = useCallback(async () => {
        setLoadingDir(true);
        try {
            const res = await api.get('/external-users', { params: { q: query || undefined } });
            setDirectory(res.data);
        } catch {
            // A manager without directory access still has the "add someone
            // new" path, so an empty list is a degraded state, not a dead end.
            setDirectory([]);
        } finally {
            setLoadingDir(false);
        }
    }, [query]);

    useEffect(() => {
        const t = setTimeout(loadDirectory, query ? 300 : 0);
        return () => clearTimeout(t);
    }, [loadDirectory, query]);

    const alreadyIn = new Set(existingIds.map(String));

    const submit = async () => {
        setBusy(true);
        try {
            const payload = chosen
                ? { externalUserId: chosen._id }
                : {
                    name: fresh.name.trim(),
                    email: fresh.email.trim(),
                    company: fresh.company.trim(),
                    type: fresh.type
                };

            const res = await api.post(`/conversations/${conversation._id}/externals`, {
                ...payload, note: note.trim(), days, requireCode, requireApproval
            });
            setResult(res.data);
            setStep('done');
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

    const who = chosen?.name || fresh.name || 'them';

    /* ================================================================== *
     * STEP 3 — the link
     * ================================================================== */
    if (step === 'done' && result) {
        return (
            <div className="msgr-modal-back" onClick={onClose}>
                <div className="msgr-modal ext-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="msgr-modal-head">
                        <h4>{result.participant.name} has been added</h4>
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

                        <label className="ext-label">Their joining link for this group</label>
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
                            This link opens <strong>{conversation.name}</strong> and nothing else.
                            If they are in other conversations, those have their own links and are
                            unaffected by anything you do here.
                        </p>
                    </div>

                    <div className="msgr-modal-foot">
                        <button className="msgr-btn primary" onClick={onClose}>Done</button>
                    </div>
                </div>
            </div>
        );
    }

    /* ================================================================== *
     * STEP 2 — how long, and how carefully
     * ================================================================== */
    if (step === 'options') {
        return (
            <div className="msgr-modal-back" onClick={onClose}>
                <div className="msgr-modal ext-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="msgr-modal-head">
                        <h4>Add {who} to {conversation.name}</h4>
                        <button className="msgr-icon-btn" onClick={onClose}>
                            <FontAwesomeIcon icon={faXmark} />
                        </button>
                    </div>

                    <div className="msgr-modal-body">
                        <button
                            className="ext-back"
                            onClick={() => setStep(chosen ? 'pick' : 'new')}
                        >
                            <FontAwesomeIcon icon={faArrowLeft} /> Choose somebody else
                        </button>

                        <p className="ext-hint" style={{ marginTop: 4 }}>
                            They will be able to read and reply in <strong>{conversation.name}</strong>,
                            and nothing else — no tasks, no other conversations, no employee records.
                        </p>

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
                                    Opening the link asks you first, rather than admitting them
                                    straight away.
                                </small>
                            </span>
                        </label>
                    </div>

                    <div className="msgr-modal-foot">
                        <button className="msgr-btn" onClick={onClose}>Cancel</button>
                        <button className="msgr-btn primary" onClick={submit} disabled={busy}>
                            {busy ? 'Sending…' : 'Send invitation'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    /* ================================================================== *
     * STEP 1b — somebody nobody has dealt with before
     * ================================================================== */
    if (step === 'new') {
        const ready = fresh.name.trim() && fresh.email.trim();
        return (
            <div className="msgr-modal-back" onClick={onClose}>
                <div className="msgr-modal ext-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="msgr-modal-head">
                        <h4>Add someone new</h4>
                        <button className="msgr-icon-btn" onClick={onClose}>
                            <FontAwesomeIcon icon={faXmark} />
                        </button>
                    </div>

                    <div className="msgr-modal-body">
                        <button className="ext-back" onClick={() => setStep('pick')}>
                            <FontAwesomeIcon icon={faArrowLeft} /> Back to the directory
                        </button>

                        <p className="ext-hint" style={{ marginTop: 4 }}>
                            They will be saved to the external users directory, so next time you
                            can just pick them.
                        </p>

                        <label className="ext-label">
                            <FontAwesomeIcon icon={faUserTie} /> Their name
                        </label>
                        <input
                            className="ext-input"
                            value={fresh.name}
                            autoFocus
                            placeholder="Ramesh Kumar"
                            onChange={(e) => setFresh({ ...fresh, name: e.target.value })}
                        />

                        <label className="ext-label">
                            <FontAwesomeIcon icon={faEnvelope} /> Their email
                        </label>
                        <input
                            className="ext-input"
                            type="email"
                            value={fresh.email}
                            placeholder="ramesh@vendor.com"
                            onChange={(e) => setFresh({ ...fresh, email: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter' && ready) setStep('options'); }}
                        />

                        <label className="ext-label">They are a</label>
                        <div className="ext-days">
                            {Object.keys(TYPE_LABEL).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    className={fresh.type === t ? 'active' : ''}
                                    onClick={() => setFresh({ ...fresh, type: t })}
                                >
                                    {TYPE_LABEL[t]}
                                </button>
                            ))}
                        </div>

                        <label className="ext-label">Company (optional)</label>
                        <input
                            className="ext-input"
                            value={fresh.company}
                            placeholder="VendorCo Pvt Ltd"
                            onChange={(e) => setFresh({ ...fresh, company: e.target.value })}
                        />
                    </div>

                    <div className="msgr-modal-foot">
                        <button className="msgr-btn" onClick={() => setStep('pick')}>Back</button>
                        <button
                            className="msgr-btn primary"
                            onClick={() => { setChosen(null); setStep('options'); }}
                            disabled={!ready}
                        >
                            Continue
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    /* ================================================================== *
     * STEP 1 — pick from the directory
     * ================================================================== */
    return (
        <div className="msgr-modal-back" onClick={onClose}>
            <div className="msgr-modal ext-modal" onClick={(e) => e.stopPropagation()}>
                <div className="msgr-modal-head">
                    <h4>Add someone from outside</h4>
                    <button className="msgr-icon-btn" onClick={onClose}>
                        <FontAwesomeIcon icon={faXmark} />
                    </button>
                </div>

                <div className="msgr-modal-body">
                    <div className="ext-picker-search">
                        <FontAwesomeIcon icon={faMagnifyingGlass} />
                        <input
                            value={query}
                            autoFocus
                            placeholder="Search vendors, clients, consultants…"
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>

                    <button className="ext-new-btn" onClick={() => setStep('new')}>
                        <span className="ext-new-icon"><FontAwesomeIcon icon={faPlus} /></span>
                        <span>
                            Add someone new
                            <small>They are not in the directory yet</small>
                        </span>
                    </button>

                    {loadingDir && <p className="ext-hint">Loading the directory…</p>}

                    {!loadingDir && !directory.length && (
                        <p className="ext-hint">
                            {query
                                ? 'Nobody in the directory matches that.'
                                : 'The directory is empty. Add the first person above.'}
                        </p>
                    )}

                    {directory.map((u) => {
                        const inGroup = alreadyIn.has(String(u._id));
                        return (
                            <button
                                key={u._id}
                                className={`ext-pick ${inGroup ? 'disabled' : ''}`}
                                disabled={inGroup}
                                onClick={() => { setChosen(u); setStep('options'); }}
                            >
                                <span className="ext-pick-avatar">
                                    {u.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                                </span>
                                <span className="ext-pick-body">
                                    <span className="ext-pick-name">{u.name}</span>
                                    <span className="ext-pick-meta">
                                        {u.company && (
                                            <>
                                                <FontAwesomeIcon icon={faBuilding} /> {u.company} ·{' '}
                                            </>
                                        )}
                                        {u.email}
                                    </span>
                                </span>
                                {inGroup
                                    ? <span className="ext-pick-tag in">Already here</span>
                                    : <span className="ext-pick-tag">{TYPE_LABEL[u.type]}</span>}
                            </button>
                        );
                    })}
                </div>

                <div className="msgr-modal-foot">
                    <button className="msgr-btn" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    );
};

export default InviteExternalModal;
