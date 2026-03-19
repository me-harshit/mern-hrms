import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPaperclip } from '@fortawesome/free-solid-svg-icons';

const AddPurchase = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        itemName: '', amount: '', quantity: 1, projectName: '',
        vendorName: '', storageLocation: '', notes: ''
    });

    // File State
    const [files, setFiles] = useState({
        invoice: null, paymentScreenshot: null, productMedia: null
    });

    // --- HELPER: NATIVE IMAGE COMPRESSOR ---
    const compressImage = (file, maxWidth = 1024, quality = 0.7) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob((blob) => {
                        resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                    }, 'image/jpeg', quality);
                };
            };
        });
    };

    const handleFileChange = (e, fieldName) => {
        const file = e.target.files[0];
        if (!file) return;

        // Video Size Check (Max 15MB)
        if (file.type.startsWith('video/') && file.size > 15 * 1024 * 1024) {
            Swal.fire('Too Large', 'Video must be smaller than 15MB to save server space.', 'warning');
            e.target.value = null; // Clear input
            return;
        }

        setFiles(prev => ({ ...prev, [fieldName]: file }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.itemName || !formData.amount) {
            return Swal.fire('Required', 'Item Name and Amount are required.', 'warning');
        }

        setLoading(true);
        try {
            const data = new FormData();
            Object.keys(formData).forEach(key => data.append(key, formData[key]));

            if (files.invoice) data.append('invoice', files.invoice);
            if (files.paymentScreenshot) data.append('paymentScreenshot', files.paymentScreenshot);

            if (files.productMedia) {
                if (files.productMedia.type.startsWith('image/')) {
                    const compressedImg = await compressImage(files.productMedia);
                    data.append('productMedia', compressedImg);
                } else {
                    data.append('productMedia', files.productMedia); 
                }
            }

            await api.post('/purchases', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            Swal.fire({ icon: 'success', title: 'Purchase Logged', timer: 1500, showConfirmButton: false });
            navigate('/purchases');

        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'Failed to save purchase', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="profile-container fade-in">
            {/* Header matches Profile style, with an added Back button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                <button className="cancel-btn" onClick={() => navigate('/purchases')} style={{ margin: 0 }}>
                    <FontAwesomeIcon icon={faArrowLeft} /> Back
                </button>
                <h1 className="page-title" style={{ margin: 0 }}>Log New Purchase</h1>
            </div>
            
            <div className="profile-card">
                <form onSubmit={handleSubmit} className="profile-form">
                    
                    {/* Primary Details Grid */}
                    <div className="form-grid">
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>Item Name / Description <span style={{ color: '#ef4444' }}>*</span></label>
                            <input type="text" required placeholder="e.g. Dell Laptop / Printer Ink"
                                value={formData.itemName} onChange={e => setFormData({...formData, itemName: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label>Amount (₹) <span style={{ color: '#ef4444' }}>*</span></label>
                            <input type="number" required placeholder="5000"
                                value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label>Quantity</label>
                            <input type="number" min="1"
                                value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label>Project Name</label>
                            <input type="text" placeholder="e.g. HRMS Dash"
                                value={formData.projectName} onChange={e => setFormData({...formData, projectName: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label>Vendor / Store Name</label>
                            <input type="text" placeholder="e.g. Amazon"
                                value={formData.vendorName} onChange={e => setFormData({...formData, vendorName: e.target.value})} />
                        </div>

                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>Storage Location</label>
                            <input type="text" placeholder="e.g. Cupboard A1"
                                value={formData.storageLocation} onChange={e => setFormData({...formData, storageLocation: e.target.value})} />
                        </div>
                    </div>

                    <hr className="profile-divider" style={{ margin: '30px 0' }} />

                    {/* Attachments Section */}
                    <h3 style={{ marginBottom: '20px', color: '#215D7B', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FontAwesomeIcon icon={faPaperclip} /> Attachments
                    </h3>
                    
                    <div className="form-grid">
                        <div className="form-group">
                            <label>Invoice (PDF/Image)</label>
                            <input type="file" onChange={e => handleFileChange(e, 'invoice')} style={{ padding: '8px' }} />
                        </div>

                        <div className="form-group">
                            <label>Payment Screenshot</label>
                            <input type="file" accept="image/*" onChange={e => handleFileChange(e, 'paymentScreenshot')} style={{ padding: '8px' }} />
                        </div>

                        <div className="form-group">
                            <label>Product Photo / Video (Auto-Compressed)</label>
                            <input type="file" accept="image/*,video/*" onChange={e => handleFileChange(e, 'productMedia')} style={{ padding: '8px' }} />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="profile-actions" style={{ marginTop: '30px' }}>
                        <button type="submit" className="save-btn" disabled={loading}>
                            <FontAwesomeIcon icon={faSave} /> {loading ? 'Saving...' : 'Save Purchase'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default AddPurchase;