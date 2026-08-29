import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalculator, faCheck, faFileInvoiceDollar, faSearch, faEye, faEnvelope, faTimes, faInbox } from '@fortawesome/free-solid-svg-icons';
import '../../styles/App.css';
import EmployeeAvatar from '../../components/EmployeeAvatar';

const Payroll = () => {
    const user = JSON.parse(localStorage.getItem('user'));
    const userRole = user?.role || 'EMPLOYEE';
    // Must stay in sync with SALARY_ROLES in server/utils/permissions.js —
    // anyone not listed here gets the personal "My Payroll" view instead.
    const isManagement = ['ADMIN', 'HR'].includes(userRole);

    // --- ADMIN / HR STATE ---
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [payrollData, setPayrollData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [daysInMonth, setDaysInMonth] = useState(0);
    const [finalizedUsers, setFinalizedUsers] = useState([]); // Array of finalized user IDs

    // --- EMPLOYEE STATE ---
    const [myPayslips, setMyPayslips] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(true);

    // --- ADMIN/HR: PAYSLIP EMAIL REQUEST QUEUE ---
    const [payslipRequests, setPayslipRequests] = useState([]);
    const [actioningId, setActioningId] = useState(null);
    // Which of the two sections is open: 'calculate' | 'requests'
    const [activeSection, setActiveSection] = useState('calculate');

    // Only 'Pending' rows drive the indicator, so the light goes out as soon
    // as the queue is cleared.
    const pendingCount = payslipRequests.filter(r => r.request?.status === 'Pending').length;

    useEffect(() => {
        if (!isManagement) {
            fetchMyPayslips();
            return;
        }
        fetchPayslipRequests();
        // Requests arrive while HR is already on the page, so poll rather than
        // relying on a reload to surface them.
        const poll = setInterval(fetchPayslipRequests, 60000);
        return () => clearInterval(poll);
    }, [isManagement]);

    const fetchMyPayslips = async () => {
        try {
            setHistoryLoading(true);
            const res = await api.get('/payroll/history');
            setMyPayslips(res.data.data);
        } catch (err) {
            console.error("Failed to fetch payslips", err);
        } finally {
            setHistoryLoading(false);
        }
    };

    const fetchPayslipRequests = async () => {
        try {
            const res = await api.get('/payroll/requests');
            setPayslipRequests(res.data.data);
        } catch (err) {
            console.error("Failed to fetch payslip requests", err);
        }
    };

    // --- ADMIN/HR: APPROVE (emails the slip) OR REJECT A REQUEST ---
    const handleRequestAction = async (slip, action) => {
        const period = new Date(slip.year, slip.month - 1).toLocaleString('en', { month: 'long', year: 'numeric' });
        const target = slip.userId?.workEmail || slip.userId?.email;

        let reason = '';
        if (action === 'reject') {
            const { value, isConfirmed } = await Swal.fire({
                title: 'Decline Request?',
                input: 'text',
                inputLabel: `Reason (optional) — shown to ${slip.userId?.name}`,
                inputPlaceholder: 'e.g. Contact HR directly for this month',
                showCancelButton: true,
                confirmButtonColor: '#dc2626',
                confirmButtonText: 'Decline'
            });
            if (!isConfirmed) return;
            reason = value || '';
        } else {
            const { isConfirmed } = await Swal.fire({
                title: 'Send Payslip?',
                html: `Email the <strong>${period}</strong> payslip to <strong>${slip.userId?.name}</strong> at <strong>${target}</strong>?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#215D7B',
                confirmButtonText: 'Approve & Send'
            });
            if (!isConfirmed) return;
        }

        setActioningId(slip._id);
        try {
            const res = await api.post('/payroll/request/action', { payslipId: slip._id, action, reason });
            Swal.fire('Done', res.data.message, 'success');
            fetchPayslipRequests();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Action failed', 'error');
        } finally {
            setActioningId(null);
        }
    };

    // Shows where an email request currently stands, for both the employee
    // table and the HR queue.
    const renderRequestState = (request) => {
        const status = request?.status;
        if (!status || status === 'None') return <span className="text-muted">—</span>;

        if (status === 'Pending') {
            return <span className="status-badge warning">Pending with HR</span>;
        }
        if (status === 'Rejected') {
            return (
                <div>
                    <span className="status-badge danger">Declined</span>
                    {request.rejectionReason && (
                        <div className="text-small text-muted" style={{ marginTop: '4px' }}>{request.rejectionReason}</div>
                    )}
                </div>
            );
        }
        return (
            <div>
                <span className="status-badge success">Emailed</span>
                {request.emailedTo && (
                    <div className="text-small text-muted" style={{ marginTop: '4px' }}>
                        to {request.emailedTo}
                        {request.emailedAt ? ` on ${new Date(request.emailedAt).toLocaleDateString('en-IN')}` : ''}
                    </div>
                )}
            </div>
        );
    };

    // --- EMPLOYEE: ASK HR TO EMAIL THIS PAYSLIP ---
    const handleRequestPayslip = async (slip) => {
        const period = new Date(slip.year, slip.month - 1).toLocaleString('en', { month: 'long', year: 'numeric' });
        const confirm = await Swal.fire({
            title: 'Request Payslip?',
            html: `Ask HR to email your payslip for <strong>${period}</strong>.<br/><span class="text-muted" style="font-size:0.85rem;">It will be sent to your work email once approved.</span>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#215D7B',
            confirmButtonText: 'Send Request'
        });
        if (!confirm.isConfirmed) return;

        try {
            const res = await api.post('/payroll/request', { month: slip.month, year: slip.year });
            Swal.fire('Requested', res.data.message, 'success');
            fetchMyPayslips();
        } catch (err) {
            Swal.fire('Error', err.response?.data?.message || 'Failed to submit request', 'error');
        }
    };

    // --- ADMIN: CALCULATE SALARY ---
    const handleCalculate = async () => {
        setLoading(true);
        try {
            // Fetch calculations
            const res = await api.get('/payroll/calculate', { params: { month, year } });
            setPayrollData(res.data.data);
            setDaysInMonth(res.data.daysInMonth);
            
            // Fetch history to see who is already finalized
            const historyRes = await api.get('/payroll/history', { params: { month, year } });
            const finalizedIds = historyRes.data.data.map(slip => slip.userId?._id).filter(Boolean);
            setFinalizedUsers(finalizedIds);

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

    // --- ADMIN: REAL-TIME EDIT BREAKDOWN ---
    const handleBreakdownChange = (userId, field, value) => {
        const numValue = Math.max(0, parseFloat(value) || 0);
        setPayrollData(prevData => prevData.map(item => {
            if (item.user._id === userId) {
                const newBreakdown = { ...item.breakdown };
                
                if (field === 'unpaidAbs') {
                    newBreakdown.unpaidLeave = numValue;
                    newBreakdown.absent = 0; // We combine them here
                } else if (field === 'halfDays') {
                    newBreakdown.halfDays = numValue;
                }
                
                const unpaidAbs = (newBreakdown.absent || 0) + (newBreakdown.unpaidLeave || 0);
                const halfDayDeductions = (newBreakdown.halfDays || 0) * 0.5;
                const totalUnpaid = unpaidAbs + halfDayDeductions;
                
                let newPayableDays = daysInMonth - totalUnpaid;
                if (newPayableDays < 0) newPayableDays = 0;
                
                const newCalculatedSalary = item.baseSalary > 0 
                    ? Math.round((item.baseSalary / daysInMonth) * newPayableDays)
                    : 0;

                return {
                    ...item,
                    breakdown: newBreakdown,
                    payableDays: newPayableDays,
                    calculatedSalary: newCalculatedSalary
                };
            }
            return item;
        }));
    };

    // --- ADMIN: FINALIZE SINGLE SALARY ---
    const handleFinalizeSingle = async (employeeData) => {
        const confirm = await Swal.fire({
            title: `Finalize ${employeeData.user.name}'s Payroll?`,
            text: "This will save their payslip to the database and notify them.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#215D7B',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, Finalize!'
        });

        if (confirm.isConfirmed) {
            try {
                setLoading(true);
                await api.post('/payroll/finalize', { month, year, payrollData: [employeeData] });
                setFinalizedUsers(prev => [...prev, employeeData.user._id]);
                Swal.fire({
                    title: 'Finalized!',
                    text: `${employeeData.user.name}'s salary has been finalized.`,
                    icon: 'success',
                    toast: true,
                    position: 'top-end',
                    timer: 2000,
                    showConfirmButton: false
                });
            } catch (err) {
                Swal.fire('Error', 'Failed to finalize payroll', 'error');
            } finally {
                setLoading(false);
            }
        }
    };

    // --- ADMIN: REVERT SINGLE SALARY ---
    const handleRevertSingle = async (employeeData) => {
        const confirm = await Swal.fire({
            title: `Revert ${employeeData.user.name}'s Payroll?`,
            text: "This will delete their generated payslip for this month.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, Revert it!'
        });

        if (confirm.isConfirmed) {
            try {
                setLoading(true);
                await api.post('/payroll/revert', { month, year, userId: employeeData.user._id });
                setFinalizedUsers(prev => prev.filter(id => id !== employeeData.user._id));
                Swal.fire({
                    title: 'Reverted!',
                    text: `${employeeData.user.name}'s salary has been reverted.`,
                    icon: 'info',
                    toast: true,
                    position: 'top-end',
                    timer: 2000,
                    showConfirmButton: false
                });
            } catch (err) {
                Swal.fire('Error', 'Failed to revert payroll', 'error');
            } finally {
                setLoading(false);
            }
        }
    };

    // --- VIEW / PRINT PAYSLIP MODAL ---
    const handleViewPayslip = (payslip) => {
        const monthName = new Date(payslip.year, payslip.month - 1).toLocaleString('en', { month: 'long', year: 'numeric' });
        
        // Handle both Admin Preview (payslip.user) and Employee History (payslip.userId)
        const empName = payslip.user?.name || payslip.userId?.name || user.name;
        const empId = payslip.user?.employeeId || payslip.userId?.employeeId || user.employeeId || 'N/A';
        const empEmail = payslip.user?.email || payslip.userId?.email || user.email;

        const unpaidDeductionAmount = Math.round((payslip.baseSalary / payslip.totalWorkingDays) * ((payslip.breakdown?.absent || 0) + (payslip.breakdown?.unpaidLeave || 0) + ((payslip.breakdown?.halfDays || 0) * 0.5)));

        Swal.fire({
            title: `<strong>SALARY SLIP - ${monthName.toUpperCase()}</strong>`,
            width: '650px',
            html: `
                <div style="text-align: left; font-family: 'Poppins', sans-serif; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;">
                    
                    <!-- COMPANY HEADER -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #215D7B; padding-bottom: 15px; margin-bottom: 15px;">
                        <div>
                            <h2 style="color: #215D7B; margin: 0; font-size: 1.4rem;">Globose Technology Solutions</h2>
                            <p style="color: #64748b; margin: 2px 0 0 0; font-size: 0.8rem;">Official Monthly Payslip</p>
                        </div>
                        <div style="text-align: right;">
                            <span style="background: #e0f2fe; color: #0284c7; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 0.8rem;">
                                ${payslip.status || 'Finalized'}
                            </span>
                        </div>
                    </div>

                    <!-- EMPLOYEE DETAILS -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f8fafc; padding: 12px; border-radius: 6px; margin-bottom: 15px; font-size: 0.85rem;">
                        <div><strong>Employee Name:</strong> ${empName}</div>
                        <div><strong>Employee ID:</strong> ${empId}</div>
                        <div><strong>Email:</strong> ${empEmail}</div>
                        <div><strong>Pay Period:</strong> ${monthName}</div>
                    </div>

                    <!-- BREAKDOWN TABLE -->
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 0.85rem;">
                        <thead>
                            <tr style="background: #215D7B; color: white;">
                                <th style="padding: 8px; text-align: left;">Earnings / Particulars</th>
                                <th style="padding: 8px; text-align: right;">Amount / Days</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 8px;">Base Monthly Salary</td>
                                <td style="padding: 8px; text-align: right; font-weight: 600;">₹${payslip.baseSalary.toLocaleString()}</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 8px;">Total Days in Month</td>
                                <td style="padding: 8px; text-align: right;">${payslip.totalWorkingDays} days</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 8px;">Unpaid Absences / Leaves</td>
                                <td style="padding: 8px; text-align: right; color: #ef4444;">-${(payslip.breakdown?.absent || 0) + (payslip.breakdown?.unpaidLeave || 0)} days</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 8px;">Half Days Count</td>
                                <td style="padding: 8px; text-align: right; color: #f59e0b;">${payslip.breakdown?.halfDays || 0} days (-${(payslip.breakdown?.halfDays || 0) * 0.5} day equiv)</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 8px;">Net Payable Days</td>
                                <td style="padding: 8px; text-align: right; font-weight: 600; color: #0284c7;">${payslip.payableDays} days</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9; background: #fff1f2;">
                                <td style="padding: 8px; color: #be123c;">Total Deductions Amount</td>
                                <td style="padding: 8px; text-align: right; font-weight: 600; color: #be123c;">-₹${unpaidDeductionAmount.toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- NET SALARY HEADER -->
                    <div style="display: flex; justify-content: space-between; align-items: center; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 12px 15px; border-radius: 6px;">
                        <span style="font-size: 1rem; font-weight: 600; color: #065f46;">Net Payable Salary:</span>
                        <span style="font-size: 1.4rem; font-weight: 700; color: #059669;">₹${payslip.calculatedSalary.toLocaleString()}</span>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#215D7B',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Print / Download',
            cancelButtonText: 'Close'
        }).then((res) => {
            if (res.isConfirmed) {
                const printContent = `
                    <html>
                        <head>
                            <title>Salary Slip - ${empName}</title>
                            <style>
                                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; max-width: 800px; margin: auto; }
                                * { box-sizing: border-box; }
                                h2 { color: #215D7B; margin: 0; font-size: 24px; text-align: center; }
                                p.subtitle { color: #64748b; margin: 5px 0 30px 0; font-size: 14px; text-align: center; }
                                table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 14px; }
                                th, td { padding: 12px; border: 1px solid #e2e8f0; }
                                th { background: #f8fafc; text-align: left; color: #475569; font-weight: 600; }
                                .right { text-align: right; }
                                .bold { font-weight: bold; }
                                .net-salary { font-size: 18px; color: #059669; }
                                @media print {
                                    body { padding: 0; }
                                }
                            </style>
                        </head>
                        <body>
                            <h2>Globose Technology Solutions</h2>
                            <p class="subtitle">Official Monthly Payslip - ${monthName}</p>
                            
                            <table>
                                <tr>
                                    <td><strong>Employee Name:</strong> ${empName}</td>
                                    <td><strong>Employee ID:</strong> ${empId}</td>
                                </tr>
                                <tr>
                                    <td><strong>Email:</strong> ${empEmail}</td>
                                    <td><strong>Pay Period:</strong> ${monthName}</td>
                                </tr>
                            </table>

                            <table>
                                <thead>
                                    <tr>
                                        <th>Earnings / Deductions</th>
                                        <th class="right">Days / Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>Base Monthly Salary</td>
                                        <td class="right">Rs. ${payslip.baseSalary.toLocaleString()}</td>
                                    </tr>
                                    <tr>
                                        <td>Total Days in Month</td>
                                        <td class="right">${payslip.totalWorkingDays}</td>
                                    </tr>
                                    <tr>
                                        <td>Unpaid Absences / Leaves</td>
                                        <td class="right">${(payslip.breakdown?.absent || 0) + (payslip.breakdown?.unpaidLeave || 0)}</td>
                                    </tr>
                                    <tr>
                                        <td>Half Days Deductions</td>
                                        <td class="right">${(payslip.breakdown?.halfDays || 0) * 0.5} (from ${payslip.breakdown?.halfDays || 0} half-days)</td>
                                    </tr>
                                    <tr>
                                        <td class="bold">Net Payable Days</td>
                                        <td class="right bold">${payslip.payableDays}</td>
                                    </tr>
                                    <tr>
                                        <td class="bold net-salary">Net Payable Salary</td>
                                        <td class="right bold net-salary">Rs. ${payslip.calculatedSalary.toLocaleString()}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <p style="text-align: center; margin-top: 40px; font-size: 12px; color: #94a3b8;">
                                This is a system generated payslip and does not require a signature.
                            </p>
                        </body>
                    </html>
                `;
                const printWindow = window.open('', '', 'width=800,height=800');
                printWindow.document.write(printContent);
                printWindow.document.close();
                printWindow.focus();
                
                // Slight delay ensures the DOM is fully loaded and styles are applied before print triggers
                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                }, 250);
            }
        });
    };

    const filteredData = payrollData.filter(d => 
        d.user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (d.user.employeeId && d.user.employeeId.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // ==========================================
    // EMPLOYEE VIEW (My Payroll / Payslips)
    // ==========================================
    if (!isManagement) {
        return (
            <div className="attendance-container fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h1 className="page-title header-no-margin">My Payroll & Payslips</h1>
                </div>

                {historyLoading ? (
                    <div>Loading your payslips...</div>
                ) : myPayslips.length === 0 ? (
                    <div className="control-card text-center" style={{ padding: '40px' }}>
                        <FontAwesomeIcon icon={faFileInvoiceDollar} style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '15px' }} />
                        <h3>No Payslips Found</h3>
                        <p className="text-muted">Your monthly salary slips will appear here once finalized by HR.</p>
                    </div>
                ) : (
                    <div className="employee-table-container fade-in">
                        <table className="employee-table">
                            <thead>
                                <tr>
                                    <th>Pay Period</th>
                                    <th>Base Salary</th>
                                    <th>Payable Days</th>
                                    <th>Net Salary</th>
                                    <th>Status</th>
                                    <th>Email Request</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {myPayslips.map(slip => (
                                    <tr key={slip._id}>
                                        <td data-label="Pay Period" className="fw-bold text-primary">
                                            {new Date(slip.year, slip.month - 1).toLocaleString('en', { month: 'long', year: 'numeric' })}
                                        </td>
                                        <td data-label="Base Salary" className="fw-600">
                                            ₹{slip.baseSalary.toLocaleString()}
                                        </td>
                                        <td data-label="Payable Days" className="fw-500">
                                            {slip.payableDays} / {slip.totalWorkingDays} days
                                        </td>
                                        <td data-label="Net Salary" className="text-success fw-bold" style={{ fontSize: '1.05rem' }}>
                                            ₹{slip.calculatedSalary.toLocaleString()}
                                        </td>
                                        <td data-label="Status">
                                            <span className="status-badge success">{slip.status || 'Finalized'}</span>
                                        </td>
                                        <td data-label="Email Request">
                                            {renderRequestState(slip.request)}
                                        </td>
                                        <td data-label="Action">
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                <button
                                                    className="gts-btn"
                                                    style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                                    onClick={() => handleViewPayslip(slip)}
                                                >
                                                    <FontAwesomeIcon icon={faEye} style={{ marginRight: '5px' }} /> View / Print
                                                </button>
                                                <button
                                                    className="gts-btn primary"
                                                    style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                                    disabled={slip.request?.status === 'Pending'}
                                                    onClick={() => handleRequestPayslip(slip)}
                                                >
                                                    <FontAwesomeIcon icon={faEnvelope} style={{ marginRight: '5px' }} />
                                                    {slip.request?.status === 'Pending' ? 'Requested' : 'Request by Email'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    // ==========================================
    // ADMIN / HR VIEW (Manage & Finalize Payroll)
    // ==========================================
    return (
        <div className="attendance-container fade-in">
            <h1 className="page-title header-no-margin mb-20">Payroll Management</h1>

            {/* --- SECTION SWITCHER --- */}
            <div className="payroll-tabs">
                <button
                    className={`payroll-tab ${activeSection === 'calculate' ? 'active' : ''}`}
                    onClick={() => setActiveSection('calculate')}
                >
                    <FontAwesomeIcon icon={faCalculator} style={{ marginRight: '8px' }} />
                    Calculate Payroll
                </button>

                <button
                    className={`payroll-tab ${activeSection === 'requests' ? 'active' : ''}`}
                    onClick={() => setActiveSection('requests')}
                >
                    <FontAwesomeIcon icon={faInbox} style={{ marginRight: '8px' }} />
                    Payslip Requests
                    {/* Breathing dot + count only while something is actually waiting */}
                    {pendingCount > 0 && (
                        <span className="payroll-tab-badge">
                            <span className="payroll-pulse-dot" aria-hidden="true" />
                            {pendingCount}
                        </span>
                    )}
                </button>
            </div>

            {/* ================= SECTION 2: PAYSLIP REQUESTS ================= */}
            {activeSection === 'requests' && (
                payslipRequests.length === 0 ? (
                    <div className="control-card text-center fade-in" style={{ padding: '40px' }}>
                        <FontAwesomeIcon icon={faInbox} style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '15px' }} />
                        <h3>No Pending Requests</h3>
                        <p className="text-muted">
                            When an employee asks for a payslip by email, it will appear here for you to approve.
                        </p>
                    </div>
                ) : (
                    <div className="control-card fade-in" style={{ padding: '20px', borderLeft: '4px solid #f59e0b' }}>
                        <h3 className="section-title" style={{ marginTop: 0, marginBottom: '15px', fontSize: '1.05rem' }}>
                            <FontAwesomeIcon icon={faInbox} className="mr-10 text-primary" />
                            Awaiting Approval
                            <span className="status-badge warning" style={{ marginLeft: '10px' }}>{payslipRequests.length}</span>
                        </h3>

                        <div className="employee-table-container">
                            <table className="employee-table">
                                <thead>
                                    <tr>
                                        <th>Employee</th>
                                        <th>Pay Period</th>
                                        <th>Send To</th>
                                        <th>Requested</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payslipRequests.map(slip => (
                                        <tr key={slip._id}>
                                            <td data-label="Employee" className="fw-600">
                                                <div className="flex-row gap-10">
                                                    <EmployeeAvatar person={slip.userId} />
                                                    <div>
                                                        {slip.userId?.name || 'Unknown'}
                                                        <div className="text-small text-muted">{slip.userId?.employeeId || '—'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td data-label="Pay Period" className="fw-bold text-primary">
                                                {new Date(slip.year, slip.month - 1).toLocaleString('en', { month: 'long', year: 'numeric' })}
                                            </td>
                                            <td data-label="Send To" className="text-small">
                                                {slip.userId?.workEmail || slip.userId?.email || <span className="text-danger">No email on file</span>}
                                            </td>
                                            <td data-label="Requested" className="text-small text-muted">
                                                {slip.request?.requestedAt ? new Date(slip.request.requestedAt).toLocaleDateString('en-IN') : '—'}
                                            </td>
                                            <td data-label="Action">
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    <button
                                                        className="gts-btn primary"
                                                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                                        disabled={actioningId === slip._id}
                                                        onClick={() => handleRequestAction(slip, 'approve')}
                                                    >
                                                        <FontAwesomeIcon icon={faCheck} style={{ marginRight: '5px' }} />
                                                        {actioningId === slip._id ? 'Sending...' : 'Approve & Send'}
                                                    </button>
                                                    <button
                                                        className="gts-btn danger"
                                                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                                        disabled={actioningId === slip._id}
                                                        onClick={() => handleRequestAction(slip, 'reject')}
                                                    >
                                                        <FontAwesomeIcon icon={faTimes} style={{ marginRight: '5px' }} /> Decline
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            )}

            {/* ================= SECTION 1: CALCULATE PAYROLL ================= */}
            {activeSection === 'calculate' && (
            <>
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
                            {/* Global finalize button removed in favor of row-level actions */}
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
                                <th>Action</th>
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
                                        {data.breakdown.present} / {(data.breakdown.onLeave || 0) + (data.breakdown.wfh || 0)}
                                    </td>
                                    <td data-label="Unpaid (Abs + UL)">
                                        <input 
                                            type="number"
                                            min="0"
                                            step="0.5"
                                            style={{ width: '70px', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 'bold' }}
                                            value={(data.breakdown.absent || 0) + (data.breakdown.unpaidLeave || 0)}
                                            onChange={(e) => handleBreakdownChange(data.user._id, 'unpaidAbs', e.target.value)}
                                        />
                                    </td>
                                    <td data-label="Half Days">
                                        <input 
                                            type="number"
                                            min="0"
                                            step="1"
                                            style={{ width: '70px', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 'bold' }}
                                            value={data.breakdown.halfDays || 0}
                                            onChange={(e) => handleBreakdownChange(data.user._id, 'halfDays', e.target.value)}
                                        />
                                    </td>
                                    <td data-label="Payable Days" className="text-primary fw-bold">
                                        {data.payableDays}
                                    </td>
                                    <td data-label="Final Salary" className="text-success fw-bold" style={{ fontSize: '1.1rem' }}>
                                        ₹{data.calculatedSalary.toLocaleString()}
                                    </td>
                                    <td data-label="Action" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                        <button 
                                            className="gts-btn primary" 
                                            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                                            onClick={() => handleViewPayslip({
                                                ...data,
                                                month,
                                                year,
                                                totalWorkingDays: daysInMonth
                                            })}
                                        >
                                            <FontAwesomeIcon icon={faEye} /> Preview
                                        </button>

                                        {finalizedUsers.includes(data.user._id) ? (
                                            <button 
                                                className="gts-btn danger" 
                                                style={{ padding: '2px 8px', fontSize: '0.75rem', background: '#dc3545' }}
                                                onClick={() => handleRevertSingle(data)}
                                                disabled={loading}
                                            >
                                                <i className="fa fa-undo" style={{ marginRight: '4px' }}></i> Revert
                                            </button>
                                        ) : (
                                            <button 
                                                className="gts-btn success" 
                                                style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                                                onClick={() => handleFinalizeSingle({
                                                    ...data,
                                                    month,
                                                    year,
                                                    totalWorkingDays: daysInMonth
                                                })}
                                                disabled={loading}
                                            >
                                                <FontAwesomeIcon icon={faCheck} style={{ marginRight: '4px' }} /> Finalize
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            </>
            )}
        </div>
    );
};

export default Payroll;
