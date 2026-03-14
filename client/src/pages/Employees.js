import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api'; 
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faUserTie, faEdit, faCalendarAlt, faSearch } from '@fortawesome/free-solid-svg-icons'; // <-- Added faSearch

const Employees = () => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState(''); // <-- Added search state
    const navigate = useNavigate();

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
        const { value: formValues } = await Swal.fire({
            title: 'Register New Employee',
            html: `
                <div style="text-align: left; padding: 0 10px;">
                    <label class="swal-custom-label">Full Name</label>
                    <input id="add-name" class="swal2-input" placeholder="Harshit">
                    
                    <label class="swal-custom-label">Work Email</label>
                    <input id="add-email" class="swal2-input" placeholder="harshit@gts.ai">

                    <label class="swal-custom-label">Employee / Biometric ID</label>
                    <input id="add-emp-id" class="swal2-input" placeholder="e.g. GTS003">
                    
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
                    employeeId: document.getElementById('add-emp-id').value,
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

    const handleEditEmployee = (emp) => {
        navigate(`/employee/${emp._id}`);
    };

    // --- SORTING & FILTERING LOGIC ---
    const processedEmployees = employees
        // 1. Sort by Employee ID Ascending
        .sort((a, b) => {
            const idA = a.employeeId || '';
            const idB = b.employeeId || '';
            return idA.localeCompare(idB);
        })
        // 2. Filter by Search Term
        .filter(emp => {
            if (!searchTerm) return true;
            const term = searchTerm.toLowerCase();
            return (
                (emp.name && emp.name.toLowerCase().includes(term)) ||
                (emp.email && emp.email.toLowerCase().includes(term)) ||
                (emp.employeeId && emp.employeeId.toLowerCase().includes(term))
            );
        });

    return (
        <div className="employee-page">
            {/* Header Area with Search & Add Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
                <h1 className="page-title" style={{ margin: 0 }}>Employee Directory</h1>
                
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Search Bar */}
                    <div style={{ position: 'relative', minWidth: '250px' }}>
                        <FontAwesomeIcon 
                            icon={faSearch} 
                            style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} 
                        />
                        <input
                            type="text"
                            placeholder="Search by name, email, or ID..."
                            className="swal2-input"
                            style={{ margin: 0, paddingLeft: '40px', width: '100%', height: '40px', fontSize: '14px' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <button className="action-btn-primary" onClick={handleAddEmployee} style={{ whiteSpace: 'nowrap' }}>
                        <FontAwesomeIcon icon={faPlus} style={{ marginRight: '5px' }} /> Add Employee
                    </button>
                </div>
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
                            {processedEmployees.length === 0 ? (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#999' }}>
                                        No employees found matching your search.
                                    </td>
                                </tr>
                            ) : (
                                processedEmployees.map(emp => (
                                    <tr key={emp._id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div className="table-avatar">
                                                    <FontAwesomeIcon icon={faUserTie} />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: '600', color: '#1e293b' }}>{emp.name}</div>
                                                    <div style={{ fontSize: '12px', color: '#7A7A7A' }}>
                                                        <span style={{ fontWeight: 'bold', color: '#215D7B' }}>{emp.employeeId || 'No ID'}</span> • {emp.email}
                                                    </div>
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
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default Employees;