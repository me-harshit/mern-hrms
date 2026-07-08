import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import api from '../../utils/api';
import { faPlus, faCalendarDay, faCheckCircle, faTimesCircle, faClock, faWallet } from '@fortawesome/free-solid-svg-icons';
import '../../styles/App.css';

const Leaves = () => {
    const [balances, setBalances] = useState({ CL: 0, EL: 0 });
    const [leaveHistory, setLeaveHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLeaves();
    }, []);

    const fetchLeaves = async () => {
        try {
            const res = await api.get('/leaves/my-leaves');
            setLeaveHistory(res.data.history);
            setBalances(res.data.balances);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching leaves");
            setLoading(false);
        }
    };

    const handleApplyLeave = async () => {
        let options = '';

        if (balances.CL > 0) {
            options += `<option value="CL">Casual Leave (Balance: ${balances.CL})</option>`;
        }
        if (balances.EL > 0) {
            options += `<option value="EL">Earned Leave (Balance: ${balances.EL})</option>`;
        }
        options += `<option value="UL">Unpaid Leave (UL)</option>`;

        const { value: formValues } = await Swal.fire({
            title: 'Apply for Leave',
            html: `
                <div style="text-align: left;">
                    <label class="swal-custom-label">Leave Type</label>
                    <select id="leave-type" class="swal2-select" style="width: 100%;">
                        ${options}
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

                    <div id="day-parts-wrap" style="display:none; margin-top: 6px;">
                        <label class="swal-custom-label">Day-wise Breakdown</label>
                        <div id="day-parts" style="border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;"></div>
                        <div id="days-total" style="text-align:right; font-size:13px; color:#215D7B; margin-top:6px;"></div>
                    </div>

                    <label class="swal-custom-label">Reason</label>
                    <textarea id="leave-reason" class="swal2-textarea" placeholder="Describe reason..." style="margin: 10px auto; width: 90%;"></textarea>
                </div>
            `,
            confirmButtonText: 'Submit Request',
            confirmButtonColor: '#215D7B',
            showCancelButton: true,
            focusConfirm: false,
            didOpen: () => {
                const opts = `<option value="FULL">Full Day</option><option value="FIRST_HALF">First Half</option><option value="SECOND_HALF">Second Half</option>`;

                const updateTotal = () => {
                    const totalEl = document.getElementById('days-total');
                    const fromV = document.getElementById('date-from').value;
                    const toV = document.getElementById('date-to').value;
                    if (!fromV || !toV) { totalEl.innerHTML = ''; return; }
                    const from = new Date(fromV), to = new Date(toV);
                    if (isNaN(from) || isNaN(to) || to < from) { totalEl.innerHTML = ''; return; }
                    const base = Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1;
                    const startSel = document.getElementById('half-start');
                    const endSel = document.getElementById('half-end');
                    let days;
                    if (base === 1) {
                        days = (startSel && startSel.value !== 'FULL') ? 0.5 : 1;
                    } else {
                        days = base;
                        if (startSel && startSel.value !== 'FULL') days -= 0.5;
                        if (endSel && endSel.value !== 'FULL') days -= 0.5;
                    }
                    totalEl.innerHTML = `Total: <b>${days}</b> day(s)`;
                };

                const renderDayParts = () => {
                    const wrap = document.getElementById('day-parts-wrap');
                    const container = document.getElementById('day-parts');
                    const fromV = document.getElementById('date-from').value;
                    const toV = document.getElementById('date-to').value;
                    if (!fromV || !toV) { wrap.style.display = 'none'; container.innerHTML = ''; updateTotal(); return; }
                    const from = new Date(fromV), to = new Date(toV);
                    if (isNaN(from) || isNaN(to) || to < from) { wrap.style.display = 'none'; container.innerHTML = ''; updateTotal(); return; }

                    const dates = [];
                    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) dates.push(new Date(d));
                    const n = dates.length;

                    let html = '';
                    dates.forEach((dt, i) => {
                        const label = dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
                        const isFirst = i === 0, isLast = i === n - 1;
                        const rowStyle = `display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 12px; ${i < n - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''}`;
                        if (isFirst || isLast) {
                            const selId = isFirst ? 'half-start' : 'half-end';
                            html += `<div style="${rowStyle}"><span style="font-size:13px; color:#334155;">${label}</span>
                                <select id="${selId}" class="daypart-select" style="padding:4px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px;">${opts}</select></div>`;
                        } else {
                            html += `<div style="${rowStyle}"><span style="font-size:13px; color:#334155;">${label}</span>
                                <span style="font-size:12px; color:#94a3b8;">Full Day</span></div>`;
                        }
                    });
                    container.innerHTML = html;
                    wrap.style.display = 'block';
                    container.querySelectorAll('.daypart-select').forEach(s => s.addEventListener('change', updateTotal));
                    updateTotal();
                };

                document.getElementById('date-from').addEventListener('change', renderDayParts);
                document.getElementById('date-to').addEventListener('change', renderDayParts);
            },
            preConfirm: () => {
                const type = document.getElementById('leave-type').value;
                const from = document.getElementById('date-from').value;
                const to = document.getElementById('date-to').value;
                const reason = document.getElementById('leave-reason').value;

                if (!from || !to || !reason) {
                    Swal.showValidationMessage('Please fill all fields');
                    return false;
                }
                if (new Date(to) < new Date(from)) {
                    Swal.showValidationMessage('To Date cannot be before From Date');
                    return false;
                }
                const startHalf = document.getElementById('half-start')?.value || 'FULL';
                const endHalf = document.getElementById('half-end')?.value || 'FULL';
                return { leaveType: type, fromDate: from, toDate: to, reason, startHalf, endHalf };
            }
        });

        if (formValues) {
            try {
                Swal.fire({
                    title: 'Processing...',
                    text: 'Submitting request and notifying HR.',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                await api.post('/leaves/apply', formValues);

                Swal.fire('Submitted!', 'Your leave request has been sent and HR has been notified.', 'success');
                fetchLeaves();
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

    if (loading) return <div className="main-content">Loading Leaves...</div>;

    return (
        <div className="leaves-container fade-in">
            <div className="page-header-row">
                <h1 className="page-title header-no-margin">Leave Management</h1>
                <button className="action-btn-primary" onClick={handleApplyLeave}>
                    <FontAwesomeIcon icon={faPlus} className="btn-icon" /> Apply for Leave
                </button>
            </div>

            {/* --- BALANCE CARDS --- */}
            <div className="leaves-stats-grid two-cols">
                <div className="stat-card border-teal">
                    <div className="stat-icon teal-bg"><FontAwesomeIcon icon={faCalendarDay} /></div>
                    <div className="stat-info">
                        <p>Casual Leave (CL)</p>
                        <h3>{balances.CL} Available</h3>
                        <small className="text-muted text-small">+1 per month (Resets Jan 1st)</small>
                    </div>
                </div>

                <div className="stat-card border-plum">
                    <div className="stat-icon plum-bg"><FontAwesomeIcon icon={faWallet} /></div>
                    <div className="stat-info">
                        <p>Earned Leave (EL)</p>
                        <h3>{balances.EL} Available</h3>
                        <small className="text-muted text-small">Added by HR</small>
                    </div>
                </div>
            </div>

            {/* --- HISTORY TABLE --- */}
            <div className="employee-table-container mt-30 fade-in">
                <h3 className="table-header-title">Application History</h3>
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
                            <tr>
                                <td colSpan="5" className="empty-table-message">No leave history found.</td>
                            </tr>
                        ) : (
                            leaveHistory.map(leave => (
                                <tr key={leave._id}>
                                    <td data-label="Leave Type" className="fw-600">{leave.leaveType}</td>
                                    <td data-label="Dates" className="text-dark-gray text-small">
                                        {new Date(leave.fromDate).toLocaleDateString()}
                                        <span className="text-muted mx-1">to</span>
                                        {new Date(leave.toDate).toLocaleDateString()}
                                    </td>
                                    <td data-label="Days">
                                        {leave.days}
                                        {((leave.startHalf && leave.startHalf !== 'FULL') || (leave.endHalf && leave.endHalf !== 'FULL'))
                                            ? <span className="status-badge warning text-small ml-5" style={{ padding: '1px 6px', fontSize: '10px' }}>½ day</span>
                                            : ''}
                                    </td>
                                    <td data-label="Reason" className="note-cell text-muted text-small">
                                        {leave.reason}
                                    </td>
                                    <td data-label="Status">{getStatusBadge(leave.status)}</td>
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