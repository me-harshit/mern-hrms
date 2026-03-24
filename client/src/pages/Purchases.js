import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBoxOpen, faPlus, faSearch, faEdit, faFileInvoice,
    faImage, faFilter, faCheckCircle, faClock, faTimesCircle, faRupeeSign
} from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';
import '../styles/purchase.css';
import api, { SERVER_URL } from '../utils/api';

const Purchases = () => {
    const navigate = useNavigate();
    const [purchases, setPurchases] = useState([]);
    const [filteredPurchases, setFilteredPurchases] = useState([]);
    const [loading, setLoading] = useState(true);

    // 👇 NEW: Wallet State
    const [walletBalance, setWalletBalance] = useState(0);

    const [filterType, setFilterType] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [customDates, setCustomDates] = useState({ from: '', to: '' });

    useEffect(() => {
        fetchPurchases();
    }, []);

    const fetchPurchases = async () => {
        setLoading(true);
        try {
            // 1. Fetch Purchases
            const res = await api.get('/purchases');
            setPurchases(res.data);
            setFilteredPurchases(res.data);

            // 2. Fetch Wallet Balance
            try {
                const walletRes = await api.get('/wallets/my-balance');
                setWalletBalance(walletRes.data.balance);
            } catch (err) {
                console.error("Wallet API not found yet", err);
            }

        } catch (err) {
            console.error("Error fetching purchases", err);
            Swal.fire('Error', 'Failed to load expenses', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let result = purchases;
        const now = new Date();
        now.setHours(23, 59, 59, 999);

        if (filterType === 'Today') { const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0); result = result.filter(p => { const pDate = new Date(p.purchaseDate); return pDate >= startOfToday && pDate <= now; }); }
        else if (filterType === 'Week') { const oneWeekAgo = new Date(); oneWeekAgo.setDate(now.getDate() - 7); oneWeekAgo.setHours(0, 0, 0, 0); result = result.filter(p => { const pDate = new Date(p.purchaseDate); return pDate >= oneWeekAgo && pDate <= now; }); }
        else if (filterType === 'Month') { const oneMonthAgo = new Date(); oneMonthAgo.setDate(now.getDate() - 30); oneMonthAgo.setHours(0, 0, 0, 0); result = result.filter(p => { const pDate = new Date(p.purchaseDate); return pDate >= oneMonthAgo && pDate <= now; }); }
        else if (filterType === 'Custom') { if (customDates.from && customDates.to) { const start = new Date(customDates.from); start.setHours(0, 0, 0, 0); const end = new Date(customDates.to); end.setHours(23, 59, 59, 999); result = result.filter(p => { const pDate = new Date(p.purchaseDate); return pDate >= start && pDate <= end; }); } }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(p =>
                (p.category && p.category.toLowerCase().includes(term)) ||
                (p.descriptionTags && p.descriptionTags.toLowerCase().includes(term)) ||
                (p.projectName && p.projectName.toLowerCase().includes(term)) ||
                (p.status && p.status.toLowerCase().includes(term)) ||
                (p.amount && p.amount.toString().includes(term))
            );
        }

        setFilteredPurchases(result);
    }, [purchases, filterType, searchTerm, customDates]);

    const getFileUrl = (url) => {
        if (!url) return '';
        return url.startsWith('http') ? url : `${SERVER_URL}${url}`;
    };

    const viewFile = (fileData, title) => {
        if (Array.isArray(fileData)) {
            let htmlContent = '<div style="display:flex; flex-direction:column; gap:20px; max-height: 60vh; overflow-y:auto; padding-right:10px;">';
            fileData.forEach((url, index) => {
                const fullUrl = getFileUrl(url); // 👇 FIXED 👇
                const isVideo = url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/);
                htmlContent += `
                    <div style="background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div style="text-align: left; font-size: 12px; color: #64748b; margin-bottom: 8px; font-weight: 600;">File ${index + 1}</div>
                        ${isVideo ? `<video src="${fullUrl}" controls style="width:100%; border-radius:6px; max-height:400px; background:#000;"></video>` : `<img src="${fullUrl}" style="width:100%; border-radius:6px; max-height:400px; object-fit:contain;" />`}
                    </div>`;
            });
            htmlContent += '</div>';
            Swal.fire({ title: title, html: htmlContent, width: '800px', showCloseButton: true, showConfirmButton: false });
        } else {
            const fullUrl = getFileUrl(fileData); // 👇 FIXED 👇
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

    const totalFilteredAmount = filteredPurchases.reduce((sum, p) => sum + p.amount, 0);

    return (
        <div className="settings-container fade-in">
            <div className="page-header-row">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faBoxOpen} className="btn-icon" /> My Expenses & Purchases
                </h1>

                <button className="action-btn-primary btn-small" onClick={() => navigate('/add-purchase')}>
                    <FontAwesomeIcon icon={faPlus} className="btn-icon" /> Log Expense
                </button>
            </div>

            {/* 👇 NEW WALLET CARD 👇 */}
            <div className="stats-grid" style={{ marginBottom: '20px', justifyContent: 'flex-start' }}>
                <div className={`stat-card ${walletBalance < 0 ? 'theme-red' : 'theme-green'}`} style={{ maxWidth: '350px' }}>
                    <div className="stat-icon">
                        <FontAwesomeIcon icon={faRupeeSign} />
                    </div>
                    <div className="stat-info">
                        <p>My Wallet Balance</p>
                        <h3 style={{ color: walletBalance < 0 ? '#dc2626' : '#16a34a' }}>
                            {walletBalance < 0 ? '-' : ''}₹ {Math.abs(walletBalance).toLocaleString('en-IN')}
                        </h3>
                        {walletBalance < 0 && (
                            <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 'bold' }}>Pending Reimbursement</span>
                        )}
                    </div>
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

            <div className="table-summary-text fade-in" style={{ marginBottom: '20px', fontSize: '15px', fontWeight: '600', color: '#475569', textAlign: 'right' }}>
                Showing {filteredPurchases.length} records &nbsp;|&nbsp; Total Requested: <span className="text-orange mx-1" style={{ color: '#e67e22' }}>₹ {totalFilteredAmount.toLocaleString('en-IN')}</span>
            </div>

            {loading ? (
                <div className="empty-table-message">Loading expenses...</div>
            ) : (
                <div className="employee-table-container fade-in">
                    <table className="employee-table">
                        <thead>
                            <tr>
                                <th>Expense Category</th>
                                <th>Project / Tags</th>
                                <th>Amount & Date</th>
                                <th>Payment Source</th>
                                <th>Status</th>
                                <th>Proof</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPurchases.length === 0 ? (
                                <tr><td colSpan="7" className="empty-table-message">No records found.</td></tr>
                            ) : (
                                filteredPurchases.map(item => (
                                    <tr key={item._id}>
                                        <td data-label="Category">
                                            <div className="fw-600 text-primary">{item.category}</div>
                                            <div className="text-small text-muted">{item.expenseType}</div>
                                        </td>

                                        <td data-label="Project / Tags">
                                            <div className="fw-500 text-small">{item.projectName || 'Regular Office'}</div>
                                            <div className="expense-tag-pill">{item.descriptionTags}</div>
                                        </td>

                                        <td data-label="Amount & Date">
                                            <div className="expense-amount-large">₹ {item.amount.toLocaleString('en-IN')}</div>
                                            <div className="text-small text-muted fw-normal" style={{ marginTop: '4px' }}>{new Date(item.purchaseDate).toLocaleDateString()}</div>
                                        </td>

                                        <td data-label="Payment Source">
                                            <div className="text-small">{item.paymentSourceId?.name || 'Myself'}</div>
                                        </td>

                                        <td data-label="Status">
                                            <span className={`status-badge ${item.status === 'Approved' ? 'success' : item.status === 'Rejected' ? 'danger' : 'warning'}`} style={{ padding: '6px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center' }}>
                                                {getStatusIcon(item.status)} {item.status || 'Pending'}
                                            </span>
                                            {/* 👇 NEW: Shows who approved it 👇 */}
                                            {item.approvedBy && (
                                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontStyle: 'italic' }}>
                                                    By: {item.approvedBy.name}
                                                </div>
                                            )}
                                        </td>

                                        <td data-label="Proof">
                                            <div className="flex-row gap-5 flex-wrap">
                                                {item.paymentScreenshotUrl ? (
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

                                        <td data-label="Actions">
                                            {item.status !== 'Approved' ? (
                                                <button className="gts-btn primary btn-small" onClick={() => navigate(`/edit-purchase/${item._id}`)}>
                                                    <FontAwesomeIcon icon={faEdit} className="btn-icon" /> Edit
                                                </button>
                                            ) : (
                                                <span className="text-small text-muted">Locked</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default Purchases;