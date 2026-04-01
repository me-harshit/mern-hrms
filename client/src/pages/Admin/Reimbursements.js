import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import api, { SERVER_URL } from '../../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWallet, faRupeeSign, faSpinner, faCheckCircle, faTimes, faListCheck, faHistory, faEye, faFileInvoice } from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression';
import '../../styles/App.css';

const Reimbursements = () => {
    // 👇 NEW: Tab State
    const [activeTab, setActiveTab] = useState('Pending'); // 'Pending' or 'History'
    
    const [wallets, setWallets] = useState([]);
    const [history, setHistory] = useState([]); // 👇 NEW: State for History
    const [loading, setLoading] = useState(true);
    
    // State for the Settlement Panel
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [settleNotes, setSettleNotes] = useState('');
    const [proofFile, setProofFile] = useState(null);
    const [isCompressing, setIsCompressing] = useState(false);
    const [processing, setProcessing] = useState(false);

    // State for Itemized Unpaid Expenses
    const [unpaidExpenses, setUnpaidExpenses] = useState([]);
    const [selectedExpenseIds, setSelectedExpenseIds] = useState([]);
    const [loadingUnpaid, setLoadingUnpaid] = useState(false);

    // 👇 NEW: State for History Sidebar
    const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

    const fetchNegativeWallets = async () => {
        try {
            setLoading(true);
            const res = await api.get('/reimbursements/negative-balances');
            setWallets(res.data);
        } catch (err) {
            Swal.fire('Error', 'Failed to load pending reimbursements', 'error');
        } finally {
            setLoading(false);
        }
    };

    // 👇 NEW: Fetch History Function
    const fetchHistory = async () => {
        try {
            setLoading(true);
            const res = await api.get('/reimbursements/history');
            setHistory(res.data);
        } catch (err) {
            Swal.fire('Error', 'Failed to load payout history', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Fetch data based on active tab
    useEffect(() => {
        if (activeTab === 'Pending') {
            fetchNegativeWallets();
        } else {
            fetchHistory();
        }
    }, [activeTab]);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsCompressing(true);
        const isImage = file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|heic|heif)$/i);

        if (isImage) {
            try {
                const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: false, fileType: 'image/jpeg' };
                const compressedBlob = await imageCompression(file, options);
                const safeName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                const safelyNamedFile = new File([compressedBlob], safeName, { type: 'image/jpeg', lastModified: Date.now() });
                setProofFile(safelyNamedFile);
            } catch (error) {
                console.error("Compression failed:", error);
                setProofFile(file);
            }
        } else {
            setProofFile(file);
        }
        setIsCompressing(false);
    };

    const handleSelectEmployee = async (wallet) => {
        setSelectedEmployee(wallet);
        setSettleNotes('');
        setProofFile(null);
        setUnpaidExpenses([]);
        setSelectedExpenseIds([]);
        window.scrollTo({ top: 0, behavior: 'smooth' });

        setLoadingUnpaid(true);
        try {
            const res = await api.get(`/reimbursements/unpaid/${wallet.userId._id}`);
            setUnpaidExpenses(res.data);
            setSelectedExpenseIds(res.data.map(exp => exp._id));
        } catch (err) {
            Swal.fire('Error', 'Failed to load specific unpaid expenses.', 'error');
            setSelectedEmployee(null);
        } finally {
            setLoadingUnpaid(false);
        }
    };

    const toggleExpense = (id) => {
        setSelectedExpenseIds(prev => 
            prev.includes(id) ? prev.filter(eId => eId !== id) : [...prev, id]
        );
    };

    const toggleAllExpenses = () => {
        if (selectedExpenseIds.length === unpaidExpenses.length) {
            setSelectedExpenseIds([]); 
        } else {
            setSelectedExpenseIds(unpaidExpenses.map(exp => exp._id)); 
        }
    };

    const calculatedTotal = unpaidExpenses
        .filter(exp => selectedExpenseIds.includes(exp._id))
        .reduce((sum, exp) => sum + exp.amount, 0);

    const handleSettle = async (e) => {
        e.preventDefault();
        
        if (selectedExpenseIds.length === 0) {
            return Swal.fire('Missing Items', 'Please check at least one receipt to reimburse.', 'warning');
        }

        setProcessing(true);
        try {
            const data = new FormData();
            data.append('targetUserId', selectedEmployee.userId._id);
            data.append('notes', settleNotes);
            data.append('expenseIds', JSON.stringify(selectedExpenseIds)); 
            if (proofFile) data.append('proofDocument', proofFile);

            await api.post('/reimbursements/settle', data, { headers: { 'Content-Type': 'multipart/form-data' } });

            Swal.fire({ icon: 'success', title: 'Settlement Processed!', timer: 1500, showConfirmButton: false });
            
            setSelectedEmployee(null);
            setSettleNotes('');
            setProofFile(null);
            setUnpaidExpenses([]);
            setSelectedExpenseIds([]);
            fetchNegativeWallets();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Failed to process settlement', 'error');
        } finally {
            setProcessing(false);
        }
    };

    // --- UI HELPERS FOR HISTORY ---
    const getFileUrl = (url) => {
        if (!url) return '';
        return url.startsWith('http') ? url : `${SERVER_URL}${url}`;
    };

    const viewFile = (fileData, title) => {
        const fullUrl = getFileUrl(fileData);
        const isPdf = fileData.toLowerCase().endsWith('.pdf');
        if (isPdf) { Swal.fire({ title: title, html: `<iframe src="${fullUrl}" width="100%" height="500px" style="border: none; border-radius: 8px;"></iframe>`, width: '800px', showCloseButton: true, showConfirmButton: false }); }
        else { Swal.fire({ title: title, imageUrl: fullUrl, imageAlt: title, width: '800px', showCloseButton: true, showConfirmButton: false }); }
    };

    return (
        <div className="profile-container fade-in">
            <div className="page-header-left mb-20">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faWallet} className="btn-icon text-primary" /> Corporate Reimbursements
                </h1>
                <p className="text-muted" style={{ marginTop: '5px' }}>Manage employee debts and view payout history.</p>
            </div>

            {/* 👇 NEW: Tab Navigation */}
            <div className="filter-buttons mb-20" style={{ display: 'flex', gap: '10px' }}>
                <button 
                    className={`gts-btn filter-btn ${activeTab === 'Pending' ? 'primary active' : 'warning inactive'}`} 
                    onClick={() => { setActiveTab('Pending'); setSelectedHistoryItem(null); }}
                >
                    <FontAwesomeIcon icon={faListCheck} /> Pending Payouts
                </button>
                <button 
                    className={`gts-btn filter-btn ${activeTab === 'History' ? 'primary active' : 'warning inactive'}`} 
                    onClick={() => { setActiveTab('History'); setSelectedEmployee(null); }}
                >
                    <FontAwesomeIcon icon={faHistory} /> Payout History
                </button>
            </div>

            {/* ==========================================
                TAB 1: PENDING PAYOUTS
            ========================================== */}
            {activeTab === 'Pending' && (
                <>
                    {/* SETTLEMENT ACTION PANEL */}
                    {selectedEmployee && (
                        <div className="expense-form-card mb-30 fade-in" style={{ border: '2px solid #3b82f6', background: '#eff6ff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <h3 style={{ margin: 0, color: '#1e3a8a' }}>
                                    Settling Balance for {selectedEmployee.userId.name}
                                </h3>
                                <button className="gts-btn danger btn-small m-0" onClick={() => setSelectedEmployee(null)}>
                                    <FontAwesomeIcon icon={faTimes} /> Cancel
                                </button>
                            </div>
                            
                            <div style={{ background: 'white', padding: '10px 15px', borderRadius: '6px', marginBottom: '15px', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Total Wallet Debt: <strong style={{ color: '#dc2626' }}>₹{Math.abs(selectedEmployee.balance)}</strong></span>
                                <span>Selected for Payout: <strong style={{ color: '#16a34a', fontSize: '18px' }}>₹{calculatedTotal.toLocaleString('en-IN')}</strong></span>
                            </div>

                            <form onSubmit={handleSettle}>
                                <div className="form-group mb-20">
                                    <label className="input-label" style={{ borderBottom: '1px solid #bfdbfe', paddingBottom: '10px', marginBottom: '10px', color: '#1e3a8a' }}>
                                        <FontAwesomeIcon icon={faListCheck} /> Select Approved Receipts to Reimburse
                                    </label>
                                    
                                    {loadingUnpaid ? (
                                        <div style={{ padding: '20px', textAlign: 'center', color: '#3b82f6' }}>
                                            <FontAwesomeIcon icon={faSpinner} spin size="lg" /> Loading receipts...
                                        </div>
                                    ) : unpaidExpenses.length === 0 ? (
                                        <div style={{ padding: '15px', background: '#fff', borderRadius: '6px', color: '#dc2626' }}>
                                            No pending receipts found. This debt may be from manual wallet adjustments.
                                        </div>
                                    ) : (
                                        <div style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: '6px', overflow: 'hidden' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                                                <thead>
                                                    <tr style={{ background: '#dbeafe', borderBottom: '1px solid #bfdbfe' }}>
                                                        <th style={{ padding: '10px', width: '40px', textAlign: 'center' }}>
                                                            <input type="checkbox" style={{ cursor: 'pointer' }} checked={selectedExpenseIds.length === unpaidExpenses.length} onChange={toggleAllExpenses} />
                                                        </th>
                                                        <th style={{ padding: '10px', color: '#1e3a8a' }}>Date</th>
                                                        <th style={{ padding: '10px', color: '#1e3a8a' }}>Category</th>
                                                        <th style={{ padding: '10px', color: '#1e3a8a' }}>Project</th>
                                                        <th style={{ padding: '10px', color: '#1e3a8a', textAlign: 'right' }}>Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {unpaidExpenses.map(exp => (
                                                        <tr key={exp._id} style={{ borderBottom: '1px solid #e2e8f0', background: selectedExpenseIds.includes(exp._id) ? '#f0fdf4' : '#fff' }}>
                                                            <td style={{ padding: '10px', textAlign: 'center' }}>
                                                                <input type="checkbox" style={{ cursor: 'pointer' }} checked={selectedExpenseIds.includes(exp._id)} onChange={() => toggleExpense(exp._id)} />
                                                            </td>
                                                            <td style={{ padding: '10px' }}>{new Date(exp.expenseDate).toLocaleDateString()}</td>
                                                            <td style={{ padding: '10px', fontWeight: '600' }}>{exp.category}</td>
                                                            <td style={{ padding: '10px', color: '#64748b' }}>{exp.projectName || '-'}</td>
                                                            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>₹{exp.amount.toLocaleString('en-IN')}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                <div className="expense-grid">
                                    <div className="form-group">
                                        <label className="input-label">Notes / UTR (Optional)</label>
                                        <input className="custom-input" type="text" value={settleNotes} onChange={e => setSettleNotes(e.target.value)} placeholder="e.g. Cleared pending flights (UTR: 123456789)" />
                                    </div>

                                    <div className="form-group expense-file-area">
                                        <label className="input-label" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '10px' }}>
                                            Upload Bank Proof / Screenshot (Optional)
                                        </label>
                                        <input className="custom-file-input" type="file" accept="image/*,application/pdf" capture="environment" onChange={handleFileChange} />
                                        {isCompressing ? (
                                            <p className="file-success-text" style={{ color: '#d97706' }}><FontAwesomeIcon icon={faSpinner} spin /> Compressing...</p>
                                        ) : proofFile && (
                                            <p className="file-success-text"><FontAwesomeIcon icon={faCheckCircle} /> Ready: {proofFile.name}</p>
                                        )}
                                    </div>

                                    <div className="form-group grid-span-2">
                                        <button type="submit" className="save-btn purchase-submit-btn m-0" disabled={processing || isCompressing || selectedExpenseIds.length === 0}>
                                            {processing ? 'Processing Transfer...' : `Confirm Transfer of ₹${calculatedTotal.toLocaleString('en-IN')}`}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* TABLE VIEW */}
                    <div className="employee-table-container fade-in">
                        <table className="employee-table">
                            <thead>
                                <tr>
                                    <th>Employee Name</th>
                                    <th>Employee ID</th>
                                    <th>Current Balance</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="4" className="empty-table-message">Loading balances...</td></tr>
                                ) : wallets.length === 0 ? (
                                    <tr><td colSpan="4" className="empty-table-message">All clear! No employees are owed money.</td></tr>
                                ) : (
                                    wallets.map(wallet => (
                                        <tr key={wallet._id} style={{ background: selectedEmployee?.userId?._id === wallet.userId?._id ? '#eff6ff' : 'transparent' }}>
                                            <td data-label="Employee Name" className="fw-600 text-primary">{wallet.userId?.name}</td>
                                            <td data-label="Employee ID">{wallet.userId?.employeeId || 'N/A'}</td>
                                            <td data-label="Current Balance" style={{ color: '#dc2626', fontWeight: 'bold' }}>
                                                - ₹{Math.abs(wallet.balance).toLocaleString('en-IN')}
                                            </td>
                                            <td data-label="Action">
                                                <button className="gts-btn success btn-small" onClick={() => handleSelectEmployee(wallet)}>
                                                    <FontAwesomeIcon icon={faRupeeSign} /> Settle Debt
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* ==========================================
                TAB 2: PAYOUT HISTORY
            ========================================== */}
            {activeTab === 'History' && (
                <div className="employee-table-container fade-in">
                    <table className="employee-table">
                        <thead>
                            <tr>
                                <th>Date Paid</th>
                                <th>Paid To (Employee)</th>
                                <th>Amount Paid</th>
                                <th>Processed By</th>
                                <th>Proof / Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" className="empty-table-message">Loading history...</td></tr>
                            ) : history.length === 0 ? (
                                <tr><td colSpan="5" className="empty-table-message">No payout history found.</td></tr>
                            ) : (
                                history.map(txn => (
                                    <tr key={txn._id}>
                                        <td data-label="Date Paid">
                                            <div className="fw-600">{new Date(txn.createdAt).toLocaleDateString()}</div>
                                            <div className="text-small text-muted">{new Date(txn.createdAt).toLocaleTimeString()}</div>
                                        </td>
                                        <td data-label="Paid To">
                                            <div className="fw-bold text-primary">{txn.userId?.name}</div>
                                            <div className="text-small text-muted">{txn.userId?.employeeId || 'N/A'}</div>
                                        </td>
                                        <td data-label="Amount Paid" style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '15px' }}>
                                            ₹{txn.amount.toLocaleString('en-IN')}
                                        </td>
                                        <td data-label="Processed By">
                                            <div className="text-small">{txn.performedBy?.name || 'System'}</div>
                                        </td>
                                        <td data-label="Proof / Details">
                                            <div className="flex-row gap-5">
                                                <button 
                                                    className="gts-btn primary btn-small m-0" 
                                                    onClick={() => setSelectedHistoryItem(txn)}
                                                >
                                                    <FontAwesomeIcon icon={faEye} /> View Items
                                                </button>
                                                {txn.attachmentUrl && (
                                                    <button 
                                                        className="gts-btn doc-btn doc-proof m-0" 
                                                        onClick={() => viewFile(txn.attachmentUrl, 'Bank Transfer Proof')}
                                                        title="View Bank Screenshot"
                                                    >
                                                        <FontAwesomeIcon icon={faFileInvoice} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ==========================================
                HISTORY SIDEBAR (SLIDES OUT ON "VIEW ITEMS")
            ========================================== */}
            <div className={`sidebar-overlay ${selectedHistoryItem ? 'open' : ''}`} onClick={() => setSelectedHistoryItem(null)}></div>
            <div className={`expense-detail-sidebar ${selectedHistoryItem ? 'open' : ''}`}>
                {selectedHistoryItem && (
                    <>
                        <div className="sidebar-header">
                            <div>
                                <h2 className="sidebar-title">Reimbursement Details</h2>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>{new Date(selectedHistoryItem.createdAt).toLocaleString()}</div>
                            </div>
                            <button className="sidebar-close-btn" onClick={() => setSelectedHistoryItem(null)}>
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>

                        <div className="sidebar-content">
                            <div className="detail-grid-2 mb-20">
                                <div className="detail-group">
                                    <span className="detail-label">Paid To</span>
                                    <span className="detail-value fw-600 text-primary">{selectedHistoryItem.userId?.name}</span>
                                </div>
                                <div className="detail-group">
                                    <span className="detail-label">Total Amount</span>
                                    <span className="detail-value fw-bold text-green">₹ {selectedHistoryItem.amount.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="detail-group" style={{ gridColumn: 'span 2' }}>
                                    <span className="detail-label">HR Notes / UTR</span>
                                    <span className="detail-value">{selectedHistoryItem.description}</span>
                                </div>
                            </div>

                            <h3 className="sidebar-section-title">Covered Receipts ({selectedHistoryItem.linkedExpenseIds?.length || 0})</h3>
                            
                            {selectedHistoryItem.linkedExpenseIds && selectedHistoryItem.linkedExpenseIds.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {selectedHistoryItem.linkedExpenseIds.map(exp => (
                                        <div key={exp._id} style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <strong style={{ color: '#0f172a' }}>{exp.category}</strong>
                                                <strong style={{ color: '#16a34a' }}>₹{exp.amount?.toLocaleString('en-IN')}</strong>
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>{exp.projectName || 'Regular Office'}</span>
                                                <span>{new Date(exp.expenseDate).toLocaleDateString()}</span>
                                            </div>
                                            {exp.descriptionTags && (
                                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px', fontStyle: 'italic' }}>
                                                    "{exp.descriptionTags}"
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted text-small">This was a manual wallet adjustment with no linked receipts.</p>
                            )}
                        </div>
                    </>
                )}
            </div>

        </div>
    );
};

export default Reimbursements;