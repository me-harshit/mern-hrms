import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faFileAlt, faCheckCircle, faTimesCircle, faClock } from '@fortawesome/free-solid-svg-icons';

const Leaves = () => {
    // Mock Data (Static for now)
    const [stats] = useState({
        annualQuota: 12,
        used: 2,
        pending: 1
    });

    const [leaveHistory] = useState([
        { _id: 1, type: 'Casual Leave', from: '2026-01-15', to: '2026-01-15', days: 1, reason: 'Personal work', status: 'Approved' },
        { _id: 2, type: 'Sick Leave', from: '2026-02-10', to: '2026-02-12', days: 3, reason: 'Viral Fever', status: 'Rejected' },
        { _id: 3, type: 'Casual Leave', from: '2026-03-20', to: '2026-03-20', days: 1, reason: 'Family Function', status: 'Pending' }
    ]);

    const handleApplyLeave = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Apply for Leave',
            html: `
                <div style="text-align: left;">
                    <label class="swal-custom-label">Leave Type</label>
                    <select id="leave-type" class="swal2-select" style="width: 100%;">
                        <option value="CL">Casual Leave (1 Day)</option>
                        <option value="SL">Sick Leave</option>
                        <option value="PL">Privilege Leave</option>
                    </select>

                    <div style="display: flex; gap: 10px;">
                        <div style="flex: 1;">
                            <label class="swal-custom-label">From Date</label>
                            <input id="date-from" type="date" class="swal2-input">
                        </div>
                        <div style="flex: 1;">
                            <label class="swal-custom-label">To Date</label>
                            <input id="date-to" type="date" class="swal2-input">
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
                return { type, from, to, reason };
            }
        });

        if (formValues) {
            // Placeholder: This is where we will add the axios.post() call next
            console.log("Applying for:", formValues);
            Swal.fire('Submitted!', 'Your leave request has been sent to HR.', 'success');
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Approved': return <span className="status-badge success"><FontAwesomeIcon icon={faCheckCircle} /> Approved</span>;
            case 'Rejected': return <span className="status-badge danger"><FontAwesomeIcon icon={faTimesCircle} /> Rejected</span>;
            default: return <span className="status-badge warning"><FontAwesomeIcon icon={faClock} /> Pending</span>;
        }
    };

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
                        <p>Annual CL Quota</p>
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
                        <p>Remaining Balance</p>
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
                        {leaveHistory.map(leave => (
                            <tr key={leave._id}>
                                <td style={{ fontWeight: '600' }}>{leave.type}</td>
                                <td style={{ fontSize: '14px', color: '#555' }}>
                                    {leave.from} <span style={{ color: '#aaa' }}>to</span> {leave.to}
                                </td>
                                <td>{leave.days}</td>
                                <td style={{ maxWidth: '200px', fontSize: '13px', color: '#777' }}>{leave.reason}</td>
                                <td>{getStatusBadge(leave.status)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Leaves;