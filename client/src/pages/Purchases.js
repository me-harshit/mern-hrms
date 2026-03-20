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

    // --- FILTERS STATE ---
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

    // --- FILTER LOGIC ---
    useEffect(() => {
        let result = purchases;
        const now = new Date();
        now.setHours(23, 59, 59, 999);

        // 1. Time Filtering
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

        // 2. Search Filtering (Item, Project, Status, Amount)
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
            confirmButtonText: 'Update',
            confirmButtonColor: '#215D7B',
            preConfirm: () => {
                return {
                    storageLocation: document.getElementById('edit-storage').value,
                    inventoryStatus: document.getElementById('edit-status').value
                }
            }
        });

        if (formValues) {
            try {
                await api.put(`/purchases/${item._id}`, formValues);
                Swal.fire('Updated', 'Inventory details updated', 'success');
                fetchPurchases();
            } catch (err) {
                Swal.fire('Error', 'Failed to update', 'error');
            }
        }
    };

    return (
        <div className="settings-container fade-in">
            {/* HEADER */}
            <div className="page-header-row">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faBoxOpen} className="btn-icon" />
                    My Purchases & Inventory
                </h1>

                <button className="action-btn-primary btn-small" onClick={handleAddPurchase}>
                    <FontAwesomeIcon icon={faPlus} className="btn-icon" /> Log Purchase
                </button>
            </div>

            {/* EXACT MATCH FILTER BAR */}
            <div className="filter-bar-card fade-in">

                {/* 1. Filter Buttons */}
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

                {/* 2. Custom Date Inputs */}
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

                {/* 3. Search Bar */}
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

            {/* INVENTORY TABLE */}
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
                                                    <a href={`${SERVER_URL}${item.invoiceUrl}`} target="_blank" rel="noreferrer" title="View Invoice" className="file-icon-link text-primary">
                                                        <FontAwesomeIcon icon={faFileInvoice} />
                                                    </a>
                                                ) : <span className="text-muted">-</span>}

                                                {item.paymentScreenshotUrl ? (
                                                    <a href={`${SERVER_URL}${item.paymentScreenshotUrl}`} target="_blank" rel="noreferrer" title="View Screenshot" className="file-icon-link text-purple">
                                                        <FontAwesomeIcon icon={faImage} />
                                                    </a>
                                                ) : null}

                                                {item.productMediaUrl ? (
                                                    <a href={`${SERVER_URL}${item.productMediaUrl}`} target="_blank" rel="noreferrer" title="View Product Media" className="file-icon-link text-green">
                                                        <FontAwesomeIcon icon={faBoxOpen} />
                                                    </a>
                                                ) : null}
                                            </div>
                                        </td>
                                        
                                        <td data-label="Actions">
                                            <button className="gts-btn primary btn-small" onClick={() => handleEditInventory(item)}>
                                                <FontAwesomeIcon icon={faEdit} className="btn-icon" /> Location
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