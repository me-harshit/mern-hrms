import React, { useState, useEffect } from 'react';
import api from '../utils/api'; // Import api util
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faEdit } from '@fortawesome/free-solid-svg-icons';

const AttendanceLogs = () => {
    const [logs, setLogs] = useState([]);
    const [filteredLogs, setFilteredLogs] = useState([]);
    const [filterType, setFilterType] = useState('Today'); // Today, Week, Month, All
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchLogs();
    }, []);

    // Fixed: Logic moved inside useEffect to satisfy ESLint
    useEffect(() => {
        let result = logs;

        // 1. Time Filtering
        if (filterType === 'Today') {
            const now = new Date();
            // Match Backend Format: "D/M/YYYY" (e.g. 22/1/2026)
            const todayBackendFormat = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
            result = result.filter(log => log.date === todayBackendFormat);
        } 
        else if (filterType === 'Week') {
            const now = new Date();
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(now.getDate() - 7);
            
            result = result.filter(log => {
                const logDate = new Date(log.checkIn);
                return logDate >= oneWeekAgo && logDate <= now;
            });
        } 
        else if (filterType === 'Month') {
            const now = new Date();
            const oneMonthAgo = new Date();
            oneMonthAgo.setDate(now.getDate() - 30);
            
            result = result.filter(log => {
                const logDate = new Date(log.checkIn);
                return logDate >= oneMonthAgo && logDate <= now;
            });
        }

        // 2. Search Filtering (Employee Name)
        if (searchTerm) {
            result = result.filter(log => 
                log.userId?.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        setFilteredLogs(result);
    }, [logs, filterType, searchTerm]); 

    const fetchLogs = async () => {
        try {
            // Use api.get with relative path
            const res = await api.get('/attendance/all-logs');
            setLogs(res.data);
        } catch (err) {
            console.error("Error fetching logs");
        }
    };

    const handleEdit = async (log) => {
        const inTime = new Date(log.checkIn).toTimeString().slice(0, 5); // HH:MM
        const outTime = log.checkOut ? new Date(log.checkOut).toTimeString().slice(0, 5) : '';

        const { value: formValues } = await Swal.fire({
            title: `Edit Log: ${log.userId.name}`,
            html: `
                <div style="text-align:left">
                    <label class="swal-custom-label">Status</label>
                    <select id="swal-status" class="swal2-select" style="width: 100%">
                        <option value="Present" ${log.status === 'Present' ? 'selected' : ''}>Present</option>
                        <option value="Half Day" ${log.status === 'Half Day' ? 'selected' : ''}>Half Day</option>
                        <option value="Late" ${log.status === 'Late' ? 'selected' : ''}>Late</option>
                        <option value="Absent" ${log.status === 'Absent' ? 'selected' : ''}>Absent</option>
                    </select>

                    <label class="swal-custom-label">Check In Time</label>
                    <input id="swal-in" type="time" class="swal2-input" value="${inTime}">

                    <label class="swal-custom-label">Check Out Time</label>
                    <input id="swal-out" type="time" class="swal2-input" value="${outTime}">

                    <label class="swal-custom-label">Exception Note</label>
                    <input id="swal-note" class="swal2-input" placeholder="Reason for change..." value="${log.note || ''}">
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#215D7B',
            preConfirm: () => ({
                status: document.getElementById('swal-status').value,
                checkIn: document.getElementById('swal-in').value,
                checkOut: document.getElementById('swal-out').value,
                note: document.getElementById('swal-note').value
            })
        });

        if (formValues) {
            try {
                // Use api.put with relative path
                await api.put(`/attendance/update/${log._id}`, formValues);
                
                Swal.fire('Updated', 'Attendance record updated.', 'success');
                fetchLogs(); 
            } catch (err) {
                Swal.fire('Error', 'Update failed', 'error');
            }
        }
    };

    return (
        <div className="attendance-container">
            <h1 className="page-title">Attendance Logs</h1>

            {/* FILTERS BAR */}
            <div className="control-card" style={{ flexDirection: 'row', justifyContent: 'space-between', padding: '20px', alignItems: 'center' }}>
                <div className="button-group">
                    {['Today', 'Week', 'Month', 'All'].map(type => (
                        <button 
                            key={type}
                            className={`gts-btn ${filterType === type ? 'primary' : 'warning'}`}
                            style={{ opacity: filterType === type ? 1 : 0.7 }}
                            onClick={() => setFilterType(type)}
                        >
                            {type}
                        </button>
                    ))}
                </div>

                <div style={{ position: 'relative' }}>
                    <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '15px', top: '12px', color: '#aaa' }} />
                    <input 
                        type="text" 
                        placeholder="Search Employee..." 
                        className="swal2-input" 
                        style={{ margin: 0, paddingLeft: '40px', width: '250px', height: '40px' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* TABLE */}
            <div className="employee-table-container">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Date</th>
                            <th>In Time</th>
                            <th>Out Time</th>
                            <th>Status</th>
                            <th>Note</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLogs.length === 0 ? (
                            <tr><td colSpan="7" style={{textAlign:'center', padding:'20px'}}>No logs found.</td></tr>
                        ) : (
                            filteredLogs.map(log => (
                                <tr key={log._id}>
                                    <td style={{ fontWeight: 'bold' }}>{log.userId?.name || 'Unknown'}</td>
                                    <td>{log.date}</td>
                                    <td>{new Date(log.checkIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                                    <td>{log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}</td>
                                    <td>
                                        <span className={`status-badge ${
                                            log.status === 'Present' ? 'success' : 
                                            log.status === 'Half Day' ? 'warning' : 'danger'
                                        }`}>
                                            {log.status}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '12px', maxWidth: '150px' }}>{log.note}</td>
                                    <td>
                                        <button className="gts-btn primary" style={{ padding: '5px 10px', fontSize: '12px' }} onClick={() => handleEdit(log)}>
                                            <FontAwesomeIcon icon={faEdit} /> Edit
                                        </button>
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

export default AttendanceLogs;