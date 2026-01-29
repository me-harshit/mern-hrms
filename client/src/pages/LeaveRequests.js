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
        <div className="attendance-container">
            <h1 className="page-title">Leave Requests</h1>

            {/* --- FILTER & SEARCH BAR --- */}
            <div className="control-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '20px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '25px' }}>
                
                {/* 1. Status Filter Buttons */}
                <div className="button-group" style={{ display: 'flex', gap: '10px' }}>
                    {['All', 'Pending', 'Approved', 'Rejected'].map(status => (
                        <button
                            key={status}
                            className={`gts-btn ${filterStatus === status ? 'primary' : 'warning'}`}
                            style={{ 
                                opacity: filterStatus === status ? 1 : 0.7, 
                                padding: '8px 16px', 
                                fontSize: '13px',
                                textTransform: 'capitalize'
                            }}
                            onClick={() => setFilterStatus(status)}
                        >
                            {status === 'All' && <FontAwesomeIcon icon={faFilter} style={{ marginRight: '6px' }} />}
                            {status}
                        </button>
                    ))}
                </div>

                {/* 2. Employee Search */}
                <div style={{ position: 'relative', minWidth: '250px' }}>
                    <FontAwesomeIcon 
                        icon={faSearch} 
                        style={{ 
                            position: 'absolute', 
                            left: '15px', 
                            top: '50%', 
                            transform: 'translateY(-50%)', 
                            color: '#aaa',
                            pointerEvents: 'none' 
                        }} 
                    />
                    <input
                        type="text"
                        placeholder="Search Employee..."
                        className="swal2-input"
                        style={{ margin: 0, paddingLeft: '40px', width: '100%', height: '40px', fontSize: '14px' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* --- TABLE --- */}
            <div className="employee-table-container">
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
                                <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                                    No {filterStatus !== 'All' ? filterStatus.toLowerCase() : ''} leave requests found matching "{searchTerm}".
                                </td>
                            </tr>
                        ) : (
                            filteredRequests.map(req => (
                                <tr key={req._id}>
                                    <td style={{ fontWeight: 'bold', color: '#215D7B' }}>{req.userId?.name || 'Unknown'}</td>
                                    <td><span className="role-tag employee" style={{fontSize: '11px'}}>{req.leaveType}</span></td>
                                    <td style={{ fontSize: '13px' }}>
                                        {new Date(req.fromDate).toLocaleDateString()} 
                                        <span style={{color:'#ccc', margin: '0 5px'}}>➜</span> 
                                        {new Date(req.toDate).toLocaleDateString()}
                                    </td>
                                    <td style={{ fontWeight: '500' }}>{req.days} Days</td>
                                    <td style={{ maxWidth: '250px', fontSize: '12px', color: '#555' }}>{req.reason}</td>
                                    <td>
                                        <span className={`status-badge ${
                                            req.status === 'Approved' ? 'success' : 
                                            req.status === 'Rejected' ? 'danger' : 'warning'
                                        }`}>
                                            {req.status}
                                        </span>
                                    </td>
                                    <td>
                                        {req.status === 'Pending' ? (
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button 
                                                    className="gts-btn primary" 
                                                    style={{ padding: '6px 10px', fontSize: '12px' }}
                                                    onClick={() => handleAction(req._id, 'Approved', req.userId.name)}
                                                    title="Approve"
                                                >
                                                    <FontAwesomeIcon icon={faCheck} />
                                                </button>
                                                <button 
                                                    className="gts-btn danger" 
                                                    style={{ padding: '6px 10px', fontSize: '12px' }}
                                                    onClick={() => handleAction(req._id, 'Rejected', req.userId.name)}
                                                    title="Reject"
                                                >
                                                    <FontAwesomeIcon icon={faTimes} />
                                                </button>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: '12px', color: '#aaa', fontStyle: 'italic' }}>Completed</span>
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