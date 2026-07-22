import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faUser, faEnvelope, faPhone, faMapMarkerAlt,
    faEdit, faSave, faTimes, faCamera,
    faIdCard, faFirstAid, faUserTie,
    faBriefcase, faBuilding, faLaptopHouse, faTint, faHome, faClock
} from '@fortawesome/free-solid-svg-icons';

const Profile = () => {
    const [user, setUser] = useState(null);
    const [isEditing, setIsEditing] = useState(false);

    // 👇 EXPANDED: Now holds all editable fields
    const [formData, setFormData] = useState({
        name: '', email: '', phoneNumber: '', currentAddress: '', permanentAddress: '',
        bloodGroup: '', aadhaar: '', emergencyContactName: '', emergencyContactRelation: '', emergencyContact: '',
        jobTitle: '', department: '', workLocation: '', shiftType: ''
    });

    const SERVER_URL = process.env.NODE_ENV === 'production'
        ? ''
        : 'http://localhost:5000';

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const res = await api.get('/auth/me');
            setUser(res.data);

            // 👇 EXPANDED: Pre-fill all data for the edit form
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
            console.error("Error fetching profile", err);
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const uploadData = new FormData();
        uploadData.append('avatar', file);
        Swal.fire({
            title: 'Uploading Profile Picture...',
            html: 'Please wait while we upload your image securely.',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const res = await api.post('/auth/upload-avatar', uploadData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    const content = Swal.getHtmlContainer();
                    if (content) {
                        content.textContent = `Uploading: ${percentCompleted}%`;
                    }
                }
            });

            setUser({ ...user, profilePic: res.data.filePath });

            const storedUser = JSON.parse(localStorage.getItem('user'));
            localStorage.setItem('user', JSON.stringify({ ...storedUser, profilePic: res.data.filePath }));

            Swal.fire({ icon: 'success', title: 'Picture Updated', timer: 1000, showConfirmButton: false });
        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'Image upload failed', 'error');
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            const res = await api.put('/auth/update-profile', formData);
            setUser(res.data);
            setIsEditing(false);

            const storedUser = JSON.parse(localStorage.getItem('user'));
            localStorage.setItem('user', JSON.stringify({ ...storedUser, name: res.data.name }));

            Swal.fire({ icon: 'success', title: 'Profile Updated', timer: 1500, showConfirmButton: false });
        } catch (err) {
            Swal.fire('Error', 'Could not update profile', 'error');
        }
    };

    if (!user) return <div className="main-content">Loading profile...</div>;

    const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();

    return (
        <div className="profile-container fade-in">
            <h1 className="page-title">My Profile</h1>

            <div className="profile-card">
                <div className="profile-header">
                    <div className="profile-avatar-container">
                        {user.profilePic ? (
                            <img
                                src={user.profilePic?.startsWith('http') ? user.profilePic : `${SERVER_URL}${user.profilePic}`}
                                alt="Profile"
                                className="profile-img-large"
                                onError={(e) => { e.target.onerror = null; e.target.src = '' }}
                            />
                        ) : (
                            <div className="profile-avatar-large">{initials}</div>
                        )}
                        <label htmlFor="avatar-upload" className="avatar-edit-icon">
                            <FontAwesomeIcon icon={faCamera} />
                            <input
                                type="file"
                                id="avatar-upload"
                                hidden
                                onChange={handleFileChange}
                                accept="image/*"
                            />
                        </label>
                    </div>

                    <div className="profile-info-text">
                        <h2>{user.name}</h2>
                        <span className={`role-tag ${user.role.toLowerCase()}`}>{user.role}</span>
                    </div>

                    {!isEditing && (
                        <button className="edit-profile-btn" onClick={() => setIsEditing(true)}>
                            <FontAwesomeIcon icon={faEdit} /> Edit Profile
                        </button>
                    )}
                </div>

                <hr className="profile-divider" />

                {isEditing ? (
                    <form onSubmit={handleUpdate} className="profile-form fade-in">
                        
                        {/* --- EMPLOYMENT INFO SECTION --- */}
                        <h3 style={{ color: '#215D7B', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '5px' }}>
                            Employment Information
                        </h3>
                        <div className="form-grid" style={{ marginBottom: '30px' }}>
                            <div className="form-group">
                                <label className="input-label">Job Title</label>
                                <input className="custom-input" type="text" value={formData.jobTitle} onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="input-label">Department</label>
                                <input className="custom-input" type="text" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="input-label">Work Location</label>
                                <input className="custom-input" type="text" value={formData.workLocation} onChange={(e) => setFormData({ ...formData, workLocation: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="input-label">Shift Type</label>
                                <select className="swal2-select custom-select" value={formData.shiftType} onChange={(e) => setFormData({ ...formData, shiftType: e.target.value })}>
                                    <option value="">Select Shift</option>
                                    <option value="DAY">Day Shift</option>
                                    <option value="NIGHT">Night Shift</option>
                                </select>
                            </div>
                        </div>

                        {/* --- PERSONAL INFO SECTION --- */}
                        <h3 style={{ color: '#215D7B', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '5px' }}>
                            Personal Information
                        </h3>
                        <div className="form-grid">
                            <div className="form-group">
                                <label className="input-label">Full Name *</label>
                                <input className="custom-input" type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label className="input-label">Work Email *</label>
                                <input className="custom-input" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label className="input-label">Phone Number</label>
                                <input className="custom-input" type="text" value={formData.phoneNumber} onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })} placeholder="+91 ..." />
                            </div>
                            <div className="form-group">
                                <label className="input-label">Blood Group</label>
                                <input className="custom-input" type="text" value={formData.bloodGroup} onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })} placeholder="e.g. O+" />
                            </div>
                            <div className="form-group">
                                <label className="input-label">Government ID Number</label>
                                <input className="custom-input" type="text" value={formData.aadhaar} onChange={(e) => setFormData({ ...formData, aadhaar: e.target.value })} placeholder="XXXX-XXXX-XXXX" />
                            </div>
                            <div className="form-group grid-span-2">
                                <label className="input-label">Emergency Contact Name</label>
                                <input className="custom-input" type="text" value={formData.emergencyContactName} onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })} placeholder="Name of contact person" />
                            </div>
                            <div className="form-group">
                                <label className="input-label">Emergency Relation</label>
                                <input className="custom-input" type="text" value={formData.emergencyContactRelation} onChange={(e) => setFormData({ ...formData, emergencyContactRelation: e.target.value })} placeholder="e.g. Spouse, Parent" />
                            </div>
                            <div className="form-group">
                                <label className="input-label">Emergency Phone</label>
                                <input className="custom-input" type="text" value={formData.emergencyContact} onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })} placeholder="+91 ..." />
                            </div>
                            <div className="form-group grid-span-2">
                                <label className="input-label">Current Address</label>
                                <input className="custom-input" type="text" value={formData.currentAddress} onChange={(e) => setFormData({ ...formData, currentAddress: e.target.value })} placeholder="Current city, state" />
                            </div>
                            <div className="form-group grid-span-2">
                                <label className="input-label">Permanent Address</label>
                                <input className="custom-input" type="text" value={formData.permanentAddress} onChange={(e) => setFormData({ ...formData, permanentAddress: e.target.value })} placeholder="Permanent city, state" />
                            </div>
                        </div>

                        <div className="profile-actions" style={{ marginTop: '20px' }}>
                            <button type="submit" className="save-btn"><FontAwesomeIcon icon={faSave} className="btn-icon" /> Save Changes</button>
                            <button type="button" className="cancel-btn" onClick={() => setIsEditing(false)}><FontAwesomeIcon icon={faTimes} className="btn-icon" /> Cancel</button>
                        </div>
                    </form>
                ) : (
                    <div className="profile-details-grid fade-in">
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faBriefcase} className="detail-icon" />
                            <div><label>Job Title</label><p>{user.jobTitle || 'Not provided'}</p></div>
                        </div>
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faBuilding} className="detail-icon" />
                            <div><label>Department</label><p>{user.department || 'Not provided'}</p></div>
                        </div>
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faLaptopHouse} className="detail-icon" />
                            <div><label>Work Location</label><p>{user.workLocation || 'Not set'}{user.employmentType ? ` · ${user.employmentType}` : ''}</p></div>
                        </div>
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faClock} className="detail-icon"/>
                            <div>
                                <label>Shift Type</label>
                                <p className="fw-600 tracking-wide">
                                    {user.shiftType === 'NIGHT' ? 'Night Shift' : 'Day Shift'}
                                </p>
                            </div>
                        </div>
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faEnvelope} className="detail-icon" />
                            <div><label>Email Address</label><p>{user.email}{user.workEmail ? <><br /><span className="text-small text-muted">{user.workEmail}</span></> : ''}</p></div>
                        </div>
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faPhone} className="detail-icon" />
                            <div><label>Phone Number</label><p>{user.phoneNumber || 'Not provided'}</p></div>
                        </div>
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faTint} className="detail-icon" />
                            <div><label>Blood Group</label><p>{user.bloodGroup || 'Not provided'}</p></div>
                        </div>

                        <div className="detail-item">
                            <FontAwesomeIcon icon={faIdCard} className="detail-icon" />
                            <div>
                                <label>Government ID</label>
                                <p className="tracking-wide fw-600">
                                    {user.aadhaar || 'Pending HR Update'}
                                </p>
                            </div>
                        </div>
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faFirstAid} className="detail-icon" />
                            <div>
                                <label>Emergency Contact</label>
                                <p className="tracking-wide fw-600">
                                    {user.emergencyContactName ? `${user.emergencyContactName}${user.emergencyContactRelation ? ` (${user.emergencyContactRelation})` : ''}` : ''}
                                    {user.emergencyContact ? <><br /><span className="text-small text-muted fw-normal">{user.emergencyContact}</span></> : (!user.emergencyContactName && 'Not provided')}
                                </p>
                            </div>
                        </div>

                        {/* --- REPORTING MANAGER FIELD (Still static as it references another user) --- */}
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faUserTie} className="detail-icon text-primary" />
                            <div>
                                <label>Reporting Manager</label>
                                {user.reportingManagerName ? (
                                    <p className="fw-500">
                                        {user.reportingManagerName} <br />
                                        <span className="text-small text-muted fw-normal">{user.reportingManagerEmail}</span>
                                    </p>
                                ) : (
                                    <p className="text-muted italic">Not Assigned</p>
                                )}
                            </div>
                        </div>

                        <div className="detail-item">
                            <FontAwesomeIcon icon={faMapMarkerAlt} className="detail-icon" />
                            <div><label>Current Address</label><p>{user.currentAddress || user.address || 'Not provided'}</p></div>
                        </div>
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faHome} className="detail-icon" />
                            <div><label>Permanent Address</label><p>{user.permanentAddress || 'Not provided'}</p></div>
                        </div>
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faUser} className="detail-icon" />
                            <div><label>Member Since</label><p>{new Date(user.createdAt).toLocaleDateString('en-GB')}</p></div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Profile;