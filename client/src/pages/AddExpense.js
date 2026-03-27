import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// 👇 NEW: Added faSpinner for loading state
import { faArrowLeft, faSave, faPaperclip, faTags, faRupeeSign, faCreditCard, faInfoCircle, faListAlt, faUser, faBuilding, faSpinner } from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression'; // 👇 NEW: Import compression library
import '../styles/App.css';
import '../styles/expenses.css';

const AddExpense = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user'));

    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isCompressing, setIsCompressing] = useState(false); // 👇 Track compression

    const [usersList, setUsersList] = useState([]);
    const [projectsList, setProjectsList] = useState([]);

    const [formData, setFormData] = useState({
        expenseType: 'Project Expense',
        category: 'Product / Item Purchase',
        expenseDate: new Date().toISOString().split('T')[0],
        amount: '',
        paymentSourceId: currentUser?.id || currentUser?._id || '',
        projectName: '',
        descriptionTags: ''
    });

    const [expenseDetails, setExpenseDetails] = useState({
        productName: '', quantity: 1, unitPrice: '', expiryDate: '', storageLocation: '',
        vehicleType: 'Car', vehicleNumber: '', odometerBefore: '', odometerAfter: '', kmTraveled: '', travelFrom: '', travelTo: '', purpose: '',
        restaurantName: '', foodItemsOrdered: '', numberOfPeople: '',
        travelMode: 'Flight', distanceKm: '', bookingReference: '',
        hotelName: '', city: '', checkInDate: '', checkOutDate: '', numberOfNights: '',
        vendorName: '', billingCycle: 'Monthly', expenseDescription: '',
        participantName: '',
        gstNumber: ''
    });

    const [files, setFiles] = useState({ paymentScreenshots: [], expenseMedia: [] });

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const userRes = await api.get('/employees/payment-sources');
                setUsersList(userRes.data);

                const projRes = await api.get('/projects');
                setProjectsList(projRes.data);
            } catch (err) {
                console.error("Could not fetch dropdown data", err);
            }
        };
        fetchInitialData();
    }, []);

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

    const handleMainChange = (e) => {
        const { name, value } = e.target;
        let updatedData = { ...formData, [name]: value };

        if (name === 'expenseType') {
            if (value === 'Project Expense' && updatedData.category === 'Regular Office Expense') {
                updatedData.category = 'Product / Item Purchase';
            } else if (value === 'Regular Office Expense' && ['Participant Payment', 'Vendor Payment'].includes(updatedData.category)) {
                updatedData.category = 'Regular Office Expense';
            }
        }
        setFormData(updatedData);
    };

    const handleDetailChange = (e) => setExpenseDetails({ ...expenseDetails, [e.target.name]: e.target.value });

    const handleFileChange = async (e, fieldName) => {
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

        setFiles(prev => ({ ...prev, [fieldName]: processedFiles })); // 👇 Keeps other fields intact
        setIsCompressing(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.amount || !formData.descriptionTags || files.paymentScreenshots.length === 0) {
            return Swal.fire('Required Fields', 'Amount, Description, and at least one Payment Screenshot are required.', 'warning');
        }

        setLoading(true);
        setUploadProgress(0);

        try {
            const data = new FormData();
            Object.keys(formData).forEach(key => data.append(key, formData[key]));
            data.append('expenseDetails', JSON.stringify(expenseDetails));

            if (files.paymentScreenshots && files.paymentScreenshots.length > 0) {
                for (let i = 0; i < files.paymentScreenshots.length; i++) {
                    data.append('paymentScreenshots', files.paymentScreenshots[i]);
                }
            }

            if (files.expenseMedia && files.expenseMedia.length > 0) {
                for (let i = 0; i < files.expenseMedia.length; i++) {
                    data.append('expenseMedia', files.expenseMedia[i]);
                }
            }

            await api.post('/expenses', data, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(percentCompleted);
                }
            });

            Swal.fire({ icon: 'success', title: 'Expense Logged for Approval', timer: 1500, showConfirmButton: false });
            navigate('/expenses');
        } catch (err) {
            Swal.fire('Error', 'Failed to save expense', 'error');
        } finally {
            setLoading(false);
            setUploadProgress(0);
        }
    };

    const getMediaLabel = () => {
        switch (formData.category) {
            case 'Fuel Expense (Car / Bike)': return 'Odometer Image(s) / Fuel Station Receipt';
            case 'Food Expense': return 'Order Screenshot / Restaurant Bill';
            case 'Travel Expense': return 'Travel Receipt / Ticket Screenshot';
            case 'Accommodation': return 'Hotel Receipt / Invoice';
            case 'Product / Item Purchase': return 'Product Photo(s) / Video(s)';
            case 'Regular Office Expense': return 'Supporting Document / Bill';
            case 'Participant Payment': return 'Payment Receipt / Acknowledgment';
            case 'Vendor Payment': return 'Vendor Invoice / Bill';
            default: return 'Expense Media (Photos/Videos)';
        }
    };

    const renderCategoryFields = () => {
        switch (formData.category) {
            case 'Vendor Payment':
                return (
                    <>
                        <div className="form-group"><label className="input-label"><FontAwesomeIcon icon={faBuilding} /> Vendor Name *</label><input className="custom-input" name="vendorName" value={expenseDetails.vendorName} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">GST Number</label><input className="custom-input" name="gstNumber" value={expenseDetails.gstNumber} onChange={handleDetailChange} placeholder="Optional" style={{ textTransform: 'uppercase' }} /></div>
                    </>
                );
            case 'Participant Payment':
                return (
                    <div className="form-group grid-span-2">
                        <label className="input-label"><FontAwesomeIcon icon={faUser} /> Participant Name *</label>
                        <input className="custom-input" name="participantName" value={expenseDetails.participantName} onChange={handleDetailChange} placeholder="Enter the participant's full name" required />
                    </div>
                );
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
                        <div className="form-group grid-span-2"><label className="input-label">Restaurant / Platform Name *</label><input className="custom-input" name="restaurantName" placeholder="e.g. Zomato, Swiggy" value={expenseDetails.restaurantName} onChange={handleDetailChange} required /></div>
                        <div className="form-group grid-span-2"><label className="input-label">Food Items Ordered *</label><textarea className="custom-input" rows="2" name="foodItemsOrdered" value={expenseDetails.foodItemsOrdered} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Number of People</label><input className="custom-input" type="number" name="numberOfPeople" value={expenseDetails.numberOfPeople} onChange={handleDetailChange} /></div>
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

    return (
        <div className="profile-container fade-in">
            <div className="page-header-left">
                <button className="gts-btn warning btn-small m-0" onClick={() => navigate('/expenses')}>
                    <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back
                </button>
                <h1 className="page-title header-no-margin">Log New Expense</h1>
            </div>

            <div className="expense-form-card">
                <form onSubmit={handleSubmit} className="profile-form">

                    {/* --- SECTION 1: CORE DETAILS --- */}
                    <div className="expense-form-section">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faInfoCircle} /> General Information
                        </div>

                        <div className="expense-grid">
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

                            {formData.expenseType === 'Project Expense' && (
                                <div className="form-group">
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
                                <select
                                    className="swal2-select custom-select"
                                    name="category"
                                    value={formData.category}
                                    onChange={handleMainChange}
                                    style={{ borderColor: '#215D7B' }}
                                >
                                    <option value="Product / Item Purchase">Product / Item Purchase</option>
                                    <option value="Fuel Expense (Car / Bike)">Fuel Expense (Car / Bike)</option>
                                    <option value="Food Expense">Food Expense</option>
                                    <option value="Travel Expense">Travel Expense</option>
                                    <option value="Accommodation">Accommodation</option>

                                    {formData.expenseType === 'Project Expense' && (
                                        <>
                                            <option value="Participant Payment">Participant Payment</option>
                                            <option value="Vendor Payment">Vendor Payment</option>
                                        </>
                                    )}
                                    {formData.expenseType === 'Regular Office Expense' && (
                                        <option value="Regular Office Expense">Regular Office Expense</option>
                                    )}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="input-label">Date of Transaction *</label>
                                <input className="custom-input" type="date" name="expenseDate" required value={formData.expenseDate} onChange={handleMainChange} />
                            </div>

                            <div className="form-group">
                                <label className="input-label"><FontAwesomeIcon icon={faRupeeSign} /> Amount (₹) *</label>
                                <input className="custom-input" type="number" name="amount" required placeholder="5000" value={formData.amount} onChange={handleMainChange} />
                            </div>

                            <div className="form-group">
                                <label className="input-label"><FontAwesomeIcon icon={faCreditCard} /> Payment Source (Who paid?) *</label>
                                <select className="swal2-select custom-select" name="paymentSourceId" value={formData.paymentSourceId} onChange={handleMainChange}>
                                    <option value={currentUser?.id || currentUser?._id || ''}>Myself</option>
                                    {usersList.map(u => (
                                        <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group grid-span-2">
                                <label className="input-label"><FontAwesomeIcon icon={faTags} /> Description / Tags *</label>
                                <input className="custom-input" type="text" name="descriptionTags" required placeholder="e.g. N95 Mask, Train Ticket, Client Dinner" value={formData.descriptionTags} onChange={handleMainChange} />
                            </div>
                        </div>
                    </div>

                    {/* --- SECTION 2: DYNAMIC FIELDS --- */}
                    <div className="expense-form-section">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faListAlt} /> {formData.category} Details
                        </div>
                        <div className="expense-grid">
                            {renderCategoryFields()}
                        </div>
                    </div>

                    {/* --- SECTION 3: ATTACHMENTS --- */}
                    <div className="expense-form-section mb-0">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faPaperclip} /> Attachments & Proof
                        </div>

                        <div className="expense-grid">
                            <div className="form-group expense-file-area">
                                <label className="input-label">Payment Screenshot / Bank Proof(s) *</label>
                                <input className="custom-file-input" type="file" multiple accept="image/*,application/pdf" required onChange={e => handleFileChange(e, 'paymentScreenshots')} />

                                {/* 👇 Show compressing state for proofs */}
                                {isCompressing ? (
                                    <p className="file-success-text" style={{ color: '#d97706', marginTop: '5px', fontWeight: '600' }}>
                                        <FontAwesomeIcon icon={faSpinner} spin /> Compressing images...
                                    </p>
                                ) : files.paymentScreenshots.length > 0 && (
                                    <p className="file-success-text" style={{ fontSize: '12px', color: '#16a34a', marginTop: '5px', fontWeight: '600' }}>
                                        {files.paymentScreenshots.length} proof file(s) ready
                                    </p>
                                )}
                            </div>

                            <div className="form-group expense-file-area">
                                <label className="input-label">{getMediaLabel()}</label>
                                <input className="custom-file-input" type="file" multiple accept="image/*,video/*" onChange={e => handleFileChange(e, 'expenseMedia')} />

                                {/* 👇 Show compressing state for media */}
                                {isCompressing ? (
                                    <p className="file-success-text" style={{ color: '#d97706', marginTop: '5px', fontWeight: '600' }}>
                                        <FontAwesomeIcon icon={faSpinner} spin /> Compressing images...
                                    </p>
                                ) : files.expenseMedia.length > 0 && (
                                    <p className="file-success-text" style={{ fontSize: '12px', color: '#16a34a', marginTop: '5px', fontWeight: '600' }}>
                                        {files.expenseMedia.length} media file(s) ready
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Actions & Progress Bar */}
                    <div className="profile-actions mt-30" style={{ flexDirection: 'column', gap: '15px' }}>

                        {loading && uploadProgress > 0 && (
                            <div className="upload-progress-container">
                                <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                                <span className="upload-progress-text">Uploading to server... {uploadProgress}%</span>
                            </div>
                        )}

                        {/* 👇 Disable button if loading or compressing */}
                        <button type="submit" className="save-btn purchase-submit-btn" disabled={loading || isCompressing}>
                            <FontAwesomeIcon icon={faSave} className="btn-icon" />
                            {loading ? 'Processing & Uploading...' : isCompressing ? 'Compressing Files...' : 'Submit Expense for Approval'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default AddExpense;