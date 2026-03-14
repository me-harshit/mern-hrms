import React, { useState, useEffect } from 'react';
import api from '../utils/api'; 
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHistory, faClock, faFilter, faSearch } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css'; 

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
    const calculateDuration = (start, end) => {
        if (!start || !end) return <span style={{color: '#999', fontStyle: 'italic'}}>Ongoing</span>;
        
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

    // --- FILTER LOGIC ---
    const filteredLogs = logs.filter(log => {
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
    });

    if (loading) return <div className="main-content">Loading Attendance...</div>;

    return (
        <div className="attendance-container">
            
            {/* Header with Clock */}
            <div className="attendance-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                <h2 className="page-title" style={{ fontSize: '24px', margin: 0 }}>My Attendance</h2>
                <div className="digital-clock" style={{ fontSize: '18px', fontWeight: 'bold', color: '#215D7B', background: '#fff', padding: '10px 20px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                    <FontAwesomeIcon icon={faClock} style={{ marginRight: '8px', color: '#94a3b8' }} />
                    {currentTime.toLocaleTimeString()}
                </div>
            </div>

            {/* FILTER CONTROLS */}
            <div className="control-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '20px', marginBottom: '20px', alignItems: 'center', justifyContent: 'space-between' }}>
                
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
                    <div className="fade-in" style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '5px 15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
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
                        placeholder="Search records..."
                        className="swal2-input"
                        style={{ margin: 0, paddingLeft: '40px', width: '100%', height: '40px', fontSize: '14px' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* LOGS TABLE */}
            <div className="employee-table-container fade-in">
                <h3 style={{ padding: '20px', fontSize: '16px', margin: 0, borderBottom: '1px solid #eee', color: '#215D7B', display: 'flex', alignItems: 'center' }}>
                    <FontAwesomeIcon icon={faHistory} style={{ marginRight: '10px' }} /> Activity Log
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
                                <td colSpan="7" style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
                                    No records match your filters.
                                </td>
                            </tr>
                        ) : (
                            filteredLogs.map((log, index) => (
                                <tr key={index}>
                                    <td style={{ fontWeight: '600', color: '#555' }}>{log.date}</td>
                                    <td>
                                        {log.checkIn ? new Date(log.checkIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}
                                    </td>
                                    <td>
                                        {log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}
                                    </td>
                                    
                                    {/* WORKING HOURS COLUMN */}
                                    <td style={{ fontWeight: 'bold', color: '#215D7B' }}>
                                        {calculateDuration(log.checkIn, log.checkOut)}
                                    </td>

                                    {/* BREAK TIME COLUMN */}
                                    <td style={{ fontWeight: 'bold', color: '#e67e22' }}>
                                        {formatBreakTime(log.breakTimeTaken)}
                                    </td>

                                    <td>
                                        <span className={`status-badge ${log.status === 'Half Day' || log.status === 'Late' ? 'warning' : 'success'}`}>
                                            {log.status}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '13px', color: '#777' }}>
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