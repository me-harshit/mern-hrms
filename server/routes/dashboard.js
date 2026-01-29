const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');

// @route   GET /api/dashboard/admin-stats
// @desc    Global Stats for Admin/HR
router.get('/admin-stats', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const now = new Date();
        const todayStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

        const [totalEmployees, presentToday, pendingLeaves, onLeaveToday] = await Promise.all([
            User.countDocuments({}),
            Attendance.countDocuments({ date: todayStr }),
            Leave.countDocuments({ status: 'Pending' }),
            Leave.countDocuments({ status: 'Approved', fromDate: { $lte: now }, toDate: { $gte: now } })
        ]);

        res.json({ totalEmployees, presentToday, pendingLeaves, onLeaveToday });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/dashboard/employee-stats
// @desc    Personal Stats for Employee
router.get('/employee-stats', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();

        // 1. Calculate Leave Balance (Static quota 12 for now)
        const approvedLeaves = await Leave.find({ userId, status: 'Approved' });
        const usedLeaves = approvedLeaves.reduce((acc, curr) => acc + curr.days, 0);
        const leaveBalance = 12 - usedLeaves;

        // 2. My Pending Requests
        const myPending = await Leave.countDocuments({ userId, status: 'Pending' });

        // 3. Attendance this month (Simple count)
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const presentDays = await Attendance.countDocuments({
            userId,
            createdAt: { $gte: startOfMonth } // Approximate check
        });

        res.json({
            leaveBalance,
            myPending,
            presentDays,
            totalLeaves: 12
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;