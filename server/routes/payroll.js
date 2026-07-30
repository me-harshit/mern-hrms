const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Payslip = require('../models/Payslip');

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
            savedCount++;
        }

        res.json({ message: `Successfully finalized payroll for ${savedCount} employees.` });

    } catch (err) {
        console.error("Payroll Finalize Error:", err);
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

        // If employee, only show their own
        if (req.user.role === 'EMPLOYEE') {
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

module.exports = router;
