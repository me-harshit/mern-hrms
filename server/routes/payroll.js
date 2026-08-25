const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Payslip = require('../models/Payslip');
const Notification = require('../models/Notification');
const { canAccessSalary, SALARY_ROLES } = require('../utils/permissions');
const { buildPayslipEmail, monthLabel } = require('../utils/payslipTemplate');
const sendEmail = require('../utils/sendEmail');

// Helper to get days in a month
const getDaysInMonth = (month, year) => {
    return new Date(year, month, 0).getDate();
};

// @route   GET /api/payroll/calculate
// @desc    Preview salary calculations for a given month/year
router.get('/calculate', auth, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN' && req.user.role !== 'HR') {
            return res.status(403).json({ message: 'Access Denied' });
        }

        const { month, year } = req.query;
        if (!month || !year) return res.status(400).json({ message: 'Month and year are required' });

        const daysInMonth = getDaysInMonth(parseInt(month), parseInt(year));
        
        // Find all active employees (excluding ADMIN)
        const employees = await User.find({ status: 'ACTIVE', role: { $ne: 'ADMIN' } });

        // Regex to match dates ending with /M/YYYY (e.g., /7/2026)
        const dateRegex = new RegExp(`/${month}/${year}$`);

        const payrollPreview = [];

        for (const emp of employees) {
            const records = await Attendance.find({ 
                userId: emp._id, 
                date: { $regex: dateRegex }
            });

            // Fetch Approved Leaves for this user to check for Unpaid Leaves (UL)
            const Leave = require('../models/Leave');
            const approvedLeaves = await Leave.find({ userId: emp._id, status: 'Approved' });

            let breakdown = {
                present: 0,
                wfh: 0,
                onLeave: 0,
                unpaidLeave: 0,
                halfDays: 0,
                absent: 0
            };

            // Calculate attendance
            records.forEach(record => {
                if (record.status === 'Present' || record.status === 'Late') {
                    breakdown.present++;
                } else if (record.status === 'WFH') {
                    breakdown.wfh++;
                } else if (record.status === 'Half Day') {
                    breakdown.halfDays++;
                } else if (record.status === 'On Leave' || record.status === 'Absent') {
                    // Check if this date falls under an Approved Leave
                    const [d, m, y] = record.date.split('/').map(Number);
                    const logDate = new Date(y, m - 1, d);
                    
                    const matchingLeave = approvedLeaves.find(l => {
                        const from = new Date(l.fromDate);
                        from.setHours(0,0,0,0);
                        const to = new Date(l.toDate);
                        to.setHours(23,59,59,999);
                        return logDate >= from && logDate <= to;
                    });

                    if (matchingLeave) {
                        // It's covered by a leave. Determine if paid or unpaid.
                        if (matchingLeave.leaveType === 'UL') {
                            breakdown.unpaidLeave++;
                        } else {
                            breakdown.onLeave++; // CL and EL
                        }
                    } else {
                        // Not covered by an approved leave.
                        if (record.status === 'Absent') {
                            breakdown.absent++;
                        } else {
                            // Somehow marked 'On Leave' but no matching leave found? Treat as unpaid or absent.
                            breakdown.absent++; 
                        }
                    }
                }
            });

            // Payable days = Full days + (Half days * 0.5)
            // Note: If they didn't punch in on a weekend, there is no attendance record for that day.
            // Wait, does the company pay for weekends? 
            // If they pay a monthly fixed salary, the standard way is: 
            // Total Days in Month - Unpaid Absences.
            // Unpaid Absences = (Absent * 1) + (Unpaid Leave * 1) + (HalfDays * 0.5)
            // Payable Days = Days in Month - Unpaid Absences
            
            const unpaidDays = breakdown.absent + breakdown.unpaidLeave + (breakdown.halfDays * 0.5);
            let payableDays = daysInMonth - unpaidDays;
            
            // Just in case they joined mid-month and have less records, 
            // we should technically calculate prorated, but for now we rely on the standard deduction method.
            // If payableDays < 0 (somehow), cap at 0
            if (payableDays < 0) payableDays = 0;

            const baseSalary = emp.salary || 0;
            const calculatedSalary = baseSalary > 0 
                ? Math.round((baseSalary / daysInMonth) * payableDays)
                : 0;

            payrollPreview.push({
                user: {
                    _id: emp._id,
                    name: emp.name,
                    email: emp.email,
                    employeeId: emp.employeeId
                },
                baseSalary,
                totalWorkingDays: daysInMonth,
                payableDays,
                calculatedSalary,
                breakdown
            });
        }

        res.json({ data: payrollPreview, daysInMonth });

    } catch (err) {
        console.error("Payroll Calculation Error:", err);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/payroll/finalize
// @desc    Save generated payslips to the database
router.post('/finalize', auth, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN' && req.user.role !== 'HR') {
            return res.status(403).json({ message: 'Access Denied' });
        }

        const { month, year, payrollData } = req.body;
        if (!month || !year || !payrollData || !Array.isArray(payrollData)) {
            return res.status(400).json({ message: 'Invalid data' });
        }

        let savedCount = 0;

        for (const data of payrollData) {
            // Upsert the payslip
            await Payslip.findOneAndUpdate(
                { userId: data.user._id, month, year },
                {
                    baseSalary: data.baseSalary,
                    totalWorkingDays: data.totalWorkingDays,
                    payableDays: data.payableDays,
                    calculatedSalary: data.calculatedSalary,
                    breakdown: data.breakdown,
                    status: 'Generated'
                },
                { upsert: true, new: true }
            );

            // Send notification to employee
            const monthName = new Date(year, month - 1).toLocaleString('en', { month: 'long', year: 'numeric' });
            await Notification.create({
                recipient: data.user._id,
                title: 'Salary Finalized',
                message: `Your salary for ${monthName} has been finalized: ₹${data.calculatedSalary.toLocaleString()}.`,
                type: 'SALARY',
                refKey: `salary:${data.user._id}:${month}:${year}`
            });

            savedCount++;
        }

        res.json({ message: `Successfully finalized payroll for ${savedCount} employees.` });

    } catch (err) {
        console.error("Payroll Finalize Error:", err);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/payroll/revert
// @desc    Revert (delete) a generated payslip
router.post('/revert', auth, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN' && req.user.role !== 'HR') {
            return res.status(403).json({ message: 'Access Denied' });
        }

        const { month, year, userId } = req.body;
        if (!month || !year || !userId) {
            return res.status(400).json({ message: 'Invalid data' });
        }

        const removed = await Payslip.findOneAndDelete({ userId, month, year });

        // The payslip is gone, so any request raised against it is moot.
        if (removed) {
            await Notification.deleteMany({ refKey: `payslip-request:${removed._id}` });
        }

        const monthName = new Date(year, month - 1).toLocaleString('en', { month: 'long', year: 'numeric' });
        // Only remove the notification for THIS pay period — matching on
        // title/type alone would delete an unrelated month's notification.
        // The message fallback covers rows created before refKey existed.
        await Notification.deleteMany({
            recipient: userId,
            type: 'SALARY',
            $or: [
                { refKey: `salary:${userId}:${month}:${year}` },
                { refKey: { $in: [null, ""] }, message: { $regex: `for ${monthName} has been finalized` } }
            ]
        });

        res.json({ message: 'Successfully reverted payroll.' });
    } catch (err) {
        console.error("Payroll Revert Error:", err);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/payroll/history
// @desc    Get saved payslips for a specific month/year
router.get('/history', auth, async (req, res) => {
    try {
        const { month, year } = req.query;
        
        let query = {};
        if (month && year) {
            query = { month: parseInt(month), year: parseInt(year) };
        }

        // Only ADMIN/HR can view the full payroll register. Everyone else
        // (EMPLOYEE, MANAGER, TEAM LEAD, ACCOUNTS) is scoped to their own payslips.
        if (!canAccessSalary(req.user)) {
            query.userId = req.user.id;
        }

        const payslips = await Payslip.find(query)
            .populate('userId', 'name email employeeId')
            .sort({ year: -1, month: -1 });

        res.json({ data: payslips });
    } catch (err) {
        console.error("Payroll History Error:", err);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/payroll/request
// @desc    Employee asks for one of their own payslips to be emailed to them
router.post('/request', auth, async (req, res) => {
    try {
        const { month, year } = req.body;
        if (!month || !year) return res.status(400).json({ message: 'Month and year are required' });

        // Always scoped to the caller — nobody can request someone else's slip.
        const payslip = await Payslip.findOne({
            userId: req.user.id,
            month: parseInt(month),
            year: parseInt(year)
        });

        if (!payslip) {
            return res.status(404).json({ message: 'No finalized payslip exists for that month yet.' });
        }
        if (payslip.request?.status === 'Pending') {
            return res.status(400).json({ message: 'A request for this payslip is already pending.' });
        }

        payslip.request = {
            status: 'Pending',
            requestedAt: new Date(),
            // Clear any previous decision so a re-request starts clean.
            actionedBy: undefined,
            actionedAt: undefined,
            rejectionReason: '',
            emailedTo: payslip.request?.emailedTo || '',
            emailedAt: payslip.request?.emailedAt
        };
        await payslip.save();

        // Tell whoever can action it. Kept in-app: these are internal users.
        const monthName = monthLabel(payslip.month, payslip.year);
        const requester = await User.findById(req.user.id).select('name employeeId');
        const approvers = await User.find({ role: { $in: SALARY_ROLES }, status: 'ACTIVE' }).select('_id');
        await Promise.all(approvers.map(a => Notification.create({
            recipient: a._id,
            title: 'Payslip Requested',
            message: `${requester?.name || 'An employee'} requested their payslip for ${monthName}.`,
            type: 'SALARY',
            link: '/payroll',
            refKey: `payslip-request:${payslip._id}`
        })));

        res.json({ message: `Payslip request for ${monthName} submitted.`, data: payslip });
    } catch (err) {
        console.error("Payslip Request Error:", err);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/payroll/requests
// @desc    ADMIN/HR queue of payslip requests
router.get('/requests', auth, async (req, res) => {
    try {
        if (!canAccessSalary(req.user)) {
            return res.status(403).json({ message: 'Access Denied' });
        }

        // Default to the queue that needs action; ?status=all shows history.
        const { status } = req.query;
        const query = status === 'all'
            ? { 'request.status': { $ne: 'None' } }
            : { 'request.status': status || 'Pending' };

        const requests = await Payslip.find(query)
            .populate('userId', 'name email workEmail employeeId')
            .populate('request.actionedBy', 'name')
            .sort({ 'request.requestedAt': 1 });

        res.json({ data: requests });
    } catch (err) {
        console.error("Payslip Requests Error:", err);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/payroll/request/action
// @desc    ADMIN/HR approve (emails the slip) or reject a payslip request
router.post('/request/action', auth, async (req, res) => {
    try {
        if (!canAccessSalary(req.user)) {
            return res.status(403).json({ message: 'Access Denied' });
        }

        const { payslipId, action, reason } = req.body;
        if (!payslipId || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({ message: 'payslipId and a valid action are required' });
        }

        const payslip = await Payslip.findById(payslipId).populate('userId', 'name email workEmail employeeId');
        if (!payslip) return res.status(404).json({ message: 'Payslip not found' });
        if (payslip.request?.status !== 'Pending') {
            return res.status(400).json({ message: 'This request is no longer pending.' });
        }

        const employee = payslip.userId;
        const monthName = monthLabel(payslip.month, payslip.year);

        if (action === 'reject') {
            payslip.request.status = 'Rejected';
            payslip.request.actionedBy = req.user.id;
            payslip.request.actionedAt = new Date();
            payslip.request.rejectionReason = reason || '';
            await payslip.save();

            await Notification.create({
                recipient: employee._id,
                title: 'Payslip Request Declined',
                message: `Your payslip request for ${monthName} was declined.${reason ? ` Reason: ${reason}` : ''}`,
                type: 'SALARY',
                link: '/payroll',
                refKey: `payslip-request:${payslip._id}`
            });

            return res.json({ message: `Request for ${monthName} rejected.` });
        }

        // --- APPROVE: email the slip, and only record success if it sent ---
        // Payslips are work documents, so the work address wins when present.
        const destination = employee.workEmail || employee.email;
        if (!destination) {
            return res.status(400).json({ message: `${employee.name} has no email address on file.` });
        }

        const { subject, message } = buildPayslipEmail({ payslip, employee });
        const sent = await sendEmail({ email: destination, subject, message });

        if (!sent) {
            // Leave the request Pending so it can be retried once mail is fixed.
            return res.status(502).json({
                message: `Could not send the email to ${destination}. The request is still pending — try again.`
            });
        }

        payslip.request.status = 'Approved';
        payslip.request.actionedBy = req.user.id;
        payslip.request.actionedAt = new Date();
        payslip.request.rejectionReason = '';
        payslip.request.emailedTo = destination;
        payslip.request.emailedAt = new Date();
        await payslip.save();

        await Notification.create({
            recipient: employee._id,
            title: 'Payslip Sent',
            message: `Your payslip for ${monthName} has been emailed to ${destination}.`,
            type: 'SALARY',
            link: '/payroll',
            refKey: `payslip-request:${payslip._id}`
        });

        res.json({ message: `Payslip for ${monthName} emailed to ${destination}.` });
    } catch (err) {
        console.error("Payslip Request Action Error:", err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
