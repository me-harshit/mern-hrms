import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';

const Attendance = () => {
    const [time, setTime] = useState(new Date());
    const [isCheckedIn, setIsCheckedIn] = useState(false);
    const [logs, setLogs] = useState([]);

    // Update clock every second
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleAttendance = () => {
        const currentTime = time.toLocaleTimeString();
        if (!isCheckedIn) {
            Swal.fire('Checked In!', `Time: ${currentTime}`, 'success');
            setLogs([...logs, { date: new Date().toLocaleDateString(), in: currentTime, out: '-' }]);
        } else {
            Swal.fire('Checked Out!', `Time: ${currentTime}`, 'info');
            // Update the last log with check-out time
            const updatedLogs = [...logs];
            updatedLogs[updatedLogs.length - 1].out = currentTime;
            setLogs(updatedLogs);
        }
        setIsCheckedIn(!isCheckedIn);
    };

    return (
        <div style={{ padding: '20px' }}>
            <div style={headerStyle}>
                <h1>Attendance Tracking</h1>
                <div style={clockStyle}>{time.toLocaleTimeString()}</div>
            </div>

            <div style={actionCard}>
                <h3>Status: {isCheckedIn ? "🟢 Working" : "🔴 Not Checked In"}</h3>
                <button 
                    onClick={handleAttendance} 
                    style={isCheckedIn ? outBtnStyle : inBtnStyle}
                >
                    {isCheckedIn ? "Check Out Now" : "Check In Now"}
                </button>
            </div>

            <table style={tableStyle}>
                <thead>
                    <tr style={{ background: '#eee' }}>
                        <th style={tdStyle}>Date</th>
                        <th style={tdStyle}>Check In</th>
                        <th style={tdStyle}>Check Out</th>
                    </tr>
                </thead>
                <tbody>
                    {logs.map((log, index) => (
                        <tr key={index}>
                            <td style={tdStyle}>{log.date}</td>
                            <td style={tdStyle}>{log.in}</td>
                            <td style={tdStyle}>{log.out}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// Styles
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' };
const clockStyle = { fontSize: '32px', fontWeight: 'bold', color: '#2c3e50', background: '#fff', padding: '10px 20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' };
const actionCard = { background: '#fff', padding: '30px', borderRadius: '12px', textAlign: 'center', marginBottom: '30px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' };
const inBtnStyle = { background: '#2ecc71', color: 'white', border: 'none', padding: '15px 40px', borderRadius: '8px', fontSize: '18px', cursor: 'pointer', marginTop: '15px' };
const outBtnStyle = { ...inBtnStyle, background: '#e74c3c' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '10px', overflow: 'hidden' };
const tdStyle = { padding: '15px', borderBottom: '1px solid #eee', textAlign: 'left' };

export default Attendance;