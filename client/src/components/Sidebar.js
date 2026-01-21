import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';

const Sidebar = () => {
    const navigate = useNavigate();

    const handleLogout = () => {
        Swal.fire({
            title: 'Logout?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes'
        }).then((result) => {
            if (result.isConfirmed) navigate('/login');
        });
    };

    return (
        <div style={sidebarStyle}>
            <h2 style={{color: '#fff', marginBottom: '30px'}}>HRMS</h2>
            <Link to="/dashboard" style={linkStyle}>🏠 Dashboard</Link>
            <Link to="/attendance" style={linkStyle}>📅 Attendance</Link>
            <Link to="/leaves" style={linkStyle}>📝 Leaves</Link>
            <div onClick={handleLogout} style={{...linkStyle, marginTop: 'auto', color: '#ff7675'}}>🚪 Logout</div>
        </div>
    );
};

const sidebarStyle = {
    width: '250px', height: '100vh', background: '#2d3436', 
    display: 'flex', flexDirection: 'column', padding: '20px', position: 'fixed'
};

const linkStyle = { color: '#dfe6e9', textDecoration: 'none', padding: '10px 0', cursor: 'pointer' };

export default Sidebar;