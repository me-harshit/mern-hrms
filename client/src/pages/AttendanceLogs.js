import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faEdit, faFilter } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

const AttendanceLogs = () => {
    const [logs, setLogs] = useState([]);
    const [filteredLogs, setFilteredLogs] = useState([]);
    const [filterType, setFilterType] = useState('Today'); // Today, Week, Month, All, Custom
    const [searchTerm, setSearchTerm] = useState('');

    // State for Custom Date Range
    const [customDates, setCustomDates] = useState({
        from: '',
        to: ''
    });

    useEffect(() => {
        fetchLogs();
    }, []);

    useEffect(() => {
        let result = logs;

        // 1. Time Filtering
        const now = new Date();

        if (filterType === 'Today') {
            // Match Backend Format: "D/M/YYYY" (e.g. 22/1/2026)
            // Note: Make sure this matches your backend's string format exactly
            const todayBackendFormat = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
            result = result.filter(log => log.date === todayBackendFormat);
        }
        else if (filterType === 'Week') {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(now.getDate() - 7);

            result = result.filter(log => {
                const logDate = new Date(log.checkIn);
                return logDate >= oneWeekAgo && logDate <= now;
            });
        }
        else if (filterType === 'Month') {
            const oneMonthAgo = new Date();
            oneMonthAgo.setDate(now.getDate() - 30);

            result = result.filter(log => {
                const logDate = new Date(log.checkIn);
                return logDate >= oneMonthAgo && logDate <= now;
            });
        }
        else if (filterType === 'Custom') {
            if (customDates.from && customDates.to) {
                // Set start to beginning of "From" day
                const start = new Date(customDates.from);
                start.setHours(0, 0, 0, 0);

                // Set end to end of "To" day
                const end = new Date(customDates.to);
                end.setHours(23, 59, 59, 999);

                result = result.filter(log => {
                    const logDate = new Date(log.checkIn);
                    return logDate >= start && logDate <= end;
                });
            }
        }

        // 2. Search Filtering (Employee Name)
        if (searchTerm) {
            result = result.filter(log =>
                log.userId?.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        setFilteredLogs(result);
    }, [logs, filterType, searchTerm, customDates]);

    const fetchLogs = async () => {
        try {
            const res = await api.get('/attendance/all-logs');
            setLogs(res.data);
        } catch (err) {
            console.error("Error fetching logs");
        }
    };

    const handleEdit = async (log) => {
        const toTimeStr = (dateStr) => {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };

        const inTime = toTimeStr(log.checkIn);
        const outTime = toTimeStr(log.checkOut);

        const { value: formValues } = await Swal.fire({
            title: `Edit Log: ${log.userId.name}`,
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
                fetchLogs();
            } catch (err) {
                Swal.fire('Error', 'Update failed', 'error');
            }
        }
    };

    return (
        <div className="attendance-container">
            <h1 className="page-title">Attendance Logs</h1>

            {/* FILTERS BAR */}
            <div className="control-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '20px', alignItems: 'center', justifyContent: 'space-between' }}>

                {/* 1. Filter Buttons */}
                <div className="button-group" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {['Today', 'Week', 'Month', 'All', 'Custom'].map(type => (
                        <button
                            key={type}
                            className={`gts-btn ${filterType === type ? 'primary' : 'warning'}`}
                            style={{ opacity: filterType === type ? 1 : 0.7, padding: '8px 15px', fontSize: '13px' }}
                            onClick={() => setFilterType(type)}
                        >
                            {type === 'Custom' && <FontAwesomeIcon icon={faFilter} style={{ marginRight: '5px' }} />}
                            {type}
                        </button>
                    ))}
                </div>

                {/* 2. Custom Date Inputs (Conditional) */}
                {filterType === 'Custom' && (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '5px 15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>From:</span>
                            <input
                                type="date"
                                className="swal2-input"
                                style={{ margin: 0, height: '35px', padding: '0 10px', fontSize: '13px', width: '130px' }}
                                value={customDates.from}
                                onChange={(e) => setCustomDates({ ...customDates, from: e.target.value })}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>To:</span>
                            <input
                                type="date"
                                className="swal2-input"
                                style={{ margin: 0, height: '35px', padding: '0 10px', fontSize: '13px', width: '130px' }}
                                value={customDates.to}
                                onChange={(e) => setCustomDates({ ...customDates, to: e.target.value })}
                            />
                        </div>
                    </div>
                )}

                {/* 3. Search Bar */}
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

            {/* TABLE */}
            <div className="employee-table-container">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Date</th>
                            <th>In Time</th>
                            <th>Out Time</th>
                            <th>Status</th>
                            <th>Note</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLogs.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#888' }}>No attendance records found for this selection.</td></tr>
                        ) : (
                            filteredLogs.map(log => (
                                <tr key={log._id}>
                                    <td style={{ fontWeight: 'bold', color: '#215D7B' }}>{log.userId?.name || 'Unknown'}</td>
                                    <td>{log.date}</td>
                                    <td>{new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td>{log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                    <td>
                                        <span className={`status-badge ${log.status === 'Present' ? 'success' :
                                                log.status === 'Half Day' ? 'warning' : 'danger'
                                            }`}>
                                            {log.status}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '12px', maxWidth: '180px', color: '#555' }}>{log.note || '-'}</td>
                                    <td>
                                        <button className="gts-btn primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleEdit(log)}>
                                            <FontAwesomeIcon icon={faEdit} /> Edit
                                        </button>
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

export default AttendanceLogs;