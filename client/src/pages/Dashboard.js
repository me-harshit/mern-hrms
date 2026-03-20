import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; 
import api from '../utils/api'; 
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faUsers, faUserCheck, faClipboardList, faPlaneDeparture, 
    faSpinner, faBriefcase, faCalendarCheck, faClock, faUserTimes 
} from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

const Dashboard = () => {
    const user = JSON.parse(localStorage.getItem('user'));
    const isEmployee = user.role === 'EMPLOYEE';
    const navigate = useNavigate();

    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const url = isEmployee 
                    ? '/dashboard/employee-stats'
                    : '/dashboard/admin-stats';

                const res = await api.get(url);
                let dashboardData = res.data;

                // If Admin/HR, fetch the live absent count to show on the dashboard
                if (!isEmployee) {
                    try {
                        const absentRes = await api.get('/attendance/absent');
                        dashboardData = { ...dashboardData, absentToday: absentRes.data.length };
                    } catch (absentErr) {
                        console.error("Could not fetch absent count", absentErr);
                        dashboardData = { ...dashboardData, absentToday: 0 };
                    }
                }

                setStats(dashboardData);
            } catch (err) {
                console.error("Error loading dashboard data");
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [isEmployee]);

    if (loading || !stats) return <div className="main-content"><FontAwesomeIcon icon={faSpinner} spin /> Loading...</div>;

    return (
        <div className="dashboard-container fade-in">
            <div className="welcome-banner">
                <h1>Welcome, {user.name}</h1>
                <p>{isEmployee ? "Here is your personal summary." : "Here is the company overview."}</p>
            </div>

            {/* --- ADMIN / HR VIEW --- */}
            {!isEmployee && (
                <div className="stats-grid">
                    
                    {/* Total Employees -> Navigates to Employees */}
                    <div 
                        className="stat-card" 
                        onClick={() => navigate('/employees')} 
                        style={{ cursor: 'pointer', border: '1px solid #e0f2fe' }}
                        title="View Employee Directory"
                    >
                        <div className="stat-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}>
                            <FontAwesomeIcon icon={faUsers} />
                        </div>
                        <div className="stat-info">
                            <p>Total Employees</p>
                            <h3>{stats.totalEmployees}</h3>
                        </div>
                    </div>
                    
                    {/* Present Today -> Navigates to Attendance Logs */}
                    <div 
                        className="stat-card" 
                        onClick={() => navigate('/attendance-logs')} 
                        style={{ cursor: 'pointer', border: '1px solid #dcfce7' }}
                        title="View Attendance Logs"
                    >
                        <div className="stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                            <FontAwesomeIcon icon={faUserCheck} />
                        </div>
                        <div className="stat-info">
                            <p>Present Today</p>
                            <h3>{stats.presentToday}</h3>
                        </div>
                    </div>

                    {/* Live Absence -> Navigates to Absent Employees */}
                    <div 
                        className="stat-card" 
                        onClick={() => navigate('/absent-employees')} 
                        style={{ cursor: 'pointer', border: '1px solid #fee2e2' }}
                        title="View Live Absence Dashboard"
                    >
                        <div className="stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
                            <FontAwesomeIcon icon={faUserTimes} />
                        </div>
                        <div className="stat-info">
                            <p>Live Absence</p>
                            <h3 style={{ color: '#dc2626' }}>{stats.absentToday}</h3>
                        </div>
                    </div>

                    {/* Pending Actions -> Navigates to Leave Requests */}
                    <div 
                        className="stat-card" 
                        onClick={() => navigate('/leave-requests')} 
                        style={{ cursor: 'pointer', border: '1px solid #fef3c7' }}
                        title="View Leave Requests"
                    >
                        <div className="stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                            <FontAwesomeIcon icon={faClipboardList} />
                        </div>
                        <div className="stat-info">
                            <p>Pending Actions</p>
                            <h3>{stats.pendingLeaves}</h3>
                        </div>
                    </div>
                    
                    {/* On Leave -> Navigates to Leave Requests */}
                    <div 
                        className="stat-card" 
                        onClick={() => navigate('/leave-requests')} 
                        style={{ cursor: 'pointer', border: '1px solid #f3e8ff' }}
                        title="View Leave Requests"
                    >
                        <div className="stat-icon" style={{ background: '#f3e8ff', color: '#db2777' }}>
                            <FontAwesomeIcon icon={faPlaneDeparture} />
                        </div>
                        <div className="stat-info">
                            <p>On Leave</p>
                            <h3>{stats.onLeaveToday}</h3>
                        </div>
                    </div>
                </div>
            )}

            {/* --- EMPLOYEE VIEW --- */}
            {isEmployee && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><FontAwesomeIcon icon={faCalendarCheck} /></div>
                        <div className="stat-info">
                            <p>Attendance (Month)</p>
                            <h3>{stats.presentDays} Days</h3>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}><FontAwesomeIcon icon={faBriefcase} /></div>
                        <div className="stat-info">
                            <p>Leave Balance</p>
                            <h3>{stats.leaveBalance} / {stats.totalLeaves}</h3>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#fef9c3', color: '#ca8a04' }}><FontAwesomeIcon icon={faClock} /></div>
                        <div className="stat-info">
                            <p>Pending Requests</p>
                            <h3>{stats.myPending}</h3>
                        </div>
                    </div>
                </div>
            )}

            {/* --- COMMON QUICK ACTIONS --- */}
            <div className="recent-activity-section" style={{ marginTop: '30px' }}>
                <h3>Quick Actions</h3>
                <div className="quick-actions-grid" style={{ display: 'flex', gap: '15px', marginTop: '15px' }}>
                    <button className="gts-btn primary" onClick={() => navigate('/attendance')}>
                        Mark Attendance
                    </button>
                    <button className="gts-btn warning" onClick={() => navigate('/leaves')}>
                        Apply for Leave
                    </button>
                    {!isEmployee && (
                        <button className="gts-btn danger" onClick={() => navigate('/leave-requests')}>
                            Review Requests
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;