import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; 
import api from '../utils/api'; 
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faUsers, faUserCheck, faClipboardList, faPlaneDeparture, 
    faSpinner, faBriefcase, faCalendarCheck, faClock, faUserTimes,
    faWallet, faFileInvoiceDollar, faPlus
} from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

const Dashboard = () => {
    const user = JSON.parse(localStorage.getItem('user'));
    const isEmployee = user?.role === 'EMPLOYEE';
    const isPurchaser = user?.isPurchaser;
    const navigate = useNavigate();

    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Extra states for purchaser employees
    const [walletBalance, setWalletBalance] = useState(0);
    const [purchaseStats, setPurchaseStats] = useState({ pending: 0, totalAmount: 0 });

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const url = isEmployee 
                    ? '/dashboard/employee-stats'
                    : '/dashboard/admin-stats';

                const res = await api.get(url);
                let dashboardData = res.data;

                // If Admin/HR, fetch the live absent count to show on the dashboard
                if (!isEmployee) {
                    try {
                        const absentRes = await api.get('/attendance/absent');
                        dashboardData = { ...dashboardData, absentToday: absentRes.data.length };
                    } catch (absentErr) {
                        console.error("Could not fetch absent count", absentErr);
                        dashboardData = { ...dashboardData, absentToday: 0 };
                    }
                }

                setStats(dashboardData);

                // 👇 Fetch Wallet & Expense Stats if they are a Purchaser 👇
                if (isPurchaser || !isEmployee) {
                    try {
                        const [walletRes, purchaseRes] = await Promise.all([
                            api.get('/wallets/my-balance').catch(() => ({ data: { balance: 0 } })),
                            api.get('/purchases').catch(() => ({ data: [] }))
                        ]);
                        
                        setWalletBalance(walletRes.data.balance);
                        
                        const pendingCount = purchaseRes.data.filter(p => p.status === 'Pending').length;
                        const totalAmt = purchaseRes.data.reduce((sum, p) => sum + p.amount, 0);
                        
                        setPurchaseStats({ pending: pendingCount, totalAmount: totalAmt });
                    } catch (err) {
                        console.error("Could not fetch purchaser stats", err);
                    }
                }

            } catch (err) {
                console.error("Error loading dashboard data");
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [isEmployee, isPurchaser]);

    if (loading || !stats) return <div className="main-content"><FontAwesomeIcon icon={faSpinner} spin /> Loading...</div>;

    return (
        <div className="dashboard-container fade-in">
            <div className="welcome-banner">
                <h1>Welcome, {user.name}</h1>
                <p>{isEmployee ? "Here is your personal summary." : "Here is the company overview."}</p>
            </div>

            {/* --- ADMIN / HR VIEW --- */}
            {!isEmployee && (
                <div className="stats-grid">
                    
                    {/* Total Employees */}
                    <div 
                        className="stat-card theme-blue clickable-card" 
                        onClick={() => navigate('/employees')} 
                        title="View Employee Directory"
                    >
                        <div className="stat-icon">
                            <FontAwesomeIcon icon={faUsers} />
                        </div>
                        <div className="stat-info">
                            <p>Total Employees</p>
                            <h3>{stats.totalEmployees}</h3>
                        </div>
                    </div>
                    
                    {/* Present Today */}
                    <div 
                        className="stat-card theme-green clickable-card" 
                        onClick={() => navigate('/attendance-logs')} 
                        title="View Attendance Logs"
                    >
                        <div className="stat-icon">
                            <FontAwesomeIcon icon={faUserCheck} />
                        </div>
                        <div className="stat-info">
                            <p>Present Today</p>
                            <h3>{stats.presentToday}</h3>
                        </div>
                    </div>

                    {/* Live Absence */}
                    <div 
                        className="stat-card theme-red clickable-card" 
                        onClick={() => navigate('/absent-employees')} 
                        title="View Live Absence Dashboard"
                    >
                        <div className="stat-icon">
                            <FontAwesomeIcon icon={faUserTimes} />
                        </div>
                        <div className="stat-info">
                            <p>Live Absence</p>
                            <h3 className="text-danger">{stats.absentToday}</h3>
                        </div>
                    </div>

                    {/* Pending Actions */}
                    <div 
                        className="stat-card theme-yellow clickable-card" 
                        onClick={() => navigate('/leave-requests')} 
                        title="View Leave Requests"
                    >
                        <div className="stat-icon">
                            <FontAwesomeIcon icon={faClipboardList} />
                        </div>
                        <div className="stat-info">
                            <p>Pending Actions</p>
                            <h3>{stats.pendingLeaves}</h3>
                        </div>
                    </div>
                    
                    {/* On Leave */}
                    <div 
                        className="stat-card theme-purple clickable-card" 
                        onClick={() => navigate('/leave-requests')} 
                        title="View Leave Requests"
                    >
                        <div className="stat-icon">
                            <FontAwesomeIcon icon={faPlaneDeparture} />
                        </div>
                        <div className="stat-info">
                            <p>On Leave</p>
                            <h3>{stats.onLeaveToday}</h3>
                        </div>
                    </div>
                </div>
            )}

            {/* --- EMPLOYEE VIEW --- */}
            {isEmployee && (
                <div className="stats-grid">
                    <div className="stat-card theme-green clickable-card" onClick={() => navigate('/attendance')}>
                        <div className="stat-icon"><FontAwesomeIcon icon={faCalendarCheck} /></div>
                        <div className="stat-info">
                            <p>Attendance (Month)</p>
                            <h3>{stats.presentDays || 0} Days</h3>
                        </div>
                    </div>
                    
                    <div className="stat-card theme-blue clickable-card" onClick={() => navigate('/leaves')}>
                        <div className="stat-icon"><FontAwesomeIcon icon={faBriefcase} /></div>
                        <div className="stat-info">
                            <p>Leave Balance</p>
                            <h3>{stats.leaveBalance || 0} / {stats.totalLeaves || 0}</h3>
                        </div>
                    </div>
                    
                    <div className="stat-card theme-yellow clickable-card" onClick={() => navigate('/leaves')}>
                        <div className="stat-icon"><FontAwesomeIcon icon={faClock} /></div>
                        <div className="stat-info">
                            <p>Pending Leave Requests</p>
                            <h3>{stats.myPending || 0}</h3>
                        </div>
                    </div>

                    {/* 👇 PURCHASER EXTRA CARDS 👇 */}
                    {isPurchaser && (
                        <>
                            <div className="stat-card theme-purple clickable-card" onClick={() => navigate('/purchases')}>
                                <div className="stat-icon"><FontAwesomeIcon icon={faFileInvoiceDollar} /></div>
                                <div className="stat-info">
                                    <p>Pending Expenses</p>
                                    <h3>{purchaseStats.pending} Requests</h3>
                                </div>
                            </div>

                            <div className={`stat-card ${walletBalance < 0 ? 'theme-red' : 'theme-green'} clickable-card`} onClick={() => navigate('/purchases')}>
                                <div className="stat-icon"><FontAwesomeIcon icon={faWallet} /></div>
                                <div className="stat-info">
                                    <p>My Wallet Balance</p>
                                    <h3 className={walletBalance < 0 ? 'text-danger' : ''}>
                                        {walletBalance < 0 ? '-' : ''}₹ {Math.abs(walletBalance).toLocaleString('en-IN')}
                                    </h3>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* --- COMMON QUICK ACTIONS --- */}
            <div className="quick-actions-section">
                <h3>Quick Actions</h3>
                <div className="quick-actions-grid">
                    
                    {/* Renamed Button */}
                    <button className="gts-btn primary" onClick={() => navigate('/attendance')}>
                        <FontAwesomeIcon icon={faCalendarCheck} className="btn-icon" /> View Attendance Logs
                    </button>
                    
                    <button className="gts-btn warning" onClick={() => navigate('/leaves')}>
                        <FontAwesomeIcon icon={faPlaneDeparture} className="btn-icon" /> Apply for Leave
                    </button>
                    
                    {/* New Purchaser Quick Action */}
                    {isPurchaser && (
                        <button className="gts-btn" style={{ background: '#215D7B', color: 'white' }} onClick={() => navigate('/add-purchase')}>
                            <FontAwesomeIcon icon={faPlus} className="btn-icon" /> Log New Expense
                        </button>
                    )}

                    {!isEmployee && (
                        <button className="gts-btn danger" onClick={() => navigate('/leave-requests')}>
                            <FontAwesomeIcon icon={faClipboardList} className="btn-icon" /> Review Requests
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;