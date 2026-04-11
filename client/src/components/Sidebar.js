import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import api from '../utils/api';
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
    faFolderOpen,
    faBoxes,
    faRobot,
    faLaptopHouse,
    faWallet
} from '@fortawesome/free-solid-svg-icons';

const Sidebar = ({ isOpen, onClose }) => {
    const location = useLocation();
    const user = JSON.parse(localStorage.getItem('user'));
    const userRole = user?.role || 'EMPLOYEE';

    // State to check if the user has inventory assigned
    const [hasInventory, setHasInventory] = useState(false);

    useEffect(() => {
        if (userRole === 'EMPLOYEE' || userRole === 'MANAGER') {
            api.get('/inventory/my-items')
                .then(res => {
                    if (res.data && res.data.length > 0) {
                        setHasInventory(true);
                    }
                })
                .catch(err => console.error("Could not check inventory:", err));
        }
    }, [userRole]);

    // Auto-close sidebar on mobile after clicking a link
    const handleLinkClick = () => {
        if (window.innerWidth <= 768) {
            onClose();
        }
    };

    // Helper for Management Roles
    const isManagement = ['HR', 'ADMIN', 'MANAGER', 'ACCOUNTS'].includes(userRole);

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

                {/* 👇 FIXED: Hidden personal employee links for the ADMIN role */}
                {userRole !== 'ADMIN' && (
                    <>
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

                        <Link to="/wfh" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/wfh' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faLaptopHouse} className="nav-icon" /> <span>Work From Home</span>
                        </Link>
                    </>
                )}

                {hasInventory && (
                    <Link to="/my-inventory" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/my-inventory' ? 'active' : ''}`}>
                        <FontAwesomeIcon icon={faLaptopHouse} className="nav-icon" /> <span>My Inventory</span>
                    </Link>
                )}

                {(user?.isPurchaser || isManagement) && (
                    <Link to="/expenses" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/expenses' ? 'active' : ''}`}>
                        <FontAwesomeIcon icon={faBoxOpen} className="nav-icon" /> <span>My Expenses</span>
                    </Link>
                )}
                
                {/* 👇 NEW: ACCOUNTS added to Reimbursements */}
                {(userRole === 'HR' || userRole === 'ADMIN' || userRole === 'ACCOUNTS') && (
                    <Link to="/reimbursements" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/reimbursements' ? 'active' : ''}`}>
                        <FontAwesomeIcon icon={faWallet} className="nav-icon" /> <span>Reimbursements</span>
                    </Link>
                )}

                {/* 👇 NEW: Unified Management Block with ACCOUNTS integrated */}
                {isManagement && (
                    <>
                        <div className="sidebar-section-label">
                            {userRole === 'MANAGER' ? 'Team Management' : userRole === 'ACCOUNTS' ? 'Finance & Ops' : 'HR Management'}
                        </div>

                        <Link to="/employees" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/employees' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faUsers} className="nav-icon" />
                            <span>{userRole === 'MANAGER' ? 'My Team' : 'Employees'}</span>
                        </Link>

                        <Link to="/attendance-logs" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/attendance-logs' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faCalendarCheck} className="nav-icon" /> <span>Attendance Logs</span>
                        </Link>

                        <Link to="/Employee-requests" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/Employee-requests' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faFileAlt} className="nav-icon" /> <span>Employee Requests</span>
                        </Link>

                        <Link to="/projects" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/projects' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faFolderOpen} className="nav-icon" /> <span>Projects</span>
                        </Link>

                        <Link to="/admin-expenses" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/admin-expenses' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faBoxOpen} className="nav-icon" />
                            <span>{userRole === 'MANAGER' ? 'Team Expenses' : 'All Expenses'}</span>
                        </Link>

                        <Link to="/absent-employees" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/absent-employees' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faUserTimes} className="nav-icon" /> <span>Live Absence</span>
                        </Link>
                    </>
                )}

                {(userRole === 'ADMIN' || userRole === 'HR' || userRole === 'ACCOUNTS') && (
                    <>
                        <Link to="/inventory" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/inventory' ? 'active' : ''}`}>
                            <FontAwesomeIcon icon={faBoxes} className="nav-icon" /> <span>Global Inventory</span>
                        </Link>
                    </>
                )}

                {(userRole === 'HR' || userRole === 'ADMIN') && (
                    <Link to="/admin-chat" onClick={handleLinkClick} className={`nav-link ${location.pathname === '/admin-chat' ? 'active' : ''}`}>
                        <FontAwesomeIcon icon={faRobot} className="nav-icon" /> <span>AI Assistant</span>
                    </Link>
                )}

                {/* Visible to Admins ONLY */}
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