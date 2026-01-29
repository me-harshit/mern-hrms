import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import '../styles/Calendar.css';

const CalendarPage = () => {
    const year = new Date().getFullYear();
    const [events, setEvents] = useState({});
    const [loading, setLoading] = useState(true);

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
            const [holidaysRes, attendanceRes, leavesRes] = await Promise.all([
                api.get('/holidays'),
                api.get('/attendance/my-logs'),
                api.get('/leaves/my-leaves')
            ]);

            // --- FIX IS HERE ---
            // The leaves API now returns { history: [...], balances: {...} }
            // So we must access .history to get the array.
            const leavesArray = leavesRes.data.history || []; 

            processEvents(holidaysRes.data, attendanceRes.data, leavesArray);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching calendar data", err);
            setLoading(false);
        }
    };

    // --- HELPER: Normalize all dates to YYYY-MM-DD ---
    const formatDateKey = (dateInput) => {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return null;
        return d.toISOString().split('T')[0];
    };

    const processEvents = (holidaysData, attendanceLogs, leaveRequests) => {
        const eventMap = {};

        // 1. Map Holidays
        if (Array.isArray(holidaysData)) {
            holidaysData.forEach(h => {
                const dateStr = formatDateKey(h.date);
                if (dateStr) {
                    eventMap[dateStr] = { type: 'holiday', label: h.name };
                }
            });
        }

        // 2. Map Leaves
        if (Array.isArray(leaveRequests)) {
            leaveRequests.forEach(leave => {
                if (leave.status === 'Approved') {
                    const start = new Date(leave.fromDate);
                    const end = new Date(leave.toDate);

                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        const dateStr = formatDateKey(d);
                        if (dateStr && !eventMap[dateStr]) {
                            eventMap[dateStr] = { type: 'leave', label: leave.leaveType };
                        }
                    }
                }
            });
        }

        // 3. Map Attendance
        if (Array.isArray(attendanceLogs)) {
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
        }

        setEvents(eventMap);
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
        </div>
    );
};

export default CalendarPage;