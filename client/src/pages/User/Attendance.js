import React, { useState, useEffect } from 'react';
import api from '../../utils/api'; 
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHistory, faClock, faFilter, faSearch, faSignOutAlt, faSignInAlt, faPause, faPlay } from '@fortawesome/free-solid-svg-icons';
import Swal from 'sweetalert2';
import '../../styles/App.css'; 

const Attendance = () => {
    // --- STATE ---
    const [currentTime, setCurrentTime] = useState(new Date());
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- FILTER STATE ---
    const [filterType, setFilterType] = useState('All');
    const [customDates, setCustomDates] = useState({ from: '', to: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const [punchLoading, setPunchLoading] = useState(false);

    // --- USER DATA ---
    const user = JSON.parse(localStorage.getItem('user'));
    const isWFH = user?.workLocation === 'WFH';

    // --- INITIAL LOAD & CLOCK ---
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        fetchLogs(); 
        return () => clearInterval(timer);
    }, []);

    // --- API: FETCH LOGS ---
    const fetchLogs = async () => {
        try {
            const res = await api.get('/attendance/my-logs');
            setLogs(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching logs", err);
            setLoading(false);
        }
    };

    // --- API: WFH PUNCH ---
    const handlePunch = async (direction) => {
        try {
            setPunchLoading(true);
            await api.post('/attendance/wfh-punch', { direction });
            Swal.fire('Success', `Successfully punched ${direction}`, 'success');
            fetchLogs(); // refresh logs to get updated status
        } catch (error) {
            Swal.fire('Error', error.response?.data?.message || 'Failed to punch', 'error');
        } finally {
            setPunchLoading(false);
        }
    };

    // --- API: WFH BREAK ---
    const handleBreak = async (action) => {
        try {
            setPunchLoading(true);
            await api.post('/attendance/wfh-break', { action });
            Swal.fire('Success', action === 'start' ? 'Break started! Take your time.' : 'Break ended. Welcome back!', 'success');
            fetchLogs();
        } catch (error) {
            Swal.fire('Error', error.response?.data?.message || 'Failed to update break', 'error');
        } finally {
            setPunchLoading(false);
        }
    };

    // --- HELPER: PARSE DD/MM/YYYY TO JS DATE ---
    const parseDateStr = (dateStr) => {
        if (!dateStr) return new Date();
        const [d, m, y] = dateStr.split('/');
        return new Date(y, m - 1, d);
    };

    // --- HELPER: CALCULATE WORKING HOURS ---
    const calculateDuration = (start, end, status) => {
        // 👇 Handle Absent / On Leave / Ongoing specifically
        if (status === 'Absent' || status === 'On Leave') return "0h 0m";
        if (!start || !end) return <span className="text-muted italic">0h 0m (Ongoing)</span>;
        
        const startTime = new Date(start);
        const endTime = new Date(end);
        const diffMs = endTime - startTime;
        
        if (diffMs < 0) return "-";

        const totalMinutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        return `${hours}h ${minutes}m`;
    };

    // --- HELPER: FORMAT BREAK TIME ---
    const formatBreakTime = (minutes) => {
        if (!minutes || minutes <= 0) return "-";
        
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    // --- FILTER & SORT LOGIC ---
    const filteredLogs = logs
        .filter(log => {
            // 1. Search Filter (Search by Date, Status, or Note)
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = 
                log.date.toLowerCase().includes(searchLower) || 
                log.status.toLowerCase().includes(searchLower) || 
                (log.note && log.note.toLowerCase().includes(searchLower));
            
            if (!matchesSearch) return false;

            // 2. Date Filter
            if (filterType === 'All') return true;

            const logDate = parseDateStr(log.date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (filterType === 'Today') {
                return logDate.getTime() === today.getTime();
            }
            if (filterType === 'Week') {
                const lastWeek = new Date(today);
                lastWeek.setDate(today.getDate() - 7);
                return logDate >= lastWeek && logDate <= today;
            }
            if (filterType === 'Month') {
                return logDate.getMonth() === today.getMonth() && logDate.getFullYear() === today.getFullYear();
            }
            if (filterType === 'Custom') {
                if (customDates.from && customDates.to) {
                    const fromDate = new Date(customDates.from);
                    fromDate.setHours(0, 0, 0, 0);
                    const toDate = new Date(customDates.to);
                    toDate.setHours(23, 59, 59, 999);
                    return logDate >= fromDate && logDate <= toDate;
                }
                return true; 
            }

            return true;
        })
        // 👇 Sort by Date Descending (Newest first)
        .sort((a, b) => parseDateStr(b.date) - parseDateStr(a.date));

    if (loading) return <div className="main-content">Loading Attendance...</div>;

    const d = new Date();
    const todayStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    const todayLog = logs.find(log => log.date === todayStr);
    
    // Simple state checking: if they have a checkIn but no checkOut, they are working.
    // If they have both, they are done for the day (checked out).
    const isPunchedIn = todayLog && todayLog.checkIn && !todayLog.checkOut;
    const isCheckedOut = todayLog && todayLog.checkOut;
    const isOnBreak = todayLog && todayLog.isOnBreak;

    return (
        <div className="attendance-container">
            
            {/* Header with Clock */}
            <div className="attendance-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h2 className="page-title header-no-margin">My Attendance</h2>
                    <div className="digital-clock clock-light">
                        <FontAwesomeIcon icon={faClock} className="clock-icon" />
                        {currentTime.toLocaleTimeString()}
                    </div>
                </div>

                {/* WFH Manual Punch Widget */}
                {isWFH && (
                    <div className="wfh-punch-widget" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {!isPunchedIn && !isCheckedOut && (
                            <button 
                                className="gts-btn success" 
                                onClick={() => handlePunch('IN')}
                                disabled={punchLoading}
                            >
                                <FontAwesomeIcon icon={faSignInAlt} /> Check In
                            </button>
                        )}
                        {isPunchedIn && !isOnBreak && (
                            <button 
                                className="gts-btn wfh-break-btn" 
                                onClick={() => handleBreak('start')}
                                disabled={punchLoading}
                            >
                                <FontAwesomeIcon icon={faPause} /> Take Break
                            </button>
                        )}
                        {isPunchedIn && isOnBreak && (
                            <button 
                                className="gts-btn wfh-resume-btn" 
                                onClick={() => handleBreak('end')}
                                disabled={punchLoading}
                            >
                                <FontAwesomeIcon icon={faPlay} /> End Break
                            </button>
                        )}
                        {isPunchedIn && (
                            <button 
                                className="gts-btn danger" 
                                onClick={() => handlePunch('OUT')}
                                disabled={punchLoading}
                            >
                                <FontAwesomeIcon icon={faSignOutAlt} /> Check Out
                            </button>
                        )}
                        {isCheckedOut && (
                            <span className="status-badge success">Checked out for today</span>
                        )}
                    </div>
                )}
            </div>

            {/* FILTER CONTROLS */}
            <div className="control-card filter-bar-card">
                
                {/* 1. Filter Buttons */}
                <div className="button-group filter-buttons">
                    {['Today', 'Week', 'Month', 'All', 'Custom'].map(type => (
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

                {/* 2. Custom Date Inputs (Conditional) */}
                {filterType === 'Custom' && (
                    <div className="fade-in custom-date-filters">
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
                        placeholder="Search records..."
                        className="swal2-input search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* LOGS TABLE */}
            <div className="employee-table-container fade-in">
                <h3 className="table-header-title">
                    <FontAwesomeIcon icon={faHistory} className="table-header-icon" /> Activity Log
                </h3>
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Time In</th>
                            <th>Time Out</th>
                            <th>Work Hours</th>
                            <th>Break Time</th>
                            <th>Status</th>
                            <th>Note</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLogs.length === 0 ? (
                            <tr>
                                <td colSpan="7" className="empty-table-message">
                                    No records match your filters.
                                </td>
                            </tr>
                        ) : (
                            filteredLogs.map((log, index) => (
                                <tr key={index}>
                                    <td data-label="Date" className="fw-600 text-dark-gray">{log.date}</td>
                                    <td data-label="Time In">
                                        {log.checkIn ? new Date(log.checkIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}
                                    </td>
                                    <td data-label="Time Out">
                                        {log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}
                                    </td>
                                    
                                    <td data-label="Work Hours" className="fw-bold text-primary">
                                        {/* 👇 Pass status to logic */}
                                        {calculateDuration(log.checkIn, log.checkOut, log.status)}
                                    </td>

                                    <td data-label="Break Time" className="fw-bold text-orange">
                                        {formatBreakTime(log.breakTimeTaken)}
                                    </td>

                                    <td data-label="Status">
                                        {/* 👇 Apply red (danger) for Absent */}
                                        <span className={`status-badge ${
                                            log.status === 'Absent' ? 'danger' :
                                            log.status === 'On Leave' ? 'primary' :
                                            (log.status === 'Half Day' || log.status === 'Late') ? 'warning' : 
                                            'success'
                                        }`}>
                                            {log.status}
                                        </span>
                                    </td>
                                    <td data-label="Note" className="text-small text-muted">
                                        {log.note || '-'}
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

export default Attendance;