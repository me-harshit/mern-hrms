import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faCheckCircle, faClock, faCalendarTimes,
    faUsers, faUserPlus, faHandHoldingUsd, faBriefcase
} from '@fortawesome/free-solid-svg-icons';
import axios from 'axios';

const Dashboard = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [stats, setStats] = useState({
        totalEmployees: 0,
        presentToday: 0,
        pendingLeaves: 0,
        myAttendance: '0/0',
        myLeaveBalance: 0
    });

    useEffect(() => {
        // 1. Get User Info
        const storedUser = JSON.parse(localStorage.getItem('user'));
        setUser(storedUser);

        // 2. Fetch Stats (Simulated for now, replace with API later)
        if (storedUser) {
            fetchStats(storedUser.role);
        }
    }, []);

    const fetchStats = async (role) => {
        // In the future, this will be: axios.get('/api/dashboard/stats')
        // For now, we simulate data based on role
        if (role === 'ADMIN' || role === 'HR') {
            // Fetch total employees count for Admin/HR
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get('http://localhost:5000/api/employees', {
                    headers: { 'x-auth-token': token }
                });
                setStats(prev => ({
                    ...prev,
                    totalEmployees: res.data.length,
                    presentToday: Math.floor(res.data.length * 0.9), // Mock data
                    pendingLeaves: 3 // Mock data
                }));
            } catch (err) {
                console.error("Error fetching dashboard stats");
            }
        } else {
            // Employee Specific Stats
            setStats(prev => ({
                ...prev,
                myAttendance: '20/22 Days',
                myLeaveBalance: 12
            }));
        }
    };

    if (!user) return <div className="main-content">Loading Dashboard...</div>;

    const isAdminOrHR = user.role === 'ADMIN' || user.role === 'HR';

    return (
        <div>
            {/* --- HEADER SECTION --- */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p style={{ color: '#7A7A7A', marginTop: '5px' }}>
                        Welcome back, <span style={{ color: '#215D7B', fontWeight: 'bold' }}>{user.name}</span>
                    </p>
                </div>
                <span className={`role-tag ${user.role.toLowerCase()}`} style={{ fontSize: '14px', padding: '8px 15px' }}>
                    {user.role} VIEW
                </span>
            </div>

            {/* --- STATS GRID --- */}
            <div className="stats-grid">
                
                {/* --- VIEW: EMPLOYEE --- */}
                {!isAdminOrHR && (
                    <>
                        <div className="stat-card border-teal">
                            <div className="stat-icon teal-bg"><FontAwesomeIcon icon={faCheckCircle} /></div>
                            <div className="stat-info">
                                <p>My Attendance</p>
                                <h3>{stats.myAttendance}</h3>
                            </div>
                        </div>
                        <div className="stat-card border-plum">
                            <div className="stat-icon plum-bg"><FontAwesomeIcon icon={faCalendarTimes} /></div>
                            <div className="stat-info">
                                <p>Leave Balance</p>
                                <h3>{stats.myLeaveBalance} Days</h3>
                            </div>
                        </div>
                        <div className="stat-card border-teal">
                            <div className="stat-icon teal-bg"><FontAwesomeIcon icon={faClock} /></div>
                            <div className="stat-info">
                                <p>Avg. Work Hours</p>
                                <h3>8h 30m</h3>
                            </div>
                        </div>
                    </>
                )}

                {/* --- VIEW: HR & ADMIN --- */}
                {isAdminOrHR && (
                    <>
                        <div className="stat-card border-teal">
                            <div className="stat-icon teal-bg"><FontAwesomeIcon icon={faUsers} /></div>
                            <div className="stat-info">
                                <p>Total Employees</p>
                                <h3>{stats.totalEmployees}</h3>
                            </div>
                        </div>
                        <div className="stat-card border-plum">
                            <div className="stat-icon plum-bg"><FontAwesomeIcon icon={faBriefcase} /></div>
                            <div className="stat-info">
                                <p>On Leave Today</p>
                                <h3>{stats.totalEmployees - stats.presentToday}</h3>
                            </div>
                        </div>
                        <div className="stat-card border-teal">
                            <div className="stat-icon teal-bg"><FontAwesomeIcon icon={faCheckCircle} /></div>
                            <div className="stat-info">
                                <p>Present Today</p>
                                <h3>{stats.presentToday}</h3>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* --- QUICK ACTIONS SECTION --- */}
            <div style={{ marginTop: '40px' }}>
                <h2 className="page-title" style={{ fontSize: '20px', marginBottom: '20px' }}>Quick Actions</h2>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>

                    {/* Common Action */}
                    <button className="action-btn-primary" onClick={() => navigate('/attendance')}>
                        <FontAwesomeIcon icon={faClock} style={{ marginRight: '8px' }} /> 
                        {isAdminOrHR ? 'View Attendance Logs' : 'Check In / Out'}
                    </button>

                    <button className="action-btn-secondary">
                        <FontAwesomeIcon icon={faCalendarTimes} style={{ marginRight: '8px' }} /> Apply for Leave
                    </button>

                    {/* Admin / HR Specific Actions */}
                    {isAdminOrHR && (
                        <>
                            <button className="action-btn-secondary" onClick={() => navigate('/employees')}>
                                <FontAwesomeIcon icon={faUserPlus} style={{ marginRight: '8px' }} /> Manage Employees
                            </button>
                            {user.role === 'ADMIN' && (
                                <button className="action-btn-secondary">
                                    <FontAwesomeIcon icon={faHandHoldingUsd} style={{ marginRight: '8px' }} /> Run Payroll
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;