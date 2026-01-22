import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faClock, faCoffee, faSignInAlt, faSignOutAlt, 
    faHistory 
} from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css'; 

const Attendance = () => {
    // --- STATE ---
    const [currentTime, setCurrentTime] = useState(new Date());
    const [status, setStatus] = useState('OUT'); // OUT, WORKING, BREAK
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Break Timer
    const [breakTimeLeft, setBreakTimeLeft] = useState(900); // 15 mins

    // --- 1. INITIAL LOAD & CLOCK ---
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        fetchLogs(); // Load data from DB on mount
        return () => clearInterval(timer);
    }, []);

    // --- 2. BREAK TIMER LOGIC ---
    useEffect(() => {
        let breakInterval;
        if (status === 'BREAK') {
            breakInterval = setInterval(() => {
                setBreakTimeLeft((prev) => prev - 1);
            }, 1000);
        }
        return () => clearInterval(breakInterval);
    }, [status]);

    // --- API: FETCH LOGS ---
    const fetchLogs = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('http://localhost:5000/api/attendance/my-logs', {
                headers: { 'x-auth-token': token }
            });
            setLogs(res.data);
            const todayLog = res.data.find(log => !log.checkOut); 
            
            if (todayLog) {
                setStatus('WORKING');
            } else {
                setStatus('OUT');
            }
            setLoading(false);
        } catch (err) {
            console.error("Error fetching logs", err);
            setLoading(false);
        }
    };

    // --- HELPERS ---
    const formatTime = (seconds) => {
        const isNegative = seconds < 0;
        const absSeconds = Math.abs(seconds);
        const mins = Math.floor(absSeconds / 60);
        const secs = absSeconds % 60;
        return `${isNegative ? '-' : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    // --- HANDLERS ---
    const handleCheckIn = async () => {
        try {
            const token = localStorage.getItem('token');
            
            const result = await Swal.fire({
                title: 'Confirm Check-In',
                text: 'Start your work day?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#215D7B',
                confirmButtonText: 'Yes, Check In'
            });

            if (result.isConfirmed) {
                // Call API
                const res = await axios.post('http://localhost:5000/api/attendance/checkin', {}, {
                    headers: { 'x-auth-token': token }
                });

                setStatus('WORKING');
                fetchLogs(); // Refresh table
                Swal.fire('Checked In', res.data.status === 'Late' || res.data.status === 'Half Day' 
                    ? `Marked as ${res.data.status} (Late Entry)` 
                    : 'Success', 'success');
            }
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Check-in failed', 'error');
        }
    };

    const handleCheckOut = async () => {
        try {
            const token = localStorage.getItem('token');
            
            // Warn if before 14:30
            const now = new Date();
            const isEarlyExit = now.getHours() < 14 || (now.getHours() === 14 && now.getMinutes() < 30);
            const warningText = isEarlyExit 
                ? 'It is before 14:30. This will be marked as a HALF DAY. Proceed?' 
                : 'End your work day?';

            const result = await Swal.fire({
                title: 'Confirm Check-Out',
                text: warningText,
                icon: isEarlyExit ? 'warning' : 'question',
                showCancelButton: true,
                confirmButtonColor: '#A6477F',
                confirmButtonText: 'Yes, Check Out'
            });

            if (result.isConfirmed) {
                await axios.post('http://localhost:5000/api/attendance/checkout', {}, {
                    headers: { 'x-auth-token': token }
                });

                setStatus('OUT');
                fetchLogs(); // Refresh table
                Swal.fire('Checked Out', 'Have a good evening!', 'success');
            }
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Check-out failed', 'error');
        }
    };

    const toggleBreak = () => {
        if (status === 'WORKING') {
            setStatus('BREAK');
            setBreakTimeLeft(900);
        } else if (status === 'BREAK') {
            setStatus('WORKING');
            if (breakTimeLeft < 0) {
                Swal.fire('Break Ended', `You exceeded break time by ${formatTime(breakTimeLeft).replace('-', '+')}`, 'warning');
            }
        }
    };

    if (loading) return <div className="main-content">Loading Attendance...</div>;

    return (
        <div className="attendance-container">
            {/* Header */}
            <div className="attendance-header">
                <h2 className="page-title" style={{ fontSize: '20px', margin: 0 }}>Attendance</h2>
                <div className="digital-clock">
                    {currentTime.toLocaleTimeString()}
                </div>
            </div>

            {/* Control Card */}
            <div className="control-card">
                {/* LEFT: Status Ring */}
                <div className={`status-ring ${status.toLowerCase()}`}>
                    <div className="inner-status">
                        {status === 'BREAK' ? (
                            <div className={breakTimeLeft < 0 ? 'timer-danger' : 'timer-normal'}>
                                {formatTime(breakTimeLeft)}
                                <span style={{ fontSize: '12px' }}>Break</span>
                            </div>
                        ) : (
                            <>
                                <FontAwesomeIcon icon={status === 'WORKING' ? faClock : faSignInAlt} size="2x" />
                                <span>{status}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* RIGHT: Controls */}
                <div className="actions-area">
                    {/* Manual Half-Day Toggle REMOVED */}

                    <div className="button-group">
                        {status === 'OUT' ? (
                            <button className="gts-btn primary" onClick={handleCheckIn}>
                                <FontAwesomeIcon icon={faSignInAlt} /> Check In
                            </button>
                        ) : (
                            <>
                                {status === 'WORKING' && (
                                    <button className="gts-btn warning" onClick={toggleBreak}>
                                        <FontAwesomeIcon icon={faCoffee} /> Break
                                    </button>
                                )}

                                {status === 'BREAK' && (
                                    <button className="gts-btn primary" onClick={toggleBreak}>
                                        <FontAwesomeIcon icon={faClock} /> End Break
                                    </button>
                                )}

                                {status !== 'BREAK' && (
                                    <button className="gts-btn danger" onClick={handleCheckOut}>
                                        <FontAwesomeIcon icon={faSignOutAlt} /> Out
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* LOGS TABLE (Connected to Real DB Data) */}
            <div className="employee-table-container">
                <h3 style={{ padding: '15px', fontSize: '16px', margin: 0, borderBottom: '1px solid #eee', color: '#215D7B' }}>
                    <FontAwesomeIcon icon={faHistory} /> Activity Log
                </h3>
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Time In</th>
                            <th>Time Out</th>
                            <th>Status</th>
                            <th>Note</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan="5" style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                                    No activity recorded yet.
                                </td>
                            </tr>
                        ) : (
                            logs.map((log, index) => (
                                <tr key={index}>
                                    <td style={{ fontWeight: '600', color: '#555' }}>{log.date}</td>
                                    {/* Format time nicely from ISO string if needed */}
                                    <td>{new Date(log.checkIn).toLocaleTimeString()}</td>
                                    <td>{log.checkOut ? new Date(log.checkOut).toLocaleTimeString() : '-'}</td>
                                    
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