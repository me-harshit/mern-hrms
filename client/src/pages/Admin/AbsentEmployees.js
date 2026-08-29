import React, { useState, useEffect, useMemo } from 'react';
import api from '../../utils/api';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserTimes, faSearch, faArrowLeft, faSun, faMoon } from '@fortawesome/free-solid-svg-icons';
import '../../styles/App.css';

// Colour the reason chip by how much it needs chasing: an approved absence is
// expected, a missing punch is not.
const reasonClass = (reason) => {
    if (reason.startsWith('On Leave')) return 'primary';
    if (reason.startsWith('WFH')) return 'warning';
    return 'danger';
};

const AbsentEmployees = () => {
    const navigate = useNavigate();

    const [shift, setShift] = useState('DAY');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        let cancelled = false;

        const fetchAbsentees = async () => {
            setLoading(true);
            try {
                const res = await api.get('/attendance/absent', { params: { shift } });
                if (!cancelled) setResult(res.data);
            } catch (err) {
                console.error('Error fetching absentees:', err);
                if (!cancelled) setResult(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchAbsentees();
        return () => { cancelled = true; };
    }, [shift]);

    // Small enough list to filter on the client — no need for a debounced round trip.
    const visible = useMemo(() => {
        const all = result?.employees || [];
        const term = searchTerm.trim().toLowerCase();
        if (!term) return all;
        return all.filter(e =>
            (e.name || '').toLowerCase().includes(term) ||
            (e.employeeId || '').toLowerCase().includes(term)
        );
    }, [result, searchTerm]);

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
                        Absent Today
                    </h1>
                </div>

                <div className="header-actions-group">
                    <div className="filter-buttons">
                        <button
                            className={`gts-btn filter-btn ${shift === 'DAY' ? 'primary active' : 'warning inactive'}`}
                            onClick={() => setShift('DAY')}
                        >
                            <FontAwesomeIcon icon={faSun} className="btn-icon" /> Day Shift
                        </button>
                        <button
                            className={`gts-btn filter-btn ${shift === 'NIGHT' ? 'primary active' : 'warning inactive'}`}
                            onClick={() => setShift('NIGHT')}
                        >
                            <FontAwesomeIcon icon={faMoon} className="btn-icon" /> Night Shift
                        </button>
                    </div>
                </div>
            </div>

            {/* SUMMARY */}
            {!loading && result && (
                <div className="filter-bar-card fade-in">
                    <div className="flex-row gap-10">
                        <h2 className="header-no-margin text-danger">{result.count}</h2>
                        <span className="text-muted">
                            of {result.totalOnShift} on the {shift === 'NIGHT' ? 'night' : 'day'} shift
                            {' '}have not checked in &nbsp;·&nbsp; {result.date}
                        </span>
                    </div>

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
            )}

            {/* The night shift has not begun yet — nobody can be absent from it. */}
            {!loading && result && !result.shiftStarted && (
                <div className="employee-table-container fade-in">
                    <p className="empty-table-message">
                        The {shift === 'NIGHT' ? 'night' : 'day'} shift starts at {result.shiftStartTime}.
                        Absentees appear here once it has begun.
                    </p>
                </div>
            )}

            {/* DATA TABLE */}
            {(loading || (result && result.shiftStarted)) && (
                <div className="employee-table-container fade-in">
                    <table className="employee-table">
                        <thead>
                            <tr>
                                <th>Employee Details</th>
                                <th>Assigned Shift</th>
                                <th>Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="3" className="empty-table-message">Fetching records...</td></tr>
                            ) : visible.length === 0 ? (
                                <tr>
                                    <td colSpan="3" className="empty-table-message text-success fw-600">
                                        {searchTerm ? 'No one matches that search.' : 'All clear! Everyone on this shift has checked in.'}
                                    </td>
                                </tr>
                            ) : (
                                visible.map(record => (
                                    <tr key={record._id}>
                                        <td data-label="Employee Details">
                                            <div
                                                className="fw-bold text-primary fs-15"
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => navigate(`/employee/${record._id}`)}
                                                title="View Profile"
                                            >
                                                {record.name || 'Unknown'}
                                            </div>
                                            <div className="text-small text-muted">ID: {record.employeeId || 'N/A'}</div>
                                        </td>

                                        <td data-label="Assigned Shift">
                                            <span className="shift-badge">
                                                {record.shiftType === 'NIGHT' ? (
                                                    <><FontAwesomeIcon icon={faMoon} className="text-moon" /> Night Shift</>
                                                ) : (
                                                    <><FontAwesomeIcon icon={faSun} className="text-sun" /> Day Shift</>
                                                )}
                                            </span>
                                        </td>

                                        <td data-label="Reason">
                                            <span className={`status-badge ${reasonClass(record.reason)}`}>
                                                {record.reason}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default AbsentEmployees;
