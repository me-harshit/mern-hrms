import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faFilter, faArrowLeft, faFingerprint } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

const RawPunches = () => {
    const navigate = useNavigate();
    const [rawLogs, setRawLogs] = useState([]);
    const [filteredLogs, setFilteredLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- FILTERS STATE ---
    const [filterType, setFilterType] = useState('Today');
    const [searchTerm, setSearchTerm] = useState('');
    const [customDates, setCustomDates] = useState({ from: '', to: '' });

    useEffect(() => {
        fetchRawLogs();
    }, []);

    const fetchRawLogs = async () => {
        setLoading(true);
        try {
            const res = await api.get('/attendance/raw-logs');
            setRawLogs(res.data);
            setFilteredLogs(res.data);
        } catch (err) {
            Swal.fire('Error', 'Failed to load raw biometric logs', 'error');
        } finally {
            setLoading(false);
        }
    };

    // --- FILTER LOGIC ---
    useEffect(() => {
        let result = rawLogs;
        const now = new Date();
        now.setHours(23, 59, 59, 999);

        // 1. Time Filtering
        if (filterType === 'Today') {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            result = result.filter(log => {
                const logDate = new Date(log.timestamp);
                return logDate >= startOfToday && logDate <= now;
            });
        }
        else if (filterType === 'Week') {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(now.getDate() - 7);
            oneWeekAgo.setHours(0, 0, 0, 0);
            result = result.filter(log => {
                const logDate = new Date(log.timestamp);
                return logDate >= oneWeekAgo && logDate <= now;
            });
        }
        else if (filterType === 'Month') {
            const oneMonthAgo = new Date();
            oneMonthAgo.setDate(now.getDate() - 30);
            oneMonthAgo.setHours(0, 0, 0, 0);
            result = result.filter(log => {
                const logDate = new Date(log.timestamp);
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
                    const logDate = new Date(log.timestamp);
                    return logDate >= start && logDate <= end;
                });
            }
        }

        // 2. Search Filtering (Name, Biometric ID, Device ID)
        if (searchTerm) {
            // Split by space to allow multiple keywords (e.g., "harshit in" -> ["harshit", "in"])
            const searchWords = searchTerm.toLowerCase().trim().split(/\s+/);

            result = result.filter(log => {
                const searchableString = `
                    ${log.userId?.name || ''} 
                    ${log.employeeId || ''} 
                    ${log.deviceId || ''} 
                    ${log.direction || ''}
                `.toLowerCase();

                return searchWords.every(word => searchableString.includes(word));
            });
        }

        setFilteredLogs(result);
    }, [rawLogs, filterType, searchTerm, customDates]);

    return (
        <div className="attendance-container fade-in">
            {/* HEADER */}
            <div className="page-header-left">
                <button className="gts-btn warning btn-small m-0" onClick={() => navigate('/attendance-logs')}>
                    <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back to Logs
                </button>
                <h1 className="page-title header-no-margin flex-row gap-10">
                    <FontAwesomeIcon icon={faFingerprint} className="text-primary" />
                    Raw Biometric Punches
                </h1>
            </div>

            {/* EXACT MATCH FILTER BAR */}
            <div className="filter-bar-card fade-in">

                {/* 1. Filter Buttons */}
                <div className="filter-buttons">
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
                        placeholder="Search employee, Bio ID, or Device..."
                        className="swal2-input search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* METRIC SUMMARY */}
            <div className="table-summary-text fade-in">
                Showing <span className="text-primary fw-bold mx-1 fs-15">{filteredLogs.length}</span> raw punches
            </div>

            {/* TABLE */}
            <div className="employee-table-container fade-in">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Biometric ID</th>
                            <th>Date & Time</th>
                            <th>Direction</th>
                            <th>Device</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="5" className="empty-table-message">Loading raw punches...</td></tr>
                        ) : filteredLogs.length === 0 ? (
                            <tr><td colSpan="5" className="empty-table-message">No punches found matching filters.</td></tr>
                        ) : (
                            filteredLogs.map(log => (
                                <tr key={log._id}>
                                    <td data-label="Employee" className="fw-bold text-primary">
                                        {log.userId?.name || 'Unknown'}
                                    </td>
                                    
                                    <td data-label="Biometric ID" className="fw-600 text-dark-gray text-small">
                                        {log.employeeId}
                                    </td>
                                    
                                    <td data-label="Date & Time">
                                        <div className="fw-600 text-dark-gray">
                                            {new Date(log.timestamp).toLocaleDateString()}
                                        </div>
                                        <div className="text-small text-muted">
                                            {new Date(log.timestamp).toLocaleTimeString()}
                                        </div>
                                    </td>
                                    
                                    <td data-label="Direction">
                                        <span className={`status-badge ${log.direction === 'IN' ? 'success' : 'danger'} tracking-wide`} style={{ padding: '4px 10px', fontSize: '11px' }}>
                                            {log.direction}
                                        </span>
                                    </td>
                                    
                                    <td data-label="Device">
                                        <div className="text-small text-dark-gray">
                                            Device: <strong>{log.deviceId}</strong>
                                        </div>
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

export default RawPunches;