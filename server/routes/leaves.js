const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Leave = require('../models/Leave');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

// @route   GET /api/leaves/my-leaves
// @desc    Get history AND fetch stored balances (with Auto-Reset logic)
router.get('/my-leaves', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        let user = await User.findById(userId).select('casualLeaveBalance earnedLeaveBalance leavesLastReset');

        // --- 1. AUTO-ACCRUAL & YEARLY RESET LOGIC ---
        const now = new Date();
        const lastReset = new Date(user.leavesLastReset || Date.now());
        let isUpdated = false;

        if (now.getFullYear() > lastReset.getFullYear()) {
            // It is a new year! Reset CL.
            // Give 1 CL for every month up to the current month (Jan = 1, Feb = 2, March = 3, etc.)
            user.casualLeaveBalance = now.getMonth() + 1;
            user.leavesLastReset = now;
            isUpdated = true;
        } else {
            // Same year: Accrue 1 CL for each new month entered since last check
            const monthsPassed = now.getMonth() - lastReset.getMonth();
            if (monthsPassed > 0) {
                user.casualLeaveBalance += monthsPassed;
                user.leavesLastReset = now;
                isUpdated = true;
            }
        }

        // Save to database only if we accrued new leaves
        if (isUpdated) {
            await user.save();
        }

        // --- 2. Calculate Available Balance ---
        const pendingLeaves = await Leave.find({
            userId,
            status: 'Pending'
        });

        const pendingCL = pendingLeaves
            .filter(l => l.leaveType === 'CL')
            .reduce((acc, curr) => acc + curr.days, 0);

        const pendingEL = pendingLeaves
            .filter(l => l.leaveType === 'EL')
            .reduce((acc, curr) => acc + curr.days, 0);

        // Calculate Final Available for UI (DB Balance - Pending)
        const clAvailable = Math.max(0, user.casualLeaveBalance - pendingCL);
        const elAvailable = Math.max(0, user.earnedLeaveBalance - pendingEL);

        // --- 3. Fetch History ---
        const leaves = await Leave.find({ userId }).sort({ createdAt: -1 });

        res.json({
            history: leaves,
            balances: {
                CL: clAvailable,
                EL: elAvailable
            }
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/leaves/apply
router.post('/apply', auth, async (req, res) => {
    try {
        const { leaveType, fromDate, toDate, reason } = req.body;
        const userId = req.user.id;

        const start = new Date(fromDate);
        const end = new Date(toDate);
        const diffTime = Math.abs(end - start);
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        const user = await User.findById(userId); // Fetch user details

        // --- VALIDATION: Check Stored Balance ---
        if (leaveType === 'CL' || leaveType === 'EL') {
            const pending = await Leave.find({ userId, leaveType, status: 'Pending' });
            const pendingDays = pending.reduce((acc, curr) => acc + curr.days, 0);

            let dbBalance = (leaveType === 'CL') ? user.casualLeaveBalance : user.earnedLeaveBalance;
            let actualAvailable = dbBalance - pendingDays;

            if (days > actualAvailable) {
                return res.status(400).json({
                    message: `Insufficient ${leaveType} balance. You have ${actualAvailable} days available.`
                });
            }
        }

        const newLeave = new Leave({
            userId, leaveType, fromDate, toDate, days, reason, status: 'Pending'
        });

        await newLeave.save();

        // --- EMAIL LOGIC: Send to Reporting Manager (CC HR) ---
        if (user.reportingManagerEmail) {
            const subject = `New Leave Request: ${user.name}`;
            const message = `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #215D7B;">Leave Request Notification</h2>
                    <p><strong>${user.name}</strong> has requested time off.</p>
                    <table style="border-collapse: collapse; width: 100%; max-width: 500px; margin-top: 10px;">
                        <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9;"><strong>Leave Type:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${leaveType}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9;"><strong>From:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${start.toLocaleDateString('en-GB')}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9;"><strong>To:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${end.toLocaleDateString('en-GB')}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9;"><strong>Total Days:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${days}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9;"><strong>Reason:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${reason}</td></tr>
                    </table>
                    <p style="margin-top: 20px;">Please log in to the HRMS portal to approve or reject this request.</p>
                </div>
            `;

            // Call email function (don't await it strictly so it doesn't slow down the UI response)
            sendEmail({
                email: user.reportingManagerEmail,
                cc: process.env.HR_EMAIL || 'hr@gts.ai',
                subject,
                message
            });
        }

        res.json(newLeave);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/leaves/action/:id (Approve/Reject)
router.put('/action/:id', auth, async (req, res) => {
    try {
        const { status } = req.body;
        const leave = await Leave.findById(req.params.id);

        if (!leave) return res.status(404).json({ message: 'Leave not found' });
        if (leave.status !== 'Pending') return res.status(400).json({ message: 'Request already processed' });

        const user = await User.findById(leave.userId);

        // --- DEDUCTION LOGIC ---
        if (status === 'Approved') {
            if (leave.leaveType === 'CL') {
                if (user.casualLeaveBalance < leave.days) return res.status(400).json({ message: 'Insufficient Casual Leave Balance' });
                user.casualLeaveBalance -= leave.days;
            }
            else if (leave.leaveType === 'EL') {
                if (user.earnedLeaveBalance < leave.days) return res.status(400).json({ message: 'Insufficient Earned Leave Balance' });
                user.earnedLeaveBalance -= leave.days;
            }
            await user.save();
        }

        leave.status = status;
        await leave.save();

        // --- EMAIL LOGIC: Notify Employee (CC HR) ---
        const statusColor = status === 'Approved' ? '#10b981' : '#ef4444'; // Green or Red
        const subject = `Leave Request ${status} - GTS HRMS`;
        const message = `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2 style="color: ${statusColor};">Leave Request ${status}</h2>
                <p>Dear <strong>${user.name}</strong>,</p>
                <p>Your ${leave.leaveType} request for <strong>${leave.days} day(s)</strong> from ${new Date(leave.fromDate).toLocaleDateString('en-GB')} to ${new Date(leave.toDate).toLocaleDateString('en-GB')} has been <strong>${status}</strong>.</p>
                <p>Log in to the HRMS portal to view your updated leave balances.</p>
            </div>
        `;

        sendEmail({
            email: user.email,
            cc: process.env.HR_EMAIL || 'hr@gts.ai',
            subject,
            message
        });

        res.json(leave);

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});
// @route   GET /api/leaves/all-requests (Admin/HR Only)
router.get('/all-requests', auth, async (req, res) => {
    try {
        // Allow HR or ADMIN
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const requests = await Leave.find()
            .populate('userId', 'name email')
            .sort({ createdAt: -1 });

        res.json(requests);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/leaves/admin/update-balance (HR Only)
// Use this to manually edit balances (e.g., adding Salary or fixing Leaves)
router.post('/admin/update-balance', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const { userId, cl, el, salary } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (cl !== undefined) user.casualLeaveBalance = Number(cl);
        if (el !== undefined) user.earnedLeaveBalance = Number(el);
        if (salary !== undefined) user.salary = Number(salary);

        await user.save();

        res.json({ message: 'User profile updated successfully', user });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/admin/user-leaves/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });
        const leaves = await Leave.find({ userId: req.params.id }).sort({ createdAt: -1 });
        res.json({ history: leaves });
    } catch (err) { res.status(500).send('Server Error'); }
});

module.exports = router;