import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faUserTie, faEnvelope } from '@fortawesome/free-solid-svg-icons'; // Removed faBriefcase

const Employees = () => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true); // Now used below

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
            setLoading(false); // Stop loading regardless of success/error
        }
    };

    const handleAddEmployee = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Register New Employee',
            html: `
            <div style="text-align: left; padding: 0 10px;">
                <label style="font-size: 12px; color: #7A7A7A; font-weight: 600;">Full Name</label>
                <input id="swal-input1" class="swal2-input" placeholder="John Doe">
                
                <label style="font-size: 12px; color: #7A7A7A; font-weight: 600;">Work Email</label>
                <input id="swal-input2" class="swal2-input" placeholder="john@gts.com">
                
                <label style="font-size: 12px; color: #7A7A7A; font-weight: 600;">Temporary Password</label>
                <input id="swal-input3" type="password" class="swal2-input" placeholder="••••••••">
                
                <label style="font-size: 12px; color: #7A7A7A; font-weight: 600;">System Role</label>
                <select id="swal-input4" class="swal2-select">
                    <option value="EMPLOYEE">Employee</option>
                    <option value="HR">HR Manager</option>
                    <option value="ADMIN">Administrator</option>
                </select>
            </div>
        `,
            showCancelButton: true,
            confirmButtonText: 'Create Account',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#215D7B',
            focusConfirm: false,
            preConfirm: () => {
                const name = document.getElementById('swal-input1').value;
                const email = document.getElementById('swal-input2').value;
                const password = document.getElementById('swal-input3').value;
                const role = document.getElementById('swal-input4').value;

                if (!name || !email || !password) {
                    Swal.showValidationMessage('Please fill all fields');
                }
                return { name, email, password, role };
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
                Swal.fire('Error', err.response.data.message, 'error');
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
                                <th>Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.map(emp => (
                                <tr key={emp._id}>
                                    <td><FontAwesomeIcon icon={faUserTie} style={{ marginRight: '10px', color: '#7A7A7A' }} /> {emp.name}</td>
                                    <td><FontAwesomeIcon icon={faEnvelope} style={{ marginRight: '10px', color: '#7A7A7A' }} /> {emp.email}</td>
                                    <td><span className={`role-tag ${emp.role.toLowerCase()}`}>{emp.role}</span></td>
                                    <td><span className="status-active">Active</span></td>
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