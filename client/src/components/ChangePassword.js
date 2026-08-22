import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faEye, faEyeSlash, faSpinner, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import api from '../utils/api';
import '../styles/profile.css';

const MIN_LENGTH = 8;

/**
 * The Security section of the profile card.
 *
 * Renders as a section *inside* the profile card rather than as a card of its
 * own — a floating "Password" panel below the profile read as a separate,
 * unrelated feature. Collapsed it is one line plus an action in the footer bar;
 * expanded it becomes the three fields, matching how the rest of the card
 * behaves when edited.
 */
const ChangePassword = () => {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [show, setShow] = useState({ current: false, next: false, confirm: false });
    const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

    const reset = () => {
        setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setShow({ current: false, next: false, confirm: false });
    };

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
    const toggle = (field) => setShow(prev => ({ ...prev, [field]: !prev[field] }));

    // Mirrors the server rules so the user hears about problems before submitting.
    const problem = () => {
        if (!form.currentPassword) return 'Enter your current password';
        if (form.newPassword.length < MIN_LENGTH) return `New password must be at least ${MIN_LENGTH} characters`;
        if (form.newPassword !== form.confirmPassword) return 'New passwords do not match';
        if (form.newPassword === form.currentPassword) return 'New password must be different from the current one';
        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const issue = problem();
        if (issue) return Swal.fire('Check your details', issue, 'warning');

        setSaving(true);
        try {
            await api.put('/auth/change-password', {
                currentPassword: form.currentPassword,
                newPassword: form.newPassword
            });
            reset();
            setOpen(false);
            Swal.fire({
                icon: 'success',
                title: 'Password changed',
                text: 'Use your new password the next time you sign in.',
                timer: 2500,
                showConfirmButton: false
            });
        } catch (err) {
            Swal.fire('Could not change password', err.response?.data?.message || 'Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const field = (label, name, key, placeholder) => (
        <div className="form-group">
            <label className="input-label">{label}</label>
            <div className="pf-pw-wrap">
                <input
                    className="custom-input"
                    type={show[key] ? 'text' : 'password'}
                    name={name}
                    value={form[name]}
                    onChange={handleChange}
                    placeholder={placeholder}
                    autoComplete={name === 'currentPassword' ? 'current-password' : 'new-password'}
                    disabled={saving}
                />
                <button type="button" className="pf-pw-toggle" onClick={() => toggle(key)} tabIndex={-1}
                    title={show[key] ? 'Hide' : 'Show'}>
                    <FontAwesomeIcon icon={show[key] ? faEyeSlash : faEye} />
                </button>
            </div>
        </div>
    );

    if (!open) {
        return (
            <>
                <div className="pf-section">
                    <div className="pf-section-head" style={{ marginBottom: 0 }}>
                        <h2 className="pf-section-title">
                            <FontAwesomeIcon icon={faShieldHalved} /> Security
                        </h2>
                        <p className="pf-section-desc">
                            Your password is used to sign in to the portal.
                        </p>
                    </div>
                </div>
                <div className="pf-bar">
                    <p className="pf-bar-note">
                        Use at least {MIN_LENGTH} characters, and something you don&apos;t use elsewhere.
                    </p>
                    <div className="pf-bar-actions">
                        <button type="button" className="gts-btn secondary" onClick={() => setOpen(true)}>
                            <FontAwesomeIcon icon={faLock} /> Change password
                        </button>
                    </div>
                </div>
            </>
        );
    }

    return (
        <form onSubmit={handleSubmit}>
            <div className="pf-section">
                <div className="pf-section-head">
                    <h2 className="pf-section-title">
                        <FontAwesomeIcon icon={faShieldHalved} /> Change password
                    </h2>
                    <p className="pf-section-desc">
                        You&apos;ll stay signed in here, but will need the new password next time.
                    </p>
                </div>

                <div className="pf-pw-grid">
                    {field('Current password', 'currentPassword', 'current', 'Your existing password')}
                    {field('New password', 'newPassword', 'next', `At least ${MIN_LENGTH} characters`)}
                    {field('Confirm new password', 'confirmPassword', 'confirm', 'Repeat the new password')}
                </div>
            </div>

            <div className="pf-bar">
                <p className="pf-bar-note">Minimum {MIN_LENGTH} characters.</p>
                <div className="pf-bar-actions">
                    <button type="button" className="gts-btn secondary" disabled={saving}
                        onClick={() => { reset(); setOpen(false); }}>
                        Cancel
                    </button>
                    <button type="submit" className="gts-btn primary" disabled={saving}>
                        {saving
                            ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</>
                            : <>Update password</>}
                    </button>
                </div>
            </div>
        </form>
    );
};

export default ChangePassword;
