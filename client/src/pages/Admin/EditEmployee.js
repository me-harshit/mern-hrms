import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faUser, faSave, faArrowLeft, faClock, faPlaneDeparture, 
    faEdit, faWallet, faHistory, faTimes, faUserEdit, faCog, faMoneyBillWave, faKey 
} from '@fortawesome/free-solid-svg-icons';
import Pagination from '../../components/Pagination'; 
import '../../styles/App.css';
import '../../styles/expenses.css'; 

const EditEmployee = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('details');

    const [user, setUser] = useState({});
    const [newPassword, setNewPassword] = useState(''); // Separated for safety
    const [leaveStats, setLeaveStats] = useState({ history: [] });
    const currentUser = JSON.parse(localStorage.getItem('user'));
    
    // --- WALLET STATES ---
    const [walletBalance, setWalletBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [showLedger, setShowLedger] = useState(false);
    const [txFilter, setTxFilter] = useState('All');

    // --- ATTENDANCE PAGINATION STATES ---
    const [attendanceLogs, setAttendanceLogs] = useState([]);
    const [attLoading, setAttLoading] = useState(false);
    const [attPage, setAttPage] = useState(1);
    const [attTotalPages, setAttTotalPages] = useState(1);
    const [attTotalRecords, setAttTotalRecords] = useState(0);
    const [attLimit, setAttLimit] = useState(10);

    useEffect(() => {
        fetchEmployeeData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

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
            setLoading(false);
        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'Could not load employee data', 'error');
            navigate('/employees');
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

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        try {
            const payload = { ...user };
            if (newPassword.trim() !== '') {
                payload.password = newPassword;
            }

            await api.put(`/employees/${id}`, payload);
            Swal.fire('Success', 'Employee Profile Updated', 'success');
            setNewPassword(''); // Clear after success
            navigate(`/employee/${id}`); 
        } catch (err) {
            Swal.fire('Error', 'Failed to update profile', 'error');
        }
    };

    const handleUpdateBalance = async () => {
        try {
            await api.post('/leaves/admin/update-balance', {
                userId: id,
                cl: user.casualLeaveBalance,
                el: user.earnedLeaveBalance,
                salary: user.salary
            });
            Swal.fire('Success', 'Employee Balances updated', 'success');
            fetchEmployeeData();
        } catch (err) {
            Swal.fire('Error', 'Update failed', 'error');
        }
    };

    const calculateDuration = (start, end) => {
        if (!start && !end) return <span className="text-muted">-</span>;
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

    const handleManageWallet = async () => {
        const today = new Date().toISOString().split('T')[0];

        const { value: formValues } = await Swal.fire({
            title: 'Manage Wallet Balance',
            html: `
                <div style="text-align: left; padding: 0 10px;">
                    <div style="background: var(--bg-hover, #f1f5f9); padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 15px; color: var(--text-main, #334155); text-align: center; border: 1px solid var(--border-color, #e2e8f0);">
                        Current Balance: <strong style="color: ${walletBalance < 0 ? 'var(--danger, #dc2626)' : 'var(--success, #16a34a)'}; font-size: 18px;">₹${walletBalance.toLocaleString('en-IN')}</strong>
                    </div>
                    <label class="swal-custom-label">Action</label>
                    <select id="wallet-action" class="swal2-select" style="width:100%; margin-bottom: 15px;">
                        <option value="add">Add Funds (+)</option>
                        <option value="deduct">Deduct Funds (-)</option>
                        <option value="set">Set Exact Balance (=)</option>
                    </select>
                    
                    <label class="swal-custom-label">Amount (₹)</label>
                    <input id="wallet-amount" type="number" class="swal2-input" placeholder="e.g. 5000" style="width:100%; margin-bottom: 15px;">

                    <label class="swal-custom-label">Transaction Date</label>
                    <input id="wallet-date" type="date" class="swal2-input" value="${today}" style="width: 100%;">
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#215D7B',
            preConfirm: () => {
                const action = document.getElementById('wallet-action').value;
                const amount = Number(document.getElementById('wallet-amount').value);
                const date = document.getElementById('wallet-date').value;

                if (!amount && amount !== 0) {
                    Swal.showValidationMessage('Please enter a valid amount');
                    return false;
                }
                if (!date) {
                    Swal.showValidationMessage('Please select a date');
                    return false;
                }
                return { action, amount, date };
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
                    amountChanged: formValues.amount,
                    date: formValues.date
                });
                Swal.fire('Success', `Updated to ₹${newBalance.toLocaleString('en-IN')}`, 'success');
                setWalletBalance(newBalance);
            } catch (err) {
                Swal.fire('Error', 'Failed to update wallet', 'error');
            }
        }
    };

    const fetchLedger = async () => {
        try {
            const res = await api.get(`/wallets/transactions/${id}`);
            setTransactions(res.data);
            setShowLedger(true);
        } catch (err) {
            Swal.fire('Error', 'Could not load transaction history', 'error');
        }
    };

    const handleEdit = async (log) => {
        const toTimeStr = (dateStr) => {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };

        const inTime = toTimeStr(log.checkIn);
        const outTime = toTimeStr(log.checkOut);

        const { value: formValues } = await Swal.fire({
            title: `Edit Log: ${log.date}`,
            html: `
                <div style="text-align:left">
                    <p style="font-size:12px; color:var(--text-muted, #666); margin-bottom:10px;">
                        <span style="color:var(--danger, #dc2626)">*</span> Changing time will auto-recalculate Status.
                    </p>
                    <label class="swal-custom-label">Check In Time</label>
                    <input id="swal-in" type="time" class="swal2-input" value="${inTime}">
                    <label class="swal-custom-label">Check Out Time</label>
                    <input id="swal-out" type="time" class="swal2-input" value="${outTime}">
                    <label class="swal-custom-label">Manual Status Override</label>
                    <select id="swal-status" class="swal2-select" style="width: 100%">
                        <option value="Auto">Auto Calculate</option>
                        <option value="Present" ${log.status === 'Present' ? 'selected' : ''}>Present</option>
                        <option value="Half Day" ${log.status === 'Half Day' ? 'selected' : ''}>Half Day</option>
                        <option value="Late" ${log.status === 'Late' ? 'selected' : ''}>Late</option>
                        <option value="Absent" ${log.status === 'Absent' ? 'selected' : ''}>Absent</option>
                    </select>
                    <label class="swal-custom-label">Exception Note</label>
                    <input id="swal-note" class="swal2-input" placeholder="Reason..." value="${log.note || ''}">
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#215D7B',
            preConfirm: () => {
                const timeInStr = document.getElementById('swal-in').value;
                const timeOutStr = document.getElementById('swal-out').value;
                const statusInput = document.getElementById('swal-status').value;
                const note = document.getElementById('swal-note').value;

                if (!timeInStr) return Swal.showValidationMessage('Check In time is required');

                const checkInDate = new Date(log.checkIn);
                const [inH, inM] = timeInStr.split(':');
                checkInDate.setHours(inH, inM, 0, 0);

                let checkOutDate = null;
                if (timeOutStr) {
                    checkOutDate = new Date(checkInDate);
                    const [outH, outM] = timeOutStr.split(':');
                    checkOutDate.setHours(outH, outM, 0, 0);
                }

                return {
                    checkIn: checkInDate.toISOString(),
                    checkOut: checkOutDate ? checkOutDate.toISOString() : null,
                    status: statusInput,
                    note: note
                };
            }
        });

        if (formValues) {
            try {
                await api.put(`/attendance/update/${log._id}`, formValues);
                Swal.fire('Updated', 'Attendance record updated.', 'success');
                fetchAttendanceLogs(attPage);
            } catch (err) {
                Swal.fire('Error', 'Update failed', 'error');
            }
        }
    };

    const filteredTransactions = transactions.filter(t => txFilter === 'All' ? true : t.type === txFilter);

    if (loading) return <div className="main-content">Loading...</div>;

    return (
        <div className="settings-container fade-in">
            {/* HEADER */}
            <div className="page-header-row mb-20" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '15px' }}>
                <button className="gts-btn warning btn-small m-0" onClick={() => navigate(`/employee/${id}`)}>
                    <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Cancel
                </button>
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faUserEdit} className="text-primary mr-10" /> 
                    Edit Configuration: {user.name}
                </h1>
            </div>

            {/* TABS */}
            <div className="control-card p-15 mb-25">
                <div className="tab-buttons-wrapper">
                    <button className={`gts-btn tab-btn ${activeTab === 'details' ? 'primary' : 'warning inactive'}`} onClick={() => setActiveTab('details')}>
                        <FontAwesomeIcon icon={faUser} className="btn-icon" /> Details & Config
                    </button>
                    <button className={`gts-btn tab-btn ${activeTab === 'leaves' ? 'primary' : 'warning inactive'}`} onClick={() => setActiveTab('leaves')}>
                        <FontAwesomeIcon icon={faPlaneDeparture} className="btn-icon" /> Leaves & Balances
                    </button>
                    <button className={`gts-btn tab-btn ${activeTab === 'attendance' ? 'primary' : 'warning inactive'}`} onClick={() => setActiveTab('attendance')}>
                        <FontAwesomeIcon icon={faClock} className="btn-icon" /> Attendance Logs
                    </button>
                </div>
            </div>

            {/* --- TAB CONTENT: DETAILS --- */}
            {activeTab === 'details' && (
                <div className="control-card p-30 fade-in d-block">
                    <form onSubmit={handleUpdateProfile}>
                        <h3 className="section-title border-bottom pb-10"><FontAwesomeIcon icon={faUser} className="mr-5 text-muted"/> Personal Details</h3>
                        {/* 👇 UPDATED: using the new CSS Grid class */}
                        <div className="form-grid-2-col mt-15 mb-30">
                            <div className="form-group"><label className="input-label">Full Name</label><input className="custom-input" value={user.name || ''} onChange={e => setUser({ ...user, name: e.target.value })} /></div>
                            <div className="form-group"><label className="input-label">Email</label><input className="custom-input" value={user.email || ''} onChange={e => setUser({ ...user, email: e.target.value })} /></div>
                            <div className="form-group"><label className="input-label text-primary fw-bold">Employee / Biometric ID</label><input className="custom-input" placeholder="e.g. GTS003" value={user.employeeId || ''} onChange={e => setUser({ ...user, employeeId: e.target.value })} /></div>
                            <div className="form-group"><label className="input-label">Phone Number</label><input className="custom-input" placeholder="+91..." value={user.phoneNumber || ''} onChange={e => setUser({ ...user, phoneNumber: e.target.value })} /></div>
                            <div className="form-group"><label className="input-label">Date of Birth</label><input type="date" className="custom-input" value={user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : ''} onChange={e => setUser({ ...user, dateOfBirth: e.target.value })} /></div>
                            <div className="form-group"><label className="input-label">Joining Date</label><input type="date" className="custom-input" value={user.joiningDate ? new Date(user.joiningDate).toISOString().split('T')[0] : ''} onChange={e => setUser({ ...user, joiningDate: e.target.value })} /></div>
                            <div className="form-group"><label className="input-label">Aadhaar Number</label><input className="custom-input" value={user.aadhaar || ''} onChange={e => setUser({ ...user, aadhaar: e.target.value })} /></div>
                            <div className="form-group"><label className="input-label">Emergency Contact</label><input className="custom-input" value={user.emergencyContact || ''} onChange={e => setUser({ ...user, emergencyContact: e.target.value })} /></div>
                            <div className="form-group col-span-full"><label className="input-label">Address</label><input className="custom-input" value={user.address || ''} onChange={e => setUser({ ...user, address: e.target.value })} /></div>
                        </div>

                        <h3 className="section-title border-bottom pb-10"><FontAwesomeIcon icon={faCog} className="mr-5 text-muted"/> System Configuration</h3>
                        <div className="form-grid-2-col mt-15 mb-30">
                            
                            {/* Password Reset Field */}
                            <div className="form-group">
                                <label className="input-label text-danger fw-bold"><FontAwesomeIcon icon={faKey} /> Reset Password</label>
                                <input type="text" className="custom-input" placeholder="Type new password to override..." value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                            </div>

                            <div className="form-group">
                                <label className="input-label">System Role</label>
                                <select className="swal2-select custom-input" value={user.role || 'EMPLOYEE'} onChange={e => setUser({ ...user, role: e.target.value })} disabled={currentUser?.role !== 'ADMIN'} style={{ opacity: currentUser?.role !== 'ADMIN' ? 0.6 : 1 }}>
                                    <option value="EMPLOYEE">Employee</option>
                                    <option value="MANAGER">Manager</option>
                                    <option value="ACCOUNTS">Accounts</option>
                                    <option value="HR">HR</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>
                            <div className="form-group"><label className="input-label">Shift Timing</label><select className="swal2-select custom-input" value={user.shiftType || 'DAY'} onChange={e => setUser({ ...user, shiftType: e.target.value })}><option value="DAY">Day Shift</option><option value="NIGHT">Night Shift</option></select></div>
                            <div className="form-group"><label className="input-label">Account Status</label><select className="swal2-select custom-input" value={user.status || 'ACTIVE'} onChange={e => setUser({ ...user, status: e.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
                            <div className="form-group"><label className="input-label">Reporting Manager Name</label><input className="custom-input" placeholder="Manager's Full Name" value={user.reportingManagerName || ''} onChange={e => setUser({ ...user, reportingManagerName: e.target.value })} /></div>
                            <div className="form-group"><label className="input-label">Reporting Manager Email</label><input type="email" className="custom-input" placeholder="manager@gts.ai" value={user.reportingManagerEmail || ''} onChange={e => setUser({ ...user, reportingManagerEmail: e.target.value })} /></div>
                            
                            {/* Clean Checkbox Card */}
                            <div className="form-group checkbox-card">
                                <label className="checkbox-card-label">
                                    <input type="checkbox" className="custom-checkbox mr-5" checked={user.isPurchaser || false} onChange={e => setUser({ ...user, isPurchaser: e.target.checked })} /> 
                                    Grant Purchaser Access
                                </label>
                            </div>
                        </div>

                        <h3 className="section-title border-bottom pb-10"><FontAwesomeIcon icon={faMoneyBillWave} className="mr-5 text-muted"/> Payroll & Wallet</h3>
                        <div className="form-grid-2-col mt-15">
                            <div className="form-group"><label className="input-label">Salary (Monthly) (₹)</label><input type="number" className="custom-input" placeholder="Enter amount" value={user.salary || ''} onChange={e => setUser({ ...user, salary: Number(e.target.value) })} /></div>
                            <div className="form-group">
                                <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span><FontAwesomeIcon icon={faWallet} style={{ color: 'var(--primary, #215D7B)', marginRight: '6px' }} /> Employee Wallet</span>
                                    <span style={{ color: walletBalance < 0 ? 'var(--danger, #dc2626)' : 'var(--success, #16a34a)' }}>₹{walletBalance.toLocaleString('en-IN')}</span>
                                </label>
                                {(currentUser?.role === 'ADMIN' || currentUser?.role === 'HR' || currentUser?.role === 'MANAGER') ? (
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                                        <button type="button" className="gts-btn" style={{ flex: 1, background: 'var(--bg-hover, #f0f9ff)', color: '#0284c7', border: '1px solid #0284c7', height: '43px', justifyContent: 'center' }} onClick={handleManageWallet}><FontAwesomeIcon icon={faEdit} className="btn-icon" /> Manage</button>
                                        <button type="button" className="gts-btn" style={{ flex: 1, background: 'var(--bg-hover, #f1f5f9)', color: 'var(--text-muted, #475569)', border: '1px solid var(--border-color, #cbd5e1)', height: '43px', justifyContent: 'center' }} onClick={fetchLedger}><FontAwesomeIcon icon={faHistory} className="btn-icon" /> Ledger</button>
                                    </div>
                                ) : (
                                    <input className="custom-input" disabled value="Restricted Access" style={{ background: 'var(--bg-hover, #f1f5f9)', color: 'var(--text-muted, #94a3b8)', marginTop: '5px' }} />
                                )}
                            </div>
                        </div>

                        <div className="border-top pt-20 mt-30 form-footer-right">
                            <button type="submit" className="gts-btn primary btn-large"><FontAwesomeIcon icon={faSave} className="btn-icon" /> Save Profile Changes</button>
                        </div>
                    </form>
                </div>
            )}

            {/* --- TAB CONTENT: LEAVES --- */}
            {activeTab === 'leaves' && (
                <div className="fade-in">
                    <div className="control-card d-block mb-20 p-25">
                        <h3 className="section-title border-bottom pb-10">Manage Leave Balances</h3>
                        <div className="form-grid-2-col mt-15">
                            <div className="form-group"><label className="input-label text-primary fw-bold">Casual Leave (CL)</label><input type="number" className="custom-input" value={user.casualLeaveBalance || 0} onChange={e => setUser({ ...user, casualLeaveBalance: Number(e.target.value) })} /></div>
                            <div className="form-group"><label className="input-label text-primary fw-bold">Earned Leave (EL)</label><input type="number" className="custom-input" value={user.earnedLeaveBalance || 0} onChange={e => setUser({ ...user, earnedLeaveBalance: Number(e.target.value) })} /></div>
                            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', gridColumn: '1 / -1' }}>
                                <button className="gts-btn primary" style={{ height: '43px', justifyContent: 'center', width: '200px' }} onClick={handleUpdateBalance}><FontAwesomeIcon icon={faSave} className="btn-icon" /> Update Balances</button>
                            </div>
                        </div>
                    </div>

                    <div className="employee-table-container">
                        <h3 className="table-header-title" style={{ padding: '20px 20px 0' }}>Leave History</h3>
                        <table className="employee-table">
                            <thead>
                                <tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                {leaveStats.history && leaveStats.history.length > 0 ? (
                                    leaveStats.history.map(l => (
                                        <tr key={l._id}>
                                            <td data-label="Type"><span className="role-tag employee text-small">{l.leaveType}</span></td>
                                            <td data-label="Dates" className="text-dark-gray text-small">{new Date(l.fromDate).toLocaleDateString('en-GB')} <span className="text-muted mx-1">➜</span> {new Date(l.toDate).toLocaleDateString('en-GB')}</td>
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
                            <tr><th>Date</th><th>Check In</th><th>Check Out</th><th>Working Hours</th><th>Status</th><th>Note</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                            {attLoading ? (
                                <tr><td colSpan="7" className="empty-table-message">Loading attendance...</td></tr>
                            ) : attendanceLogs.length > 0 ? (
                                attendanceLogs.map(log => (
                                    <tr key={log._id}>
                                        <td data-label="Date" className="fw-500 text-dark-blue">{log.date}</td>
                                        
                                        <td data-label="Check In">
                                            {log.checkIn ? new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>
                                        <td data-label="Check Out">
                                            {log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>
                                        
                                        <td data-label="Working Hours" className="fw-bold text-dark-gray">{calculateDuration(log.checkIn, log.checkOut)}</td>
                                        <td data-label="Status">
                                            <span className={`status-badge ${
                                                log.status === 'Present' ? 'success' : 
                                                log.status === 'Half Day' ? 'warning' : 
                                                log.status === 'Pending' ? 'primary' : 'danger'
                                            }`}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td data-label="Note" className="note-cell text-muted text-small">{log.note || '-'}</td>
                                        <td data-label="Action"><button className="gts-btn primary btn-small" onClick={() => handleEdit(log)}><FontAwesomeIcon icon={faEdit} className="btn-icon" /> Edit</button></td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan="7" className="empty-table-message">No logs found.</td></tr>
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

            {/* --- LEDGER MODAL --- */}
            {showLedger && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                    <div className="fade-in" style={{ background: 'var(--bg-card, white)', borderRadius: '12px', padding: '25px', width: '90%', maxWidth: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--card-shadow, 0 25px 50px -12px rgba(0, 0, 0, 0.25))' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '15px', marginBottom: '15px' }}>
                            <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-main, #1e293b)' }}><FontAwesomeIcon icon={faHistory} style={{ color: 'var(--primary, #215D7B)', marginRight: '8px' }}/> Transaction Ledger</h2>
                            <button onClick={() => setShowLedger(false)} style={{ background: 'var(--bg-hover, #f1f5f9)', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', color: 'var(--text-muted, #64748b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FontAwesomeIcon icon={faTimes}/></button>
                        </div>
                        <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                            <select className="custom-input" value={txFilter} onChange={(e) => setTxFilter(e.target.value)} style={{ maxWidth: '200px', margin: 0 }}>
                                <option value="All">All Transactions</option><option value="Credit">Credits (+)</option><option value="Debit">Debits (-)</option><option value="Reset">Manual Resets</option>
                            </select>
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            <table className="employee-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr><th style={{ padding: '12px 15px', background: 'var(--bg-main, #f8fafc)' }}>Date</th><th style={{ padding: '12px 15px', background: 'var(--bg-main, #f8fafc)' }}>Description</th><th style={{ padding: '12px 15px', background: 'var(--bg-main, #f8fafc)' }}>Auth By</th><th style={{ padding: '12px 15px', textAlign: 'right', background: 'var(--bg-main, #f8fafc)' }}>Amount</th></tr>
                                </thead>
                                <tbody>
                                    {filteredTransactions.length === 0 ? (
                                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted, #94a3b8)' }}>No transactions found.</td></tr>
                                    ) : (
                                        filteredTransactions.map(tx => (
                                            <tr key={tx._id} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)' }}>
                                                <td style={{ padding: '12px 15px', fontSize: '13px' }}>{new Date(tx.date || tx.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                                                <td style={{ padding: '12px 15px', fontSize: '13px', color: 'var(--text-muted, #475569)' }}>{tx.description}</td>
                                                <td style={{ padding: '12px 15px', fontSize: '13px' }}>{tx.performedBy?.name || 'System'}</td>
                                                <td style={{ padding: '12px 15px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', color: tx.type === 'Credit' ? 'var(--success, #16a34a)' : (tx.type === 'Debit' ? 'var(--danger, #dc2626)' : 'var(--warning, #d97706)') }}>{tx.type === 'Debit' ? '-' : (tx.type === 'Credit' ? '+' : '=')} ₹{tx.amount.toLocaleString('en-IN')}</td>
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

export default EditEmployee;