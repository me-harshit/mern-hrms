import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import api from '../../utils/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faArrowLeft, faSave, faPaperclip, faTags, faRupeeSign, faCreditCard, 
    faInfoCircle, faListAlt, faTimes, faUser, faBuilding, faSpinner, faCheckCircle, 
    faPlus, faSearch, faTrash, faChevronDown, faChevronUp, faLink, faBoxOpen
} from '@fortawesome/free-solid-svg-icons';
import imageCompression from 'browser-image-compression'; 
import SearchSelect from '../../components/SearchSelect'; 
import '../../styles/App.css';
import '../../styles/expenses.css';

const AddExpense = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user'));
    const userRole = currentUser?.role || 'EMPLOYEE';

    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isCompressing, setIsCompressing] = useState(false); 

    const [usersList, setUsersList] = useState([]);
    const [allEmployeesList, setAllEmployeesList] = useState([]); 
    const [projectsList, setProjectsList] = useState([]);
    const [vendorsList, setVendorsList] = useState([]); 
    
    // Unbilled Inventory States
    const [unbilledInventory, setUnbilledInventory] = useState([]);
    const [showUnbilledModal, setShowUnbilledModal] = useState(false);
    const [unbilledSelections, setUnbilledSelections] = useState({});
    
    const [systemSettings, setSystemSettings] = useState({
        inventoryCatAThreshold: 500,
        inventoryCatBThreshold: 100
    });

    const [formData, setFormData] = useState({
        expenseType: 'Project Expense',
        category: 'Product / Item Purchase',
        expenseDate: new Date().toISOString().split('T')[0],
        amount: '',
        paymentSourceId: currentUser?.id || currentUser?._id || '',
        projectName: '',
        descriptionTags: '',
        vendorId: '', 
        isCompanyPayment: false 
    });

    const defaultProduct = {
        productName: '', quantity: 1, unitPrice: '', expiryDate: '', storageLocation: '',
        inventoryItemStatus: 'Available', inventoryAssignedTo: '', isLinkedItem: false
    };

    const [productList, setProductList] = useState([{ ...defaultProduct }]);
    const [expandedItemIndex, setExpandedItemIndex] = useState(0);

    const [expenseDetails, setExpenseDetails] = useState({
        vehicleType: 'Car', vehicleNumber: '', odometerBefore: '', odometerAfter: '', kmTraveled: '', travelFrom: '', travelTo: '', purpose: '',
        travelMode: 'Flight', distanceKm: '', bookingReference: '',
        restaurantName: '', foodItemsOrdered: '', numberOfPeople: '',
        hotelName: '', city: '', checkInDate: '', checkOutDate: '', numberOfNights: '',
        vendorName: '', billingCycle: 'Monthly', expenseDescription: '', participantName: '', 
        gstNumber: '', paymentDate: '', 
        utilityType: 'Electricity', billingMonth: '', invoiceNumber: '',
        repairType: 'Equipment / IT', serviceProvider: '', warrantyIncluded: 'No'
    });

    const [files, setFiles] = useState({ paymentScreenshots: [], expenseMedia: [] });

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [userRes, allEmpRes, projRes, venRes, settingsRes, unbilledRes] = await Promise.all([
                    api.get('/employees/payment-sources'),
                    api.get('/employees/directory').catch(() => ({ data: [] })),
                    api.get('/projects'),
                    api.get('/vendors').catch(() => ({ data: [] })),
                    api.get('/settings').catch(() => ({ data: {} })),
                    api.get('/inventory/unbilled').catch(() => ({ data: [] }))
                ]);

                setUsersList(userRes.data);
                const employeeArray = Array.isArray(allEmpRes.data) ? allEmpRes.data : (allEmpRes.data?.data || []);
                setAllEmployeesList(employeeArray);
                setProjectsList(projRes.data);
                setVendorsList(venRes.data);
                setUnbilledInventory(Array.isArray(unbilledRes.data) ? unbilledRes.data : []);
                
                if(settingsRes.data) {
                    setSystemSettings({
                        inventoryCatAThreshold: settingsRes.data.inventoryCatAThreshold || 500,
                        inventoryCatBThreshold: settingsRes.data.inventoryCatBThreshold || 100
                    });
                }
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

    const handleProductChange = (index, field, value) => {
        const updatedList = [...productList];
        updatedList[index][field] = value;
        
        if (field === 'inventoryItemStatus') {
            if (value === 'Available') updatedList[index].inventoryAssignedTo = '';
            if (value === 'Assigned') updatedList[index].storageLocation = '';
            if (value === 'Do Not Track' || value === 'Linked') {
                updatedList[index].storageLocation = '';
                updatedList[index].inventoryAssignedTo = '';
            }
        }
        setProductList(updatedList);
    };

    const addProduct = () => {
        setProductList([...productList, { ...defaultProduct }]);
        setExpandedItemIndex(productList.length);
    };

    const removeProduct = (index) => {
        if (productList.length === 1) return Swal.fire('Wait', 'You must have at least one product in the list.', 'info');
        const updatedList = productList.filter((_, i) => i !== index);
        setProductList(updatedList);
        
        if (expandedItemIndex === index) {
            setExpandedItemIndex(Math.max(0, index - 1));
        } else if (expandedItemIndex > index) {
            setExpandedItemIndex(expandedItemIndex - 1);
        }
    };

    const openUnbilledModal = () => {
        if (unbilledInventory.length === 0) {
            return Swal.fire('All Clear!', 'There are no unbilled inventory items waiting in the system.', 'info');
        }
        const initialSelections = {};
        unbilledInventory.forEach(item => {
            initialSelections[item.itemName] = { selected: false, qty: item.totalUnbilledQty };
        });
        setUnbilledSelections(initialSelections);
        setShowUnbilledModal(true);
    };

    const handleConfirmLink = () => {
        const newLinkedProducts = [];
        Object.keys(unbilledSelections).forEach(itemName => {
            if (unbilledSelections[itemName].selected) {
                newLinkedProducts.push({
                    ...defaultProduct,
                    productName: itemName,
                    quantity: unbilledSelections[itemName].qty,
                    isLinkedItem: true,
                    inventoryItemStatus: 'Linked' 
                });
            }
        });

        if (newLinkedProducts.length > 0) {
            const currentList = productList.length === 1 && !productList[0].productName ? [] : productList;
            setProductList([...currentList, ...newLinkedProducts]);
            setExpandedItemIndex(currentList.length); 
        }
        setShowUnbilledModal(false);
    };

    const getPaymentSourceOptions = () => {
        const optionsPool = (userRole === 'ADMIN' || userRole === 'ACCOUNTS') ? allEmployeesList : usersList;
        const currentUserId = currentUser.id || currentUser._id;
        const filteredPool = optionsPool.filter(u => String(u._id) !== String(currentUserId));
        return [
            { _id: currentUserId, name: 'Myself (Reimburse Me)', role: userRole },
            ...filteredPool
        ];
    };

    const handleFileChange = async (e, fieldName) => {
        const selectedFiles = Array.from(e.target.files);
        const processedFiles = [];
        
        setIsCompressing(true);

        for (let file of selectedFiles) {
            const isImage = file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|heic|heif)$/i);
            const isPdf = file.type === 'application/pdf';

            if (isPdf && file.size > 5 * 1024 * 1024) { 
                Swal.fire('Large File Detected', `The PDF "${file.name}" is quite large and might be rejected by the server. Consider compressing it first.`, 'warning');
            }

            if (isImage) {
                try {
                    const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: false, fileType: 'image/jpeg' };
                    const compressedBlob = await imageCompression(file, options);
                    const safeName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                    const safelyNamedFile = new File([compressedBlob], safeName, { type: 'image/jpeg', lastModified: Date.now() });
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

        setFiles(prev => ({ ...prev, [fieldName]: processedFiles })); 
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
                return { name, address, gstNumber: document.getElementById('swal-vgst').value, notes: document.getElementById('swal-vnotes').value };
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

        let hasLinkedItems = false; 

        if (formData.category === 'Product / Item Purchase') {
            for (let i = 0; i < productList.length; i++) {
                const prod = productList[i];
                if (prod.isLinkedItem) hasLinkedItems = true;

                if (!prod.productName || !prod.unitPrice || !prod.quantity) {
                    return Swal.fire('Missing Details', `Please fill Product Name, Quantity, and Price for Item #${i + 1}`, 'warning');
                }
                
                if (!prod.isLinkedItem) {
                    if (prod.inventoryItemStatus === 'Assigned' && !prod.inventoryAssignedTo) {
                        return Swal.fire('Missing Employee', `Please select who Item #${i + 1} is assigned to.`, 'warning');
                    }
                    if (prod.inventoryItemStatus === 'Available' && !prod.storageLocation) {
                        return Swal.fire('Missing Location', `Please provide a storage location for Item #${i + 1}.`, 'warning');
                    }
                }

                // 👇 TEMPORARILY DISABLED: Category A Image Verification Check
                /*
                const unitCost = Number(prod.unitPrice);
                if (['Available', 'Assigned'].includes(prod.inventoryItemStatus) && unitCost >= systemSettings.inventoryCatAThreshold) {
                    if (!files.expenseMedia || files.expenseMedia.length === 0) {
                        return Swal.fire({
                            title: 'Image Required (Category A)',
                            text: `Item #${i + 1} costs ₹${systemSettings.inventoryCatAThreshold} or more (Category A). You MUST upload a photo proof of the product.`,
                            icon: 'warning',
                            confirmButtonColor: '#215D7B'
                        });
                    }
                }
                */
            }
        }

        setLoading(true);
        setUploadProgress(0);

        try {
            const data = new FormData();
            Object.keys(formData).forEach(key => data.append(key, formData[key]));
            
            data.append('isLinkedToExistingInventory', hasLinkedItems);

            let relevantDetails = {};
            const d = expenseDetails;
            
            switch (formData.category) {
                case 'Vendor Payment': relevantDetails = { paymentDate: d.paymentDate }; break;
                case 'Participant Payment': relevantDetails = { participantName: d.participantName }; break;
                case 'Product / Item Purchase': relevantDetails = { items: productList }; break;
                case 'Fuel Expense (Car / Bike)': relevantDetails = { vehicleType: d.vehicleType, vehicleNumber: d.vehicleNumber, travelFrom: d.travelFrom, travelTo: d.travelTo, odometerBefore: d.odometerBefore, odometerAfter: d.odometerAfter, kmTraveled: d.kmTraveled, purpose: d.purpose }; break;
                case 'Food Expense': relevantDetails = { restaurantName: d.restaurantName, foodItemsOrdered: d.foodItemsOrdered, numberOfPeople: d.numberOfPeople }; break;
                case 'Travel Expense': relevantDetails = { travelMode: d.travelMode, distanceKm: d.distanceKm, travelFrom: d.travelFrom, travelTo: d.travelTo, bookingReference: d.bookingReference, purpose: d.purpose }; break;
                case 'Accommodation': relevantDetails = { hotelName: d.hotelName, city: d.city, bookingReference: d.bookingReference, checkInDate: d.checkInDate, checkOutDate: d.checkOutDate, numberOfNights: d.numberOfNights }; break;
                case 'Regular Office Expense': relevantDetails = { vendorName: d.vendorName, billingCycle: d.billingCycle, expenseDescription: d.expenseDescription }; break;
                case 'Utility / Bills': relevantDetails = { utilityType: d.utilityType, billingMonth: d.billingMonth, invoiceNumber: d.invoiceNumber }; break;
                case 'Maintenance & Repairs': relevantDetails = { repairType: d.repairType, serviceProvider: d.serviceProvider, warrantyIncluded: d.warrantyIncluded }; break;
                default: relevantDetails = {};
            }

            if (d.gstNumber && d.gstNumber.trim() !== '') relevantDetails.gstNumber = d.gstNumber.toUpperCase().trim();

            data.append('expenseDetails', JSON.stringify(relevantDetails));

            if (files.paymentScreenshots && files.paymentScreenshots.length > 0) {
                for (let i = 0; i < files.paymentScreenshots.length; i++) data.append('paymentScreenshots', files.paymentScreenshots[i]);
            }

            if (files.expenseMedia && files.expenseMedia.length > 0) {
                for (let i = 0; i < files.expenseMedia.length; i++) data.append('expenseMedia', files.expenseMedia[i]);
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
            console.error("Upload error:", err);
            
            let errorMessage = 'Failed to save expense. Please check your connection and try again.';
            
            if (err.response) {
                if (err.response.status === 413) {
                    errorMessage = 'File Too Large! The server rejected the upload because your PDF or document exceeds the maximum allowed size. Please upload a smaller file.';
                } 
                else if (err.response.data && err.response.data.message) {
                    errorMessage = err.response.data.message;
                }
            }

            Swal.fire({
                title: 'Upload Failed',
                text: errorMessage,
                icon: 'error',
                confirmButtonColor: '#215D7B'
            });
        } finally {
            setLoading(false);
            setUploadProgress(0);
        }
    };

    // 👇 UPDATED: Media Labels to explicitly state they are Optional for now
    const getMediaLabel = () => {
        switch (formData.category) {
            case 'Vendor Payment': return 'Upload Vendor Invoice / Bill (Optional for now)'; 
            case 'Product / Item Purchase': return 'Product Photo(s) / Video(s) (Optional for now)';
            case 'Fuel Expense (Car / Bike)': return 'Odometer Image(s) / Fuel Station Receipt';
            case 'Food Expense': return 'Order Screenshot / Restaurant Bill';
            case 'Travel Expense': return 'Travel Receipt / Ticket Screenshot';
            case 'Accommodation': return 'Hotel Receipt / Invoice';
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
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                <SearchSelect 
                                    options={vendorsList}
                                    value={formData.vendorId}
                                    onChange={(val) => setFormData({ ...formData, vendorId: val })}
                                    placeholder="Search by vendor name or GST..."
                                    secondaryKey="gstNumber"
                                    icon={faSearch}
                                />
                                <button type="button" className="gts-btn success btn-small m-0" onClick={handleAddVendor} title="Add New Vendor" style={{ height: '42px', whiteSpace: 'nowrap' }}>
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
                    <div className="grid-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {productList.map((prod, index) => {
                            const isExpanded = expandedItemIndex === index;
                            
                            return (
                                <div key={index} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                    
                                    <div 
                                        onClick={() => setExpandedItemIndex(isExpanded ? -1 : index)}
                                        style={{ 
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                                            padding: '15px 20px', cursor: 'pointer', 
                                            background: isExpanded ? '#eff6ff' : '#f8fafc', 
                                            borderBottom: isExpanded ? '1px solid #cbd5e1' : 'none',
                                            transition: 'background 0.2s'
                                        }}
                                    >
                                        <div>
                                            <h4 style={{ margin: 0, color: '#0f172a', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                Item #{index + 1} {prod.productName ? <span style={{ color: '#64748b', fontWeight: 'normal' }}>— {prod.productName}</span> : ''}
                                                {prod.isLinkedItem && <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: '10px', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}><FontAwesomeIcon icon={faLink} /> Linked to Office DB</span>}
                                            </h4>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                            {productList.length > 1 && (
                                                <button type="button" onClick={(e) => { e.stopPropagation(); removeProduct(index); }} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                                                    <FontAwesomeIcon icon={faTrash} /> Remove
                                                </button>
                                            )}
                                            <FontAwesomeIcon icon={isExpanded ? faChevronUp : faChevronDown} style={{ color: '#64748b' }} />
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div style={{ padding: '20px' }}>
                                            <div className="expense-grid">
                                                <div className="form-group grid-span-2">
                                                    <label className="input-label">Product Name *</label>
                                                    <input className="custom-input" value={prod.productName} onChange={(e) => handleProductChange(index, 'productName', e.target.value)} disabled={prod.isLinkedItem} required />
                                                </div>
                                                <div className="form-group"><label className="input-label">Quantity *</label><input className="custom-input" type="number" min="1" value={prod.quantity} onChange={(e) => handleProductChange(index, 'quantity', e.target.value)} required /></div>
                                                <div className="form-group"><label className="input-label">Unit Price (₹) *</label><input className="custom-input" type="number" value={prod.unitPrice} onChange={(e) => handleProductChange(index, 'unitPrice', e.target.value)} required /></div>
                                                
                                                {!prod.isLinkedItem ? (
                                                    <>
                                                        <div className="form-group grid-span-2">
                                                            <label className="input-label" style={{ color: '#0f172a' }}>Will this item be added to Company Inventory?</label>
                                                            <div className="expense-type-toggle" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                <label className={prod.inventoryItemStatus === 'Available' ? 'active' : ''} style={{ width: '100%', justifyContent: 'flex-start' }}>
                                                                    <input type="radio" value="Available" checked={prod.inventoryItemStatus === 'Available'} onChange={(e) => handleProductChange(index, 'inventoryItemStatus', e.target.value)} /> Yes, Keep in Office (Available)
                                                                </label>
                                                                <label className={prod.inventoryItemStatus === 'Assigned' ? 'active' : ''} style={{ width: '100%', justifyContent: 'flex-start' }}>
                                                                    <input type="radio" value="Assigned" checked={prod.inventoryItemStatus === 'Assigned'} onChange={(e) => handleProductChange(index, 'inventoryItemStatus', e.target.value)} /> Yes, Assign to Employee
                                                                </label>
                                                                <label className={prod.inventoryItemStatus === 'Do Not Track' ? 'active' : ''} style={{ width: '100%', justifyContent: 'flex-start', background: prod.inventoryItemStatus === 'Do Not Track' ? '#f1f5f9' : '', color: prod.inventoryItemStatus === 'Do Not Track' ? '#64748b' : '' }}>
                                                                    <input type="radio" value="Do Not Track" checked={prod.inventoryItemStatus === 'Do Not Track'} onChange={(e) => handleProductChange(index, 'inventoryItemStatus', e.target.value)} /> No, Consumable / Do Not Track
                                                                </label>
                                                            </div>
                                                        </div>

                                                        <div className="form-group grid-span-2" style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: 0 }}>
                                                            {prod.inventoryItemStatus === 'Available' && (
                                                                <div style={{ flex: 1, minWidth: '200px' }}>
                                                                    <label className="input-label">Storage Location *</label>
                                                                    <input className="custom-input" value={prod.storageLocation} onChange={(e) => handleProductChange(index, 'storageLocation', e.target.value)} placeholder="e.g. Office Room A" required />
                                                                </div>
                                                            )}
                                                            
                                                            {prod.inventoryItemStatus === 'Assigned' && (
                                                                <div style={{ flex: 1, minWidth: '200px' }}>
                                                                    <label className="input-label">Assign To Employee *</label>
                                                                    <SearchSelect 
                                                                        options={allEmployeesList}
                                                                        value={prod.inventoryAssignedTo}
                                                                        onChange={(val) => handleProductChange(index, 'inventoryAssignedTo', val)}
                                                                        placeholder="Search by name or role..."
                                                                        secondaryKey="role"
                                                                        icon={faUser}
                                                                    />
                                                                </div>
                                                            )}

                                                            <div style={{ flex: 1, minWidth: '200px' }}>
                                                                <label className="input-label">Expiry Date (If applicable)</label>
                                                                <input className="custom-input" type="date" value={prod.expiryDate} onChange={(e) => handleProductChange(index, 'expiryDate', e.target.value)} />
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="form-group grid-span-2">
                                                        <div style={{ background: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px dashed #22c55e', color: '#16a34a', fontWeight: '600', fontSize: '13px' }}>
                                                            <FontAwesomeIcon icon={faCheckCircle} /> This item's physical location is already tracked in the database. No further inventory details are needed.
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px', gap: '15px', flexWrap: 'wrap' }}>
                            <button type="button" className="gts-btn doc-btn" style={{ background: '#eff6ff', color: '#2563eb', border: '1px dashed #bfdbfe' }} onClick={addProduct}>
                                <FontAwesomeIcon icon={faPlus} /> Add New Product
                            </button>
                            
                            {(userRole === 'ADMIN' || userRole === 'ACCOUNTS' || userRole === 'HR') && (
                                <button type="button" className="gts-btn doc-btn" style={{ background: '#fdf2f8', color: '#db2777', border: '1px dashed #fbcfe8' }} onClick={openUnbilledModal}>
                                    <FontAwesomeIcon icon={faBoxOpen} /> Link Unbilled Inventory
                                </button>
                            )}
                        </div>
                    </div>
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
                                    <SearchSelect 
                                        options={projectsList}
                                        value={formData.projectName}
                                        onChange={(val) => setFormData({ ...formData, projectName: val })}
                                        placeholder="Search Project..."
                                        valueKey="name" 
                                    />
                                </div>
                            )}

                            <div className="form-group">
                                <label className="input-label">Expense Category *</label>
                                <select className="swal2-select custom-select" name="category" value={formData.category} onChange={handleMainChange} style={{ borderColor: '#215D7B' }}>
                                    <option value="Product / Item Purchase">Product / Item Purchase</option>
                                    <option value="Utility / Bills">Utility / Bills</option>
                                    <option value="Maintenance & Repairs">Maintenance & Repairs</option>
                                    <option value="Fuel Expense (Car / Bike)">Fuel Expense (Car / Bike)</option>
                                    <option value="Food Expense">Food Expense</option>
                                    <option value="Travel Expense">Travel Expense</option>
                                    <option value="Accommodation">Accommodation</option>
                                    {formData.expenseType === 'Project Expense' && <option value="Participant Payment">Participant Payment</option>}
                                    <option value="Vendor Payment">Vendor Payment</option>
                                    {formData.expenseType === 'Regular Office Expense' && <option value="Regular Office Expense">Regular Office Expense</option>}
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

                            <div className="form-group">
                                <label className="input-label">GST Number (Optional)</label>
                                <input className="custom-input" type="text" name="gstNumber" placeholder="e.g. 29GGGGG1314R9Z6" value={expenseDetails.gstNumber} onChange={handleDetailChange} style={{ textTransform: 'uppercase' }} />
                            </div>

                            <div className="form-group grid-span-2" style={{ marginTop: '5px', marginBottom: '5px' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>
                                    <div style={{ position: 'relative', width: '44px', height: '24px', background: formData.isCompanyPayment ? '#16a34a' : '#cbd5e1', borderRadius: '24px', transition: 'background 0.3s ease' }}>
                                        <div style={{ position: 'absolute', top: '2px', left: formData.isCompanyPayment ? '22px' : '2px', width: '20px', height: '20px', background: 'white', borderRadius: '50%', transition: 'left 0.3s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
                                    </div>
                                    <span style={{ fontWeight: '600', color: '#334155', fontSize: '14px' }}>Is company Account ?</span>
                                    <input type="checkbox" name="isCompanyPayment" checked={formData.isCompanyPayment} onChange={handleMainChange} style={{ display: 'none' }} />
                                </label>
                            </div>

                            {!formData.isCompanyPayment && (
                                <div className="form-group">
                                    <label className="input-label"><FontAwesomeIcon icon={faCreditCard} /> Payment Source (Who paid?) *</label>
                                    <SearchSelect 
                                        options={getPaymentSourceOptions()}
                                        value={formData.paymentSourceId}
                                        onChange={(val) => setFormData({ ...formData, paymentSourceId: val })}
                                        placeholder="Search by name..."
                                        secondaryKey="role"
                                        icon={faCreditCard}
                                    />
                                </div>
                            )}

                            <div className="form-group grid-span-2">
                                <label className="input-label"><FontAwesomeIcon icon={faTags} /> Description / Tags *</label>
                                <input className="custom-input" type="text" name="descriptionTags" required placeholder="e.g. N95 Mask, Train Ticket, Client Dinner" value={formData.descriptionTags} onChange={handleMainChange} />
                            </div>
                        </div>
                    </div>

                    <div className="expense-form-section">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faListAlt} /> {formData.category} Details
                        </div>
                        <div className="expense-grid">
                            {renderCategoryFields()}
                        </div>
                    </div>

                    <div className="expense-form-section mb-0">
                        <div className="expense-section-title">
                            <FontAwesomeIcon icon={faPaperclip} /> Attachments & Proof
                        </div>

                        <div className="expense-grid">
                            <div className="form-group expense-file-area">
                                <label className="input-label" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>
                                    Payment Screenshot / Bank Proof(s) (Optional)
                                </label>
                                <input className="custom-file-input" type="file" multiple accept="image/*,application/pdf" onChange={e => handleFileChange(e, 'paymentScreenshots')} />
                                {isCompressing ? (
                                    <p className="file-success-text" style={{ color: '#d97706', marginTop: '5px', fontWeight: '600' }}><FontAwesomeIcon icon={faSpinner} spin /> Compressing images...</p>
                                ) : files.paymentScreenshots.length > 0 && (
                                    <p className="file-success-text" style={{ fontSize: '12px', color: '#16a34a', marginTop: '5px', fontWeight: '600' }}><FontAwesomeIcon icon={faCheckCircle} /> {files.paymentScreenshots.length} proof file(s) ready</p>
                                )}
                            </div>

                            <div className="form-group expense-file-area">
                                <label className="input-label" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>
                                    {getMediaLabel()}
                                </label>
                                {/* 👇 UPDATED: Removed 'required' constraint from here */}
                                <input className="custom-file-input" type="file" multiple accept="image/*,video/*,application/pdf" onChange={e => handleFileChange(e, 'expenseMedia')} />
                                {isCompressing ? (
                                    <p className="file-success-text" style={{ color: '#d97706', marginTop: '5px', fontWeight: '600' }}><FontAwesomeIcon icon={faSpinner} spin /> Compressing images...</p>
                                ) : files.expenseMedia.length > 0 && (
                                    <p className="file-success-text" style={{ fontSize: '12px', color: '#16a34a', marginTop: '5px', fontWeight: '600' }}><FontAwesomeIcon icon={faCheckCircle} /> {files.expenseMedia.length} media file(s) ready</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="profile-actions mt-30" style={{ flexDirection: 'column', gap: '15px' }}>
                        {loading && uploadProgress > 0 && (
                            <div className="upload-progress-container">
                                <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                                <span className="upload-progress-text">Uploading to server... {uploadProgress}%</span>
                            </div>
                        )}
                        <button type="submit" className="save-btn purchase-submit-btn" disabled={loading || isCompressing}>
                            <FontAwesomeIcon icon={faSave} className="btn-icon" />
                            {loading ? 'Processing & Uploading...' : isCompressing ? 'Compressing Files...' : 'Submit Expense for Approval'}
                        </button>
                    </div>

                </form>
            </div>

            {/* Unbilled Inventory Modal overlay */}
            {showUnbilledModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                    <div className="fade-in" style={{ background: '#fff', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #e2e8f0' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}><FontAwesomeIcon icon={faBoxOpen} style={{ color: '#db2777', marginRight: '8px' }}/> Link Existing Office Items</h2>
                            <button onClick={() => setShowUnbilledModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', color: '#64748b' }}>
                                <FontAwesomeIcon icon={faTimes}/>
                            </button>
                        </div>
                        
                        <div style={{ overflowY: 'auto', padding: '20px', flex: 1 }}>
                            <p style={{ fontSize: '13px', color: '#64748b', marginTop: 0, marginBottom: '20px' }}>
                                Below are items currently in your database that have not yet been linked to an expense bill. Select the items you are paying for now.
                            </p>
                            
                            {unbilledInventory.map(item => (
                                <div key={item.itemName} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '15px', background: unbilledSelections[item.itemName]?.selected ? '#fdf2f8' : '#f8fafc', border: `1px solid ${unbilledSelections[item.itemName]?.selected ? '#fbcfe8' : '#e2e8f0'}`, borderRadius: '8px', marginBottom: '10px', transition: 'background 0.2s' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0, fontWeight: 'bold', color: '#0f172a' }}>
                                        <input 
                                            type="checkbox" 
                                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                            checked={unbilledSelections[item.itemName]?.selected} 
                                            onChange={(e) => setUnbilledSelections({
                                                ...unbilledSelections, 
                                                [item.itemName]: { ...unbilledSelections[item.itemName], selected: e.target.checked }
                                            })}
                                        />
                                        {item.itemName}
                                    </label>
                                    
                                    {unbilledSelections[item.itemName]?.selected && (
                                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginLeft: '28px', marginTop: '5px' }}>
                                            <div style={{ flex: 1 }}>
                                                <label className="text-small text-muted d-block mb-5">Qty being Billed (Max: {item.totalUnbilledQty})</label>
                                                <input 
                                                    type="number" 
                                                    className="custom-input m-0" 
                                                    min="1" 
                                                    max={item.totalUnbilledQty}
                                                    value={unbilledSelections[item.itemName].qty}
                                                    onChange={(e) => setUnbilledSelections({
                                                        ...unbilledSelections, 
                                                        [item.itemName]: { ...unbilledSelections[item.itemName], qty: Math.min(Number(e.target.value), item.totalUnbilledQty) }
                                                    })}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div style={{ padding: '20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="gts-btn warning" onClick={() => setShowUnbilledModal(false)}>Cancel</button>
                            <button className="gts-btn success" onClick={handleConfirmLink} style={{ background: '#db2777', color: 'white' }}>Add to Bill Form</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AddExpense;