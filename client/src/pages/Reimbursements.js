import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWallet, faRupeeSign, faSpinner, faCheckCircle, faTimes } from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression';
import '../styles/App.css';

const Reimbursements = () => {
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // State for the Settlement Panel
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [settleAmount, setSettleAmount] = useState('');
    const [settleNotes, setSettleNotes] = useState('');
    const [proofFile, setProofFile] = useState(null);
    const [isCompressing, setIsCompressing] = useState(false);
    const [processing, setProcessing] = useState(false);

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

    useEffect(() => {
        fetchNegativeWallets();
    }, []);

    // Reusing the bulletproof mobile compression logic!
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
            setProofFile(file); // PDFs pass through
        }
        setIsCompressing(false);
    };

    const handleSettle = async (e) => {
        e.preventDefault();
        if (!settleAmount || settleAmount <= 0) return Swal.fire('Error', 'Please enter a valid amount', 'warning');
        
        // Prevent paying more than owed
        const maxOwed = Math.abs(selectedEmployee.balance);
        if (parseFloat(settleAmount) > maxOwed) {
            return Swal.fire('Amount Too High', `You cannot reimburse more than ₹${maxOwed}`, 'warning');
        }

        setProcessing(true);
        try {
            const data = new FormData();
            data.append('targetUserId', selectedEmployee.userId._id);
            data.append('amount', settleAmount);
            data.append('notes', settleNotes);
            if (proofFile) data.append('proofDocument', proofFile);

            await api.post('/reimbursements/settle', data, { headers: { 'Content-Type': 'multipart/form-data' } });

            Swal.fire({ icon: 'success', title: 'Settlement Processed!', timer: 1500, showConfirmButton: false });
            
            // Reset form & refresh table
            setSelectedEmployee(null);
            setSettleAmount('');
            setSettleNotes('');
            setProofFile(null);
            fetchNegativeWallets();
        } catch (err) {
            Swal.fire('Error', 'Failed to process settlement', 'error');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="profile-container fade-in">
            <div className="page-header-left mb-20">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faWallet} className="btn-icon text-primary" /> Pending Reimbursements
                </h1>
                <p className="text-muted" style={{ marginTop: '5px' }}>Employees with negative wallet balances awaiting payout.</p>
            </div>

            {/* --- SETTLEMENT ACTION PANEL --- */}
            {selectedEmployee && (
                <div className="expense-form-card mb-30" style={{ border: '2px solid #3b82f6', background: '#eff6ff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h3 style={{ margin: 0, color: '#1e3a8a' }}>
                            Settling Balance for {selectedEmployee.userId.name}
                        </h3>
                        <button className="gts-btn danger btn-small m-0" onClick={() => setSelectedEmployee(null)}>
                            <FontAwesomeIcon icon={faTimes} /> Cancel
                        </button>
                    </div>
                    
                    <div style={{ background: 'white', padding: '10px 15px', borderRadius: '6px', marginBottom: '15px', color: '#dc2626', fontWeight: 'bold' }}>
                        Total Amount Owed: ₹{Math.abs(selectedEmployee.balance)}
                    </div>

                    <form onSubmit={handleSettle} className="expense-grid">
                        <div className="form-group">
                            <label className="input-label">Amount to Pay (₹) *</label>
                            <input 
                                className="custom-input" type="number" step="0.01" required 
                                max={Math.abs(selectedEmployee.balance)}
                                value={settleAmount} 
                                onChange={e => setSettleAmount(e.target.value)} 
                                placeholder={`Max: ${Math.abs(selectedEmployee.balance)}`}
                            />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Notes / UTR</label>
                            <input className="custom-input" type="text" value={settleNotes} onChange={e => setSettleNotes(e.target.value)} placeholder="e.g. Cleared pending flights" />
                        </div>

                        <div className="form-group grid-span-2 expense-file-area">
                            <label className="input-label" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '10px' }}>
                                Upload Bank Proof / Screenshot (Optional)
                            </label>
                            <input 
                                className="custom-file-input" type="file" accept="image/*,application/pdf" capture="environment"
                                onChange={handleFileChange} 
                            />
                            {isCompressing ? (
                                <p className="file-success-text" style={{ color: '#d97706' }}><FontAwesomeIcon icon={faSpinner} spin /> Compressing...</p>
                            ) : proofFile && (
                                <p className="file-success-text"><FontAwesomeIcon icon={faCheckCircle} /> Ready: {proofFile.name}</p>
                            )}
                        </div>

                        <div className="form-group grid-span-2">
                            <button type="submit" className="save-btn purchase-submit-btn m-0" disabled={processing || isCompressing}>
                                {processing ? 'Processing Transfer...' : `Confirm Transfer of ₹${settleAmount || '0'}`}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* --- TABLE VIEW --- */}
            <div className="employee-table-container">
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
                                <tr key={wallet._id} style={{ background: selectedEmployee?._id === wallet._id ? '#f1f5f9' : 'transparent' }}>
                                    <td data-label="Employee Name" className="fw-600 text-primary">{wallet.userId?.name}</td>
                                    <td data-label="Employee ID">{wallet.userId?.employeeId || 'N/A'}</td>
                                    <td data-label="Current Balance" style={{ color: '#dc2626', fontWeight: 'bold' }}>
                                        - ₹{Math.abs(wallet.balance)}
                                    </td>
                                    <td data-label="Action">
                                        <button 
                                            className="gts-btn success btn-small" 
                                            onClick={() => {
                                                setSelectedEmployee(wallet);
                                                setSettleAmount(Math.abs(wallet.balance)); // Auto-fill max amount
                                                window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top form
                                            }}
                                        >
                                            <FontAwesomeIcon icon={faRupeeSign} /> Settle Debt
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

export default Reimbursements;