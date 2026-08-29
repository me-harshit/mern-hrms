import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faEdit, faSave, faTimes, faCamera, faSpinner,
    faBriefcase, faAddressBook
} from '@fortawesome/free-solid-svg-icons';
import ChangePassword from '../../components/ChangePassword';
import Avatar from '../../components/Avatar';
import ImageEditor from '../../components/ImageEditor';
import AssigneePopup from '../../components/AssigneePopup';
import '../../styles/App.css';
import '../../styles/profile.css';

/**
 * A single bordered card holding every part of the profile, hairline-separated
 * into sections, with each section's action in a tinted footer bar.
 *
 * Security used to sit in its own card below the profile, which read as an
 * unrelated feature bolted on; it is now the card's last section.
 */
const Profile = () => {
    const [user, setUser] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        name: '', email: '', phoneNumber: '', currentAddress: '', permanentAddress: '',
        bloodGroup: '', aadhaar: '', emergencyContactName: '', emergencyContactRelation: '', emergencyContact: '',
        jobTitle: '', department: '', workLocation: '', shiftType: ''
    });

    useEffect(() => { fetchProfile(); }, []);

    const fetchProfile = async () => {
        try {
            const res = await api.get('/auth/me');
            setUser(res.data);
            setFormData({
                name: res.data.name || '',
                email: res.data.email || '',
                phoneNumber: res.data.phoneNumber || '',
                currentAddress: res.data.currentAddress || res.data.address || '',
                permanentAddress: res.data.permanentAddress || '',
                bloodGroup: res.data.bloodGroup || '',
                aadhaar: res.data.aadhaar || '',
                emergencyContactName: res.data.emergencyContactName || '',
                emergencyContactRelation: res.data.emergencyContactRelation || '',
                emergencyContact: res.data.emergencyContact || '',
                jobTitle: res.data.jobTitle || '',
                department: res.data.department || '',
                workLocation: res.data.workLocation || '',
                shiftType: res.data.shiftType || ''
            });
        } catch (err) {
            console.error('Error fetching profile', err);
        }
    };

    // The picture the user chose, held while they crop it. Uploading only
    // happens once they accept the result.
    const [pendingPhoto, setPendingPhoto] = useState(null);
    // Viewing your own picture at full size. Reuses the popup the task
    // lists open, which already handles the no-photo case by showing
    // large initials instead of an empty frame.
    const [viewingPhoto, setViewingPhoto] = useState(false);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        // Cleared so choosing the same file again still fires a change event,
        // which it otherwise would not after a cancel.
        e.target.value = '';
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            return Swal.fire('Not an image', 'Please choose a picture file.', 'warning');
        }

        setPendingPhoto(file);
    };

    /**
     * Upload the cropped result.
     *
     * What arrives here is already an 800px square JPEG produced by the editor
     * -- a couple of hundred KB against an original that can be several
     * megabytes -- so the slow part of this used to be sending pixels the
     * server was about to throw away.
     */
    const uploadPhoto = async (file) => {
        setPendingPhoto(null);

        const uploadData = new FormData();
        uploadData.append('avatar', file);
        Swal.fire({
            title: 'Uploading Profile Picture...',
            html: 'Please wait while we upload your image securely.',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const res = await api.post('/auth/upload-avatar', uploadData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    const content = Swal.getHtmlContainer();
                    if (content) content.textContent = `Uploading: ${percentCompleted}%`;
                }
            });

            setUser({ ...user, profilePic: res.data.filePath });

            const storedUser = JSON.parse(localStorage.getItem('user'));
            localStorage.setItem('user', JSON.stringify({ ...storedUser, profilePic: res.data.filePath }));

            Swal.fire({ icon: 'success', title: 'Picture Updated', timer: 1000, showConfirmButton: false });
        } catch (err) {
            console.error(err);
            Swal.fire('Error', err.response?.data?.message || 'Image upload failed', 'error');
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await api.put('/auth/update-profile', formData);
            setUser(res.data);
            setIsEditing(false);

            const storedUser = JSON.parse(localStorage.getItem('user'));
            localStorage.setItem('user', JSON.stringify({ ...storedUser, name: res.data.name }));

            Swal.fire({ icon: 'success', title: 'Profile Updated', timer: 1500, showConfirmButton: false });
        } catch (err) {
            Swal.fire('Error', 'Could not update profile', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (!user) {
        return (
            <div className="main-content">
                <div className="pf-page">
                    <div className="pf-card">
                        <div className="pf-hero" style={{ color: '#6b7280' }}>Loading profile...</div>
                    </div>
                </div>
            </div>
        );
    }

    // An unset field says so quietly rather than shouting "Not provided" in the
    // same weight as real data.
    const Field = ({ label, value, sub, span, mono }) => (
        <div className={span ? 'pf-span-2' : undefined}>
            <span className="pf-field-label">{label}</span>
            <p className={`pf-field-value ${value ? '' : 'is-empty'} ${mono ? 'pf-mono' : ''}`}>
                {value || '—'}
                {value && sub && <span className="pf-field-sub">{sub}</span>}
            </p>
        </div>
    );

    const input = (label, key, placeholder, span) => (
        <div className={`form-group ${span ? 'pf-span-2' : ''}`}>
            <label className="input-label">{label}</label>
            <input
                className="custom-input"
                type="text"
                value={formData[key]}
                onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                placeholder={placeholder}
            />
        </div>
    );

    const managers = user.reportingManagerName || [];

    return (
        <div className="profile-container fade-in">
            <div className="pf-page">
                <h1 className="pf-page-title">My Profile</h1>
                <p className="pf-page-sub">Your personal and employment details, and your sign-in password.</p>

                <div className="pf-card">
                    {/* ---------- hero ---------- */}
                    <div className="pf-hero">
                        <div className="pf-avatar-wrap">
                            <Avatar
                                name={user.name}
                                profilePic={user.profilePic}
                                className={`${user.profilePic ? 'pf-avatar-img' : 'pf-avatar'} pf-avatar-view`}
                                title="View your photo"
                                onClick={() => setViewingPhoto(true)}
                            />
                            <label htmlFor="avatar-upload" className="pf-avatar-edit" title="Change photo">
                                <FontAwesomeIcon icon={faCamera} />
                                <input type="file" id="avatar-upload" hidden onChange={handleFileChange} accept="image/*" />
                            </label>
                        </div>

                        <div className="pf-identity">
                            <h2 className="pf-name">{user.name}</h2>
                            <div className="pf-meta">
                                <span className="pf-role">{user.role}</span>
                                {user.jobTitle && <><span className="pf-dot" />{user.jobTitle}</>}
                                <span className="pf-dot" />
                                <span>{user.email}</span>
                            </div>
                        </div>

                        {!isEditing && (
                            <div className="pf-hero-actions">
                                <button className="gts-btn secondary" onClick={() => setIsEditing(true)}>
                                    <FontAwesomeIcon icon={faEdit} /> Edit profile
                                </button>
                            </div>
                        )}
                    </div>

                    {isEditing ? (
                        <form onSubmit={handleUpdate}>
                            <div className="pf-section">
                                <div className="pf-section-head">
                                    <h2 className="pf-section-title"><FontAwesomeIcon icon={faBriefcase} /> Employment</h2>
                                    <p className="pf-section-desc">Where you sit in the company and which shift you work.</p>
                                </div>
                                <div className="pf-form-grid">
                                    {input('Job title', 'jobTitle', 'e.g. Software Engineer')}
                                    {input('Department', 'department', 'e.g. Engineering')}
                                    {input('Work location', 'workLocation', 'e.g. WFO')}
                                    <div className="form-group">
                                        <label className="input-label">Shift type</label>
                                        <select
                                            className="swal2-select custom-select"
                                            value={formData.shiftType}
                                            onChange={(e) => setFormData({ ...formData, shiftType: e.target.value })}
                                        >
                                            <option value="">Select shift</option>
                                            <option value="DAY">Day shift</option>
                                            <option value="NIGHT">Night shift</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="pf-section">
                                <div className="pf-section-head">
                                    <h2 className="pf-section-title"><FontAwesomeIcon icon={faAddressBook} /> Personal</h2>
                                    <p className="pf-section-desc">How the company reaches you, and who to call in an emergency.</p>
                                </div>
                                <div className="pf-form-grid">
                                    <div className="form-group">
                                        <label className="input-label">Full name *</label>
                                        <input className="custom-input" type="text" required
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="input-label">Work email *</label>
                                        <input className="custom-input" type="email" required
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                                    </div>
                                    {input('Phone number', 'phoneNumber', '+91 ...')}
                                    {input('Blood group', 'bloodGroup', 'e.g. O+')}
                                    {input('Government ID', 'aadhaar', 'XXXX-XXXX-XXXX')}
                                    {input('Emergency contact name', 'emergencyContactName', 'Name of contact person')}
                                    {input('Emergency relation', 'emergencyContactRelation', 'e.g. Spouse, Parent')}
                                    {input('Emergency phone', 'emergencyContact', '+91 ...')}
                                    {input('Current address', 'currentAddress', 'Current city, state', true)}
                                    {input('Permanent address', 'permanentAddress', 'Permanent city, state', true)}
                                </div>
                            </div>

                            <div className="pf-bar">
                                <p className="pf-bar-note">Changes apply immediately across the portal.</p>
                                <div className="pf-bar-actions">
                                    <button type="button" className="gts-btn secondary" disabled={saving}
                                        onClick={() => { setIsEditing(false); fetchProfile(); }}>
                                        <FontAwesomeIcon icon={faTimes} /> Cancel
                                    </button>
                                    <button type="submit" className="gts-btn primary" disabled={saving}>
                                        {saving
                                            ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</>
                                            : <><FontAwesomeIcon icon={faSave} /> Save changes</>}
                                    </button>
                                </div>
                            </div>
                        </form>
                    ) : (
                        <>
                            <div className="pf-section">
                                <div className="pf-section-head">
                                    <h2 className="pf-section-title"><FontAwesomeIcon icon={faBriefcase} /> Employment</h2>
                                </div>
                                <div className="pf-grid">
                                    <Field label="Job title" value={user.jobTitle} />
                                    <Field label="Department" value={user.department} />
                                    <Field
                                        label="Work location"
                                        value={user.workLocation}
                                        sub={user.employmentType}
                                    />
                                    <Field label="Shift" value={user.shiftType === 'NIGHT' ? 'Night shift' : 'Day shift'} />
                                    <Field
                                        label="Reporting managers"
                                        value={managers.length ? managers.join(', ') : ''}
                                        sub={(user.reportingManagerEmail || []).join(', ')}
                                    />
                                    <Field
                                        label="Member since"
                                        value={new Date(user.createdAt).toLocaleDateString('en-GB', {
                                            day: '2-digit', month: 'short', year: 'numeric'
                                        })}
                                    />
                                </div>
                            </div>

                            <div className="pf-section">
                                <div className="pf-section-head">
                                    <h2 className="pf-section-title"><FontAwesomeIcon icon={faAddressBook} /> Personal</h2>
                                </div>
                                <div className="pf-grid">
                                    <Field label="Email" value={user.email} sub={user.workEmail} />
                                    <Field label="Phone" value={user.phoneNumber} />
                                    <Field label="Blood group" value={user.bloodGroup} />
                                    <Field label="Government ID" value={user.aadhaar} mono />
                                    <Field
                                        label="Emergency contact"
                                        value={user.emergencyContactName
                                            ? `${user.emergencyContactName}${user.emergencyContactRelation ? ` (${user.emergencyContactRelation})` : ''}`
                                            : ''}
                                        sub={user.emergencyContact}
                                    />
                                    <Field label="Current address" value={user.currentAddress || user.address} />
                                    <Field label="Permanent address" value={user.permanentAddress} span />
                                </div>
                            </div>

                            {/* Security is a section of this card, not a card of its own. */}
                            <ChangePassword />
                        </>
                    )}
                </div>
            </div>
            {/* Shown between choosing a file and uploading it, so the
                picture that reaches S3 is the one the user framed. */}
            {pendingPhoto && (
                <ImageEditor
                    file={pendingPhoto}
                    onCancel={() => setPendingPhoto(null)}
                    onConfirm={uploadPhoto}
                />
            )}

            <AssigneePopup
                open={viewingPhoto}
                onClose={() => setViewingPhoto(false)}
                title="Your photo"
                subtitle={user.jobTitle || user.role}
                people={[user]}
            />

        </div>
    );
};

export default Profile;
