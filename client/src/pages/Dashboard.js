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
                    
                    {/* Total Employees */}
                    <div 
                        className="stat-card theme-blue clickable-card" 
                        onClick={() => navigate('/employees')} 
                        title="View Employee Directory"
                    >
                        <div className="stat-icon">
                            <FontAwesomeIcon icon={faUsers} />
                        </div>
                        <div className="stat-info">
                            <p>Total Employees</p>
                            <h3>{stats.totalEmployees}</h3>
                        </div>
                    </div>
                    
                    {/* Present Today */}
                    <div 
                        className="stat-card theme-green clickable-card" 
                        onClick={() => navigate('/attendance-logs')} 
                        title="View Attendance Logs"
                    >
                        <div className="stat-icon">
                            <FontAwesomeIcon icon={faUserCheck} />
                        </div>
                        <div className="stat-info">
                            <p>Present Today</p>
                            <h3>{stats.presentToday}</h3>
                        </div>
                    </div>

                    {/* Live Absence */}
                    <div 
                        className="stat-card theme-red clickable-card" 
                        onClick={() => navigate('/absent-employees')} 
                        title="View Live Absence Dashboard"
                    >
                        <div className="stat-icon">
                            <FontAwesomeIcon icon={faUserTimes} />
                        </div>
                        <div className="stat-info">
                            <p>Live Absence</p>
                            <h3 className="text-danger">{stats.absentToday}</h3>
                        </div>
                    </div>

                    {/* Pending Actions */}
                    <div 
                        className="stat-card theme-yellow clickable-card" 
                        onClick={() => navigate('/leave-requests')} 
                        title="View Leave Requests"
                    >
                        <div className="stat-icon">
                            <FontAwesomeIcon icon={faClipboardList} />
                        </div>
                        <div className="stat-info">
                            <p>Pending Actions</p>
                            <h3>{stats.pendingLeaves}</h3>
                        </div>
                    </div>
                    
                    {/* On Leave */}
                    <div 
                        className="stat-card theme-purple clickable-card" 
                        onClick={() => navigate('/leave-requests')} 
                        title="View Leave Requests"
                    >
                        <div className="stat-icon">
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
                    <div className="stat-card theme-green">
                        <div className="stat-icon"><FontAwesomeIcon icon={faCalendarCheck} /></div>
                        <div className="stat-info">
                            <p>Attendance (Month)</p>
                            <h3>{stats.presentDays} Days</h3>
                        </div>
                    </div>
                    <div className="stat-card theme-blue">
                        <div className="stat-icon"><FontAwesomeIcon icon={faBriefcase} /></div>
                        <div className="stat-info">
                            <p>Leave Balance</p>
                            <h3>{stats.leaveBalance} / {stats.totalLeaves}</h3>
                        </div>
                    </div>
                    <div className="stat-card theme-yellow">
                        <div className="stat-icon"><FontAwesomeIcon icon={faClock} /></div>
                        <div className="stat-info">
                            <p>Pending Requests</p>
                            <h3>{stats.myPending}</h3>
                        </div>
                    </div>
                </div>
            )}

            {/* --- COMMON QUICK ACTIONS --- */}
            <div className="quick-actions-section">
                <h3>Quick Actions</h3>
                <div className="quick-actions-grid">
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