import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTimes, faSearch, faFilter, faFileAlt, faLaptopHouse } from '@fortawesome/free-solid-svg-icons';
import '../../styles/App.css';

const EmployeeRequests = () => {
    // Data States
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [wfhRequests, setWfhRequests] = useState([]);
    const [filteredRequests, setFilteredRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    // UI States
    const [activeTab, setActiveTab] = useState('Leaves'); // 'Leaves' or 'WFH'
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('Pending'); // Default to Pending so it acts as a to-do list

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            // Fetch both datasets concurrently for speed
            const [leaveRes, wfhRes] = await Promise.all([
                api.get('/leaves/all-requests'),
                api.get('/wfh/all-requests')
            ]);
            
            setLeaveRequests(leaveRes.data);
            setWfhRequests(wfhRes.data);
        } catch (err) {
            console.error("Error fetching requests");
            Swal.fire('Error', 'Failed to load requests from server.', 'error');
        } finally {
            setLoading(false);
        }
    };

    // --- FILTERING LOGIC ---
    useEffect(() => {
        // Select the active dataset
        let result = activeTab === 'Leaves' ? leaveRequests : wfhRequests;

        // 1. Filter by Status
        if (filterStatus !== 'All') {
            result = result.filter(req => req.status === filterStatus);
        }

        // 2. Filter by Search Term (Employee Name or Reason)
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(req =>
                (req.userId?.name && req.userId.name.toLowerCase().includes(term)) ||
                (req.reason && req.reason.toLowerCase().includes(term))
            );
        }

        setFilteredRequests(result);
    }, [leaveRequests, wfhRequests, activeTab, filterStatus, searchTerm]);

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
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                // Dynamically route to the correct API based on the active tab
                await api.put(`${endpointPrefix}/action/${id}`, {
                    status,
                    adminRemark: result.value || ''
                });

                Swal.fire('Updated!', `Request has been ${status}. Employee notified.`, 'success');
                fetchRequests(); // Refresh data
            } catch (err) {
                Swal.fire('Error', err.response?.data?.message || 'Action failed', 'error');
            }
        }
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
                    {leaveRequests.filter(r => r.status === 'Pending').length > 0 && (
                        <span style={{ background: activeTab === 'Leaves' ? '#fff' : '#ef4444', color: activeTab === 'Leaves' ? '#215D7B' : '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', marginLeft: '5px' }}>
                            {leaveRequests.filter(r => r.status === 'Pending').length}
                        </span>
                    )}
                </button>
                
                <button 
                    onClick={() => setActiveTab('WFH')} 
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: activeTab === 'WFH' ? '#215D7B' : '#fff', color: activeTab === 'WFH' ? '#fff' : '#64748b', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                    <FontAwesomeIcon icon={faLaptopHouse} /> Work From Home
                    {wfhRequests.filter(r => r.status === 'Pending').length > 0 && (
                        <span style={{ background: activeTab === 'WFH' ? '#fff' : '#ef4444', color: activeTab === 'WFH' ? '#215D7B' : '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', marginLeft: '5px' }}>
                            {wfhRequests.filter(r => r.status === 'Pending').length}
                        </span>
                    )}
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
                            <th>Reason</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={activeTab === 'Leaves' ? "7" : "6"} className="empty-table-message">Loading Requests...</td></tr>
                        ) : filteredRequests.length === 0 ? (
                            <tr>
                                <td colSpan={activeTab === 'Leaves' ? "7" : "6"} className="empty-table-message">
                                    No {filterStatus !== 'All' ? filterStatus.toLowerCase() : ''} {activeTab === 'Leaves' ? 'leave' : 'WFH'} requests found matching "{searchTerm}".
                                </td>
                            </tr>
                        ) : (
                            filteredRequests.map(req => (
                                <tr key={req._id}>
                                    <td data-label="Employee" className="fw-bold text-primary">
                                        {req.userId?.name || 'Unknown'}
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

                                    <td data-label="Reason" className="note-cell text-muted text-small">
                                        {req.reason}
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
                                        {req.status === 'Pending' ? (
                                            <div className="flex-row gap-10">
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
                                            </div>
                                        ) : (
                                            <span className="text-muted text-small italic">Completed</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default EmployeeRequests;