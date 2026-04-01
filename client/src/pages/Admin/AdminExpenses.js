import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { SERVER_URL } from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBoxOpen, faSearch, faFileInvoice, faImage, faFilter,
    faCheckCircle, faClock, faTimesCircle, faChartLine,
    faRupeeSign, faHourglassHalf, faEye, faTimes, faUndo, faEdit, faBuilding
} from '@fortawesome/free-solid-svg-icons';
import '../../styles/App.css';
import '../../styles/expenses.css';


const AdminExpenses = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user'));

    const [expenses, setExpenses] = useState([]);
    const [filteredExpenses, setFilteredExpenses] = useState([]);
    const [loading, setLoading] = useState(true);

    const [usersList, setUsersList] = useState([]);
    const [projectsList, setProjectsList] = useState([]);

    const [selectedExpense, setSelectedExpense] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // 👇 NEW: Search states and refs for custom dropdowns
    const submittedByDropdownRef = useRef(null);
    const approvedByDropdownRef = useRef(null);
    const [submittedBySearchTerm, setSubmittedBySearchTerm] = useState('');
    const [isSubmittedByDropdownOpen, setIsSubmittedByDropdownOpen] = useState(false);
    const [approvedBySearchTerm, setApprovedBySearchTerm] = useState('');
    const [isApprovedByDropdownOpen, setIsApprovedByDropdownOpen] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({
        fromDate: '', toDate: '', expenseType: '', category: '', projectName: '',
        submittedBy: '', approvedBy: '', minAmount: '', maxAmount: '', status: ''
    });

    // 👇 NEW: Click-outside listener to close dropdowns
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (submittedByDropdownRef.current && !submittedByDropdownRef.current.contains(event.target)) {
                setIsSubmittedByDropdownOpen(false);
            }
            if (approvedByDropdownRef.current && !approvedByDropdownRef.current.contains(event.target)) {
                setIsApprovedByDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/expenses/all');
            setExpenses(res.data);
            setFilteredExpenses(res.data);

            const userRes = await api.get('/employees');
            setUsersList(userRes.data);

            try {
                const projRes = await api.get('/projects');
                setProjectsList(projRes.data);
            } catch (e) {
                console.log("Projects API not ready yet. Skipping.");
            }
        } catch (err) {
            Swal.fire('Error', 'Failed to load company expenses', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let result = expenses;

        if (filters.fromDate && filters.toDate) {
            const start = new Date(filters.fromDate); start.setHours(0, 0, 0, 0);
            const end = new Date(filters.toDate); end.setHours(23, 59, 59, 999);
            result = result.filter(p => {
                const pDate = new Date(p.expenseDate);
                return pDate >= start && pDate <= end;
            });
        }
        if (filters.expenseType) result = result.filter(p => p.expenseType === filters.expenseType);
        if (filters.category) result = result.filter(p => p.category === filters.category);
        if (filters.projectName) result = result.filter(p => p.projectName === filters.projectName);
        if (filters.submittedBy) result = result.filter(p => p.submittedBy?._id === filters.submittedBy);
        if (filters.approvedBy) result = result.filter(p => p.approvedBy?._id === filters.approvedBy);
        if (filters.minAmount) result = result.filter(p => p.amount >= Number(filters.minAmount));
        if (filters.maxAmount) result = result.filter(p => p.amount <= Number(filters.maxAmount));
        if (filters.status) result = result.filter(p => p.status === filters.status);

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(p =>
                (p.category && p.category.toLowerCase().includes(term)) ||
                (p.descriptionTags && p.descriptionTags.toLowerCase().includes(term)) ||
                (p.projectName && p.projectName.toLowerCase().includes(term)) ||
                (p.submittedBy?.name && p.submittedBy.name.toLowerCase().includes(term)) ||
                (p.amount && p.amount.toString().includes(term))
            );
        }

        setFilteredExpenses(result);
    }, [expenses, filters, searchTerm]);

    const handleFilterChange = (e) => setFilters({ ...filters, [e.target.name]: e.target.value });

    const clearFilters = () => {
        setFilters({
            fromDate: '', toDate: '', expenseType: '', category: '', projectName: '',
            submittedBy: '', approvedBy: '', minAmount: '', maxAmount: '', status: ''
        });
        setSearchTerm('');
        setSubmittedBySearchTerm('');
        setApprovedBySearchTerm('');
    };

    const handleStatusUpdate = async (id, newStatus) => {
        if (newStatus === 'Returned') {
            const { value: adminNote } = await Swal.fire({
                title: 'Return for Correction',
                text: "Please provide a reason so the employee knows what to fix.",
                input: 'textarea',
                inputPlaceholder: 'e.g., Please upload a clearer image of the GST invoice...',
                showCancelButton: true,
                confirmButtonColor: '#f59e0b',
                cancelButtonColor: '#64748b',
                confirmButtonText: 'Return to Employee',
                inputValidator: (value) => {
                    if (!value) {
                        return 'You need to write a reason!'
                    }
                }
            });

            if (adminNote) {
                try {
                    await api.put(`/expenses/${id}/status`, { status: newStatus, adminFeedback: adminNote });
                    Swal.fire('Returned', `Expense sent back to employee for correction.`, 'success');
                    fetchInitialData();
                    setIsSidebarOpen(false);
                } catch (err) {
                    Swal.fire('Error', err.response?.data?.message || 'Failed to update status', 'error');
                }
            }
            return;
        }

        const confirmText = newStatus === 'Approved' ? 'This will deduct funds from the selected payment source and sync Inventory (if applicable).' : 'Reject this expense permanently?';
        const confirmColor = newStatus === 'Approved' ? '#16a34a' : '#dc2626';

        const result = await Swal.fire({
            title: 'Confirm Action',
            text: confirmText,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: confirmColor,
            cancelButtonColor: '#64748b',
            confirmButtonText: `Yes, ${newStatus} it!`
        });

        if (result.isConfirmed) {
            try {
                await api.put(`/expenses/${id}/status`, { status: newStatus });
                Swal.fire('Success', `Expense marked as ${newStatus}`, 'success');
                fetchInitialData();
                setIsSidebarOpen(false);
            } catch (err) {
                Swal.fire('Error', err.response?.data?.message || 'Failed to update status', 'error');
            }
        }
    };

    const openSidebar = (expense) => {
        setSelectedExpense(expense);
        setIsSidebarOpen(true);
    };

    const closeSidebar = () => {
        setIsSidebarOpen(false);
        setTimeout(() => setSelectedExpense(null), 300);
    };

    const formatKeyToLabel = (key) => {
        const withSpaces = key.replace(/([A-Z])/g, ' $1').trim();
        return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
    };

    const getFileUrl = (url) => {
        if (!url) return '';
        return url.startsWith('http') ? url : `${SERVER_URL}${url}`;
    };

    const viewFile = (fileData, title) => {
        if (Array.isArray(fileData)) {
            let htmlContent = '<div style="display:flex; flex-direction:column; gap:20px; max-height: 60vh; overflow-y:auto; padding-right:10px;">';
            fileData.forEach((url, index) => {
                const fullUrl = getFileUrl(url);
                const isVideo = url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/);
                const isPdf = url.toLowerCase().endsWith('.pdf');

                let mediaElement = '';
                if (isVideo) {
                    mediaElement = `<video src="${fullUrl}" controls style="width:100%; border-radius:6px; max-height:400px; background:#000;"></video>`;
                } else if (isPdf) {
                    mediaElement = `<iframe src="${fullUrl}" width="100%" height="400px" style="border: none; border-radius: 6px;"></iframe>`;
                } else {
                    mediaElement = `<img src="${fullUrl}" style="width:100%; border-radius:6px; max-height:400px; object-fit:contain;" />`;
                }

                htmlContent += `
                    <div style="background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div style="text-align: left; font-size: 12px; color: #64748b; margin-bottom: 8px; font-weight: 600;">File ${index + 1}</div>
                        ${mediaElement}
                    </div>`;
            });
            htmlContent += '</div>';
            Swal.fire({ title: title, html: htmlContent, width: '800px', showCloseButton: true, showConfirmButton: false });
        } else {
            const fullUrl = getFileUrl(fileData);
            const isPdf = fileData.toLowerCase().endsWith('.pdf');
            if (isPdf) { Swal.fire({ title: title, html: `<iframe src="${fullUrl}" width="100%" height="500px" style="border: none; border-radius: 8px;"></iframe>`, width: '800px', showCloseButton: true, showConfirmButton: false }); }
            else { Swal.fire({ title: title, imageUrl: fullUrl, imageAlt: title, width: '800px', showCloseButton: true, showConfirmButton: false }); }
        }
    };

    const getStatusIcon = (status) => {
        if (status === 'Approved') return <FontAwesomeIcon icon={faCheckCircle} style={{ color: '#16a34a', marginRight: '5px' }} />;
        if (status === 'Rejected') return <FontAwesomeIcon icon={faTimesCircle} style={{ color: '#dc2626', marginRight: '5px' }} />;
        if (status === 'Returned') return <FontAwesomeIcon icon={faUndo} style={{ color: '#ea580c', marginRight: '5px' }} />;
        return <FontAwesomeIcon icon={faClock} style={{ color: '#d97706', marginRight: '5px' }} />;
    };

    // 👇 NEW: Generate filtered lists for dropdowns
    const filteredSubmittedBy = usersList.filter(u =>
        u.name.toLowerCase().includes(submittedBySearchTerm.toLowerCase()) ||
        u.role.toLowerCase().includes(submittedBySearchTerm.toLowerCase())
    );

    const approversList = usersList.filter(u => ['ADMIN', 'HR', 'MANAGER'].includes(u.role));
    const filteredApprovedBy = approversList.filter(u =>
        u.name.toLowerCase().includes(approvedBySearchTerm.toLowerCase()) ||
        u.role.toLowerCase().includes(approvedBySearchTerm.toLowerCase())
    );

    const totalAmount = filteredExpenses.reduce((sum, p) => sum + p.amount, 0);
    const pendingCount = filteredExpenses.filter(p => p.status === 'Pending').length;
    const approvedAmount = filteredExpenses.filter(p => p.status === 'Approved').reduce((sum, p) => sum + p.amount, 0);

    return (
        <div className="settings-container fade-in">

            <div className="page-header-row mb-20">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faBoxOpen} className="btn-icon" /> Team Expense Overview
                </h1>
            </div>

            <div className="stats-grid" style={{ marginBottom: '20px' }}>
                <div className="stat-card theme-blue">
                    <div className="stat-icon"><FontAwesomeIcon icon={faChartLine} /></div>
                    <div className="stat-info">
                        <p>Total Filtered Value</p>
                        <h3>₹ {totalAmount.toLocaleString('en-IN')}</h3>
                    </div>
                </div>
                <div className="stat-card theme-yellow">
                    <div className="stat-icon"><FontAwesomeIcon icon={faHourglassHalf} /></div>
                    <div className="stat-info">
                        <p>Pending Approvals</p>
                        <h3>{pendingCount} Requests</h3>
                    </div>
                </div>
                <div className="stat-card theme-green">
                    <div className="stat-icon"><FontAwesomeIcon icon={faRupeeSign} /></div>
                    <div className="stat-info">
                        <p>Total Approved</p>
                        <h3>₹ {approvedAmount.toLocaleString('en-IN')}</h3>
                    </div>
                </div>
            </div>

            <div className="expense-form-section">
                <div className="expense-section-title" style={{ fontSize: '14px', marginBottom: '15px' }}>
                    <FontAwesomeIcon icon={faFilter} /> Advanced Filters
                    <button className="gts-btn btn-small" onClick={clearFilters} style={{ marginLeft: 'auto', background: '#f1f5f9', color: '#64748b' }}>Clear All</button>
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>

                    <div className="search-wrapper" style={{ gridColumn: '1 / -1', maxWidth: '100%' }}>
                        <FontAwesomeIcon icon={faSearch} className="search-icon" />
                        <input type="text" placeholder="Search by name, tags, project..." className="swal2-input search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>From Date</label><input type="date" className="custom-input" name="fromDate" value={filters.fromDate} onChange={handleFilterChange} /></div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>To Date</label><input type="date" className="custom-input" name="toDate" value={filters.toDate} onChange={handleFilterChange} /></div>

                    <div>
                        <label className="input-label" style={{ fontSize: '11px' }}>Status</label>
                        <select className="custom-input" name="status" value={filters.status} onChange={handleFilterChange}>
                            <option value="">All Statuses</option>
                            <option value="Pending">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Rejected">Rejected</option>
                            <option value="Returned">Returned</option>
                        </select>
                    </div>

                    <div><label className="input-label" style={{ fontSize: '11px' }}>Expense Type</label><select className="custom-input" name="expenseType" value={filters.expenseType} onChange={handleFilterChange}><option value="">All Types</option><option value="Project Expense">Project Expense</option><option value="Regular Office Expense">Regular Office Expense</option></select></div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>Category</label><select className="custom-input" name="category" value={filters.category} onChange={handleFilterChange}><option value="">All Categories</option><option value="Product / Item Purchase">Product / Item Purchase</option><option value="Utility / Bills">Utility / Bills</option><option value="Maintenance & Repairs">Maintenance & Repairs</option><option value="Fuel Expense (Car / Bike)">Fuel Expense (Car / Bike)</option><option value="Food Expense">Food Expense</option><option value="Travel Expense">Travel Expense</option><option value="Accommodation">Accommodation</option><option value="Regular Office Expense">Regular Office Expense</option><option value="Participant Payment">Participant Payment</option><option value="Vendor Payment">Vendor Payment</option></select></div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>Project</label><select className="custom-input" name="projectName" value={filters.projectName} onChange={handleFilterChange}><option value="">All Projects</option>{projectsList.map(proj => <option key={proj._id} value={proj.name}>{proj.name}</option>)}</select></div>
                    
                    {/* 👇 NEW: Searchable "Submitted By" Filter */}
                    <div ref={submittedByDropdownRef} style={{ position: 'relative' }}>
                        <label className="input-label" style={{ fontSize: '11px' }}>Submitted By</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '8px', color: '#94a3b8', fontSize: '12px' }} />
                            <input
                                type="text"
                                className="custom-input"
                                placeholder="Search employee..."
                                style={{ paddingLeft: '28px', paddingRight: '25px', borderColor: filters.submittedBy ? '#16a34a' : '#cbd5e1' }}
                                value={
                                    filters.submittedBy && !isSubmittedByDropdownOpen
                                    ? usersList.find(u => u._id === filters.submittedBy)?.name || ''
                                    : submittedBySearchTerm
                                }
                                onChange={(e) => {
                                    setSubmittedBySearchTerm(e.target.value);
                                    setFilters({ ...filters, submittedBy: '' });
                                    setIsSubmittedByDropdownOpen(true);
                                }}
                                onFocus={() => setIsSubmittedByDropdownOpen(true)}
                            />
                            {filters.submittedBy && (
                                <FontAwesomeIcon 
                                    icon={faTimes} 
                                    style={{ position: 'absolute', right: '8px', color: '#dc2626', cursor: 'pointer', fontSize: '12px' }} 
                                    onClick={() => { setFilters({...filters, submittedBy: ''}); setSubmittedBySearchTerm(''); }} 
                                />
                            )}
                        </div>
                        {isSubmittedByDropdownOpen && (
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: '4px',
                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px',
                                maxHeight: '200px', overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                            }}>
                                <div
                                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: '13px' }}
                                    onMouseDown={() => { setFilters({ ...filters, submittedBy: '' }); setSubmittedBySearchTerm(''); setIsSubmittedByDropdownOpen(false); }}
                                >
                                    -- Anyone --
                                </div>
                                {filteredSubmittedBy.length > 0 ? (
                                    filteredSubmittedBy.map(u => (
                                        <div
                                            key={u._id}
                                            style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: '13px', transition: 'background 0.2s' }}
                                            onMouseDown={() => {
                                                setFilters({ ...filters, submittedBy: u._id });
                                                setSubmittedBySearchTerm('');
                                                setIsSubmittedByDropdownOpen(false);
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                                        >
                                            <div style={{ fontWeight: '600', color: '#0f172a' }}>{u.name}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>{u.role}</div>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ padding: '10px', color: '#64748b', fontSize: '12px', textAlign: 'center' }}>No match</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 👇 NEW: Searchable "Approved By" Filter (Filtered by Role) */}
                    <div ref={approvedByDropdownRef} style={{ position: 'relative' }}>
                        <label className="input-label" style={{ fontSize: '11px' }}>Approved By</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '8px', color: '#94a3b8', fontSize: '12px' }} />
                            <input
                                type="text"
                                className="custom-input"
                                placeholder="Search approver..."
                                style={{ paddingLeft: '28px', paddingRight: '25px', borderColor: filters.approvedBy ? '#16a34a' : '#cbd5e1' }}
                                value={
                                    filters.approvedBy && !isApprovedByDropdownOpen
                                    ? usersList.find(u => u._id === filters.approvedBy)?.name || ''
                                    : approvedBySearchTerm
                                }
                                onChange={(e) => {
                                    setApprovedBySearchTerm(e.target.value);
                                    setFilters({ ...filters, approvedBy: '' });
                                    setIsApprovedByDropdownOpen(true);
                                }}
                                onFocus={() => setIsApprovedByDropdownOpen(true)}
                            />
                            {filters.approvedBy && (
                                <FontAwesomeIcon 
                                    icon={faTimes} 
                                    style={{ position: 'absolute', right: '8px', color: '#dc2626', cursor: 'pointer', fontSize: '12px' }} 
                                    onClick={() => { setFilters({...filters, approvedBy: ''}); setApprovedBySearchTerm(''); }} 
                                />
                            )}
                        </div>
                        {isApprovedByDropdownOpen && (
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: '4px',
                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px',
                                maxHeight: '200px', overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                            }}>
                                <div
                                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: '13px' }}
                                    onMouseDown={() => { setFilters({ ...filters, approvedBy: '' }); setApprovedBySearchTerm(''); setIsApprovedByDropdownOpen(false); }}
                                >
                                    -- Anyone --
                                </div>
                                {filteredApprovedBy.length > 0 ? (
                                    filteredApprovedBy.map(u => (
                                        <div
                                            key={u._id}
                                            style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: '13px', transition: 'background 0.2s' }}
                                            onMouseDown={() => {
                                                setFilters({ ...filters, approvedBy: u._id });
                                                setApprovedBySearchTerm('');
                                                setIsApprovedByDropdownOpen(false);
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                                        >
                                            <div style={{ fontWeight: '600', color: '#0f172a' }}>{u.name}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>{u.role}</div>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ padding: '10px', color: '#64748b', fontSize: '12px', textAlign: 'center' }}>No match</div>
                                )}
                            </div>
                        )}
                    </div>

                    <div><label className="input-label" style={{ fontSize: '11px' }}>Min Amount (₹)</label><input type="number" className="custom-input" name="minAmount" value={filters.minAmount} onChange={handleFilterChange} placeholder="0" /></div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>Max Amount (₹)</label><input type="number" className="custom-input" name="maxAmount" value={filters.maxAmount} onChange={handleFilterChange} placeholder="Max" /></div>
                </div>
            </div>

            <div className="table-summary-text fade-in">Showing {filteredExpenses.length} matching records</div>

            <div className="employee-table-container fade-in">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Submitter</th>
                            <th>Details & Project</th>
                            <th>Amount & Date</th>
                            <th>Payment Source</th>
                            <th>Status & Approver</th>
                            <th>Documents</th>
                            <th>Admin Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="7" className="empty-table-message">Loading...</td></tr>
                        ) : filteredExpenses.length === 0 ? (
                            <tr><td colSpan="7" className="empty-table-message">No records found.</td></tr>
                        ) : (
                            filteredExpenses.map(item => (
                                <tr key={item._id}>
                                    <td data-label="Submitter">
                                        <div className="fw-bold text-primary">{item.submittedBy?.name || 'Unknown'}</div>
                                        <div className="text-small text-muted">{item.submittedBy?.employeeId || '-'}</div>
                                    </td>

                                    <td data-label="Details & Project">
                                        <div className="fw-600">{item.category}</div>
                                        <div className="expense-tag-pill">{item.projectName || 'Regular Office'}</div>

                                        <div style={{ marginTop: '8px' }}>
                                            <button className="gts-btn doc-btn" style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#215D7B' }} onClick={() => openSidebar(item)}>
                                                <FontAwesomeIcon icon={faEye} /> View Details
                                            </button>
                                        </div>
                                    </td>

                                    <td data-label="Amount & Date">
                                        <div className="expense-amount-large">₹ {item.amount.toLocaleString('en-IN')}</div>
                                        <div className="text-small text-muted fw-normal" style={{ marginTop: '4px' }}>
                                            {item.category === 'Vendor Payment' ? 'Inv: ' : ''}{new Date(item.expenseDate).toLocaleDateString()}
                                        </div>
                                    </td>

                                    <td data-label="Payment Source">
                                        <div className="text-small fw-600">{item.isCompanyPayment ? 'Company Account' : item.paymentSourceId?.name || 'Unknown'}</div>
                                    </td>

                                    <td data-label="Status & Approver">
                                        <span className={`status-badge ${item.status === 'Approved' ? 'success' : item.status === 'Rejected' ? 'danger' : item.status === 'Returned' ? 'warning' : 'warning'}`} style={{ padding: '6px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center' }}>
                                            {getStatusIcon(item.status)} {item.status || 'Pending'}
                                        </span>
                                        {item.status !== 'Pending' && item.approvedBy && (
                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '5px' }}>
                                                By: <span style={{ color: '#215D7B', fontWeight: '600' }}>{item.approvedBy.name}</span>
                                            </div>
                                        )}
                                    </td>

                                    <td data-label="Documents">
                                        <div className="flex-row gap-5 flex-wrap">
                                            {item.paymentScreenshotUrls && item.paymentScreenshotUrls.length > 0 ? (
                                                <button onClick={() => viewFile(item.paymentScreenshotUrls, `Payment Proofs (${item.paymentScreenshotUrls.length})`)} className="gts-btn doc-btn doc-proof">
                                                    <FontAwesomeIcon icon={faFileInvoice} /> Proofs
                                                </button>
                                            ) : item.paymentScreenshotUrl ? (
                                                <button onClick={() => viewFile(item.paymentScreenshotUrl, 'Payment Proof')} className="gts-btn doc-btn doc-proof">
                                                    <FontAwesomeIcon icon={faFileInvoice} /> Proof
                                                </button>
                                            ) : <span className="text-muted text-small">-</span>}

                                            {item.expenseMediaUrls && item.expenseMediaUrls.length > 0 ? (
                                                <button onClick={() => viewFile(item.expenseMediaUrls, `Media (${item.expenseMediaUrls.length})`)} className="gts-btn doc-btn doc-media">
                                                    <FontAwesomeIcon icon={faImage} /> Media
                                                </button>
                                            ) : null}
                                        </div>
                                    </td>

                                    <td data-label="Admin Action">
                                        {item.status === 'Pending' ? (
                                            <div className="flex-col gap-5">
                                                {/* Top Row: Approve & Reject */}
                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                    <button className="gts-btn btn-small m-0" style={{ flex: 1, background: '#dcfce7', color: '#16a34a', justifyContent: 'center', padding: '6px' }} onClick={() => handleStatusUpdate(item._id, 'Approved')}>
                                                        <FontAwesomeIcon icon={faCheckCircle} /> Approve
                                                    </button>
                                                    <button className="gts-btn btn-small m-0" style={{ flex: 1, background: '#fee2e2', color: '#dc2626', justifyContent: 'center', padding: '6px' }} onClick={() => handleStatusUpdate(item._id, 'Rejected')} title="Reject Permanently">
                                                        <FontAwesomeIcon icon={faTimesCircle} /> Reject
                                                    </button>
                                                </div>
                                                {/* Bottom Row: Return & Edit */}
                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                    <button className="gts-btn btn-small m-0" style={{ flex: 1, background: '#fef3c7', color: '#d97706', justifyContent: 'center', padding: '6px' }} onClick={() => handleStatusUpdate(item._id, 'Returned')} title="Return to Employee for Correction">
                                                        <FontAwesomeIcon icon={faUndo} /> Return
                                                    </button>
                                                    {(currentUser.role === 'ADMIN' || currentUser.role === 'HR') ? (
                                                        <button className="gts-btn primary btn-small m-0" style={{ flex: 1, justifyContent: 'center', padding: '6px' }} onClick={() => navigate(`/edit-expense/${item._id}`)}>
                                                            <FontAwesomeIcon icon={faEdit} /> Edit
                                                        </button>
                                                    ) : (
                                                        <div style={{ flex: 1 }}></div> // Invisible spacer to maintain 2x2 symmetry
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex-col gap-5" style={{ alignItems: 'center' }}>
                                                <span className="text-small text-muted fw-600">Processed</span>
                                                {(currentUser.role === 'ADMIN' || currentUser.role === 'HR') && (
                                                    <button className="gts-btn primary btn-small m-0" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate(`/edit-expense/${item._id}`)}>
                                                        <FontAwesomeIcon icon={faEdit} /> Admin Edit
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

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
                            <button className="sidebar-close-btn" onClick={closeSidebar}>
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>

                        <div className="sidebar-content">

                            <h3 className="sidebar-section-title">General Information</h3>
                            <div className="detail-grid-2">
                                <div className="detail-group">
                                    <span className="detail-label">Amount</span>
                                    <span className="detail-value fw-bold text-green">₹ {selectedExpense.amount.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="detail-group">
                                    <span className="detail-label">{selectedExpense.category === 'Vendor Payment' ? 'Invoice Date' : 'Date'}</span>
                                    <span className="detail-value">{new Date(selectedExpense.expenseDate).toLocaleDateString()}</span>
                                </div>
                                <div className="detail-group">
                                    <span className="detail-label">Submitted By</span>
                                    <span className="detail-value">{selectedExpense.submittedBy?.name || 'N/A'}</span>
                                </div>
                                <div className="detail-group">
                                    <span className="detail-label">Payment Source</span>
                                    <span className="detail-value">{selectedExpense.isCompanyPayment ? 'Company Account' : selectedExpense.paymentSourceId?.name || 'N/A'}</span>
                                </div>
                                <div className="detail-group" style={{ gridColumn: 'span 2' }}>
                                    <span className="detail-label">Project / Department</span>
                                    <span className="detail-value">{selectedExpense.projectName || 'Regular Office Expense'}</span>
                                </div>

                                {selectedExpense.vendorId && (
                                    <div className="detail-group" style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                        <span className="detail-label" style={{ color: '#2563eb' }}><FontAwesomeIcon icon={faBuilding} /> Central Vendor Profile</span>
                                        <span className="detail-value fw-600">{selectedExpense.vendorId.name}</span>
                                        {selectedExpense.vendorId.gstNumber && <span className="text-small text-muted d-block">GST: {selectedExpense.vendorId.gstNumber}</span>}
                                    </div>
                                )}

                                <div className="detail-group" style={{ gridColumn: 'span 2' }}>
                                    <span className="detail-label">Description Tags</span>
                                    <span className="detail-value">{selectedExpense.descriptionTags}</span>
                                </div>

                                {selectedExpense.adminFeedback && (
                                    <div className="detail-group" style={{ gridColumn: 'span 2' }}>
                                        <span className="detail-label" style={{ color: '#ea580c' }}>Admin Note / Feedback</span>
                                        <span className="detail-value" style={{ background: '#fef3c7', padding: '8px', borderRadius: '4px', fontStyle: 'italic' }}>
                                            "{selectedExpense.adminFeedback}"
                                        </span>
                                    </div>
                                )}
                            </div>

                            {selectedExpense.expenseDetails && Object.keys(selectedExpense.expenseDetails).length > 0 && (
                                <>
                                    <h3 className="sidebar-section-title mt-20">Granular Details</h3>
                                    <div className="detail-grid-2">
                                        {Object.entries(selectedExpense.expenseDetails).map(([key, value]) => {
                                            if (!value) return null;
                                            const isLongText = typeof value === 'string' && value.length > 30;

                                            return (
                                                <div className="detail-group" key={key} style={isLongText ? { gridColumn: 'span 2' } : {}}>
                                                    <span className="detail-label" style={key === 'paymentDate' ? { color: '#16a34a', fontWeight: 'bold' } : {}}>{formatKeyToLabel(key)}</span>
                                                    <span className="detail-value">{value}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            <div className="mt-20 pt-20" style={{ borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {selectedExpense.status === 'Pending' ? (
                                    <>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <button className="gts-btn btn-small m-0" style={{ flex: 1, background: '#16a34a', color: 'white', justifyContent: 'center' }} onClick={() => handleStatusUpdate(selectedExpense._id, 'Approved')}>
                                                <FontAwesomeIcon icon={faCheckCircle} /> Approve
                                            </button>
                                            <button className="gts-btn btn-small m-0" style={{ flex: 1, background: '#dc2626', color: 'white', justifyContent: 'center' }} onClick={() => handleStatusUpdate(selectedExpense._id, 'Rejected')}>
                                                <FontAwesomeIcon icon={faTimesCircle} /> Reject
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <button className="gts-btn btn-small m-0" style={{ flex: 1, background: '#f59e0b', color: 'white', justifyContent: 'center' }} onClick={() => handleStatusUpdate(selectedExpense._id, 'Returned')}>
                                                <FontAwesomeIcon icon={faUndo} /> Return
                                            </button>
                                            {(currentUser.role === 'ADMIN' || currentUser.role === 'HR') ? (
                                                <button className="gts-btn btn-small m-0" style={{ flex: 1, background: '#2563eb', color: 'white', justifyContent: 'center' }} onClick={() => navigate(`/edit-expense/${selectedExpense._id}`)}>
                                                    <FontAwesomeIcon icon={faEdit} /> Edit
                                                </button>
                                            ) : (
                                                <div style={{ flex: 1 }}></div> // Invisible spacer
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    (currentUser.role === 'ADMIN' || currentUser.role === 'HR') && (
                                        <button className="gts-btn btn-small m-0" style={{ width: '100%', background: '#2563eb', color: 'white', justifyContent: 'center' }} onClick={() => navigate(`/edit-expense/${selectedExpense._id}`)}>
                                            <FontAwesomeIcon icon={faEdit} /> Admin Edit
                                        </button>
                                    )
                                )}
                            </div>

                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AdminExpenses;