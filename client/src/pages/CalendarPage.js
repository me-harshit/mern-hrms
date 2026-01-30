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
    
    // New: Track direction for animation ('right' or 'left')
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
                // UPDATED: Removed text content inside div, only title remains
                <div key={day} className={`calendar-day ${statusClass}`} title={eventLabel || ''}>
                    {day}
                </div>
            );
        }
        return days;
    };

    const MonthCard = ({ monthName, index, isSlider }) => (
        <div 
            className={`month-card ${isSlider ? 'slider-mode' : ''}`} 
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                {isSlider && (
                    <button className="icon-btn" onClick={handlePrevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#215D7B', padding: '10px' }}>
                        <FontAwesomeIcon icon={faChevronLeft} size="2x" />
                    </button>
                )}
                
                <h3 className="month-title" style={{ margin: 0, fontSize: isSlider ? '1.8rem' : '1.1rem', color: '#215D7B' }}>
                    {monthName} {isSlider && year}
                </h3>
                
                {isSlider && (
                    <button className="icon-btn" onClick={handleNextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#215D7B', padding: '10px' }}>
                        <FontAwesomeIcon icon={faChevronRight} size="2x" />
                    </button>
                )}
            </div>
            
            <div className="week-header" style={{marginBottom: '10px'}}>
                <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
            </div>
            <div className="days-grid">
                {renderDaysGrid(index)}
            </div>
        </div>
    );

    if (loading) return <div className="main-content">Loading Calendar...</div>;

    return (
        <div className="calendar-page-container">
            <div className="calendar-header" style={{flexDirection: 'column', alignItems: 'flex-start', gap: '15px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center'}}>
                    <h1 className="page-title" style={{margin: 0}}>Calendar {year}</h1>
                    
                    <div className="view-switcher" style={{background: '#f1f5f9', padding: '5px', borderRadius: '8px', display: 'flex', gap: '5px'}}>
                        <button 
                            onClick={() => setViewMode('slider')}
                            className={`gts-btn ${viewMode === 'slider' ? 'primary' : ''}`}
                            style={{ 
                                padding: '8px 15px', 
                                background: viewMode === 'slider' ? '#215D7B' : 'transparent',
                                color: viewMode === 'slider' ? '#fff' : '#64748b',
                                boxShadow: 'none',
                                borderRadius: '6px'
                            }}
                        >
                            <FontAwesomeIcon icon={faCalendarDay} style={{marginRight: '6px'}} /> Month View
                        </button>
                        <button 
                            onClick={() => setViewMode('full')}
                            className={`gts-btn ${viewMode === 'full' ? 'primary' : ''}`}
                            style={{ 
                                padding: '8px 15px', 
                                background: viewMode === 'full' ? '#215D7B' : 'transparent',
                                color: viewMode === 'full' ? '#fff' : '#64748b',
                                boxShadow: 'none',
                                borderRadius: '6px'
                            }}
                        >
                            <FontAwesomeIcon icon={faTh} style={{marginRight: '6px'}} /> Year View
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

            <div className="calendar-content" style={{ marginTop: '20px' }}>
                {viewMode === 'slider' ? (
                    <div 
                        className="slider-view" 
                        style={{ display: 'flex', justifyContent: 'center', padding: '20px 0', overflow: 'hidden' }}
                    >
                        <div 
                            key={currentMonthIndex} 
                            className={slideDirection === 'right' ? 'slide-in-right' : 'slide-in-left'}
                            style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
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