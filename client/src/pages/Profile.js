import React, { useState, useEffect } from 'react';
import api from '../utils/api'; // Import api util
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faUser, faEnvelope, faPhone, faMapMarkerAlt, 
    faEdit, faSave, faTimes, faCamera,
    faIdCard, faFirstAid 
} from '@fortawesome/free-solid-svg-icons';

const Profile = () => {
    const [user, setUser] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    
    // Form data only includes editable fields
    const [formData, setFormData] = useState({
        name: '', email: '', phoneNumber: '', address: ''
    });

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            // Use api.get with relative path
            const res = await api.get('/auth/me');
            setUser(res.data);
            
            // Only set editable fields in formData
            setFormData({
                name: res.data.name,
                email: res.data.email,
                phoneNumber: res.data.phoneNumber || '',
                address: res.data.address || ''
            });
        } catch (err) {
            console.error("Error fetching profile", err);
        }
    };

    // --- LOGIC: Handle Profile Picture Upload ---
    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const uploadData = new FormData();
        uploadData.append('avatar', file);

        try {
            // Use api.post. We must override Content-Type for file uploads.
            // Token is still added automatically by api.js
            const res = await api.post('/auth/upload-avatar', uploadData, {
                headers: { 
                    'Content-Type': 'multipart/form-data'
                }
            });
            
            // Update local state to show the new image immediately
            setUser({ ...user, profilePic: res.data.filePath });
            
            // Sync with localStorage
            const storedUser = JSON.parse(localStorage.getItem('user'));
            localStorage.setItem('user', JSON.stringify({ ...storedUser, profilePic: res.data.filePath }));

            Swal.fire({ icon: 'success', title: 'Picture Updated', timer: 1000, showConfirmButton: false });
        } catch (err) {
            Swal.fire('Error', 'Image upload failed', 'error');
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            // Use api.put with relative path
            const res = await api.put('/auth/update-profile', formData);
            setUser(res.data);
            setIsEditing(false);
            
            // Sync with localStorage for Topbar/Sidebar
            const storedUser = JSON.parse(localStorage.getItem('user'));
            localStorage.setItem('user', JSON.stringify({ ...storedUser, name: res.data.name }));

            Swal.fire({ icon: 'success', title: 'Profile Updated', timer: 1500, showConfirmButton: false });
        } catch (err) {
            Swal.fire('Error', 'Could not update profile', 'error');
        }
    };

    if (!user) return <div className="main-content">Loading profile...</div>;

    const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
    const SERVER_URL = 'http://localhost:5000'; // Helper for static images

    return (
        <div className="profile-container">
            <h1 className="page-title">My Profile</h1>
            
            <div className="profile-card">
                <div className="profile-header">
                    {/* Avatar Container with Upload Overlay */}
                    <div className="profile-avatar-container">
                        {user.profilePic ? (
                            <img 
                                src={`${SERVER_URL}${user.profilePic}`} 
                                alt="Profile" 
                                className="profile-img-large" 
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
                    <form onSubmit={handleUpdate} className="profile-form">
                        <div className="form-grid">
                            <div className="form-group">
                                <label>Full Name</label>
                                <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label>Work Email</label>
                                <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label>Phone Number</label>
                                <input type="text" value={formData.phoneNumber} onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})} placeholder="+91 ..." />
                            </div>
                            <div className="form-group">
                                <label>Address</label>
                                <input type="text" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} placeholder="City, Country" />
                            </div>
                        </div>
                        <div className="profile-actions">
                            <button type="submit" className="save-btn"><FontAwesomeIcon icon={faSave} /> Save Changes</button>
                            <button type="button" className="cancel-btn" onClick={() => setIsEditing(false)}><FontAwesomeIcon icon={faTimes} /> Cancel</button>
                        </div>
                    </form>
                ) : (
                    <div className="profile-details-grid">
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faEnvelope} className="detail-icon" />
                            <div><label>Email Address</label><p>{user.email}</p></div>
                        </div>
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faPhone} className="detail-icon" />
                            <div><label>Phone Number</label><p>{user.phoneNumber || 'Not provided'}</p></div>
                        </div>
                        
                        {/* --- NEW READ-ONLY FIELDS --- */}
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faIdCard} className="detail-icon" />
                            <div>
                                <label>Aadhaar Number</label>
                                <p style={{ letterSpacing: '1px', fontWeight: '600' }}>
                                    {user.aadhaar || 'Pending HR Update'}
                                </p>
                            </div>
                        </div>
                        <div className="detail-item">
                            <FontAwesomeIcon icon={faFirstAid} className="detail-icon" style={{ letterSpacing: '1px', fontWeight: '600' }} />
                            <div>
                                <label>Emergency Contact</label>
                                <p>{user.emergencyContact || 'Not provided'}</p>
                            </div>
                        </div>
                        {/* ----------------------------- */}

                        <div className="detail-item">
                            <FontAwesomeIcon icon={faMapMarkerAlt} className="detail-icon" />
                            <div><label>Address</label><p>{user.address || 'Not provided'}</p></div>
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