import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faUserTie, faEdit, faCalendarAlt } from '@fortawesome/free-solid-svg-icons';

const Employees = () => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('http://localhost:5000/api/employees', {
                headers: { 'x-auth-token': token }
            });
            setEmployees(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // --- LOGIC: ADD NEW EMPLOYEE ---
    const handleAddEmployee = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Register New Employee',
            html: `
                <div style="text-align: left; padding: 0 10px;">
                    <label class="swal-custom-label">Full Name</label>
                    <input id="add-name" class="swal2-input" placeholder="Harshit">
                    
                    <label class="swal-custom-label">Work Email</label>
                    <input id="add-email" class="swal2-input" placeholder="harshit@gts.ai">
                    
                    <label class="swal-custom-label">Temporary Password</label>
                    <input id="add-password" type="password" class="swal2-input" placeholder="••••••••">

                    <label class="swal-custom-label">Joining Date</label>
                    <input id="add-date" type="date" class="swal2-input" value="${new Date().toISOString().split('T')[0]}">
                    
                    <label class="swal-custom-label">System Role</label>
                    <select id="add-role" class="swal2-select">
                        <option value="EMPLOYEE">Employee</option>
                        <option value="HR">HR Manager</option>
                        <option value="ADMIN">Administrator</option>
                    </select>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Create Account',
            confirmButtonColor: '#215D7B',
            preConfirm: () => {
                return {
                    name: document.getElementById('add-name').value,
                    email: document.getElementById('add-email').value,
                    password: document.getElementById('add-password').value,
                    joiningDate: document.getElementById('add-date').value,
                    role: document.getElementById('add-role').value,
                }
            }
        });

        if (formValues) {
            try {
                const token = localStorage.getItem('token');
                await axios.post('http://localhost:5000/api/employees/add', formValues, {
                    headers: { 'x-auth-token': token }
                });
                Swal.fire('Success', 'Employee added!', 'success');
                fetchEmployees();
            } catch (err) {
                Swal.fire('Error', err.response?.data?.message || 'Action Failed', 'error');
            }
        }
    };

    // --- LOGIC: EDIT EXISTING EMPLOYEE ---
    const handleEditEmployee = async (emp) => {
        const { value: formValues } = await Swal.fire({
            title: 'Edit Employee Details',
            html: `
            <div style="text-align: left; padding: 0 10px;">
                <label class="swal-custom-label">Full Name</label>
                <input id="edit-name" class="swal2-input" value="${emp.name}">
                
                <label class="swal-custom-label">Work Email</label>
                <input id="edit-email" class="swal2-input" value="${emp.email}">
                
                <label class="swal-custom-label">New Password (Leave blank to keep current)</label>
                <input id="edit-password" type="password" class="swal2-input" placeholder="••••••••">

                <label class="swal-custom-label">Joining Date</label>
                <input id="edit-date" type="date" class="swal2-input" value="${emp.joiningDate ? new Date(emp.joiningDate).toISOString().split('T')[0] : ''}">
                
                <div style="display: flex; gap: 10px;">
                    <div style="flex: 1;">
                        <label class="swal-custom-label">Role</label>
                        <select id="edit-role" class="swal2-select" style="width: 100%;">
                            <option value="EMPLOYEE" ${emp.role === 'EMPLOYEE' ? 'selected' : ''}>Employee</option>
                            <option value="HR" ${emp.role === 'HR' ? 'selected' : ''}>HR Manager</option>
                            <option value="ADMIN" ${emp.role === 'ADMIN' ? 'selected' : ''}>Admin</option>
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <label class="swal-custom-label">Status</label>
                        <select id="edit-status" class="swal2-select" style="width: 100%;">
                            <option value="ACTIVE" ${emp.status === 'ACTIVE' ? 'selected' : ''}>Active</option>
                            <option value="INACTIVE" ${emp.status === 'INACTIVE' ? 'selected' : ''}>Inactive</option>
                        </select>
                    </div>
                </div>
            </div>
        `,
            showCancelButton: true,
            confirmButtonText: 'Save Changes',
            confirmButtonColor: '#215D7B',
            preConfirm: () => ({
                name: document.getElementById('edit-name').value,
                email: document.getElementById('edit-email').value,
                password: document.getElementById('edit-password').value,
                joiningDate: document.getElementById('edit-date').value,
                role: document.getElementById('edit-role').value,
                status: document.getElementById('edit-status').value,
            })
        });

        if (formValues) {
            try {
                const token = localStorage.getItem('token');
                await axios.put(`http://localhost:5000/api/employees/${emp._id}`, formValues, {
                    headers: { 'x-auth-token': token }
                });
                Swal.fire('Updated!', 'Employee credentials updated.', 'success');
                fetchEmployees();
            } catch (err) {
                Swal.fire('Error', err.response?.data?.message || 'Update failed', 'error');
            }
        }
    };

    return (
        <div className="employee-page">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                <h1 className="page-title">Employee Directory</h1>
                <button className="action-btn-primary" onClick={handleAddEmployee}>
                    <FontAwesomeIcon icon={faPlus} /> Add Employee
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '50px', color: '#7A7A7A' }}>
                    <p>Loading employee records...</p>
                </div>
            ) : (
                <div className="employee-table-container">
                    <table className="employee-table">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Joining Date</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.map(emp => (
                                <tr key={emp._id}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div className="table-avatar">
                                                <FontAwesomeIcon icon={faUserTie} />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: '600', color: '#1e293b' }}>{emp.name}</div>
                                                <div style={{ fontSize: '12px', color: '#7A7A7A' }}>{emp.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ fontSize: '14px', color: '#475569' }}>
                                            <FontAwesomeIcon icon={faCalendarAlt} style={{ marginRight: '8px', color: '#cbd5e1' }} />
                                            {emp.joiningDate ? new Date(emp.joiningDate).toLocaleDateString('en-GB') : 'N/A'}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`role-tag ${emp.role.toLowerCase()}`}>
                                            {emp.role}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={emp.status === 'ACTIVE' ? 'status-active' : 'status-inactive'}>
                                            {emp.status}
                                        </span>
                                    </td>
                                    <td>
                                        <button className="edit-btn" onClick={() => handleEditEmployee(emp)}>
                                            <FontAwesomeIcon icon={faEdit} style={{ marginRight: '5px' }} /> Edit
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default Employees;