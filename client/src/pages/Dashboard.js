import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faUsers, faUserCheck, faClipboardList, faPlaneDeparture, 
    faSpinner, faBriefcase, faCalendarCheck, faClock 
} from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

const Dashboard = () => {
    const user = JSON.parse(localStorage.getItem('user'));
    const isEmployee = user.role === 'EMPLOYEE';

    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const token = localStorage.getItem('token');
                // Determine URL based on Role
                const url = isEmployee 
                    ? 'http://localhost:5000/api/dashboard/employee-stats'
                    : 'http://localhost:5000/api/dashboard/admin-stats';

                const res = await axios.get(url, {
                    headers: { 'x-auth-token': token }
                });
                setStats(res.data);
                setLoading(false);
            } catch (err) {
                console.error("Error loading dashboard data");
                setLoading(false);
            }
        };

        fetchStats();
    }, [isEmployee]);

    if (loading) return <div className="main-content"><FontAwesomeIcon icon={faSpinner} spin /> Loading...</div>;

    return (
        <div className="dashboard-container">
            <div className="welcome-banner">
                <h1>Welcome, {user.name}</h1>
                <p>{isEmployee ? "Here is your personal summary." : "Here is the company overview."}</p>
            </div>

            {/* --- ADMIN / HR VIEW --- */}
            {!isEmployee && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}><FontAwesomeIcon icon={faUsers} /></div>
                        <div className="stat-info">
                            <p>Total Employees</p>
                            <h3>{stats.totalEmployees}</h3>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><FontAwesomeIcon icon={faUserCheck} /></div>
                        <div className="stat-info">
                            <p>Present Today</p>
                            <h3>{stats.presentToday}</h3>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}><FontAwesomeIcon icon={faClipboardList} /></div>
                        <div className="stat-info">
                            <p>Pending Actions</p>
                            <h3>{stats.pendingLeaves}</h3>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#fef9c3', color: '#ca8a04' }}><FontAwesomeIcon icon={faPlaneDeparture} /></div>
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
                    <button className="gts-btn primary" onClick={() => window.location.href='/attendance'}>
                        Mark Attendance
                    </button>
                    <button className="gts-btn warning" onClick={() => window.location.href='/leaves'}>
                        Apply for Leave
                    </button>
                    {!isEmployee && (
                        <button className="gts-btn danger" onClick={() => window.location.href='/leave-requests'}>
                            Review Requests
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;