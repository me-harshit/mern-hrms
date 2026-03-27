import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api, { SERVER_URL } from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPaperclip, faInfoCircle, faLayerGroup, faSpinner, faFileVideo, faFilePdf, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression';
import '../styles/App.css';
import '../styles/expenses.css';

const EditInventory = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isCompressing, setIsCompressing] = useState(false);

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

    const handleFileChange = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        const processedFiles = [];

        setIsCompressing(true);

        for (let file of selectedFiles) {
            if (file.type.startsWith('image/')) {
                try {
                    const options = {
                        maxSizeMB: 1,
                        maxWidthOrHeight: 1920,
                        useWebWorker: true,
                    };

                    const compressedBlob = await imageCompression(file, options);

                    const safelyNamedFile = new File([compressedBlob], file.name, {
                        type: file.type,
                        lastModified: Date.now()
                    });

                    processedFiles.push(safelyNamedFile);
                } catch (error) {
                    console.error("Error compressing image:", error);
                    processedFiles.push(file);
                }
            } else if (file.type.startsWith('video/') && file.size > 15 * 1024 * 1024) {
                Swal.fire('Too Large', `Video "${file.name}" is larger than 15MB.`, 'warning');
            } else {
                processedFiles.push(file);
            }
        }

        setNewFiles({ media: processedFiles }); // 👇 Uses setNewFiles
        setIsCompressing(false);
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

    // --- Media Helpers ---
    const getFileUrl = (url) => {
        if (!url) return '';
        return url.startsWith('http') ? url : `${SERVER_URL}${url}`;
    };

    const viewSingleFile = (url, title) => {
        const fullUrl = getFileUrl(url);
        const isVideo = url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/);
        const isPdf = url.toLowerCase().endsWith('.pdf');

        if (isVideo) {
            Swal.fire({ title, html: `<video src="${fullUrl}" controls style="width:100%; border-radius:6px; max-height:400px; background:#000;"></video>`, width: '800px', showCloseButton: true, showConfirmButton: false });
        } else if (isPdf) {
            Swal.fire({ title, html: `<iframe src="${fullUrl}" width="100%" height="500px" style="border: none; border-radius: 6px;"></iframe>`, width: '800px', showCloseButton: true, showConfirmButton: false });
        } else {
            Swal.fire({ title, imageUrl: fullUrl, imageAlt: title, width: '800px', showCloseButton: true, showConfirmButton: false });
        }
    };

    // Render the beautiful gallery thumbnail
    const renderThumbnail = (url, index) => {
        const fullUrl = getFileUrl(url);
        const isPdf = url.toLowerCase().endsWith('.pdf');
        const isVideo = url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/);

        let iconContent;
        if (isPdf) {
            iconContent = <FontAwesomeIcon icon={faFilePdf} style={{ fontSize: '32px', color: '#dc2626' }} />;
        } else if (isVideo) {
            iconContent = <FontAwesomeIcon icon={faFileVideo} style={{ fontSize: '32px', color: '#2563eb' }} />;
        } else {
            return (
                <div key={index} className="existing-file-card" onClick={() => viewSingleFile(url, `Media ${index + 1}`)}>
                    <img src={fullUrl} alt="Thumbnail" className="existing-file-thumb" />
                </div>
            );
        }

        return (
            <div key={index} className="existing-file-card icon-card" onClick={() => viewSingleFile(url, `Media ${index + 1}`)}>
                {iconContent}
                <span className="file-type-label">{isPdf ? 'PDF' : 'VIDEO'}</span>
            </div>
        );
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

            <div className="expense-form-card">
                <form onSubmit={handleSubmit} className="profile-form">

                    <div className="expense-form-section">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faInfoCircle} /> Asset Details
                        </div>

                        <div className="expense-grid">

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

                        {(existingMedia.length > 0) && (
                            <div className="alert-message warning mb-20" style={{ padding: '12px', borderRadius: '8px', fontSize: '13px', background: '#fffbeb', border: '1px solid #fef3c7', color: '#b45309' }}>
                                <FontAwesomeIcon icon={faInfoCircle} /> <strong>Note:</strong> Uploading new files will add to your existing attachments.
                            </div>
                        )}

                        <div className="expense-grid">
                            <div className="form-group expense-file-area grid-span-2">

                                <label className="input-label" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>
                                    Upload Images / Videos of Asset
                                </label>

                                {existingMedia.length > 0 && (
                                    <div className="mb-15">
                                        <div className="text-small text-muted mb-10 fw-600">Currently Saved Files:</div>
                                        <div className="existing-file-gallery">
                                            {existingMedia.map((url, idx) => renderThumbnail(url, idx))}
                                        </div>
                                    </div>
                                )}

                                <div className="upload-container-new">
                                    <div className="text-small text-muted mb-5 fw-600">Upload Additional Files (Optional):</div>
                                    <input className="custom-file-input" type="file" multiple accept="image/*,video/*" onChange={handleFileChange} />

                                    {isCompressing ? (
                                        <div className="file-success-badge mt-10" style={{ background: '#fef3c7', color: '#b45309' }}>
                                            <FontAwesomeIcon icon={faSpinner} spin /> Compressing...
                                        </div>
                                    ) : newFiles.media.length > 0 && (
                                        <div className="file-success-badge mt-10">
                                            <FontAwesomeIcon icon={faCheckCircle} /> {newFiles.media.length} new file(s) ready
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="profile-actions mt-30 flex-col gap-15">
                        {saving && uploadProgress > 0 && (
                            <div className="upload-progress-container">
                                <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                                <span className="upload-progress-text">Updating Asset... {uploadProgress}%</span>
                            </div>
                        )}

                        <button type="submit" className="save-btn expense-submit-btn" disabled={saving || isCompressing}>
                            <FontAwesomeIcon icon={faSave} className="btn-icon" />
                            {saving ? 'Processing...' : isCompressing ? 'Compressing Files...' : 'Save Updates'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default EditInventory;