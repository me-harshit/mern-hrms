import React, { useState, useEffect } from 'react';
import api from '../utils/api'; // Import api util
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faCalendarAlt } from '@fortawesome/free-solid-svg-icons';
import '../styles/Calendar.css';

const CalendarPage = () => {
    const year = new Date().getFullYear();
    const [events, setEvents] = useState({});
    const [holidays, setHolidays] = useState([]); 
    const [loading, setLoading] = useState(true);

    const user = JSON.parse(localStorage.getItem('user'));
    const isAdmin = user?.role === 'ADMIN';

    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    useEffect(() => {
        fetchCalendarData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchCalendarData = async () => {
        try {
            // api util handles base URL and headers automatically
            const [holidaysRes, attendanceRes, leavesRes] = await Promise.all([
                api.get('/holidays'),
                api.get('/attendance/my-logs'),
                api.get('/leaves/my-leaves')
            ]);

            setHolidays(holidaysRes.data); 
            processEvents(holidaysRes.data, attendanceRes.data, leavesRes.data);
            setLoading(false);

        } catch (err) {
            console.error("Error fetching calendar data", err);
            setLoading(false);
        }
    };

    const processEvents = (holidaysData, attendanceLogs, leaveRequests) => {
        const eventMap = {};

        // 1. Map Holidays
        holidaysData.forEach(h => {
            const dateStr = new Date(h.date).toLocaleDateString('en-CA');
            eventMap[dateStr] = { type: 'holiday', label: h.name };
        });

        // 2. Map Leaves
        leaveRequests.forEach(leave => {
            if (leave.status === 'Approved') {
                const start = new Date(leave.fromDate);
                const end = new Date(leave.toDate);
                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    const dateStr = d.toLocaleDateString('en-CA');
                    if (!eventMap[dateStr]) {
                        eventMap[dateStr] = { type: 'leave', label: leave.leaveType };
                    }
                }
            }
        });

        // 3. Map Attendance
        attendanceLogs.forEach(log => {
            const [day, month, yearVal] = log.date.split('/');
            const dateStr = `${yearVal}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

            if (!eventMap[dateStr] || eventMap[dateStr].type !== 'holiday') {
                if (log.status === 'Half Day') {
                    eventMap[dateStr] = { type: 'half-day', label: 'Half Day' };
                } else if (log.status === 'Absent') {
                    eventMap[dateStr] = { type: 'absent', label: 'Absent' };
                }
            }
        });

        setEvents(eventMap);
    };

    const handleAddHoliday = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Add New Holiday',
            html: `
                <input id="holiday-name" class="swal2-input" placeholder="Holiday Name (e.g. Diwali)">
                <input id="holiday-date" type="date" class="swal2-input">
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Add Holiday',
            confirmButtonColor: '#215D7B',
            preConfirm: () => {
                return {
                    name: document.getElementById('holiday-name').value,
                    date: document.getElementById('holiday-date').value
                };
            }
        });

        if (formValues && formValues.name && formValues.date) {
            try {
                // Use api.post with relative path
                await api.post('/holidays', formValues);
                Swal.fire('Success', 'Holiday added successfully', 'success');
                fetchCalendarData();
            } catch (err) {
                Swal.fire('Error', 'Failed to add holiday', 'error');
            }
        }
    };

    const handleDeleteHoliday = async (id) => {
        const result = await Swal.fire({
            title: 'Delete Holiday?',
            text: "This will remove it from everyone's calendar.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Yes, delete it'
        });

        if (result.isConfirmed) {
            try {
                // Use api.delete with relative path
                await api.delete(`/holidays/${id}`);
                Swal.fire('Deleted', 'Holiday has been removed.', 'success');
                fetchCalendarData();
            } catch (err) {
                Swal.fire('Error', 'Failed to delete holiday', 'error');
            }
        }
    };

    const getDateStatus = (dateStr, dayOfWeek) => {
        if (events[dateStr]) return `status-${events[dateStr].type}`;
        if (dayOfWeek === 0) return 'status-sunday';
        return '';
    };

    const renderMonth = (monthIndex) => {
        const firstDay = new Date(year, monthIndex, 1).getDay();
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

        let days = [];
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dateObj = new Date(year, monthIndex, day);
            const statusClass = getDateStatus(dateStr, dateObj.getDay());
            const eventLabel = events[dateStr] ? events[dateStr].label : null;

            days.push(
                <div key={day} className={`calendar-day ${statusClass}`} title={eventLabel || ''}>
                    {day}
                </div>
            );
        }
        return days;
    };

    if (loading) return <div className="main-content">Loading Calendar...</div>;

    return (
        <div className="calendar-page-container">
            {/* Header: Just the Title & Legend */}
            <div className="calendar-header">
                <h1 className="page-title">Yearly Calendar {year}</h1>
                <div className="calendar-legend">
                    <div className="legend-item"><span className="dot holiday"></span> Holiday</div>
                    <div className="legend-item"><span className="dot leave"></span> On Leave</div>
                    <div className="legend-item"><span className="dot half-day"></span> Half Day</div>
                    <div className="legend-item"><span className="dot absent"></span> Absent</div>
                    <div className="legend-item"><span className="dot sunday"></span> Sunday</div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="year-grid">
                {months.map((month, index) => (
                    <div key={month} className="month-card">
                        <h3 className="month-title">{month}</h3>
                        <div className="week-header">
                            <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                        </div>
                        <div className="days-grid">
                            {renderMonth(index)}
                        </div>
                    </div>
                ))}
            </div>
            {/* --- ADMIN SECTION (BOTTOM) --- */}
            {isAdmin && (
                <div className="admin-holiday-card">

                    {/* 1. SECTION HEADER */}
                    <div className="admin-header">
                        <div className="header-left">
                            <div className="header-icon-box">
                                <FontAwesomeIcon icon={faCalendarAlt} />
                            </div>
                            <div>
                                <h3 className="header-title">Holiday Management</h3>
                                <p className="header-subtitle">Manage company-wide holidays and events</p>
                            </div>
                        </div>

                        <button className="gts-btn primary add-holiday-btn" onClick={handleAddHoliday}>
                            <FontAwesomeIcon icon={faPlus} /> Add New Holiday
                        </button>
                    </div>

                    {/* 2. TABLE SECTION */}
                    <div className="admin-table-wrapper">
                        <table className="holiday-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '25%' }}>Date</th>
                                    <th style={{ width: '55%' }}>Holiday Name</th>
                                    <th className="text-right" style={{ width: '20%' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {holidays.length === 0 ? (
                                    <tr>
                                        <td colSpan="3" className="empty-state-container">
                                            <div className="empty-icon">
                                                <FontAwesomeIcon icon={faCalendarAlt} />
                                            </div>
                                            <p style={{ margin: 0, fontSize: '14px' }}>No holidays added yet.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    holidays.map(holiday => (
                                        <tr key={holiday._id}>
                                            <td className="td-date">
                                                {new Date(holiday.date).toLocaleDateString('en-GB', {
                                                    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                                                })}
                                            </td>
                                            <td className="td-name">
                                                {holiday.name}
                                            </td>
                                            <td className="text-right">
                                                <button
                                                    className="gts-btn danger"
                                                    style={{ padding: '8px 14px', fontSize: '12px', borderRadius: '6px', opacity: 0.9 }}
                                                    onClick={() => handleDeleteHoliday(holiday._id)}
                                                    title="Remove Holiday"
                                                >
                                                    <FontAwesomeIcon icon={faTrash} /> Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalendarPage;