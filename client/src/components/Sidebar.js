import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faThLarge,
    faCalendarCheck,
    faUser,
    faFileAlt,
    faCalendarAlt,
    faUsers,
    faShieldAlt,
    faBoxOpen       // <-- Added for Purchase & Inventory
} from '@fortawesome/free-solid-svg-icons';

const Sidebar = () => {
    const location = useLocation();

    const user = JSON.parse(localStorage.getItem('user'));
    const userRole = user?.role || 'EMPLOYEE';

    return (
        <div className="sidebar">
            {/* Role Badge - Visual indicator of current role */}
            <div className="role-badge">
                {userRole} MODE
            </div>

            <nav className="sidebar-menu">
                <Link to="/dashboard" className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faThLarge} className="nav-icon" /> <span>Dashboard</span>
                </Link>

                <Link to="/attendance" className={`nav-link ${location.pathname === '/attendance' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faCalendarCheck} className="nav-icon" /> <span>Attendance</span>
                </Link>

                <Link to="/profile" className={`nav-link ${location.pathname === '/profile' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faUser} className="nav-icon" /> <span>My Profile</span>
                </Link>

                <Link to="/calendar" className={`nav-link ${location.pathname === '/calendar' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faCalendarAlt} className="nav-icon" /> <span>Yearly Calendar</span>
                </Link>

                <Link to="/leaves" className={`nav-link ${location.pathname === '/leaves' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faFileAlt} className="nav-icon" /> <span>Leave Management</span>
                </Link>

                {(user.isPurchaser || userRole === 'HR' || userRole === 'ADMIN') && (
                    <Link to="/purchases" className={`nav-link ${location.pathname === '/purchases' ? 'active' : ''}`}>
                        <FontAwesomeIcon icon={faBoxOpen} className="nav-icon" /> <span>My Purchases</span>
                    </Link>
                )}

                {/* HR & ADMIN ONLY: Employee Directory */}
                {(userRole === 'HR' || userRole === 'ADMIN') && (
                    <>
                        <div className="sidebar-section-label">HR Management</div>

                        <Link to="/employees" className={`nav-link ${location.pathname === '/employees' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faUsers} className="nav-icon" /> <span>Employees</span>
                        </Link>

                        <Link to="/attendance-logs" className={`nav-link ${location.pathname === '/attendance-logs' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faCalendarCheck} className="nav-icon" /> <span>Attendance Logs</span>
                        </Link>

                        <Link to="/leave-requests" className={`nav-link ${location.pathname === '/leave-requests' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faFileAlt} className="nav-icon" /> <span>Leave Requests</span>
                        </Link>
                        <Link to="/admin-purchases" className={`nav-link ${location.pathname === '/admin-purchases' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faBoxOpen} className="nav-icon" /> <span>All Purchases</span>
                        </Link>
                    </>
                )}

                {/* ADMIN ONLY: System Settings */}
                {userRole === 'ADMIN' && (
                    <Link to="/admin-settings" className={`nav-link ${location.pathname === '/admin-settings' ? 'active' : ''}`}>
                        <FontAwesomeIcon icon={faShieldAlt} className="nav-icon" /> <span>Admin Control</span>
                    </Link>
                )}
            </nav>
        </div>
    );
};

export default Sidebar;