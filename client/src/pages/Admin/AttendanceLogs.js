import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faEdit, faUserTimes, faFilter, faFingerprint, faFileExcel, faSpinner, faCheck, faXmark, faHourglassHalf } from '@fortawesome/free-solid-svg-icons';
import Pagination from '../../components/Pagination';
import '../../styles/App.css';

const AttendanceLogs = () => {
    const navigate = useNavigate();

    // --- DATA & PAGINATION STATES ---
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false); // 👇 NEW: Export loading state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // --- FILTER STATES ---
    const [filterType, setFilterType] = useState('Today'); // Today, Yesterday, Week, Month, All, Custom
    const [customDates, setCustomDates] = useState({ from: '', to: '' });

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Debounce Search Bar
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Reset to Page 1 if any filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [filterType, debouncedSearch, customDates]);

    // Fetch Data from Server
    useEffect(() => {
        fetchLogs(currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, itemsPerPage, filterType, debouncedSearch, customDates]);

    const fetchLogs = async (pageToFetch) => {
        setLoading(true);
        try {
            const params = {
                page: pageToFetch,
                limit: itemsPerPage,
                search: debouncedSearch,
                filterType,
                fromDate: customDates.from,
                toDate: customDates.to
            };

            const res = await api.get('/attendance/all-logs', { params });

            setLogs(res.data.data);
            setTotalPages(res.data.pagination.totalPages);
            setTotalRecords(res.data.pagination.totalRecords);
            setCurrentPage(res.data.pagination.currentPage);
        } catch (err) {
            console.error("Error fetching logs", err);
            Swal.fire('Error', 'Failed to fetch attendance logs', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const params = {
                search: debouncedSearch,
                filterType,
                fromDate: customDates.from,
                toDate: customDates.to
            };

            const res = await api.get('/attendance/export', { params, responseType: 'blob' });

            // 👇 FIXED: Read the exact filename dynamically from the Backend!
            const disposition = res.headers['content-disposition'];
            let filename = 'Attendance_Export.xlsx'; // Fallback
            if (disposition && disposition.indexOf('filename=') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(disposition);
                if (matches != null && matches[1]) {
                    filename = matches[1].replace(/['"]/g, '');
                }
            }

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);

        } catch (err) {
            console.error("Error exporting logs", err);
            Swal.fire('Error', 'Failed to export data', 'error');
        } finally {
            setIsExporting(false);
        }
    };

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
            title: `Edit Log: ${log.userId?.name || 'Employee'}`,
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
                        <option value="WFH" ${log.status === 'WFH' ? 'selected' : ''}>WFH</option>
                        <option value="On Leave" ${log.status === 'On Leave' ? 'selected' : ''}>On Leave</option>
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

                let checkInDate = null;
                if (timeInStr && log.checkIn) {
                    checkInDate = new Date(log.checkIn);
                    const [inH, inM] = timeInStr.split(':');
                    checkInDate.setHours(inH, inM, 0, 0);
                }

                let checkOutDate = null;
                if (timeOutStr && checkInDate) {
                    checkOutDate = new Date(checkInDate);
                    const [outH, outM] = timeOutStr.split(':');
                    checkOutDate.setHours(outH, outM, 0, 0);
                }

                return {
                    checkIn: checkInDate ? checkInDate.toISOString() : null,
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
                fetchLogs(currentPage);
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
                    <button className="action-btn-primary btn-small" onClick={() => navigate('/raw-punches')}>
                        <FontAwesomeIcon icon={faFingerprint} className="btn-icon" /> View Raw Punches
                    </button>
                    <button className="gts-btn danger btn-small" onClick={() => navigate('/absent-employees')}>
                        <FontAwesomeIcon icon={faUserTimes} className="btn-icon" /> View Absentees
                    </button>
                    <button className="gts-btn success btn-small" onClick={handleExport} disabled={isExporting} style={{ background: '#16a34a' }}>
                        <FontAwesomeIcon icon={isExporting ? faSpinner : faFileExcel} spin={isExporting} className="btn-icon" />
                        {isExporting ? ' Exporting...' : ' Export to Excel'}
                    </button>
                </div>
            </div>

            <div className="filter-bar-card fade-in">
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

                <div className="search-wrapper">
                    <FontAwesomeIcon icon={faSearch} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search Employee or Status..."
                        className="swal2-input search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="employee-table-container fade-in">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th className="att-col-emp">Employee</th>
                            <th className="att-col-date">Date</th>
                            <th className="att-col-time">In Time</th>
                            <th className="att-col-time">Out Time</th>
                            <th className="att-col-hours">Working Hours</th>
                            <th className="att-col-status">Status</th>
                            <th className="att-col-note">Note</th>
                            <th className="att-col-action">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="8" className="empty-table-message">Loading Logs...</td></tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan="8" className="empty-table-message">
                                    No attendance records found for this selection.
                                </td>
                            </tr>
                        ) : (
                            logs.map(log => (
                                <tr key={log._id}>
                                    <td data-label="Employee">
                                        <div
                                            className="fw-bold text-primary"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => log.userId?._id && navigate(`/employee/${log.userId._id}`)}
                                            title="View Profile"
                                        >
                                            {log.userId?.name || 'Unknown'}
                                        </div>
                                    </td>
                                    <td data-label="Date">{log.date}</td>
                                    <td data-label="In Time">
                                        {log.checkIn ? new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                    </td>
                                    <td data-label="Out Time">
                                        {log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                    </td>

                                    <td data-label="Working Hours" className="fw-bold text-dark-gray">
                                        {(log.status === 'Absent' || log.status === 'On Leave' || log.status === 'WFH')
                                            ? '0h 0m'
                                            : calculateDuration(log.checkIn, log.checkOut)}
                                    </td>

                                    {/* Status stays a status — the short-leave decision
                                        buttons live in Actions with everything else. */}
                                    <td data-label="Status" className="att-col-status">
                                        <div className="att-status-cell">
                                            <span className={`status-badge ${(log.status === 'Present' || log.status === 'WFH') ? 'success' :
                                                log.status === 'On Leave' ? 'primary' :
                                                    (log.status === 'Half Day' || log.status === 'Late') ? 'warning' : 'danger'
                                                }`}>
                                                {log.status}
                                            </span>

                                            {log.shortLeaveStatus && log.shortLeaveStatus !== 'None' && (
                                                <span className={`att-subpill ${log.shortLeaveStatus.toLowerCase()}`}>
                                                    <FontAwesomeIcon icon={
                                                        log.shortLeaveStatus === 'Approved' ? faCheck
                                                            : log.shortLeaveStatus === 'Rejected' ? faXmark
                                                                : faHourglassHalf
                                                    } />
                                                    Short leave {log.shortLeaveStatus.toLowerCase()}
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    <td data-label="Note" className="att-col-note">
                                        <div className="att-note-cell">
                                            <span className="att-note-text">{log.note || '—'}</span>
                                            {log.shortLeaveReason && (
                                                <span className="att-reason" title={log.shortLeaveReason}>
                                                    <strong>Reason:</strong> {log.shortLeaveReason}
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    <td data-label="Action" className="att-col-action">
                                        <div className="att-actions">
                                            {log.shortLeaveStatus === 'Pending' && (
                                                <>
                                                    <button
                                                        className="att-icon-btn approve"
                                                        title="Review & approve short leave"
                                                        onClick={() => handleEdit(log)}
                                                    >
                                                        <FontAwesomeIcon icon={faCheck} />
                                                    </button>
                                                    <button
                                                        className="att-icon-btn reject"
                                                        title="Reject short leave"
                                                        onClick={async () => {
                                                            // This used to fire instantly — one stray click
                                                            // rejected someone's request with no undo.
                                                            const ok = await Swal.fire({
                                                                title: 'Reject short leave?',
                                                                text: `${log.userId?.name || 'This employee'} — ${log.date}`,
                                                                icon: 'warning',
                                                                showCancelButton: true,
                                                                confirmButtonColor: '#dc2626',
                                                                confirmButtonText: 'Reject'
                                                            });
                                                            if (!ok.isConfirmed) return;
                                                            try {
                                                                await api.put(`/attendance/update/${log._id}`, { status: log.status, note: log.note, shortLeaveStatus: 'Rejected' });
                                                                fetchLogs(currentPage);
                                                            } catch (e) { Swal.fire('Error', 'Failed to reject', 'error'); }
                                                        }}
                                                    >
                                                        <FontAwesomeIcon icon={faXmark} />
                                                    </button>
                                                </>
                                            )}
                                            <button className="att-icon-btn" title="Edit log" onClick={() => handleEdit(log)}>
                                                <FontAwesomeIcon icon={faEdit} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {!loading && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalRecords={totalRecords}
                    limit={itemsPerPage}
                    onPageChange={(page) => setCurrentPage(page)}
                    onLimitChange={(newLimit) => {
                        setItemsPerPage(newLimit);
                        setCurrentPage(1);
                    }}
                />
            )}

        </div>
    );
};

export default AttendanceLogs;