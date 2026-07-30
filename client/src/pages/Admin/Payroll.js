import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalculator, faCheck, faDownload, faFileInvoiceDollar, faSearch } from '@fortawesome/free-solid-svg-icons';
import '../../styles/App.css';

const Payroll = () => {
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [payrollData, setPayrollData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [daysInMonth, setDaysInMonth] = useState(0);

    const handleCalculate = async () => {
        setLoading(true);
        try {
            const res = await api.get('/payroll/calculate', { params: { month, year } });
            setPayrollData(res.data.data);
            setDaysInMonth(res.data.daysInMonth);
            Swal.fire({
                title: 'Calculated successfully',
                text: `Processed salary for ${res.data.data.length} employees.`,
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (err) {
            Swal.fire('Error', 'Failed to calculate payroll', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleFinalize = async () => {
        const confirm = await Swal.fire({
            title: 'Finalize Payroll?',
            text: "This will save the generated payslips to the database for this month. Employees will be able to view them.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#215D7B',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, Finalize it!'
        });

        if (confirm.isConfirmed) {
            try {
                setLoading(true);
                await api.post('/payroll/finalize', { month, year, payrollData });
                Swal.fire('Finalized!', 'Payroll has been saved.', 'success');
            } catch (err) {
                Swal.fire('Error', 'Failed to finalize payroll', 'error');
            } finally {
                setLoading(false);
            }
        }
    };

    const filteredData = payrollData.filter(d => 
        d.user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (d.user.employeeId && d.user.employeeId.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="attendance-container fade-in">
            <h1 className="page-title header-no-margin mb-20">Payroll Management</h1>
            
            <div className="filter-bar-card fade-in" style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <label className="fw-600 text-dark-gray">Month:</label>
                    <select className="swal2-input" style={{ width: '150px', height: '40px', padding: '0 10px' }} value={month} onChange={e => setMonth(e.target.value)}>
                        {Array.from({ length: 12 }, (_, i) => (
                            <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('en', { month: 'long' })}</option>
                        ))}
                    </select>

                    <label className="fw-600 text-dark-gray ml-10">Year:</label>
                    <input type="number" className="swal2-input" style={{ width: '100px', height: '40px', padding: '0 10px' }} value={year} onChange={e => setYear(e.target.value)} />
                    
                    <button className="gts-btn primary" onClick={handleCalculate} disabled={loading} style={{ height: '40px' }}>
                        <FontAwesomeIcon icon={faCalculator} style={{ marginRight: '8px' }} />
                        {loading ? 'Calculating...' : 'Calculate Salary'}
                    </button>
                </div>
            </div>

            {payrollData.length > 0 && (
                <div className="employee-table-container fade-in" style={{ marginTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <div>
                            <h3 className="table-header-title" style={{ margin: 0 }}>
                                <FontAwesomeIcon icon={faFileInvoiceDollar} className="table-header-icon" /> 
                                Preview: {new Date(year, month - 1).toLocaleString('en', { month: 'long', year: 'numeric' })}
                            </h3>
                            <span className="text-small text-muted">Total Working Days: {daysInMonth}</span>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div className="search-wrapper" style={{ margin: 0, width: '250px' }}>
                                <FontAwesomeIcon icon={faSearch} className="search-icon" style={{ top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Search Employee..."
                                    className="swal2-input search-input"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{ height: '36px' }}
                                />
                            </div>
                            <button className="gts-btn success" onClick={handleFinalize} disabled={loading}>
                                <FontAwesomeIcon icon={faCheck} style={{ marginRight: '8px' }} />
                                Finalize & Save
                            </button>
                        </div>
                    </div>

                    <table className="employee-table">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Base Salary</th>
                                <th>Present / Paid Leave</th>
                                <th>Unpaid (Abs + UL)</th>
                                <th>Half Days</th>
                                <th>Payable Days</th>
                                <th>Final Salary</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.map(data => (
                                <tr key={data.user._id}>
                                    <td data-label="Employee" className="fw-bold text-primary">
                                        {data.user.name}
                                        <div className="text-small text-muted fw-400">{data.user.employeeId}</div>
                                    </td>
                                    <td data-label="Base Salary" className="fw-600">
                                        ₹{data.baseSalary.toLocaleString()}
                                    </td>
                                    <td data-label="Present / Paid Leave" className="text-success fw-500">
                                        {data.breakdown.present} / {data.breakdown.onLeave + data.breakdown.wfh}
                                    </td>
                                    <td data-label="Unpaid (Abs + UL)">
                                        {(data.breakdown.absent + (data.breakdown.unpaidLeave || 0)) > 0 ? (
                                            <span className="status-badge danger">{data.breakdown.absent + (data.breakdown.unpaidLeave || 0)}</span>
                                        ) : '0'}
                                    </td>
                                    <td data-label="Half Days">
                                        {data.breakdown.halfDays > 0 ? (
                                            <span className="status-badge warning">{data.breakdown.halfDays}</span>
                                        ) : '0'}
                                    </td>
                                    <td data-label="Payable Days" className="text-primary fw-bold">
                                        {data.payableDays}
                                    </td>
                                    <td data-label="Final Salary" className="text-success fw-bold" style={{ fontSize: '1.1rem' }}>
                                        ₹{data.calculatedSalary.toLocaleString()}
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

export default Payroll;
