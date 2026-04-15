import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { SERVER_URL } from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faUser, faArrowLeft, faClock, faPlaneDeparture, faEdit, faEnvelope, faPhone, 
    faWallet, faHistory, faUserSecret, faBoxOpen, faFileInvoice, faImage, 
    faCheckCircle, faTimesCircle, faUndo, faEye, faTimes, faBuilding, faCut
} from '@fortawesome/free-solid-svg-icons';
import Pagination from '../../components/Pagination';
import '../../styles/App.css';
import '../../styles/expenses.css';

const EmployeeProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('details');

    const currentUser = JSON.parse(localStorage.getItem('user'));
    const [user, setUser] = useState({});
    const [usersList, setUsersList] = useState([]); 
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

    // --- EXPENSES PAGINATION & STATS STATES ---
    const [expenses, setExpenses] = useState([]);
    const [expLoading, setExpLoading] = useState(false);
    const [expPage, setExpPage] = useState(1);
    const [expTotalPages, setExpTotalPages] = useState(1);
    const [expTotalRecords, setExpTotalRecords] = useState(0);
    const [expLimit, setExpLimit] = useState(10);
    const [selectedExpense, setSelectedExpense] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    
    // 👇 NEW: Expense Filter & Stats
    const [expStatusFilter, setExpStatusFilter] = useState('');
    const [expStats, setExpStats] = useState({
        pendingTotal: 0, pendingCount: 0,
        approvedTotal: 0, approvedCount: 0,
        returnedTotal: 0, returnedCount: 0,
        rejectedTotal: 0, rejectedCount: 0,
        totalFilteredAmount: 0
    });

    // Initial Profile Load
    useEffect(() => {
        fetchEmployeeData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Independent Attendance Load
    useEffect(() => {
        if (activeTab === 'attendance') fetchAttendanceLogs(attPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, attPage, attLimit, activeTab]);

    // 👇 NEW: Reset Expense Page when Filter Changes
    useEffect(() => {
        setExpPage(1);
    }, [expStatusFilter]);

    // Independent Expenses Load
    useEffect(() => {
        if (activeTab === 'expenses') fetchEmployeeExpenses(expPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, expPage, expLimit, activeTab, expStatusFilter]); // Added expStatusFilter

    const fetchEmployeeData = async () => {
        try {
            const [userRes, leaveRes, walletRes, dirRes] = await Promise.all([
                api.get(`/employees/${id}`),
                api.get(`/leaves/admin/user-leaves/${id}`),
                api.get(`/wallets/user/${id}`).catch(() => ({ data: { balance: 0 } })),
                api.get('/employees/directory').catch(() => ({ data: [] }))
            ]);

            setUser(userRes.data);
            setLeaveStats(leaveRes.data);
            setWalletBalance(walletRes.data.balance);
            setUsersList(Array.isArray(dirRes.data) ? dirRes.data : (dirRes.data?.data || []));
            fetchTransactions(); 
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

    // 👇 UPDATED: Added status filter & capturing stats
    const fetchEmployeeExpenses = async (pageToFetch) => {
        setExpLoading(true);
        try {
            const params = { page: pageToFetch, limit: expLimit, submittedBy: id };
            if (expStatusFilter) params.status = expStatusFilter;

            const res = await api.get('/expenses/all', { params });
            
            setExpenses(res.data.data);
            if (res.data.stats) setExpStats(res.data.stats); // Capture stats
            setExpTotalPages(res.data.pagination.totalPages);
            setExpTotalRecords(res.data.pagination.totalRecords);
            setExpPage(res.data.pagination.currentPage);
        } catch (err) {
            console.error("Failed to load expenses", err);
        } finally {
            setExpLoading(false);
        }
    };

    // --- WALLET LOGIC ---
    const handleManageWallet = async () => {
        const today = new Date().toISOString().split('T')[0]; 

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
                    <input id="wallet-amount" type="number" class="swal2-input" placeholder="e.g. 5000" style="width: 100%; margin-bottom: 15px;">

                    <label class="swal-custom-label">Transaction Date</label>
                    <input id="wallet-date" type="date" class="swal2-input" value="${today}" style="width: 100%;">
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#215D7B',
            confirmButtonText: 'Update Balance',
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
                Swal.fire('Success', `Wallet updated to ₹${newBalance.toLocaleString('en-IN')}`, 'success');
                setWalletBalance(newBalance);
                fetchTransactions(); 
            } catch (err) {
                Swal.fire('Error', 'Failed to update wallet', 'error');
            }
        }
    };

    const handleImpersonate = async () => {
        const confirm = await Swal.fire({
            title: `Login as ${user.name}?`,
            text: "Your current session will be saved. You can return to your Admin account at any time from the top banner.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#215D7B',
            confirmButtonText: 'Yes, Login'
        });

        if (confirm.isConfirmed) {
            try {
                const res = await api.post(`/auth/impersonate/${id}`);
                localStorage.setItem('admin_token_backup', localStorage.getItem('token'));
                localStorage.setItem('admin_user_backup', localStorage.getItem('user'));
                localStorage.setItem('is_impersonating', 'true');
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('user', JSON.stringify(res.data.user));
                window.location.href = '/dashboard';
            } catch (err) {
                Swal.fire('Error', err.response?.data?.message || 'Failed to switch accounts', 'error');
            }
        }
    };

    // --- EXPENSES LOGIC ---
    const handleExpenseStatusUpdate = async (expenseId, newStatus) => {
        if (newStatus === 'Returned') {
            const { value: adminNote } = await Swal.fire({
                title: 'Return for Correction', text: "Please provide a reason.", input: 'textarea', showCancelButton: true, confirmButtonColor: '#f59e0b', confirmButtonText: 'Return to Employee', inputValidator: (value) => !value && 'You need to write a reason!'
            });
            if (adminNote) {
                try { await api.put(`/expenses/${expenseId}/status`, { status: newStatus, adminFeedback: adminNote }); fetchEmployeeExpenses(expPage); setIsSidebarOpen(false); } catch (err) { Swal.fire('Error', 'Failed', 'error'); }
            }
            return;
        }

        const confirmText = newStatus === 'Approved' ? 'This will process funds and sync Inventory.' : 'Reject this expense permanently?';
        const result = await Swal.fire({ title: 'Confirm Action', text: confirmText, icon: 'warning', showCancelButton: true, confirmButtonColor: newStatus === 'Approved' ? '#16a34a' : '#dc2626', confirmButtonText: `Yes, ${newStatus} it!` });

        if (result.isConfirmed) {
            try { await api.put(`/expenses/${expenseId}/status`, { status: newStatus }); fetchEmployeeExpenses(expPage); setIsSidebarOpen(false); } catch (err) { Swal.fire('Error', 'Failed', 'error'); }
        }
    };

    const handleSplitItem = async (expenseId, itemIndex, itemObj, maxTotal) => {
        const defaultSplitAmount = (Number(itemObj.quantity) || 1) * (Number(itemObj.unitPrice) || 0);
        
        const { value: splitAmountStr } = await Swal.fire({
            title: 'Split Item out of Bill',
            html: `
                <p style="font-size: 14px; text-align: left; color: #475569;">
                    Extracting <b>${itemObj.productName || 'this item'}</b> into its own separate expense record.<br/><br/>
                    Original Bill Total: <b>₹${maxTotal}</b><br/>
                    What should the total value of this new separated record be? (Include any proportional taxes/shipping).
                </p>
                <input id="split-amt" type="number" class="swal2-input" value="${defaultSplitAmount}" style="max-width: 100%;">
            `,
            showCancelButton: true,
            confirmButtonText: 'Split Item',
            confirmButtonColor: '#ea580c',
            preConfirm: () => document.getElementById('split-amt').value
        });

        if (splitAmountStr) {
            const amountToDeduct = Number(splitAmountStr);
            if (amountToDeduct >= maxTotal) return Swal.fire('Error', 'Split amount must be LESS than the total bill!', 'error');

            try {
                await api.post(`/expenses/${expenseId}/split`, { itemIndex, splitAmount: amountToDeduct });
                Swal.fire('Split Successful', 'The item has been separated into a new pending expense.', 'success');
                setIsSidebarOpen(false);
                fetchEmployeeExpenses(expPage);
            } catch (err) {
                Swal.fire('Split Failed', err.response?.data?.message || 'Could not split item', 'error');
            }
        }
    };

    // 👇 NEW: Expense Filter Handlers
    const handleExpCardClick = (status) => {
        setExpStatusFilter(prev => prev === status ? '' : status);
    };

    const getExpMinimalCardStyle = (status, colorHex) => ({
        cursor: 'pointer', transition: 'all 0.2s ease', 
        opacity: expStatusFilter === '' || expStatusFilter === status ? 1 : 0.4, 
        border: expStatusFilter === status ? `1.5px solid ${colorHex}` : '1px solid #e2e8f0', 
        background: '#ffffff', padding: '12px 16px', borderRadius: '8px', 
        display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px', 
        boxShadow: expStatusFilter === status ? `0 2px 8px ${colorHex}15` : 'none'
    });

    const getFileUrl = (url) => url ? (url.startsWith('http') ? url : `${SERVER_URL}${url}`) : '';

    const formatDisplayDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return `${String(date.getDate()).padStart(2, '0')}-${date.toLocaleString('default', { month: 'short' })}-${String(date.getFullYear()).slice(-2)}`;
    };

    const getSpecificDetail = (item) => {
        if (item.category === 'Vendor Payment' && item.vendorId?.name) return item.vendorId.name;
        if (item.category === 'Participant Payment') return item.expenseDetails?.participantName || item.expenseDetails?.name || item.descriptionTags || 'Participant Payment';
        if (item.category === 'Product / Item Purchase') {
            if (item.expenseDetails?.items && item.expenseDetails.items.length > 0) {
                const firstItem = item.expenseDetails.items[0].productName;
                const extraCount = item.expenseDetails.items.length - 1;
                return extraCount > 0 ? `${firstItem} (+${extraCount} more)` : firstItem;
            }
            return item.expenseDetails?.itemName || item.expenseDetails?.productName || item.descriptionTags || 'Product Purchase';
        }
        return item.descriptionTags || 'No specific details provided';
    };

    const viewFile = (fileData, title) => {
        if (Array.isArray(fileData)) {
            let htmlContent = '<div style="display:flex; flex-direction:column; gap:20px; max-height: 60vh; overflow-y:auto; padding-right:10px;">';
            fileData.forEach((url, index) => {
                const fullUrl = getFileUrl(url);
                const isVideo = url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/);
                const isPdf = url.toLowerCase().endsWith('.pdf');
                let mediaElement = isVideo ? `<video src="${fullUrl}" controls style="width:100%; border-radius:6px; max-height:400px; background:#000;"></video>` : isPdf ? `<iframe src="${fullUrl}" width="100%" height="400px" style="border: none; border-radius: 6px;"></iframe>` : `<img src="${fullUrl}" style="width:100%; border-radius:6px; max-height:400px; object-fit:contain;" />`;
                htmlContent += `<div style="background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;"><div style="text-align: left; font-size: 12px; color: #64748b; margin-bottom: 8px; font-weight: 600;">File ${index + 1}</div>${mediaElement}</div>`;
            });
            htmlContent += '</div>';
            Swal.fire({ title: title, html: htmlContent, width: '800px', showCloseButton: true, showConfirmButton: false });
        } else {
            const fullUrl = getFileUrl(fileData);
            if (fileData.toLowerCase().endsWith('.pdf')) { Swal.fire({ title: title, html: `<iframe src="${fullUrl}" width="100%" height="500px" style="border: none; border-radius: 8px;"></iframe>`, width: '800px', showCloseButton: true, showConfirmButton: false }); }
            else { Swal.fire({ title: title, imageUrl: fullUrl, imageAlt: title, width: '800px', showCloseButton: true, showConfirmButton: false }); }
        }
    };

    const getStatusIcon = (status) => {
        if (status === 'Approved') return <FontAwesomeIcon icon={faCheckCircle} style={{ color: '#16a34a', marginRight: '5px' }} />;
        if (status === 'Rejected') return <FontAwesomeIcon icon={faTimesCircle} style={{ color: '#dc2626', marginRight: '5px' }} />;
        if (status === 'Returned') return <FontAwesomeIcon icon={faUndo} style={{ color: '#ea580c', marginRight: '5px' }} />;
        return <FontAwesomeIcon icon={faClock} style={{ color: '#d97706', marginRight: '5px' }} />;
    };

    const openSidebar = (expense) => { setSelectedExpense(expense); setIsSidebarOpen(true); };
    const closeSidebar = () => { setIsSidebarOpen(false); setTimeout(() => setSelectedExpense(null), 300); };
    const formatKeyToLabel = (key) => { const withSpaces = key.replace(/([A-Z])/g, ' $1').trim(); return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1); };

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
                
                <div style={{ display: 'flex', gap: '10px' }}>
                    {currentUser?.role === 'ADMIN' && (
                        <button className="gts-btn warning m-0" onClick={handleImpersonate}>
                            <FontAwesomeIcon icon={faUserSecret} className="mr-5" /> Login As Employee
                        </button>
                    )}
                    <button className="gts-btn primary m-0" onClick={() => navigate(`/edit-employee/${id}`)}>
                        <FontAwesomeIcon icon={faEdit} className="mr-5" /> Edit Profile
                    </button>
                </div>
            </div>

            {/* SUMMARY CARD */}
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
                    <button className={`gts-btn tab-btn ${activeTab === 'expenses' ? 'primary' : 'warning inactive'}`} onClick={() => setActiveTab('expenses')}>
                        <FontAwesomeIcon icon={faBoxOpen} className="btn-icon" /> Expenses
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
                                            <td data-label="Date">{new Date(tx.date || tx.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
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

            {/* --- TAB CONTENT: EXPENSES --- */}
            {activeTab === 'expenses' && (
                <div className="fade-in">
                    
                    {/* 👇 NEW: Interactive Expense Summary Cards */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'stretch' }}>
                        <div style={getExpMinimalCardStyle('Pending', '#d97706')} onClick={() => handleExpCardClick('Pending')}>
                            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}><FontAwesomeIcon icon={faClock} style={{ color: '#d97706' }} /> Pending</div>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {expStats.pendingTotal.toLocaleString('en-IN')}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{expStats.pendingCount} items</div>
                        </div>
                        <div style={getExpMinimalCardStyle('Approved', '#16a34a')} onClick={() => handleExpCardClick('Approved')}>
                            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}><FontAwesomeIcon icon={faCheckCircle} style={{ color: '#16a34a' }} /> Accepted</div>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {expStats.approvedTotal.toLocaleString('en-IN')}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{expStats.approvedCount} items</div>
                        </div>
                        <div style={getExpMinimalCardStyle('Returned', '#ea580c')} onClick={() => handleExpCardClick('Returned')}>
                            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}><FontAwesomeIcon icon={faUndo} style={{ color: '#ea580c' }} /> Returned</div>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {expStats.returnedTotal.toLocaleString('en-IN')}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{expStats.returnedCount} items</div>
                        </div>
                        <div style={getExpMinimalCardStyle('Rejected', '#dc2626')} onClick={() => handleExpCardClick('Rejected')}>
                            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}><FontAwesomeIcon icon={faTimesCircle} style={{ color: '#dc2626' }} /> Rejected</div>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {expStats.rejectedTotal.toLocaleString('en-IN')}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{expStats.rejectedCount} items</div>
                        </div>
                        <div style={{ width: '1px', background: '#e2e8f0', margin: '0 5px' }}></div>
                        <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '12px 16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', minWidth: '140px', gap: '4px' }}>
                            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}><FontAwesomeIcon icon={faWallet} style={{ color: '#475569' }}/> Filtered Total</div>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {expStats.totalFilteredAmount.toLocaleString('en-IN')}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Across {expTotalRecords} items</div>
                        </div>
                    </div>

                    <div className="employee-table-container fade-in">
                        <h3 className="table-header-title" style={{ padding: '20px 20px 0' }}>Expense Logs (Submitted By {user.name})</h3>
                        <table className="employee-table mt-15">
                            <thead>
                                <tr>
                                    <th>Category</th>
                                    <th>Project & Details</th>
                                    <th>Amount & Date</th>
                                    <th>Payment Source</th>
                                    <th>Status</th>
                                    <th>Documents</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expLoading ? (
                                    <tr><td colSpan="7" className="empty-table-message">Loading expenses...</td></tr>
                                ) : expenses.length === 0 ? (
                                    <tr><td colSpan="7" className="empty-table-message">No expense records found.</td></tr>
                                ) : (
                                    expenses.map(item => {
                                        const isProject = item.expenseType === 'Project Expense';
                                        const typeLabel = isProject ? 'Project' : 'Regular';
                                        const typeBorderColor = isProject ? '#A6477F' : '#1E73BE';
                                        const typeBgColor = isProject ? '#fdf2f8' : '#eff6ff';

                                        return (
                                            <tr key={item._id}>
                                                <td data-label="Category">
                                                    <div className="fw-600 text-primary" style={{ marginBottom: '6px' }}>{item.category}</div>
                                                    <span 
                                                        style={{ 
                                                            background: typeBgColor, 
                                                            color: typeBorderColor, 
                                                            border: `1px solid ${typeBorderColor}`, 
                                                            padding: '3px 8px', 
                                                            borderRadius: '4px', 
                                                            fontSize: '10px', 
                                                            fontWeight: '600', 
                                                            display: 'inline-block' 
                                                        }}
                                                    >
                                                        {typeLabel}
                                                    </span>
                                                </td>

                                                <td data-label="Project & Details">
                                                    <div className="fw-bold text-dark" style={{ fontSize: '13px', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }} title={getSpecificDetail(item)}>
                                                        {getSpecificDetail(item)}
                                                    </div>
                                                    <div className="fw-500 text-small text-muted" style={{ marginBottom: '4px' }}>
                                                        {item.projectName || 'Regular Office'}
                                                    </div>
                                                    <div className="expense-tag-pill">{item.descriptionTags}</div>
                                                </td>

                                                <td data-label="Amount & Date">
                                                    <div className="expense-amount-large">₹ {item.amount.toLocaleString('en-IN')}</div>
                                                    <div className="text-small text-muted fw-normal" style={{ marginTop: '4px' }}>
                                                        {item.category === 'Vendor Payment' ? 'Inv: ' : ''}{formatDisplayDate(item.expenseDate)}
                                                    </div>
                                                </td>

                                                <td data-label="Payment Source">
                                                    <div className="text-small">
                                                        <span className="fw-600 text-dark">Paid by:</span> {
                                                            item.isCompanyPayment ? 'Company Account' : 
                                                            item.paymentSourceId?.name || 'Self'
                                                        }
                                                    </div>
                                                </td>

                                                <td data-label="Status">
                                                    <span className={`status-badge ${item.status === 'Approved' ? 'success' : item.status === 'Rejected' ? 'danger' : item.status === 'Returned' ? 'warning' : 'warning'}`} style={{ padding: '6px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center' }}>
                                                        {getStatusIcon(item.status)} {item.status || 'Pending'}
                                                    </span>
                                                    {item.status !== 'Pending' && item.approvedBy && (
                                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '5px' }}>
                                                            By: <span style={{ color: '#215D7B', fontWeight: '600' }}>{item.approvedBy.name}</span>
                                                        </div>
                                                    )}
                                                    <div style={{ marginTop: '8px' }}>
                                                        <button className="gts-btn doc-btn" style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#215D7B' }} onClick={() => openSidebar(item)}>
                                                            <FontAwesomeIcon icon={faEye} /> Details
                                                        </button>
                                                    </div>
                                                </td>

                                                <td data-label="Documents">
                                                    <div className="flex-row gap-5 flex-wrap">
                                                        {item.paymentScreenshotUrls && item.paymentScreenshotUrls.length > 0 ? (
                                                            <button onClick={() => viewFile(item.paymentScreenshotUrls, `Payment Proofs (${item.paymentScreenshotUrls.length})`)} className="gts-btn doc-btn doc-proof" title="View Proofs">
                                                                <FontAwesomeIcon icon={faFileInvoice} />
                                                            </button>
                                                        ) : item.paymentScreenshotUrl ? (
                                                            <button onClick={() => viewFile(item.paymentScreenshotUrl, 'Payment Proof')} className="gts-btn doc-btn doc-proof" title="View Proof">
                                                                <FontAwesomeIcon icon={faFileInvoice} />
                                                            </button>
                                                        ) : <span className="text-muted">-</span>}

                                                        {item.expenseMediaUrls && item.expenseMediaUrls.length > 0 ? (
                                                            <button onClick={() => viewFile(item.expenseMediaUrls, `Media (${item.expenseMediaUrls.length})`)} className="gts-btn doc-btn doc-media" title="View Media">
                                                                <FontAwesomeIcon icon={faImage} />
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </td>

                                                <td data-label="Admin Action">
                                                    {item.status === 'Pending' ? (
                                                        <div className="flex-col gap-5">
                                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                                <button className="gts-btn btn-small m-0" style={{ flex: 1, background: '#dcfce7', color: '#16a34a', justifyContent: 'center', padding: '6px' }} onClick={() => handleExpenseStatusUpdate(item._id, 'Approved')}><FontAwesomeIcon icon={faCheckCircle} /></button>
                                                                <button className="gts-btn btn-small m-0" style={{ flex: 1, background: '#fee2e2', color: '#dc2626', justifyContent: 'center', padding: '6px' }} onClick={() => handleExpenseStatusUpdate(item._id, 'Rejected')}><FontAwesomeIcon icon={faTimesCircle} /></button>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                                <button className="gts-btn btn-small m-0" style={{ flex: 1, background: '#fef3c7', color: '#d97706', justifyContent: 'center', padding: '6px' }} onClick={() => handleExpenseStatusUpdate(item._id, 'Returned')}><FontAwesomeIcon icon={faUndo} /></button>
                                                                {(currentUser.role === 'ADMIN' || currentUser.role === 'HR' || currentUser.role === 'ACCOUNTS') ? (
                                                                    <button className="gts-btn primary btn-small m-0" style={{ flex: 1, justifyContent: 'center', padding: '6px' }} onClick={() => navigate(`/edit-expense/${item._id}`)}><FontAwesomeIcon icon={faEdit} /></button>
                                                                ) : <div style={{ flex: 1 }}></div>}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex-col gap-5" style={{ alignItems: 'center' }}>
                                                            <span className="text-small text-muted fw-600">Processed</span>
                                                            {(currentUser.role === 'ADMIN' || currentUser.role === 'HR' || currentUser.role === 'ACCOUNTS') && (
                                                                <button className="gts-btn primary btn-small m-0" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate(`/edit-expense/${item._id}`)}><FontAwesomeIcon icon={faEdit} /> Edit</button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>

                        {!expLoading && (
                            <Pagination
                                currentPage={expPage}
                                totalPages={expTotalPages}
                                totalRecords={expTotalRecords}
                                limit={expLimit}
                                onPageChange={(page) => setExpPage(page)}
                                onLimitChange={(newLimit) => {
                                    setExpLimit(newLimit);
                                    setExpPage(1);
                                }}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* EXPENSE SIDEBAR */}
            <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={closeSidebar}></div>
            <div className={`expense-detail-sidebar ${isSidebarOpen ? 'open' : ''}`}>
                {selectedExpense && (
                    <>
                        <div className="sidebar-header">
                            <div>
                                <h2 className="sidebar-title">{selectedExpense.category}</h2>
                                <span className={`status-badge ${selectedExpense.status === 'Approved' ? 'success' : selectedExpense.status === 'Rejected' ? 'danger' : selectedExpense.status === 'Returned' ? 'warning' : 'warning'}`} style={{ padding: '4px 8px', fontSize: '10px' }}>
                                    {selectedExpense.status}
                                </span>
                            </div>
                            <button className="sidebar-close-btn" onClick={closeSidebar}><FontAwesomeIcon icon={faTimes} /></button>
                        </div>
                        <div className="sidebar-content">
                            <h3 className="sidebar-section-title">General Information</h3>
                            <div className="detail-grid-2">
                                <div className="detail-group"><span className="detail-label">Amount</span><span className="detail-value fw-bold text-green">₹ {selectedExpense.amount.toLocaleString('en-IN')}</span></div>
                                <div className="detail-group"><span className="detail-label">{selectedExpense.category === 'Vendor Payment' ? 'Invoice Date' : 'Date'}</span><span className="detail-value">{formatDisplayDate(selectedExpense.expenseDate)}</span></div>
                                <div className="detail-group"><span className="detail-label">Submitted By</span><span className="detail-value">{selectedExpense.submittedBy?.name || 'N/A'}</span></div>
                                <div className="detail-group"><span className="detail-label">Payment Source</span><span className="detail-value">{selectedExpense.isCompanyPayment ? 'Company Account' : selectedExpense.paymentSourceId?.name || 'N/A'}</span></div>
                                <div className="detail-group" style={{ gridColumn: 'span 2' }}><span className="detail-label">Project / Department</span><span className="detail-value">{selectedExpense.projectName || 'Regular Office Expense'}</span></div>
                                {selectedExpense.vendorId && <div className="detail-group" style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}><span className="detail-label" style={{ color: '#2563eb' }}><FontAwesomeIcon icon={faBuilding} /> Central Vendor Profile</span><span className="detail-value fw-600">{selectedExpense.vendorId.name}</span>{selectedExpense.vendorId.gstNumber && <span className="text-small text-muted d-block">GST: {selectedExpense.vendorId.gstNumber}</span>}</div>}
                                <div className="detail-group" style={{ gridColumn: 'span 2' }}><span className="detail-label">Description Tags</span><span className="detail-value">{selectedExpense.descriptionTags}</span></div>
                                {selectedExpense.adminFeedback && <div className="detail-group" style={{ gridColumn: 'span 2' }}><span className="detail-label" style={{ color: '#ea580c' }}>Admin Note / Feedback</span><span className="detail-value" style={{ background: '#fef3c7', padding: '8px', borderRadius: '4px', fontStyle: 'italic' }}>"{selectedExpense.adminFeedback}"</span></div>}
                            </div>
                            
                            {selectedExpense.expenseDetails && Object.keys(selectedExpense.expenseDetails).length > 0 && (
                                <>
                                    <h3 className="sidebar-section-title mt-20">Granular Details</h3>
                                    {selectedExpense.category === 'Product / Item Purchase' && selectedExpense.expenseDetails.items && selectedExpense.expenseDetails.items.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                            {selectedExpense.expenseDetails.items.map((prod, idx) => (
                                                <div key={idx} style={{ background: '#f1f5f9', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', position: 'relative' }}>
                                                    {selectedExpense.expenseDetails.items.length > 1 && (selectedExpense.status === 'Pending' || selectedExpense.status === 'Returned') && (
                                                        <button 
                                                            onClick={() => handleSplitItem(selectedExpense._id, idx, prod, selectedExpense.amount)}
                                                            title="Extract this item into its own separate expense record"
                                                            style={{ position: 'absolute', top: '10px', right: '10px', background: '#fff', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', color: '#ea580c', cursor: 'pointer', fontWeight: 'bold' }}
                                                        >
                                                            <FontAwesomeIcon icon={faCut} /> Split Out
                                                        </button>
                                                    )}

                                                    <div style={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '10px', borderBottom: '1px solid #cbd5e1', paddingBottom: '5px', paddingRight: '70px' }}>
                                                        Item #{idx + 1} - {prod.productName}
                                                    </div>
                                                    <div className="detail-grid-2">
                                                        <div className="detail-group"><span className="detail-label">Quantity</span><span className="detail-value">{prod.quantity}</span></div>
                                                        <div className="detail-group"><span className="detail-label">Unit Price</span><span className="detail-value">₹ {prod.unitPrice}</span></div>
                                                        <div className="detail-group"><span className="detail-label">Status</span><span className="detail-value">{prod.inventoryItemStatus}</span></div>
                                                        {prod.storageLocation && <div className="detail-group"><span className="detail-label">Location</span><span className="detail-value">{prod.storageLocation}</span></div>}
                                                        {prod.inventoryAssignedTo && (
                                                            <div className="detail-group">
                                                                <span className="detail-label">Assigned To</span>
                                                                <span className="detail-value">
                                                                    {usersList.find(u => String(u._id) === String(prod.inventoryAssignedTo))?.name || prod.inventoryAssignedTo}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {prod.expiryDate && <div className="detail-group"><span className="detail-label">Expiry Date</span><span className="detail-value">{prod.expiryDate}</span></div>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="detail-grid-2">
                                            {Object.entries(selectedExpense.expenseDetails).map(([key, value]) => {
                                                if (key === 'items') return null; 
                                                if (!value) return null;
                                                const isLongText = typeof value === 'string' && value.length > 30;
                                                return (
                                                    <div className="detail-group" key={key} style={isLongText ? { gridColumn: 'span 2' } : {}}>
                                                        <span className="detail-label" style={key === 'paymentDate' ? { color: '#16a34a', fontWeight: 'bold' } : {}}>
                                                            {formatKeyToLabel(key)}
                                                        </span>
                                                        <span className="detail-value">{value}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>

        </div>
    );
};

export default EmployeeProfile;