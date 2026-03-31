import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api, { SERVER_URL } from '../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPaperclip, faTags, faRupeeSign, faCreditCard, faInfoCircle, faListAlt, faCheckCircle, faFilePdf, faFileVideo, faBuilding, faUser, faSpinner, faPlus } from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression';
import '../styles/App.css';
import '../styles/expenses.css';

const EditExpense = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user'));

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isCompressing, setIsCompressing] = useState(false);

    const [expenseStatus, setExpenseStatus] = useState('');
    const [adminFeedback, setAdminFeedback] = useState('');

    const [usersList, setUsersList] = useState([]);
    const [projectsList, setProjectsList] = useState([]);
    const [vendorsList, setVendorsList] = useState([]); 

    const [formData, setFormData] = useState({
        expenseType: 'Project Expense',
        category: 'Product / Item Purchase',
        expenseDate: '',
        amount: '',
        paymentSourceId: '',
        projectName: '',
        descriptionTags: '',
        vendorId: '', 
        isCompanyPayment: false 
    });

    const [expenseDetails, setExpenseDetails] = useState({
        productName: '', quantity: 1, unitPrice: '', expiryDate: '', storageLocation: '',
        inventoryItemStatus: 'Available', 
        inventoryAssignedTo: '',

        vehicleType: 'Car', vehicleNumber: '', odometerBefore: '', odometerAfter: '', kmTraveled: '', travelFrom: '', travelTo: '', purpose: '',
        travelMode: 'Flight', distanceKm: '', bookingReference: '',
        
        restaurantName: '', foodItemsOrdered: '', numberOfPeople: '',
        hotelName: '', city: '', checkInDate: '', checkOutDate: '', numberOfNights: '',
        
        vendorName: '', billingCycle: 'Monthly', expenseDescription: '', participantName: '', gstNumber: '',
        paymentDate: '', 

        utilityType: 'Electricity', billingMonth: '', invoiceNumber: '',
        repairType: 'Equipment / IT', serviceProvider: '', warrantyIncluded: 'No'
    });

    const [existingFiles, setExistingFiles] = useState({ paymentScreenshotUrls: [], expenseMediaUrls: [] });
    const [newFiles, setNewFiles] = useState({ paymentScreenshots: [], expenseMedia: [] });

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

            const venRes = await api.get('/vendors').catch(() => ({ data: [] }));
            setVendorsList(venRes.data);

            const res = await api.get(`/expenses/${id}`);
            const data = res.data;

            setExpenseStatus(data.status || '');
            setAdminFeedback(data.adminFeedback || '');

            setFormData({
                expenseType: data.expenseType || 'Project Expense',
                category: data.category || 'Product / Item Purchase',
                expenseDate: data.expenseDate ? new Date(data.expenseDate).toISOString().split('T')[0] : '',
                amount: data.amount || '',
                paymentSourceId: data.paymentSourceId?._id || data.paymentSourceId || currentUser.id,
                projectName: data.projectName || '',
                descriptionTags: data.descriptionTags || '',
                vendorId: data.vendorId?._id || data.vendorId || '', 
                isCompanyPayment: data.isCompanyPayment || false 
            });

            if (data.expenseDetails) {
                setExpenseDetails(prev => ({ ...prev, ...data.expenseDetails }));
            }

            setExistingFiles({
                paymentScreenshotUrls: data.paymentScreenshotUrls?.length > 0
                    ? data.paymentScreenshotUrls
                    : (data.paymentScreenshotUrl ? [data.paymentScreenshotUrl] : []),
                expenseMediaUrls: data.expenseMediaUrls || []
            });

        } catch (err) {
            Swal.fire('Error', 'Could not load expense details', 'error');
            navigate('/expenses');
        } finally {
            setLoading(false);
        }
    };

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
        // 👇 UPDATED: Support for the new checkbox toggle
        const { name, value, type, checked } = e.target;
        let updatedData = { ...formData };

        if (type === 'checkbox') {
            updatedData[name] = checked;
        } else {
            updatedData[name] = value;
        }

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
            const isImage = file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|heic|heif)$/i);

            if (isImage) {
                try {
                    const options = {
                        maxSizeMB: 1,
                        maxWidthOrHeight: 1920,
                        useWebWorker: false,
                        fileType: 'image/jpeg'
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

        setNewFiles(prev => ({ ...prev, [fieldName]: processedFiles }));
        setIsCompressing(false);
    };

    const handleAddVendor = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Add New Vendor',
            html: `
                <div style="display: flex; flex-direction: column; gap: 10px; text-align: left;">
                    <input id="swal-vname" class="swal2-input m-0" placeholder="Vendor Name *" required>
                    <input id="swal-vaddress" class="swal2-input m-0" placeholder="Vendor Address *" required>
                    <input id="swal-vgst" class="swal2-input m-0" placeholder="GST Number (Optional)" style="text-transform: uppercase;">
                    <input id="swal-vnotes" class="swal2-input m-0" placeholder="Notes / Bank Details (Optional)">
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Save Vendor',
            confirmButtonColor: '#16a34a',
            preConfirm: () => {
                const name = document.getElementById('swal-vname').value;
                const address = document.getElementById('swal-vaddress').value;
                if (!name || !address) {
                    Swal.showValidationMessage('Name and Address are required!');
                    return false;
                }
                return {
                    name, address,
                    gstNumber: document.getElementById('swal-vgst').value,
                    notes: document.getElementById('swal-vnotes').value
                };
            }
        });

        if (formValues) {
            try {
                const res = await api.post('/vendors', formValues);
                const updatedList = [...vendorsList, res.data].sort((a, b) => a.name.localeCompare(b.name));
                setVendorsList(updatedList);
                setFormData(prev => ({ ...prev, vendorId: res.data._id }));
                Swal.fire({ icon: 'success', title: 'Vendor Added!', timer: 1500, showConfirmButton: false });
            } catch (err) {
                Swal.fire('Error', err.response?.data?.message || 'Failed to add vendor', 'error');
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.amount || !formData.descriptionTags) {
            return Swal.fire('Required Fields', 'Amount and Description are required.', 'warning');
        }

        if (formData.category === 'Vendor Payment' && !formData.vendorId) {
            return Swal.fire('Missing Vendor', 'Please select a Vendor for this payment.', 'warning');
        }

        setSaving(true);
        setUploadProgress(0);

        try {
            const data = new FormData();
            Object.keys(formData).forEach(key => data.append(key, formData[key]));
            
            let relevantDetails = {};
            const d = expenseDetails;
            
            switch (formData.category) {
                case 'Vendor Payment': 
                    relevantDetails = { paymentDate: d.paymentDate }; break;
                case 'Participant Payment': 
                    relevantDetails = { participantName: d.participantName }; break;
                case 'Product / Item Purchase': 
                    relevantDetails = { productName: d.productName, quantity: d.quantity, unitPrice: d.unitPrice, inventoryItemStatus: d.inventoryItemStatus, storageLocation: d.inventoryItemStatus === 'Available' ? d.storageLocation : '', inventoryAssignedTo: d.inventoryItemStatus === 'Assigned' ? d.inventoryAssignedTo : '', expiryDate: d.expiryDate }; break;
                case 'Fuel Expense (Car / Bike)': 
                    relevantDetails = { vehicleType: d.vehicleType, vehicleNumber: d.vehicleNumber, travelFrom: d.travelFrom, travelTo: d.travelTo, odometerBefore: d.odometerBefore, odometerAfter: d.odometerAfter, kmTraveled: d.kmTraveled, purpose: d.purpose }; break;
                case 'Food Expense': 
                    relevantDetails = { restaurantName: d.restaurantName, foodItemsOrdered: d.foodItemsOrdered, numberOfPeople: d.numberOfPeople }; break;
                case 'Travel Expense': 
                    relevantDetails = { travelMode: d.travelMode, distanceKm: d.distanceKm, travelFrom: d.travelFrom, travelTo: d.travelTo, bookingReference: d.bookingReference, purpose: d.purpose }; break;
                case 'Accommodation': 
                    relevantDetails = { hotelName: d.hotelName, city: d.city, bookingReference: d.bookingReference, checkInDate: d.checkInDate, checkOutDate: d.checkOutDate, numberOfNights: d.numberOfNights }; break;
                case 'Regular Office Expense': 
                    relevantDetails = { vendorName: d.vendorName, billingCycle: d.billingCycle, expenseDescription: d.expenseDescription }; break;
                case 'Utility / Bills': 
                    relevantDetails = { utilityType: d.utilityType, billingMonth: d.billingMonth, invoiceNumber: d.invoiceNumber }; break;
                case 'Maintenance & Repairs': 
                    relevantDetails = { repairType: d.repairType, serviceProvider: d.serviceProvider, warrantyIncluded: d.warrantyIncluded }; break;
                default: 
                    relevantDetails = {};
            }

            data.append('expenseDetails', JSON.stringify(relevantDetails));

            if (newFiles.paymentScreenshots && newFiles.paymentScreenshots.length > 0) {
                for (let i = 0; i < newFiles.paymentScreenshots.length; i++) {
                    data.append('paymentScreenshots', newFiles.paymentScreenshots[i]);
                }
            }

            if (newFiles.expenseMedia && newFiles.expenseMedia.length > 0) {
                for (let i = 0; i < newFiles.expenseMedia.length; i++) {
                    data.append('expenseMedia', newFiles.expenseMedia[i]);
                }
            }

            await api.put(`/expenses/${id}`, data, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(percentCompleted);
                }
            });

            Swal.fire({ icon: 'success', title: expenseStatus === 'Returned' ? 'Resubmitted' : 'Update Saved', timer: 1500, showConfirmButton: false });
            navigate('/expenses');
        } catch (err) {
            Swal.fire('Error', 'Failed to update expense', 'error');
        } finally {
            setSaving(false);
            setUploadProgress(0);
        }
    };

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

    const renderThumbnail = (url, index, titlePrefix) => {
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
                <div key={index} className="existing-file-card" onClick={() => viewSingleFile(url, `${titlePrefix} ${index + 1}`)}>
                    <img src={fullUrl} alt="Thumbnail" className="existing-file-thumb" />
                </div>
            );
        }

        return (
            <div key={index} className="existing-file-card icon-card" onClick={() => viewSingleFile(url, `${titlePrefix} ${index + 1}`)}>
                {iconContent}
                <span className="file-type-label">{isPdf ? 'PDF' : 'VIDEO'}</span>
            </div>
        );
    };

    const getMediaLabel = () => {
        switch (formData.category) {
            case 'Vendor Payment': return 'Upload Vendor Invoice / Bill (Required)'; 
            case 'Fuel Expense (Car / Bike)': return 'Odometer Image(s) / Fuel Station Receipt';
            case 'Food Expense': return 'Order Screenshot / Restaurant Bill';
            case 'Travel Expense': return 'Travel Receipt / Ticket Screenshot';
            case 'Accommodation': return 'Hotel Receipt / Invoice';
            case 'Product / Item Purchase': return 'Product Photo(s) / Video(s)';
            case 'Utility / Bills': return 'Utility Bill / Invoice';
            case 'Maintenance & Repairs': return 'Service Receipt / Invoice';
            case 'Regular Office Expense': return 'Supporting Document / Bill';
            case 'Participant Payment': return 'Payment Receipt / Acknowledgment';
            default: return 'Expense Media (Photos/Videos)';
        }
    };

    const renderCategoryFields = () => {
        switch (formData.category) {
            case 'Vendor Payment':
                return (
                    <>
                        <div className="form-group grid-span-2">
                            <label className="input-label"><FontAwesomeIcon icon={faBuilding} /> Select Vendor *</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <select className="swal2-select custom-select m-0" name="vendorId" value={formData.vendorId} onChange={handleMainChange} required style={{ flex: 1 }}>
                                    <option value="">-- Select a Vendor from Database --</option>
                                    {vendorsList.map(v => (
                                        <option key={v._id} value={v._id}>
                                            {v.name} {v.gstNumber ? `(GST: ${v.gstNumber})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <button type="button" className="gts-btn success btn-small m-0" onClick={handleAddVendor} title="Add New Vendor to Database">
                                    <FontAwesomeIcon icon={faPlus} /> Add New
                                </button>
                            </div>
                        </div>
                        {formData.isCompanyPayment && (
                            <div className="form-group grid-span-2">
                                <label className="input-label" style={{ color: '#16a34a' }}>Date of Payment (Accounts) - <span style={{fontWeight: 'normal', color: '#64748b'}}>If already paid via Company Card</span></label>
                                <input className="custom-input" type="date" name="paymentDate" value={expenseDetails.paymentDate} onChange={handleDetailChange} />
                            </div>
                        )}
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
                        <div className="form-group"><label className="input-label">Quantity *</label><input className="custom-input" type="number" min="1" name="quantity" value={expenseDetails.quantity} onChange={handleDetailChange} required /></div>
                        <div className="form-group"><label className="input-label">Unit Price (₹) *</label><input className="custom-input" type="number" name="unitPrice" value={expenseDetails.unitPrice} onChange={handleDetailChange} required /></div>
                        
                        <div className="form-group grid-span-2">
                            <label className="input-label" style={{ color: '#0f172a' }}>Will this item be added to Company Inventory?</label>
                            <div className="expense-type-toggle" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label className={expenseDetails.inventoryItemStatus === 'Available' ? 'active' : ''} style={{ width: '100%', justifyContent: 'flex-start' }}>
                                    <input type="radio" name="inventoryItemStatus" value="Available" onChange={handleDetailChange} /> Yes, Keep in Office (Available)
                                </label>
                                <label className={expenseDetails.inventoryItemStatus === 'Assigned' ? 'active' : ''} style={{ width: '100%', justifyContent: 'flex-start' }}>
                                    <input type="radio" name="inventoryItemStatus" value="Assigned" onChange={handleDetailChange} /> Yes, Assign to Employee
                                </label>
                                <label className={expenseDetails.inventoryItemStatus === 'Do Not Track' ? 'active' : ''} style={{ width: '100%', justifyContent: 'flex-start', background: expenseDetails.inventoryItemStatus === 'Do Not Track' ? '#f1f5f9' : '', color: expenseDetails.inventoryItemStatus === 'Do Not Track' ? '#64748b' : '' }}>
                                    <input type="radio" name="inventoryItemStatus" value="Do Not Track" onChange={handleDetailChange} /> No, Consumable / Do Not Track
                                </label>
                            </div>
                        </div>

                        {expenseDetails.inventoryItemStatus === 'Available' && (
                            <div className="form-group grid-span-2"><label className="input-label">Storage Location *</label><input className="custom-input" name="storageLocation" value={expenseDetails.storageLocation} onChange={handleDetailChange} placeholder="e.g. Office Room A" required /></div>
                        )}
                        
                        {expenseDetails.inventoryItemStatus === 'Assigned' && (
                            <div className="form-group grid-span-2"><label className="input-label">Assign To Employee *</label>
                                <select className="swal2-select custom-select" name="inventoryAssignedTo" value={expenseDetails.inventoryAssignedTo} onChange={handleDetailChange} required>
                                    <option value="">-- Select Employee --</option>
                                    {usersList.map(u => <option key={u._id} value={u._id}>{u.name} ({u.role})</option>)}
                                </select>
                            </div>
                        )}

                        <div className="form-group grid-span-2"><label className="input-label">Expiry Date (If applicable)</label><input className="custom-input" type="date" name="expiryDate" value={expenseDetails.expiryDate} onChange={handleDetailChange} /></div>
                    </>
                );
            case 'Utility / Bills':
                return (
                    <>
                        <div className="form-group">
                            <label className="input-label">Utility Type *</label>
                            <select className="swal2-select custom-select" name="utilityType" value={expenseDetails.utilityType} onChange={handleDetailChange}>
                                <option value="Electricity">Electricity</option>
                                <option value="Internet / Wi-Fi">Internet / Wi-Fi</option>
                                <option value="Water">Water</option>
                                <option value="Software Subscription">Software Subscription</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div className="form-group"><label className="input-label">Billing Month / Period</label><input className="custom-input" type="text" placeholder="e.g. Oct 2026" name="billingMonth" value={expenseDetails.billingMonth} onChange={handleDetailChange} /></div>
                        <div className="form-group grid-span-2"><label className="input-label">Invoice / Account Number</label><input className="custom-input" name="invoiceNumber" value={expenseDetails.invoiceNumber} onChange={handleDetailChange} /></div>
                    </>
                );
            case 'Maintenance & Repairs':
                return (
                    <>
                        <div className="form-group">
                            <label className="input-label">Repair Category *</label>
                            <select className="swal2-select custom-select" name="repairType" value={expenseDetails.repairType} onChange={handleDetailChange}>
                                <option value="Equipment / IT">Equipment / IT</option>
                                <option value="Facility / Office">Facility / Office</option>
                                <option value="Vehicle">Vehicle</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="input-label">Warranty Included?</label>
                            <select className="swal2-select custom-select" name="warrantyIncluded" value={expenseDetails.warrantyIncluded} onChange={handleDetailChange}>
                                <option value="No">No</option>
                                <option value="Yes">Yes</option>
                            </select>
                        </div>
                        <div className="form-group grid-span-2"><label className="input-label">Service Provider / Technician Name *</label><input className="custom-input" name="serviceProvider" value={expenseDetails.serviceProvider} onChange={handleDetailChange} required /></div>
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

    if (loading) return <div className="main-content">Loading Data...</div>;

    return (
        <div className="profile-container fade-in">
            <div className="page-header-left">
                <button className="gts-btn warning btn-small m-0" onClick={() => navigate(-1)}>
                    <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back
                </button>
                <h1 className="page-title header-no-margin">Edit Expense Details</h1>
            </div>

            <div className="expense-form-card">
                
                {expenseStatus === 'Returned' && adminFeedback && (
                    <div className="alert-message warning mb-20" style={{ padding: '12px', borderRadius: '8px', fontSize: '13px', background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b' }}>
                        <FontAwesomeIcon icon={faInfoCircle} style={{ marginRight: '6px' }} /> 
                        <strong>Returned for Correction:</strong> {adminFeedback}
                    </div>
                )}

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
                                    <option value="Utility / Bills">Utility / Bills</option>
                                    <option value="Maintenance & Repairs">Maintenance & Repairs</option>
                                    <option value="Fuel Expense (Car / Bike)">Fuel Expense (Car / Bike)</option>
                                    <option value="Food Expense">Food Expense</option>
                                    <option value="Travel Expense">Travel Expense</option>
                                    <option value="Accommodation">Accommodation</option>

                                    {formData.expenseType === 'Project Expense' && (
                                        <>
                                            <option value="Participant Payment">Participant Payment</option>
                                        </>
                                    )}
                                    <option value="Vendor Payment">Vendor Payment</option>
                                    {formData.expenseType === 'Regular Office Expense' && (
                                        <option value="Regular Office Expense">Regular Office Expense</option>
                                    )}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="input-label">
                                    {formData.category === 'Vendor Payment' ? 'Date of Invoice *' : 'Date of Transaction *'}
                                </label>
                                <input className="custom-input" type="date" name="expenseDate" required value={formData.expenseDate} onChange={handleMainChange} />
                            </div>

                            <div className="form-group">
                                <label className="input-label"><FontAwesomeIcon icon={faRupeeSign} /> Amount (₹) *</label>
                                <input className="custom-input" type="number" name="amount" required placeholder="5000" value={formData.amount} onChange={handleMainChange} />
                            </div>

                            {/* 👇 NEW: Sleek, inline toggle switch for Payment Method */}
                            <div className="form-group grid-span-2" style={{ marginTop: '5px', marginBottom: '5px' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>
                                    <div style={{
                                        position: 'relative', width: '44px', height: '24px', 
                                        background: formData.isCompanyPayment ? '#16a34a' : '#cbd5e1', 
                                        borderRadius: '24px', transition: 'background 0.3s ease'
                                    }}>
                                        <div style={{
                                            position: 'absolute', top: '2px', left: formData.isCompanyPayment ? '22px' : '2px',
                                            width: '20px', height: '20px', background: 'white', borderRadius: '50%',
                                            transition: 'left 0.3s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                        }} />
                                    </div>
                                    <span style={{ fontWeight: '600', color: '#334155', fontSize: '14px' }}>Is company Account ?</span>
                                    <input 
                                        type="checkbox" 
                                        name="isCompanyPayment" 
                                        checked={formData.isCompanyPayment} 
                                        onChange={handleMainChange} 
                                        style={{ display: 'none' }} 
                                    />
                                </label>
                            </div>

                            {!formData.isCompanyPayment && (
                                <div className="form-group">
                                    <label className="input-label"><FontAwesomeIcon icon={faCreditCard} /> Payment Source (Who paid?) *</label>
                                    <select className="swal2-select custom-select" name="paymentSourceId" value={formData.paymentSourceId} onChange={handleMainChange} required>
                                        <option value={currentUser?.id || currentUser?._id || ''}>Myself (Reimburse Me)</option>
                                        {usersList.map(u => (
                                            <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
                                        ))}
                                    </select>
                                </div>
                            )}

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

                        {(existingFiles.paymentScreenshotUrls.length > 0 || existingFiles.expenseMediaUrls.length > 0) && (
                            <div className="alert-message warning mb-20" style={{ padding: '12px', borderRadius: '8px', fontSize: '13px', background: '#fffbeb', border: '1px solid #fef3c7', color: '#b45309' }}>
                                <FontAwesomeIcon icon={faInfoCircle} /> <strong>Note:</strong> Uploading new files will overwrite your existing attachments. Leave the upload fields empty to keep your current files.
                            </div>
                        )}

                        <div className="expense-grid">

                            <div className="form-group expense-file-area">
                                <label className="input-label" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>
                                    Payment Screenshot / Bank Proof(s) (Optional)
                                </label>

                                {existingFiles.paymentScreenshotUrls?.length > 0 && (
                                    <div className="mb-15">
                                        <div className="text-small text-muted mb-10 fw-600">Currently Saved Files:</div>
                                        <div className="existing-file-gallery">
                                            {existingFiles.paymentScreenshotUrls.map((url, idx) => renderThumbnail(url, idx, 'Proof'))}
                                        </div>
                                    </div>
                                )}

                                <div className="upload-container-new">
                                    <div className="text-small text-muted mb-5 fw-600">Upload New Files (Optional):</div>
                                    <input 
                                        className="custom-file-input" 
                                        type="file" 
                                        multiple 
                                        accept="image/*,application/pdf" 
                                        capture="environment"
                                        onChange={e => handleFileChange(e, 'paymentScreenshots')} 
                                    />

                                    {isCompressing ? (
                                        <div className="file-success-badge mt-10" style={{ background: '#fef3c7', color: '#b45309' }}>
                                            <FontAwesomeIcon icon={faSpinner} spin /> Compressing...
                                        </div>
                                    ) : newFiles.paymentScreenshots.length > 0 && (
                                        <div className="file-success-badge mt-10">
                                            <FontAwesomeIcon icon={faCheckCircle} /> {newFiles.paymentScreenshots.length} new file(s) ready
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="form-group expense-file-area">
                                <label className="input-label" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>
                                    {getMediaLabel()}
                                </label>

                                {existingFiles.expenseMediaUrls?.length > 0 && (
                                    <div className="mb-15">
                                        <div className="text-small text-muted mb-10 fw-600">Currently Saved Files:</div>
                                        <div className="existing-file-gallery">
                                            {existingFiles.expenseMediaUrls.map((url, idx) => renderThumbnail(url, idx, 'Media'))}
                                        </div>
                                    </div>
                                )}

                                <div className="upload-container-new">
                                    <div className="text-small text-muted mb-5 fw-600">Upload New Files:</div>
                                    <input 
                                        className="custom-file-input" 
                                        type="file" 
                                        multiple 
                                        accept="image/*,video/*" 
                                        capture="environment"
                                        onChange={e => handleFileChange(e, 'expenseMedia')} 
                                    />

                                    {isCompressing ? (
                                        <div className="file-success-badge mt-10" style={{ background: '#fef3c7', color: '#b45309' }}>
                                            <FontAwesomeIcon icon={faSpinner} spin /> Compressing...
                                        </div>
                                    ) : newFiles.expenseMedia.length > 0 && (
                                        <div className="file-success-badge mt-10">
                                            <FontAwesomeIcon icon={faCheckCircle} /> {newFiles.expenseMedia.length} new file(s) ready
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
                                <span className="upload-progress-text">Uploading updates... {uploadProgress}%</span>
                            </div>
                        )}

                        <button type="submit" className="save-btn expense-submit-btn" disabled={saving || isCompressing}>
                            <FontAwesomeIcon icon={faSave} className="btn-icon" />
                            {saving ? 'Processing & Saving...' : isCompressing ? 'Compressing Files...' : expenseStatus === 'Returned' ? 'Resubmit for Approval' : 'Save Updates'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default EditExpense;