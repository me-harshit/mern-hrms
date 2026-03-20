import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserTimes, faSearch, faFilter, faArrowLeft, faSun, faMoon, faSyncAlt } from '@fortawesome/free-solid-svg-icons';
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
            {/* Header with Shift Dropdown Moved Here */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>

                {/* Left Side: Back Button & Page Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                    <button className="gts-btn warning" onClick={() => navigate('/attendance-logs')} style={{ padding: '8px 15px', margin: 0 }}>
                        <FontAwesomeIcon icon={faArrowLeft} style={{ marginRight: '8px' }} /> Back to Logs
                    </button>
                    <h1 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FontAwesomeIcon icon={faUserTimes} style={{ color: '#dc2626' }} />
                        Absence Report Hub
                    </h1>
                </div>

                {/* Right Side: Shift Dropdown & Refresh Button */}
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>

                    {/* Shift Dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f0f7f9', padding: '5px 10px', borderRadius: '8px', border: '1px solid #bce1f1' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#215D7B' }}>Team Shift:</span>
                        <select
                            className="swal2-select"
                            style={{ margin: 0, height: '35px', fontSize: '13px', padding: '0 30px 0 10px', width: '140px', borderColor: '#215D7B' }}
                            value={selectedShift}
                            onChange={(e) => setSelectedShift(e.target.value)}
                        >
                            <option value="DAY">☀ Day Shift</option>
                            <option value="NIGHT">🌙 Night Shift</option>
                        </select>
                    </div>

                    {/* Refresh Button */}
                    <button className="gts-btn primary" onClick={fetchAbsentList} disabled={loading} style={{ padding: '8px 15px', height: '47px', margin: 0 }}>
                        <FontAwesomeIcon icon={faSyncAlt} className={loading ? "fa-spin" : ""} style={{ marginRight: '8px' }} />
                        Refresh Data
                    </button>

                </div>
            </div>

            {/* Main Controls Bar */}
            <div className="control-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '20px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>

                {/* 1. Date Filter Buttons */}
                <div className="button-group" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {['Today', 'Yesterday', 'Week', 'Month', 'Custom'].map(type => (
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

                {/* 2. Custom Date Inputs */}
                {filterType === 'Custom' && (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '5px 15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>From:</span>
                            <input type="date" className="swal2-input" style={{ margin: 0, height: '35px', padding: '0 10px', fontSize: '13px', width: '130px' }} value={customDates.from} onChange={(e) => setCustomDates({ ...customDates, from: e.target.value })} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>To:</span>
                            <input type="date" className="swal2-input" style={{ margin: 0, height: '35px', padding: '0 10px', fontSize: '13px', width: '130px' }} value={customDates.to} onChange={(e) => setCustomDates({ ...customDates, to: e.target.value })} />
                        </div>
                    </div>
                )}

                {/* 3. Text Search */}
                <div style={{ position: 'relative', minWidth: '220px' }}>
                    <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
                    <input
                        type="text" placeholder="Search employee..." className="swal2-input"
                        style={{ margin: 0, paddingLeft: '40px', width: '100%', height: '40px', fontSize: '14px' }}
                        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div style={{ marginBottom: '20px', fontSize: '15px', fontWeight: '600', color: '#475569', textAlign: 'right' }}>
                Total Absence Records: <span style={{ color: '#dc2626', fontSize: '18px', marginLeft: '5px' }}>{filteredList.length}</span>
            </div>

            {/* Data Table */}
            <div className="employee-table-container">
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
                            <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px' }}>Calculating matrix...</td></tr>
                        ) : filteredList.length === 0 ? (
                            <tr>
                                <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: '#16a34a', fontWeight: '600' }}>
                                    All clear! No absence records found for this selection.
                                </td>
                            </tr>
                        ) : (
                            filteredList.map(emp => (
                                <tr key={emp._id}>
                                    <td>
                                        <div style={{ fontWeight: 'bold', color: '#215D7B', fontSize: '15px' }}>{emp.name}</div>
                                        <div style={{ fontSize: '12px', color: '#777' }}>ID: {emp.employeeId || 'N/A'}</div>
                                    </td>
                                    <td>
                                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            {emp.shiftType === 'NIGHT' ? (
                                                <><FontAwesomeIcon icon={faMoon} style={{ color: '#8b5cf6' }} /> Night Shift</>
                                            ) : (
                                                <><FontAwesomeIcon icon={faSun} style={{ color: '#f59e0b' }} /> Day Shift</>
                                            )}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: '500', color: '#475569', fontSize: '15px' }}>{emp.targetDate}</div>
                                    </td>
                                    <td>
                                        <span className={`status-badge ${emp.status === 'On Leave' ? 'warning' : 'danger'}`} style={{ padding: '6px 12px', fontSize: '12px' }}>
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