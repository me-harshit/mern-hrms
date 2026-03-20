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
        if (!start || !end) return <span style={{ color: '#999', fontStyle: 'italic', fontSize: '12px' }}>In Progress</span>;

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

    const getTabStyle = (tabName) => ({
        opacity: activeTab === tabName ? 1 : 0.7,
        padding: '10px 20px',
        fontSize: '14px',
        transition: 'all 0.3s ease'
    });

    if (loading) return <div className="main-content">Loading Profile...</div>;

    return (
        <div className="dashboard-container fade-in">
            {/* HEADER */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                <button className="gts-btn" onClick={() => navigate('/employees')}>
                    <FontAwesomeIcon icon={faArrowLeft} /> Back
                </button>
                <h1 className="page-title" style={{ margin: 0 }}>{user.name}'s Profile</h1>
            </div>

            {/* TABS */}
            <div className="control-card" style={{ padding: '15px', marginBottom: '25px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        className={`gts-btn ${activeTab === 'details' ? 'primary' : 'warning'}`}
                        style={getTabStyle('details')}
                        onClick={() => setActiveTab('details')}
                    >
                        <FontAwesomeIcon icon={faUser} style={{ marginRight: '8px' }} /> Details & Config
                    </button>

                    <button
                        className={`gts-btn ${activeTab === 'leaves' ? 'primary' : 'warning'}`}
                        style={getTabStyle('leaves')}
                        onClick={() => setActiveTab('leaves')}
                    >
                        <FontAwesomeIcon icon={faPlaneDeparture} style={{ marginRight: '8px' }} /> Leaves & Balances
                    </button>

                    <button
                        className={`gts-btn ${activeTab === 'attendance' ? 'primary' : 'warning'}`}
                        style={getTabStyle('attendance')}
                        onClick={() => setActiveTab('attendance')}
                    >
                        <FontAwesomeIcon icon={faClock} style={{ marginRight: '8px' }} /> Attendance Logs
                    </button>
                </div>
            </div>

            {/* --- TAB CONTENT: DETAILS --- */}
            {activeTab === 'details' && (
                <div className="control-card fade-in" style={{ display: 'block' }}>

                    <h3 className="card-title" style={{ marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                        Personal & Employment Details
                    </h3>

                    <form onSubmit={handleUpdateProfile} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>

                        {/* ROW 1: Basics */}
                        <div className="form-group">
                            <label className="input-label">Full Name</label>
                            <input className="swal2-input custom-input" value={user.name || ''} onChange={e => setUser({ ...user, name: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Email</label>
                            <input className="swal2-input custom-input" value={user.email || ''} onChange={e => setUser({ ...user, email: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label" style={{ color: '#215D7B', fontWeight: 'bold' }}>Employee / Biometric ID</label>
                            <input className="swal2-input custom-input" placeholder="e.g. GTS003" value={user.employeeId || ''} onChange={e => setUser({ ...user, employeeId: e.target.value })} />
                        </div>

                        {/* ROW 2: Dates */}
                        <div className="form-group">
                            <label className="input-label">Date of Birth</label>
                            <input 
                                type="date" 
                                className="swal2-input custom-input" 
                                value={user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : ''} 
                                onChange={e => setUser({ ...user, dateOfBirth: e.target.value })} 
                            />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Joining Date</label>
                            <input 
                                type="date" 
                                className="swal2-input custom-input" 
                                value={user.joiningDate ? new Date(user.joiningDate).toISOString().split('T')[0] : ''} 
                                onChange={e => setUser({ ...user, joiningDate: e.target.value })} 
                            />
                        </div>

                        {/* ROW 3: Contact & Emergency */}
                        <div className="form-group">
                            <label className="input-label">Phone Number</label>
                            <input className="swal2-input custom-input" placeholder="+91..." value={user.phoneNumber || ''} onChange={e => setUser({ ...user, phoneNumber: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Address</label>
                            <input className="swal2-input custom-input" value={user.address || ''} onChange={e => setUser({ ...user, address: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Aadhaar Number</label>
                            <input className="swal2-input custom-input" value={user.aadhaar || ''} onChange={e => setUser({ ...user, aadhaar: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Emergency Contact</label>
                            <input className="swal2-input custom-input" value={user.emergencyContact || ''} onChange={e => setUser({ ...user, emergencyContact: e.target.value })} />
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
                            <input className="swal2-input custom-input" placeholder="Manager's Full Name" value={user.reportingManagerName || ''} onChange={e => setUser({ ...user, reportingManagerName: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Reporting Manager Email</label>
                            <input type="email" className="swal2-input custom-input" placeholder="manager@gts.ai" value={user.reportingManagerEmail || ''} onChange={e => setUser({ ...user, reportingManagerEmail: e.target.value })} />
                        </div>

                        <div className="form-group">
                            <label className="input-label">Salary (Monthly) (₹)</label>
                            <input type="number" className="swal2-input custom-input" placeholder="Enter amount" value={user.salary || ''} onChange={e => setUser({ ...user, salary: Number(e.target.value) })} />
                        </div>

                        {/* Checkbox & Save */}
                        <div className="form-group" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px', fontSize: '14px', fontWeight: 'bold', color: '#215D7B' }}>
                                <input type="checkbox" checked={user.isPurchaser || false} onChange={e => setUser({ ...user, isPurchaser: e.target.checked })} style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#215D7B' }} />
                                Grant Purchaser Access
                            </label>
                            
                            <button type="submit" className="gts-btn primary" style={{ padding: '10px 20px', fontSize: '16px' }}>
                                <FontAwesomeIcon icon={faSave} style={{ marginRight: '8px' }} /> Save Profile Changes
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* --- TAB CONTENT: LEAVES --- */}
            {activeTab === 'leaves' && (
                <div className="fade-in">
                    <div className="control-card" style={{ marginBottom: '20px', display: 'block' }}>
                        <h3 className="card-title" style={{ marginBottom: '15px' }}>Manage Leave Balances</h3>

                        <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
                            <div className="form-group">
                                <label style={{ fontWeight: 'bold', color: '#215D7B', display: 'block', marginBottom: '5px' }}>Casual Leave (CL)</label>
                                <input type="number" className="swal2-input custom-input" style={{ width: '150px', margin: 0 }} value={user.casualLeaveBalance || 0} onChange={e => setUser({ ...user, casualLeaveBalance: Number(e.target.value) })} />
                            </div>

                            <div className="form-group">
                                <label style={{ fontWeight: 'bold', color: '#215D7B', display: 'block', marginBottom: '5px' }}>Earned Leave (EL)</label>
                                <input type="number" className="swal2-input custom-input" style={{ width: '150px', margin: 0 }} value={user.earnedLeaveBalance || 0} onChange={e => setUser({ ...user, earnedLeaveBalance: Number(e.target.value) })} />
                            </div>

                            <div className="form-group">
                                <label style={{ display: 'block', marginBottom: '5px', visibility: 'hidden' }}>Spacer</label>
                                <button className="gts-btn primary" onClick={handleUpdateBalance} style={{ height: '46px' }}>
                                    <FontAwesomeIcon icon={faSave} style={{ marginRight: '8px' }} /> Update Balances
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="employee-table-container">
                        <h3 style={{ padding: '15px', borderBottom: '1px solid #eee', margin: 0 }}>Leave History</h3>
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
                                            <td><span className="role-tag employee" style={{ fontSize: '11px' }}>{l.leaveType}</span></td>
                                            <td style={{ fontSize: '13px' }}>{new Date(l.fromDate).toLocaleDateString()} <span style={{ color: '#ccc' }}>➜</span> {new Date(l.toDate).toLocaleDateString()}</td>
                                            <td style={{ fontWeight: '600' }}>{l.days}</td>
                                            <td style={{ maxWidth: '250px', fontSize: '12px', color: '#555' }}>{l.reason}</td>
                                            <td>
                                                <span className={`status-badge ${l.status === 'Approved' ? 'success' : l.status === 'Rejected' ? 'danger' : 'warning'}`}>
                                                    {l.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#999' }}>No leave history found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- TAB CONTENT: ATTENDANCE --- */}
            {activeTab === 'attendance' && (
                <div className="employee-table-container fade-in">
                    <h3 style={{ padding: '15px', borderBottom: '1px solid #eee', margin: 0 }}>Attendance Logs</h3>
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
                                        <td style={{ fontWeight: '500' }}>{log.date}</td>
                                        <td>{new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                        <td>{log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                        <td style={{ fontWeight: 'bold', color: '#555' }}>
                                            {calculateDuration(log.checkIn, log.checkOut)}
                                        </td>
                                        <td>
                                            <span className={`status-badge ${log.status === 'Present' ? 'success' : log.status === 'Half Day' ? 'warning' : 'danger'}`}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '12px', color: '#666' }}>{log.note || '-'}</td>
                                        <td>
                                            <button className="gts-btn primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleEdit(log)}>
                                                <FontAwesomeIcon icon={faEdit} /> Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#999' }}>No logs found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default EmployeeProfile;