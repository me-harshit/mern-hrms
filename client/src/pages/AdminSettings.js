import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCog, faSave, faClock, faCalendarAlt, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import '../styles/App.css';

const AdminSettings = () => {
    const [loading, setLoading] = useState(true);
    const [holidays, setHolidays] = useState([]);
    const [settings, setSettings] = useState({
        officeStartTime: '09:30',
        officeCloseTime: '18:30',
        gracePeriod: 15,
        halfDayThreshold: 30
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [settingsRes, holidaysRes] = await Promise.all([
                api.get('/settings'),
                api.get('/holidays')
            ]);

            if (settingsRes.data) {
                setSettings({
                    officeStartTime: settingsRes.data.officeStartTime || '09:30',
                    officeCloseTime: settingsRes.data.officeCloseTime || '18:30',
                    gracePeriod: settingsRes.data.gracePeriod || 15,
                    halfDayThreshold: settingsRes.data.halfDayThreshold || 30
                });
            }
            setHolidays(holidaysRes.data || []);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching data", err);
            setLoading(false);
        }
    };

    // --- SETTINGS HANDLERS ---
    const handleSaveSettings = async (e) => {
        e.preventDefault();
        try {
            await api.put('/settings', settings);
            Swal.fire({
                title: 'Settings Saved!',
                text: 'Attendance rules have been updated.',
                icon: 'success',
                confirmButtonColor: '#215D7B'
            });
        } catch (err) {
            Swal.fire('Error', 'Failed to update settings.', 'error');
        }
    };

    // --- HOLIDAY HANDLERS ---
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
                await api.post('/holidays', formValues);
                Swal.fire('Success', 'Holiday added successfully', 'success');
                const res = await api.get('/holidays');
                setHolidays(res.data);
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
                await api.delete(`/holidays/${id}`);
                Swal.fire('Deleted', 'Holiday has been removed.', 'success');
                setHolidays(holidays.filter(h => h._id !== id));
            } catch (err) {
                Swal.fire('Error', 'Failed to delete holiday', 'error');
            }
        }
    };

    if (loading) return <div className="main-content">Loading Configuration...</div>;

    return (
        <div className="settings-container" style={{ width: '100%', paddingBottom: '40px' }}>
            <h1 className="page-title"><FontAwesomeIcon icon={faCog} /> System Configuration</h1>

            {/* CARD 1: ATTENDANCE RULES */}
            <div className="control-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '40px', alignItems: 'center' }}>

                {/* LEFT: INFO SECTION */}
                <div style={{ flex: '0 0 280px' }}>
                    <h3 style={{ margin: 0, color: '#215D7B', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FontAwesomeIcon icon={faClock} /> Attendance Rules
                    </h3>
                    <p style={{ color: '#777', fontSize: '14px', margin: '10px 0 0', lineHeight: '1.6' }}>
                        Configure office timings and auto-marking logic.
                    </p>
                </div>

                {/* RIGHT: FORM SECTION */}
                <div style={{ flex: '1', minWidth: '300px' }}>
                    <form onSubmit={handleSaveSettings}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px' }}>
                            {/* Start Time */}
                            <div className="form-group">
                                <label className="input-label">Office Start Time</label>
                                <input
                                    type="time"
                                    className="swal2-input custom-input"
                                    value={settings.officeStartTime}
                                    onChange={(e) => setSettings({ ...settings, officeStartTime: e.target.value })}
                                />
                            </div>

                            {/* End Time */}
                            <div className="form-group">
                                <label className="input-label">Office End Time</label>
                                <input
                                    type="time"
                                    className="swal2-input custom-input"
                                    value={settings.officeCloseTime}
                                    onChange={(e) => setSettings({ ...settings, officeCloseTime: e.target.value })}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
                            {/* Grace Period */}
                            <div className="form-group">
                                <label className="input-label">Grace Period (Mins)</label>
                                <input
                                    type="number"
                                    className="swal2-input custom-input"
                                    value={settings.gracePeriod}
                                    onChange={(e) => setSettings({ ...settings, gracePeriod: e.target.value })}
                                />
                                <small className="hint-text">Delay allowed before marking "Late"</small>
                            </div>

                            {/* Half Day Threshold */}
                            <div className="form-group">
                                <label className="input-label">Half-Day Threshold (Mins)</label>
                                <input
                                    type="number"
                                    className="swal2-input custom-input"
                                    value={settings.halfDayThreshold}
                                    onChange={(e) => setSettings({ ...settings, halfDayThreshold: e.target.value })}
                                />
                                <small className="hint-text">Delay triggering "Half Day"</small>
                            </div>
                        </div>

                        {/* CENTERED BUTTON CONTAINER */}
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <button
                                type="submit"
                                className="gts-btn primary"
                                style={{ padding: '10px 30px', fontSize: '14px', minWidth: '200px' }}
                            >
                                <FontAwesomeIcon icon={faSave} style={{ marginRight: '8px' }} /> Save Configuration
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* CARD 2: HOLIDAY MANAGEMENT */}
            <div className="control-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '40px', alignItems: 'center' }}>

                {/* LEFT: INFO & ADD BUTTON */}
                <div style={{ flex: '0 0 280px' }}>
                    <h3 style={{ margin: 0, color: '#215D7B', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FontAwesomeIcon icon={faCalendarAlt} /> Holiday Management
                    </h3>
                    <p style={{ color: '#777', fontSize: '14px', margin: '10px 0 20px', lineHeight: '1.6' }}>
                        Manage company-wide holidays.
                    </p>
                    <button className="gts-btn primary" onClick={handleAddHoliday} style={{ width: '100%', fontSize: '14px', padding: '10px' }}>
                        <FontAwesomeIcon icon={faPlus} style={{ marginRight: '5px' }} /> Add Holiday
                    </button>
                </div>

                {/* RIGHT: TABLE SECTION */}
                <div style={{ flex: '1', minWidth: '300px' }}>
                    <div className="admin-table-wrapper" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        <table className="holiday-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8f9fa', textAlign: 'left', fontSize: '13px', textTransform: 'uppercase', color: '#64748b' }}>
                                    <th style={{ padding: '12px', borderBottom: '2px solid #eef2f6' }}>Date</th>
                                    <th style={{ padding: '12px', borderBottom: '2px solid #eef2f6' }}>Holiday Name</th>
                                    <th style={{ padding: '12px', borderBottom: '2px solid #eef2f6', textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {holidays.length === 0 ? (
                                    <tr>
                                        <td colSpan="3" style={{ textAlign: 'center', padding: '30px', color: '#999' }}>
                                            No holidays added yet.
                                        </td>
                                    </tr>
                                ) : (
                                    holidays.map(holiday => (
                                        <tr key={holiday._id} style={{ borderBottom: '1px solid #f1f1f1' }}>
                                            <td style={{ padding: '14px 12px', fontSize: '14px', color: '#333' }}>
                                                {new Date(holiday.date).toLocaleDateString('en-GB', {
                                                    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                                                })}
                                            </td>
                                            <td style={{ padding: '14px 12px', fontWeight: '500', color: '#333' }}>
                                                {holiday.name}
                                            </td>
                                            <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                                                <button
                                                    className="gts-btn danger"
                                                    style={{ padding: '6px 12px', fontSize: '12px' }} // Removed opacity: 0.2
                                                    onClick={() => handleDeleteHoliday(holiday._id)}
                                                    title="Delete Holiday"
                                                >
                                                    <FontAwesomeIcon icon={faTrash} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminSettings;