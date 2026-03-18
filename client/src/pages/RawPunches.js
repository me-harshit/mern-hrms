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
        <div className="attendance-container">
            {/* HEADER */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px' }}>
                <button className="gts-btn warning" onClick={() => navigate('/attendance-logs')} style={{ padding: '8px 15px' }}>
                    <FontAwesomeIcon icon={faArrowLeft} /> Back to Logs
                </button>
                <h1 className="page-title" style={{ margin: 0 }}>
                    <FontAwesomeIcon icon={faFingerprint} style={{ marginRight: '10px', color: '#215D7B' }} />
                    Raw Biometric Punches
                </h1>
            </div>

            {/* EXACT MATCH FILTER BAR */}
            <div className="control-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '20px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>

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
                        placeholder="Search employee, Bio ID, or Device..."
                        className="swal2-input"
                        style={{ margin: 0, paddingLeft: '40px', width: '100%', height: '40px', fontSize: '14px' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* METRIC SUMMARY */}
            <div style={{ marginBottom: '20px', fontSize: '14px', fontWeight: '600', color: '#64748b', display: 'flex', justifyContent: 'flex-end' }}>
                Showing {filteredLogs.length} raw punches
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
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading raw punches...</td></tr>
                        ) : filteredLogs.length === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#888' }}>No punches found matching filters.</td></tr>
                        ) : (
                            filteredLogs.map(log => (
                                <tr key={log._id}>
                                    <td style={{ fontWeight: 'bold', color: '#215D7B' }}>{log.userId?.name || 'Unknown'}</td>
                                    <td style={{ fontSize: '13px', color: '#555', fontWeight: '600' }}>{log.employeeId}</td>
                                    <td>
                                        <div style={{ fontWeight: '600', color: '#333' }}>
                                            {new Date(log.timestamp).toLocaleDateString()}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#777' }}>
                                            {new Date(log.timestamp).toLocaleTimeString()}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`status-badge ${log.direction === 'IN' ? 'success' : 'danger'}`} style={{ padding: '4px 10px', fontSize: '11px', letterSpacing: '1px' }}>
                                            {log.direction}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ fontSize: '13px', color: '#333' }}>Device: <strong>{log.deviceId}</strong></div>
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