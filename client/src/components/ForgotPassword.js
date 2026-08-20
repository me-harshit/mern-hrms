import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSpinner, faArrowLeft, faEye, faEyeSlash, faCheckCircle
} from '@fortawesome/free-solid-svg-icons';
import api from '../utils/api';

const MIN_LENGTH = 8;
const RESEND_SECONDS = 60;

/**
 * Three steps: request a code by email, verify the 6-digit code, then set a
 * new password. The email is carried through all three so the server can match
 * the account without a session.
 */
const ForgotPassword = ({ initialEmail = '', onBack, onDone }) => {
    const [step, setStep] = useState('email'); // email | code | password
    const [email, setEmail] = useState(initialEmail);
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [cooldown, setCooldown] = useState(0);

    // Countdown so people don't hammer the send button.
    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setTimeout(() => setCooldown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    const sendCode = async (e) => {
        if (e) e.preventDefault();
        if (!email.trim()) return setError('Enter your registered email');

        setBusy(true);
        setError('');
        try {
            const res = await api.post('/auth/forgot-password', { email: email.trim() });
            setStep('code');
            setCooldown(RESEND_SECONDS);
            Swal.fire({
                icon: 'info',
                title: 'Check your email',
                text: res.data.message,
                timer: 3200,
                showConfirmButton: false
            });
        } catch (err) {
            setError(err.response?.data?.message || 'Could not send the code. Try again.');
        } finally {
            setBusy(false);
        }
    };

    const verifyCode = async (e) => {
        e.preventDefault();
        if (code.trim().length !== 6) return setError('Enter the 6-digit code');

        setBusy(true);
        setError('');
        try {
            await api.post('/auth/verify-reset-code', { email: email.trim(), code: code.trim() });
            setStep('password');
        } catch (err) {
            setError(err.response?.data?.message || 'That code did not work.');
        } finally {
            setBusy(false);
        }
    };

    const resetPassword = async (e) => {
        e.preventDefault();
        if (password.length < MIN_LENGTH) return setError(`Password must be at least ${MIN_LENGTH} characters`);
        if (password !== confirm) return setError('Passwords do not match');

        setBusy(true);
        setError('');
        try {
            await api.post('/auth/reset-password', {
                email: email.trim(),
                code: code.trim(),
                newPassword: password
            });
            await Swal.fire({
                icon: 'success',
                title: 'Password reset',
                text: 'You can sign in with your new password now.',
                timer: 2600,
                showConfirmButton: false
            });
            onDone ? onDone(email.trim()) : onBack();
        } catch (err) {
            const msg = err.response?.data?.message || 'Could not reset the password.';
            setError(msg);
            // An expired or burnt-out code means starting over.
            if (/expired|Too many/i.test(msg)) setStep('email');
        } finally {
            setBusy(false);
        }
    };

    const steps = ['email', 'code', 'password'];
    const stepIndex = steps.indexOf(step);

    return (
        <div className="forgot-panel">
            <button type="button" className="forgot-back" onClick={onBack} disabled={busy}>
                <FontAwesomeIcon icon={faArrowLeft} /> Back to sign in
            </button>

            <h2>Reset your password</h2>

            <div className="forgot-steps">
                {['Email', 'Code', 'New password'].map((label, i) => (
                    <div key={label} className={`forgot-step ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}>
                        <span className="forgot-step-dot">
                            {i < stepIndex ? <FontAwesomeIcon icon={faCheckCircle} /> : i + 1}
                        </span>
                        <span className="forgot-step-label">{label}</span>
                    </div>
                ))}
            </div>

            {error && <div className="forgot-error">{error}</div>}

            {step === 'email' && (
                <form onSubmit={sendCode}>
                    <p className="auth-subtitle">
                        Enter your registered email and we'll send a 6-digit code.
                    </p>
                    <div className="form-group">
                        <label>Registered Email</label>
                        <input
                            className="auth-input" type="email" value={email} autoFocus
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="e.g. employee@gts.com" disabled={busy}
                        />
                    </div>
                    <button type="submit" className="auth-btn" disabled={busy}>
                        {busy ? <><FontAwesomeIcon icon={faSpinner} spin /> Sending...</> : 'Send Code'}
                    </button>
                </form>
            )}

            {step === 'code' && (
                <form onSubmit={verifyCode}>
                    <p className="auth-subtitle">
                        We sent a code to <strong>{email}</strong>. It expires in 10 minutes.
                    </p>
                    <div className="form-group">
                        <label>6-Digit Code</label>
                        <input
                            className="auth-input code-input"
                            type="text" inputMode="numeric" maxLength={6} autoFocus
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="000000" disabled={busy}
                        />
                    </div>
                    <button type="submit" className="auth-btn" disabled={busy || code.length !== 6}>
                        {busy ? <><FontAwesomeIcon icon={faSpinner} spin /> Checking...</> : 'Verify Code'}
                    </button>
                    <button
                        type="button" className="forgot-link" disabled={busy || cooldown > 0}
                        onClick={() => sendCode()}
                    >
                        {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                    </button>
                </form>
            )}

            {step === 'password' && (
                <form onSubmit={resetPassword}>
                    <p className="auth-subtitle">Choose a new password for <strong>{email}</strong>.</p>

                    <div className="form-group">
                        <label>New Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="auth-input" type={showPw ? 'text' : 'password'} autoFocus
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                placeholder={`At least ${MIN_LENGTH} characters`} disabled={busy}
                                autoComplete="new-password" style={{ paddingRight: '40px' }}
                            />
                            <span
                                onClick={() => setShowPw(!showPw)}
                                style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#666' }}
                            >
                                <FontAwesomeIcon icon={showPw ? faEye : faEyeSlash} />
                            </span>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Confirm New Password</label>
                        <input
                            className="auth-input" type={showPw ? 'text' : 'password'}
                            value={confirm} onChange={(e) => setConfirm(e.target.value)}
                            placeholder="Repeat the new password" disabled={busy}
                            autoComplete="new-password"
                        />
                    </div>

                    <button type="submit" className="auth-btn" disabled={busy}>
                        {busy ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</> : 'Reset Password'}
                    </button>
                </form>
            )}
        </div>
    );
};

export default ForgotPassword;
