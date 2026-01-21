import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faThLarge, 
    faCalendarCheck, 
    faUser, 
    faFileAlt 
} from '@fortawesome/free-solid-svg-icons';

const Sidebar = () => {
    const location = useLocation();

    return (
        <div className="sidebar">
            <nav className="sidebar-menu">
                <Link to="/dashboard" className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faThLarge} className="nav-icon" /> 
                    <span>Dashboard</span>
                </Link>
                
                <Link to="/attendance" className={`nav-link ${location.pathname === '/attendance' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faCalendarCheck} className="nav-icon" /> 
                    <span>Attendance</span>
                </Link>
                
                <Link to="/profile" className={`nav-link ${location.pathname === '/profile' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faUser} className="nav-icon" /> 
                    <span>Profile</span>
                </Link>
                
                <Link to="/leaves" className={`nav-link ${location.pathname === '/leaves' ? 'active' : ''}`}>
                    <FontAwesomeIcon icon={faFileAlt} className="nav-icon" /> 
                    <span>Leaves</span>
                </Link>
            </nav>
        </div>
    );
};

export default Sidebar;