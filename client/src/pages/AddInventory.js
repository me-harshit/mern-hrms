import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPaperclip, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

const AddInventory = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const [employees, setEmployees] = useState([]);
    
    // 👇 Array of predefined locations. Admins can add more on the fly! 👇
    const [locations, setLocations] = useState(['IT Closet', 'Server Room A', 'Storage Cabinet 1']);

    const [formData, setFormData] = useState({
        itemName: '',
        status: 'Available',
        storageLocation: 'IT Closet', // Default selection
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

    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files);
        setFiles({ media: selectedFiles });
    };

    // --- QUICK ADD LOCATION ---
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
            setFormData({ ...formData, storageLocation: newLocation }); // Auto-select the new location
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.itemName) return Swal.fire('Error', 'Item Name is required', 'warning');
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

            Swal.fire({ icon: 'success', title: 'Asset Added to Inventory', timer: 1500, showConfirmButton: false });
            navigate('/inventory');
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
                    <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back
                </button>
                <h1 className="page-title header-no-margin">Add New Asset</h1>
            </div>
            
            <div className="purchase-form-card">
                <form onSubmit={handleSubmit} className="profile-form">
                    
                    {/* --- CORE DETAILS --- */}
                    <div className="expense-form-section">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faInfoCircle} /> Asset Details
                        </div>
                        
                        <div className="purchase-grid">
                            <div className="form-group grid-span-2">
                                <label className="input-label">Item / Asset Name *</label>
                                <input className="custom-input" type="text" name="itemName" required placeholder="e.g. MacBook Pro M3, Office Chair" value={formData.itemName} onChange={handleChange} />
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

                            {/* --- CONDITIONAL LOGIC BASED ON STATUS --- */}
                            
                            {/* If Available -> Show Unified Storage Location */}
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

                            {/* If Assigned -> Show Employee List */}
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
                        <div className="purchase-grid">
                            <div className="form-group expense-file-area grid-span-2">
                                <label className="input-label">Upload Images / Videos of Asset</label>
                                <input className="custom-file-input" type="file" multiple accept="image/*,video/*" onChange={handleFileChange} />
                                {files.media.length > 0 && (
                                    <p className="file-success-text" style={{ fontSize: '12px', color: '#16a34a', marginTop: '5px', fontWeight: '600' }}>
                                        {files.media.length} media file(s) selected
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="profile-actions mt-30" style={{ flexDirection: 'column', gap: '15px' }}>
                        {loading && uploadProgress > 0 && (
                            <div className="upload-progress-container">
                                <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                                <span className="upload-progress-text">Saving Asset... {uploadProgress}%</span>
                            </div>
                        )}

                        <button type="submit" className="save-btn purchase-submit-btn" disabled={loading}>
                            <FontAwesomeIcon icon={faSave} className="btn-icon" /> 
                            {loading ? 'Processing...' : 'Save Asset to Inventory'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default AddInventory;