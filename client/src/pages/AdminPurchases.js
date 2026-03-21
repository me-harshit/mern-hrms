import React, { useState, useEffect } from 'react';
import api, { SERVER_URL } from '../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faBoxOpen, faSearch, faEdit, faFileInvoice, 
    faImage, faMapMarkerAlt, faFilter 
} from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

const AdminPurchases = () => {
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
            const res = await api.get('/purchases/all');
            setPurchases(res.data);
            setFilteredPurchases(res.data);
        } catch (err) {
            Swal.fire('Error', 'Failed to load company purchases', 'error');
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
                (p.purchasedBy?.name && p.purchasedBy.name.toLowerCase().includes(term)) ||
                (p.purchasedBy?.employeeId && p.purchasedBy.employeeId.toLowerCase().includes(term)) ||
                (p.inventoryStatus && p.inventoryStatus.toLowerCase().includes(term)) ||
                (p.storageLocation && p.storageLocation.toLowerCase().includes(term)) ||
                (p.amount && p.amount.toString().includes(term))
            );
        }

        setFilteredPurchases(result);
    }, [purchases, filterType, searchTerm, customDates]);

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

    const handleEditInventory = async (item) => {
        const { value: formValues } = await Swal.fire({
            title: `Update: ${item.itemName}`,
            html: `
                <div style="text-align: left; padding: 0 10px;">
                    <label class="swal-custom-label">Storage Location</label>
                    <input id="edit-storage" class="swal2-input" value="${item.storageLocation || ''}" placeholder="e.g. B2">
                    <label class="swal-custom-label">Inventory Status</label>
                    <select id="edit-status" class="swal2-select">
                        <option value="Available" ${item.inventoryStatus === 'Available' ? 'selected' : ''}>Available</option>
                        <option value="In Use" ${item.inventoryStatus === 'In Use' ? 'selected' : ''}>In Use</option>
                        <option value="Consumed" ${item.inventoryStatus === 'Consumed' ? 'selected' : ''}>Consumed</option>
                        <option value="Lost/Damaged" ${item.inventoryStatus === 'Lost/Damaged' ? 'selected' : ''}>Lost/Damaged</option>
                    </select>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Update Details',
            confirmButtonColor: '#215D7B',
            preConfirm: () => ({
                storageLocation: document.getElementById('edit-storage').value,
                inventoryStatus: document.getElementById('edit-status').value
            })
        });

        if (formValues) {
            try {
                await api.put(`/purchases/${item._id}`, formValues);
                Swal.fire('Updated', 'Inventory updated successfully', 'success');
                fetchPurchases();
            } catch (err) {
                Swal.fire('Error', 'Failed to update', 'error');
            }
        }
    };

    const totalFilteredAmount = filteredPurchases.reduce((sum, p) => sum + p.amount, 0);

    return (
        <div className="attendance-container fade-in">
            
            <div className="page-header-row mb-20">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faBoxOpen} className="btn-icon" />
                    All Company Purchases
                </h1>
            </div>

            {/* EXACT MATCH FILTER BAR */}
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
                        placeholder="Search item, status, employee..." 
                        className="swal2-input search-input" 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                    />
                </div>
            </div>

            <div className="table-summary-text fade-in">
                Showing {filteredPurchases.length} records &nbsp;|&nbsp; Total Value: <span className="text-orange mx-1">₹ {totalFilteredAmount.toLocaleString('en-IN')}</span>
            </div>

            <div className="employee-table-container fade-in">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Item & Date</th>
                            <th>Project</th>
                            <th>Amount</th>
                            <th>Location / Status</th>
                            <th>Documents</th>
                            <th>Action</th>
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
                                    <td data-label="Employee">
                                        <div className="fw-bold text-primary">{item.purchasedBy?.name || 'Unknown'}</div>
                                        <div className="text-small text-muted">{item.purchasedBy?.employeeId || '-'}</div>
                                    </td>
                                    
                                    <td data-label="Item & Date">
                                        <div className="fw-600">{item.itemName} <span className="text-small text-muted">(x{item.quantity})</span></div>
                                        <div className="text-small text-muted">{new Date(item.purchaseDate).toLocaleDateString()}</div>
                                    </td>
                                    
                                    <td data-label="Project">
                                        <div className="fw-500 text-small">{item.projectName || '-'}</div>
                                    </td>
                                    
                                    <td data-label="Amount">
                                        <div className="fw-bold text-dark-blue fs-15">₹ {item.amount.toLocaleString('en-IN')}</div>
                                    </td>
                                    
                                    <td data-label="Location / Status">
                                        <div className="text-small text-muted mb-5">
                                            <FontAwesomeIcon icon={faMapMarkerAlt} className="text-orange btn-icon" /> 
                                            {item.storageLocation || 'Unassigned'}
                                        </div>
                                        <span className={`status-badge ${item.inventoryStatus === 'Available' ? 'success' : item.inventoryStatus === 'In Use' ? 'warning' : 'danger'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                                            {item.inventoryStatus}
                                        </span>
                                    </td>
                                    
                                    <td data-label="Documents">
                                        <div className="flex-row gap-5 flex-wrap">
                                            {item.invoiceUrl ? (
                                                <button 
                                                    onClick={() => viewFile(item.invoiceUrl, 'Invoice Document')} 
                                                    className="gts-btn doc-btn doc-invoice" 
                                                >
                                                    <FontAwesomeIcon icon={faFileInvoice} className="btn-icon"/> Invoice
                                                </button>
                                            ) : <span className="text-muted text-small">-</span>}

                                            {item.paymentScreenshotUrl ? (
                                                <button 
                                                    onClick={() => viewFile(item.paymentScreenshotUrl, 'Payment Screenshot')} 
                                                    className="gts-btn doc-btn doc-proof"
                                                >
                                                    <FontAwesomeIcon icon={faImage} className="btn-icon"/> Proof
                                                </button>
                                            ) : null}

                                            {/* CHECKING FOR ARRAY LENGTH INSTEAD OF STRING */}
                                            {item.productMediaUrls && item.productMediaUrls.length > 0 ? (
                                                <button 
                                                    onClick={() => viewFile(item.productMediaUrls, `Product Media (${item.productMediaUrls.length})`)} 
                                                    className="gts-btn doc-btn doc-media"
                                                >
                                                    <FontAwesomeIcon icon={faBoxOpen} className="btn-icon"/> Media
                                                </button>
                                            ) : null}
                                        </div>
                                    </td>
                                    
                                    <td data-label="Action">
                                        <button className="gts-btn primary btn-small" onClick={() => handleEditInventory(item)}>
                                            <FontAwesomeIcon icon={faEdit} className="btn-icon" /> Edit
                                        </button>
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