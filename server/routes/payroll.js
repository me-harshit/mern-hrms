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
const { STANDARD_MONTH_DAYS, buildMonthCalendar, sandwichedDates } = require('../utils/payrollCalendar');
const { accrueCasualLeave } = require('../utils/leaveAccrual');

// @route   GET /api/payroll/calculate
// @desc    Preview salary calculations for a given month/year
router.get('/calculate', auth, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN' && req.user.role !== 'HR') {
            return res.status(403).json({ message: 'Access Denied' });
        }

        const { month, year } = req.query;
        if (!month || !year) return res.status(400).json({ message: 'Month and year are required' });

        const monthNum = parseInt(month);
        const yearNum = parseInt(year);

        // What the month is actually made of: working days, Sundays, holidays.
        // Salary is never divided by these - a day is always base/30 - but HR
        // needs them on screen to trust the figures, and the days off are what
        // the sandwich rule below is applied to.
        const calendar = await buildMonthCalendar(monthNum, yearNum);

        // Find all active employees (excluding ADMIN)
        const employees = await User.find({ status: 'ACTIVE', role: { $ne: 'ADMIN' } });

        // Regex to match dates ending with /M/YYYY (e.g., /7/2026)
        const dateRegex = new RegExp(`/${monthNum}/${yearNum}$`);

        const payrollPreview = [];

        for (const emp of employees) {
            // A run of days off at either edge of the month is flanked by a
            // working day in the neighbouring month, so those rows are pulled
            // in too. They are excluded from the counts further down.
            const records = await Attendance.find({
                userId: emp._id,
                $or: [
                    { date: { $regex: dateRegex } },
                    { date: { $in: calendar.flankDates } }
                ]
            });
            const recordByDate = new Map(records.map(r => [r.date, r]));

            const monthStart = new Date(yearNum, monthNum - 1, 1);
            const monthEnd = new Date(yearNum, monthNum - 1, calendar.daysInMonth, 23, 59, 59, 999);

            // Fetch Approved Leaves for this user to check for Unpaid Leaves (UL)
            const Leave = require('../models/Leave');
            const approvedLeaves = await Leave.find({ userId: emp._id, status: 'Approved' });

            let breakdown = {
                present: 0,
                wfh: 0,
                onLeave: 0,
                unpaidLeave: 0,
                halfDays: 0,
                absent: 0,
                sandwich: 0,
                // Working days with no attendance row and no leave to explain
                // them. Never charged — surfaced so the gap is visible.
                noRecord: 0,
                // Casual leave HR chose to spend covering half days the employee
                // never applied for. Always zero here: it is a deliberate act at
                // payroll time, never something that happens on its own.
                clAdjustment: 0
            };

            // Which leave covered a given day, for the day-by-day view.
            const leaveTypeByDate = {};
            // Days counted from an approved leave that has no attendance row.
            const derivedLeaveDates = new Set();

            const startOfDayFor = (dateStr) => {
                const [d, m, y] = dateStr.split('/').map(Number);
                return new Date(y, m - 1, d);
            };
            const joinedOn = emp.joiningDate ? new Date(new Date(emp.joiningDate).setHours(0, 0, 0, 0)) : null;

            // Approved leaves touching this month, each carrying a quota of days.
            //
            // A day can be covered by more than one leave: employees here file a
            // part-paid, part-unpaid absence as two leaves over the *same* range
            // (a 1-day CL beside a 5-day UL), so the range alone cannot say which
            // day is which. The quotas are therefore spent day by day in order,
            // paid leave first, so the paid entitlement is honoured up to exactly
            // what was granted and everything past it falls to unpaid. Picking
            // whichever leave happened to be found first would have made the
            // whole absence paid or unpaid at random.
            const LEAVE_ORDER = { CL: 0, EL: 0, UL: 1 };
            const monthLeaves = approvedLeaves
                .filter(l => new Date(l.fromDate) <= monthEnd && new Date(l.toDate) >= monthStart)
                .sort((a, b) =>
                    new Date(a.fromDate) - new Date(b.fromDate) ||
                    (LEAVE_ORDER[a.leaveType] ?? 9) - (LEAVE_ORDER[b.leaveType] ?? 9) ||
                    new Date(a.createdAt) - new Date(b.createdAt));
            const leaveQuota = monthLeaves.map(l => (typeof l.days === 'number' ? l.days : 0));

            // Draws up to `amount` of a day out of the leaves covering it. Quotas
            // are fractional, so a single day can be part paid and part unpaid:
            // a 2.5-day UL ending FIRST_HALF beside a 0.5-day CL on the same date
            // is half unpaid and half casual, and costs half a day, not a whole
            // one. Must be called once per covered day, in date order, for the
            // quotas to line up.
            const claimLeave = (dateStr, amount) => {
                const day = startOfDayFor(dateStr);
                let remaining = amount;
                let paid = 0, unpaid = 0, covering = null;
                const types = [];
                for (let i = 0; i < monthLeaves.length; i++) {
                    const l = monthLeaves[i];
                    const from = new Date(l.fromDate); from.setHours(0, 0, 0, 0);
                    const to = new Date(l.toDate); to.setHours(23, 59, 59, 999);
                    if (day < from || day > to) continue;
                    if (covering === null) covering = l;
                    if (remaining <= 0 || leaveQuota[i] <= 0) continue;

                    const take = Math.min(leaveQuota[i], remaining);
                    leaveQuota[i] -= take;
                    remaining -= take;
                    if (l.leaveType === 'UL') unpaid += take;
                    else paid += take;
                    if (!types.includes(l.leaveType)) types.push(l.leaveType);
                }
                return { paid, unpaid, remaining, types, covering };
            };

            // Books `amount` of a day against approved leave. Returns null when no
            // approved leave covers the date at all, so the caller can fall back
            // to its own handling.
            const settleLeaveDay = (date, amount) => {
                const c = claimLeave(date, amount);
                if (!c.covering) return null;

                // Covered by an approved leave whose quota does not stretch to the
                // whole range — the day counts were taken over calendar days, not
                // working days. The absence was approved either way, so the
                // shortfall is treated as paid rather than charged to the employee.
                const paid = c.paid + c.remaining;
                breakdown.onLeave += paid;
                breakdown.unpaidLeave += c.unpaid;
                leaveTypeByDate[date] = c.types.length ? c.types.join(' + ') : c.covering.leaveType;
                return { paid, unpaid: c.unpaid };
            };

            // Calculate attendance, walking the month in date order.
            calendar.allDates.forEach(date => {
                const record = recordByDate.get(date);

                if (record) {
                    if (record.status === 'Present' || record.status === 'Late') {
                        breakdown.present++;
                    } else if (record.status === 'WFH') {
                        breakdown.wfh++;
                    } else if (record.status === 'Half Day') {
                        // Half the day is missing. If a leave covers that half, the
                        // leave decides whether it is paid: a half-day CL against a
                        // half day the employee never applied for cancels the
                        // deduction instead of being wasted.
                        if (!settleLeaveDay(date, 0.5)) breakdown.halfDays++;
                    } else if (record.status === 'On Leave' || record.status === 'Absent') {
                        // Not covered by an approved leave: an absence either way,
                        // including a row marked 'On Leave' with nothing behind it.
                        if (!settleLeaveDay(date, 1)) breakdown.absent++;
                    }
                    // 'Pending' is an undecided day and counts towards nothing.
                    return;
                }

                // --- No attendance row for this day ---
                // Sundays and holidays are meant to have none.
                if (calendar.dayTypes[date] !== 'working') return;
                // Nobody owes anything for a day before they joined.
                if (joinedOn && startOfDayFor(date) < joinedOn) return;

                // An approved leave has to be honoured whether or not the row was
                // ever created. The morning cron writes these rows, so a leave
                // approved after it ran — or a run that failed — used to leave an
                // unpaid absence costing nothing at all.
                if (settleLeaveDay(date, 1)) {
                    derivedLeaveDates.add(date);
                    return;
                }

                // No row and no leave. Deliberately not charged: this is missing
                // data, not evidence of absence. Counted so HR can see it.
                breakdown.noRecord++;
            });

            // Away on a day means an absence the company knows about: a row saying
            // Absent or On Leave, or an approved leave whose row was never written.
            const awayDates = new Set(derivedLeaveDates);
            records.forEach(r => {
                if (['Absent', 'On Leave'].includes(r.status)) awayDates.add(r.date);
            });


            const isAwayOn = (dateStr) => awayDates.has(dateStr);
            const sandwichDates = sandwichedDates(calendar.nonWorkingRuns, isAwayOn);
            breakdown.sandwich = sandwichDates.length;

            // Half-day quotas make these fractional; round off the binary dust so
            // 0.5 stays 0.5 rather than 0.49999999999999994.
            breakdown.onLeave = Math.round(breakdown.onLeave * 100) / 100;
            breakdown.unpaidLeave = Math.round(breakdown.unpaidLeave * 100) / 100;

            // Every month pays base/30 per day, whether it has 28 days or 31,
            // so a day of absence costs the same in February as in August.
            // Sundays and holidays are paid days off already inside that 30 -
            // they are only ever deducted when sandwiched.
            //   Unpaid  = Absent + Unpaid Leave + (Half Days * 0.5) + Sandwiched
            //   Payable = 30 - Unpaid
            // Leave that HR could spend against those half days, if they choose
            // to. Half days already covered by a leave are not in breakdown.halfDays,
            // so this only ever offers the ones nobody applied for.
            // Bring the balance up to date before offering it to HR. Accrual
            // otherwise only runs when the employee opens their own leave page,
            // so payroll could be spending from a figure months out of date --
            // or refusing an adjustment the employee has actually earned.
            if (accrueCasualLeave(emp)) await emp.save();
            const clBalance = emp.casualLeaveBalance || 0;
            const maxClAdjustment = Math.min(clBalance, breakdown.halfDays * 0.5);

            const unpaidDays = breakdown.absent + breakdown.unpaidLeave + (breakdown.halfDays * 0.5)
                + breakdown.sandwich - breakdown.clAdjustment;
            let payableDays = STANDARD_MONTH_DAYS - unpaidDays;
            if (payableDays < 0) payableDays = 0;

            const baseSalary = emp.salary || 0;
            const calculatedSalary = baseSalary > 0
                ? Math.round((baseSalary / STANDARD_MONTH_DAYS) * payableDays)
                : 0;

            // Day-by-day view of the month, sent with the preview so opening an
            // employee costs no extra request. Everything the drawer needs to
            // explain a figure is here: what kind of day it was, what the
            // employee did, and whether the sandwich rule charged for it.
            const sandwichSet = new Set(sandwichDates);
            const days = calendar.allDates.map(date => {
                const rec = recordByDate.get(date);
                const derived = derivedLeaveDates.has(date);
                return {
                    date,
                    type: calendar.dayTypes[date],
                    holidayName: calendar.holidayNameByDate[date] || null,
                    status: rec ? rec.status : (derived ? 'On Leave' : null),
                    note: rec ? rec.note : (derived ? 'Approved leave (no attendance record)' : ''),
                    leaveType: leaveTypeByDate[date] || null,
                    derived,
                    checkIn: rec ? rec.checkIn : null,
                    checkOut: rec ? rec.checkOut : null,
                    totalHours: rec ? rec.totalHours : 0,
                    sandwiched: sandwichSet.has(date)
                };
            });

            payrollPreview.push({
                user: {
                    _id: emp._id,
                    name: emp.name,
                    email: emp.email,
                    employeeId: emp.employeeId,
                    profilePic: emp.profilePic
                },
                baseSalary,
                totalWorkingDays: STANDARD_MONTH_DAYS,
                payableDays,
                calculatedSalary,
                breakdown,
                sandwichDates,
                days,
                clBalance,
                maxClAdjustment
            });
        }

        res.json({
            data: payrollPreview,
            daysInMonth: calendar.daysInMonth,
            standardMonthDays: STANDARD_MONTH_DAYS,
            calendar: {
                daysInMonth: calendar.daysInMonth,
                workingDays: calendar.workingDays,
                sundays: calendar.sundays,
                holidays: calendar.holidays,
                holidayList: calendar.holidayList
            }
        });

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

        const { month, year, payrollData, calendar } = req.body;
        if (!month || !year || !payrollData || !Array.isArray(payrollData)) {
            return res.status(400).json({ message: 'Invalid data' });
        }

        let savedCount = 0;

        for (const data of payrollData) {
            // Spending casual leave against half days is a real deduction from
            // the employee's balance, so it moves by the difference from whatever
            // this payslip already recorded. Finalizing twice must not charge
            // twice, and lowering the figure has to give the days back.
            const previous = await Payslip.findOne({ userId: data.user._id, month, year })
                .select('breakdown.clAdjustment').lean();
            const previousAdjustment = previous?.breakdown?.clAdjustment || 0;
            const adjustment = Number(data.breakdown?.clAdjustment) || 0;
            const delta = adjustment - previousAdjustment;

            if (delta !== 0) {
                const employee = await User.findById(data.user._id).select('name casualLeaveBalance');
                if (!employee) return res.status(404).json({ message: 'Employee not found' });
                if (delta > 0 && (employee.casualLeaveBalance || 0) < delta) {
                    return res.status(400).json({
                        message: `${employee.name} has only ${employee.casualLeaveBalance || 0} casual leave left, `
                            + `which is not enough for a ${adjustment} day adjustment.`
                    });
                }
                employee.casualLeaveBalance = (employee.casualLeaveBalance || 0) - delta;
                await employee.save();
            }

            // Upsert the payslip
            await Payslip.findOneAndUpdate(
                { userId: data.user._id, month, year },
                {
                    baseSalary: data.baseSalary,
                    totalWorkingDays: data.totalWorkingDays,
                    payableDays: data.payableDays,
                    calculatedSalary: data.calculatedSalary,
                    breakdown: data.breakdown,
                    // Which Sundays/holidays were charged, and how the month
                    // was made up, so a payslip can still be explained months
                    // later without recalculating anything.
                    sandwichDates: data.sandwichDates || [],
                    calendar: calendar || undefined,
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

        // Casual leave spent on this payslip goes back to the employee.
        const spent = removed?.breakdown?.clAdjustment || 0;
        if (spent > 0) {
            await User.updateOne({ _id: userId }, { $inc: { casualLeaveBalance: spent } });
        }

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
            .populate('userId', 'name email employeeId profilePic')
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
            .populate('userId', 'name email workEmail employeeId profilePic')
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
