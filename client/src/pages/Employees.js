import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // 1. Import this
import api from '../utils/api'; 
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faUserTie, faEdit, faCalendarAlt } from '@fortawesome/free-solid-svg-icons';

const Employees = () => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate(); // 2. Initialize the hook

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const res = await api.get('/employees'); 
            setEmployees(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddEmployee = async () => {
        // ... (Keep your existing Add Employee Swal logic here) ...
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
                await api.post('/employees/add', formValues);
                Swal.fire('Success', 'Employee added!', 'success');
                fetchEmployees();
            } catch (err) {
                Swal.fire('Error', err.response?.data?.message || 'Action Failed', 'error');
            }
        }
    };

    // 3. THIS IS THE EDITED FUNCTION
    // Instead of opening a modal, we just go to the new profile page
    const handleEditEmployee = (emp) => {
        navigate(`/employee/${emp._id}`);
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