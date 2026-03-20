import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import '../styles/Calendar.css'; 
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight, faTh, faCalendarDay } from '@fortawesome/free-solid-svg-icons';

const CalendarPage = () => {
    const year = new Date().getFullYear();
    const [events, setEvents] = useState({});
    const [loading, setLoading] = useState(true);

    // --- VIEW STATE ---
    const [viewMode, setViewMode] = useState('slider'); // 'slider' | 'full'
    const [currentMonthIndex, setCurrentMonthIndex] = useState(new Date().getMonth());
    
    // Track direction for animation ('right' or 'left')
    const [slideDirection, setSlideDirection] = useState('right'); 

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

            const leavesArray = leavesRes.data.history || []; 
            processEvents(holidaysRes.data, attendanceRes.data, leavesArray);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching calendar data", err);
            setLoading(false);
        }
    };

    const formatDateKey = (dateInput) => {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return null;
        return d.toISOString().split('T')[0];
    };

    const processEvents = (holidaysData, attendanceLogs, leaveRequests) => {
        const eventMap = {};
        
        // 1. Holidays
        if (Array.isArray(holidaysData)) {
            holidaysData.forEach(h => {
                const dateStr = formatDateKey(h.date);
                if (dateStr) eventMap[dateStr] = { type: 'holiday', label: h.name };
            });
        }

        // 2. Leaves
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

        // 3. Attendance
        if (Array.isArray(attendanceLogs)) {
            attendanceLogs.forEach(log => {
                const [day, month, yearVal] = log.date.split('/');
                const dateStr = `${yearVal}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                if (!eventMap[dateStr] || eventMap[dateStr].type !== 'holiday') {
                    if (log.status === 'Half Day') eventMap[dateStr] = { type: 'half-day', label: 'Half Day' };
                    else if (log.status === 'Absent') eventMap[dateStr] = { type: 'absent', label: 'Absent' };
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

    // --- NAVIGATION HANDLERS ---
    const handlePrevMonth = () => {
        setSlideDirection('left'); 
        setCurrentMonthIndex(prev => (prev === 0 ? 11 : prev - 1));
    };

    const handleNextMonth = () => {
        setSlideDirection('right'); 
        setCurrentMonthIndex(prev => (prev === 11 ? 0 : prev + 1));
    };

    // --- RENDER HELPERS ---
    const renderDaysGrid = (monthIndex) => {
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

    const MonthCard = ({ monthName, index, isSlider }) => (
        <div className={`month-card ${isSlider ? 'slider-mode' : ''}`}>
            <div className="month-card-header">
                {isSlider && (
                    <button className="month-nav-btn" onClick={handlePrevMonth}>
                        <FontAwesomeIcon icon={faChevronLeft} size="lg" />
                    </button>
                )}
                
                <h3 className={`month-title ${isSlider ? 'slider-title' : 'grid-title'}`}>
                    {monthName} {isSlider && year}
                </h3>
                
                {isSlider && (
                    <button className="month-nav-btn" onClick={handleNextMonth}>
                        <FontAwesomeIcon icon={faChevronRight} size="lg" />
                    </button>
                )}
            </div>
            
            <div className="week-header">
                <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
            </div>
            <div className="days-grid">
                {renderDaysGrid(index)}
            </div>
        </div>
    );

    if (loading) return <div className="main-content">Loading Calendar...</div>;

    return (
        <div className="calendar-page-container fade-in">
            <div className="calendar-top-section">
                <div className="calendar-header-row">
                    <h1 className="page-title header-no-margin">Calendar {year}</h1>
                    
                    {/* MINIMALIST VIEW TOGGLE */}
                    <div className="view-toggle-container">
                        <button 
                            onClick={() => setViewMode('slider')}
                            className={`view-toggle-btn ${viewMode === 'slider' ? 'active' : ''}`}
                        >
                            <FontAwesomeIcon icon={faCalendarDay} className="toggle-icon" /> Month
                        </button>
                        <button 
                            onClick={() => setViewMode('full')}
                            className={`view-toggle-btn ${viewMode === 'full' ? 'active' : ''}`}
                        >
                            <FontAwesomeIcon icon={faTh} className="toggle-icon" /> Year
                        </button>
                    </div>
                </div>

                <div className="calendar-legend">
                    <div className="legend-item"><span className="dot holiday"></span> Holiday</div>
                    <div className="legend-item"><span className="dot leave"></span> On Leave</div>
                    <div className="legend-item"><span className="dot half-day"></span> Half Day</div>
                    <div className="legend-item"><span className="dot absent"></span> Absent</div>
                    <div className="legend-item"><span className="dot sunday"></span> Sunday</div>
                </div>
            </div>

            <div className="calendar-content">
                {viewMode === 'slider' ? (
                    <div className="slider-view-wrapper">
                        <div 
                            key={currentMonthIndex} 
                            className={`slider-anim-container ${slideDirection === 'right' ? 'slide-in-right' : 'slide-in-left'}`}
                        >
                            <MonthCard 
                                monthName={months[currentMonthIndex]} 
                                index={currentMonthIndex} 
                                isSlider={true} 
                            />
                        </div>
                    </div>
                ) : (
                    <div className="year-grid fade-in">
                        {months.map((month, index) => (
                            <MonthCard 
                                key={month} 
                                monthName={month} 
                                index={index} 
                                isSlider={false} 
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CalendarPage;