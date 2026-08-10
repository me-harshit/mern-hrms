import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faCheckDouble, faEnvelopeOpenText, faCircle } from '@fortawesome/free-solid-svg-icons';
import api from '../../utils/api';
import Swal from 'sweetalert2';

const Notifications = () => {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/notifications');
            setNotifications(res.data);
        } catch (error) {
            console.error("Failed to fetch notifications");
            Swal.fire('Error', 'Could not load notifications', 'error');
        } finally {
            setLoading(false);
        }
    };

    const markAllRead = async () => {
        try {
            await api.put('/notifications/mark-all-read');
            setNotifications(notifications.map(n => ({ ...n, isRead: true })));
            Swal.fire({
                title: 'Marked all as read',
                icon: 'success',
                toast: true,
                position: 'top-end',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (error) {
            console.error("Failed to mark read");
        }
    };

    const handleNotificationClick = async (notif) => {
        try {
            // Mark as read in backend
            if (!notif.isRead) {
                await api.put(`/notifications/read/${notif._id}`);
                setNotifications(notifications.map(n => 
                    n._id === notif._id ? { ...n, isRead: true } : n
                ));
            }

            // Determine route based on type
            let route = '/dashboard';
            if (notif.type === 'SALARY') route = '/payroll';
            else if (notif.type === 'WFH') route = '/wfh';
            else if (notif.type === 'LEAVE') route = '/leaves';
            else if (notif.type === 'SHORT_LEAVE') route = '/attendance';
            else if (notif.link) route = notif.link;

            // Navigate
            navigate(route);
            
        } catch (error) {
            console.error("Failed to handle notification click", error);
        }
    };

    return (
        <div className="attendance-container fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faBell} style={{ marginRight: '10px', color: '#215D7B' }} />
                    Notifications
                </h1>
                <button 
                    className="gts-btn primary" 
                    onClick={markAllRead}
                    disabled={notifications.every(n => n.isRead)}
                >
                    <FontAwesomeIcon icon={faCheckDouble} style={{ marginRight: '5px' }} /> Mark All Read
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    Loading notifications...
                </div>
            ) : notifications.length === 0 ? (
                <div className="control-card text-center" style={{ padding: '60px 20px' }}>
                    <FontAwesomeIcon icon={faEnvelopeOpenText} style={{ fontSize: '4rem', color: '#cbd5e1', marginBottom: '15px' }} />
                    <h3 style={{ color: '#475569' }}>No Notifications</h3>
                    <p className="text-muted">You're all caught up!</p>
                </div>
            ) : (
                <div className="control-card" style={{ padding: '0', overflow: 'hidden' }}>
                    {notifications.map(notif => (
                        <div 
                            key={notif._id}
                            style={{ 
                                padding: '20px', 
                                borderBottom: '1px solid #e2e8f0',
                                background: notif.isRead ? '#ffffff' : '#f8fafc',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '15px',
                                transition: 'background 0.2s ease'
                            }}
                            onClick={() => handleNotificationClick(notif)}
                            onMouseOver={(e) => e.currentTarget.style.background = '#f1f5f9'}
                            onMouseOut={(e) => e.currentTarget.style.background = notif.isRead ? '#ffffff' : '#f8fafc'}
                        >
                            <div style={{ marginTop: '5px' }}>
                                {!notif.isRead ? (
                                    <FontAwesomeIcon icon={faCircle} style={{ color: '#215D7B', fontSize: '0.6rem' }} />
                                ) : (
                                    <div style={{ width: '0.6rem' }}></div>
                                )}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                    <h4 style={{ margin: 0, fontSize: '1rem', color: '#1e293b', fontWeight: notif.isRead ? '500' : '600' }}>
                                        {notif.title}
                                    </h4>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                        {new Date(notif.createdAt).toLocaleDateString()} at {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                                    {notif.message}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Notifications;
