import React, { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faCommentDots, faSpinner, faPlay, faStop, faLink,
    faRotate, faPaperPlane, faCircleCheck, faTriangleExclamation, faPlug, faQrcode, faKeyboard
} from '@fortawesome/free-solid-svg-icons';
import api from '../utils/api';
import '../styles/whatsapp.css';

/**
 * WhatsApp gateway control, for the admin settings page.
 *
 * Exists because the gateway's own dashboard is deliberately unreachable from
 * the internet — it fronts a logged-in WhatsApp account — so without this,
 * "nudges stopped sending" needs an SSH session and a sysadmin.
 *
 * Reports gateway health and session state as two separate things. "OpenWA is
 * down" and "OpenWA is up but the phone was unlinked" look the same from a
 * distance and have entirely different fixes, so each state names its own next
 * step rather than showing a generic red light.
 */

const STATES = {
    'ready': {
        tone: 'ok',
        icon: faCircleCheck,
        label: 'Connected',
        help: 'WhatsApp messages are going out normally.'
    },
    'needs-linking': {
        tone: 'warn',
        icon: faLink,
        label: 'Not linked',
        help: 'The gateway is running but no phone is linked. Use Link a number below.'
    },
    'session-down': {
        tone: 'warn',
        icon: faTriangleExclamation,
        label: 'Session stopped',
        help: 'The gateway is running but the WhatsApp session is not. Press Start.'
    },
    'gateway-down': {
        tone: 'bad',
        icon: faPlug,
        label: 'Gateway unreachable',
        help: 'The OpenWA service is not responding. It needs restarting on the server — this page cannot do that.'
    },
    'not-configured': {
        tone: 'bad',
        icon: faPlug,
        label: 'Not configured',
        help: 'OPENWA_BASE_URL, OPENWA_API_KEY and OPENWA_SESSION_ID are not all set in the server environment.'
    }
};

