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
    faBoxOpen,
    faTimes,
    faUserTimes,
    faFolderOpen // <-- ADDED ICON
} from '@fortawesome/free-solid-svg-icons';

const Sidebar = ({ isOpen, onClose }) => {
    const location = useLocation();
    const user = JSON.parse(localStorage.getItem('user'));
    const userRole = user?.role || 'EMPLOYEE';

    // Auto-close sidebar on mobile after clicking a link
    const handleLinkClick = () => {
        if (window.innerWidth <= 768) {
            onClose();
        }
    };

    return (
        <div className={`sidebar ${isOpen ? 'mobile-open' : ''}`}>
            {/* Close button visible only on mobile drawer */}
            <div className="mobile-only-header">
                <button className="close-sidebar-btn" onClick={onClose}>
                    <FontAwesomeIcon icon={faTimes} />
                </button>
            </div>

            <div className="role-badge">
                {userRole} MODE
            </div>

            <nav className="sidebar-menu">
                <Link to="/dashboard" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faThLarge} className="nav-icon" /> <span>Dashboard</span>
                </Link>

                <Link to="/attendance" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/attendance' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faCalendarCheck} className="nav-icon" /> <span>Attendance</span>
                </Link>

                <Link to="/profile" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/profile' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faUser} className="nav-icon" /> <span>My Profile</span>
                </Link>

                <Link to="/calendar" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/calendar' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faCalendarAlt} className="nav-icon" /> <span>Yearly Calendar</span>
                </Link>

                <Link to="/leaves" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/leaves' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faFileAlt} className="nav-icon" /> <span>Leave Management</span>
                </Link>

                {/* Visible to Purchasers, Admins, HRs, AND Managers */}
                {(user?.isPurchaser || userRole === 'HR' || userRole === 'ADMIN' || userRole === 'MANAGER') && (
                    <Link to="/purchases" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/purchases' ? 'active' : ''}`}>
                        <FontAwesomeIcon icon={faBoxOpen} className="nav-icon" /> <span>My Purchases</span>
                    </Link>
                )}

                {/* Visible to Admins, HRs, AND Managers */}
                {(userRole === 'HR' || userRole === 'ADMIN' || userRole === 'MANAGER') && (
                    <>
                        <div className="sidebar-section-label">
                            {userRole === 'MANAGER' ? 'Team Management' : 'HR Management'}
                        </div>

                        <Link to="/employees" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/employees' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faUsers} className="nav-icon" /> 
                            <span>{userRole === 'MANAGER' ? 'My Team' : 'Employees'}</span>
                        </Link>

                        <Link to="/attendance-logs" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/attendance-logs' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faCalendarCheck} className="nav-icon" /> <span>Attendance Logs</span>
                        </Link>

                        <Link to="/leave-requests" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/leave-requests' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faFileAlt} className="nav-icon" /> <span>Leave Requests</span>
                        </Link>
                        
                        {/* 👇 NEW PROJECT ROUTE 👇 */}
                        <Link to="/projects" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/projects' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faFolderOpen} className="nav-icon" /> <span>Projects</span>
                        </Link>

                        <Link to="/admin-purchases" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/admin-purchases' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faBoxOpen} className="nav-icon" /> 
                            <span>{userRole === 'MANAGER' ? 'Team Purchases' : 'All Purchases'}</span>
                        </Link>

                        <Link to="/absent-employees" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/absent-employees' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faUserTimes} className="nav-icon" /> <span>Live Absence</span>
                        </Link>
                    </>
                )}

                {userRole === 'ADMIN' && (
                    <>
                        <div className="sidebar-section-label">System</div>
                        <Link to="/admin-settings" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/admin-settings' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faShieldAlt} className="nav-icon" /> <span>Admin Control</span>
                        </Link>
                    </>
                )}
            </nav>
        </div>
    );
};

export default Sidebar;