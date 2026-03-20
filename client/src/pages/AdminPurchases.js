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

    const viewFile = (url, title) => {
        const fullUrl = `${SERVER_URL}${url}`;
        const isPdf = url.toLowerCase().endsWith('.pdf');
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
            <h1 className="page-title">
                <FontAwesomeIcon icon={faBoxOpen} style={{ marginRight: '10px' }} />
                All Company Purchases
            </h1>

            <div className="control-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '20px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
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

                {filterType === 'Custom' && (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '5px 15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>From:</span>
                            <input type="date" className="swal2-input" style={{ margin: 0, height: '35px', width: '130px' }} value={customDates.from} onChange={(e) => setCustomDates({ ...customDates, from: e.target.value })} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>To:</span>
                            <input type="date" className="swal2-input" style={{ margin: 0, height: '35px', width: '130px' }} value={customDates.to} onChange={(e) => setCustomDates({ ...customDates, to: e.target.value })} />
                        </div>
                    </div>
                )}

                <div style={{ position: 'relative', minWidth: '250px' }}>
                    <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
                    <input type="text" placeholder="Search item, status, employee..." className="swal2-input" style={{ margin: 0, paddingLeft: '40px', width: '100%', height: '40px' }} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
            </div>

            <div style={{ marginBottom: '20px', fontSize: '15px', fontWeight: '600', color: '#475569', display: 'flex', justifyContent: 'flex-end' }}>
                Showing {filteredPurchases.length} records &nbsp;|&nbsp; Total Value: <span style={{ color: '#e67e22', marginLeft: '5px' }}>₹ {totalFilteredAmount.toLocaleString('en-IN')}</span>
            </div>

            <div className="employee-table-container">
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
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>Loading...</td></tr>
                        ) : filteredPurchases.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#888' }}>No records found.</td></tr>
                        ) : (
                            filteredPurchases.map(item => (
                                <tr key={item._id}>
                                    <td data-label="Employee">
                                        <div style={{ fontWeight: 'bold', color: '#215D7B' }}>{item.purchasedBy?.name || 'Unknown'}</div>
                                        <div style={{ fontSize: '11px', color: '#777' }}>{item.purchasedBy?.employeeId || '-'}</div>
                                    </td>
                                    <td data-label="Item & Date">
                                        <div style={{ fontWeight: '600' }}>{item.itemName} <span style={{fontSize:'12px', color:'#888'}}>(x{item.quantity})</span></div>
                                        <div style={{ fontSize: '12px', color: '#777' }}>{new Date(item.purchaseDate).toLocaleDateString()}</div>
                                    </td>
                                    <td data-label="Project"><div>{item.projectName || '-'}</div></td>
                                    <td data-label="Amount"><div className="purchase-card-amount">₹ {item.amount.toLocaleString('en-IN')}</div></td>
                                    <td data-label="Location/Status">
                                        <div>
                                            <div style={{ fontSize: '13px', color: '#555' }}><FontAwesomeIcon icon={faMapMarkerAlt} style={{ color: '#e67e22' }} /> {item.storageLocation || 'Unassigned'}</div>
                                            <span className={`status-badge ${item.inventoryStatus === 'Available' ? 'success' : item.inventoryStatus === 'In Use' ? 'warning' : 'danger'}`}>{item.inventoryStatus}</span>
                                        </div>
                                    </td>
                                    
                                    {/* --- UPDATED DOCUMENTS SECTION --- */}
                                    <td data-label="Documents">
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {item.invoiceUrl ? (
                                                <button 
                                                    onClick={() => viewFile(item.invoiceUrl, 'Invoice Document')} 
                                                    className="gts-btn" 
                                                    style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#f1f5f9', color: '#215D7B', border: '1px solid #cbd5e1' }}
                                                >
                                                    <FontAwesomeIcon icon={faFileInvoice} style={{ marginRight: '4px' }}/> Invoice
                                                </button>
                                            ) : <span style={{ color: '#ccc', fontSize: '12px' }}>No Invoice</span>}

                                            {item.paymentScreenshotUrl ? (
                                                <button 
                                                    onClick={() => viewFile(item.paymentScreenshotUrl, 'Payment Screenshot')} 
                                                    className="gts-btn"
                                                    style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#fdf4ff', color: '#8e44ad', border: '1px solid #f0abfc' }}
                                                >
                                                    <FontAwesomeIcon icon={faImage} style={{ marginRight: '4px' }}/> Proof
                                                </button>
                                            ) : null}

                                            {item.productMediaUrl ? (
                                                <button 
                                                    onClick={() => viewFile(item.productMediaUrl, 'Product Media')} 
                                                    className="gts-btn"
                                                    style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #6ee7b7' }}
                                                >
                                                    <FontAwesomeIcon icon={faBoxOpen} style={{ marginRight: '4px' }}/> Media
                                                </button>
                                            ) : null}
                                        </div>
                                    </td>
                                    
                                    <td data-label="Action">
                                        <button className="gts-btn primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleEditInventory(item)}>
                                            <FontAwesomeIcon icon={faEdit} style={{ marginRight: '5px' }} /> Edit
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