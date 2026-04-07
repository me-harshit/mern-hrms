import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faUserTie, faEdit, faCalendarAlt, faSearch, faSun, faMoon, faEye } from '@fortawesome/free-solid-svg-icons';
import Pagination from '../../components/Pagination'; 
import '../../styles/App.css';

const Employees = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user'));
    const userRole = currentUser?.role || 'EMPLOYEE';

    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch]);

    useEffect(() => {
        fetchEmployees(currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, itemsPerPage, debouncedSearch]);

    const fetchEmployees = async (pageToFetch) => {
        setLoading(true);
        try {
            const params = {
                page: pageToFetch,
                limit: itemsPerPage,
                search: debouncedSearch
            };

            const res = await api.get('/employees', { params });
            
            setEmployees(res.data.data);
            setTotalPages(res.data.pagination.totalPages);
            setTotalRecords(res.data.pagination.totalRecords);
            setCurrentPage(res.data.pagination.currentPage);
        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'Failed to fetch employees', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleViewProfile = (id) => navigate(`/employee/${id}`);
    const handleEditEmployee = (id) => navigate(`/edit-employee/${id}`);

    return (
        <div className="employee-page fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
                <h1 className="page-title" style={{ margin: 0 }}>
                    {userRole === 'MANAGER' ? 'My Team Directory' : 'Employee Directory'}
                </h1>

                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', minWidth: '250px' }}>
                        <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
                        <input 
                            type="text" 
                            placeholder="Search name, ID or email..." 
                            className="swal2-input" 
                            style={{ margin: 0, paddingLeft: '40px', width: '100%', height: '40px', fontSize: '14px' }} 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                        />
                    </div>

                    {userRole === 'ADMIN' && (
                        // 👇 UPDATED: Now navigates to the new Add Employee page
                        <button className="action-btn-primary" onClick={() => navigate('/add-employee')} style={{ whiteSpace: 'nowrap' }}>
                            <FontAwesomeIcon icon={faPlus} style={{ marginRight: '5px' }} /> Add Employee
                        </button>
                    )}
                </div>
            </div>

            <div className="employee-table-container fade-in">
                <table className="employee-table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Joining Date</th>
                            <th>Role / Shift</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="5" className="empty-table-message">
                                    Loading employee records...
                                </td>
                            </tr>
                        ) : employees.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="empty-table-message">
                                    No employees found matching your search.
                                </td>
                            </tr>
                        ) : (
                            employees.map(emp => (
                                <tr key={emp._id}>
                                    <td data-label="Employee">
                                        <div className="flex-row gap-10">
                                            <div className="table-avatar">
                                                <FontAwesomeIcon icon={faUserTie} />
                                            </div>
                                            <div>
                                                <div 
                                                    className="fw-600 text-dark-blue" 
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => handleViewProfile(emp._id)}
                                                >
                                                    {emp.name}
                                                </div>
                                                <div className="text-small text-muted">
                                                    <span className="fw-bold text-primary">{emp.employeeId || 'No ID'}</span> • {emp.email}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    <td data-label="Joining Date">
                                        <div className="fs-14 text-dark-gray">
                                            <FontAwesomeIcon icon={faCalendarAlt} className="text-muted mr-5" />
                                            {emp.joiningDate ? new Date(emp.joiningDate).toLocaleDateString('en-GB') : 'N/A'}
                                        </div>
                                    </td>

                                    <td data-label="Role / Shift">
                                        <div className="flex-col align-start gap-5">
                                            <span className={`role-tag ${emp.role.toLowerCase()}`}>
                                                {emp.role}
                                            </span>
                                            <span className="shift-badge">
                                                {emp.shiftType === 'NIGHT' ? (
                                                    <><FontAwesomeIcon icon={faMoon} className="text-moon mr-5" /> Night Shift</>
                                                ) : (
                                                    <><FontAwesomeIcon icon={faSun} className="text-sun mr-5" /> Day Shift</>
                                                )}
                                            </span>
                                        </div>
                                    </td>

                                    <td data-label="Status">
                                        <span className={emp.status === 'ACTIVE' ? 'status-active' : 'status-inactive'}>
                                            {emp.status}
                                        </span>
                                    </td>

                                    <td data-label="Actions">
                                        <div className="flex-row gap-5">
                                            <button 
                                                className="gts-btn doc-btn" 
                                                style={{ padding: '6px 10px', background: '#f1f5f9', color: '#215D7B' }} 
                                                onClick={() => handleViewProfile(emp._id)}
                                                title="View Profile"
                                            >
                                                <FontAwesomeIcon icon={faEye} /> View
                                            </button>
                                            <button 
                                                className="edit-btn" 
                                                onClick={() => handleEditEmployee(emp._id)}
                                                title="Edit Settings"
                                            >
                                                <FontAwesomeIcon icon={faEdit} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {!loading && (
                <Pagination 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalRecords={totalRecords}
                    limit={itemsPerPage}
                    onPageChange={(page) => setCurrentPage(page)}
                    onLimitChange={(newLimit) => {
                        setItemsPerPage(newLimit);
                        setCurrentPage(1);
                    }}
                />
            )}
        </div>
    );
};

export default Employees;