import React, { useState, useEffect } from 'react';
import api from '../utils/api'; // Import api util
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTimes } from '@fortawesome/free-solid-svg-icons';

const LeaveRequests = () => {
    const [requests, setRequests] = useState([]);

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            // Use api.get with relative path
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
                // Use api.put with relative path
                await api.put(`/leaves/action/${id}`, { status });
                
                Swal.fire('Updated!', `Request has been ${status}.`, 'success');
                fetchRequests(); // Refresh
            } catch (err) {
                Swal.fire('Error', 'Action failed', 'error');
            }
        }
    };

    return (
        <div className="attendance-container">
            <h1 className="page-title">Leave Requests</h1>

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
                        {requests.length === 0 ? (
                            <tr><td colSpan="7" style={{textAlign:'center', padding:'20px'}}>No leave requests found.</td></tr>
                        ) : (
                            requests.map(req => (
                                <tr key={req._id}>
                                    <td style={{ fontWeight: 'bold' }}>{req.userId?.name || 'Unknown'}</td>
                                    <td><span className="role-tag employee">{req.leaveType}</span></td>
                                    <td style={{ fontSize: '13px' }}>
                                        {new Date(req.fromDate).toLocaleDateString()} <br/> 
                                        <span style={{color:'#999'}}>to</span> {new Date(req.toDate).toLocaleDateString()}
                                    </td>
                                    <td>{req.days} Days</td>
                                    <td style={{ maxWidth: '200px', fontSize: '12px' }}>{req.reason}</td>
                                    <td>
                                        <span className={`status-badge ${
                                            req.status === 'Approved' ? 'success' : 
                                            req.status === 'Rejected' ? 'danger' : 'warning'
                                        }`}>
                                            {req.status}
                                        </span>
                                    </td>
                                    <td>
                                        {req.status === 'Pending' && (
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <button 
                                                    className="gts-btn primary" 
                                                    style={{ padding: '5px 10px', fontSize: '12px' }}
                                                    onClick={() => handleAction(req._id, 'Approved', req.userId.name)}
                                                >
                                                    <FontAwesomeIcon icon={faCheck} />
                                                </button>
                                                <button 
                                                    className="gts-btn danger" 
                                                    style={{ padding: '5px 10px', fontSize: '12px' }}
                                                    onClick={() => handleAction(req._id, 'Rejected', req.userId.name)}
                                                >
                                                    <FontAwesomeIcon icon={faTimes} />
                                                </button>
                                            </div>
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