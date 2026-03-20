import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faUser, faSave, faArrowLeft, faClock, faPlaneDeparture, faEdit
} from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

const EmployeeProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('details');

    const [user, setUser] = useState({});
    const [leaveStats, setLeaveStats] = useState({ history: [] });
    const [attendanceLogs, setAttendanceLogs] = useState([]);

    useEffect(() => {
        fetchEmployeeData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const fetchEmployeeData = async () => {
        try {
            const [userRes, leaveRes, attendanceRes] = await Promise.all([
                api.get(`/employees/${id}`),
                api.get(`/leaves/admin/user-leaves/${id}`),
                api.get(`/attendance/admin/user-logs/${id}`)
            ]);

            setUser(userRes.data);
            setLeaveStats(leaveRes.data);
            setAttendanceLogs(attendanceRes.data);
            setLoading(false);
        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'Could not load employee data', 'error');
            navigate('/employees');
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/employees/${id}`, user);
            Swal.fire('Success', 'Employee Profile Updated', 'success');
        } catch (err) {
            Swal.fire('Error', 'Failed to update profile', 'error');
        }
    };

    const handleUpdateBalance = async () => {
        try {
            await api.post('/leaves/admin/update-balance', {
                userId: id,
                cl: user.casualLeaveBalance,
                el: user.earnedLeaveBalance,
                salary: user.salary
            });
            Swal.fire('Success', 'Employee Balances updated', 'success');
            fetchEmployeeData();
        } catch (err) {
            Swal.fire('Error', 'Update failed', 'error');
        }
    };

    // --- HELPER: CALCULATE DURATION ---
    const calculateDuration = (start, end) => {
        if (!start || !end) return <span className="text-muted italic text-small">In Progress</span>;

        const startTime = new Date(start);
        const endTime = new Date(end);
        const diffMs = endTime - startTime;

        if (diffMs < 0) return "-";

        const totalMinutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        return `${hours}h ${minutes}m`;
    };

    // --- HANDLER: EDIT LOG ---
    const handleEdit = async (log) => {
        const toTimeStr = (dateStr) => {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };

        const inTime = toTimeStr(log.checkIn);
        const outTime = toTimeStr(log.checkOut);

        const { value: formValues } = await Swal.fire({
            title: `Edit Log: ${log.date}`,
            html: `
                <div style="text-align:left">
                    <p style="font-size:12px; color:#666; margin-bottom:10px;">
                        <span style="color:#dc2626">*</span> Changing time will auto-recalculate Status.
                    </p>

                    <label class="swal-custom-label">Check In Time</label>
                    <input id="swal-in" type="time" class="swal2-input" value="${inTime}">

                    <label class="swal-custom-label">Check Out Time</label>
                    <input id="swal-out" type="time" class="swal2-input" value="${outTime}">

                    <label class="swal-custom-label">Manual Status Override</label>
                    <select id="swal-status" class="swal2-select" style="width: 100%">
                        <option value="Auto">Auto Calculate</option>
                        <option value="Present" ${log.status === 'Present' ? 'selected' : ''}>Present</option>
                        <option value="Half Day" ${log.status === 'Half Day' ? 'selected' : ''}>Half Day</option>
                        <option value="Late" ${log.status === 'Late' ? 'selected' : ''}>Late</option>
                        <option value="Absent" ${log.status === 'Absent' ? 'selected' : ''}>Absent</option>
                    </select>

                    <label class="swal-custom-label">Exception Note</label>
                    <input id="swal-note" class="swal2-input" placeholder="Reason..." value="${log.note || ''}">
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#215D7B',
            preConfirm: () => {
                const timeInStr = document.getElementById('swal-in').value;
                const timeOutStr = document.getElementById('swal-out').value;
                const statusInput = document.getElementById('swal-status').value;
                const note = document.getElementById('swal-note').value;

                if (!timeInStr) return Swal.showValidationMessage('Check In time is required');

                const checkInDate = new Date(log.checkIn);
                const [inH, inM] = timeInStr.split(':');
                checkInDate.setHours(inH, inM, 0, 0);

                let checkOutDate = null;
                if (timeOutStr) {
                    checkOutDate = new Date(checkInDate);
                    const [outH, outM] = timeOutStr.split(':');
                    checkOutDate.setHours(outH, outM, 0, 0);
                }

                return {
                    checkIn: checkInDate.toISOString(),
                    checkOut: checkOutDate ? checkOutDate.toISOString() : null,
                    status: statusInput,
                    note: note
                };
            }
        });

        if (formValues) {
            try {
                await api.put(`/attendance/update/${log._id}`, formValues);
                Swal.fire('Updated', 'Attendance record updated.', 'success');
                fetchEmployeeData();
            } catch (err) {
                Swal.fire('Error', 'Update failed', 'error');
            }
        }
    };

    if (loading) return <div className="main-content">Loading Profile...</div>;

    return (
        <div className="dashboard-container fade-in">
            {/* HEADER */}
            <div className="page-header-left">
                <button className="gts-btn cancel-btn m-0" onClick={() => navigate('/employees')}>
                    <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back
                </button>
                <h1 className="page-title header-no-margin">{user.name}'s Profile</h1>
            </div>

            {/* TABS */}
            <div className="control-card p-15 mb-25">
                <div className="tab-buttons-wrapper">
                    <button
                        className={`gts-btn tab-btn ${activeTab === 'details' ? 'primary' : 'warning inactive'}`}
                        onClick={() => setActiveTab('details')}
                    >
                        <FontAwesomeIcon icon={faUser} className="btn-icon" /> Details & Config
                    </button>

                    <button
                        className={`gts-btn tab-btn ${activeTab === 'leaves' ? 'primary' : 'warning inactive'}`}
                        onClick={() => setActiveTab('leaves')}
                    >
                        <FontAwesomeIcon icon={faPlaneDeparture} className="btn-icon" /> Leaves & Balances
                    </button>

                    <button
                        className={`gts-btn tab-btn ${activeTab === 'attendance' ? 'primary' : 'warning inactive'}`}
                        onClick={() => setActiveTab('attendance')}
                    >
                        <FontAwesomeIcon icon={faClock} className="btn-icon" /> Attendance Logs
                    </button>
                </div>
            </div>

            {/* --- TAB CONTENT: DETAILS --- */}
            {activeTab === 'details' && (
                <div className="control-card fade-in d-block">
                    <h3 className="section-title border-bottom pb-10">
                        Personal & Employment Details
                    </h3>

                    <form onSubmit={handleUpdateProfile} className="form-grid">
                        {/* ROW 1: Basics */}
                        <div className="form-group">
                            <label className="input-label">Full Name</label>
                            <input className="custom-input" value={user.name || ''} onChange={e => setUser({ ...user, name: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Email</label>
                            <input className="custom-input" value={user.email || ''} onChange={e => setUser({ ...user, email: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label text-primary fw-bold">Employee / Biometric ID</label>
                            <input className="custom-input" placeholder="e.g. GTS003" value={user.employeeId || ''} onChange={e => setUser({ ...user, employeeId: e.target.value })} />
                        </div>

                        {/* ROW 2: Dates */}
                        <div className="form-group">
                            <label className="input-label">Date of Birth</label>
                            <input 
                                type="date" 
                                className="custom-input" 
                                value={user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : ''} 
                                onChange={e => setUser({ ...user, dateOfBirth: e.target.value })} 
                            />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Joining Date</label>
                            <input 
                                type="date" 
                                className="custom-input" 
                                value={user.joiningDate ? new Date(user.joiningDate).toISOString().split('T')[0] : ''} 
                                onChange={e => setUser({ ...user, joiningDate: e.target.value })} 
                            />
                        </div>

                        {/* ROW 3: Contact & Emergency */}
                        <div className="form-group">
                            <label className="input-label">Phone Number</label>
                            <input className="custom-input" placeholder="+91..." value={user.phoneNumber || ''} onChange={e => setUser({ ...user, phoneNumber: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Address</label>
                            <input className="custom-input" value={user.address || ''} onChange={e => setUser({ ...user, address: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Aadhaar Number</label>
                            <input className="custom-input" value={user.aadhaar || ''} onChange={e => setUser({ ...user, aadhaar: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Emergency Contact</label>
                            <input className="custom-input" value={user.emergencyContact || ''} onChange={e => setUser({ ...user, emergencyContact: e.target.value })} />
                        </div>

                        {/* ROW 4: System Config */}
                        <div className="form-group">
                            <label className="input-label">System Role</label>
                            <select className="swal2-select custom-input" value={user.role || 'EMPLOYEE'} onChange={e => setUser({ ...user, role: e.target.value })}>
                                <option value="EMPLOYEE">Employee</option>
                                <option value="HR">HR</option>
                                <option value="ADMIN">Admin</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="input-label">Shift Timing</label>
                            <select className="swal2-select custom-input" value={user.shiftType || 'DAY'} onChange={e => setUser({ ...user, shiftType: e.target.value })}>
                                <option value="DAY">Day Shift</option>
                                <option value="NIGHT">Night Shift</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="input-label">Account Status</label>
                            <select className="swal2-select custom-input" value={user.status || 'ACTIVE'} onChange={e => setUser({ ...user, status: e.target.value })}>
                                <option value="ACTIVE">Active</option>
                                <option value="INACTIVE">Inactive</option>
                            </select>
                        </div>

                        {/* ROW 5: Managers */}
                        <div className="form-group">
                            <label className="input-label">Reporting Manager Name</label>
                            <input className="custom-input" placeholder="Manager's Full Name" value={user.reportingManagerName || ''} onChange={e => setUser({ ...user, reportingManagerName: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Reporting Manager Email</label>
                            <input type="email" className="custom-input" placeholder="manager@gts.ai" value={user.reportingManagerEmail || ''} onChange={e => setUser({ ...user, reportingManagerEmail: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Salary (Monthly) (₹)</label>
                            <input type="number" className="custom-input" placeholder="Enter amount" value={user.salary || ''} onChange={e => setUser({ ...user, salary: Number(e.target.value) })} />
                        </div>

                        {/* Checkbox & Save */}
                        <div className="form-group full-width checkbox-container mt-10">
                            <label className="checkbox-label">
                                <input 
                                    type="checkbox" 
                                    className="custom-checkbox"
                                    checked={user.isPurchaser || false} 
                                    onChange={e => setUser({ ...user, isPurchaser: e.target.checked })} 
                                />
                                Grant Purchaser Access
                            </label>
                            
                            <button type="submit" className="gts-btn primary btn-large">
                                <FontAwesomeIcon icon={faSave} className="btn-icon" /> Save Profile Changes
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* --- TAB CONTENT: LEAVES --- */}
            {activeTab === 'leaves' && (
                <div className="fade-in">
                    <div className="control-card d-block mb-20">
                        <h3 className="section-title">Manage Leave Balances</h3>

                        <div className="balances-wrapper">
                            <div className="form-group">
                                <label className="input-label text-primary fw-bold">Casual Leave (CL)</label>
                                <input type="number" className="custom-input balance-input" value={user.casualLeaveBalance || 0} onChange={e => setUser({ ...user, casualLeaveBalance: Number(e.target.value) })} />
                            </div>

                            <div className="form-group">
                                <label className="input-label text-primary fw-bold">Earned Leave (EL)</label>
                                <input type="number" className="custom-input balance-input" value={user.earnedLeaveBalance || 0} onChange={e => setUser({ ...user, earnedLeaveBalance: Number(e.target.value) })} />
                            </div>

                            <div className="form-group flex-align-end">
                                <button className="gts-btn primary btn-tall" onClick={handleUpdateBalance}>
                                    <FontAwesomeIcon icon={faSave} className="btn-icon" /> Update Balances
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="employee-table-container">
                        <h3 className="table-header-title">Leave History</h3>
                        <table className="employee-table">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Dates</th>
                                    <th>Days</th>
                                    <th>Reason</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaveStats.history && leaveStats.history.length > 0 ? (
                                    leaveStats.history.map(l => (
                                        <tr key={l._id}>
                                            <td data-label="Type"><span className="role-tag employee text-small">{l.leaveType}</span></td>
                                            <td data-label="Dates" className="text-dark-gray text-small">
                                                {new Date(l.fromDate).toLocaleDateString()} 
                                                <span className="text-muted mx-1">➜</span> 
                                                {new Date(l.toDate).toLocaleDateString()}
                                            </td>
                                            <td data-label="Days" className="fw-600">{l.days}</td>
                                            <td data-label="Reason" className="note-cell text-muted text-small">{l.reason}</td>
                                            <td data-label="Status">
                                                <span className={`status-badge ${l.status === 'Approved' ? 'success' : l.status === 'Rejected' ? 'danger' : 'warning'}`}>
                                                    {l.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="5" className="empty-table-message">No leave history found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- TAB CONTENT: ATTENDANCE --- */}
            {activeTab === 'attendance' && (
                <div className="employee-table-container fade-in">
                    <h3 className="table-header-title">Attendance Logs</h3>
                    <table className="employee-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Check In</th>
                                <th>Check Out</th>
                                <th>Working Hours</th>
                                <th>Status</th>
                                <th>Note</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {attendanceLogs.length > 0 ? (
                                attendanceLogs.map(log => (
                                    <tr key={log._id}>
                                        <td data-label="Date" className="fw-500">{log.date}</td>
                                        <td data-label="Check In">{new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                        <td data-label="Check Out">{log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                        <td data-label="Working Hours" className="fw-bold text-dark-gray">
                                            {calculateDuration(log.checkIn, log.checkOut)}
                                        </td>
                                        <td data-label="Status">
                                            <span className={`status-badge ${log.status === 'Present' ? 'success' : log.status === 'Half Day' ? 'warning' : 'danger'}`}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td data-label="Note" className="note-cell text-muted text-small">{log.note || '-'}</td>
                                        <td data-label="Action">
                                            <button className="gts-btn primary btn-small" onClick={() => handleEdit(log)}>
                                                <FontAwesomeIcon icon={faEdit} className="btn-icon" /> Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan="7" className="empty-table-message">No logs found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default EmployeeProfile;