import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserCircle, faCog, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
import Swal from 'sweetalert2';

const Topbar = () => {
    const navigate = useNavigate();
    
    // Get real user data from localStorage
    const userData = JSON.parse(localStorage.getItem('user'));
    const userName = userData?.name || "User";
    
    // Generate Initials (e.g., "Harshit Tiwari" -> "HT")
    const initials = userName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase();

    const handleLogout = () => {
        Swal.fire({
            title: 'Logout?',
            text: "Are you sure you want to end your session?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#215D7B',
            cancelButtonColor: '#A6477F',
            confirmButtonText: 'Yes, Logout',
            cancelButtonText: 'Stay logged in'
        }).then((result) => {
            if (result.isConfirmed) {
                // IMPORTANT: Clear user data so ProtectedRoutes work
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                
                // Redirect and force a fresh state
                navigate('/login');
                window.location.reload(); 
            }
        });
    };

    return (
        <div className="topbar">
            {/* 1. Logo Section */}
            <div className="topbar-logo">
                <img src="/GTS.png" alt="GTS Logo" />
            </div>

            {/* 2. User Profile Section */}
            <div className="profile-trigger">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                    <span style={{ color: '#7A7A7A', fontSize: '14px', fontWeight: '500' }}>
                        Hi, {userName.split(' ')[0]}
                    </span>
                    <div className="profile-badge">{initials}</div>
                </div>

                <div className="dropdown-menu">
                    <div className="dropdown-header">
                        <p className="user-full-name">{userName}</p>
                        <p className="user-role-tag">{userData?.role}</p>
                    </div>
                    
                    <Link to="/profile" className="dropdown-link">
                        <FontAwesomeIcon icon={faUserCircle} className="dropdown-icon" /> My Profile
                    </Link>
                    
                    <Link to="/settings" className="dropdown-link">
                        <FontAwesomeIcon icon={faCog} className="dropdown-icon" /> Settings
                    </Link>
                    
                    <div className="dropdown-divider"></div>
                    
                    <div className="dropdown-link logout-text" onClick={handleLogout}>
                        <FontAwesomeIcon icon={faSignOutAlt} className="dropdown-icon" /> Logout
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Topbar;