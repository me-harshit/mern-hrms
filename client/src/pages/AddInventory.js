import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPaperclip, faInfoCircle, faSpinner, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression';
import '../styles/App.css';
import '../styles/expenses.css'; 

const AddInventory = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isCompressing, setIsCompressing] = useState(false);

    const [employees, setEmployees] = useState([]);
    const [locations, setLocations] = useState(['IT Closet', 'Server Room A', 'Storage Cabinet 1']);

    const fileInputRef = useRef(null);

    const [formData, setFormData] = useState({
        itemName: '',
        quantity: 1, 
        status: 'Available',
        storageLocation: 'IT Closet', 
        assignedTo: '',
        notes: ''
    });

    const [files, setFiles] = useState({ media: [] });

    useEffect(() => {
        const fetchEmployees = async () => {
            try {
                const res = await api.get('/employees');
                setEmployees(res.data);
            } catch (err) {
                console.error("Could not fetch employees", err);
            }
        };
        fetchEmployees();
    }, []);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    // 👇 FIXED: Brought in the ultimate mobile compression logic 👇
    const handleFileChange = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        const processedFiles = [];
        
        setIsCompressing(true);

        for (let file of selectedFiles) {
            const isImage = file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|heic|heif)$/i);

            if (isImage) {
                try {
                    const options = {
                        maxSizeMB: 1,             
                        maxWidthOrHeight: 1920,   
                        useWebWorker: false,       // Fixed for mobile stability
                        fileType: 'image/jpeg'     // Force standard JPEG
                    };
                    
                    const compressedBlob = await imageCompression(file, options);
                    
                    const safeName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";

                    const safelyNamedFile = new File([compressedBlob], safeName, {
                        type: 'image/jpeg',
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

        setFiles({ media: processedFiles });
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
        if (formData.quantity < 1) return Swal.fire('Error', 'Quantity must be at least 1', 'warning');
        if (formData.status === 'Assigned' && !formData.assignedTo) return Swal.fire('Error', 'Please select an employee', 'warning');

        setLoading(true);
        setUploadProgress(0);

        try {
            const data = new FormData();
            Object.keys(formData).forEach(key => data.append(key, formData[key]));

            if (files.media && files.media.length > 0) {
                for (let i = 0; i < files.media.length; i++) {
                    data.append('media', files.media[i]);
                }
            }

            await api.post('/inventory', data, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(percentCompleted);
                }
            });

            Swal.fire({ 
                icon: 'success', 
                title: 'Asset Added!', 
                text: 'You can now add another item to this location.',
                timer: 2000, 
                showConfirmButton: false 
            });

            setFormData(prev => ({ ...prev, itemName: '', quantity: 1 }));
            setFiles({ media: [] });
            if (fileInputRef.current) {
                fileInputRef.current.value = ""; 
            }

        } catch (err) {
            Swal.fire('Error', 'Failed to save asset', 'error');
        } finally {
            setLoading(false);
            setUploadProgress(0);
        }
    };

    return (
        <div className="profile-container fade-in">
            <div className="page-header-left">
                <button className="gts-btn warning btn-small m-0" onClick={() => navigate('/inventory')}>
                    <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back to Dashboard
                </button>
                <h1 className="page-title header-no-margin">Add New Asset</h1>
            </div>
            
            <div className="expense-form-card">
                <form onSubmit={handleSubmit} className="profile-form">
                    
                    {/* --- CORE DETAILS --- */}
                    <div className="expense-form-section">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faInfoCircle} /> Asset Details
                        </div>
                        
                        <div className="expense-grid"> 
                            
                            <div className="form-group grid-span-2" style={{ display: 'flex', gap: '15px' }}>
                                <div style={{ flex: '3' }}>
                                    <label className="input-label">Item / Asset Name *</label>
                                    <input className="custom-input" type="text" name="itemName" required placeholder="e.g. MacBook Pro M3, Office Chair" value={formData.itemName} onChange={handleChange} />
                                </div>
                                <div style={{ flex: '1' }}>
                                    <label className="input-label">Quantity *</label>
                                    <input className="custom-input" type="number" name="quantity" min="1" required value={formData.quantity} onChange={handleChange} />
                                </div>
                            </div>

                            <div className="form-group grid-span-2">
                                <label className="input-label">Current Status</label>
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
                                        <span>Storage Location</span>
                                        <span onClick={handleAddLocation} style={{ color: '#215D7B', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>+ ADD NEW LOCATION</span>
                                    </label>
                                    <select className="swal2-select custom-select" name="storageLocation" value={formData.storageLocation} onChange={handleChange}>
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
                                <textarea className="custom-input" rows="2" name="notes" placeholder="Any hardware IDs, purchase history, or damage details..." value={formData.notes} onChange={handleChange} />
                            </div>
                        </div>
                    </div>

                    {/* --- ATTACHMENTS --- */}
                    <div className="expense-form-section mb-0">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faPaperclip} /> Asset Media
                        </div>
                        <div className="expense-grid"> 
                            <div className="form-group expense-file-area grid-span-2">
                                <label className="input-label" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>
                                    Upload Images / Videos of Asset
                                </label>
                                <div className="upload-container-new">
                                    {/* 👇 FIXED: Added capture="environment" to force the camera to open on mobile */}
                                    <input 
                                        ref={fileInputRef} 
                                        className="custom-file-input" 
                                        type="file" 
                                        multiple 
                                        accept="image/*,video/*,application/pdf" 
                                        capture="environment"
                                        onChange={handleFileChange} 
                                    />
                                    
                                    {isCompressing && (
                                        <p className="file-success-text" style={{ color: '#d97706' }}>
                                            <FontAwesomeIcon icon={faSpinner} spin /> Compressing images for fast upload...
                                        </p>
                                    )}
                                    
                                    {!isCompressing && files.media.length > 0 && (
                                        <p className="file-success-text">
                                            <FontAwesomeIcon icon={faCheckCircle} /> {files.media.length} media file(s) ready
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="profile-actions mt-30 flex-col gap-15">
                        {loading && uploadProgress > 0 && (
                            <div className="upload-progress-container">
                                <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                                <span className="upload-progress-text">Saving Asset... {uploadProgress}%</span>
                            </div>
                        )}

                        <button type="submit" className="save-btn expense-submit-btn" disabled={loading || isCompressing}>
                            <FontAwesomeIcon icon={faSave} className="btn-icon" /> 
                            {loading ? 'Processing...' : isCompressing ? 'Compressing Files...' : 'Save Asset & Add Another'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default AddInventory;