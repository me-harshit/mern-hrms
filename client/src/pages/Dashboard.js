import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; 
import Swal from 'sweetalert2';
import api from '../utils/api'; 
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faUsers, faUserCheck, faClipboardList, faPlaneDeparture, 
    faSpinner, faBriefcase, faCalendarCheck, faClock, faUserTimes,
    faWallet, faFileInvoiceDollar, faPlus, faHistory, faTimes
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

    // Ledger States
    const [transactions, setTransactions] = useState([]);
    const [showLedger, setShowLedger] = useState(false);
    const [txFilter, setTxFilter] = useState('All');

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

                // Fetch Wallet & Expense Stats if they are a Purchaser
                if (isPurchaser || !isEmployee) {
                    try {
                        const [walletRes, purchaseRes] = await Promise.all([
                            api.get('/wallets/my-balance').catch(() => ({ data: { balance: 0 } })),
                            api.get('/expenses').catch(() => ({ data: [] }))
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

    // Fetch personal ledger history
    const fetchMyLedger = async () => {
        try {
            const res = await api.get('/wallets/my-transactions');
            setTransactions(res.data);
            setShowLedger(true);
        } catch (err) {
            Swal.fire('Error', 'Could not load transaction history', 'error');
        }
    };

    const filteredTransactions = transactions.filter(t => txFilter === 'All' ? true : t.type === txFilter);

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
                    <div className="stat-card theme-blue clickable-card" onClick={() => navigate('/employees')} title="View Employee Directory">
                        <div className="stat-icon"><FontAwesomeIcon icon={faUsers} /></div>
                        <div className="stat-info"><p>Total Employees</p><h3>{stats.totalEmployees}</h3></div>
                    </div>
                    
                    <div className="stat-card theme-green clickable-card" onClick={() => navigate('/attendance-logs')} title="View Attendance Logs">
                        <div className="stat-icon"><FontAwesomeIcon icon={faUserCheck} /></div>
                        <div className="stat-info"><p>Present Today</p><h3>{stats.presentToday}</h3></div>
                    </div>

                    <div className="stat-card theme-red clickable-card" onClick={() => navigate('/absent-employees')} title="View Live Absence Dashboard">
                        <div className="stat-icon"><FontAwesomeIcon icon={faUserTimes} /></div>
                        <div className="stat-info"><p>Live Absence</p><h3 className="text-danger">{stats.absentToday}</h3></div>
                    </div>

                    {/* 👇 FIXED: Pointing to /Employee-requests */}
                    <div className="stat-card theme-yellow clickable-card" onClick={() => navigate('/Employee-requests')} title="View Pending Requests">
                        <div className="stat-icon"><FontAwesomeIcon icon={faClipboardList} /></div>
                        <div className="stat-info"><p>Pending Actions</p><h3>{stats.pendingLeaves}</h3></div>
                    </div>
                    
                    {/* 👇 FIXED: Pointing to /Employee-requests */}
                    <div className="stat-card theme-purple clickable-card" onClick={() => navigate('/Employee-requests')} title="View Approved Leaves">
                        <div className="stat-icon"><FontAwesomeIcon icon={faPlaneDeparture} /></div>
                        <div className="stat-info"><p>On Leave</p><h3>{stats.onLeaveToday}</h3></div>
                    </div>
                </div>
            )}

            {/* --- EMPLOYEE VIEW --- */}
            {isEmployee && (
                <div className="stats-grid">
                    <div className="stat-card theme-green clickable-card" onClick={() => navigate('/attendance')}>
                        <div className="stat-icon"><FontAwesomeIcon icon={faCalendarCheck} /></div>
                        <div className="stat-info"><p>Attendance (Month)</p><h3>{stats.presentDays || 0} Days</h3></div>
                    </div>
                    
                    <div className="stat-card theme-blue clickable-card" onClick={() => navigate('/leaves')}>
                        <div className="stat-icon"><FontAwesomeIcon icon={faBriefcase} /></div>
                        <div className="stat-info"><p>Leave Balance</p><h3>{stats.leaveBalance || 0} / {stats.totalLeaves || 0}</h3></div>
                    </div>
                    
                    <div className="stat-card theme-yellow clickable-card" onClick={() => navigate('/leaves')}>
                        <div className="stat-icon"><FontAwesomeIcon icon={faClock} /></div>
                        <div className="stat-info"><p>Pending Leave Requests</p><h3>{stats.myPending || 0}</h3></div>
                    </div>

                    {/* PURCHASER EXTRA CARDS */}
                    {isPurchaser && (
                        <>
                            <div className="stat-card theme-purple clickable-card" onClick={() => navigate('/expenses')}>
                                <div className="stat-icon"><FontAwesomeIcon icon={faFileInvoiceDollar} /></div>
                                <div className="stat-info"><p>Pending Expenses</p><h3>{purchaseStats.pending} Requests</h3></div>
                            </div>

                            <div className={`stat-card ${walletBalance < 0 ? 'theme-red' : 'theme-green'} clickable-card`} onClick={() => navigate('/expenses')}>
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
                    
                    <button className="gts-btn primary" onClick={() => navigate('/attendance')}>
                        <FontAwesomeIcon icon={faCalendarCheck} className="btn-icon" /> View Attendance Logs
                    </button>
                    
                    <button className="gts-btn warning" onClick={() => navigate('/leaves')}>
                        <FontAwesomeIcon icon={faPlaneDeparture} className="btn-icon" /> Apply for Leave
                    </button>
                    
                    {/* New Purchaser Quick Actions */}
                    {isPurchaser && (
                        <>
                            <button className="gts-btn" style={{ background: '#215D7B', color: 'white' }} onClick={() => navigate('/add-expense')}>
                                <FontAwesomeIcon icon={faPlus} className="btn-icon" /> Log New Expense
                            </button>
                            <button className="gts-btn" style={{ background: '#0284c7', color: 'white' }} onClick={fetchMyLedger}>
                                <FontAwesomeIcon icon={faHistory} className="btn-icon" /> View Wallet Ledger
                            </button>
                        </>
                    )}

                    {!isEmployee && (
                        <button className="gts-btn danger" onClick={() => navigate('/Employee-requests')}>
                            <FontAwesomeIcon icon={faClipboardList} className="btn-icon" /> Review Requests
                        </button>
                    )}
                </div>
            </div>

            {/* --- LEDGER MODAL --- */}
            {showLedger && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'white', borderRadius: '12px', padding: '25px', width: '90%', maxWidth: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.2s' }}>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '15px' }}>
                            <h2 style={{ margin: 0, fontSize: '20px', color: '#1e293b' }}><FontAwesomeIcon icon={faHistory} style={{ color: '#215D7B', marginRight: '8px' }}/> My Transaction Ledger</h2>
                            <button onClick={() => setShowLedger(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}><FontAwesomeIcon icon={faTimes}/></button>
                        </div>

                        <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                            <select className="custom-input" value={txFilter} onChange={(e) => setTxFilter(e.target.value)} style={{ maxWidth: '200px', margin: 0 }}>
                                <option value="All">All Transactions</option>
                                <option value="Credit">Credits (+)</option>
                                <option value="Debit">Debits (-)</option>
                                <option value="Reset">Manual Resets</option>
                            </select>
                        </div>

                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            <table className="employee-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '12px 15px' }}>Date</th>
                                        <th style={{ padding: '12px 15px' }}>Description</th>
                                        <th style={{ padding: '12px 15px' }}>Auth By</th>
                                        <th style={{ padding: '12px 15px', textAlign: 'right' }}>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTransactions.length === 0 ? (
                                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>No transactions found.</td></tr>
                                    ) : (
                                        filteredTransactions.map(tx => (
                                            <tr key={tx._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '12px 15px', fontSize: '13px' }}>{new Date(tx.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                                                <td style={{ padding: '12px 15px', fontSize: '13px', color: '#475569' }}>{tx.description}</td>
                                                <td style={{ padding: '12px 15px', fontSize: '13px' }}>{tx.performedBy?.name || 'System'}</td>
                                                <td style={{ padding: '12px 15px', textAlign: 'right', fontWeight: 'bold', color: tx.type === 'Credit' ? '#16a34a' : (tx.type === 'Debit' ? '#dc2626' : '#d97706') }}>
                                                    {tx.type === 'Debit' ? '-' : (tx.type === 'Credit' ? '+' : '=')} ₹{tx.amount.toLocaleString('en-IN')}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;