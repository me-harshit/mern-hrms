import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faEdit, faUserTimes, faFilter, faFingerprint } from '@fortawesome/free-solid-svg-icons';
import '../../styles/App.css';

const AttendanceLogs = () => {
    const navigate = useNavigate();
    const [logs, setLogs] = useState([]);
    const [filteredLogs, setFilteredLogs] = useState([]);
    const [filterType, setFilterType] = useState('Today'); // Today, Yesterday, Week, Month, All, Custom
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
            const todayBackendFormat = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
            result = result.filter(log => log.date === todayBackendFormat);
        }
        else if (filterType === 'Yesterday') {
            const yesterday = new Date();
            yesterday.setDate(now.getDate() - 1);
            const yesterdayBackendFormat = `${yesterday.getDate()}/${yesterday.getMonth() + 1}/${yesterday.getFullYear()}`;
            result = result.filter(log => log.date === yesterdayBackendFormat);
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
                const start = new Date(customDates.from);
                start.setHours(0, 0, 0, 0);

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
                    <p class="text-small text-muted" style="margin-bottom:10px;">
                        <span class="text-danger">*</span> Changing time will auto-recalculate Status.
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
            
            <div className="page-header-row">
                <h1 className="page-title header-no-margin">Attendance Logs</h1>
                
                <div className="header-actions">
                    <button className="gts-btn danger btn-small" onClick={() => navigate('/absent-employees')}>
                        <FontAwesomeIcon icon={faUserTimes} className="btn-icon" /> View Absent Employees
                    </button>
                    <button className="action-btn-primary btn-small" onClick={() => navigate('/raw-punches')}>
                        <FontAwesomeIcon icon={faFingerprint} className="btn-icon" /> View Raw Punches
                    </button>
                </div>
            </div>

            {/* FILTERS BAR (Reusing the CSS from earlier) */}
            <div className="filter-bar-card fade-in">
                
                {/* 1. Filter Buttons */}
                <div className="filter-buttons">
                    {['Today', 'Yesterday', 'Week', 'Month', 'All', 'Custom'].map(type => (
                        <button
                            key={type}
                            className={`gts-btn filter-btn ${filterType === type ? 'primary active' : 'warning inactive'}`}
                            onClick={() => setFilterType(type)}
                        >
                            {type === 'Custom' && <FontAwesomeIcon icon={faFilter} className="filter-icon" />}
                            {type}
                        </button>
                    ))}
                </div>

                {/* 2. Custom Date Inputs */}
                {filterType === 'Custom' && (
                    <div className="custom-date-filters fade-in">
                        <div className="date-input-group">
                            <span className="date-label">From:</span>
                            <input
                                type="date"
                                className="swal2-input date-picker-small"
                                value={customDates.from}
                                onChange={(e) => setCustomDates({ ...customDates, from: e.target.value })}
                            />
                        </div>
                        <div className="date-input-group">
                            <span className="date-label">To:</span>
                            <input
                                type="date"
                                className="swal2-input date-picker-small"
                                value={customDates.to}
                                onChange={(e) => setCustomDates({ ...customDates, to: e.target.value })}
                            />
                        </div>
                    </div>
                )}

                {/* 3. Search Bar */}
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

            {/* TABLE */}
            <div className="employee-table-container fade-in">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Date</th>
                            <th>In Time</th>
                            <th>Out Time</th>
                            <th>Working Hours</th>
                            <th>Status</th>
                            <th>Note</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLogs.length === 0 ? (
                            <tr>
                                <td colSpan="8" className="empty-table-message">
                                    No attendance records found for this selection.
                                </td>
                            </tr>
                        ) : (
                            filteredLogs.map(log => (
                                <tr key={log._id}>
                                    <td data-label="Employee" className="fw-bold text-primary">
                                        {log.userId?.name || 'Unknown'}
                                    </td>
                                    <td data-label="Date">{log.date}</td>
                                    <td data-label="In Time">
                                        {new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td data-label="Out Time">
                                        {log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                    </td>

                                    <td data-label="Working Hours" className="fw-bold text-dark-gray">
                                        {calculateDuration(log.checkIn, log.checkOut)}
                                    </td>

                                    <td data-label="Status">
                                        <span className={`status-badge ${log.status === 'Present' ? 'success' :
                                            log.status === 'Half Day' ? 'warning' : 'danger'
                                        }`}>
                                            {log.status}
                                        </span>
                                    </td>
                                    <td data-label="Note" className="text-small text-muted note-cell">
                                        {log.note || '-'}
                                    </td>
                                    <td data-label="Action">
                                        <button className="gts-btn primary btn-small" onClick={() => handleEdit(log)}>
                                            <FontAwesomeIcon icon={faEdit} className="btn-icon" /> Edit
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