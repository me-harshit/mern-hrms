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

    // --- ADD PURCHASE HANDLER (Redirects to new page) ---
    const handleAddPurchase = () => {
        navigate('/add-purchase');
    };

    // --- EDIT STORAGE / STATUS HANDLER ---
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
                <h1 className="page-title" style={{ margin: 0 }}>
                    <FontAwesomeIcon icon={faBoxOpen} style={{ marginRight: '10px' }} />
                    My Purchases & Inventory
                </h1>

                <button className="action-btn-primary" onClick={handleAddPurchase}>
                    <FontAwesomeIcon icon={faPlus} style={{ marginRight: '5px' }} /> Log Purchase
                </button>
            </div>

            {/* EXACT MATCH FILTER BAR */}
            <div className="control-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '20px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>

                {/* 1. Filter Buttons */}
                <div className="button-group" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {['Today', 'Week', 'Month', 'All', 'Custom'].map(type => (
                        <button
                            key={type}
                            className={`gts-btn ${filterType === type ? 'primary' : 'warning'}`}
                            style={{ opacity: filterType === type ? 1 : 0.7, padding: '8px 15px', fontSize: '13px' }}
                            onClick={() => setFilterType(type)}
                        >
                            {type === 'Custom' && <FontAwesomeIcon icon={faFilter} style={{ marginRight: '5px' }} />}
                            {type}
                        </button>
                    ))}
                </div>

                {/* 2. Custom Date Inputs (Conditional) */}
                {filterType === 'Custom' && (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '5px 15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>From:</span>
                            <input
                                type="date"
                                className="swal2-input"
                                style={{ margin: 0, height: '35px', padding: '0 10px', fontSize: '13px', width: '130px' }}
                                value={customDates.from}
                                onChange={(e) => setCustomDates({ ...customDates, from: e.target.value })}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>To:</span>
                            <input
                                type="date"
                                className="swal2-input"
                                style={{ margin: 0, height: '35px', padding: '0 10px', fontSize: '13px', width: '130px' }}
                                value={customDates.to}
                                onChange={(e) => setCustomDates({ ...customDates, to: e.target.value })}
                            />
                        </div>
                    </div>
                )}

                {/* 3. Search Bar */}
                <div style={{ position: 'relative', minWidth: '250px' }}>
                    <FontAwesomeIcon
                        icon={faSearch}
                        style={{
                            position: 'absolute',
                            left: '15px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#aaa',
                            pointerEvents: 'none'
                        }}
                    />
                    <input
                        type="text"
                        placeholder="Search item, status, amount..."
                        className="swal2-input"
                        style={{ margin: 0, paddingLeft: '40px', width: '100%', height: '40px', fontSize: '14px' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* INVENTORY TABLE */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '50px', color: '#7A7A7A' }}>Loading inventory...</div>
            ) : (
                <div className="employee-table-container">
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
                                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#888' }}>No records found.</td></tr>
                            ) : (
                                filteredPurchases.map(item => (
                                    <tr key={item._id}>
                                        <td data-label="Item Details">
                                            <div style={{ fontWeight: '600', color: '#215D7B' }}>{item.itemName}</div>
                                            <div style={{ fontSize: '12px', color: '#777' }}>Qty: {item.quantity} • {new Date(item.purchaseDate).toLocaleDateString()}</div>
                                        </td>
                                        <td data-label="Project">
                                            <div style={{ fontSize: '13px', fontWeight: '500' }}>{item.projectName || '-'}</div>
                                        </td>
                                        <td data-label="Amount" style={{ fontWeight: 'bold', color: '#1e293b' }}>
                                            ₹ {item.amount.toLocaleString('en-IN')}
                                        </td>
                                        <td data-label="Storage / Status">
                                            <div style={{ fontSize: '13px', color: '#555', marginBottom: '4px' }}>
                                                <FontAwesomeIcon icon={faMapMarkerAlt} style={{ color: '#e67e22', marginRight: '4px' }} />
                                                {item.storageLocation || 'Unassigned'}
                                            </div>
                                            <span className={`status-badge ${item.inventoryStatus === 'Available' ? 'success' : item.inventoryStatus === 'In Use' ? 'warning' : 'danger'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                                                {item.inventoryStatus}
                                            </span>
                                        </td>
                                        <td data-label="Notes">
                                            <div style={{ fontSize: '12px', color: '#666', maxWidth: '150px', wordWrap: 'break-word' }}>
                                                {item.notes || '-'}
                                            </div>
                                        </td>
                                        <td data-label="Files">
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                {item.invoiceUrl ? (
                                                    <a href={`${SERVER_URL}${item.invoiceUrl}`} target="_blank" rel="noreferrer" title="View Invoice" style={{ color: '#215D7B', fontSize: '18px' }}>
                                                        <FontAwesomeIcon icon={faFileInvoice} />
                                                    </a>
                                                ) : <span style={{ color: '#ccc' }}>-</span>}

                                                {item.paymentScreenshotUrl ? (
                                                    <a href={`${SERVER_URL}${item.paymentScreenshotUrl}`} target="_blank" rel="noreferrer" title="View Screenshot" style={{ color: '#8e44ad', fontSize: '18px' }}>
                                                        <FontAwesomeIcon icon={faImage} />
                                                    </a>
                                                ) : null}

                                                {item.productMediaUrl ? (
                                                    <a href={`${SERVER_URL}${item.productMediaUrl}`} target="_blank" rel="noreferrer" title="View Product Media" style={{ color: '#27ae60', fontSize: '18px' }}>
                                                        <FontAwesomeIcon icon={faBoxOpen} />
                                                    </a>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td data-label="Actions">
                                            <button className="gts-btn primary" style={{ padding: '5px 10px', fontSize: '12px' }} onClick={() => handleEditInventory(item)}>
                                                <FontAwesomeIcon icon={faEdit} /> Location
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