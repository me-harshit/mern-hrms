import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faUser, faArrowLeft, faClock, faPlaneDeparture, faEdit, faEnvelope, faPhone, faWallet, faHistory
} from '@fortawesome/free-solid-svg-icons';
import Pagination from '../../components/Pagination';
import '../../styles/App.css';

const EmployeeProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('details');

    const currentUser = JSON.parse(localStorage.getItem('user'));
    const [user, setUser] = useState({});
    const [leaveStats, setLeaveStats] = useState({ history: [] });

    // --- WALLET & LEDGER STATES ---
    const [walletBalance, setWalletBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [txFilter, setTxFilter] = useState('All');

    // --- ATTENDANCE PAGINATION STATES ---
    const [attendanceLogs, setAttendanceLogs] = useState([]);
    const [attLoading, setAttLoading] = useState(false);
    const [attPage, setAttPage] = useState(1);
    const [attTotalPages, setAttTotalPages] = useState(1);
    const [attTotalRecords, setAttTotalRecords] = useState(0);
    const [attLimit, setAttLimit] = useState(10);

    // Initial Profile Load
    useEffect(() => {
        fetchEmployeeData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Independent Attendance Load
    useEffect(() => {
        fetchAttendanceLogs(attPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, attPage, attLimit]);

    const fetchEmployeeData = async () => {
        try {
            const [userRes, leaveRes, walletRes] = await Promise.all([
                api.get(`/employees/${id}`),
                api.get(`/leaves/admin/user-leaves/${id}`),
                api.get(`/wallets/user/${id}`).catch(() => ({ data: { balance: 0 } }))
            ]);

            setUser(userRes.data);
            setLeaveStats(leaveRes.data);
            setWalletBalance(walletRes.data.balance);
            fetchTransactions(); // Fetch ledger on load
            setLoading(false);
        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'Could not load employee data', 'error');
            navigate('/employees');
        }
    };

    const fetchTransactions = async () => {
        try {
            const res = await api.get(`/wallets/transactions/${id}`);
            setTransactions(res.data);
        } catch (err) {
            console.error("Failed to load transactions", err);
        }
    };

    const fetchAttendanceLogs = async (pageToFetch) => {
        setAttLoading(true);
        try {
            const res = await api.get(`/attendance/admin/user-logs/${id}`, {
                params: { page: pageToFetch, limit: attLimit }
            });
            setAttendanceLogs(res.data.data);
            setAttTotalPages(res.data.pagination.totalPages);
            setAttTotalRecords(res.data.pagination.totalRecords);
            setAttPage(res.data.pagination.currentPage);
        } catch (err) {
            console.error("Failed to load attendance", err);
        } finally {
            setAttLoading(false);
        }
    };

    const handleManageWallet = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Manage Wallet Balance',
            html: `
                <div style="text-align: left; padding: 0 10px;">
                    <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin-bottom: 15px; font-size: 15px; color: #334155; text-align: center; border: 1px solid #e2e8f0;">
                        Current Balance: <strong style="color: ${walletBalance < 0 ? '#dc2626' : '#16a34a'}; font-size: 18px;">₹${walletBalance.toLocaleString('en-IN')}</strong>
                    </div>
                    
                    <label class="swal-custom-label">Action</label>
                    <select id="wallet-action" class="swal2-select" style="width: 100%; margin-bottom: 15px;">
                        <option value="add">Add Funds (+)</option>
                        <option value="deduct">Deduct Funds (-)</option>
                        <option value="set">Set Exact Balance (=)</option>
                    </select>

                    <label class="swal-custom-label">Amount (₹)</label>
                    <input id="wallet-amount" type="number" class="swal2-input" placeholder="e.g. 5000" style="width: 100%;">
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#215D7B',
            confirmButtonText: 'Update Balance',
            preConfirm: () => {
                const action = document.getElementById('wallet-action').value;
                const amount = Number(document.getElementById('wallet-amount').value);

                if (!amount && amount !== 0) {
                    Swal.showValidationMessage('Please enter a valid amount');
                    return false;
                }
                return { action, amount };
            }
        });

        if (formValues) {
            let newBalance = walletBalance;
            if (formValues.action === 'add') newBalance += formValues.amount;
            if (formValues.action === 'deduct') newBalance -= formValues.amount;
            if (formValues.action === 'set') newBalance = formValues.amount;

            try {
                await api.put('/wallets/update', {
                    targetUserId: id,
                    newBalance,
                    action: formValues.action,
                    amountChanged: formValues.amount
                });
                Swal.fire('Success', `Wallet updated to ₹${newBalance.toLocaleString('en-IN')}`, 'success');
                setWalletBalance(newBalance);
                fetchTransactions(); // 👇 Instantly refresh the ledger table!
            } catch (err) {
                Swal.fire('Error', 'Failed to update wallet', 'error');
            }
        }
    };

    const calculateDuration = (start, end) => {
        // If both are missing (e.g., Absent, On Leave, Pending), show a dash
        if (!start && !end) return <span className="text-muted">-</span>;

        // If only checkout is missing, they are currently working
        if (!start || !end) return <span className="text-muted italic text-small">In Progress</span>;

        const startTime = new Date(start);
        const endTime = new Date(end);
        const diffMs = endTime - startTime;
        if (diffMs < 0) return "-";

        const totalMinutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours}h ${minutes}m`;
    };

    const filteredTransactions = transactions.filter(t => txFilter === 'All' ? true : t.type === txFilter);

    if (loading) return <div className="main-content">Loading Profile...</div>;

    return (
        <div className="dashboard-container fade-in">
            {/* HEADER */}
            <div className="page-header-row mb-20" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <button className="gts-btn cancel-btn m-0" onClick={() => navigate('/employees')}>
                        <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back
                    </button>
                    <h1 className="page-title header-no-margin">{user.name}'s Profile</h1>
                </div>
                <button className="gts-btn primary m-0" onClick={() => navigate(`/edit-employee/${id}`)}>
                    <FontAwesomeIcon icon={faEdit} className="mr-5" /> Edit Profile
                </button>
            </div>

            {/* SUMMARY CARD (Always Visible) */}
            <div className="control-card p-20 mb-20" style={{ display: 'flex', alignItems: 'center', gap: '20px', background: '#f8fafc'}}>
                <div style={{ width: '80px', height: '80px', background: '#215D7B', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 'bold' }}>
                    {user.name?.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                    <h2 style={{ margin: '0 0 5px 0', fontSize: '22px' }}>{user.name}</h2>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                        <span className={`role-tag ${user.role?.toLowerCase()}`}>{user.role}</span>
                        <span className="text-muted fw-600 text-small">ID: {user.employeeId}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#475569' }}>
                        <div><FontAwesomeIcon icon={faEnvelope} className="text-primary mr-5" /> {user.email}</div>
                        <div><FontAwesomeIcon icon={faPhone} className="text-primary mr-5" /> {user.phoneNumber || 'N/A'}</div>
                    </div>
                </div>
                <div style={{ textAlign: 'right', paddingLeft: '20px', borderLeft: '1px solid #cbd5e1' }}>
                    <div className="text-muted text-small fw-600 mb-5">Wallet Balance</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: walletBalance < 0 ? '#dc2626' : '#16a34a' }}>
                        ₹{walletBalance.toLocaleString('en-IN')}
                    </div>
                </div>
            </div>

            {/* TABS */}
            <div className="control-card p-15 mb-25">
                <div className="tab-buttons-wrapper">
                    <button className={`gts-btn tab-btn ${activeTab === 'details' ? 'primary' : 'warning inactive'}`} onClick={() => setActiveTab('details')}>
                        <FontAwesomeIcon icon={faUser} className="btn-icon" /> Details & Config
                    </button>
                    <button className={`gts-btn tab-btn ${activeTab === 'wallet' ? 'primary' : 'warning inactive'}`} onClick={() => setActiveTab('wallet')}>
                        <FontAwesomeIcon icon={faWallet} className="btn-icon" /> Wallet & Ledger
                    </button>
                    <button className={`gts-btn tab-btn ${activeTab === 'leaves' ? 'primary' : 'warning inactive'}`} onClick={() => setActiveTab('leaves')}>
                        <FontAwesomeIcon icon={faPlaneDeparture} className="btn-icon" /> Leaves & Balances
                    </button>
                    <button className={`gts-btn tab-btn ${activeTab === 'attendance' ? 'primary' : 'warning inactive'}`} onClick={() => setActiveTab('attendance')}>
                        <FontAwesomeIcon icon={faClock} className="btn-icon" /> Attendance Logs
                    </button>
                </div>
            </div>

            {/* --- TAB CONTENT: DETAILS (VIEW ONLY) --- */}
            {activeTab === 'details' && (
                <div className="control-card p-30 fade-in d-block">
                    <h3 className="section-title border-bottom pb-10 mb-20">Personal & Employment Overview</h3>
                    <div className="detail-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '25px' }}>
                        <div><label className="text-muted text-small d-block mb-5">Date of Birth</label><div className="fw-600">{user.dateOfBirth ? new Date(user.dateOfBirth).toLocaleDateString('en-GB') : 'N/A'}</div></div>
                        <div><label className="text-muted text-small d-block mb-5">Joining Date</label><div className="fw-600">{user.joiningDate ? new Date(user.joiningDate).toLocaleDateString('en-GB') : 'N/A'}</div></div>
                        <div><label className="text-muted text-small d-block mb-5">Aadhaar Number</label><div className="fw-600">{user.aadhaar || 'N/A'}</div></div>
                        <div><label className="text-muted text-small d-block mb-5">Emergency Contact</label><div className="fw-600">{user.emergencyContact || 'N/A'}</div></div>
                        <div style={{ gridColumn: '1 / -1' }}><label className="text-muted text-small d-block mb-5">Address</label><div className="fw-600">{user.address || 'N/A'}</div></div>
                    </div>

                    <h3 className="section-title border-bottom pb-10 mb-20 mt-30">System Configuration</h3>
                    <div className="detail-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '25px' }}>
                        <div><label className="text-muted text-small d-block mb-5">Shift Timing</label><div className="fw-600 text-primary">{user.shiftType || 'DAY'} Shift</div></div>
                        <div><label className="text-muted text-small d-block mb-5">Account Status</label><span className={`status-badge ${user.status === 'ACTIVE' ? 'success' : 'danger'}`} style={{ padding: '2px 6px', fontSize: '10px' }}>{user.status || 'ACTIVE'}</span></div>
                        <div><label className="text-muted text-small d-block mb-5">Reporting Manager</label><div className="fw-600">{user.reportingManagerName || 'None'}</div><div className="text-small text-muted">{user.reportingManagerEmail}</div></div>
                        <div><label className="text-muted text-small d-block mb-5">Purchaser Access</label><div className={`fw-600 ${user.isPurchaser ? 'text-success' : 'text-muted'}`}>{user.isPurchaser ? 'Authorized' : 'Not Authorized'}</div></div>
                        <div><label className="text-muted text-small d-block mb-5">Monthly Salary</label><div className="fw-bold" style={{ fontSize: '18px' }}>₹ {user.salary ? user.salary.toLocaleString('en-IN') : '0'}</div></div>
                    </div>
                </div>
            )}

            {/* --- TAB CONTENT: WALLET & LEDGER --- */}
            {activeTab === 'wallet' && (
                <div className="fade-in">
                    <div className="control-card p-25 mb-20" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                        <div>
                            <h3 className="section-title m-0"><FontAwesomeIcon icon={faWallet} className="text-primary mr-10" /> Company Wallet</h3>
                            <div style={{ fontSize: '28px', fontWeight: 'bold', color: walletBalance < 0 ? '#dc2626' : '#16a34a', marginTop: '10px' }}>
                                ₹{walletBalance.toLocaleString('en-IN')}
                            </div>
                        </div>
                        {(currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER' || currentUser?.role === 'HR') && (
                            <button className="gts-btn primary btn-large" onClick={handleManageWallet}>
                                <FontAwesomeIcon icon={faEdit} className="btn-icon" /> Adjust Funds
                            </button>
                        )}
                    </div>

                    <div className="employee-table-container">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 20px 0' }}>
                            <h3 className="table-header-title m-0"><FontAwesomeIcon icon={faHistory} className="text-muted mr-10" /> Transaction Ledger</h3>
                            <select className="custom-input" value={txFilter} onChange={(e) => setTxFilter(e.target.value)} style={{ width: '200px', margin: 0 }}>
                                <option value="All">All Transactions</option>
                                <option value="Credit">Credits (+)</option>
                                <option value="Debit">Debits (-)</option>
                                <option value="Reset">Manual Resets</option>
                            </select>
                        </div>
                        <table className="employee-table mt-15">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Description</th>
                                    <th>Authorized By</th>
                                    <th style={{ textAlign: 'right' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTransactions.length === 0 ? (
                                    <tr><td colSpan="4" className="empty-table-message text-muted">No transactions found matching this filter.</td></tr>
                                ) : (
                                    filteredTransactions.map(tx => (
                                        <tr key={tx._id}>
                                            <td data-label="Date">{new Date(tx.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                                            <td data-label="Description" className="text-muted fw-500">{tx.description}</td>
                                            <td data-label="Auth By">{tx.performedBy?.name || 'System'}</td>
                                            <td data-label="Amount" style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '15px', color: tx.type === 'Credit' ? '#16a34a' : (tx.type === 'Debit' ? '#dc2626' : '#d97706') }}>
                                                {tx.type === 'Debit' ? '-' : (tx.type === 'Credit' ? '+' : '=')} ₹{tx.amount.toLocaleString('en-IN')}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- TAB CONTENT: LEAVES --- */}
            {activeTab === 'leaves' && (
                <div className="fade-in">
                    <div className="flex-row gap-20 mb-20">
                        <div className="control-card flex-1 p-20 text-center">
                            <div className="text-muted text-small mb-5 fw-600">Casual Leaves (CL) Remaining</div>
                            <div className="fs-24 fw-bold text-primary">{user.casualLeaveBalance || 0}</div>
                        </div>
                        <div className="control-card flex-1 p-20 text-center">
                            <div className="text-muted text-small mb-5 fw-600">Earned Leaves (EL) Remaining</div>
                            <div className="fs-24 fw-bold text-primary">{user.earnedLeaveBalance || 0}</div>
                        </div>
                    </div>

                    <div className="employee-table-container">
                        <h3 className="table-header-title" style={{ padding: '20px 20px 0' }}>Leave History</h3>
                        <table className="employee-table mt-15">
                            <thead>
                                <tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                {leaveStats.history && leaveStats.history.length > 0 ? (
                                    leaveStats.history.map(l => (
                                        <tr key={l._id}>
                                            <td data-label="Type"><span className="role-tag employee text-small">{l.leaveType}</span></td>
                                            <td data-label="Dates" className="text-dark-gray text-small">
                                                {new Date(l.fromDate).toLocaleDateString('en-GB')}
                                                <span className="text-muted mx-1">➜</span>
                                                {new Date(l.toDate).toLocaleDateString('en-GB')}
                                            </td>
                                            <td data-label="Days" className="fw-600">{l.days}</td>
                                            <td data-label="Reason" className="note-cell text-muted text-small">{l.reason}</td>
                                            <td data-label="Status"><span className={`status-badge ${l.status === 'Approved' ? 'success' : l.status === 'Rejected' ? 'danger' : 'warning'}`}>{l.status}</span></td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="5" className="empty-table-message">No leave history found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- TAB CONTENT: ATTENDANCE --- */}
            {activeTab === 'attendance' && (
                <div className="employee-table-container fade-in">
                    <h3 className="table-header-title" style={{ padding: '20px 20px 0' }}>Attendance Logs</h3>
                    <table className="employee-table mt-15">
                        <thead>
                            <tr><th>Date</th><th>Check In</th><th>Check Out</th><th>Working Hours</th><th>Status</th><th>Note</th></tr>
                        </thead>
                        <tbody>
                            {attLoading ? (
                                <tr><td colSpan="6" className="empty-table-message">Loading attendance...</td></tr>
                            ) : attendanceLogs.length > 0 ? (
                                attendanceLogs.map(log => (
                                    <tr key={log._id}>
                                        <td data-label="Date" className="fw-500 text-dark-blue">{log.date}</td>

                                        {/* 👇 FIXED: Added safety checks for checkIn and checkOut */}
                                        <td data-label="Check In">
                                            {log.checkIn ? new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>
                                        <td data-label="Check Out">
                                            {log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>

                                        <td data-label="Working Hours" className="fw-bold text-dark-gray">
                                            {calculateDuration(log.checkIn, log.checkOut)}
                                        </td>
                                        <td data-label="Status">
                                            <span className={`status-badge ${log.status === 'Present' ? 'success' :
                                                    log.status === 'Half Day' ? 'warning' :
                                                        log.status === 'Pending' ? 'primary' : 'danger'
                                                }`}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td data-label="Note" className="note-cell text-muted text-small">{log.note || '-'}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan="6" className="empty-table-message">No logs found.</td></tr>
                            )}
                        </tbody>
                    </table>

                    {!attLoading && (
                        <Pagination
                            currentPage={attPage}
                            totalPages={attTotalPages}
                            totalRecords={attTotalRecords}
                            limit={attLimit}
                            onPageChange={(page) => setAttPage(page)}
                            onLimitChange={(newLimit) => {
                                setAttLimit(newLimit);
                                setAttPage(1);
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default EmployeeProfile;