import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api, { SERVER_URL } from '../../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faBoxes, faPlus, faSearch, faFilter, faCheckCircle, 
    faUserCheck, faExclamationTriangle, faBan, faEdit, faTags 
} from '@fortawesome/free-solid-svg-icons';
import Pagination from '../../components/Pagination';
import '../../styles/App.css';
import '../../styles/expenses.css'; 

const Inventory = () => {
    const navigate = useNavigate();
    
    const [inventory, setInventory] = useState([]);
    const [stats, setStats] = useState({ totalQty: 0, available: 0, assigned: 0, issues: 0 });
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const [systemSettings, setSystemSettings] = useState({
        inventoryCatAThreshold: 500,
        inventoryCatBThreshold: 100
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    
    // 👇 NEW: State for Category Filtering
    const [categoryFilter, setCategoryFilter] = useState('All');

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const settingsRes = await api.get('/settings').catch(() => ({ data: {} }));
                if (settingsRes.data) {
                    setSystemSettings({
                        inventoryCatAThreshold: settingsRes.data.inventoryCatAThreshold || 500,
                        inventoryCatBThreshold: settingsRes.data.inventoryCatBThreshold || 100
                    });
                }
            } catch (err) {
                console.error("Failed to load settings");
            }
        };
        fetchSettings();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // 👇 UPDATED: Reset to page 1 if category filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [statusFilter, categoryFilter, debouncedSearch]);

    // 👇 UPDATED: Include categoryFilter in dependency array
    useEffect(() => {
        fetchInventory(currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, itemsPerPage, statusFilter, categoryFilter, debouncedSearch]);

    const fetchInventory = async (pageToFetch) => {
        setLoading(true);
        try {
            // 👇 UPDATED: Pass category parameter to backend
            const params = {
                page: pageToFetch,
                limit: itemsPerPage,
                search: debouncedSearch,
                status: statusFilter,
                category: categoryFilter
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

    const getCategoryBadge = (price) => {
        if (!price && price !== 0) {
            return <span style={{ padding: '2px 6px', background: '#dcfce7', color: '#16a34a', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #86efac' }}><FontAwesomeIcon icon={faTags} /> Cat C</span>;
        }
        
        if (price >= systemSettings.inventoryCatAThreshold) {
            return <span style={{ padding: '2px 6px', background: '#fee2e2', color: '#dc2626', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #fca5a5' }}><FontAwesomeIcon icon={faTags} /> Cat A</span>;
        } else if (price >= systemSettings.inventoryCatBThreshold) {
            return <span style={{ padding: '2px 6px', background: '#fef3c7', color: '#d97706', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #fcd34d' }}><FontAwesomeIcon icon={faTags} /> Cat B</span>;
        } else {
            return <span style={{ padding: '2px 6px', background: '#dcfce7', color: '#16a34a', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #86efac' }}><FontAwesomeIcon icon={faTags} /> Cat C</span>;
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
            Swal.fire({ title, html: `<video src="${fullUrl}" controls style="width:100%; border-radius:6px; max-height:350px; background:#000;"></video>`, width: '500px', showCloseButton: true, showConfirmButton: false });
        } else if (isPdf) {
            Swal.fire({ title, html: `<iframe src="${fullUrl}" width="100%" height="400px" style="border: none; border-radius: 6px;"></iframe>`, width: '600px', showCloseButton: true, showConfirmButton: false });
        } else {
            Swal.fire({ title, html: `<img src="${fullUrl}" style="width:100%; max-height: 350px; object-fit: contain; border-radius: 6px;" alt="${title}" />`, width: '450px', showCloseButton: true, showConfirmButton: false });
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

            <div className="stats-grid" style={{ marginBottom: '20px' }}>
                <div className="stat-card theme-blue">
                    <div className="stat-info"><p>Total Assets</p><h3>{stats.totalQty}</h3></div>
                </div>
                <div className="stat-card theme-green">
                    <div className="stat-info"><p>Available in Stock</p><h3>{stats.available}</h3></div>
                </div>
                <div className="stat-card theme-purple">
                    <div className="stat-info"><p>Assigned to Staff</p><h3>{stats.assigned}</h3></div>
                </div>
                <div className="stat-card theme-red">
                    <div className="stat-info"><p>Damaged / Lost</p><h3>{stats.issues}</h3></div>
                </div>
            </div>

            <div className="filter-bar-card fade-in">
                <div className="filter-buttons">
                    {['All', 'Available', 'Assigned', 'Damaged', 'Lost'].map(status => (
                        <button key={status} className={`gts-btn filter-btn ${statusFilter === status ? 'primary active' : 'warning inactive'}`} onClick={() => setStatusFilter(status)}>
                            {status === 'All' && <FontAwesomeIcon icon={faFilter} className="filter-icon" />} {status}
                        </button>
                    ))}
                </div>
                
                {/* 👇 NEW: Category Dropdown & Search Wrapper */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select 
                        className="swal2-select custom-select m-0" 
                        style={{ padding: '8px 12px', fontSize: '13px', width: 'auto', minWidth: '150px' }}
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        <option value="All">All Categories</option>
                        <option value="Cat A">Cat A (Expensive)</option>
                        <option value="Cat B">Cat B (Mid-Tier)</option>
                        <option value="Cat C">Cat C (Low Cost / Unpriced)</option>
                    </select>

                    <div className="search-wrapper">
                        <FontAwesomeIcon icon={faSearch} className="search-icon" />
                        <input type="text" placeholder="Search items, locations, employees..." className="swal2-input search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </div>
            </div>

            <div className="employee-table-container fade-in">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Item Name & Qty</th>
                            <th>Cost / Unit</th>
                            <th>Status</th>
                            <th>Location / Assignment</th>
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
                                                    style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', cursor: 'pointer', border: '1px solid #e2e8f0', transition: 'transform 0.2s' }} 
                                                    onClick={() => viewSingleFile(item.mediaUrls[0], item.itemName)}
                                                    title="Click to view image"
                                                    onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                                    onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
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

                                    <td data-label="Cost / Unit">
                                        {item.price ? (
                                            <div>
                                                <div className="fw-bold text-dark-gray" style={{ fontSize: '14px', marginBottom: '4px' }}>
                                                    ₹ {item.price.toLocaleString('en-IN')}
                                                </div>
                                                {getCategoryBadge(item.price)}
                                            </div>
                                        ) : (
                                            <div>
                                                <span className="text-muted italic text-small" style={{ display: 'block', marginBottom: '4px' }}>Not Recorded</span>
                                                {getCategoryBadge(null)}
                                            </div>
                                        )}
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