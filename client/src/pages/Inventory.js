import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api, { SERVER_URL } from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faBoxes, faPlus, faSearch, faFilter, faCheckCircle, 
    faUserCheck, faExclamationTriangle, faBan, faEdit 
} from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';
import '../styles/expenses.css'; 

const Inventory = () => {
    const navigate = useNavigate();
    const [inventory, setInventory] = useState([]);
    const [filteredInventory, setFilteredInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    useEffect(() => {
        fetchInventory();
    }, []);

    const fetchInventory = async () => {
        setLoading(true);
        try {
            const res = await api.get('/inventory').catch(() => ({ data: [] })); 
            setInventory(res.data);
            setFilteredInventory(res.data);
        } catch (err) {
            Swal.fire('Error', 'Failed to load inventory', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let result = inventory;

        if (statusFilter !== 'All') {
            result = result.filter(item => item.status === statusFilter);
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(item =>
                item.itemName?.toLowerCase().includes(term) ||
                item.assignedTo?.name?.toLowerCase().includes(term) ||
                item.storageLocation?.toLowerCase().includes(term)
            );
        }

        setFilteredInventory(result);
    }, [inventory, statusFilter, searchTerm]);

    // 👇 FIXED: Math now calculates the SUM of 'quantity', not just row counts! 👇
    const totalItems = inventory.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const availableItems = inventory.filter(i => i.status === 'Available').reduce((sum, item) => sum + (item.quantity || 1), 0);
    const assignedItems = inventory.filter(i => i.status === 'Assigned').reduce((sum, item) => sum + (item.quantity || 1), 0);
    const issueItems = inventory.filter(i => ['Damaged', 'Lost'].includes(i.status)).reduce((sum, item) => sum + (item.quantity || 1), 0);

    const getStatusBadge = (status) => {
        switch(status) {
            case 'Available': return <span className="status-badge success"><FontAwesomeIcon icon={faCheckCircle} /> Available</span>;
            case 'Assigned': return <span className="status-badge primary"><FontAwesomeIcon icon={faUserCheck} /> Assigned</span>;
            case 'Damaged': return <span className="status-badge warning"><FontAwesomeIcon icon={faExclamationTriangle} /> Damaged</span>;
            case 'Lost': return <span className="status-badge danger"><FontAwesomeIcon icon={faBan} /> Lost</span>;
            default: return <span className="status-badge">{status}</span>;
        }
    };

    const getFileUrl = (url) => {
        if (!url) return '';
        return url.startsWith('http') ? url : `${SERVER_URL}${url}`;
    };

    return (
        <div className="settings-container fade-in">
            <div className="page-header-row mb-20">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faBoxes} className="btn-icon" /> Company Inventory
                </h1>
                <button className="action-btn-primary btn-small" onClick={() => navigate('/add-inventory')}>
                    <FontAwesomeIcon icon={faPlus} className="btn-icon" /> Add New Asset
                </button>
            </div>

            {/* --- STATS CARDS --- */}
            <div className="stats-grid" style={{ marginBottom: '20px' }}>
                <div className="stat-card theme-blue">
                    <div className="stat-info">
                        <p>Total Assets</p>
                        <h3>{totalItems}</h3>
                    </div>
                </div>
                <div className="stat-card theme-green">
                    <div className="stat-info">
                        <p>Available in Stock</p>
                        <h3>{availableItems}</h3>
                    </div>
                </div>
                <div className="stat-card theme-purple">
                    <div className="stat-info">
                        <p>Assigned to Staff</p>
                        <h3>{assignedItems}</h3>
                    </div>
                </div>
                <div className="stat-card theme-red">
                    <div className="stat-info">
                        <p>Damaged / Lost</p>
                        <h3>{issueItems}</h3>
                    </div>
                </div>
            </div>

            {/* --- FILTERS --- */}
            <div className="filter-bar-card fade-in">
                <div className="filter-buttons">
                    {['All', 'Available', 'Assigned', 'Damaged', 'Lost'].map(status => (
                        <button key={status} className={`gts-btn filter-btn ${statusFilter === status ? 'primary active' : 'warning inactive'}`} onClick={() => setStatusFilter(status)}>
                            {status === 'All' && <FontAwesomeIcon icon={faFilter} className="filter-icon" />} {status}
                        </button>
                    ))}
                </div>

                <div className="search-wrapper">
                    <FontAwesomeIcon icon={faSearch} className="search-icon" />
                    <input type="text" placeholder="Search items, locations, employees..." className="swal2-input search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
            </div>

            {/* --- INVENTORY TABLE --- */}
            <div className="employee-table-container fade-in">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Item Name & Qty</th>
                            <th>Status</th>
                            <th>Location / Assignment</th>
                            <th>Date Added</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="5" className="empty-table-message">Loading inventory...</td></tr>
                        ) : filteredInventory.length === 0 ? (
                            <tr><td colSpan="5" className="empty-table-message">No assets found.</td></tr>
                        ) : (
                            filteredInventory.map(item => (
                                <tr key={item._id}>
                                    <td data-label="Item Name & Qty">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                            {item.mediaUrls && item.mediaUrls.length > 0 ? (
                                                <img src={getFileUrl(item.mediaUrls[0])} alt="asset" style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
                                            ) : (
                                                <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <FontAwesomeIcon icon={faBoxes} style={{ color: '#94a3b8' }} />
                                                </div>
                                            )}
                                            <div>
                                                <div className="fw-600 text-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {item.itemName}
                                                    {/* 👇 NEW: Quantity Badge 👇 */}
                                                    <span style={{ padding: '2px 6px', background: '#f1f5f9', color: '#475569', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #cbd5e1' }}>
                                                        Qty: {item.quantity || 1}
                                                    </span>
                                                </div>
                                                {item.notes && (
                                                    <div className="text-small text-muted" style={{ marginTop: '4px', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {item.notes}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    
                                    <td data-label="Status">
                                        {getStatusBadge(item.status)}
                                    </td>
                                    
                                    <td data-label="Location / Assignment">
                                        {item.status === 'Available' && (
                                            <div className="text-small">
                                                <strong>Location:</strong><br/>
                                                <span className="text-muted">{item.storageLocation || 'Not specified'}</span>
                                            </div>
                                        )}
                                        {item.status === 'Assigned' && (
                                            <div className="text-small">
                                                <strong>Assigned To:</strong><br/>
                                                <span className="text-primary">{item.assignedTo?.name || 'Unknown'}</span>
                                            </div>
                                        )}
                                        {['Damaged', 'Lost'].includes(item.status) && (
                                            <span className="text-muted italic">-</span>
                                        )}
                                    </td>

                                    <td data-label="Date Added">
                                        <div className="text-small text-muted">{new Date(item.createdAt).toLocaleDateString()}</div>
                                    </td>
                                    
                                    <td data-label="Action">
                                        <button className="gts-btn primary btn-small" onClick={() => navigate(`/edit-inventory/${item._id}`)}>
                                            <FontAwesomeIcon icon={faEdit} className="btn-icon" /> View / Edit
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

export default Inventory;