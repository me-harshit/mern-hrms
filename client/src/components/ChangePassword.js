import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faEye, faEyeSlash, faSpinner, faKey } from '@fortawesome/free-solid-svg-icons';
import api from '../utils/api';
import '../styles/Auth.css';

const MIN_LENGTH = 8;

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
            <div className="pw-input-wrap">
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
                <button type="button" className="pw-toggle" onClick={() => toggle(key)} tabIndex={-1}
                    title={show[key] ? 'Hide' : 'Show'}>
                    <FontAwesomeIcon icon={show[key] ? faEyeSlash : faEye} />
                </button>
            </div>
        </div>
    );

    return (
        <div className="control-card p-20" style={{ marginTop: '20px' }}>
            <div className="pw-card-head">
                <h3 style={{ color: '#215D7B', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FontAwesomeIcon icon={faLock} /> Password
                </h3>
                {!open && (
                    <button className="gts-btn secondary" onClick={() => setOpen(true)}>
                        <FontAwesomeIcon icon={faKey} /> Change Password
                    </button>
                )}
            </div>

            {!open ? (
                <p className="text-muted" style={{ margin: '10px 0 0', fontSize: '0.85rem' }}>
                    Choose something at least {MIN_LENGTH} characters long that you don't use elsewhere.
                </p>
            ) : (
                <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
                    <div className="form-grid">
                        {field('Current Password', 'currentPassword', 'current', 'Your existing password')}
                        {field('New Password', 'newPassword', 'next', `At least ${MIN_LENGTH} characters`)}
                        {field('Confirm New Password', 'confirmPassword', 'confirm', 'Repeat the new password')}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                        <button type="submit" className="gts-btn primary" disabled={saving}>
                            {saving
                                ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</>
                                : <><FontAwesomeIcon icon={faLock} /> Update Password</>}
                        </button>
                        <button type="button" className="gts-btn secondary" disabled={saving}
                            onClick={() => { reset(); setOpen(false); }}>
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};

export default ChangePassword;