const WhatsAppControl = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [number, setNumber] = useState('');
    const [pairingCode, setPairingCode] = useState('');
    const [qr, setQr] = useState('');

    // Scan or type — same destination, different preference. Someone at the
    // handset scans; someone reading the screen over a call types eight
    // characters. Offering only one guarantees half the cases are awkward.
    const [linkMode, setLinkMode] = useState('code');

    const load = useCallback(async (quiet = false) => {
        if (!quiet) setLoading(true);
        try {
            const res = await api.get('/whatsapp/status');
            setStatus(res.data);
        } catch (err) {
            setStatus({ summary: 'gateway-down', configured: true, gatewayUp: false, session: null });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // A session that is starting moves through initializing → authenticating →
    // ready over ~40s. Polling only while it is in flight keeps the page live
    // without hammering the gateway once it has settled.
    useEffect(() => {
        const inFlight = ['session-down', 'needs-linking'].includes(status?.summary);
        if (!inFlight) return;
        const t = setInterval(() => load(true), 5000);
        return () => clearInterval(t);
    }, [status?.summary, load]);

    const act = async (path, label, body) => {
        setBusy(label);
        try {
            const res = await api.post(`/whatsapp/${path}`, body || {});
            return res.data;
        } catch (err) {
            Swal.fire('Failed', err.response?.data?.message || `Could not ${label}.`, 'error');
            return null;
        } finally {
            setBusy('');
            load(true);
        }
    };

    const handleStart = async () => {
        const out = await act('start', 'start');
        if (out) Swal.fire({
            icon: 'success', title: 'Starting…',
            text: 'It takes around 40 seconds to connect. This page will update on its own.'
        });
    };

    const handleStop = async () => {
        const confirm = await Swal.fire({
            title: 'Stop WhatsApp?',
            text: 'Every WhatsApp notification in the company stops until it is started again. In-app notifications carry on.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            confirmButtonText: 'Yes, stop it'
        });
        if (!confirm.isConfirmed) return;

        const out = await act('stop', 'stop');
        if (out) Swal.fire({
            icon: 'success', title: 'Stopped', toast: true,
            position: 'top-end', timer: 2000, showConfirmButton: false
        });
    };

    const handlePair = async () => {
        if (!number.trim()) {
            return Swal.fire('Enter a number', 'Digits only, with the country code — e.g. 919876543210.', 'warning');
        }
        setPairingCode(''); setQr('');
        const out = await act('pair', 'start pairing', { phoneNumber: number.trim() });
        if (out?.code) setPairingCode(out.code);
        else if (out) Swal.fire('Connected', out.message, 'success');
    };

    const handleQr = async () => {
        setPairingCode(''); setQr('');
        const out = await act('qr', 'fetch the QR');
        if (out?.qr) setQr(out.qr);
        else if (out) Swal.fire('Connected', out.message, 'success');
    };

    const handleTest = async () => {
        if (!number.trim()) {
            return Swal.fire('Enter a number', 'Put the number to test in the field above.', 'warning');
        }
        const out = await act('test', 'send the test', { phoneNumber: number.trim() });
        if (out) Swal.fire({
            icon: 'success', title: 'Test sent',
            text: 'Check the handset. If it did not arrive, the number may not be on WhatsApp.'
        });
    };

    if (loading) {
        return (
            <div className="control-card wa-card">
                <p className="wa-loading"><FontAwesomeIcon icon={faSpinner} spin /> Checking WhatsApp…</p>
            </div>
        );
    }

    const state = STATES[status?.summary] || STATES['gateway-down'];
    const isReady = status?.summary === 'ready';

    return (
        <div className="control-card wa-card">
            <div className="wa-head">
                <h3 className="wa-title">
                    <FontAwesomeIcon icon={faCommentDots} /> WhatsApp Notifications
                </h3>
                <button className="wa-refresh" onClick={() => load()} title="Re-check now">
                    <FontAwesomeIcon icon={faRotate} />
                </button>
            </div>

            <div className={`wa-state is-${state.tone}`}>
                <FontAwesomeIcon icon={state.icon} className="wa-state-icon" />
                <div>
                    <strong className="wa-state-label">{state.label}</strong>
                    {status?.session?.phone && isReady && (
                        <span className="wa-phone">+{status.session.phone}</span>
                    )}
                    <p className="wa-state-help">{state.help}</p>
                    {status?.session?.status && !isReady && (
                        <p className="wa-raw">Gateway reports: <code>{status.session.status}</code></p>
                    )}
                </div>
            </div>

            {status?.configured && (
                <>
                    <div className="wa-actions">
                        <button
                            className="gts-btn primary"
                            onClick={handleStart}
                            disabled={Boolean(busy) || isReady}
                            title={isReady ? 'Already connected' : 'Start the WhatsApp session'}
                        >
                            {busy === 'start'
                                ? <><FontAwesomeIcon icon={faSpinner} spin /> Starting…</>
                                : <><FontAwesomeIcon icon={faPlay} /> Start</>}
                        </button>

                        <button
                            className="gts-btn danger"
                            onClick={handleStop}
                            disabled={Boolean(busy) || !status.gatewayUp}
                        >
                            {busy === 'stop'
                                ? <><FontAwesomeIcon icon={faSpinner} spin /> Stopping…</>
                                : <><FontAwesomeIcon icon={faStop} /> Stop</>}
                        </button>
                    </div>

                    {/* Message counters, when there is a live session to count
                        for. Answers "is anything actually going out" without
                        opening the gateway's own dashboard. */}
                    {isReady && status.messages && (
                        <div className="wa-stats">
                            <div className="wa-stat">
                                <span className="wa-stat-value">{status.messages.sent ?? 0}</span>
                                <span className="wa-stat-label">Sent</span>
                            </div>
                            <div className="wa-stat">
                                <span className="wa-stat-value">{status.messages.today ?? 0}</span>
                                <span className="wa-stat-label">Today</span>
                            </div>
                            <div className="wa-stat">
                                <span className="wa-stat-value">{status.messages.received ?? 0}</span>
                                <span className="wa-stat-label">Received</span>
                            </div>
                            <div className="wa-stat">
                                <span className={`wa-stat-value ${status.messages.failed ? 'is-bad' : ''}`}>
                                    {status.messages.failed ?? 0}
                                </span>
                                <span className="wa-stat-label">Failed</span>
                            </div>
                        </div>
                    )}

                    <section className="wa-section">
                        <h4 className="wa-section-title">Link a phone</h4>

                        {isReady ? (
                            <p className="wa-hint">
                                Already linked to <strong>+{status.session.phone}</strong>.
                                Stop the session first to link a different number.
                            </p>
                        ) : (
                            <>
                                <div className="wa-tabs">
                                    <button
                                        className={`wa-tab ${linkMode === 'code' ? 'is-on' : ''}`}
                                        onClick={() => setLinkMode('code')}
                                    >
                                        <FontAwesomeIcon icon={faKeyboard} /> Pairing code
                                    </button>
                                    <button
                                        className={`wa-tab ${linkMode === 'qr' ? 'is-on' : ''}`}
                                        onClick={() => setLinkMode('qr')}
                                    >
                                        <FontAwesomeIcon icon={faQrcode} /> QR code
                                    </button>
                                </div>

                                {linkMode === 'code' ? (
                                    <>
                                        <label className="input-label wa-field-label">
                                            Number to link <small>(digits only, with country code)</small>
                                        </label>
                                        <div className="wa-number-row">
                                            <input
                                                className="custom-input"
                                                placeholder="919876543210"
                                                value={number}
                                                onChange={(e) => setNumber(e.target.value)}
                                                disabled={Boolean(busy)}
                                            />
                                            <button className="gts-btn secondary" onClick={handlePair} disabled={Boolean(busy)}>
                                                {busy === 'start pairing'
                                                    ? <><FontAwesomeIcon icon={faSpinner} spin /> Preparing…</>
                                                    : <><FontAwesomeIcon icon={faLink} /> Get code</>}
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="wa-number-row">
                                        <button className="gts-btn secondary" onClick={handleQr} disabled={Boolean(busy)}>
                                            {busy === 'fetch the QR'
                                                ? <><FontAwesomeIcon icon={faSpinner} spin /> Preparing…</>
                                                : <><FontAwesomeIcon icon={faQrcode} /> Show QR</>}
                                        </button>
                                        <p className="wa-hint" style={{ margin: 0 }}>
                                            Starting the session takes up to ~30 seconds.
                                        </p>
                                    </div>
                                )}
                            </>
                        )}

                        {pairingCode && (
                            <div className="wa-pairing">
                                <p className="wa-pairing-lead">
                                    On the handset: <strong>WhatsApp → Settings → Linked Devices →
                                    Link a Device → Link with phone number instead</strong>, then enter:
                                </p>
                                <div className="wa-code">{pairingCode}</div>
                                <p className="wa-pairing-note">
                                    Expires in a few minutes. Press Get code again for a fresh one.
                                </p>
                            </div>
                        )}

                        {qr && (
                            <div className="wa-pairing">
                                <p className="wa-pairing-lead">
                                    On the handset: <strong>WhatsApp → Settings → Linked Devices →
                                    Link a Device</strong>, then scan:
                                </p>
                                <img src={qr} alt="WhatsApp linking QR code" className="wa-qr" />
                                <p className="wa-pairing-note">
                                    Refreshes every 20 seconds or so. Press Show QR again if it stops working.
                                </p>
                            </div>
                        )}
                    </section>

                    <section className="wa-section">
                        <h4 className="wa-section-title">Send a test message</h4>
                        <p className="wa-hint">
                            Goes through the same code a nudge uses, so a success here means
                            nudges will work — not just that the status says "connected".
                        </p>
                        <div className="wa-number-row">
                            <input
                                className="custom-input"
                                placeholder="919876543210"
                                value={number}
                                onChange={(e) => setNumber(e.target.value)}
                                disabled={Boolean(busy)}
                            />
                            <button
                                className="gts-btn secondary"
                                onClick={handleTest}
                                disabled={Boolean(busy) || !isReady}
                                title={isReady ? 'Send a test message' : 'Connect first'}
                            >
                                {busy === 'send the test'
                                    ? <><FontAwesomeIcon icon={faSpinner} spin /> Sending…</>
                                    : <><FontAwesomeIcon icon={faPaperPlane} /> Send test</>}
                            </button>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
};

export default WhatsAppControl;
