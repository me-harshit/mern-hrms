import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api, { SERVER_URL } from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPaperclip, faInfoCircle, faExternalLinkAlt, faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';
import '../styles/purchase.css';

const EditInventory = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const [employees, setEmployees] = useState([]);
    const [locations, setLocations] = useState(['IT Closet', 'Server Room A', 'Storage Cabinet 1']);

    const [formData, setFormData] = useState({
        itemName: '',
        status: 'Available',
        storageLocation: '',
        assignedTo: '',
        notes: '',
        quantityToUpdate: 1 
    });

    const [originalQuantity, setOriginalQuantity] = useState(1); 
    const [originalStatus, setOriginalStatus] = useState(''); 

    const [existingMedia, setExistingMedia] = useState([]);
    const [newFiles, setNewFiles] = useState({ media: [] });

    useEffect(() => {
        fetchInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const fetchInitialData = async () => {
        try {
            const empRes = await api.get('/employees');
            setEmployees(empRes.data);

            const assetRes = await api.get(`/inventory/${id}`);
            const data = assetRes.data;

            setFormData({
                itemName: data.itemName || '',
                status: data.status || 'Available',
                storageLocation: data.storageLocation || '',
                assignedTo: data.assignedTo?._id || '',
                notes: data.notes || '',
                quantityToUpdate: data.quantity || 1 
            });

            setOriginalQuantity(data.quantity || 1);
            setOriginalStatus(data.status || 'Available');
            setExistingMedia(data.mediaUrls || []);

            if (data.storageLocation && !locations.includes(data.storageLocation)) {
                setLocations(prev => [...prev, data.storageLocation]);
            }

        } catch (err) {
            Swal.fire('Error', 'Could not load asset details', 'error');
            navigate('/inventory');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files);
        setNewFiles({ media: selectedFiles });
    };

    const handleAddLocation = async () => {
        const { value: newLocation } = await Swal.fire({
            title: 'Add New Location',
            input: 'text',
            inputPlaceholder: 'e.g. Warehouse Rack 3',
            showCancelButton: true,
            confirmButtonColor: '#215D7B'
        });
        if (newLocation) {
            setLocations([...locations, newLocation]);
            setFormData({ ...formData, storageLocation: newLocation });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.itemName) return Swal.fire('Error', 'Item Name is required', 'warning');
        if (formData.status === 'Assigned' && !formData.assignedTo) return Swal.fire('Error', 'Please select an employee', 'warning');
        if (formData.quantityToUpdate < 1) return Swal.fire('Error', 'Quantity must be at least 1', 'warning');
        if (formData.quantityToUpdate > originalQuantity) return Swal.fire('Error', `Cannot update more than ${originalQuantity} items`, 'warning');

        setSaving(true);
        setUploadProgress(0);

        try {
            const data = new FormData();
            Object.keys(formData).forEach(key => data.append(key, formData[key]));

            if (newFiles.media && newFiles.media.length > 0) {
                for (let i = 0; i < newFiles.media.length; i++) {
                    data.append('media', newFiles.media[i]);
                }
            }

            await api.put(`/inventory/${id}`, data, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(percentCompleted);
                }
            });

            Swal.fire({ icon: 'success', title: 'Asset Updated', timer: 1500, showConfirmButton: false });
            navigate('/inventory');
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Failed to update asset', 'error');
        } finally {
            setSaving(false);
            setUploadProgress(0);
        }
    };

    const getFileUrl = (url) => {
        if (!url) return '';
        return url.startsWith('http') ? url : `${SERVER_URL}${url}`;
    };

    if (loading) return <div className="main-content">Loading Asset Data...</div>;

    return (
        <div className="profile-container fade-in">
            <div className="page-header-left">
                <button className="gts-btn warning btn-small m-0" onClick={() => navigate('/inventory')}>
                    <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back
                </button>
                <h1 className="page-title header-no-margin">Edit Asset Details</h1>
            </div>
            
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ background: '#3b82f6', color: 'white', width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                    <FontAwesomeIcon icon={faLayerGroup} />
                </div>
                <div>
                    <h3 style={{ margin: 0, color: '#1e3a8a', fontSize: '16px' }}>Editing Stack of {originalQuantity}</h3>
                    <p style={{ margin: 0, color: '#60a5fa', fontSize: '13px' }}>Current Status: {originalStatus}</p>
                </div>
            </div>

            <div className="purchase-form-card">
                <form onSubmit={handleSubmit} className="profile-form">
                    
                    <div className="expense-form-section">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faInfoCircle} /> Asset Details
                        </div>
                        
                        <div className="purchase-grid">
                            
                            {/* 👇 FIXED: Side-by-side layout for Name and Quantity 👇 */}
                            <div className="form-group grid-span-2" style={{ display: 'flex', gap: '15px' }}>
                                <div style={{ flex: '3' }}>
                                    <label className="input-label">Item / Asset Name *</label>
                                    <input className="custom-input" type="text" name="itemName" required value={formData.itemName} onChange={handleChange} />
                                </div>
                                <div style={{ flex: '1' }}>
                                    <label className="input-label" style={{ color: '#0f172a', fontWeight: 'bold' }}>Qty to Modify *</label>
                                    <input 
                                        className="custom-input" 
                                        type="number" 
                                        name="quantityToUpdate" 
                                        required 
                                        min="1" 
                                        max={originalQuantity} 
                                        value={formData.quantityToUpdate} 
                                        onChange={handleChange} 
                                        disabled={originalQuantity === 1} 
                                        style={{ background: originalQuantity === 1 ? '#f1f5f9' : 'white' }}
                                    />
                                    {originalQuantity > 1 && (
                                        <div className="text-small text-muted" style={{ marginTop: '4px' }}>Max: {originalQuantity}</div>
                                    )}
                                </div>
                            </div>

                            <div className="form-group grid-span-2">
                                <label className="input-label">Target Status for these {formData.quantityToUpdate} item(s)</label>
                                <div className="expense-type-toggle">
                                    {['Available', 'Assigned', 'Damaged', 'Lost'].map(status => (
                                        <label key={status} className={formData.status === status ? 'active' : ''}>
                                            <input type="radio" name="status" value={status} onChange={handleChange} /> {status}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {formData.status === 'Available' && (
                                <div className="form-group grid-span-2">
                                    <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Target Storage Location</span>
                                        <span onClick={handleAddLocation} style={{ color: '#215D7B', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>+ ADD NEW LOCATION</span>
                                    </label>
                                    <select className="swal2-select custom-select" name="storageLocation" required value={formData.storageLocation} onChange={handleChange}>
                                        <option value="">-- Select Location --</option>
                                        {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                    </select>
                                </div>
                            )}

                            {formData.status === 'Assigned' && (
                                <div className="form-group grid-span-2">
                                    <label className="input-label">Assign To Employee *</label>
                                    <select className="swal2-select custom-select" name="assignedTo" required value={formData.assignedTo} onChange={handleChange}>
                                        <option value="">-- Select Employee --</option>
                                        {employees.map(emp => (
                                            <option key={emp._id} value={emp._id}>{emp.name} ({emp.employeeId || emp.role})</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="form-group grid-span-2">
                                <label className="input-label">Extra Notes / Serial Numbers</label>
                                <textarea className="custom-input" rows="2" name="notes" value={formData.notes} onChange={handleChange} />
                            </div>
                        </div>
                    </div>

                    <div className="expense-form-section mb-0">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faPaperclip} /> Asset Media
                        </div>
                        
                        <div className="purchase-grid">
                            <div className="form-group expense-file-area grid-span-2">
                                
                                {existingMedia.length > 0 && (
                                    <div className="mb-15">
                                        <div className="text-small text-muted mb-10 fw-bold">Currently Uploaded Files:</div>
                                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                            {existingMedia.map((url, idx) => {
                                                const isVideo = url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/);
                                                const fullUrl = getFileUrl(url);
                                                return (
                                                    <a key={idx} href={fullUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                                                        <div style={{ width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1', position: 'relative', background: '#f1f5f9' }}>
                                                            {isVideo ? (
                                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: '#64748b' }}>🎥</div>
                                                            ) : (
                                                                <img src={fullUrl} alt={`media-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            )}
                                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', textAlign: 'center', padding: '2px' }}>
                                                                <FontAwesomeIcon icon={faExternalLinkAlt} /> View
                                                            </div>
                                                        </div>
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <label className="input-label" style={{ marginTop: existingMedia.length > 0 ? '15px' : '0', borderTop: existingMedia.length > 0 ? '1px solid #e2e8f0' : 'none', paddingTop: existingMedia.length > 0 ? '15px' : '0' }}>
                                    Upload Additional Images / Videos
                                </label>
                                <input className="custom-file-input" type="file" multiple accept="image/*,video/*" onChange={handleFileChange} />
                                {newFiles.media.length > 0 && (
                                    <p className="file-success-text" style={{ fontSize: '12px', color: '#16a34a', marginTop: '5px', fontWeight: '600' }}>
                                        {newFiles.media.length} new file(s) selected
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="profile-actions mt-30" style={{ flexDirection: 'column', gap: '15px' }}>
                        {saving && uploadProgress > 0 && (
                            <div className="upload-progress-container">
                                <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                                <span className="upload-progress-text">Updating Asset... {uploadProgress}%</span>
                            </div>
                        )}

                        <button type="submit" className="save-btn purchase-submit-btn" disabled={saving}>
                            <FontAwesomeIcon icon={faSave} className="btn-icon" /> 
                            {saving ? 'Processing...' : 'Save Updates'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default EditInventory;