import React from 'react';
import '../styles/Calendar.css';

const CalendarPage = () => {
    const year = 2026;
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    // Mock Data (Static for now)
    const attendanceData = {
        absent: ['2026-02-14', '2026-06-22'],
        leaves: ['2026-01-15', '2026-04-10'], 
        holidays: ['2026-01-26', '2026-08-15', '2026-10-02', '2026-12-25'] 
    };

    const getDateStatus = (dateStr, dayOfWeek) => {
        if (attendanceData.absent.includes(dateStr)) return 'status-absent';
        if (attendanceData.leaves.includes(dateStr)) return 'status-leave';
        if (attendanceData.holidays.includes(dateStr)) return 'status-holiday';
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

            days.push(
                <div key={day} className={`calendar-day ${statusClass}`}>
                    {day}
                </div>
            );
        }
        return days;
    };

    return (
        <div className="calendar-page-container">
            <div className="calendar-header">
                <h1 className="page-title">Attendance Calendar {year}</h1>
                
                <div className="calendar-legend">
                    <div className="legend-item"><span className="dot sunday"></span> Sunday</div>
                    <div className="legend-item"><span className="dot holiday"></span> Holiday</div>
                    <div className="legend-item"><span className="dot leave"></span> Casual Leave (CL)</div>
                    <div className="legend-item"><span className="dot absent"></span> Absent</div>
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