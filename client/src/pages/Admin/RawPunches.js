import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faFilter, faArrowLeft, faFingerprint } from '@fortawesome/free-solid-svg-icons';
import Pagination from '../../components/Pagination'; // 👇 NEW: Modular Pagination
import '../../styles/App.css';

const RawPunches = () => {
    const navigate = useNavigate();
    
    // --- DATA & PAGINATION STATES ---
    const [rawLogs, setRawLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(15); // Default to 15 for raw logs

    // --- FILTERS STATE ---
    const [filterType, setFilterType] = useState('Today');
    const [customDates, setCustomDates] = useState({ from: '', to: '' });
    
    // --- SEARCH STATES ---
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // 1. Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // 2. Reset to Page 1 if any filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [filterType, debouncedSearch, customDates]);

    // 3. Fetch Data
    useEffect(() => {
        fetchRawLogs(currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, itemsPerPage, filterType, debouncedSearch, customDates]);

    const fetchRawLogs = async (pageToFetch) => {
        if (filterType === 'Custom' && (!customDates.from || !customDates.to)) return;

        setLoading(true);
        try {
            const now = new Date();
            let start = new Date(now);
            let end = new Date(now);

            // We pass the exact timestamps to the backend instead of formatting strings,
            // because AttendanceLog uses a strict Mongoose timestamp for sorting/filtering.
            if (filterType === 'Today') {
                start.setHours(0, 0, 0, 0);
            } else if (filterType === 'Week') {
                start.setDate(now.getDate() - 7);
                start.setHours(0, 0, 0, 0);
            } else if (filterType === 'Month') {
                start.setDate(now.getDate() - 30);
                start.setHours(0, 0, 0, 0);
            } else if (filterType === 'Custom') {
                start = new Date(customDates.from);
                start.setHours(0, 0, 0, 0);
                end = new Date(customDates.to);
                end.setHours(23, 59, 59, 999);
            }

            const params = {
                page: pageToFetch,
                limit: itemsPerPage,
                search: debouncedSearch,
                // We send these as ISO strings so the backend can easily do $gte / $lte queries
                startDate: start.toISOString(),
                endDate: end.toISOString()
            };

            const res = await api.get('/attendance/raw-logs', { params });
            
            setRawLogs(res.data.data);
            setTotalPages(res.data.pagination.totalPages);
            setTotalRecords(res.data.pagination.totalRecords);
            setCurrentPage(res.data.pagination.currentPage);
        } catch (err) {
            Swal.fire('Error', 'Failed to load raw biometric logs', 'error');
        } finally {
            setLoading(false);
        }
    };

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
                        placeholder="Search employee, Bio ID, or Device..."
                        className="swal2-input search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* METRIC SUMMARY */}
            <div className="table-summary-text fade-in">
                Showing <span className="text-primary fw-bold mx-1 fs-15">{totalRecords}</span> total raw punches
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
                        ) : rawLogs.length === 0 ? (
                            <tr><td colSpan="5" className="empty-table-message">No punches found matching filters.</td></tr>
                        ) : (
                            rawLogs.map(log => (
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

            {/* 👇 Modular Pagination Component */}
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

export default RawPunches;