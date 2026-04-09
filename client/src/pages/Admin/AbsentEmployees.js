import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserTimes, faSearch, faFilter, faArrowLeft, faSun, faMoon } from '@fortawesome/free-solid-svg-icons';
import Pagination from '../../components/Pagination';
import '../../styles/App.css';

const AbsentEmployees = () => {
    const navigate = useNavigate();

    // --- DATA & PAGINATION STATES ---
    const [absences, setAbsences] = useState([]);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // --- FILTERS STATE ---
    const [filterType, setFilterType] = useState('Today'); // Today, Yesterday, Week, Month, Custom
    const [selectedShift, setSelectedShift] = useState('DAY');
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
    }, [filterType, selectedShift, debouncedSearch, customDates]);

    // 3. Fetch Data
    useEffect(() => {
        fetchAbsentList(currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, itemsPerPage, filterType, selectedShift, debouncedSearch, customDates]);

    const fetchAbsentList = async (pageToFetch) => {
        if (filterType === 'Custom' && (!customDates.from || !customDates.to)) return;

        setLoading(true);
        try {
            const now = new Date();
            
            // 👇 FIXED: Force start of the day (Midnight)
            let start = new Date(now);
            start.setHours(0, 0, 0, 0);
            
            // 👇 FIXED: Force end of the day (11:59:59 PM)
            let end = new Date(now);
            end.setHours(23, 59, 59, 999);

            if (filterType === 'Yesterday') {
                start.setDate(now.getDate() - 1);
                end.setDate(now.getDate() - 1);
            } else if (filterType === 'Week') {
                start.setDate(now.getDate() - 6);
            } else if (filterType === 'Month') {
                start.setDate(now.getDate() - 29);
            } else if (filterType === 'Custom') {
                start = new Date(customDates.from);
                start.setHours(0, 0, 0, 0); // Force midnight for custom start
                end = new Date(customDates.to);
                end.setHours(23, 59, 59, 999); // Force end of day for custom end
            }

            const params = {
                page: pageToFetch,
                limit: itemsPerPage,
                search: debouncedSearch,
                shiftType: selectedShift,
                startDate: start.toISOString(),
                endDate: end.toISOString()
            };

            const res = await api.get('/attendance/absent-report', { params });

            setAbsences(res.data.data);
            setTotalPages(res.data.pagination.totalPages);
            setTotalRecords(res.data.pagination.totalRecords);
            setCurrentPage(res.data.pagination.currentPage);

        } catch (err) {
            console.error("Error fetching absent list:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="attendance-container fade-in">
            {/* HEADER */}
            <div className="absent-header-row">
                <div className="header-actions-group">
                    <button className="gts-btn warning btn-small m-0" onClick={() => navigate('/attendance-logs')}>
                        <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back to Logs
                    </button>
                    <h1 className="page-title header-no-margin flex-row gap-10">
                        <FontAwesomeIcon icon={faUserTimes} className="text-danger" />
                        Absence Report Hub
                    </h1>
                </div>

                <div className="header-actions-group">
                    <div className="shift-dropdown-wrapper">
                        <span className="shift-label">Team Shift:</span>
                        <select
                            className="swal2-select shift-select"
                            value={selectedShift}
                            onChange={(e) => setSelectedShift(e.target.value)}
                        >
                            <option value="DAY">☀ Day Shift</option>
                            <option value="NIGHT">🌙 Night Shift</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* MAIN FILTER BAR */}
            <div className="filter-bar-card fade-in">
                <div className="filter-buttons">
                    {['Today', 'Yesterday', 'Week', 'Month', 'Custom'].map(type => (
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
                        placeholder="Search employee..."
                        className="swal2-input search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* DATA TABLE */}
            <div className="employee-table-container fade-in">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Employee Details</th>
                            <th>Assigned Shift</th>
                            <th>Date Missing</th>
                            <th>System Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="4" className="empty-table-message">Fetching records...</td>
                            </tr>
                        ) : absences.length === 0 ? (
                            <tr>
                                <td colSpan="4" className="empty-table-message text-success fw-600">
                                    All clear! No absence records found for this selection.
                                </td>
                            </tr>
                        ) : (
                            absences.map(record => (
                                <tr key={record._id}>
                                    <td data-label="Employee Details">
                                        <div 
                                            className="fw-bold text-primary fs-15"
                                            style={{ cursor: 'pointer'}}
                                            onClick={() => record.userId?._id && navigate(`/employee/${record.userId._id}`)}
                                            title="View Profile"
                                        >
                                            {record.userId?.name || 'Unknown'}
                                        </div>
                                        <div className="text-small text-muted">ID: {record.userId?.employeeId || 'N/A'}</div>
                                    </td>

                                    <td data-label="Assigned Shift">
                                        <span className="shift-badge">
                                            {record.userId?.shiftType === 'NIGHT' ? (
                                                <><FontAwesomeIcon icon={faMoon} className="text-moon" /> Night Shift</>
                                            ) : (
                                                <><FontAwesomeIcon icon={faSun} className="text-sun" /> Day Shift</>
                                            )}
                                        </span>
                                    </td>

                                    <td data-label="Date Missing">
                                        <div className="fw-500 text-dark-gray fs-15">{record.date}</div>
                                    </td>

                                    <td data-label="System Status">
                                        <span className={`status-badge ${record.status === 'On Leave' ? 'primary' :
                                                record.status === 'Pending' ? 'warning' :
                                                    'danger'
                                            }`}>
                                            {record.status === 'Pending' ? 'Pending Punch' : record.status}
                                        </span>
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

export default AbsentEmployees;