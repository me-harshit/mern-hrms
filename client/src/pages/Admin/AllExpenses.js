import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api, { SERVER_URL } from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSearch, faFileInvoice, faImage, faFilter,
    faCheckCircle, faClock, faTimesCircle, faArrowLeft,
    faEye, faTimes, faUndo, faEdit, faBuilding, faWallet, 
    faObjectGroup, faCut, faFileContract, faSort, faSortUp, faSortDown
} from '@fortawesome/free-solid-svg-icons';
import Pagination from '../../components/Pagination'; 
import '../../styles/App.css';
import '../../styles/expenses.css';

const AllExpenses = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const currentUser = JSON.parse(localStorage.getItem('user'));

    // --- DATA & PAGINATION STATES ---
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const [selectedExpenses, setSelectedExpenses] = useState([]);

    // 👇 NEW: Sorting State
    const [sortConfig, setSortConfig] = useState({ key: 'expenseDate', direction: 'desc' });

    const [stats, setStats] = useState({
        pendingTotal: 0, pendingCount: 0,
        approvedTotal: 0, approvedCount: 0,
        returnedTotal: 0, returnedCount: 0,
        rejectedTotal: 0, rejectedCount: 0,
        gstTotal: 0, gstCount: 0,
        totalFilteredAmount: 0
    });

    // --- DROPDOWN DATA STATES ---
    const [usersList, setUsersList] = useState([]);
    const [projectsList, setProjectsList] = useState([]);
    const [selectedExpense, setSelectedExpense] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // --- FILTER STATES ---
    const submittedByDropdownRef = useRef(null);
    const approvedByDropdownRef = useRef(null);
    const paidByDropdownRef = useRef(null); 

    const [submittedBySearchTerm, setSubmittedBySearchTerm] = useState('');
    const [isSubmittedByDropdownOpen, setIsSubmittedByDropdownOpen] = useState(false);
    
    const [approvedBySearchTerm, setApprovedBySearchTerm] = useState('');
    const [isApprovedByDropdownOpen, setIsApprovedByDropdownOpen] = useState(false);

    const [paidBySearchTerm, setPaidBySearchTerm] = useState('');
    const [isPaidByDropdownOpen, setIsPaidByDropdownOpen] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const [filters, setFilters] = useState({
        fromDate: '', toDate: '',
        expenseType: searchParams.get('expenseType') || '',
        category: searchParams.get('category') || '',
        projectName: searchParams.get('projectName') || '',
        vendorName: searchParams.get('vendorName') || '',
        submittedBy: '', approvedBy: '', paymentSourceId: '', 
        minAmount: '', maxAmount: '', status: '', hasGst: ''
    });

    const handleViewProfile = (id) => navigate(`/employee/${id}`);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (submittedByDropdownRef.current && !submittedByDropdownRef.current.contains(event.target)) setIsSubmittedByDropdownOpen(false);
            if (approvedByDropdownRef.current && !approvedByDropdownRef.current.contains(event.target)) setIsApprovedByDropdownOpen(false);
            if (paidByDropdownRef.current && !paidByDropdownRef.current.contains(event.target)) setIsPaidByDropdownOpen(false); 
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const fetchDropdowns = async () => {
            try {
                const userRes = await api.get('/employees/directory');
                const employeeArray = Array.isArray(userRes.data) ? userRes.data : (userRes.data?.data || []);
                setUsersList(employeeArray);

                const projRes = await api.get('/projects/all', { params: { limit: 1000 } });
                const actualProjectArray = projRes.data.data || projRes.data;
                setProjectsList(actualProjectArray);
            } catch (e) {
                setProjectsList([]);
            }
        };
        fetchDropdowns();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // 👇 UPDATED: Added sortConfig to dependency array
    useEffect(() => {
        setCurrentPage(1);
    }, [filters, debouncedSearch, sortConfig]);

    useEffect(() => {
        setSelectedExpenses([]);
    }, [currentPage, filters, debouncedSearch, itemsPerPage, sortConfig]);

    useEffect(() => {
        fetchExpenses(currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, filters, debouncedSearch, itemsPerPage, sortConfig]);

    const fetchExpenses = async (pageToFetch) => {
        setLoading(true);
        try {
            // 👇 UPDATED: Attach sortBy and sortOrder to the API request
            const params = { 
                page: pageToFetch, 
                limit: itemsPerPage, 
                search: debouncedSearch, 
                sortBy: sortConfig.key,
                sortOrder: sortConfig.direction,
                ...filters 
            };
            const res = await api.get('/expenses/all', { params });
            setExpenses(res.data.data);
            if (res.data.stats) setStats(res.data.stats); 
            setTotalPages(res.data.pagination.totalPages);
            setTotalRecords(res.data.pagination.totalRecords);
            setCurrentPage(res.data.pagination.currentPage);
        } catch (err) {
            Swal.fire('Error', 'Failed to load expenses', 'error');
        } finally {
            setLoading(false);
        }
    };

    // 👇 NEW: Click Handler for Sorting
    const handleSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (columnName) => {
        if (sortConfig.key !== columnName) return <FontAwesomeIcon icon={faSort} style={{ color: '#cbd5e1', marginLeft: '5px' }} />;
        if (sortConfig.direction === 'asc') return <FontAwesomeIcon icon={faSortUp} style={{ color: '#2563eb', marginLeft: '5px' }} />;
        return <FontAwesomeIcon icon={faSortDown} style={{ color: '#2563eb', marginLeft: '5px' }} />;
    };

    const handleFilterChange = (e) => setFilters({ ...filters, [e.target.name]: e.target.value });
    
    const handleCardClick = (type, value) => {
        setFilters(prev => ({ ...prev, [type]: prev[type] === value ? '' : value }));
    };

    const clearFilters = () => {
        setFilters({ 
            fromDate: '', toDate: '', expenseType: '', category: '', projectName: '', 
            vendorName: '', submittedBy: '', approvedBy: '', paymentSourceId: '', 
            minAmount: '', maxAmount: '', status: '', hasGst: '' 
        });
        setSearchTerm('');
        setSubmittedBySearchTerm('');
        setApprovedBySearchTerm('');
        setPaidBySearchTerm('');
        setSelectedExpenses([]); 
        setSortConfig({ key: 'expenseDate', direction: 'desc' }); // Reset sort on clear
    };

    const handleStatusUpdate = async (id, newStatus) => {
        if (newStatus === 'Returned') {
            const { value: adminNote } = await Swal.fire({
                title: 'Return for Correction', text: "Please provide a reason.", input: 'textarea', showCancelButton: true, confirmButtonColor: '#f59e0b', confirmButtonText: 'Return to Employee', inputValidator: (value) => !value && 'You need to write a reason!'
            });
            if (adminNote) {
                try { await api.put(`/expenses/${id}/status`, { status: newStatus, adminFeedback: adminNote }); fetchExpenses(currentPage); setIsSidebarOpen(false); } catch (err) { Swal.fire('Error', 'Failed', 'error'); }
            }
            return;
        }

        const confirmText = newStatus === 'Approved' ? 'This will process funds and sync Inventory.' : 'Reject this expense permanently?';
        const result = await Swal.fire({ title: 'Confirm Action', text: confirmText, icon: 'warning', showCancelButton: true, confirmButtonColor: newStatus === 'Approved' ? '#16a34a' : '#dc2626', confirmButtonText: `Yes, ${newStatus} it!` });

        if (result.isConfirmed) {
            try { await api.put(`/expenses/${id}/status`, { status: newStatus }); fetchExpenses(currentPage); setIsSidebarOpen(false); } catch (err) { Swal.fire('Error', 'Failed', 'error'); }
        }
    };

    const handleBulkApprove = async () => {
        if (selectedExpenses.length === 0) return;
        const result = await Swal.fire({
            title: 'Approve Selected?', text: `You are about to approve ${selectedExpenses.length} expenses at once.`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#16a34a', confirmButtonText: 'Yes, approve all!'
        });
        if (result.isConfirmed) {
            setLoading(true);
            try {
                await Promise.all(selectedExpenses.map(id => api.put(`/expenses/${id}/status`, { status: 'Approved' })));
                Swal.fire('Success', `${selectedExpenses.length} expenses approved!`, 'success');
                setSelectedExpenses([]);
                fetchExpenses(currentPage);
            } catch (err) {
                Swal.fire('Error', 'Some approvals failed.', 'error');
                fetchExpenses(currentPage);
            }
        }
    };

    const handleMergeSelected = async () => {
        if (selectedExpenses.length < 2) return;
        
        const toMerge = expenses.filter(e => selectedExpenses.includes(e._id));
        const first = toMerge[0];
        
        let totalSum = 0;
        for (let exp of toMerge) {
            totalSum += exp.amount;
            if (exp.status !== 'Pending' && exp.status !== 'Returned') return Swal.fire('Invalid Status', 'You can only merge Pending or Returned expenses.', 'warning');
            if (exp.category !== 'Product / Item Purchase') return Swal.fire('Category Mismatch', 'Only "Product / Item Purchase" records can be merged.', 'warning');
            if (exp.submittedBy?._id !== first.submittedBy?._id) return Swal.fire('Submitter Mismatch', 'All records must be submitted by the same person.', 'warning');
            if (exp.projectName !== first.projectName) return Swal.fire('Project Mismatch', 'All records must belong to the exact same Project.', 'warning');
        }

        const result = await Swal.fire({
            title: 'Merge into Single Bill?',
            text: `You are about to permanently merge ${toMerge.length} items into a single expense bill. The new total amount will be ₹${totalSum.toLocaleString('en-IN')}.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
            confirmButtonText: 'Yes, Merge Them!'
        });

        if (result.isConfirmed) {
            setLoading(true);
            try {
                await api.post('/expenses/merge', { expenseIds: selectedExpenses });
                Swal.fire('Merged!', 'The expenses have been successfully combined into one bill.', 'success');
                setSelectedExpenses([]);
                fetchExpenses(currentPage);
            } catch (err) {
                Swal.fire('Merge Failed', err.response?.data?.message || 'Could not merge expenses', 'error');
                setLoading(false);
            }
        }
    };

    const handleSplitItem = async (expenseId, itemIndex, itemObj, maxTotal) => {
        const defaultSplitAmount = (Number(itemObj.quantity) || 1) * (Number(itemObj.unitPrice) || 0);
        
        const { value: splitAmountStr } = await Swal.fire({
            title: 'Split Item out of Bill',
            html: `
                <p style="font-size: 14px; text-align: left; color: #475569;">
                    Extracting <b>${itemObj.productName || 'this item'}</b> into its own separate expense record.<br/><br/>
                    Original Bill Total: <b>₹${maxTotal}</b><br/>
                    What should the total value of this new separated record be? (Include any proportional taxes/shipping).
                </p>
                <input id="split-amt" type="number" class="swal2-input" value="${defaultSplitAmount}" style="max-width: 100%;">
            `,
            showCancelButton: true,
            confirmButtonText: 'Split Item',
            confirmButtonColor: '#ea580c',
            preConfirm: () => document.getElementById('split-amt').value
        });

        if (splitAmountStr) {
            const amountToDeduct = Number(splitAmountStr);
            if (amountToDeduct >= maxTotal) return Swal.fire('Error', 'Split amount must be LESS than the total bill!', 'error');

            try {
                await api.post(`/expenses/${expenseId}/split`, { itemIndex, splitAmount: amountToDeduct });
                Swal.fire('Split Successful', 'The item has been separated into a new pending expense.', 'success');
                setIsSidebarOpen(false);
                fetchExpenses(currentPage);
            } catch (err) {
                Swal.fire('Split Failed', err.response?.data?.message || 'Could not split item', 'error');
            }
        }
    };

    const pendingOnPage = expenses.filter(e => e.status === 'Pending' || e.status === 'Returned');
    const isAllSelected = pendingOnPage.length > 0 && pendingOnPage.every(e => selectedExpenses.includes(e._id));

    const handleSelectAll = () => {
        if (isAllSelected) {
            const idsToRemove = pendingOnPage.map(e => e._id);
            setSelectedExpenses(prev => prev.filter(id => !idsToRemove.includes(id)));
        } else {
            const idsToAdd = pendingOnPage.map(e => e._id).filter(id => !selectedExpenses.includes(id));
            setSelectedExpenses(prev => [...prev, ...idsToAdd]);
        }
    };

    const handleSelectOne = (id) => setSelectedExpenses(prev => prev.includes(id) ? prev.filter(eId => eId !== id) : [...prev, id]);

    const openSidebar = (expense) => { setSelectedExpense(expense); setIsSidebarOpen(true); };
    const closeSidebar = () => { setIsSidebarOpen(false); setTimeout(() => setSelectedExpense(null), 300); };
    const formatKeyToLabel = (key) => { const withSpaces = key.replace(/([A-Z])/g, ' $1').trim(); return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1); };
    const getFileUrl = (url) => url ? (url.startsWith('http') ? url : `${SERVER_URL}${url}`) : '';

    const formatDisplayDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return `${String(date.getDate()).padStart(2, '0')}-${date.toLocaleString('default', { month: 'short' })}-${String(date.getFullYear()).slice(-2)}`;
    };

    const getSpecificDetail = (item) => {
        if (item.category === 'Vendor Payment' && item.vendorId?.name) return item.vendorId.name;
        if (item.category === 'Participant Payment') return item.expenseDetails?.participantName || item.expenseDetails?.name || item.descriptionTags || 'Participant Payment';
        if (item.category === 'Product / Item Purchase') {
            if (item.expenseDetails?.items && item.expenseDetails.items.length > 0) {
                const firstItem = item.expenseDetails.items[0].productName;
                const extraCount = item.expenseDetails.items.length - 1;
                return extraCount > 0 ? `${firstItem} (+${extraCount} more)` : firstItem;
            }
            return item.expenseDetails?.itemName || item.expenseDetails?.productName || item.descriptionTags || 'Product Purchase';
        }
        return item.descriptionTags || 'No specific details provided';
    };

    const viewFile = (fileData, title) => {
        if (Array.isArray(fileData)) {
            let htmlContent = '<div style="display:flex; flex-direction:column; gap:20px; max-height: 60vh; overflow-y:auto; padding-right:10px;">';
            fileData.forEach((url, index) => {
                const fullUrl = getFileUrl(url);
                const isVideo = url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/);
                const isPdf = url.toLowerCase().endsWith('.pdf');
                let mediaElement = isVideo ? `<video src="${fullUrl}" controls style="width:100%; border-radius:6px; max-height:400px; background:#000;"></video>` : isPdf ? `<iframe src="${fullUrl}" width="100%" height="400px" style="border: none; border-radius: 6px;"></iframe>` : `<img src="${fullUrl}" style="width:100%; border-radius:6px; max-height:400px; object-fit:contain;" />`;
                htmlContent += `<div style="background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;"><div style="text-align: left; font-size: 12px; color: #64748b; margin-bottom: 8px; font-weight: 600;">File ${index + 1}</div>${mediaElement}</div>`;
            });
            htmlContent += '</div>';
            Swal.fire({ title: title, html: htmlContent, width: '800px', showCloseButton: true, showConfirmButton: false });
        } else {
            const fullUrl = getFileUrl(fileData);
            if (fileData.toLowerCase().endsWith('.pdf')) { Swal.fire({ title: title, html: `<iframe src="${fullUrl}" width="100%" height="500px" style="border: none; border-radius: 8px;"></iframe>`, width: '800px', showCloseButton: true, showConfirmButton: false }); }
            else { Swal.fire({ title: title, imageUrl: fullUrl, imageAlt: title, width: '800px', showCloseButton: true, showConfirmButton: false }); }
        }
    };

    const getStatusIcon = (status) => {
        if (status === 'Approved') return <FontAwesomeIcon icon={faCheckCircle} style={{ color: '#16a34a', marginRight: '5px' }} />;
        if (status === 'Rejected') return <FontAwesomeIcon icon={faTimesCircle} style={{ color: '#dc2626', marginRight: '5px' }} />;
        if (status === 'Returned') return <FontAwesomeIcon icon={faUndo} style={{ color: '#ea580c', marginRight: '5px' }} />;
        return <FontAwesomeIcon icon={faClock} style={{ color: '#d97706', marginRight: '5px' }} />;
    };

    const getMinimalCardStyle = (filterType, statusOrValue, colorHex) => ({
        cursor: 'pointer', transition: 'all 0.2s ease', opacity: filters[filterType] === '' || filters[filterType] === statusOrValue ? 1 : 0.4, border: filters[filterType] === statusOrValue ? `1.5px solid ${colorHex}` : '1px solid #e2e8f0', background: '#ffffff', padding: '12px 16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px', boxShadow: filters[filterType] === statusOrValue ? `0 2px 8px ${colorHex}15` : 'none'
    });

    const filteredSubmittedBy = usersList.filter(u => u.name.toLowerCase().includes(submittedBySearchTerm.toLowerCase()) || u.role.toLowerCase().includes(submittedBySearchTerm.toLowerCase()));
    const approversList = usersList.filter(u => ['ADMIN', 'HR', 'MANAGER'].includes(u.role));
    const filteredApprovedBy = approversList.filter(u => u.name.toLowerCase().includes(approvedBySearchTerm.toLowerCase()) || u.role.toLowerCase().includes(approvedBySearchTerm.toLowerCase()));
    const filteredPaidBy = usersList.filter(u => u.name.toLowerCase().includes(paidBySearchTerm.toLowerCase()) || u.role.toLowerCase().includes(paidBySearchTerm.toLowerCase()));

    return (
        <div className="settings-container fade-in">
            <div className="page-header-row mb-20" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <button className="gts-btn warning btn-small m-0" onClick={() => navigate('/admin-expenses')}>
                        <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Dashboard
                    </button>
                    <h1 className="page-title header-no-margin">All Expense Records</h1>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    {selectedExpenses.length >= 2 && (
                        <button className="gts-btn primary btn-small m-0 fade-in" onClick={handleMergeSelected} style={{ background: '#2563eb', color: 'white', fontWeight: 'bold' }}>
                            <FontAwesomeIcon icon={faObjectGroup} className="btn-icon" /> Merge into 1 Bill
                        </button>
                    )}
                    
                    {selectedExpenses.length > 0 && (
                        <button className="gts-btn success btn-small m-0 fade-in" onClick={handleBulkApprove} style={{ background: '#16a34a', color: 'white', fontWeight: 'bold' }}>
                            <FontAwesomeIcon icon={faCheckCircle} className="btn-icon" /> Approve Selected ({selectedExpenses.length})
                        </button>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '25px', alignItems: 'stretch' }}>
                <div style={getMinimalCardStyle('status', 'Pending', '#d97706')} onClick={() => handleCardClick('status', 'Pending')}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}><FontAwesomeIcon icon={faClock} style={{ color: '#d97706' }} /> Pending</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {stats.pendingTotal.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{stats.pendingCount} items</div>
                </div>
                <div style={getMinimalCardStyle('status', 'Approved', '#16a34a')} onClick={() => handleCardClick('status', 'Approved')}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}><FontAwesomeIcon icon={faCheckCircle} style={{ color: '#16a34a' }} /> Accepted</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {stats.approvedTotal.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{stats.approvedCount} items</div>
                </div>
                <div style={getMinimalCardStyle('status', 'Returned', '#ea580c')} onClick={() => handleCardClick('status', 'Returned')}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}><FontAwesomeIcon icon={faUndo} style={{ color: '#ea580c' }} /> Returned</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {stats.returnedTotal.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{stats.returnedCount} items</div>
                </div>
                <div style={getMinimalCardStyle('status', 'Rejected', '#dc2626')} onClick={() => handleCardClick('status', 'Rejected')}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}><FontAwesomeIcon icon={faTimesCircle} style={{ color: '#dc2626' }} /> Rejected</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {stats.rejectedTotal.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{stats.rejectedCount} items</div>
                </div>
                
                <div style={{ width: '1px', background: '#e2e8f0', margin: '0 5px' }}></div>

                <div style={getMinimalCardStyle('hasGst', 'Yes', '#8b5cf6')} onClick={() => handleCardClick('hasGst', 'Yes')}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}><FontAwesomeIcon icon={faFileContract} style={{ color: '#8b5cf6' }} /> With Valid GST</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {stats.gstTotal.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{stats.gstCount} items</div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '12px 16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', minWidth: '140px', gap: '4px', marginLeft: 'auto' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}><FontAwesomeIcon icon={faWallet} style={{ color: '#475569' }}/> Filtered Total</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>₹ {stats.totalFilteredAmount.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Across {totalRecords} items</div>
                </div>
            </div>

            <div className="expense-form-section">
                <div className="expense-section-title" style={{ fontSize: '14px', marginBottom: '15px' }}>
                    <FontAwesomeIcon icon={faFilter} /> Advanced Filters
                    <button className="gts-btn btn-small" onClick={clearFilters} style={{ marginLeft: 'auto', background: '#f1f5f9', color: '#64748b' }}>Clear All</button>
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                    <div className="search-wrapper" style={{ gridColumn: '1 / -1', maxWidth: '100%' }}>
                        <FontAwesomeIcon icon={faSearch} className="search-icon" />
                        <input type="text" placeholder="Search by name, tags, project, GST number..." className="swal2-input search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>From Date</label><input type="date" className="custom-input" name="fromDate" value={filters.fromDate} onChange={handleFilterChange} /></div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>To Date</label><input type="date" className="custom-input" name="toDate" value={filters.toDate} onChange={handleFilterChange} /></div>
                    <div>
                        <label className="input-label" style={{ fontSize: '11px' }}>Status</label>
                        <select className="custom-input" name="status" value={filters.status} onChange={handleFilterChange}>
                            <option value="">All Statuses</option><option value="Pending">Pending</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option><option value="Returned">Returned</option>
                        </select>
                    </div>
                    <div>
                        <label className="input-label" style={{ fontSize: '11px' }}>GST Claim Status</label>
                        <select className="custom-input" name="hasGst" value={filters.hasGst} onChange={handleFilterChange}>
                            <option value="">All Expenses</option><option value="Yes">With Valid GST Number</option><option value="No">Without GST</option>
                        </select>
                    </div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>Expense Type</label><select className="custom-input" name="expenseType" value={filters.expenseType} onChange={handleFilterChange}><option value="">All Types</option><option value="Project Expense">Project Expense</option><option value="Regular Office Expense">Regular Office Expense</option></select></div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>Category</label><select className="custom-input" name="category" value={filters.category} onChange={handleFilterChange}><option value="">All Categories</option><option value="Product / Item Purchase">Product / Item Purchase</option><option value="Utility / Bills">Utility / Bills</option><option value="Maintenance & Repairs">Maintenance & Repairs</option><option value="Fuel Expense (Car / Bike)">Fuel Expense (Car / Bike)</option><option value="Food Expense">Food Expense</option><option value="Travel Expense">Travel Expense</option><option value="Accommodation">Accommodation</option><option value="Regular Office Expense">Regular Office Expense</option><option value="Participant Payment">Participant Payment</option><option value="Vendor Payment">Vendor Payment</option></select></div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>Project</label><select className="custom-input" name="projectName" value={filters.projectName} onChange={handleFilterChange}><option value="">All Projects</option>{projectsList.map(proj => <option key={proj._id} value={proj.name}>{proj.name}</option>)}</select></div>

                    <div ref={submittedByDropdownRef} style={{ position: 'relative' }}>
                        <label className="input-label" style={{ fontSize: '11px' }}>Submitted By</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '8px', color: '#94a3b8', fontSize: '12px' }} />
                            <input type="text" className="custom-input" placeholder="Search employee..." style={{ paddingLeft: '28px', paddingRight: '25px', borderColor: filters.submittedBy ? '#16a34a' : '#cbd5e1' }} value={filters.submittedBy && !isSubmittedByDropdownOpen ? usersList.find(u => u._id === filters.submittedBy)?.name || '' : submittedBySearchTerm} onChange={(e) => { setSubmittedBySearchTerm(e.target.value); setFilters({ ...filters, submittedBy: '' }); setIsSubmittedByDropdownOpen(true); }} onFocus={() => setIsSubmittedByDropdownOpen(true)} />
                            {filters.submittedBy && <FontAwesomeIcon icon={faTimes} style={{ position: 'absolute', right: '8px', color: '#dc2626', cursor: 'pointer', fontSize: '12px' }} onClick={() => { setFilters({ ...filters, submittedBy: '' }); setSubmittedBySearchTerm(''); }} />}
                        </div>
                        {isSubmittedByDropdownOpen && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: '4px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
                                <div style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: '13px' }} onMouseDown={() => { setFilters({ ...filters, submittedBy: '' }); setSubmittedBySearchTerm(''); setIsSubmittedByDropdownOpen(false); }}>-- Anyone --</div>
                                {filteredSubmittedBy.map(u => (
                                    <div key={u._id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: '13px' }} onMouseDown={() => { setFilters({ ...filters, submittedBy: u._id }); setSubmittedBySearchTerm(''); setIsSubmittedByDropdownOpen(false); }}>
                                        <div style={{ fontWeight: '600', color: '#0f172a' }}>{u.name}</div><div style={{ fontSize: '11px', color: '#64748b' }}>{u.role}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div ref={paidByDropdownRef} style={{ position: 'relative' }}>
                        <label className="input-label" style={{ fontSize: '11px' }}>Paid By (Source)</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '8px', color: '#94a3b8', fontSize: '12px' }} />
                            <input type="text" className="custom-input" placeholder="Search payer..." style={{ paddingLeft: '28px', paddingRight: '25px', borderColor: filters.paymentSourceId ? '#16a34a' : '#cbd5e1' }} value={filters.paymentSourceId && !isPaidByDropdownOpen ? (filters.paymentSourceId === 'COMPANY' ? 'Company Account' : usersList.find(u => u._id === filters.paymentSourceId)?.name || '') : paidBySearchTerm} onChange={(e) => { setPaidBySearchTerm(e.target.value); setFilters({ ...filters, paymentSourceId: '' }); setIsPaidByDropdownOpen(true); }} onFocus={() => setIsPaidByDropdownOpen(true)} />
                            {filters.paymentSourceId && <FontAwesomeIcon icon={faTimes} style={{ position: 'absolute', right: '8px', color: '#dc2626', cursor: 'pointer', fontSize: '12px' }} onClick={() => { setFilters({ ...filters, paymentSourceId: '' }); setPaidBySearchTerm(''); }} />}
                        </div>
                        {isPaidByDropdownOpen && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: '4px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
                                <div style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: '13px' }} onMouseDown={() => { setFilters({ ...filters, paymentSourceId: '' }); setPaidBySearchTerm(''); setIsPaidByDropdownOpen(false); }}>-- Anyone --</div>
                                <div style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: '13px', background: '#f0fdf4' }} onMouseDown={() => { setFilters({ ...filters, paymentSourceId: 'COMPANY' }); setPaidBySearchTerm(''); setIsPaidByDropdownOpen(false); }}>
                                    <div style={{ fontWeight: '600', color: '#16a34a' }}>Company Account</div>
                                </div>
                                {filteredPaidBy.map(u => (
                                    <div key={u._id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: '13px' }} onMouseDown={() => { setFilters({ ...filters, paymentSourceId: u._id }); setPaidBySearchTerm(''); setIsPaidByDropdownOpen(false); }}>
                                        <div style={{ fontWeight: '600', color: '#0f172a' }}>{u.name}</div><div style={{ fontSize: '11px', color: '#64748b' }}>{u.role}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div ref={approvedByDropdownRef} style={{ position: 'relative' }}>
                        <label className="input-label" style={{ fontSize: '11px' }}>Approved By</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '8px', color: '#94a3b8', fontSize: '12px' }} />
                            <input type="text" className="custom-input" placeholder="Search approver..." style={{ paddingLeft: '28px', paddingRight: '25px', borderColor: filters.approvedBy ? '#16a34a' : '#cbd5e1' }} value={filters.approvedBy && !isApprovedByDropdownOpen ? usersList.find(u => u._id === filters.approvedBy)?.name || '' : approvedBySearchTerm} onChange={(e) => { setApprovedBySearchTerm(e.target.value); setFilters({ ...filters, approvedBy: '' }); setIsApprovedByDropdownOpen(true); }} onFocus={() => setIsApprovedByDropdownOpen(true)} />
                            {filters.approvedBy && <FontAwesomeIcon icon={faTimes} style={{ position: 'absolute', right: '8px', color: '#dc2626', cursor: 'pointer', fontSize: '12px' }} onClick={() => { setFilters({ ...filters, approvedBy: '' }); setApprovedBySearchTerm(''); }} />}
                        </div>
                        {isApprovedByDropdownOpen && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: '4px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
                                <div style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: '13px' }} onMouseDown={() => { setFilters({ ...filters, approvedBy: '' }); setApprovedBySearchTerm(''); setIsApprovedByDropdownOpen(false); }}>-- Anyone --</div>
                                {filteredApprovedBy.map(u => (
                                    <div key={u._id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: '13px' }} onMouseDown={() => { setFilters({ ...filters, approvedBy: u._id }); setApprovedBySearchTerm(''); setIsApprovedByDropdownOpen(false); }}>
                                        <div style={{ fontWeight: '600', color: '#0f172a' }}>{u.name}</div><div style={{ fontSize: '11px', color: '#64748b' }}>{u.role}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>Min Amount (₹)</label><input type="number" className="custom-input" name="minAmount" value={filters.minAmount} onChange={handleFilterChange} placeholder="0" /></div>
                    <div><label className="input-label" style={{ fontSize: '11px' }}>Max Amount (₹)</label><input type="number" className="custom-input" name="maxAmount" value={filters.maxAmount} onChange={handleFilterChange} placeholder="Max" /></div>
                </div>
            </div>

            <div className="employee-table-container fade-in">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px', textAlign: 'center' }}>
                                <input 
                                    type="checkbox" 
                                    style={{ cursor: pendingOnPage.length === 0 ? 'not-allowed' : 'pointer' }}
                                    checked={isAllSelected}
                                    onChange={handleSelectAll}
                                    disabled={pendingOnPage.length === 0}
                                />
                            </th>
                            <th>Submitter / Payer</th>
                            <th>Details & Context</th>
                            <th>Expense Type</th>
                            
                            {/* 👇 UPDATED: Split and Clickable Sorting Headers */}
                            <th 
                                onClick={() => handleSort('amount')} 
                                style={{ cursor: 'pointer', userSelect: 'none' }}
                                title="Click to sort by Amount"
                            >
                                Amount {getSortIcon('amount')}
                            </th>
                            <th 
                                onClick={() => handleSort('expenseDate')} 
                                style={{ cursor: 'pointer', userSelect: 'none' }}
                                title="Click to sort by Date"
                            >
                                Date {getSortIcon('expenseDate')}
                            </th>
                            
                            <th>Status & Approver</th>
                            <th>Documents</th>
                            <th>Admin Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="9" className="empty-table-message">Loading Server Data...</td></tr>
                        ) : expenses.length === 0 ? (
                            <tr><td colSpan="9" className="empty-table-message">No records found.</td></tr>
                        ) : (
                            expenses.map(item => {
                                const isProject = item.expenseType === 'Project Expense';
                                const typeLabel = isProject ? 'Project' : 'Regular';
                                const typeBorderColor = isProject ? '#A6477F' : '#1E73BE';
                                const typeBgColor = isProject ? '#fdf2f8' : '#eff6ff';
                                const submitterId = item.submittedBy?._id;
                                const payerId = item.paymentSourceId?._id;
                                const isCompanyPayment = item.isCompanyPayment;
                                const isSamePerson = submitterId === payerId;

                                return (
                                    <tr key={item._id} style={{ background: selectedExpenses.includes(item._id) ? '#f0fdf4' : 'transparent' }}>
                                        <td style={{ textAlign: 'center' }}>
                                            {(item.status === 'Pending' || item.status === 'Returned') ? (
                                                <input type="checkbox" style={{ cursor: 'pointer' }} checked={selectedExpenses.includes(item._id)} onChange={() => handleSelectOne(item._id)} />
                                            ) : null}
                                        </td>
                                        
                                        <td data-label="Submitter / Payer">
                                            {isCompanyPayment || isSamePerson ? (
                                                <div className="fw-bold text-primary" style={{ cursor: 'pointer' }} onClick={() => item.submittedBy?._id && handleViewProfile(item.submittedBy._id)} title="View Profile">
                                                    {item.submittedBy?.name || 'Unknown'}
                                                    {isCompanyPayment && <div className="text-small text-success fw-600 mt-5">Company Paid</div>}
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="fw-bold text-primary" style={{ cursor: 'pointer', fontSize: '14px' }} onClick={() => item.paymentSourceId?._id && handleViewProfile(item.paymentSourceId._id)} title="Paid By (View Profile)">{item.paymentSourceId?.name || 'Unknown Payer'}</div>
                                                    <div className="text-muted mt-5" style={{ fontSize: '11px', cursor: 'pointer' }} onClick={() => item.submittedBy?._id && handleViewProfile(item.submittedBy._id)} title="Submitted By"><span style={{ fontWeight: '600' }}>Logged by:</span> {item.submittedBy?.name || 'Unknown'}</div>
                                                </>
                                            )}
                                        </td>

                                        <td data-label="Details & Context">
                                            <div className="fw-bold text-dark" style={{ fontSize: '13px', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }} title={getSpecificDetail(item)}>{getSpecificDetail(item)}</div>
                                            <div className="text-small text-muted fw-600" style={{ marginBottom: '6px' }}>{item.category}</div>
                                            <div style={{ marginTop: '8px' }}><button className="gts-btn doc-btn" style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#215D7B' }} onClick={() => openSidebar(item)}><FontAwesomeIcon icon={faEye} /> View Details</button></div>
                                        </td>

                                        <td data-label="Expense Type">
                                            <span className="doc-btn" style={{ background: typeBgColor, color: typeBorderColor, border: `1px solid ${typeBorderColor}`, padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', display: 'inline-block' }}>{typeLabel}</span>
                                            {item.projectName && <div className="text-small fw-600" style={{ marginTop: '6px', color: '#475569' }}>{item.projectName}</div>}
                                        </td>

                                        {/* 👇 UPDATED: Split Table Data */}
                                        <td data-label="Amount">
                                            <div className="expense-amount-large">₹ {item.amount.toLocaleString('en-IN')}</div>
                                            {item.expenseDetails?.gstNumber && <span style={{ fontSize: '10px', background: '#dcfce7', color: '#16a34a', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>GST: {item.expenseDetails.gstNumber}</span>}
                                        </td>

                                        <td data-label="Date">
                                            <div className="text-small text-dark fw-600">{formatDisplayDate(item.expenseDate)}</div>
                                            {item.category === 'Vendor Payment' && <div className="text-muted text-small mt-5">Inv Date</div>}
                                        </td>

                                        <td data-label="Status & Approver">
                                            <span className={`status-badge ${item.status === 'Approved' ? 'success' : item.status === 'Rejected' ? 'danger' : item.status === 'Returned' ? 'warning' : 'warning'}`} style={{ padding: '6px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center' }}>{getStatusIcon(item.status)} {item.status || 'Pending'}</span>
                                            {item.status !== 'Pending' && item.approvedBy && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '5px' }}>By: <span style={{ color: '#215D7B', fontWeight: '600' }}>{item.approvedBy.name}</span></div>}
                                        </td>

                                        <td data-label="Documents">
                                            <div className="flex-row gap-5 flex-wrap">
                                                {item.paymentScreenshotUrls && item.paymentScreenshotUrls.length > 0 ? (
                                                    <button onClick={() => viewFile(item.paymentScreenshotUrls, `Payment Proofs (${item.paymentScreenshotUrls.length})`)} className="gts-btn doc-btn doc-proof"><FontAwesomeIcon icon={faFileInvoice} /> Proofs</button>
                                                ) : item.paymentScreenshotUrl ? (
                                                    <button onClick={() => viewFile(item.paymentScreenshotUrl, 'Payment Proof')} className="gts-btn doc-btn doc-proof"><FontAwesomeIcon icon={faFileInvoice} /> Proof</button>
                                                ) : <span className="text-muted text-small">-</span>}

                                                {item.expenseMediaUrls && item.expenseMediaUrls.length > 0 ? (
                                                    <button onClick={() => viewFile(item.expenseMediaUrls, `Media (${item.expenseMediaUrls.length})`)} className="gts-btn doc-btn doc-media"><FontAwesomeIcon icon={faImage} /> Media</button>
                                                ) : null}
                                            </div>
                                        </td>

                                        <td data-label="Admin Action">
                                            {item.status === 'Pending' || item.status === 'Returned' ? (
                                                <div className="flex-col gap-5">
                                                    <div style={{ display: 'flex', gap: '5px' }}>
                                                        <button className="gts-btn btn-small m-0" style={{ flex: 1, background: '#dcfce7', color: '#16a34a', justifyContent: 'center', padding: '6px' }} onClick={() => handleStatusUpdate(item._id, 'Approved')}><FontAwesomeIcon icon={faCheckCircle} /> Approve</button>
                                                        <button className="gts-btn btn-small m-0" style={{ flex: 1, background: '#fee2e2', color: '#dc2626', justifyContent: 'center', padding: '6px' }} onClick={() => handleStatusUpdate(item._id, 'Rejected')}><FontAwesomeIcon icon={faTimesCircle} /> Reject</button>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '5px' }}>
                                                        <button className="gts-btn btn-small m-0" style={{ flex: 1, background: '#fef3c7', color: '#d97706', justifyContent: 'center', padding: '6px' }} onClick={() => handleStatusUpdate(item._id, 'Returned')}><FontAwesomeIcon icon={faUndo} /> Return</button>
                                                        {(currentUser.role === 'ADMIN' || currentUser.role === 'HR' || currentUser.role === 'ACCOUNTS') ? (
                                                            <button className="gts-btn primary btn-small m-0" style={{ flex: 1, justifyContent: 'center', padding: '6px' }} onClick={() => navigate(`/edit-expense/${item._id}`)}><FontAwesomeIcon icon={faEdit} /> Edit</button>
                                                        ) : <div style={{ flex: 1 }}></div>}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex-col gap-5" style={{ alignItems: 'center' }}>
                                                    <span className="text-small text-muted fw-600">Processed</span>
                                                    {(currentUser.role === 'ADMIN' || currentUser.role === 'HR' || currentUser.role === 'ACCOUNTS') && (
                                                        <button className="gts-btn primary btn-small m-0" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate(`/edit-expense/${item._id}`)}><FontAwesomeIcon icon={faEdit} /> Admin Edit</button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {!loading && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalRecords={totalRecords}
                    limit={itemsPerPage}
                    onPageChange={(page) => setCurrentPage(page)}
                    onLimitChange={(newLimit) => { setItemsPerPage(newLimit); setCurrentPage(1); }}
                />
            )}

            <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={closeSidebar}></div>
            <div className={`expense-detail-sidebar ${isSidebarOpen ? 'open' : ''}`}>
                {/* ... (Sidebar logic remains exactly the same) ... */}
                {selectedExpense && (
                    <>
                        <div className="sidebar-header">
                            <div>
                                <h2 className="sidebar-title">{selectedExpense.category}</h2>
                                <span className={`status-badge ${selectedExpense.status === 'Approved' ? 'success' : selectedExpense.status === 'Rejected' ? 'danger' : selectedExpense.status === 'Returned' ? 'warning' : 'warning'}`} style={{ padding: '4px 8px', fontSize: '10px' }}>
                                    {selectedExpense.status}
                                </span>
                            </div>
                            <button className="sidebar-close-btn" onClick={closeSidebar}><FontAwesomeIcon icon={faTimes} /></button>
                        </div>
                        <div className="sidebar-content">
                            <h3 className="sidebar-section-title">General Information</h3>
                            <div className="detail-grid-2">
                                <div className="detail-group"><span className="detail-label">Amount</span><span className="detail-value fw-bold text-green">₹ {selectedExpense.amount.toLocaleString('en-IN')}</span></div>
                                <div className="detail-group"><span className="detail-label">{selectedExpense.category === 'Vendor Payment' ? 'Invoice Date' : 'Date'}</span><span className="detail-value">{formatDisplayDate(selectedExpense.expenseDate)}</span></div>
                                <div className="detail-group"><span className="detail-label">Submitted By</span><span className="detail-value">{selectedExpense.submittedBy?.name || 'N/A'}</span></div>
                                <div className="detail-group"><span className="detail-label">Payment Source</span><span className="detail-value">{selectedExpense.isCompanyPayment ? 'Company Account' : selectedExpense.paymentSourceId?.name || 'N/A'}</span></div>
                                <div className="detail-group" style={{ gridColumn: 'span 2' }}><span className="detail-label">Project / Department</span><span className="detail-value">{selectedExpense.projectName || 'Regular Office Expense'}</span></div>
                                {selectedExpense.vendorId && <div className="detail-group" style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}><span className="detail-label" style={{ color: '#2563eb' }}><FontAwesomeIcon icon={faBuilding} /> Central Vendor Profile</span><span className="detail-value fw-600">{selectedExpense.vendorId.name}</span>{selectedExpense.vendorId.gstNumber && <span className="text-small text-muted d-block">GST: {selectedExpense.vendorId.gstNumber}</span>}</div>}
                                <div className="detail-group" style={{ gridColumn: 'span 2' }}><span className="detail-label">Description Tags</span><span className="detail-value">{selectedExpense.descriptionTags}</span></div>
                                {selectedExpense.adminFeedback && <div className="detail-group" style={{ gridColumn: 'span 2' }}><span className="detail-label" style={{ color: '#ea580c' }}>Admin Note / Feedback</span><span className="detail-value" style={{ background: '#fef3c7', padding: '8px', borderRadius: '4px', fontStyle: 'italic' }}>"{selectedExpense.adminFeedback}"</span></div>}
                            </div>
                            
                            {selectedExpense.expenseDetails && Object.keys(selectedExpense.expenseDetails).length > 0 && (
                                <>
                                    <h3 className="sidebar-section-title mt-20">Granular Details</h3>
                                    {selectedExpense.category === 'Product / Item Purchase' && selectedExpense.expenseDetails.items && selectedExpense.expenseDetails.items.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                            {selectedExpense.expenseDetails.items.map((prod, idx) => (
                                                <div key={idx} style={{ background: '#f1f5f9', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', position: 'relative' }}>
                                                    
                                                    {selectedExpense.expenseDetails.items.length > 1 && (selectedExpense.status === 'Pending' || selectedExpense.status === 'Returned') && (
                                                        <button 
                                                            onClick={() => handleSplitItem(selectedExpense._id, idx, prod, selectedExpense.amount)}
                                                            title="Extract this item into its own separate expense record"
                                                            style={{ position: 'absolute', top: '10px', right: '10px', background: '#fff', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', color: '#ea580c', cursor: 'pointer', fontWeight: 'bold' }}
                                                        >
                                                            <FontAwesomeIcon icon={faCut} /> Split Out
                                                        </button>
                                                    )}

                                                    <div style={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '10px', borderBottom: '1px solid #cbd5e1', paddingBottom: '5px', paddingRight: '70px' }}>
                                                        Item #{idx + 1} - {prod.productName}
                                                    </div>
                                                    <div className="detail-grid-2">
                                                        <div className="detail-group"><span className="detail-label">Quantity</span><span className="detail-value">{prod.quantity}</span></div>
                                                        <div className="detail-group"><span className="detail-label">Unit Price</span><span className="detail-value">₹ {prod.unitPrice}</span></div>
                                                        <div className="detail-group"><span className="detail-label">Status</span><span className="detail-value">{prod.inventoryItemStatus}</span></div>
                                                        {prod.storageLocation && <div className="detail-group"><span className="detail-label">Location</span><span className="detail-value">{prod.storageLocation}</span></div>}
                                                        {prod.inventoryAssignedTo && (
                                                            <div className="detail-group">
                                                                <span className="detail-label">Assigned To</span>
                                                                <span className="detail-value">
                                                                    {usersList.find(u => String(u._id) === String(prod.inventoryAssignedTo))?.name || prod.inventoryAssignedTo}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {prod.expiryDate && <div className="detail-group"><span className="detail-label">Expiry Date</span><span className="detail-value">{prod.expiryDate}</span></div>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="detail-grid-2">
                                            {Object.entries(selectedExpense.expenseDetails).map(([key, value]) => {
                                                if (key === 'items') return null; 
                                                if (!value) return null;
                                                const isLongText = typeof value === 'string' && value.length > 30;
                                                return (
                                                    <div className="detail-group" key={key} style={isLongText ? { gridColumn: 'span 2' } : {}}>
                                                        <span className="detail-label" style={key === 'paymentDate' ? { color: '#16a34a', fontWeight: 'bold' } : {}}>
                                                            {formatKeyToLabel(key)}
                                                        </span>
                                                        <span className="detail-value">{value}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AllExpenses;