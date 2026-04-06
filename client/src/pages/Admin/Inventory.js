import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api, { SERVER_URL } from '../../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faBoxes, faPlus, faSearch, faFilter, faCheckCircle, 
    faUserCheck, faExclamationTriangle, faBan, faEdit 
} from '@fortawesome/free-solid-svg-icons';
import Pagination from '../../components/Pagination'; // 👇 NEW
import '../../styles/App.css';
import '../../styles/expenses.css'; 

const Inventory = () => {
    const navigate = useNavigate();
    
    // --- DATA & PAGINATION STATES ---
    const [inventory, setInventory] = useState([]);
    const [stats, setStats] = useState({ totalQty: 0, available: 0, assigned: 0, issues: 0 });
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // --- FILTERS STATE ---
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    // 1. Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // 2. Reset to Page 1 if filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [statusFilter, debouncedSearch]);

    // 3. Fetch Data
    useEffect(() => {
        fetchInventory(currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, itemsPerPage, statusFilter, debouncedSearch]);

    const fetchInventory = async (pageToFetch) => {
        setLoading(true);
        try {
            const params = {
                page: pageToFetch,
                limit: itemsPerPage,
                search: debouncedSearch,
                status: statusFilter
            };
            const res = await api.get('/inventory', { params });
            
            setInventory(res.data.data);
            setStats(res.data.stats);
            setTotalPages(res.data.pagination.totalPages);
            setTotalRecords(res.data.pagination.totalRecords);
            setCurrentPage(res.data.pagination.currentPage);
        } catch (err) {
            Swal.fire('Error', 'Failed to load inventory', 'error');
        } finally {
            setLoading(false);
        }
    };

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

    const viewSingleFile = (url, title) => {
        const fullUrl = getFileUrl(url);
        const isVideo = url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/);
        const isPdf = url.toLowerCase().endsWith('.pdf');

        if (isVideo) {
            Swal.fire({ 
                title, 
                html: `<video src="${fullUrl}" controls style="width:100%; border-radius:6px; max-height:350px; background:#000;"></video>`, 
                width: '500px', 
                showCloseButton: true, 
                showConfirmButton: false 
            });
        } else if (isPdf) {
            Swal.fire({ 
                title, 
                html: `<iframe src="${fullUrl}" width="100%" height="400px" style="border: none; border-radius: 6px;"></iframe>`, 
                width: '600px', 
                showCloseButton: true, 
                showConfirmButton: false 
            });
        } else {
            Swal.fire({ 
                title, 
                html: `<img src="${fullUrl}" style="width:100%; max-height: 350px; object-fit: contain; border-radius: 6px;" alt="${title}" />`,
                width: '450px', 
                showCloseButton: true, 
                showConfirmButton: false 
            });
        }
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
                        <h3>{stats.totalQty}</h3>
                    </div>
                </div>
                <div className="stat-card theme-green">
                    <div className="stat-info">
                        <p>Available in Stock</p>
                        <h3>{stats.available}</h3>
                    </div>
                </div>
                <div className="stat-card theme-purple">
                    <div className="stat-info">
                        <p>Assigned to Staff</p>
                        <h3>{stats.assigned}</h3>
                    </div>
                </div>
                <div className="stat-card theme-red">
                    <div className="stat-info">
                        <p>Damaged / Lost</p>
                        <h3>{stats.issues}</h3>
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
                        ) : inventory.length === 0 ? (
                            <tr><td colSpan="5" className="empty-table-message">No assets found.</td></tr>
                        ) : (
                            inventory.map(item => (
                                <tr key={item._id}>
                                    <td data-label="Item Name & Qty">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                            {item.mediaUrls && item.mediaUrls.length > 0 ? (
                                                <img 
                                                    src={getFileUrl(item.mediaUrls[0])} 
                                                    alt="asset" 
                                                    style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', cursor: 'pointer', border: '1px solid #e2e8f0' }} 
                                                    onClick={() => viewSingleFile(item.mediaUrls[0], item.itemName)}
                                                />
                                            ) : (
                                                <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <FontAwesomeIcon icon={faBoxes} style={{ color: '#94a3b8' }} />
                                                </div>
                                            )}
                                            <div>
                                                <div className="fw-600 text-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {item.itemName}
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

            {/* 👇 Modular Pagination Component */}
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

export default Inventory;