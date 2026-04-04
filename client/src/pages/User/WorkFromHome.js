import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import api from '../../utils/api';
import { faPlus, faLaptopHouse, faCheckCircle, faTimesCircle, faClock } from '@fortawesome/free-solid-svg-icons';
import '../../styles/App.css';

const WorkFromHome = () => {
    const [wfhHistory, setWfhHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchWfhRequests();
    }, []);

    const fetchWfhRequests = async () => {
        try {
            const res = await api.get('/wfh/my-requests');
            setWfhHistory(res.data.history);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching WFH requests");
            setLoading(false);
        }
    };

    const handleApplyWfh = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Request Work From Home',
            html: `
                <div style="text-align: left;">
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <div style="flex: 1;">
                            <label class="swal-custom-label">From Date</label>
                            <input id="date-from" type="date" class="swal2-input" style="width: 100%; margin-top: 5px;">
                        </div>
                        <div style="flex: 1;">
                            <label class="swal-custom-label">To Date</label>
                            <input id="date-to" type="date" class="swal2-input" style="width: 100%; margin-top: 5px;">
                        </div>
                    </div>

                    <div style="margin-top: 15px;">
                        <label class="swal-custom-label">Reason / Work Plan</label>
                        <textarea id="wfh-reason" class="swal2-textarea" placeholder="Briefly describe why you need WFH and your tasks for the day..." style="margin-top: 5px; width: 100%;"></textarea>
                    </div>
                </div>
            `,
            confirmButtonText: 'Submit Request',
            confirmButtonColor: '#215D7B',
            showCancelButton: true,
            focusConfirm: false,
            preConfirm: () => {
                const from = document.getElementById('date-from').value;
                const to = document.getElementById('date-to').value;
                const reason = document.getElementById('wfh-reason').value;

                if (!from || !to || !reason) {
                    Swal.showValidationMessage('Please fill all fields');
                    return false;
                }
                if (new Date(from) > new Date(to)) {
                    Swal.showValidationMessage('"From" date cannot be after "To" date');
                    return false;
                }
                return { fromDate: from, toDate: to, reason };
            }
        });

        if (formValues) {
            try {
                Swal.fire({
                    title: 'Processing...',
                    text: 'Submitting request and notifying Manager.',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                await api.post('/wfh/apply', formValues);
                Swal.fire('Submitted!', 'Your WFH request has been sent.', 'success');
                fetchWfhRequests();
            } catch (err) {
                Swal.fire('Error', err.response?.data?.message || 'Failed to submit request.', 'error');
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

    if (loading) return <div className="main-content">Loading Requests...</div>;

    return (
        <div className="leaves-container fade-in">
            <div className="page-header-row mb-20">
                <h1 className="page-title header-no-margin">
                    <FontAwesomeIcon icon={faLaptopHouse} className="btn-icon" style={{ color: '#215D7B' }} /> Work From Home
                </h1>
                <button className="action-btn-primary" onClick={handleApplyWfh}>
                    <FontAwesomeIcon icon={faPlus} className="btn-icon" /> Request WFH
                </button>
            </div>

            {/* --- HISTORY TABLE --- */}
            <div className="employee-table-container fade-in">
                <h3 className="table-header-title">My WFH History</h3>
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Dates</th>
                            <th>Days</th>
                            <th>Reason & Work Plan</th>
                            <th>Admin Comment</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {wfhHistory.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="empty-table-message">No Work From Home history found.</td>
                            </tr>
                        ) : (
                            wfhHistory.map(req => (
                                <tr key={req._id}>
                                    <td data-label="Dates" className="text-dark-gray text-small fw-600">
                                        {new Date(req.fromDate).toLocaleDateString()}
                                        <span className="text-muted mx-1">to</span>
                                        {new Date(req.toDate).toLocaleDateString()}
                                    </td>
                                    <td data-label="Days">{req.days}</td>
                                    <td data-label="Reason" className="note-cell text-muted text-small">
                                        {req.reason}
                                    </td>
                                    <td data-label="Admin Comment" className="note-cell text-small" style={{ color: '#ea580c', fontStyle: 'italic' }}>
                                        {req.adminComment || '-'}
                                    </td>
                                    <td data-label="Status">{getStatusBadge(req.status)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default WorkFromHome;