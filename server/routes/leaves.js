const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Leave = require('../models/Leave');
const User = require('../models/User');

// @route   GET /api/leaves/my-leaves
// @desc    Get history AND fetch stored balances (with Auto-Reset logic)
router.get('/my-leaves', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        let user = await User.findById(userId).select('casualLeaveBalance earnedLeaveBalance leavesLastReset');

        // --- 1. JAN 1st RESET LOGIC ---
        // Check if we entered a new year since the last reset
        const now = new Date();
        const lastReset = new Date(user.leavesLastReset);
        
        if (now.getFullYear() > lastReset.getFullYear()) {
            // It's a new year! Reset CL.
            // (Optional: You can carry forward EL here if needed, but we'll just reset CL for now)
            user.casualLeaveBalance = 1; // Reset to 1 for January
            user.leavesLastReset = now;
            await user.save();
            // console.log(`Reset leaves for user ${userId} for year ${now.getFullYear()}`);
        }

        // --- 2. Calculate Available Balance ---
        // DB Balance - Pending Requests
        // (Approved requests are already deducted from DB, so we only subtract Pending to be safe)
        
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

        // Calculate Final Available for UI
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
        
        // Calculate Duration
        const start = new Date(fromDate);
        const end = new Date(toDate);
        const diffTime = Math.abs(end - start);
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        // --- VALIDATION: Check Stored Balance ---
        if (leaveType === 'CL' || leaveType === 'EL') {
            const user = await User.findById(userId);
            
            // Count Pending requests of this type (to prevent double spending)
            const pending = await Leave.find({ userId, leaveType, status: 'Pending' });
            const pendingDays = pending.reduce((acc, curr) => acc + curr.days, 0);

            // True Balance = DB Balance - Pending
            let dbBalance = (leaveType === 'CL') ? user.casualLeaveBalance : user.earnedLeaveBalance;
            let actualAvailable = dbBalance - pendingDays;

            if (days > actualAvailable) {
                return res.status(400).json({ 
                    message: `Insufficient ${leaveType} balance. You have ${actualAvailable} days available.` 
                });
            }
        }

        const newLeave = new Leave({
            userId,
            leaveType,
            fromDate,
            toDate,
            days,
            reason,
            status: 'Pending'
        });

        await newLeave.save();
        res.json(newLeave);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/leaves/action/:id (Approve/Reject)
router.put('/action/:id', auth, async (req, res) => {
    try {
        const { status } = req.body; // 'Approved' or 'Rejected'
        const leave = await Leave.findById(req.params.id);
        
        if (!leave) return res.status(404).json({ message: 'Leave not found' });
        if (leave.status !== 'Pending') return res.status(400).json({ message: 'Request already processed' });

        const user = await User.findById(leave.userId);

        // --- DEDUCTION LOGIC ---
        if (status === 'Approved') {
            if (leave.leaveType === 'CL') {
                if (user.casualLeaveBalance < leave.days) {
                    return res.status(400).json({ message: 'Insufficient Casual Leave Balance' });
                }
                user.casualLeaveBalance -= leave.days;
            } 
            else if (leave.leaveType === 'EL') {
                if (user.earnedLeaveBalance < leave.days) {
                    return res.status(400).json({ message: 'Insufficient Earned Leave Balance' });
                }
                user.earnedLeaveBalance -= leave.days;
            }
            await user.save();
        }

        leave.status = status;
        await leave.save();
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
        if(!user) return res.status(404).json({message: 'User not found'});

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