import React, { useState, useEffect } from 'react';
import api, { SERVER_URL } from '../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faBoxOpen, faSearch, faFileInvoice, faImage, faFilter, 
    faCheckCircle, faClock, faTimesCircle, faChartLine, 
    faRupeeSign, faHourglassHalf 
} from '@fortawesome/free-solid-svg-icons';
// import { useNavigate } from 'react-router-dom'; // Ensure navigate is imported if you use it
import '../styles/App.css';
import '../styles/purchase.css';

const AdminPurchases = () => {
    // const navigate = useNavigate();
    const [purchases, setPurchases] = useState([]);
    const [filteredPurchases, setFilteredPurchases] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Auxiliary Data for Dropdowns
    const [usersList, setUsersList] = useState([]);
    const [projectsList, setProjectsList] = useState([]);

    // --- ADVANCED FILTERS STATE ---
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({
        fromDate: '',
        toDate: '',
        expenseType: '',
        category: '', 
        projectName: '', 
        submittedBy: '',
        approvedBy: '',
        minAmount: '',
        maxAmount: '',
        status: ''
    });

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Expenses
            const res = await api.get('/purchases/all');
            setPurchases(res.data);
            setFilteredPurchases(res.data);

            // 2. Fetch Users (for Submitter / Approver dropdowns)
            const userRes = await api.get('/employees');
            setUsersList(userRes.data);

            // 3. Fetch Projects
            try {
                const projRes = await api.get('/projects');
                setProjectsList(projRes.data);
            } catch (e) {
                console.log("Projects API not ready yet. Skipping.");
            }

        } catch (err) {
            Swal.fire('Error', 'Failed to load company purchases', 'error');
        } finally {
            setLoading(false);
        }
    };

    // --- MASSIVE FILTER ENGINE ---
    useEffect(() => {
        let result = purchases;

        // 1. Date Range Filter
        if (filters.fromDate && filters.toDate) {
            const start = new Date(filters.fromDate); start.setHours(0, 0, 0, 0);
            const end = new Date(filters.toDate); end.setHours(23, 59, 59, 999);
            result = result.filter(p => {
                const pDate = new Date(p.purchaseDate);
                return pDate >= start && pDate <= end;
            });
        }

        // 2. Expense Type (Project vs Regular)
        if (filters.expenseType) {
            result = result.filter(p => p.expenseType === filters.expenseType);
        }

        // 3. Category Filter
        if (filters.category) {
            result = result.filter(p => p.category === filters.category);
        }

        // 4. Project Filter 
        if (filters.projectName) {
            result = result.filter(p => p.projectName === filters.projectName);
        }

        // 5. Submitted By
        if (filters.submittedBy) {
            result = result.filter(p => p.purchasedBy?._id === filters.submittedBy);
        }

        // 6. Approved By
        if (filters.approvedBy) {
            result = result.filter(p => p.approvedBy?._id === filters.approvedBy);
        }

        // 7. Amount Range
        if (filters.minAmount) {
            result = result.filter(p => p.amount >= Number(filters.minAmount));
        }
        if (filters.maxAmount) {
            result = result.filter(p => p.amount <= Number(filters.maxAmount));
        }

        // 8. Status Filter
        if (filters.status) {
            result = result.filter(p => p.status === filters.status);
        }

        // 9. Generic Search Term 
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(p => 
                (p.category && p.category.toLowerCase().includes(term)) ||
                (p.descriptionTags && p.descriptionTags.toLowerCase().includes(term)) ||
                (p.projectName && p.projectName.toLowerCase().includes(term)) ||
                (p.purchasedBy?.name && p.purchasedBy.name.toLowerCase().includes(term)) ||
                (p.amount && p.amount.toString().includes(term))
            );
        }

        setFilteredPurchases(result);
    }, [purchases, filters, searchTerm]);

    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
    };

    const clearFilters = () => {
        setFilters({
            fromDate: '', toDate: '', expenseType: '', category: '', projectName: '', 
            submittedBy: '', approvedBy: '', minAmount: '', maxAmount: '', status: ''
        });
        setSearchTerm('');
    };

    // --- APPROVAL / DEDUCTION ENGINE ---
    const handleStatusUpdate = async (id, newStatus) => {
        const confirmText = newStatus === 'Approved' ? 'This will deduct funds from the selected payment source.' : 'Reject this expense?';
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
                await api.put(`/purchases/${id}/status`, { status: newStatus });
                Swal.fire('Success', `Expense marked as ${newStatus}`, 'success');
                fetchInitialData(); 
            } catch (err) {
                Swal.fire('Error', err.response?.data?.message || 'Failed to update status', 'error');
            }
        }
    };

    // --- UI HELPERS ---
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
        return <FontAwesomeIcon icon={faClock} style={{ color: '#d97706', marginRight: '5px' }} />;
    };

    // --- SUMMARY STATS ---
    const totalAmount = filteredPurchases.reduce((sum, p) => sum + p.amount, 0);
    const pendingCount = filteredPurchases.filter(p => p.status === 'Pending').length;
    const approvedAmount = filteredPurchases.filter(p => p.status === 'Approved').reduce((sum, p) => sum + p.amount, 0);

    return (
        <div className="settings-container fade-in">
            
            <div className="page-header-row mb-20">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faBoxOpen} className="btn-icon" /> Team Expense Overview
                </h1>
            </div>

            {/* --- SUMMARY CARDS --- */}
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

            {/* --- ADVANCED FILTER GRID --- */}
            <div className="expense-form-section">
                <div className="expense-section-title" style={{ fontSize: '14px', marginBottom: '15px' }}>
                    <FontAwesomeIcon icon={faFilter} /> Advanced Filters
                    <button className="gts-btn btn-small" onClick={clearFilters} style={{ marginLeft: 'auto', background: '#f1f5f9', color: '#64748b' }}>Clear All</button>
                </div>
                
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                    {/* Search */}
                    <div className="search-wrapper" style={{ gridColumn: '1 / -1', maxWidth: '100%' }}>
                        <FontAwesomeIcon icon={faSearch} className="search-icon" />
                        <input type="text" placeholder="Search by name, tags, project..." className="swal2-input search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>

                    {/* Date Range */}
                    <div><label className="input-label" style={{ fontSize: '11px' }}>From Date</label><input type="date" className="custom-input" name="fromDate" value={filters.fromDate} onChange={handleFilterChange} /></div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>To Date</label><input type="date" className="custom-input" name="toDate" value={filters.toDate} onChange={handleFilterChange} /></div>
                    
                    {/* Status & Type */}
                    <div>
                        <label className="input-label" style={{ fontSize: '11px' }}>Status</label>
                        <select className="custom-input" name="status" value={filters.status} onChange={handleFilterChange}>
                            <option value="">All Statuses</option>
                            <option value="Pending">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Rejected">Rejected</option>
                        </select>
                    </div>
                    <div>
                        <label className="input-label" style={{ fontSize: '11px' }}>Expense Type</label>
                        <select className="custom-input" name="expenseType" value={filters.expenseType} onChange={handleFilterChange}>
                            <option value="">All Types</option>
                            <option value="Project Expense">Project Expense</option>
                            <option value="Regular Office Expense">Regular Office Expense</option>
                        </select>
                    </div>

                    {/* Category & Project */}
                    <div>
                        <label className="input-label" style={{ fontSize: '11px' }}>Category</label>
                        <select className="custom-input" name="category" value={filters.category} onChange={handleFilterChange}>
                            <option value="">All Categories</option>
                            <option value="Product / Item Purchase">Product / Item Purchase</option>
                            <option value="Fuel Expense (Car / Bike)">Fuel Expense (Car / Bike)</option>
                            <option value="Food Expense">Food Expense</option>
                            <option value="Travel Expense">Travel Expense</option>
                            <option value="Accommodation">Accommodation</option>
                            <option value="Regular Office Expense">Regular Office Expense</option>
                        </select>
                    </div>
                    <div>
                        <label className="input-label" style={{ fontSize: '11px' }}>Project</label>
                        <select className="custom-input" name="projectName" value={filters.projectName} onChange={handleFilterChange}>
                            <option value="">All Projects</option>
                            {projectsList.map(proj => <option key={proj._id} value={proj.name}>{proj.name}</option>)}
                        </select>
                    </div>

                    {/* Personnel Filters */}
                    <div>
                        <label className="input-label" style={{ fontSize: '11px' }}>Submitted By</label>
                        <select className="custom-input" name="submittedBy" value={filters.submittedBy} onChange={handleFilterChange}>
                            <option value="">Anyone</option>
                            {usersList.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="input-label" style={{ fontSize: '11px' }}>Approved By</label>
                        <select className="custom-input" name="approvedBy" value={filters.approvedBy} onChange={handleFilterChange}>
                            <option value="">Anyone</option>
                            {usersList.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                        </select>
                    </div>

                    {/* Amount Range */}
                    <div><label className="input-label" style={{ fontSize: '11px' }}>Min Amount (₹)</label><input type="number" className="custom-input" name="minAmount" value={filters.minAmount} onChange={handleFilterChange} placeholder="0" /></div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>Max Amount (₹)</label><input type="number" className="custom-input" name="maxAmount" value={filters.maxAmount} onChange={handleFilterChange} placeholder="Max" /></div>
                </div>
            </div>

            <div className="table-summary-text fade-in">
                Showing {filteredPurchases.length} matching records
            </div>

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
                        ) : filteredPurchases.length === 0 ? (
                            <tr><td colSpan="7" className="empty-table-message">No records found.</td></tr>
                        ) : (
                            filteredPurchases.map(item => (
                                <tr key={item._id}>
                                    <td data-label="Submitter">
                                        <div className="fw-bold text-primary">{item.purchasedBy?.name || 'Unknown'}</div>
                                        <div className="text-small text-muted">{item.purchasedBy?.employeeId || '-'}</div>
                                    </td>
                                    
                                    <td data-label="Details & Project">
                                        <div className="fw-600">{item.category}</div>
                                        <div className="expense-tag-pill">{item.projectName || 'Regular Office'}</div>
                                        <div className="text-small text-muted" style={{ marginTop: '5px', fontStyle: 'italic' }}>{item.descriptionTags}</div>
                                    </td>
                                    
                                    <td data-label="Amount & Date">
                                        <div className="expense-amount-large">₹ {item.amount.toLocaleString('en-IN')}</div>
                                        <div className="text-small text-muted fw-normal" style={{ marginTop: '4px' }}>{new Date(item.purchaseDate).toLocaleDateString()}</div>
                                    </td>

                                    <td data-label="Payment Source">
                                        <div className="text-small fw-600">{item.paymentSourceId?.name || 'Unknown'}</div>
                                    </td>
                                    
                                    <td data-label="Status & Approver">
                                        <span className={`status-badge ${item.status === 'Approved' ? 'success' : item.status === 'Rejected' ? 'danger' : 'warning'}`} style={{ padding: '6px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center' }}>
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
                                            
                                            {/* 👇 FIXED: Safely Handles New Arrays or Old Strings 👇 */}
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
                                                <button className="gts-btn btn-small" style={{ background: '#dcfce7', color: '#16a34a', width: '100%', justifyContent: 'center' }} onClick={() => handleStatusUpdate(item._id, 'Approved')}>
                                                    Approve
                                                </button>
                                                <button className="gts-btn btn-small" style={{ background: '#fee2e2', color: '#dc2626', width: '100%', justifyContent: 'center' }} onClick={() => handleStatusUpdate(item._id, 'Rejected')}>
                                                    Reject
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-small text-muted fw-600">Processed</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminPurchases;