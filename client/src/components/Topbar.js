import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'; // Added this
import { faUserCircle, faCog, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
import Swal from 'sweetalert2'; // Import for a professional logout alert

const Topbar = () => {
    const navigate = useNavigate();

    const handleLogout = () => {
        Swal.fire({
            title: 'Logout?',
            text: "Are you sure you want to exit?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#215D7B', // Your Primary Color
            cancelButtonColor: '#A6477F',  // Your Secondary Color
            confirmButtonText: 'Yes, Logout'
        }).then((result) => {
            if (result.isConfirmed) {
                navigate('/login');
            }
        });
    };

    return (
        <div className="topbar">
            {/* 1. Logo Section (Left Side) */}
            <div className="topbar-logo">
                <img src="/GTS.png" alt="GTS Logo" />
            </div>

            {/* 2. Profile Section (Right Side) */}
            <div className="profile-trigger">
                <div className="profile-badge">HT</div>

                <div className="dropdown-menu">
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid #eee', fontSize: '11px', color: '#7A7A7A', fontWeight: 'bold' }}>
                        MY ACCOUNT
                    </div>
                    
                    <Link to="/profile" className="dropdown-link">
                        <FontAwesomeIcon icon={faUserCircle} style={{ marginRight: '10px' }} /> Profile
                    </Link>
                    
                    <Link to="/settings" className="dropdown-link">
                        <FontAwesomeIcon icon={faCog} style={{ marginRight: '10px' }} /> Settings
                    </Link>
                    
                    <div className="dropdown-link" style={{ color: 'var(--secondary)', cursor: 'pointer', borderTop: '1px solid #eee' }} onClick={handleLogout}>
                        <FontAwesomeIcon icon={faSignOutAlt} style={{ marginRight: '10px' }} /> Logout
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Topbar;