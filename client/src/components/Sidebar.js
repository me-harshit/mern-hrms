import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faThLarge,
    faCalendarCheck,
    faUser,
    faFileAlt,
    faUsers,        // Added this
    faShieldAlt    // Added this
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

                <Link to="/leaves" className={`nav-link ${location.pathname === '/leaves' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faFileAlt} className="nav-icon" /> <span>Leaves</span>
                </Link>

                {/* HR & ADMIN ONLY: Employee Directory */}
                {(userRole === 'HR' || userRole === 'ADMIN') && (
                    <Link to="/employees" className={`nav-link ${location.pathname === '/employees' ? 'active' : ''}`}>
                        <FontAwesomeIcon icon={faUsers} className="nav-icon" /> <span>Manage Employees</span>
                    </Link>
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