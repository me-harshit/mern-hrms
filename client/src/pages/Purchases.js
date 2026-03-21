import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBoxOpen, faPlus, faSearch, faEdit, faFileInvoice,
    faImage, faMapMarkerAlt, faFilter
} from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';
import api, { SERVER_URL } from '../utils/api';

const Purchases = () => {
    const navigate = useNavigate();
    const [purchases, setPurchases] = useState([]);
    const [filteredPurchases, setFilteredPurchases] = useState([]);
    const [loading, setLoading] = useState(true);

    const [filterType, setFilterType] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [customDates, setCustomDates] = useState({ from: '', to: '' });

    useEffect(() => {
        fetchPurchases();
    }, []);

    const fetchPurchases = async () => {
        setLoading(true);
        try {
            const res = await api.get('/purchases');
            setPurchases(res.data);
            setFilteredPurchases(res.data);
        } catch (err) {
            console.error("Error fetching purchases", err);
            Swal.fire('Error', 'Failed to load inventory', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let result = purchases;
        const now = new Date();
        now.setHours(23, 59, 59, 999);

        if (filterType === 'Today') {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            result = result.filter(p => {
                const pDate = new Date(p.purchaseDate);
                return pDate >= startOfToday && pDate <= now;
            });
        }
        else if (filterType === 'Week') {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(now.getDate() - 7);
            oneWeekAgo.setHours(0, 0, 0, 0);
            result = result.filter(p => {
                const pDate = new Date(p.purchaseDate);
                return pDate >= oneWeekAgo && pDate <= now;
            });
        }
        else if (filterType === 'Month') {
            const oneMonthAgo = new Date();
            oneMonthAgo.setDate(now.getDate() - 30);
            oneMonthAgo.setHours(0, 0, 0, 0);
            result = result.filter(p => {
                const pDate = new Date(p.purchaseDate);
                return pDate >= oneMonthAgo && pDate <= now;
            });
        }
        else if (filterType === 'Custom') {
            if (customDates.from && customDates.to) {
                const start = new Date(customDates.from);
                start.setHours(0, 0, 0, 0);
                const end = new Date(customDates.to);
                end.setHours(23, 59, 59, 999);
                result = result.filter(p => {
                    const pDate = new Date(p.purchaseDate);
                    return pDate >= start && pDate <= end;
                });
            }
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(p =>
                (p.itemName && p.itemName.toLowerCase().includes(term)) ||
                (p.projectName && p.projectName.toLowerCase().includes(term)) ||
                (p.storageLocation && p.storageLocation.toLowerCase().includes(term)) ||
                (p.inventoryStatus && p.inventoryStatus.toLowerCase().includes(term)) ||
                (p.amount && p.amount.toString().includes(term))
            );
        }

        setFilteredPurchases(result);
    }, [purchases, filterType, searchTerm, customDates]);

    const handleAddPurchase = () => {
        navigate('/add-purchase');
    };

    // --- ENHANCED VIEW FILE FUNCTON (Supports Arrays/Galleries) ---
    const viewFile = (fileData, title) => {
        if (Array.isArray(fileData)) {
            let htmlContent = '<div style="display:flex; flex-direction:column; gap:20px; max-height: 60vh; overflow-y:auto; padding-right:10px;">';
            fileData.forEach((url, index) => {
                const fullUrl = `${SERVER_URL}${url}`;
                const isVideo = url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/);

                htmlContent += `
                    <div style="background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div style="text-align: left; font-size: 12px; color: #64748b; margin-bottom: 8px; font-weight: 600;">File ${index + 1}</div>
                        ${isVideo
                        ? `<video src="${fullUrl}" controls style="width:100%; border-radius:6px; max-height:400px; background:#000;"></video>`
                        : `<img src="${fullUrl}" style="width:100%; border-radius:6px; max-height:400px; object-fit:contain;" />`
                    }
                    </div>`;
            });
            htmlContent += '</div>';

            Swal.fire({
                title: title,
                html: htmlContent,
                width: '800px',
                showCloseButton: true,
                showConfirmButton: false
            });
        } else {
            const fullUrl = `${SERVER_URL}${fileData}`;
            const isPdf = fileData.toLowerCase().endsWith('.pdf');
            if (isPdf) {
                Swal.fire({
                    title: title,
                    html: `<iframe src="${fullUrl}" width="100%" height="500px" style="border: none; border-radius: 8px;"></iframe>`,
                    width: '800px',
                    showCloseButton: true,
                    showConfirmButton: false
                });
            } else {
                Swal.fire({
                    title: title,
                    imageUrl: fullUrl,
                    imageAlt: title,
                    width: '800px',
                    showCloseButton: true,
                    showConfirmButton: false
                });
            }
        }
    };

    const totalFilteredAmount = filteredPurchases.reduce((sum, p) => sum + p.amount, 0);

    return (
        <div className="settings-container fade-in">
            <div className="page-header-row">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faBoxOpen} className="btn-icon" />
                    My Purchases & Inventory
                </h1>

                <button className="action-btn-primary btn-small" onClick={handleAddPurchase}>
                    <FontAwesomeIcon icon={faPlus} className="btn-icon" /> Log Purchase
                </button>
            </div>

            <div className="filter-bar-card fade-in">
                <div className="filter-buttons">
                    {['Today', 'Week', 'Month', 'All', 'Custom'].map(type => (
                        <button
                            key={type}
                            className={`gts-btn filter-btn ${filterType === type ? 'primary active' : 'warning inactive'}`}
                            onClick={() => setFilterType(type)}
                        >
                            {type === 'Custom' && <FontAwesomeIcon icon={faFilter} className="filter-icon" />}
                            {type}
                        </button>
                    ))}
                </div>

                {filterType === 'Custom' && (
                    <div className="custom-date-filters fade-in">
                        <div className="date-input-group">
                            <span className="date-label">From:</span>
                            <input
                                type="date"
                                className="swal2-input date-picker-small"
                                value={customDates.from}
                                onChange={(e) => setCustomDates({ ...customDates, from: e.target.value })}
                            />
                        </div>
                        <div className="date-input-group">
                            <span className="date-label">To:</span>
                            <input
                                type="date"
                                className="swal2-input date-picker-small"
                                value={customDates.to}
                                onChange={(e) => setCustomDates({ ...customDates, to: e.target.value })}
                            />
                        </div>
                    </div>
                )}

                <div className="search-wrapper">
                    <FontAwesomeIcon icon={faSearch} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search item, status, amount..."
                        className="swal2-input search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="table-summary-text fade-in" style={{ marginBottom: '20px', fontSize: '15px', fontWeight: '600', color: '#475569', textAlign: 'right' }}>
                Showing {filteredPurchases.length} records &nbsp;|&nbsp; Total Value: <span className="text-orange mx-1" style={{ color: '#e67e22' }}>₹ {totalFilteredAmount.toLocaleString('en-IN')}</span>
            </div>

            {loading ? (
                <div className="empty-table-message">Loading inventory...</div>
            ) : (
                <div className="employee-table-container fade-in">
                    <table className="employee-table">
                        <thead>
                            <tr>
                                <th>Item Details</th>
                                <th>Project</th>
                                <th>Amount</th>
                                <th>Storage / Status</th>
                                <th>Notes</th>
                                <th>Files</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPurchases.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="empty-table-message">No records found.</td>
                                </tr>
                            ) : (
                                filteredPurchases.map(item => (
                                    <tr key={item._id}>
                                        <td data-label="Item Details">
                                            <div className="fw-600 text-primary">{item.itemName}</div>
                                            <div className="text-small text-muted">Qty: {item.quantity} • {new Date(item.purchaseDate).toLocaleDateString()}</div>
                                        </td>

                                        <td data-label="Project">
                                            <div className="fw-500 text-small">{item.projectName || '-'}</div>
                                        </td>

                                        <td data-label="Amount" className="fw-bold">
                                            ₹ {item.amount.toLocaleString('en-IN')}
                                        </td>

                                        <td data-label="Storage / Status">
                                            <div className="text-small text-muted mb-5">
                                                <FontAwesomeIcon icon={faMapMarkerAlt} className="text-orange" style={{ marginRight: '4px' }} />
                                                {item.storageLocation || 'Unassigned'}
                                            </div>
                                            <span className={`status-badge ${item.inventoryStatus === 'Available' ? 'success' : item.inventoryStatus === 'In Use' ? 'warning' : 'danger'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                                                {item.inventoryStatus}
                                            </span>
                                        </td>

                                        <td data-label="Notes">
                                            <div className="note-cell text-muted text-small">
                                                {item.notes || '-'}
                                            </div>
                                        </td>

                                        <td data-label="Files">
                                            <div className="flex-row gap-10">
                                                {item.invoiceUrl ? (
                                                    <button onClick={() => viewFile(item.invoiceUrl, 'Invoice Document')} className="gts-btn doc-btn doc-invoice" title="View Invoice">
                                                        <FontAwesomeIcon icon={faFileInvoice} />
                                                    </button>
                                                ) : <span className="text-muted">-</span>}

                                                {item.paymentScreenshotUrl ? (
                                                    <button onClick={() => viewFile(item.paymentScreenshotUrl, 'Payment Screenshot')} className="gts-btn doc-btn doc-proof" title="View Screenshot">
                                                        <FontAwesomeIcon icon={faImage} />
                                                    </button>
                                                ) : null}

                                                {/* CHECKING FOR ARRAY LENGTH INSTEAD OF STRING */}
                                                {item.productMediaUrls && item.productMediaUrls.length > 0 ? (
                                                    <button onClick={() => viewFile(item.productMediaUrls, `Product Media (${item.productMediaUrls.length})`)} className="gts-btn doc-btn doc-media" title="View Product Media">
                                                        <FontAwesomeIcon icon={faBoxOpen} />
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>

                                        <td data-label="Actions">
                                            {/* NAVIGATES TO EDIT PAGE */}
                                            <button className="gts-btn primary btn-small" onClick={() => navigate(`/edit-purchase/${item._id}`)}>
                                                <FontAwesomeIcon icon={faEdit} className="btn-icon" /> Edit
                                            </button>
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