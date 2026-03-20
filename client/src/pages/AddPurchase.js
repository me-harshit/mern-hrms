import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPaperclip } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

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
            {/* Header */}
            <div className="page-header-left">
                <button className="cancel-btn m-0" onClick={() => navigate('/purchases')}>
                    <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back
                </button>
                <h1 className="page-title header-no-margin">Log New Purchase</h1>
            </div>
            
            <div className="profile-card">
                <form onSubmit={handleSubmit} className="profile-form">
                    
                    {/* Primary Details Grid */}
                    <div className="form-grid">
                        <div className="form-group full-width">
                            <label className="input-label">Item Name / Description <span className="text-danger">*</span></label>
                            <input className="custom-input" type="text" required placeholder="e.g. Dell Laptop / Printer Ink"
                                value={formData.itemName} onChange={e => setFormData({...formData, itemName: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Amount (₹) <span className="text-danger">*</span></label>
                            <input className="custom-input" type="number" required placeholder="5000"
                                value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Quantity</label>
                            <input className="custom-input" type="number" min="1"
                                value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Project Name</label>
                            <input className="custom-input" type="text" placeholder="e.g. HRMS Dash"
                                value={formData.projectName} onChange={e => setFormData({...formData, projectName: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Vendor / Store Name</label>
                            <input className="custom-input" type="text" placeholder="e.g. Amazon"
                                value={formData.vendorName} onChange={e => setFormData({...formData, vendorName: e.target.value})} />
                        </div>

                        <div className="form-group full-width">
                            <label className="input-label">Storage Location</label>
                            <input className="custom-input" type="text" placeholder="e.g. Cupboard A1"
                                value={formData.storageLocation} onChange={e => setFormData({...formData, storageLocation: e.target.value})} />
                        </div>
                    </div>

                    <hr className="profile-divider my-30" />

                    {/* Attachments Section */}
                    <h3 className="section-title">
                        <FontAwesomeIcon icon={faPaperclip} /> Attachments
                    </h3>
                    
                    <div className="form-grid">
                        <div className="form-group">
                            <label className="input-label">Invoice (PDF/Image)</label>
                            <input className="custom-file-input" type="file" onChange={e => handleFileChange(e, 'invoice')} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Payment Screenshot</label>
                            <input className="custom-file-input" type="file" accept="image/*" onChange={e => handleFileChange(e, 'paymentScreenshot')} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Product Photo / Video (Auto-Compressed)</label>
                            <input className="custom-file-input" type="file" accept="image/*,video/*" onChange={e => handleFileChange(e, 'productMedia')} />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="profile-actions mt-30">
                        <button type="submit" className="save-btn" disabled={loading}>
                            <FontAwesomeIcon icon={faSave} className="btn-icon" /> {loading ? 'Saving...' : 'Save Purchase'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default AddPurchase;