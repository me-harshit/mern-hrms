import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // 👇 NEW: Imported useNavigate
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTimes, faSearch, faFilter, faFileAlt, faLaptopHouse, faEye } from '@fortawesome/free-solid-svg-icons';
import Pagination from '../../components/Pagination';
import '../../styles/App.css';

const EmployeeRequests = () => {
    const navigate = useNavigate(); // 👇 NEW: Initialized navigate

    // --- DATA & PAGINATION STATES ---
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // --- UI & FILTER STATES ---
    const [activeTab, setActiveTab] = useState('Leaves'); // 'Leaves' or 'WFH'
    const [filterStatus, setFilterStatus] = useState('Pending');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // --- SIDEBAR STATES ---
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // 1. Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // 2. Reset Page on Filter/Tab Change
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, filterStatus, debouncedSearch]);

    // 3. Fetch Data based on Active Tab
    useEffect(() => {
        fetchRequests(currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, itemsPerPage, activeTab, filterStatus, debouncedSearch]);

    const fetchRequests = async (pageToFetch) => {
        setLoading(true);
        try {
            const endpoint = activeTab === 'Leaves' ? '/leaves/all-requests' : '/wfh/all-requests';
            const params = {
                page: pageToFetch,
                limit: itemsPerPage,
                search: debouncedSearch,
                status: filterStatus === 'All' ? '' : filterStatus
            };

            const res = await api.get(endpoint, { params });
            
            setRequests(res.data.data || []);
            setTotalPages(res.data.pagination?.totalPages || 1);
            setTotalRecords(res.data.pagination?.totalRecords || 0);
            setCurrentPage(res.data.pagination?.currentPage || 1);
        } catch (err) {
            console.error("Error fetching requests");
            Swal.fire('Error', 'Failed to load requests from server.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (id, status, empName) => {
        const actionType = activeTab === 'Leaves' ? 'leave' : 'WFH';
        const endpointPrefix = activeTab === 'Leaves' ? '/leaves' : '/wfh';

        const result = await Swal.fire({
            title: `Confirm ${status}?`,
            text: `You are about to ${status.toLowerCase()} ${actionType} for ${empName}.`,
            icon: status === 'Approved' ? 'success' : 'warning',
            input: 'text',
            inputPlaceholder: 'Optional: Add a remark for the email...',
            showCancelButton: true,
            confirmButtonColor: status === 'Approved' ? '#215D7B' : '#d33',
            confirmButtonText: `Yes, ${status}`
        });

        if (result.isConfirmed) {
            try {
                Swal.fire({
                    title: 'Processing...',
                    text: 'Updating status and emailing the employee.',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); }
                });

                await api.put(`${endpointPrefix}/action/${id}`, {
                    status,
                    adminRemark: result.value || ''
                });

                Swal.fire('Updated!', `Request has been ${status}. Employee notified.`, 'success');
                setIsSidebarOpen(false);
                fetchRequests(currentPage);
            } catch (err) {
                Swal.fire('Error', err.response?.data?.message || 'Action failed', 'error');
            }
        }
    };

    // --- SIDEBAR HANDLERS ---
    const openSidebar = (req) => {
        setSelectedRequest(req);
        setIsSidebarOpen(true);
    };

    const closeSidebar = () => {
        setIsSidebarOpen(false);
        setTimeout(() => setSelectedRequest(null), 300);
    };

    return (
        <div className="attendance-container fade-in">
            <h1 className="page-title header-no-margin mb-20">Employee Requests</h1>

            {/* --- TAB NAVIGATION --- */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button 
                    onClick={() => setActiveTab('Leaves')} 
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: activeTab === 'Leaves' ? '#215D7B' : '#fff', color: activeTab === 'Leaves' ? '#fff' : '#64748b', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                    <FontAwesomeIcon icon={faFileAlt} /> Paid Leaves
                </button>
                
                <button 
                    onClick={() => setActiveTab('WFH')} 
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: activeTab === 'WFH' ? '#215D7B' : '#fff', color: activeTab === 'WFH' ? '#fff' : '#64748b', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                    <FontAwesomeIcon icon={faLaptopHouse} /> Work From Home
                </button>
            </div>

            {/* --- FILTER & SEARCH BAR --- */}
            <div className="filter-bar-card fade-in">
                <div className="filter-buttons">
                    {['All', 'Pending', 'Approved', 'Rejected'].map(status => (
                        <button
                            key={status}
                            className={`gts-btn filter-btn capitalize ${filterStatus === status ? 'primary active' : 'warning inactive'}`}
                            onClick={() => setFilterStatus(status)}
                        >
                            {status === 'All' && <FontAwesomeIcon icon={faFilter} className="filter-icon" />}
                            {status}
                        </button>
                    ))}
                </div>

                <div className="search-wrapper">
                    <FontAwesomeIcon icon={faSearch} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search Employee..."
                        className="swal2-input search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* --- TABLE --- */}
            <div className="employee-table-container fade-in">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            {activeTab === 'Leaves' && <th>Leave Type</th>}
                            <th>Dates</th>
                            <th>Duration</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={activeTab === 'Leaves' ? "6" : "5"} className="empty-table-message">Loading Requests...</td></tr>
                        ) : requests.length === 0 ? (
                            <tr>
                                <td colSpan={activeTab === 'Leaves' ? "6" : "5"} className="empty-table-message">
                                    No {filterStatus !== 'All' ? filterStatus.toLowerCase() : ''} {activeTab === 'Leaves' ? 'leave' : 'WFH'} requests found.
                                </td>
                            </tr>
                        ) : (
                            requests.map(req => (
                                <tr key={req._id}>
                                    {/* 👇 UPDATED: Clickable Name */}
                                    <td data-label="Employee">
                                        <div 
                                            className="fw-bold text-primary"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => req.userId?._id && navigate(`/employee/${req.userId._id}`)}
                                            title="View Profile"
                                        >
                                            {req.userId?.name || 'Unknown'}
                                        </div>
                                    </td>

                                    {activeTab === 'Leaves' && (
                                        <td data-label="Leave Type">
                                            <span className="role-tag employee text-small">{req.leaveType}</span>
                                        </td>
                                    )}

                                    <td data-label="Dates" className="text-dark-gray text-small fw-600">
                                        {new Date(req.fromDate).toLocaleDateString()}
                                        <span className="text-muted mx-1">➜</span>
                                        {new Date(req.toDate).toLocaleDateString()}
                                    </td>

                                    <td data-label="Duration" className="fw-500">
                                        {req.days} Days
                                    </td>

                                    <td data-label="Status">
                                        <span className={`status-badge ${
                                            req.status === 'Approved' ? 'success' :
                                            req.status === 'Rejected' ? 'danger' : 'warning'
                                        }`}>
                                            {req.status}
                                        </span>
                                    </td>

                                    <td data-label="Action">
                                        <div className="flex-row gap-5">
                                            <button
                                                className="gts-btn doc-btn"
                                                style={{ padding: '6px 10px', background: '#f1f5f9', color: '#215D7B' }}
                                                onClick={() => openSidebar(req)}
                                                title="View Details"
                                            >
                                                <FontAwesomeIcon icon={faEye} />
                                            </button>

                                            {req.status === 'Pending' && (
                                                <>
                                                    <button
                                                        className="gts-btn primary btn-small"
                                                        onClick={() => handleAction(req._id, 'Approved', req.userId.name)}
                                                        title="Approve"
                                                    >
                                                        <FontAwesomeIcon icon={faCheck} />
                                                    </button>
                                                    <button
                                                        className="gts-btn danger btn-small"
                                                        onClick={() => handleAction(req._id, 'Rejected', req.userId.name)}
                                                        title="Reject"
                                                    >
                                                        <FontAwesomeIcon icon={faTimes} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
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
                    onLimitChange={(newLimit) => {
                        setItemsPerPage(newLimit);
                        setCurrentPage(1);
                    }}
                />
            )}

            <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={closeSidebar}></div>
            <div className={`expense-detail-sidebar ${isSidebarOpen ? 'open' : ''}`}>
                {selectedRequest && (
                    <>
                        <div className="sidebar-header">
                            <div>
                                <h2 className="sidebar-title">{activeTab === 'Leaves' ? 'Leave Request' : 'WFH Request'}</h2>
                                <span className={`status-badge ${selectedRequest.status === 'Approved' ? 'success' : selectedRequest.status === 'Rejected' ? 'danger' : 'warning'}`} style={{ padding: '4px 8px', fontSize: '10px' }}>
                                    {selectedRequest.status}
                                </span>
                            </div>
                            <button className="sidebar-close-btn" onClick={closeSidebar}><FontAwesomeIcon icon={faTimes} /></button>
                        </div>
                        
                        <div className="sidebar-content">
                            <h3 className="sidebar-section-title">Request Details</h3>
                            <div className="detail-grid-2">
                                {/* 👇 UPDATED: Clickable Name inside Sidebar */}
                                <div className="detail-group">
                                    <span className="detail-label">Employee</span>
                                    <span 
                                        className="detail-value fw-bold text-primary"
                                        style={{ cursor: 'pointer'}}
                                        onClick={() => {
                                            if (selectedRequest.userId?._id) {
                                                closeSidebar();
                                                navigate(`/employee/${selectedRequest.userId._id}`);
                                            }
                                        }}
                                        title="View Profile"
                                    >
                                        {selectedRequest.userId?.name || 'N/A'}
                                    </span>
                                </div>
                                <div className="detail-group">
                                    <span className="detail-label">Duration</span>
                                    <span className="detail-value">{selectedRequest.days} Days</span>
                                </div>
                                
                                {activeTab === 'Leaves' && (
                                    <div className="detail-group" style={{ gridColumn: 'span 2' }}>
                                        <span className="detail-label">Leave Type</span>
                                        <span className="detail-value">{selectedRequest.leaveType}</span>
                                    </div>
                                )}

                                <div className="detail-group">
                                    <span className="detail-label">From Date</span>
                                    <span className="detail-value">{new Date(selectedRequest.fromDate).toLocaleDateString()}</span>
                                </div>
                                <div className="detail-group">
                                    <span className="detail-label">To Date</span>
                                    <span className="detail-value">{new Date(selectedRequest.toDate).toLocaleDateString()}</span>
                                </div>

                                <div className="detail-group" style={{ gridColumn: 'span 2' }}>
                                    <span className="detail-label">Reason provided by employee</span>
                                    <span className="detail-value" style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' }}>
                                        {selectedRequest.reason || 'No reason provided.'}
                                    </span>
                                </div>

                                {selectedRequest.adminRemark && (
                                    <div className="detail-group" style={{ gridColumn: 'span 2' }}>
                                        <span className="detail-label" style={{ color: '#ea580c' }}>Admin / HR Remark</span>
                                        <span className="detail-value" style={{ background: '#fef3c7', padding: '10px', borderRadius: '6px', fontStyle: 'italic' }}>
                                            "{selectedRequest.adminRemark}"
                                        </span>
                                    </div>
                                )}
                            </div>

                            {selectedRequest.status === 'Pending' && (
                                <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
                                    <button 
                                        className="gts-btn primary" 
                                        style={{ flex: 1, justifyContent: 'center' }}
                                        onClick={() => handleAction(selectedRequest._id, 'Approved', selectedRequest.userId?.name)}
                                    >
                                        <FontAwesomeIcon icon={faCheck} style={{ marginRight: '5px' }} /> Approve
                                    </button>
                                    <button 
                                        className="gts-btn danger" 
                                        style={{ flex: 1, justifyContent: 'center' }}
                                        onClick={() => handleAction(selectedRequest._id, 'Rejected', selectedRequest.userId?.name)}
                                    >
                                        <FontAwesomeIcon icon={faTimes} style={{ marginRight: '5px' }} /> Reject
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default EmployeeRequests;