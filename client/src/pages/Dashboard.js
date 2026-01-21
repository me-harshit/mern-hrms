import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faCheckCircle, faClock, faCalendarTimes,
    faUsers, faUserPlus, faHandHoldingUsd
} from '@fortawesome/free-solid-svg-icons';

const Dashboard = () => {
    // Mock user role: Try changing this to 'HR' or 'ADMIN' to see the changes
    const userRole = 'ADMIN';

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 className="page-title">{userRole === 'EMPLOYEE' ? 'My Overview' : 'Organization Overview'}</h1>
                <span className="role-badge">{userRole} View</span>
            </div>

            <div className="stats-grid">
                {/* --- EMPLOYEE VIEW --- */}
                {userRole === 'EMPLOYEE' && (
                    <>
                        <div className="stat-card border-teal">
                            <div className="stat-icon teal-bg"><FontAwesomeIcon icon={faCheckCircle} /></div>
                            <div className="stat-info"><p>My Attendance</p><h3>18 / 22 Days</h3></div>
                        </div>
                        <div className="stat-card border-plum">
                            <div className="stat-icon plum-bg"><FontAwesomeIcon icon={faCalendarTimes} /></div>
                            <div className="stat-info"><p>Leave Balance</p><h3>05 Days</h3></div>
                        </div>
                        <div className="stat-card border-teal">
                            <div className="stat-icon teal-bg"><FontAwesomeIcon icon={faClock} /></div>
                            <div className="stat-info"><p>Avg. Hours</p><h3>8.5 hrs</h3></div>
                        </div>
                    </>
                )}

                {/* --- HR & ADMIN VIEW --- */}
                {(userRole === 'HR' || userRole === 'ADMIN') && (
                    <>
                        <div className="stat-card border-teal">
                            <div className="stat-icon teal-bg"><FontAwesomeIcon icon={faUsers} /></div>
                            <div className="stat-info"><p>Total Employees</p><h3>124</h3></div>
                        </div>
                        <div className="stat-card border-plum">
                            <div className="stat-icon plum-bg"><FontAwesomeIcon icon={faCalendarTimes} /></div>
                            <div className="stat-info"><p>Pending Leaves</p><h3>12</h3></div>
                        </div>
                        <div className="stat-card border-teal">
                            <div className="stat-icon teal-bg"><FontAwesomeIcon icon={faCheckCircle} /></div>
                            <div className="stat-info"><p>Present Today</p><h3>118</h3></div>
                        </div>
                    </>
                )}
            </div>

            {/* --- QUICK ACTIONS SECTION --- */}
            <div style={{ marginTop: '40px' }}>
                <h2 className="page-title" style={{ fontSize: '20px' }}>Quick Actions</h2>
                <div style={{ display: 'flex', gap: '15px' }}>

                    <button className="action-btn-primary">
                        Apply for Leave
                    </button>

                    {(userRole === 'HR' || userRole === 'ADMIN') && (
                        <>
                            <button className="action-btn-secondary">
                                <FontAwesomeIcon icon={faUserPlus} style={{ marginRight: '8px' }} /> Add Employee
                            </button>
                            <button className="action-btn-secondary">
                                <FontAwesomeIcon icon={faHandHoldingUsd} style={{ marginRight: '8px' }} /> Run Payroll
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;