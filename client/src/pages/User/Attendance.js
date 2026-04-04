import React, { useState, useEffect } from 'react';
import api from '../../utils/api'; 
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHistory, faClock, faFilter, faSearch } from '@fortawesome/free-solid-svg-icons';
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

    return (
        <div className="attendance-container">
            
            {/* Header with Clock */}
            <div className="attendance-header">
                <h2 className="page-title header-no-margin">My Attendance</h2>
                <div className="digital-clock clock-light">
                    <FontAwesomeIcon icon={faClock} className="clock-icon" />
                    {currentTime.toLocaleTimeString()}
                </div>
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