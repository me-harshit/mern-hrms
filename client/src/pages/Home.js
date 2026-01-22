import React from 'react';
import { Link } from 'react-router-dom';

const Home = () => {
    return (
        <div style={homeStyles.container}>
            <header style={homeStyles.header}>
                <div style={homeStyles.logoContainer}>
                    <img
                        src="/GTS.png"
                        alt="GTS Logo"
                        style={{ height: '50px', width: 'auto' }}
                    />
                </div>
                <div>
                    <Link to="/login" style={homeStyles.navBtn}>Login</Link>
                </div>
            </header>

            <main style={homeStyles.hero}>
                <h1 style={homeStyles.mainTitle}>GTS HR Management System</h1>
                <p style={homeStyles.subTitle}>
                    Track attendance, manage leaves, and streamline your workforce management with ease.
                </p>
                <div style={{ marginTop: '40px' }}>
                    <Link to="/login" style={homeStyles.ctaBtn}>Get Started</Link>
                </div>
            </main>
        </div>
    );
};

const homeStyles = {
    container: {
        height: '100vh',
        background: '#f9fafb',
        fontFamily: "'Poppins', sans-serif"
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '15px 60px',
        alignItems: 'center',
        background: '#fff',
        borderBottom: '2px solid #e5e7eb'
    },
    logoContainer: {
        display: 'flex',
        alignItems: 'center'
    },
    navBtn: {
        textDecoration: 'none',
        background: '#A6477F', // Secondary Color
        color: '#fff',
        padding: '10px 25px',
        borderRadius: '8px',
        fontWeight: '600'
    },
    registerBtn: {
        textDecoration: 'none',
        background: '#A6477F', // Secondary Color
        color: '#fff',
        padding: '10px 25px',
        borderRadius: '8px',
        fontWeight: '600'
    },
    hero: {
        textAlign: 'center',
        paddingTop: '120px',
        maxWidth: '800px',
        margin: '0 auto'
    },
    mainTitle: {
        fontSize: '48px',
        color: '#215D7B', // Primary Color
        fontWeight: '800',
        marginBottom: '20px'
    },
    subTitle: {
        fontSize: '18px',
        color: '#7A7A7A',
        lineHeight: '1.6'
    },
    ctaBtn: {
        textDecoration: 'none',
        background: '#215D7B', // Primary Color
        color: '#fff',
        padding: '16px 50px',
        borderRadius: '8px',
        fontSize: '18px',
        fontWeight: '600',
        boxShadow: '0 4px 14px 0 rgba(33, 93, 123, 0.39)'
    }
};

export default Home;