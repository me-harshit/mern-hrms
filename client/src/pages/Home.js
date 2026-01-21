import React from 'react';
import { Link } from 'react-router-dom';

const Home = () => {
    return (
        <div style={homeStyles.container}>
            <header style={homeStyles.header}>
                <div style={homeStyles.logo}>🚀 HRMS_Pro</div>
                <div>
                    <Link to="/login" style={homeStyles.navBtn}>Login</Link>
                    <Link to="/register" style={homeStyles.registerBtn}>Register</Link>
                </div>
            </header>
            
            <main style={homeStyles.hero}>
                <h1>Modern HR Management</h1>
                <p>Track attendance, manage leaves, and stay connected with your team.</p>
                <div style={{ marginTop: '30px' }}>
                    <Link to="/login" style={homeStyles.ctaBtn}>Get Started</Link>
                </div>
            </main>
        </div>
    );
};

const homeStyles = {
    container: { height: '100vh', background: '#f8f9fa' },
    header: { display: 'flex', justifyContent: 'space-between', padding: '20px 50px', alignItems: 'center', background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' },
    logo: { fontSize: '24px', fontWeight: 'bold', color: '#007bff' },
    navBtn: { marginRight: '20px', textDecoration: 'none', color: '#333', fontWeight: '500' },
    registerBtn: { textDecoration: 'none', background: '#007bff', color: '#fff', padding: '8px 20px', borderRadius: '5px' },
    hero: { textAlign: 'center', paddingTop: '100px' },
    ctaBtn: { textDecoration: 'none', background: '#007bff', color: '#fff', padding: '15px 40px', borderRadius: '5px', fontSize: '18px', fontWeight: '600' }
};

export default Home;