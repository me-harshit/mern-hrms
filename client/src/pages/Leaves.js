import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import api from '../utils/api';
import { faPlus, faFileAlt, faCheckCircle, faTimesCircle, faClock } from '@fortawesome/free-solid-svg-icons';

const Leaves = () => {
    const [stats, setStats] = useState({
        annualQuota: 12,
        used: 0,
        pending: 0
    });
    const [leaveHistory, setLeaveHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLeaves();
    }, []);

    const fetchLeaves = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await api.get('/leaves/my-leaves');
            setLeaveHistory(res.data);

            // Calculate Stats (Basic logic)
            const usedLeaves = res.data
                .filter(l => l.status === 'Approved')
                .reduce((acc, curr) => acc + curr.days, 0);
            
            const pendingCount = res.data.filter(l => l.status === 'Pending').length;

            setStats(prev => ({ ...prev, used: usedLeaves, pending: pendingCount }));
            setLoading(false);
        } catch (err) {
            console.error("Error fetching leaves");
            setLoading(false);
        }
    };

    const handleApplyLeave = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Apply for Leave',
            html: `
                <div style="text-align: left;">
                    <label class="swal-custom-label">Leave Type</label>
                    <select id="leave-type" class="swal2-select" style="width: 100%;">
                        <option value="CL">Casual Leave (CL)</option>
                        <option value="SL">Sick Leave (SL)</option>
                        <option value="PL">Privilege Leave (PL)</option>
                        <option value="UL">Unpaid Leave (UL)</option>
                    </select>

                    <div style="display: flex; gap: 10px;">
                        <div style="flex: 1;">
                            <label class="swal-custom-label">From Date</label>
                            <input id="date-from" type="date" class="swal2-input" style="width: 100%;">
                        </div>
                        <div style="flex: 1;">
                            <label class="swal-custom-label">To Date</label>
                            <input id="date-to" type="date" class="swal2-input" style="width: 100%;">
                        </div>
                    </div>

                    <label class="swal-custom-label">Reason</label>
                    <textarea id="leave-reason" class="swal2-textarea" placeholder="Describe reason..." style="margin: 10px auto; width: 90%;"></textarea>
                </div>
            `,
            confirmButtonText: 'Submit Request',
            confirmButtonColor: '#215D7B',
            showCancelButton: true,
            focusConfirm: false,
            preConfirm: () => {
                const type = document.getElementById('leave-type').value;
                const from = document.getElementById('date-from').value;
                const to = document.getElementById('date-to').value;
                const reason = document.getElementById('leave-reason').value;

                if (!from || !to || !reason) {
                    Swal.showValidationMessage('Please fill all fields');
                }
                return { leaveType: type, fromDate: from, toDate: to, reason };
            }
        });

        if (formValues) {
            try {
                const token = localStorage.getItem('token');
                await api.post('/leaves/apply', formValues);
                
                Swal.fire('Submitted!', 'Your leave request has been sent to HR.', 'success');
                fetchLeaves(); // Refresh list
            } catch (err) {
                Swal.fire('Error', 'Failed to submit request.', 'error');
            }
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Approved': return <span className="status-badge success"><FontAwesomeIcon icon={faCheckCircle} /> Approved</span>;
            case 'Rejected': return <span className="status-badge danger"><FontAwesomeIcon icon={faTimesCircle} /> Rejected</span>;
            default: return <span className="status-badge warning"><FontAwesomeIcon icon={faClock} /> Pending</span>;
        }
    };

    if (loading) return <div className="main-content">Loading Leaves...</div>;

    return (
        <div className="leaves-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <h1 className="page-title">Leave Management</h1>
                <button className="action-btn-primary" onClick={handleApplyLeave}>
                    <FontAwesomeIcon icon={faPlus} /> Apply for Leave
                </button>
            </div>

            {/* --- BALANCE CARDS --- */}
            <div className="leaves-stats-grid">
                <div className="stat-card border-teal">
                    <div className="stat-icon teal-bg"><FontAwesomeIcon icon={faFileAlt} /></div>
                    <div className="stat-info">
                        <p>Annual Quota</p>
                        <h3>{stats.annualQuota} Days</h3>
                    </div>
                </div>
                <div className="stat-card border-plum">
                    <div className="stat-icon plum-bg"><FontAwesomeIcon icon={faCheckCircle} /></div>
                    <div className="stat-info">
                        <p>Leaves Taken</p>
                        <h3>{stats.used} Days</h3>
                    </div>
                </div>
                <div className="stat-card border-teal">
                    <div className="stat-icon teal-bg"><FontAwesomeIcon icon={faClock} /></div>
                    <div className="stat-info">
                        <p>Available Balance</p>
                        <h3>{stats.annualQuota - stats.used} Days</h3>
                    </div>
                </div>
            </div>

            {/* --- HISTORY TABLE --- */}
            <div className="employee-table-container" style={{ marginTop: '30px' }}>
                <h3 style={{ padding: '20px', margin: 0, borderBottom: '1px solid #eee', color: '#215D7B' }}>Application History</h3>
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Leave Type</th>
                            <th>Dates</th>
                            <th>Days</th>
                            <th>Reason</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaveHistory.length === 0 ? (
                            <tr><td colSpan="5" style={{textAlign:'center', padding:'20px', color:'#999'}}>No leave history found.</td></tr>
                        ) : (
                            leaveHistory.map(leave => (
                                <tr key={leave._id}>
                                    <td style={{ fontWeight: '600' }}>{leave.leaveType}</td>
                                    <td style={{ fontSize: '14px', color: '#555' }}>
                                        {new Date(leave.fromDate).toLocaleDateString()} 
                                        <span style={{ color: '#aaa', margin: '0 5px' }}>to</span> 
                                        {new Date(leave.toDate).toLocaleDateString()}
                                    </td>
                                    <td>{leave.days}</td>
                                    <td style={{ maxWidth: '200px', fontSize: '13px', color: '#777' }}>{leave.reason}</td>
                                    <td>{getStatusBadge(leave.status)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Leaves;