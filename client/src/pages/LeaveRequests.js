import React, { useState, useEffect } from 'react';
import api from '../utils/api'; 
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTimes, faSearch, faFilter } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

const LeaveRequests = () => {
    const [requests, setRequests] = useState([]);
    const [filteredRequests, setFilteredRequests] = useState([]);
    
    // Filters State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All'); // 'All', 'Pending', 'Approved', 'Rejected'

    useEffect(() => {
        fetchRequests();
    }, []);

    // --- FILTERING LOGIC ---
    useEffect(() => {
        let result = requests;

        // 1. Filter by Status
        if (filterStatus !== 'All') {
            result = result.filter(req => req.status === filterStatus);
        }

        // 2. Filter by Search Term (Employee Name)
        if (searchTerm) {
            result = result.filter(req => 
                req.userId?.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        setFilteredRequests(result);
    }, [requests, filterStatus, searchTerm]);

    const fetchRequests = async () => {
        try {
            const res = await api.get('/leaves/all-requests');
            setRequests(res.data);
        } catch (err) {
            console.error("Error fetching requests");
        }
    };

    const handleAction = async (id, status, empName) => {
        const result = await Swal.fire({
            title: `Confirm ${status}?`,
            text: `You are about to ${status.toLowerCase()} leave for ${empName}.`,
            icon: status === 'Approved' ? 'success' : 'warning',
            showCancelButton: true,
            confirmButtonColor: status === 'Approved' ? '#215D7B' : '#d33',
            confirmButtonText: `Yes, ${status}`
        });

        if (result.isConfirmed) {
            try {
                await api.put(`/leaves/action/${id}`, { status });
                
                Swal.fire('Updated!', `Request has been ${status}.`, 'success');
                fetchRequests(); // Refresh data
            } catch (err) {
                Swal.fire('Error', 'Action failed', 'error');
            }
        }
    };

    return (
        <div className="attendance-container fade-in">
            <h1 className="page-title header-no-margin mb-20">Leave Requests</h1>

            {/* --- FILTER & SEARCH BAR --- */}
            <div className="filter-bar-card fade-in">
                
                {/* 1. Status Filter Buttons */}
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

                {/* 2. Employee Search */}
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
                            <th>Leave Type</th>
                            <th>Dates</th>
                            <th>Duration</th>
                            <th>Reason</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRequests.length === 0 ? (
                            <tr>
                                <td colSpan="7" className="empty-table-message">
                                    No {filterStatus !== 'All' ? filterStatus.toLowerCase() : ''} leave requests found matching "{searchTerm}".
                                </td>
                            </tr>
                        ) : (
                            filteredRequests.map(req => (
                                <tr key={req._id}>
                                    <td data-label="Employee" className="fw-bold text-primary">
                                        {req.userId?.name || 'Unknown'}
                                    </td>
                                    
                                    <td data-label="Leave Type">
                                        <span className="role-tag employee text-small">{req.leaveType}</span>
                                    </td>
                                    
                                    <td data-label="Dates" className="text-dark-gray text-small">
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

export default LeaveRequests;