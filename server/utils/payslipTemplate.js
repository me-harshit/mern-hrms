// Server-side payslip markup, used for the email that goes out when HR
// approves a payslip request. Mirrors the print layout in
// client/src/pages/Admin/Payroll.js so the emailed slip and the printed one
// show the same figures. Email clients ignore <style> blocks and drop
// classes, so everything here is inline-styled.

const money = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;

const monthLabel = (month, year) =>
    new Date(year, month - 1).toLocaleString('en', { month: 'long', year: 'numeric' });

const row = (label, value, opts = {}) => {
    const weight = opts.bold ? '700' : '400';
    const color = opts.color || '#334155';
    const border = opts.topBorder ? 'border-top:2px solid #e2e8f0;' : 'border-top:1px solid #f1f5f9;';
    return `
        <tr>
            <td style="padding:10px 12px;${border}font-weight:${weight};color:${color};">${label}</td>
            <td style="padding:10px 12px;${border}font-weight:${weight};color:${color};text-align:right;">${value}</td>
        </tr>`;
};

const buildPayslipEmail = ({ payslip, employee }) => {
    const period = monthLabel(payslip.month, payslip.year);
    const b = payslip.breakdown || {};
    const unpaid = (b.absent || 0) + (b.unpaidLeave || 0);
    const halfDayDeduction = (b.halfDays || 0) * 0.5;
    const sandwich = b.sandwich || 0;
    const clAdjustment = b.clAdjustment || 0;
    const cal = payslip.calendar || {};
    // Older payslips predate the calendar snapshot; they simply omit the line.
    const monthMakeup = cal.daysInMonth
        ? `${cal.daysInMonth} days = ${cal.workingDays} working + ${cal.sundays} Sundays + ${cal.holidays} holidays`
        : null;

    const subject = `Payslip for ${period} - ${employee.name}`;

    const message = `
    <div style="font-family:'Segoe UI',Tahoma,Verdana,sans-serif;max-width:640px;margin:auto;color:#1e293b;">
        <div style="border-bottom:3px solid #215D7B;padding-bottom:12px;margin-bottom:20px;">
            <h2 style="margin:0;color:#215D7B;">Globose Technology Solutions</h2>
            <p style="margin:4px 0 0;color:#64748b;font-size:14px;">Official Monthly Payslip &mdash; ${period}</p>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
            <tr>
                <td style="padding:6px 0;"><strong>Employee Name:</strong> ${employee.name || 'N/A'}</td>
                <td style="padding:6px 0;"><strong>Employee ID:</strong> ${employee.employeeId || 'N/A'}</td>
            </tr>
            <tr>
                <td style="padding:6px 0;"><strong>Email:</strong> ${employee.workEmail || employee.email || 'N/A'}</td>
                <td style="padding:6px 0;"><strong>Pay Period:</strong> ${period}</td>
            </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #e2e8f0;">
            <thead>
                <tr style="background:#f8fafc;">
                    <th style="padding:10px 12px;text-align:left;color:#475569;">Earnings / Deductions</th>
                    <th style="padding:10px 12px;text-align:right;color:#475569;">Days / Amount</th>
                </tr>
            </thead>
            <tbody>
                ${row('Base Monthly Salary', money(payslip.baseSalary))}
                ${row('Standard Payroll Month', `${payslip.totalWorkingDays} days`)}
                ${monthMakeup ? row('This Month', monthMakeup) : ''}
                ${row('Unpaid Absences / Leaves', unpaid)}
                ${row('Half Day Deductions', `${halfDayDeduction} (from ${b.halfDays || 0} half-days)`)}
                ${sandwich ? row('Sandwich Deduction', `${sandwich} day(s) off between absences`) : ''}
                ${clAdjustment ? row('Casual Leave Adjustment', `+${clAdjustment} day(s) credited against half days`) : ''}
                ${row('Net Payable Days', payslip.payableDays, { bold: true, topBorder: true })}
                ${row('Net Payable Salary', money(payslip.calculatedSalary), { bold: true, color: '#059669', topBorder: true })}
            </tbody>
        </table>

        <p style="text-align:center;margin-top:32px;font-size:12px;color:#94a3b8;">
            This is a system generated payslip and does not require a signature.
        </p>
    </div>`;

    return { subject, message };
};

module.exports = { buildPayslipEmail, monthLabel };
