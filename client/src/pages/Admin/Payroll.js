import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalculator, faCheck, faFileInvoiceDollar, faSearch, faEye, faEnvelope, faTimes, faInbox } from '@fortawesome/free-solid-svg-icons';
import '../../styles/App.css';
import EmployeeAvatar from '../../components/EmployeeAvatar';

// Which colour a day wears in the drawer grid, keyed by attendance status.
const DAY_TONES = {
    'Present': 'present',
    'Late': 'present',
    'WFH': 'wfh',
    'Half Day': 'half',
    'On Leave': 'leave',
    'Absent': 'absent',
    'Pending': 'pending'
};

const WEEKDAY_HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const parseDayDate = (dateStr) => {
    const [d, m, y] = dateStr.split('/').map(Number);
    return new Date(y, m - 1, d);
};

const shortDate = (dateStr) =>
    parseDayDate(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

const clockTime = (value) => value
    ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    : null;

// What the employee actually did that day. Punch times say more than
// "Late by 51 min" does: you can see when they arrived and whether they ever
// punched out. Days with no punch keep the note that explains them instead.
const dayActivity = (day) => {
    const inAt = clockTime(day.checkIn);
    if (!inAt) return day.note ? [day.note] : [];

    const outAt = clockTime(day.checkOut);
    const parts = [`In ${inAt}`, `Out ${outAt || 'not punched'}`];
    if (day.totalHours) parts.push(`${day.totalHours}h`);
    return parts;
};

/**
 * One employee's month, opened from their row in the payroll table.
 *
 * The salary figure in the table is a single number; this is the working out
 * behind it. Every day of the month is on the grid — the working days, the
 * Sundays and holidays that are paid regardless, and the days off the
 * sandwich rule charged for because the employee was away on both sides.
 */
const EmployeeMonthDrawer = ({ data, month, year, calendar, standardMonthDays, onAdjust, onClose }) => {
    // Escape closes it, the way every other panel on the web does.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const b = data.breakdown || {};
    const days = data.days || [];
    const unpaidAbs = (b.absent || 0) + (b.unpaidLeave || 0);
    const halfDayDeduction = (b.halfDays || 0) * 0.5;
    const sandwich = b.sandwich || 0;
    const clAdjustment = b.clAdjustment || 0;
    const totalUnpaid = unpaidAbs + halfDayDeduction + sandwich - clAdjustment;
    const perDay = standardMonthDays > 0 ? data.baseSalary / standardMonthDays : 0;
    const monthName = new Date(year, month - 1).toLocaleString('en', { month: 'long', year: 'numeric' });

    // Week starts on Monday so the Sunday off always lands in the last column.
    const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7;

    const toneFor = (day) => {
        if (day.sandwiched) return 'sandwich';
        if (day.type === 'sunday') return 'sunday';
        if (day.type === 'holiday') return 'holiday';
        // A working day with nothing on it at all is a gap, not a normal day.
        if (!day.status) return 'norecord';
        return DAY_TONES[day.status] || 'none';
    };

    const describe = (day) => {
        const parts = [shortDate(day.date)];
        if (day.holidayName) parts.push(day.holidayName);
        else if (day.type === 'sunday') parts.push('Sunday');
        if (day.status) parts.push(day.status + (day.leaveType ? ` (${day.leaveType})` : ''));
        else if (day.type === 'working') parts.push('No record');
        if (day.derived) parts.push('Counted from the approved leave — attendance row was never created');
        if (day.sandwiched) parts.push('Charged — away on both sides');
        parts.push(...dayActivity(day));
        return parts.join(' · ');
    };

    // The days that actually cost money, so HR is not left hunting the grid.
    const costlyDays = days.filter(d =>
        d.sandwiched || d.status === 'Absent' || d.status === 'Half Day' ||
        // A split day reads "CL + UL": any unpaid part makes it costly.
        (d.status === 'On Leave' && String(d.leaveType || '').includes('UL')));
    const blankDays = days.filter(d => d.type === 'working' && !d.status);
    const maxAdjust = data.maxClAdjustment || 0;
    const holidayDays = days.filter(d => d.holidayName);

    const deduction = (label, detail, amount, days_, tone) => (
        <div className="pmd-row" key={label}>
            <div>
                <div className="pmd-row-label">{label}</div>
                {detail && <div className="pmd-row-detail">{detail}</div>}
            </div>
            <div className={`pmd-row-value ${tone || ''}`}>
                <div>{days_}</div>
                {amount !== null && <div className="pmd-row-amount">{amount}</div>}
            </div>
        </div>
    );

    return (
        <>
            <div className="pmd-backdrop" onClick={onClose} />
            <aside className="pmd-panel" role="dialog" aria-label={`${data.user.name} attendance for ${monthName}`}>
                <div className="pmd-head">
                    <div>
                        <h3>
                            <a
                                className="pmd-name-link"
                                href={`/employee/${data.user._id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Open ${data.user.name}'s profile in a new tab`}
                            >
                                {data.user.name}
                            </a>
                        </h3>
                        <div className="pmd-sub">{data.user.employeeId || 'No ID'} &middot; {monthName}</div>
                    </div>
                    <button className="pmd-close" onClick={onClose} aria-label="Close">
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                </div>

                <div className="pmd-body">
                    <div className="pmd-net">
                        <div>
                            <div className="pmd-net-label">Net Salary</div>
                            <div className="pmd-net-sub">
                                &#8377;{Math.round(perDay).toLocaleString()} / day &times; {data.payableDays} payable days
                            </div>
                        </div>
                        <div className="pmd-net-value">&#8377;{data.calculatedSalary.toLocaleString()}</div>
                    </div>

                    {calendar && (
                        <div className="pmd-makeup">
                            <strong>{calendar.daysInMonth}</strong> days ={' '}
                            <strong>{calendar.workingDays}</strong> working +{' '}
                            <strong>{calendar.sundays}</strong> Sundays +{' '}
                            <strong>{calendar.holidays}</strong> holidays
                            <div className="pmd-makeup-note">
                                Sundays and holidays are paid. Salary runs on a fixed {standardMonthDays}-day month.
                            </div>
                        </div>
                    )}

                    <div className="pmd-section">
                        <div className="pmd-section-title">The Month</div>
                        <div className="pmd-legend">
                            <span className="pmd-chip present">Present</span>
                            <span className="pmd-chip half">Half Day</span>
                            <span className="pmd-chip leave">Leave</span>
                            <span className="pmd-chip wfh">WFH</span>
                            <span className="pmd-chip absent">Absent</span>
                            <span className="pmd-chip sunday">Sunday</span>
                            <span className="pmd-chip holiday">Holiday</span>
                            <span className="pmd-chip sandwich">Sandwich</span>
                        </div>

                        <div className="pmd-grid">
                            {WEEKDAY_HEADS.map(w => <div className="pmd-dow" key={w}>{w}</div>)}
                            {Array.from({ length: firstDow }).map((_, i) => (
                                <div className="pmd-cell blank" key={`blank-${i}`} />
                            ))}
                            {days.map(day => (
                                <div className={`pmd-cell ${toneFor(day)}`} key={day.date} title={describe(day)}>
                                    <span className="pmd-cell-day">{day.date.split('/')[0]}</span>
                                    {day.holidayName && <span className="pmd-cell-mark">H</span>}
                                    {day.sandwiched && <span className="pmd-cell-dot" />}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pmd-section">
                        <div className="pmd-section-title">How the Salary Was Reached</div>
                        {deduction('Present / Late', null, null, `${b.present || 0} days`, 'good')}
                        {deduction('Paid Leave + WFH', null, null, `${(b.onLeave || 0) + (b.wfh || 0)} days`, 'good')}
                        {deduction('Unpaid (Absent + UL)', null,
                            unpaidAbs ? `-\u20B9${Math.round(perDay * unpaidAbs).toLocaleString()}` : null,
                            `-${unpaidAbs} days`, unpaidAbs ? 'bad' : 'muted')}
                        {deduction('Half Days', `${b.halfDays || 0} half-days counted at 0.5`,
                            halfDayDeduction ? `-\u20B9${Math.round(perDay * halfDayDeduction).toLocaleString()}` : null,
                            `-${halfDayDeduction} days`, halfDayDeduction ? 'warn' : 'muted')}
                        {deduction('Sandwich',
                            sandwich ? (data.sandwichDates || []).map(shortDate).join(', ') : 'No day off caught between absences',
                            sandwich ? `-\u20B9${Math.round(perDay * sandwich).toLocaleString()}` : null,
                            `-${sandwich} days`, sandwich ? 'bad' : 'muted')}
                        {clAdjustment > 0 && deduction('Casual Leave Adjustment',
                            `${clAdjustment} CL spent covering half days`,
                            `+\u20B9${Math.round(perDay * clAdjustment).toLocaleString()}`,
                            `+${clAdjustment} days`, 'good')}
                        {deduction('Payable Days', `${standardMonthDays} - ${totalUnpaid} unpaid`, null,
                            `${data.payableDays} days`, 'total')}
                    </div>

                    {(maxAdjust > 0 || clAdjustment > 0) && (
                        <div className="pmd-adjust">
                            <div className="pmd-adjust-head">Spend Casual Leave on Half Days</div>
                            <p className="pmd-adjust-text">
                                {data.clBalance} CL in balance, and {b.halfDays || 0} half day
                                {(b.halfDays || 0) === 1 ? '' : 's'} nobody applied leave for,
                                costing {halfDayDeduction} day{halfDayDeduction === 1 ? '' : 's'} of pay.
                                Up to <strong>{maxAdjust}</strong> can be covered from the balance.
                            </p>
                            <div className="pmd-adjust-controls">
                                <input
                                    type="number" min="0" step="0.5" max={maxAdjust}
                                    value={clAdjustment}
                                    onChange={(e) => onAdjust(e.target.value)}
                                    aria-label="Casual leave days to spend"
                                />
                                <button className="gts-btn primary payroll-mini" onClick={() => onAdjust(maxAdjust)}>
                                    Apply max
                                </button>
                                {clAdjustment > 0 && (
                                    <button className="gts-btn payroll-mini" onClick={() => onAdjust(0)}>Clear</button>
                                )}
                            </div>
                            <div className="pmd-adjust-note">
                                {clAdjustment > 0
                                    ? `Adds \u20B9${Math.round(perDay * clAdjustment).toLocaleString()} back. The balance drops from ${data.clBalance} to ${data.clBalance - clAdjustment} when this payslip is finalized, and returns if it is reverted.`
                                    : 'Nothing is spent until you set a figure and finalize the payslip.'}
                            </div>
                        </div>
                    )}

                    {blankDays.length > 0 && (
                        <div className="pmd-warn">
                            <strong>{blankDays.length} working day{blankDays.length === 1 ? '' : 's'} with no attendance record.</strong>
                            {' '}Nothing was charged for {blankDays.length === 1 ? 'it' : 'them'} — there is no evidence either way.
                            <div className="pmd-warn-dates">{blankDays.map(d => shortDate(d.date)).join(' · ')}</div>
                        </div>
                    )}

                    <div className="pmd-section">
                        <div className="pmd-section-title">Days That Cost Money</div>
                        {costlyDays.length === 0 ? (
                            <div className="pmd-empty">Nothing deducted this month.</div>
                        ) : costlyDays.map(day => (
                            <div className="pmd-day-line" key={day.date}>
                                <span className={`pmd-dot ${toneFor(day)}`} />
                                <span className="pmd-day-date">{shortDate(day.date)}</span>
                                <span className="pmd-day-what">
                                    {day.sandwiched
                                        ? `${day.holidayName || (day.type === 'sunday' ? 'Sunday' : 'Day off')} — charged, away on both sides`
                                        : `${day.status}${day.leaveType ? ` (${day.leaveType})` : ''}`}
                                    {!day.sandwiched && dayActivity(day).length > 0 && (
                                        <span className="pmd-day-punch">{dayActivity(day).join(' · ')}</span>
                                    )}
                                    {day.derived && <span className="pmd-derived">from leave</span>}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="pmd-section">
                        <div className="pmd-section-title">Holidays This Month</div>
                        {holidayDays.length === 0 ? (
                            <div className="pmd-empty">No holidays fell in {monthName}.</div>
                        ) : holidayDays.map(day => (
                            <div className="pmd-day-line" key={day.date}>
                                <span className={`pmd-dot ${day.type === 'sunday' ? 'sunday' : 'holiday'}`} />
                                <span className="pmd-day-date">{shortDate(day.date)}</span>
                                <span className="pmd-day-what">
                                    {day.holidayName}
                                    {day.type === 'sunday' && ' (fell on a Sunday)'}
                                    {day.status && ` — worked, marked ${day.status}`}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </aside>
        </>
    );
};

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
    // The payroll month is always 30 days: a day of salary is base/30 in
    // February and in August alike. `calendar` is the real make-up of the
    // month, shown so HR can see which days off sit inside that 30.
    const [standardMonthDays, setStandardMonthDays] = useState(30);
    const [calendar, setCalendar] = useState(null);
    // Whose month is open in the side drawer. Held as an id rather than the
    // row itself so live edits to the table flow straight through to it.
    const [detailUserId, setDetailUserId] = useState(null);
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
            setStandardMonthDays(res.data.standardMonthDays || 30);
            setCalendar(res.data.calendar || null);
            setDetailUserId(null);
            
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
                } else if (field === 'sandwich') {
                    // HR can waive a sandwich deduction from the table.
                    newBreakdown.sandwich = numValue;
                } else if (field === 'clAdjustment') {
                    newBreakdown.clAdjustment = numValue;
                }

                // Never spend more casual leave than the employee holds, nor more
                // than the half days are actually worth. Re-checked on every edit
                // because lowering the half days lowers the ceiling with it.
                const cap = Math.min(item.clBalance || 0, (newBreakdown.halfDays || 0) * 0.5);
                newBreakdown.clAdjustment = Math.min(newBreakdown.clAdjustment || 0, cap);

                const unpaidAbs = (newBreakdown.absent || 0) + (newBreakdown.unpaidLeave || 0);
                const halfDayDeductions = (newBreakdown.halfDays || 0) * 0.5;
                const totalUnpaid = unpaidAbs + halfDayDeductions + (newBreakdown.sandwich || 0)
                    - (newBreakdown.clAdjustment || 0);

                let newPayableDays = standardMonthDays - totalUnpaid;
                if (newPayableDays < 0) newPayableDays = 0;

                const newCalculatedSalary = item.baseSalary > 0
                    ? Math.round((item.baseSalary / standardMonthDays) * newPayableDays)
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

    // Everything behind one salary figure, laid out for HR to check before it
    // is committed: how the month was made up, every deduction with the days
    // it came from, and the arithmetic that produced the net amount.
    const buildFinalizeSummary = (data) => {
        const b = data.breakdown || {};
        const unpaidAbs = (b.absent || 0) + (b.unpaidLeave || 0);
        const halfDayDeduction = (b.halfDays || 0) * 0.5;
        const sandwich = b.sandwich || 0;
        const clAdjustment = b.clAdjustment || 0;
        const totalUnpaid = unpaidAbs + halfDayDeduction + sandwich - clAdjustment;
        const perDay = data.baseSalary / standardMonthDays;
        const deduction = Math.round(perDay * totalUnpaid);

        const line = (label, detail, value, color) => `
            <tr>
                <td style="padding:7px 10px;border-top:1px solid #f1f5f9;">${label}
                    ${detail ? `<div style="color:#94a3b8;font-size:0.72rem;margin-top:2px;">${detail}</div>` : ''}
                </td>
                <td style="padding:7px 10px;border-top:1px solid #f1f5f9;text-align:right;font-weight:600;white-space:nowrap;color:${color || '#334155'};">${value}</td>
            </tr>`;

        const makeup = calendar
            ? `${calendar.daysInMonth} days = ${calendar.workingDays} working + ${calendar.sundays} Sundays + ${calendar.holidays} holidays`
            : 'Calendar unavailable';
        const holidayNames = calendar && calendar.holidayList && calendar.holidayList.length
            ? calendar.holidayList.map(h => `${h.name} (${h.date})`).join(', ')
            : 'none this month';

        return `
            <div style="text-align:left;font-size:0.85rem;color:#334155;">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;margin-bottom:12px;">
                    <div style="font-weight:600;">${makeup}</div>
                    <div style="color:#64748b;font-size:0.75rem;margin-top:3px;">Holidays: ${holidayNames}</div>
                    <div style="color:#64748b;font-size:0.75rem;margin-top:3px;">
                        Sundays and holidays are paid. Salary is a fixed ${standardMonthDays}-day month,
                        so one day is Rs. ${Math.round(perDay).toLocaleString()} in every month of the year.
                    </div>
                </div>

                <table style="width:100%;border-collapse:collapse;">
                    ${line('Base Salary', null, `Rs. ${data.baseSalary.toLocaleString()}`)}
                    ${line('Present / Late', null, `${b.present || 0} days`, '#059669')}
                    ${line('Paid Leave + WFH', null, `${(b.onLeave || 0) + (b.wfh || 0)} days`, '#059669')}
                    ${line('Unpaid (Absent + UL)', null, `-${unpaidAbs} days`, unpaidAbs ? '#dc2626' : '#94a3b8')}
                    ${line('Half Days', `${b.halfDays || 0} half-days counted at 0.5`, `-${halfDayDeduction} days`, halfDayDeduction ? '#d97706' : '#94a3b8')}
                    ${line('Sandwich', sandwich ? (data.sandwichDates || []).join(', ') : 'no day off caught between absences', `-${sandwich} days`, sandwich ? '#dc2626' : '#94a3b8')}
                    ${clAdjustment ? line('Casual Leave Adjustment', `${clAdjustment} CL spent covering half days &mdash; balance drops to ${(data.clBalance || 0) - clAdjustment}`, `+${clAdjustment} days`, '#059669') : ''}
                    ${line('Total Unpaid', null, `-${totalUnpaid} days`, '#dc2626')}
                    ${line('Payable Days', `${standardMonthDays} - ${totalUnpaid}`, `${data.payableDays} days`, '#0284c7')}
                    ${line('Deduction', `Rs. ${Math.round(perDay).toLocaleString()} x ${totalUnpaid} days`, `-Rs. ${deduction.toLocaleString()}`, '#dc2626')}
                </table>

                <div style="display:flex;justify-content:space-between;align-items:center;background:#ecfdf5;border:1px solid #a7f3d0;padding:10px 12px;border-radius:6px;margin-top:12px;">
                    <span style="font-weight:600;color:#065f46;">Net Salary</span>
                    <span style="font-size:1.25rem;font-weight:700;color:#059669;">Rs. ${data.calculatedSalary.toLocaleString()}</span>
                </div>
                <p style="color:#64748b;font-size:0.75rem;margin:10px 0 0;">Saving this payslip notifies ${data.user.name}.</p>
            </div>`;
    };

    // --- ADMIN: FINALIZE SINGLE SALARY ---
    const handleFinalizeSingle = async (employeeData) => {
        const confirm = await Swal.fire({
            title: `Finalize ${employeeData.user.name}'s Payroll?`,
            html: buildFinalizeSummary(employeeData),
            width: '640px',
            showCancelButton: true,
            confirmButtonColor: '#215D7B',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, Finalize!'
        });

        if (confirm.isConfirmed) {
            try {
                setLoading(true);
                await api.post('/payroll/finalize', { month, year, calendar, payrollData: [employeeData] });
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

        const sandwichDays = payslip.breakdown?.sandwich || 0;
        const clAdjustDays = payslip.breakdown?.clAdjustment || 0;
        const cal = payslip.calendar || null;
        // Payslips finalized before the calendar snapshot existed simply omit the line.
        const monthMakeup = cal
            ? `${cal.daysInMonth} days = ${cal.workingDays} working + ${cal.sundays} Sundays + ${cal.holidays} holidays`
            : null;
        const unpaidDeductionAmount = Math.round((payslip.baseSalary / payslip.totalWorkingDays) * ((payslip.breakdown?.absent || 0) + (payslip.breakdown?.unpaidLeave || 0) + ((payslip.breakdown?.halfDays || 0) * 0.5) + sandwichDays - clAdjustDays));

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
                                <td style="padding: 8px;">Standard Payroll Month</td>
                                <td style="padding: 8px; text-align: right;">${payslip.totalWorkingDays} days</td>
                            </tr>
                            ${monthMakeup ? `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 8px;">This Month</td>
                                <td style="padding: 8px; text-align: right; color: #64748b;">${monthMakeup}</td>
                            </tr>` : ''}
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 8px;">Unpaid Absences / Leaves</td>
                                <td style="padding: 8px; text-align: right; color: #ef4444;">-${(payslip.breakdown?.absent || 0) + (payslip.breakdown?.unpaidLeave || 0)} days</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 8px;">Half Days Count</td>
                                <td style="padding: 8px; text-align: right; color: #f59e0b;">${payslip.breakdown?.halfDays || 0} days (-${(payslip.breakdown?.halfDays || 0) * 0.5} day equiv)</td>
                            </tr>
                            ${sandwichDays > 0 ? `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 8px;">Sandwich Deduction
                                    <div style="color:#94a3b8;font-size:0.72rem;">Day off between absences: ${(payslip.sandwichDates || []).join(', ')}</div>
                                </td>
                                <td style="padding: 8px; text-align: right; color: #ef4444;">-${sandwichDays} days</td>
                            </tr>` : ''}
                            ${clAdjustDays > 0 ? `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 8px;">Casual Leave Adjustment
                                    <div style="color:#94a3b8;font-size:0.72rem;">Casual leave spent covering half days</div>
                                </td>
                                <td style="padding: 8px; text-align: right; color: #059669;">+${clAdjustDays} days</td>
                            </tr>` : ''}
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
                                        <td>Standard Payroll Month</td>
                                        <td class="right">${payslip.totalWorkingDays} days</td>
                                    </tr>
                                    ${monthMakeup ? `
                                    <tr>
                                        <td>This Month</td>
                                        <td class="right">${monthMakeup}</td>
                                    </tr>` : ''}
                                    <tr>
                                        <td>Unpaid Absences / Leaves</td>
                                        <td class="right">${(payslip.breakdown?.absent || 0) + (payslip.breakdown?.unpaidLeave || 0)}</td>
                                    </tr>
                                    <tr>
                                        <td>Half Days Deductions</td>
                                        <td class="right">${(payslip.breakdown?.halfDays || 0) * 0.5} (from ${payslip.breakdown?.halfDays || 0} half-days)</td>
                                    </tr>
                                    ${sandwichDays > 0 ? `
                                    <tr>
                                        <td>Sandwich Deduction<br/><small>${(payslip.sandwichDates || []).join(', ')}</small></td>
                                        <td class="right">${sandwichDays}</td>
                                    </tr>` : ''}
                                    ${clAdjustDays > 0 ? `
                                    <tr>
                                        <td>Casual Leave Adjustment</td>
                                        <td class="right">+${clAdjustDays}</td>
                                    </tr>` : ''}
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

    // Read back from payrollData so the drawer reflects any edit made in the
    // table while it is open, rather than a snapshot taken on click.
    const detailRow = payrollData.find(d => d.user._id === detailUserId) || null;

    // Headline totals for the run. Derived rather than stored so they follow
    // every edit HR makes in the table.
    const totalPayout = payrollData.reduce((n, d) => n + (d.calculatedSalary || 0), 0);
    const totalBase = payrollData.reduce((n, d) => n + (d.baseSalary || 0), 0);
    const totalDeducted = totalBase - totalPayout;
    const totalUnpaidDays = payrollData.reduce((n, d) => {
        const b = d.breakdown || {};
        return n + (b.absent || 0) + (b.unpaidLeave || 0) + ((b.halfDays || 0) * 0.5) + (b.sandwich || 0);
    }, 0);
    const sandwichPeople = payrollData.filter(d => (d.breakdown?.sandwich || 0) > 0);
    const sandwichDays = sandwichPeople.reduce((n, d) => n + d.breakdown.sandwich, 0);
    const finalizedCount = payrollData.filter(d => finalizedUsers.includes(d.user._id)).length;

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
            <>
                {/* --- What this month's run comes to, before anyone drills in --- */}
                <div className="payroll-summary fade-in">
                    <div className="payroll-stat">
                        <div className="payroll-stat-label">Employees</div>
                        <div className="payroll-stat-value">{payrollData.length}</div>
                        <div className="payroll-stat-note">{finalizedCount} finalized</div>
                    </div>
                    <div className="payroll-stat">
                        <div className="payroll-stat-label">Total Payout</div>
                        <div className="payroll-stat-value">&#8377;{totalPayout.toLocaleString()}</div>
                        <div className="payroll-stat-note">of &#8377;{totalBase.toLocaleString()} base</div>
                    </div>
                    <div className="payroll-stat">
                        <div className="payroll-stat-label">Days Deducted</div>
                        <div className={`payroll-stat-value ${totalUnpaidDays ? 'danger' : ''}`}>{totalUnpaidDays}</div>
                        <div className="payroll-stat-note">&#8377;{totalDeducted.toLocaleString()} withheld</div>
                    </div>
                    <div className="payroll-stat">
                        <div className="payroll-stat-label">Sandwich Charges</div>
                        <div className={`payroll-stat-value ${sandwichDays ? 'danger' : ''}`}>{sandwichDays}</div>
                        <div className="payroll-stat-note">
                            {sandwichPeople.length} employee{sandwichPeople.length === 1 ? '' : 's'} affected
                        </div>
                    </div>
                </div>

                <div className="payroll-preview-head fade-in">
                    <div>
                        <h3 className="payroll-preview-title">
                            <FontAwesomeIcon icon={faFileInvoiceDollar} />
                            {new Date(year, month - 1).toLocaleString('en', { month: 'long', year: 'numeric' })}
                        </h3>

                        {calendar ? (
                            <>
                                <div className="payroll-daychips">
                                    <span className="payroll-daychip working"><i />{calendar.workingDays} working</span>
                                    <span className="payroll-daychip sunday"><i />{calendar.sundays} Sundays</span>
                                    <span className="payroll-daychip holiday"><i />{calendar.holidays} holidays</span>
                                    <span className="payroll-daychip total">{calendar.daysInMonth} days in month</span>
                                </div>
                                <div className="payroll-head-note">
                                    {calendar.holidayList && calendar.holidayList.length > 0 && (
                                        <>{calendar.holidayList.map(h => `${h.name} (${h.date})`).join('  \u00B7  ')}<br /></>
                                    )}
                                    Sundays and holidays are paid &middot; salary runs on a fixed {standardMonthDays}-day month
                                    &middot; click any row for that employee&rsquo;s full month
                                </div>
                            </>
                        ) : (
                            <div className="payroll-head-note">Total days: {daysInMonth}</div>
                        )}
                    </div>

                    <div className="search-wrapper payroll-search">
                        <FontAwesomeIcon icon={faSearch} className="search-icon" style={{ top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Search Employee..."
                            className="swal2-input search-input"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ height: '38px' }}
                        />
                    </div>
                </div>

                <div className="employee-table-container payroll-table-wrap fade-in">
                    <table className="employee-table payroll-table">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Attendance</th>
                                <th className="th-center">Deductions <span className="th-unit">days</span></th>
                                <th className="th-center">Payable</th>
                                <th className="th-right">Salary</th>
                                <th className="th-center">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.map(data => {
                                const b = data.breakdown || {};
                                const unpaidAbs = (b.absent || 0) + (b.unpaidLeave || 0);
                                const isFinalized = finalizedUsers.includes(data.user._id);
                                const slipData = { ...data, month, year, totalWorkingDays: standardMonthDays, calendar };

                                return (
                                <tr
                                    key={data.user._id}
                                    className={`payroll-row ${isFinalized ? 'is-finalized' : ''}`}
                                    title="Click to see this month's attendance"
                                    onClick={(e) => {
                                        // The row is a big click target; the controls inside it are not.
                                        if (e.target.closest('input, button, a, select, label')) return;
                                        setDetailUserId(data.user._id);
                                    }}
                                >
                                    <td data-label="Employee">
                                        <div className="payroll-emp">
                                            <EmployeeAvatar person={data.user} />
                                            <div>
                                                <a
                                                    className="payroll-emp-name"
                                                    href={`/employee/${data.user._id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={`Open ${data.user.name}'s profile in a new tab`}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {data.user.name}
                                                </a>
                                                <div className="payroll-emp-id">{data.user.employeeId || 'No ID'}</div>
                                            </div>
                                        </div>
                                    </td>

                                    <td data-label="Attendance">
                                        <div className="payroll-att">
                                            <span className="payroll-att-pill present" title="Present / Late">{b.present || 0}P</span>
                                            {(b.wfh || 0) > 0 && <span className="payroll-att-pill wfh" title="Work from home">{b.wfh}W</span>}
                                            {(b.onLeave || 0) > 0 && <span className="payroll-att-pill leave" title="Paid leave (CL / EL)">{b.onLeave}L</span>}
                                            {(b.halfDays || 0) > 0 && <span className="payroll-att-pill half" title="Half days">{b.halfDays}H</span>}
                                            {unpaidAbs > 0 && <span className="payroll-att-pill absent" title="Absent + unpaid leave">{unpaidAbs}A</span>}
                                            {(b.sandwich || 0) > 0 && <span className="payroll-att-pill sandwich" title="Days off charged under the sandwich rule">{b.sandwich}S</span>}
                                            {(b.noRecord || 0) > 0 && <span className="payroll-att-pill norecord" title="Working days with no attendance record and no leave — not charged">{b.noRecord}?</span>}
                                        </div>
                                    </td>

                                    <td data-label="Deductions">
                                        <div className="payroll-deducts">
                                            <label className={`payroll-field ${unpaidAbs > 0 ? 'flagged' : ''}`} title="Absent + unpaid leave">
                                                <span>Unpaid</span>
                                                <input
                                                    type="number" min="0" step="0.5"
                                                    value={unpaidAbs}
                                                    onChange={(e) => handleBreakdownChange(data.user._id, 'unpaidAbs', e.target.value)}
                                                />
                                            </label>
                                            <label className={`payroll-field ${(b.halfDays || 0) > 0 ? 'warned' : ''}`} title="Half days, charged at 0.5 each">
                                                <span>Half</span>
                                                <input
                                                    type="number" min="0" step="1"
                                                    value={b.halfDays || 0}
                                                    onChange={(e) => handleBreakdownChange(data.user._id, 'halfDays', e.target.value)}
                                                />
                                            </label>
                                            <label
                                                className={`payroll-field ${(b.sandwich || 0) > 0 ? 'flagged' : ''}`}
                                                title={(data.sandwichDates || []).length
                                                    ? `Days off charged because the employee was away on both sides: ${(data.sandwichDates || []).join(', ')}`
                                                    : 'No day off caught between absences'}
                                            >
                                                <span>Sandwich</span>
                                                <input
                                                    type="number" min="0" step="1"
                                                    value={b.sandwich || 0}
                                                    onChange={(e) => handleBreakdownChange(data.user._id, 'sandwich', e.target.value)}
                                                />
                                            </label>
                                            <label
                                                className={`payroll-field ${(b.clAdjustment || 0) > 0 ? 'credited' : ''}`}
                                                title={(data.maxClAdjustment || 0) > 0
                                                    ? `Spend casual leave against half days nobody applied for. ${data.clBalance} CL in balance, up to ${data.maxClAdjustment} usable here.`
                                                    : 'Nothing to adjust: no casual leave in balance, or no unapplied half days'}
                                            >
                                                <span>CL adj</span>
                                                <input
                                                    type="number" min="0" step="0.5"
                                                    max={data.maxClAdjustment || 0}
                                                    disabled={(data.maxClAdjustment || 0) <= 0 && !(b.clAdjustment || 0)}
                                                    value={b.clAdjustment || 0}
                                                    onChange={(e) => handleBreakdownChange(data.user._id, 'clAdjustment', e.target.value)}
                                                />
                                            </label>
                                        </div>
                                    </td>

                                    <td data-label="Payable Days" className="td-center">
                                        <div className="payroll-payable">
                                            <strong>{data.payableDays}</strong>
                                            <span>/ {standardMonthDays}</span>
                                        </div>
                                        <div className="payroll-payable-note">payable days</div>
                                    </td>

                                    <td data-label="Salary" className="td-right">
                                        <div className="payroll-salary">&#8377;{data.calculatedSalary.toLocaleString()}</div>
                                        <div className="payroll-salary-base">of &#8377;{data.baseSalary.toLocaleString()}</div>
                                    </td>

                                    <td data-label="Action" className="td-center">
                                        <div className="payroll-actions">
                                            <button
                                                className="gts-btn payroll-mini"
                                                onClick={() => handleViewPayslip(slipData)}
                                            >
                                                <FontAwesomeIcon icon={faEye} /> Preview
                                            </button>

                                            {isFinalized ? (
                                                <button
                                                    className="gts-btn danger payroll-mini"
                                                    onClick={() => handleRevertSingle(data)}
                                                    disabled={loading}
                                                >
                                                    Revert
                                                </button>
                                            ) : (
                                                <button
                                                    className="gts-btn success payroll-mini"
                                                    onClick={() => handleFinalizeSingle(slipData)}
                                                    disabled={loading}
                                                >
                                                    <FontAwesomeIcon icon={faCheck} /> Finalize
                                                </button>
                                            )}
                                        </div>
                                        {isFinalized && <div className="payroll-final-tag">Finalized</div>}
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </>
            )}
            </>
            )}

            {detailRow && (
                <EmployeeMonthDrawer
                    data={detailRow}
                    month={month}
                    year={year}
                    calendar={calendar}
                    standardMonthDays={standardMonthDays}
                    onAdjust={(value) => handleBreakdownChange(detailRow.user._id, 'clAdjustment', value)}
                    onClose={() => setDetailUserId(null)}
                />
            )}
        </div>
    );
};

export default Payroll;
