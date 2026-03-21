import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api, { SERVER_URL } from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPaperclip, faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

const EditPurchase = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        itemName: '', amount: '', quantity: 1, projectName: '',
        vendorName: '', storageLocation: '', notes: '', inventoryStatus: ''
    });

    // To display existing files
    const [existingFiles, setExistingFiles] = useState({});
    
    // To hold newly uploaded files (which will replace existing ones)
    const [newFiles, setNewFiles] = useState({
        invoice: null, paymentScreenshot: null, productMedia: []
    });

    useEffect(() => {
        fetchPurchaseData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const fetchPurchaseData = async () => {
        try {
            const res = await api.get(`/purchases/${id}`);
            const data = res.data;
            
            setFormData({
                itemName: data.itemName || '',
                amount: data.amount || '',
                quantity: data.quantity || 1,
                projectName: data.projectName || '',
                vendorName: data.vendorName || '',
                storageLocation: data.storageLocation || '',
                notes: data.notes || '',
                inventoryStatus: data.inventoryStatus || 'Available'
            });

            setExistingFiles({
                invoiceUrl: data.invoiceUrl,
                paymentScreenshotUrl: data.paymentScreenshotUrl,
                productMediaUrls: data.productMediaUrls || []
            });

        } catch (err) {
            Swal.fire('Error', 'Could not load purchase details', 'error');
            navigate('/purchases');
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e, fieldName) => {
        if (fieldName === 'productMedia') {
            const selectedFiles = Array.from(e.target.files);
            const validFiles = [];
            for (let file of selectedFiles) {
                if (file.type.startsWith('video/') && file.size > 15 * 1024 * 1024) {
                    Swal.fire('Too Large', `Video "${file.name}" is over 15MB.`, 'warning');
                } else {
                    validFiles.push(file);
                }
            }
            setNewFiles(prev => ({ ...prev, [fieldName]: validFiles }));
        } else {
            const file = e.target.files[0];
            if (!file) return;
            setNewFiles(prev => ({ ...prev, [fieldName]: file }));
        }
    };

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);

        try {
            const data = new FormData();
            Object.keys(formData).forEach(key => data.append(key, formData[key]));

            if (newFiles.invoice) data.append('invoice', newFiles.invoice);
            if (newFiles.paymentScreenshot) data.append('paymentScreenshot', newFiles.paymentScreenshot);

            if (newFiles.productMedia && newFiles.productMedia.length > 0) {
                for (let i = 0; i < newFiles.productMedia.length; i++) {
                    const file = newFiles.productMedia[i];
                    if (file.type.startsWith('image/')) {
                        const compressedImg = await compressImage(file);
                        data.append('productMedia', compressedImg);
                    } else {
                        data.append('productMedia', file); 
                    }
                }
            }

            await api.put(`/purchases/${id}`, data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            Swal.fire({ icon: 'success', title: 'Updated Successfully', timer: 1500, showConfirmButton: false });
            navigate('/purchases');

        } catch (err) {
            Swal.fire('Error', 'Failed to update purchase', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="main-content">Loading...</div>;

    return (
        <div className="profile-container fade-in">
            <div className="page-header-left">
                <button className="cancel-btn m-0" onClick={() => navigate(-1)}>
                    <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back
                </button>
                <h1 className="page-title header-no-margin">Edit Purchase Details</h1>
            </div>
            
            <div className="profile-card">
                <form onSubmit={handleSubmit} className="profile-form">
                    
                    <div className="form-grid">
                        <div className="form-group full-width">
                            <label className="input-label">Item Name / Description <span className="text-danger">*</span></label>
                            <input className="custom-input" type="text" required 
                                value={formData.itemName} onChange={e => setFormData({...formData, itemName: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Amount (₹) <span className="text-danger">*</span></label>
                            <input className="custom-input" type="number" required 
                                value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Quantity</label>
                            <input className="custom-input" type="number" min="1"
                                value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Project Name</label>
                            <input className="custom-input" type="text" 
                                value={formData.projectName} onChange={e => setFormData({...formData, projectName: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Vendor / Store Name</label>
                            <input className="custom-input" type="text" 
                                value={formData.vendorName} onChange={e => setFormData({...formData, vendorName: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Storage Location</label>
                            <input className="custom-input" type="text" 
                                value={formData.storageLocation} onChange={e => setFormData({...formData, storageLocation: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Inventory Status</label>
                            <select className="swal2-select custom-input" style={{ margin: 0, height: '42px', padding: '0 10px' }}
                                value={formData.inventoryStatus} onChange={e => setFormData({...formData, inventoryStatus: e.target.value})}>
                                <option value="Available">Available</option>
                                <option value="In Use">In Use</option>
                                <option value="Consumed">Consumed</option>
                                <option value="Lost/Damaged">Lost/Damaged</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-group full-width mt-15">
                        <label className="input-label">Notes</label>
                        <textarea className="custom-input" rows="3" style={{ resize: 'vertical' }}
                            value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
                    </div>

                    <hr className="profile-divider my-30" />

                    <h3 className="section-title"><FontAwesomeIcon icon={faPaperclip} /> Update Attachments</h3>
                    <p style={{ fontSize: '12px', color: '#7A7A7A', marginBottom: '20px' }}>Uploading a new file will replace the existing one.</p>
                    
                    <div className="form-grid">
                        <div className="form-group">
                            <label className="input-label">Invoice (PDF/Image)</label>
                            {existingFiles.invoiceUrl && (
                                <a href={`${SERVER_URL}${existingFiles.invoiceUrl}`} target="_blank" rel="noreferrer" style={{ fontSize: '12px', display: 'block', marginBottom: '5px', color: '#215D7B' }}>
                                    <FontAwesomeIcon icon={faExternalLinkAlt} /> View Current Invoice
                                </a>
                            )}
                            <input className="custom-file-input" type="file" onChange={e => handleFileChange(e, 'invoice')} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Payment Screenshot</label>
                            {existingFiles.paymentScreenshotUrl && (
                                <a href={`${SERVER_URL}${existingFiles.paymentScreenshotUrl}`} target="_blank" rel="noreferrer" style={{ fontSize: '12px', display: 'block', marginBottom: '5px', color: '#215D7B' }}>
                                    <FontAwesomeIcon icon={faExternalLinkAlt} /> View Current Screenshot
                                </a>
                            )}
                            <input className="custom-file-input" type="file" accept="image/*" onChange={e => handleFileChange(e, 'paymentScreenshot')} />
                        </div>

                        <div className="form-group full-width">
                            <label className="input-label">Product Photo(s) / Video(s)</label>
                            {existingFiles.productMediaUrls?.length > 0 && (
                                <div style={{ fontSize: '12px', marginBottom: '5px', color: '#16a34a', fontWeight: 'bold' }}>
                                    {existingFiles.productMediaUrls.length} Media File(s) Currently Uploaded
                                </div>
                            )}
                            <input className="custom-file-input" type="file" multiple accept="image/*,video/*" onChange={e => handleFileChange(e, 'productMedia')} />
                        </div>
                    </div>

                    <div className="profile-actions mt-30">
                        <button type="submit" className="save-btn" disabled={saving}>
                            <FontAwesomeIcon icon={faSave} className="btn-icon" /> {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default EditPurchase;