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
    faTimes
} from '@fortawesome/free-solid-svg-icons';

const Sidebar = ({ isOpen, onClose }) => {
    const location = useLocation();
    const user = JSON.parse(localStorage.getItem('user'));
    const userRole = user?.role || 'EMPLOYEE';

    // Auto-close sidebar on mobile after clicking a link
    const handleLinkClick = () => {
        if (window.innerWidth <= 991) {
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

                {(user?.isPurchaser || userRole === 'HR' || userRole === 'ADMIN') && (
                    <Link to="/purchases" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/purchases' ? 'active' : ''}`}>
                        <FontAwesomeIcon icon={faBoxOpen} className="nav-icon" /> <span>My Purchases</span>
                    </Link>
                )}

                {(userRole === 'HR' || userRole === 'ADMIN') && (
                    <>
                        <div className="sidebar-section-label">HR Management</div>

                        <Link to="/employees" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/employees' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faUsers} className="nav-icon" /> <span>Employees</span>
                        </Link>

                        <Link to="/attendance-logs" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/attendance-logs' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faCalendarCheck} className="nav-icon" /> <span>Attendance Logs</span>
                        </Link>

                        <Link to="/leave-requests" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/leave-requests' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faFileAlt} className="nav-icon" /> <span>Leave Requests</span>
                        </Link>
                        
                        <Link to="/admin-purchases" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/admin-purchases' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faBoxOpen} className="nav-icon" /> <span>All Purchases</span>
                        </Link>
                    </>
                )}

                {userRole === 'ADMIN' && (
                    <Link to="/admin-settings" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/admin-settings' ? 'active' : ''}`}>
                        <FontAwesomeIcon icon={faShieldAlt} className="nav-icon" /> <span>Admin Control</span>
                    </Link>
                )}
            </nav>
        </div>
    );
};

export default Sidebar;