import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api, { SERVER_URL } from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPaperclip, faTags, faRupeeSign, faCreditCard, faInfoCircle, faListAlt, faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';
import '../styles/purchase.css'; 

const EditPurchase = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user'));
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [usersList, setUsersList] = useState([]);
    const [projectsList, setProjectsList] = useState([]);

    // --- MAIN FORM STATE ---
    const [formData, setFormData] = useState({
        expenseType: 'Project Expense', 
        category: 'Product / Item Purchase',
        purchaseDate: '',
        amount: '',
        paymentSourceId: '', 
        projectName: '',
        descriptionTags: ''
    });

    // --- DYNAMIC CATEGORY DETAILS STATE ---
    const [expenseDetails, setExpenseDetails] = useState({
        productName: '', quantity: 1, unitPrice: '', expiryDate: '', storageLocation: '',
        vehicleType: 'Car', vehicleNumber: '', odometerBefore: '', odometerAfter: '', kmTraveled: '', travelFrom: '', travelTo: '', purpose: '',
        restaurantName: '', foodItemsOrdered: '', numberOfPeople: '',
        travelMode: 'Flight', distanceKm: '', bookingReference: '',
        hotelName: '', city: '', checkInDate: '', checkOutDate: '', numberOfNights: '',
        vendorName: '', billingCycle: 'Monthly', expenseDescription: ''
    });

    // --- EXISTING & NEW FILES STATE ---
    const [existingFiles, setExistingFiles] = useState({});
    const [newFiles, setNewFiles] = useState({ paymentScreenshot: null, expenseMedia: [] });

    useEffect(() => {
        fetchInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const fetchInitialData = async () => {
        try {
            const usersRes = await api.get('/employees/payment-sources');
            setUsersList(usersRes.data);

            const projRes = await api.get('/projects');
            setProjectsList(projRes.data);
            const res = await api.get(`/purchases/${id}`);
            const data = res.data;
            
            setFormData({
                expenseType: data.expenseType || 'Project Expense',
                category: data.category || 'Product / Item Purchase',
                purchaseDate: data.purchaseDate ? new Date(data.purchaseDate).toISOString().split('T')[0] : '',
                amount: data.amount || '',
                paymentSourceId: data.paymentSourceId?._id || data.paymentSourceId || currentUser.id,
                projectName: data.projectName || '',
                descriptionTags: data.descriptionTags || ''
            });

            if (data.expenseDetails) {
                setExpenseDetails(prev => ({ ...prev, ...data.expenseDetails }));
            }

            setExistingFiles({
                paymentScreenshotUrl: data.paymentScreenshotUrl,
                expenseMediaUrls: data.expenseMediaUrls || []
            });

        } catch (err) {
            Swal.fire('Error', 'Could not load expense details', 'error');
            navigate('/purchases');
        } finally {
            setLoading(false);
        }
    };

    // --- AUTO-CALCULATORS ---
    useEffect(() => {
        if (formData.category === 'Fuel Expense (Car / Bike)') {
            const before = parseFloat(expenseDetails.odometerBefore) || 0;
            const after = parseFloat(expenseDetails.odometerAfter) || 0;
            if (after > before) setExpenseDetails(prev => ({ ...prev, kmTraveled: after - before }));
        }
        if (formData.category === 'Accommodation') {
            if (expenseDetails.checkInDate && expenseDetails.checkOutDate) {
                const checkIn = new Date(expenseDetails.checkInDate);
                const checkOut = new Date(expenseDetails.checkOutDate);
                const diffTime = Math.abs(checkOut - checkIn);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                setExpenseDetails(prev => ({ ...prev, numberOfNights: diffDays }));
            }
        }
    }, [expenseDetails.odometerBefore, expenseDetails.odometerAfter, expenseDetails.checkInDate, expenseDetails.checkOutDate, formData.category]);

    // --- HANDLERS ---
    const handleMainChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
    const handleDetailChange = (e) => setExpenseDetails({ ...expenseDetails, [e.target.name]: e.target.value });

    const handleFileChange = (e, fieldName) => {
        if (fieldName === 'expenseMedia') {
            const selectedFiles = Array.from(e.target.files); 
            const validFiles = [];
            for (let file of selectedFiles) {
                if (file.type.startsWith('video/') && file.size > 15 * 1024 * 1024) {
                    Swal.fire('Too Large', `Video "${file.name}" is larger than 15MB.`, 'warning');
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.amount || !formData.descriptionTags) {
            return Swal.fire('Required Fields', 'Amount and Description are required.', 'warning');
        }
        
        setSaving(true);
        setUploadProgress(0);

        try {
            const data = new FormData();
            Object.keys(formData).forEach(key => data.append(key, formData[key]));
            data.append('expenseDetails', JSON.stringify(expenseDetails));

            // Only append files if the user is explicitly uploading new ones
            if (newFiles.paymentScreenshot) {
                data.append('paymentScreenshot', newFiles.paymentScreenshot);
            }
            
            // Send raw files to backend for S3 Processing
            if (newFiles.expenseMedia && newFiles.expenseMedia.length > 0) {
                for (let i = 0; i < newFiles.expenseMedia.length; i++) {
                    data.append('expenseMedia', newFiles.expenseMedia[i]); 
                }
            }

            await api.put(`/purchases/${id}`, data, { 
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(percentCompleted);
                }
            });

            Swal.fire({ icon: 'success', title: 'Update Saved', timer: 1500, showConfirmButton: false });
            navigate('/purchases');
        } catch (err) { 
            Swal.fire('Error', 'Failed to update expense', 'error'); 
        } finally { 
            setSaving(false); 
            setUploadProgress(0);
        }
    };

    // Helper to safely render old local URLs or new S3 URLs
    const getFileUrl = (url) => {
        if (!url) return '';
        return url.startsWith('http') ? url : `${SERVER_URL}${url}`;
    };

    const getMediaLabel = () => {
        switch (formData.category) {
            case 'Fuel Expense (Car / Bike)': return 'Odometer Image(s) / Fuel Station Receipt';
            case 'Food Expense': return 'Order Screenshot / Restaurant Bill';
            case 'Travel Expense': return 'Travel Receipt / Ticket Screenshot';
            case 'Accommodation': return 'Hotel Receipt / Invoice';
            case 'Product / Item Purchase': return 'Product Photo(s) / Video(s)';
            case 'Regular Office Expense': return 'Supporting Document / Bill';
            default: return 'Expense Media (Photos/Videos)';
        }
    };

    const renderCategoryFields = () => {
        switch (formData.category) {
            case 'Product / Item Purchase':
                return (
                    <>
                        <div className="form-group grid-span-2"><label className="input-label">Product Name *</label><input className="custom-input" name="productName" value={expenseDetails.productName} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Quantity *</label><input className="custom-input" type="number" name="quantity" value={expenseDetails.quantity} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Unit Price (₹) *</label><input className="custom-input" type="number" name="unitPrice" value={expenseDetails.unitPrice} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Storage Location *</label><input className="custom-input" name="storageLocation" value={expenseDetails.storageLocation} onChange={handleDetailChange} placeholder="e.g. Office Room A" required /></div>
                        <div className="form-group"><label className="input-label">Expiry Date (If applicable)</label><input className="custom-input" type="date" name="expiryDate" value={expenseDetails.expiryDate} onChange={handleDetailChange} /></div>
                    </>
                );
            case 'Fuel Expense (Car / Bike)':
                return (
                    <>
                        <div className="form-group"><label className="input-label">Vehicle Type *</label><select className="swal2-select custom-select" name="vehicleType" value={expenseDetails.vehicleType} onChange={handleDetailChange}><option value="Car">Car</option><option value="Bike">Bike</option><option value="Auto">Auto</option></select></div>
                        <div className="form-group"><label className="input-label">Vehicle Number *</label><input className="custom-input" name="vehicleNumber" value={expenseDetails.vehicleNumber} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Travel From *</label><input className="custom-input" name="travelFrom" value={expenseDetails.travelFrom} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Travel To *</label><input className="custom-input" name="travelTo" value={expenseDetails.travelTo} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Odometer (Before) *</label><input className="custom-input" type="number" name="odometerBefore" value={expenseDetails.odometerBefore} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Odometer (After) *</label><input className="custom-input" type="number" name="odometerAfter" value={expenseDetails.odometerAfter} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">KM Traveled (Auto)</label><input className="custom-input readonly-input" type="number" name="kmTraveled" value={expenseDetails.kmTraveled} readOnly /></div>
                        <div className="form-group grid-span-2"><label className="input-label">Purpose of Travel *</label><input className="custom-input" name="purpose" value={expenseDetails.purpose} onChange={handleDetailChange} required /></div>
                    </>
                );
            case 'Food Expense':
                return (
                    <>
                        <div className="form-group"><label className="input-label">Restaurant / Platform Name *</label><input className="custom-input" name="restaurantName" placeholder="e.g. Zomato, Swiggy" value={expenseDetails.restaurantName} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Number of People</label><input className="custom-input" type="number" name="numberOfPeople" value={expenseDetails.numberOfPeople} onChange={handleDetailChange} /></div>
                        <div className="form-group grid-span-2"><label className="input-label">Food Items Ordered *</label><textarea className="custom-input" rows="2" name="foodItemsOrdered" value={expenseDetails.foodItemsOrdered} onChange={handleDetailChange} required /></div>
                    </>
                );
            case 'Travel Expense':
                return (
                    <>
                        <div className="form-group"><label className="input-label">Travel Mode *</label><select className="swal2-select custom-select" name="travelMode" value={expenseDetails.travelMode} onChange={handleDetailChange}><option value="Flight">Flight</option><option value="Train">Train</option><option value="Taxi / Cab">Taxi / Cab</option><option value="Bus">Bus</option></select></div>
                        <div className="form-group"><label className="input-label">Distance (KM) - If Road Travel</label><input className="custom-input" type="number" name="distanceKm" value={expenseDetails.distanceKm} onChange={handleDetailChange} /></div>
                        <div className="form-group"><label className="input-label">Travel From *</label><input className="custom-input" name="travelFrom" value={expenseDetails.travelFrom} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Travel To *</label><input className="custom-input" name="travelTo" value={expenseDetails.travelTo} onChange={handleDetailChange} required /></div>
                        <div className="form-group grid-span-2"><label className="input-label">Booking Reference / PNR</label><input className="custom-input" name="bookingReference" value={expenseDetails.bookingReference} onChange={handleDetailChange} /></div>
                        <div className="form-group grid-span-2"><label className="input-label">Purpose of Travel *</label><input className="custom-input" name="purpose" value={expenseDetails.purpose} onChange={handleDetailChange} required /></div>
                    </>
                );
            case 'Accommodation':
                return (
                    <>
                        <div className="form-group grid-span-2"><label className="input-label">Hotel / Property Name *</label><input className="custom-input" name="hotelName" value={expenseDetails.hotelName} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">City *</label><input className="custom-input" name="city" value={expenseDetails.city} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Booking Reference</label><input className="custom-input" name="bookingReference" value={expenseDetails.bookingReference} onChange={handleDetailChange} /></div>
                        <div className="form-group"><label className="input-label">Check-In Date *</label><input className="custom-input" type="date" name="checkInDate" value={expenseDetails.checkInDate} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Check-Out Date *</label><input className="custom-input" type="date" name="checkOutDate" value={expenseDetails.checkOutDate} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Number of Nights (Auto)</label><input className="custom-input readonly-input" type="number" name="numberOfNights" value={expenseDetails.numberOfNights} readOnly /></div>
                    </>
                );
            case 'Regular Office Expense':
                return (
                    <>
                        <div className="form-group"><label className="input-label">Vendor Name *</label><input className="custom-input" name="vendorName" value={expenseDetails.vendorName} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Billing Cycle *</label><select className="swal2-select custom-select" name="billingCycle" value={expenseDetails.billingCycle} onChange={handleDetailChange}><option value="One-Time">One-Time</option><option value="Monthly">Monthly</option><option value="Annual">Annual</option></select></div>
                        <div className="form-group grid-span-2"><label className="input-label">Expense Description *</label><textarea className="custom-input" rows="2" name="expenseDescription" value={expenseDetails.expenseDescription} onChange={handleDetailChange} required /></div>
                    </>
                );
            default: return null;
        }
    };

    if (loading) return <div className="main-content">Loading Data...</div>;

    return (
        <div className="profile-container fade-in">
            <div className="page-header-left">
                <button className="gts-btn warning btn-small m-0" onClick={() => navigate(-1)}>
                    <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back
                </button>
                <h1 className="page-title header-no-margin">Edit Expense Details</h1>
            </div>
            
            <div className="purchase-form-card">
                <form onSubmit={handleSubmit} className="profile-form">
                    
                    {/* --- SECTION 1: CORE DETAILS --- */}
                    <div className="expense-form-section">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faInfoCircle} /> General Information
                        </div>
                        
                        <div className="purchase-grid">
                            <div className="form-group grid-span-2">
                                <label className="input-label">Expense Type</label>
                                <div className="expense-type-toggle">
                                    <label className={formData.expenseType === 'Project Expense' ? 'active' : ''}>
                                        <input type="radio" name="expenseType" value="Project Expense" onChange={handleMainChange} /> Project Expense
                                    </label>
                                    <label className={formData.expenseType === 'Regular Office Expense' ? 'active' : ''}>
                                        <input type="radio" name="expenseType" value="Regular Office Expense" onChange={handleMainChange} /> Regular Office
                                    </label>
                                </div>
                            </div>

                            {/* 👇 FIXED: REPLACED INPUT WITH PROJECTS DROPDOWN 👇 */}
                            {formData.expenseType === 'Project Expense' && (
                                <div className="form-group grid-span-2">
                                    <label className="input-label">Project Name *</label>
                                    <select className="swal2-select custom-select" name="projectName" required value={formData.projectName} onChange={handleMainChange}>
                                        <option value="">-- Select Project --</option>
                                        {projectsList.map(proj => (
                                            <option key={proj._id} value={proj.name}>{proj.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="form-group">
                                <label className="input-label">Expense Category *</label>
                                <select className="swal2-select custom-select" name="category" value={formData.category} onChange={handleMainChange} style={{ borderColor: '#215D7B' }}>
                                    <option value="Product / Item Purchase">Product / Item Purchase</option>
                                    <option value="Fuel Expense (Car / Bike)">Fuel Expense (Car / Bike)</option>
                                    <option value="Food Expense">Food Expense</option>
                                    <option value="Travel Expense">Travel Expense</option>
                                    <option value="Accommodation">Accommodation</option>
                                    <option value="Regular Office Expense">Regular Office Expense</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="input-label">Date of Transaction *</label>
                                <input className="custom-input" type="date" name="purchaseDate" required value={formData.purchaseDate} onChange={handleMainChange} />
                            </div>

                            <div className="form-group">
                                <label className="input-label"><FontAwesomeIcon icon={faRupeeSign}/> Amount (₹) *</label>
                                <input className="custom-input" type="number" name="amount" required placeholder="5000" value={formData.amount} onChange={handleMainChange} />
                            </div>

                            <div className="form-group">
                                <label className="input-label"><FontAwesomeIcon icon={faCreditCard}/> Payment Source (Who paid?) *</label>
                                <select className="swal2-select custom-select" name="paymentSourceId" value={formData.paymentSourceId} onChange={handleMainChange}>
                                    <option value={currentUser?.id || currentUser?._id || ''}>Myself (Reimburse Me)</option>
                                    {usersList.map(u => (
                                        <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group grid-span-2">
                                <label className="input-label"><FontAwesomeIcon icon={faTags}/> Description / Tags *</label>
                                <input className="custom-input" type="text" name="descriptionTags" required placeholder="e.g. N95 Mask, Train Ticket, Client Dinner" value={formData.descriptionTags} onChange={handleMainChange} />
                            </div>
                        </div>
                    </div>

                    {/* --- SECTION 2: DYNAMIC FIELDS --- */}
                    <div className="expense-form-section">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faListAlt} /> {formData.category} Details
                        </div>
                        <div className="purchase-grid">
                            {renderCategoryFields()}
                        </div>
                    </div>

                    {/* --- SECTION 3: ATTACHMENTS --- */}
                    <div className="expense-form-section mb-0">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faPaperclip} /> Update Attachments
                        </div>
                        <p className="text-small text-muted mb-20">Uploading new files will overwrite the existing ones.</p>

                        <div className="purchase-grid">
                            <div className="form-group expense-file-area">
                                <label className="input-label">Payment Screenshot / Bank Proof</label>
                                {existingFiles.paymentScreenshotUrl && (
                                    <a href={getFileUrl(existingFiles.paymentScreenshotUrl)} target="_blank" rel="noreferrer" className="text-primary fw-600 fs-12 mb-5 d-block">
                                        <FontAwesomeIcon icon={faExternalLinkAlt} /> View Current Proof
                                    </a>
                                )}
                                <input className="custom-file-input" type="file" accept="image/*,application/pdf" onChange={e => handleFileChange(e, 'paymentScreenshot')} />
                            </div>

                            <div className="form-group expense-file-area">
                                <label className="input-label">{getMediaLabel()}</label>
                                {existingFiles.expenseMediaUrls?.length > 0 && (
                                    <div className="fw-bold fs-12 mb-5 text-green">
                                        {existingFiles.expenseMediaUrls.length} Media File(s) Currently Uploaded
                                    </div>
                                )}
                                <input className="custom-file-input" type="file" multiple accept="image/*,video/*" onChange={e => handleFileChange(e, 'expenseMedia')} />
                                {newFiles.expenseMedia.length > 0 && (
                                    <p className="file-success-text">
                                        {newFiles.expenseMedia.length} new file(s) selected
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Actions & Progress Bar */}
                    <div className="profile-actions mt-30 flex-col gap-15">
                        
                        {/* UPLOAD PROGRESS BAR */}
                        {saving && uploadProgress > 0 && (
                            <div className="upload-progress-container">
                                <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                                <span className="upload-progress-text">Uploading updates... {uploadProgress}%</span>
                            </div>
                        )}

                        <button type="submit" className="save-btn purchase-submit-btn" disabled={saving}>
                            <FontAwesomeIcon icon={faSave} className="btn-icon" /> 
                            {saving ? 'Processing & Saving...' : 'Save Updates'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default EditPurchase;