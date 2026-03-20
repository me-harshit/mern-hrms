import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserTimes, faSearch, faFilter, faArrowLeft, faSun, faMoon } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

const AbsentEmployees = () => {
    const navigate = useNavigate();
    const [missingEmployees, setMissingEmployees] = useState([]);
    const [filteredList, setFilteredList] = useState([]);
    const [loading, setLoading] = useState(false);

    // --- FILTERS STATE ---
    const [filterType, setFilterType] = useState('Today'); // Today, Yesterday, Week, Month, Custom
    const [selectedShift, setSelectedShift] = useState('DAY'); // Dropdown default
    const [searchTerm, setSearchTerm] = useState('');
    const [customDates, setCustomDates] = useState({ from: '', to: '' });

    // Fetch data automatically when Shift, Filter Type, or Custom Dates change
    useEffect(() => {
        fetchAbsentList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterType, selectedShift, customDates]);

    const fetchAbsentList = async () => {
        if (filterType === 'Custom' && (!customDates.from || !customDates.to)) return;

        setLoading(true);
        try {
            const now = new Date();
            let start = new Date(now);
            let end = new Date(now);

            if (filterType === 'Yesterday') {
                start.setDate(now.getDate() - 1);
                end.setDate(now.getDate() - 1);
            } else if (filterType === 'Week') {
                start.setDate(now.getDate() - 6);
            } else if (filterType === 'Month') {
                start.setDate(now.getDate() - 29);
            } else if (filterType === 'Custom') {
                start = new Date(customDates.from);
                end = new Date(customDates.to);
            }

            const res = await api.post('/attendance/absent-report', {
                startDate: start.toISOString(),
                endDate: end.toISOString(),
                shiftType: selectedShift
            });

            setMissingEmployees(res.data);
        } catch (err) {
            console.error("Error fetching absent list:", err);
        } finally {
            setLoading(false);
        }
    };

    // Fast Client-Side Search
    useEffect(() => {
        if (!searchTerm) {
            setFilteredList(missingEmployees);
        } else {
            const term = searchTerm.toLowerCase();
            const filtered = missingEmployees.filter(emp =>
                (emp.name && emp.name.toLowerCase().includes(term)) ||
                (emp.employeeId && emp.employeeId.toLowerCase().includes(term))
            );
            setFilteredList(filtered);
        }
    }, [searchTerm, missingEmployees]);

    return (
        <div className="attendance-container fade-in">
            {/* HEADER */}
            <div className="absent-header-row">
                {/* Left Side: Back Button & Page Title */}
                <div className="header-actions-group">
                    <button className="gts-btn warning btn-small m-0" onClick={() => navigate('/attendance-logs')}>
                        <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back to Logs
                    </button>
                    <h1 className="page-title header-no-margin flex-row gap-10">
                        <FontAwesomeIcon icon={faUserTimes} className="text-danger" />
                        Absence Report Hub
                    </h1>
                </div>

                {/* Right Side: Shift Dropdown ONLY */}
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
                {/* 1. Date Filter Buttons */}
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

                {/* 3. Text Search */}
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

            <div className="absence-summary">
                Total Absence Records: <span className="absence-summary-count">{filteredList.length}</span>
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
                                <td colSpan="4" className="empty-table-message">Calculating matrix...</td>
                            </tr>
                        ) : filteredList.length === 0 ? (
                            <tr>
                                <td colSpan="4" className="empty-table-message text-success fw-600">
                                    All clear! No absence records found for this selection.
                                </td>
                            </tr>
                        ) : (
                            filteredList.map(emp => (
                                <tr key={emp._id}>
                                    <td data-label="Employee Details">
                                        <div className="fw-bold text-primary fs-15">{emp.name}</div>
                                        <div className="text-small text-muted">ID: {emp.employeeId || 'N/A'}</div>
                                    </td>
                                    
                                    <td data-label="Assigned Shift">
                                        <span className="shift-badge">
                                            {emp.shiftType === 'NIGHT' ? (
                                                <><FontAwesomeIcon icon={faMoon} className="text-moon" /> Night Shift</>
                                            ) : (
                                                <><FontAwesomeIcon icon={faSun} className="text-sun" /> Day Shift</>
                                            )}
                                        </span>
                                    </td>
                                    
                                    <td data-label="Date Missing">
                                        <div className="fw-500 text-dark-gray fs-15">{emp.targetDate}</div>
                                    </td>
                                    
                                    <td data-label="System Status">
                                        <span className={`status-badge ${emp.status === 'On Leave' ? 'warning' : 'danger'}`}>
                                            {emp.status}
                                        </span>
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

export default AbsentEmployees;