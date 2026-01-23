import React, { useState, useEffect } from 'react';
import api from '../utils/api'; // Import api util
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCog, faSave, faClock, faUserClock } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css'; 

const AdminSettings = () => {
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({
        officeStartTime: '09:30',
        gracePeriod: 15,
        halfDayThreshold: 30
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            // Use api.get with relative path
            const res = await api.get('/settings');
            if (res.data) {
                setSettings({
                    officeStartTime: res.data.officeStartTime || '09:30',
                    gracePeriod: res.data.gracePeriod || 15,
                    halfDayThreshold: res.data.halfDayThreshold || 30
                });
            }
            setLoading(false);
        } catch (err) {
            console.error("Error fetching settings", err);
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            // Use api.put with relative path
            await api.put('/settings', settings);
            
            Swal.fire({
                title: 'Settings Saved!',
                text: 'Attendance rules have been updated.',
                icon: 'success',
                confirmButtonColor: '#215D7B'
            });
        } catch (err) {
            Swal.fire('Error', 'Failed to update settings. Are you an Admin?', 'error');
        }
    };

    if (loading) return <div className="main-content">Loading Configuration...</div>;

    return (
        <div className="settings-container">
            <h1 className="page-title"><FontAwesomeIcon icon={faCog} /> System Configuration</h1>
            
            <div className="control-card" style={{ display: 'block', maxWidth: '700px' }}>
                <div style={{ borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, color: '#215D7B' }}>Attendance Rules</h3>
                    <p style={{ color: '#777', fontSize: '14px', margin: '5px 0 0' }}>
                        Configure how the system automatically marks attendance status.
                    </p>
                </div>

                <form onSubmit={handleSave}>
                    {/* Office Start Time */}
                    <div className="form-group" style={{ marginBottom: '25px' }}>
                        <label style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <FontAwesomeIcon icon={faClock} style={{ color: '#215D7B' }}/> Office Start Time
                        </label>
                        <input 
                            type="time" 
                            className="swal2-input" 
                            style={{ margin: '10px 0', width: '100%' }}
                            value={settings.officeStartTime}
                            onChange={(e) => setSettings({...settings, officeStartTime: e.target.value})}
                        />
                        <small style={{ color: '#64748b' }}>
                            Employees checking in after this time will be evaluated for lateness.
                        </small>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
                        {/* Grace Period */}
                        <div className="form-group">
                            <label style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FontAwesomeIcon icon={faUserClock} style={{ color: '#f59e0b' }}/> Grace Period
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input 
                                    type="number" 
                                    className="swal2-input" 
                                    style={{ margin: '10px 0', width: '100%' }}
                                    value={settings.gracePeriod}
                                    onChange={(e) => setSettings({...settings, gracePeriod: e.target.value})}
                                />
                                <span style={{ fontWeight: 'bold', color: '#555' }}>min</span>
                            </div>
                            <small style={{ color: '#64748b' }}>Allowed delay before marking "Late".</small>
                        </div>

                        {/* Half Day Threshold */}
                        <div className="form-group">
                            <label style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FontAwesomeIcon icon={faUserClock} style={{ color: '#dc2626' }}/> Half-Day Threshold
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input 
                                    type="number" 
                                    className="swal2-input" 
                                    style={{ margin: '10px 0', width: '100%' }}
                                    value={settings.halfDayThreshold}
                                    onChange={(e) => setSettings({...settings, halfDayThreshold: e.target.value})}
                                />
                                <span style={{ fontWeight: 'bold', color: '#555' }}>min</span>
                            </div>
                            <small style={{ color: '#64748b' }}>Delay that triggers "Half Day".</small>
                        </div>
                    </div>

                    <button type="submit" className="gts-btn primary" style={{ width: '100%', justifyContent: 'center', padding: '15px' }}>
                        <FontAwesomeIcon icon={faSave} /> Save Configuration
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminSettings;