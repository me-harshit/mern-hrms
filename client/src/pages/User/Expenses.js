import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBoxOpen, faPlus, faSearch, faEdit, faFileInvoice,
    faImage, faFilter, faCheckCircle, faClock, faTimesCircle, faUndo, faWallet, faTrash
} from '@fortawesome/free-solid-svg-icons';
import Pagination from '../../components/Pagination'; 
import '../../styles/App.css';
import '../../styles/expenses.css';
import api, { SERVER_URL } from '../../utils/api';

const Expenses = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user')); 
    
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [walletBalance, setWalletBalance] = useState(0);

    // --- PAGINATION & STATS STATES ---
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    
    const [stats, setStats] = useState({
        pendingTotal: 0, pendingCount: 0,
        approvedTotal: 0, approvedCount: 0,
        returnedTotal: 0, returnedCount: 0,
        rejectedTotal: 0, rejectedCount: 0,
        totalFilteredAmount: 0
    });

    // --- FILTER STATES ---
    const [filterType, setFilterType] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [customDates, setCustomDates] = useState({ from: '', to: '' });
    const [statusFilter, setStatusFilter] = useState('All');

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Reset to Page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filterType, customDates, statusFilter, debouncedSearch]);

    // Fetch Data
    useEffect(() => {
        fetchExpenses(currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, itemsPerPage, filterType, customDates, statusFilter, debouncedSearch]);

    const fetchExpenses = async (pageToFetch) => {
        setLoading(true);
        try {
            const params = {
                page: pageToFetch,
                limit: itemsPerPage,
                search: debouncedSearch,
                status: statusFilter,
                filterType: filterType,
                fromDate: customDates.from,
                toDate: customDates.to
            };

            const res = await api.get('/expenses', { params });
            
            setExpenses(res.data.data);
            setStats(res.data.stats);
            setTotalPages(res.data.pagination.totalPages);
            setTotalRecords(res.data.pagination.totalRecords);
            setCurrentPage(res.data.pagination.currentPage);

            // Fetch Wallet separately
            try {
                const walletRes = await api.get('/wallets/my-balance');
                setWalletBalance(walletRes.data.balance);
            } catch (err) {
                console.error("Wallet API not found yet", err);
            }

        } catch (err) {
            console.error("Error fetching expenses", err);
            Swal.fire('Error', 'Failed to load expenses', 'error');
        } finally {
            setLoading(false);
        }
    };

    // 👇 NEW: Delete Expense Handler
    const handleDeleteExpense = async (id) => {
        const confirm = await Swal.fire({
            title: 'Delete this Expense?',
            text: "This action cannot be undone.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, delete it!'
        });

        if (confirm.isConfirmed) {
            try {
                await api.delete(`/expenses/${id}`);
                Swal.fire('Deleted!', 'Your expense has been deleted.', 'success');
                // Refresh the list
                fetchExpenses(currentPage);
            } catch (err) {
                Swal.fire('Error', 'Failed to delete expense. It may be locked.', 'error');
            }
        }
    };

    const handleCardClick = (status) => {
        setStatusFilter(prev => prev === status ? 'All' : status);
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

    const getMinimalCardStyle = (status, colorHex) => ({
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        opacity: statusFilter === 'All' || statusFilter === status ? 1 : 0.4,
        border: statusFilter === status ? `1.5px solid ${colorHex}` : '1px solid #e2e8f0',
        background: '#ffffff',
        padding: '12px 16px',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        minWidth: '140px',
        boxShadow: statusFilter === status ? `0 2px 8px ${colorHex}15` : 'none'
    });

    return (
        <div className="settings-container fade-in">
            <div className="page-header-row mb-20">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faBoxOpen} className="btn-icon" /> My Expenses
                </h1>

                <button className="action-btn-primary btn-small m-0" onClick={() => navigate('/add-expense')}>
                    <FontAwesomeIcon icon={faPlus} className="btn-icon" /> Log Expense
                </button>
            </div>

            {/* --- MINIMALIST SUMMARY METRICS & FILTERS --- */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '25px', alignItems: 'stretch' }}>

                {/* Wallet Pill */}
                <div style={{ background: walletBalance < 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${walletBalance < 0 ? '#fecaca' : '#bbf7d0'}`, padding: '12px 16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', minWidth: '160px', gap: '4px' }}>
                    <div style={{ fontSize: '12px', color: walletBalance < 0 ? '#dc2626' : '#16a34a', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FontAwesomeIcon icon={faWallet} /> Wallet Balance
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: walletBalance < 0 ? '#b91c1c' : '#15803d' }}>
                        {walletBalance < 0 ? '-' : ''}₹ {Math.abs(walletBalance).toLocaleString('en-IN')}
                    </div>
                </div>

                <div style={{ width: '1px', background: '#e2e8f0', margin: '0 5px' }}></div>

                {/* Minimalist Filter Pills (Using Server Stats) */}
                <div style={getMinimalCardStyle('Pending', '#d97706')} onClick={() => handleCardClick('Pending')}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FontAwesomeIcon icon={faClock} style={{ color: '#d97706' }} /> Pending
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {stats.pendingTotal.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{stats.pendingCount} items</div>
                </div>

                <div style={getMinimalCardStyle('Approved', '#16a34a')} onClick={() => handleCardClick('Approved')}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FontAwesomeIcon icon={faCheckCircle} style={{ color: '#16a34a' }} /> Accepted
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {stats.approvedTotal.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{stats.approvedCount} items</div>
                </div>

                <div style={getMinimalCardStyle('Returned', '#ea580c')} onClick={() => handleCardClick('Returned')}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FontAwesomeIcon icon={faUndo} style={{ color: '#ea580c' }} /> Returned
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {stats.returnedTotal.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{stats.returnedCount} items</div>
                </div>

                <div style={getMinimalCardStyle('Rejected', '#dc2626')} onClick={() => handleCardClick('Rejected')}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FontAwesomeIcon icon={faTimesCircle} style={{ color: '#dc2626' }} /> Rejected
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {stats.rejectedTotal.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{stats.rejectedCount} items</div>
                </div>
            </div>

            <div className="filter-bar-card fade-in">
                <div className="filter-buttons">
                    {['Today', 'Week', 'Month', 'All', 'Custom'].map(type => (
                        <button key={type} className={`gts-btn filter-btn ${filterType === type ? 'primary active' : 'warning inactive'}`} onClick={() => setFilterType(type)}>
                            {type === 'Custom' && <FontAwesomeIcon icon={faFilter} className="filter-icon" />} {type}
                        </button>
                    ))}
                </div>

                {filterType === 'Custom' && (
                    <div className="custom-date-filters fade-in">
                        <div className="date-input-group"><span className="date-label">From:</span><input type="date" className="swal2-input date-picker-small" value={customDates.from} onChange={(e) => setCustomDates({ ...customDates, from: e.target.value })} /></div>
                        <div className="date-input-group"><span className="date-label">To:</span><input type="date" className="swal2-input date-picker-small" value={customDates.to} onChange={(e) => setCustomDates({ ...customDates, to: e.target.value })} /></div>
                    </div>
                )}

                <div className="search-wrapper">
                    <FontAwesomeIcon icon={faSearch} className="search-icon" />
                    <input type="text" placeholder="Search category, tags, amount..." className="swal2-input search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
            </div>

            <div className="table-summary-text fade-in" style={{ marginBottom: '20px', fontSize: '14px', fontWeight: '600', color: '#64748b', textAlign: 'right' }}>
                Showing {expenses.length} of {totalRecords} records &nbsp;|&nbsp; View Total: <span style={{ color: '#0f172a' }}>₹ {stats.totalFilteredAmount.toLocaleString('en-IN')}</span>
            </div>

            <div className="employee-table-container fade-in">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Expense Category</th>
                            <th>Project & Details</th> 
                            <th>Amount & Date</th>
                            <th>Payment Source</th>
                            <th>Status</th>
                            <th>Proof</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="7" className="empty-table-message">Loading Server Data...</td></tr>
                        ) : expenses.length === 0 ? (
                            <tr><td colSpan="7" className="empty-table-message">No records found.</td></tr>
                        ) : (
                            expenses.map(item => {
                                const isProject = item.expenseType === 'Project Expense';
                                const typeLabel = isProject ? 'Project' : 'Regular';
                                const typeBorderColor = isProject ? '#A6477F' : '#1E73BE';
                                const typeBgColor = isProject ? '#fdf2f8' : '#eff6ff';

                                const submitterId = item.submittedBy?._id;
                                const payerId = item.paymentSourceId?._id;
                                
                                const isCompanyPayment = item.isCompanyPayment;
                                const isSamePerson = submitterId === payerId;

                                return (
                                    <tr key={item._id}>
                                        <td data-label="Category">
                                            <div className="fw-600 text-primary">{item.category}</div>
                                            <div className="text-small text-muted">{item.expenseType}</div>
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
                                            <div className="text-small text-muted fw-normal" style={{ marginTop: '4px' }}>{new Date(item.expenseDate).toLocaleDateString()}</div>
                                        </td>

                                        <td data-label="Payment Source">
                                            {item.submittedBy?._id && item.submittedBy._id !== currentUser.id && (
                                                <div className="text-small text-muted" style={{ marginBottom: '4px' }}>
                                                    <span className="fw-600">Logged by:</span> {item.submittedBy.name}
                                                </div>
                                            )}
                                            <div className="text-small">
                                                <span className="fw-600 text-dark">Paid by:</span> {
                                                    item.isCompanyPayment ? 'Company Account' : 
                                                    item.paymentSourceId?._id === currentUser.id ? 'Me' : 
                                                    item.paymentSourceId?.name || 'Me'
                                                }
                                            </div>
                                        </td>

                                        <td data-label="Status">
                                            <span className={`status-badge ${item.status === 'Approved' ? 'success' : item.status === 'Rejected' ? 'danger' : item.status === 'Returned' ? 'warning' : 'warning'}`} style={{ padding: '6px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center' }}>
                                                {getStatusIcon(item.status)} {item.status || 'Pending'}
                                            </span>
                                            {item.approvedBy && (
                                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontStyle: 'italic' }}>
                                                    By: {item.approvedBy.name}
                                                </div>
                                            )}
                                            {item.status === 'Returned' && item.adminFeedback && (
                                                <div style={{ fontSize: '11px', color: '#ea580c', marginTop: '4px', fontWeight: 'bold' }}>
                                                    Note: "{item.adminFeedback}"
                                                </div>
                                            )}
                                        </td>

                                        <td data-label="Proof">
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

                                        {/* 👇 UPDATED: Added Delete button next to Edit */}
                                        <td data-label="Actions">
                                            {item.status === 'Pending' || item.status === 'Returned' ? (
                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                    <button className="gts-btn primary btn-small m-0" onClick={() => navigate(`/edit-expense/${item._id}`)}>
                                                        <FontAwesomeIcon icon={faEdit} className="btn-icon" /> {item.status === 'Returned' ? 'Fix' : 'Edit'}
                                                    </button>
                                                    <button className="gts-btn danger btn-small m-0" onClick={() => handleDeleteExpense(item._id)} title="Delete Expense">
                                                        <FontAwesomeIcon icon={faTrash} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-small text-muted">Locked</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {!loading && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalRecords={totalRecords}
                    limit={itemsPerPage}
                    onPageChange={(page) => setCurrentPage(page)}
                    onLimitChange={(newLimit) => {
                        setItemsPerPage(newLimit);
                        setCurrentPage(1);
                    }}
                />
            )}
        </div>
    );
};

export default Expenses;