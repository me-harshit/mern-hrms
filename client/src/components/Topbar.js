import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserCircle, faSignOutAlt, faBars, faBell, faCheckDouble, faEnvelopeOpenText } from '@fortawesome/free-solid-svg-icons';
import Swal from 'sweetalert2';
import api from '../utils/api';

const Topbar = ({ onToggleSidebar }) => {
    const navigate = useNavigate();
    const userData = JSON.parse(localStorage.getItem('user'));
    const userName = userData?.name || "User";
    
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showNotifications, setShowNotifications] = useState(false);
    const notifRef = useRef(null);

    const initials = userName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase();

    useEffect(() => {
        fetchNotifications();
        // Close dropdown when clicking outside
        const handleClickOutside = (event) => {
            if (notifRef.current && !notifRef.current.contains(event.target)) {
                setShowNotifications(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/notifications');
            setNotifications(res.data);
            setUnreadCount(res.data.filter(n => !n.isRead).length);
        } catch (error) {
            console.error("Failed to fetch notifications");
        }
    };

    const markAllRead = async () => {
        try {
            await api.put('/notifications/mark-all-read');
            setNotifications(notifications.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error("Failed to mark read");
        }
    };

    const markSingleRead = async (notif) => {
        try {
            await api.put(`/notifications/read/${notif._id}`);
            fetchNotifications();
            setShowNotifications(false); // Close dropdown
            
            // Determine route based on type
            let route = '/dashboard';
            if (notif.type === 'SALARY') route = '/payroll';
            else if (notif.type === 'WFH') route = '/wfh';
            else if (notif.type === 'LEAVE') route = '/leaves';
            else if (notif.type === 'SHORT_LEAVE') route = '/attendance';
            else if (notif.link) route = notif.link;

            navigate(route);
        } catch (error) {
            console.error("Failed to mark read");
        }
    };

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
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                navigate('/login');
                window.location.reload(); 
            }
        });
    };

    return (
        <div className="topbar">
            <div className="topbar-left-section">
                {/* Mobile Menu Trigger */}
                <button className="menu-toggle" onClick={onToggleSidebar}>
                    <FontAwesomeIcon icon={faBars} />
                </button>
                <div className="topbar-logo">
                    <img src="/GTS.png" alt="GTS Logo" />
                </div>
            </div>

            <div className="topbar-right-section" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                
                {/* NOTIFICATIONS BELL */}
                <div className="notification-wrapper" ref={notifRef} style={{ position: 'relative' }}>
                    <div 
                        className="notification-icon" 
                        onClick={() => setShowNotifications(!showNotifications)}
                        style={{ cursor: 'pointer', fontSize: '1.2rem', color: '#64748b', position: 'relative' }}
                    >
                        <FontAwesomeIcon icon={faBell} />
                        {unreadCount > 0 && (
                            <span className="notification-pulse">
                                {unreadCount}
                            </span>
                        )}
                    </div>

                    {showNotifications && (
                        <div className="notification-dropdown">
                            <div className="notification-header">
                                <h6>Notifications</h6>
                            </div>
                            <div className="notification-body">
                                {notifications.length > 0 ? (
                                    notifications.slice(0, 4).map(notif => (
                                        <div 
                                            key={notif._id} 
                                            className={`notification-item ${!notif.isRead ? 'unread' : ''}`}
                                            onClick={() => markSingleRead(notif)}
                                        >
                                            <p className="notif-title">{notif.title}</p>
                                            <p className="notif-message">{notif.message}</p>
                                            <span className="notif-time">{new Date(notif.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="no-notifications">
                                        <FontAwesomeIcon icon={faEnvelopeOpenText} />
                                        <p>No new notifications</p>
                                    </div>
                                )}
                            </div>
                            <div className="notification-footer">
                                <button className="notif-btn" onClick={() => navigate('/notifications')}>Show All</button>
                                <button className="notif-btn" onClick={markAllRead}>
                                    <FontAwesomeIcon icon={faCheckDouble} /> Mark all read
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="profile-trigger">
                    <div className="profile-trigger-wrapper">
                        <span className="user-greeting-name">
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
                        
                        <div className="dropdown-divider"></div>
                        
                        <div className="dropdown-link logout-text" onClick={handleLogout}>
                            <FontAwesomeIcon icon={faSignOutAlt} className="dropdown-icon" /> Logout
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Topbar;