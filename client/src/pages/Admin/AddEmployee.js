import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faSave, faArrowLeft, faCog, faMoneyBillWave, faBriefcase } from '@fortawesome/free-solid-svg-icons';
import '../../styles/App.css';
import '../../styles/expenses.css'; 

const AddEmployee = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const [user, setUser] = useState({
        name: '', email: '', workEmail: '', employeeId: '', password: '', phoneNumber: '',
        dateOfBirth: '', joiningDate: new Date().toISOString().split('T')[0],
        bloodGroup: '', aadhaar: '',
        emergencyContact: '', emergencyContactName: '', emergencyContactRelation: '',
        permanentAddress: '', currentAddress: '', address: '',
        jobTitle: '', department: '', workLocation: 'WFO', employmentType: 'Full-time',
        role: 'EMPLOYEE', shiftType: 'DAY', status: 'ACTIVE',
        reportingManagerName: '', reportingManagerEmail: '',
        isPurchaser: false, salary: ''
    });

    const handleAddProfile = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('/employees/add', user);
            Swal.fire('Success', 'New Employee Registered Successfully!', 'success');
            navigate('/employees'); 
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Failed to add employee', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="profile-container fade-in">
            <div className="page-header-left">
                <button className="gts-btn warning btn-small m-0" onClick={() => navigate('/employees')}>
                    <FontAwesomeIcon icon={faArrowLeft} className="btn-icon" /> Back
                </button>
                <h1 className="page-title header-no-margin">Register New Employee</h1>
            </div>

            <div className="control-card p-30 fade-in d-block">
                <form onSubmit={handleAddProfile}>
                    
                    <h3 className="section-title border-bottom pb-10"><FontAwesomeIcon icon={faUser} className="mr-5 text-muted"/> Personal Details</h3>
                    <div className="form-grid mt-15 mb-30" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                        <div className="form-group"><label className="input-label">Full Name *</label><input className="custom-input" required value={user.name} onChange={e => setUser({ ...user, name: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Login Email *</label><input type="email" required className="custom-input" value={user.email} onChange={e => setUser({ ...user, email: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Work Email</label><input type="email" className="custom-input" placeholder="name@gts.ai" value={user.workEmail} onChange={e => setUser({ ...user, workEmail: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Temporary Password *</label><input type="password" required className="custom-input" value={user.password} onChange={e => setUser({ ...user, password: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label text-primary fw-bold">Employee / Biometric ID *</label><input required className="custom-input" placeholder="e.g. GTS003" value={user.employeeId} onChange={e => setUser({ ...user, employeeId: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Phone Number</label><input className="custom-input" placeholder="+91..." value={user.phoneNumber} onChange={e => setUser({ ...user, phoneNumber: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Date of Birth</label><input type="date" className="custom-input" value={user.dateOfBirth} onChange={e => setUser({ ...user, dateOfBirth: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Blood Group</label><input className="custom-input" placeholder="e.g. B+" value={user.bloodGroup} onChange={e => setUser({ ...user, bloodGroup: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Joining Date *</label><input type="date" required className="custom-input" value={user.joiningDate} onChange={e => setUser({ ...user, joiningDate: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Aadhaar Number</label><input className="custom-input" value={user.aadhaar} onChange={e => setUser({ ...user, aadhaar: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Emergency Contact Phone</label><input className="custom-input" value={user.emergencyContact} onChange={e => setUser({ ...user, emergencyContact: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Emergency Contact Name</label><input className="custom-input" value={user.emergencyContactName} onChange={e => setUser({ ...user, emergencyContactName: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Emergency Contact Relationship</label><input className="custom-input" placeholder="e.g. Parent" value={user.emergencyContactRelation} onChange={e => setUser({ ...user, emergencyContactRelation: e.target.value })} /></div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="input-label">Current Address</label><input className="custom-input" value={user.currentAddress} onChange={e => setUser({ ...user, currentAddress: e.target.value })} /></div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="input-label">Permanent Address</label><input className="custom-input" value={user.permanentAddress} onChange={e => setUser({ ...user, permanentAddress: e.target.value })} /></div>
                    </div>

                    <h3 className="section-title border-bottom pb-10"><FontAwesomeIcon icon={faBriefcase} className="mr-5 text-muted"/> Job & Organization</h3>
                    <div className="form-grid mt-15 mb-30" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                        <div className="form-group"><label className="input-label">Job Title</label><input className="custom-input" placeholder="e.g. Data Entry Operator" value={user.jobTitle} onChange={e => setUser({ ...user, jobTitle: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Department / Business Unit</label><input className="custom-input" placeholder="e.g. Data Operations" value={user.department} onChange={e => setUser({ ...user, department: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Work Location</label><select className="swal2-select custom-input" value={user.workLocation} onChange={e => setUser({ ...user, workLocation: e.target.value })}><option value="WFO">WFO (Work From Office)</option><option value="WFH">WFH (Work From Home)</option><option value="HYBRID">Hybrid</option></select></div>
                        <div className="form-group"><label className="input-label">Employment Type</label><select className="swal2-select custom-input" value={user.employmentType} onChange={e => setUser({ ...user, employmentType: e.target.value })}><option value="Full-time">Full-time</option><option value="Internship">Internship</option><option value="Part-time">Part-time</option><option value="Contract">Contract</option></select></div>
                    </div>

                    <h3 className="section-title border-bottom pb-10"><FontAwesomeIcon icon={faCog} className="mr-5 text-muted"/> System Configuration</h3>
                    <div className="form-grid mt-15 mb-30" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                        <div className="form-group">
                            <label className="input-label">System Role *</label>
                            <select className="swal2-select custom-input" value={user.role} onChange={e => setUser({ ...user, role: e.target.value })}>
                                <option value="EMPLOYEE">Employee</option>
                                <option value="MANAGER">Manager</option>
                                <option value="ACCOUNTS">Accounts</option>
                                <option value="HR">HR</option>
                                <option value="ADMIN">Admin</option>
                            </select>
                        </div>
                        <div className="form-group"><label className="input-label">Shift Timing *</label><select className="swal2-select custom-input" value={user.shiftType} onChange={e => setUser({ ...user, shiftType: e.target.value })}><option value="DAY">Day Shift</option><option value="NIGHT">Night Shift</option></select></div>
                        <div className="form-group"><label className="input-label">Account Status *</label><select className="swal2-select custom-input" value={user.status} onChange={e => setUser({ ...user, status: e.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
                        <div className="form-group"><label className="input-label">Reporting Manager Name</label><input className="custom-input" placeholder="Manager's Full Name" value={user.reportingManagerName} onChange={e => setUser({ ...user, reportingManagerName: e.target.value })} /></div>
                        <div className="form-group"><label className="input-label">Reporting Manager Email</label><input type="email" className="custom-input" placeholder="manager@gts.ai" value={user.reportingManagerEmail} onChange={e => setUser({ ...user, reportingManagerEmail: e.target.value })} /></div>
                        <div className="form-group checkbox-container" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' }}><label className="checkbox-label" style={{ fontWeight: '600', color: '#0f172a', margin: 0 }}><input type="checkbox" className="custom-checkbox" checked={user.isPurchaser} onChange={e => setUser({ ...user, isPurchaser: e.target.checked })} />Grant Purchaser Access</label></div>
                    </div>

                    <h3 className="section-title border-bottom pb-10"><FontAwesomeIcon icon={faMoneyBillWave} className="mr-5 text-muted"/> Payroll</h3>
                    <div className="form-grid mt-15" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                        <div className="form-group"><label className="input-label">Salary (Monthly) (₹)</label><input type="number" className="custom-input" placeholder="Enter amount" value={user.salary} onChange={e => setUser({ ...user, salary: e.target.value ? Number(e.target.value) : '' })} /></div>
                    </div>

                    <div className="border-top pt-20 mt-30" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" className="gts-btn primary btn-large" disabled={loading}>
                            <FontAwesomeIcon icon={faSave} className="btn-icon" /> {loading ? 'Registering...' : 'Register Employee'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddEmployee;