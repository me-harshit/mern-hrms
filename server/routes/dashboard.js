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

        // 1. Fetch all ACTIVE, NON-ADMIN user IDs to filter all stats accurately
        const nonAdminIds = await User.find({ status: 'ACTIVE', role: { $ne: 'ADMIN' } }).distinct('_id');

        // 2. Count metrics strictly for those non-admin IDs
        const [presentToday, pendingLeaves, onLeaveToday] = await Promise.all([
            Attendance.countDocuments({ date: todayStr, userId: { $in: nonAdminIds } }),
            Leave.countDocuments({ status: 'Pending', userId: { $in: nonAdminIds } }),
            Leave.countDocuments({ status: 'Approved', fromDate: { $lte: now }, toDate: { $gte: now }, userId: { $in: nonAdminIds } })
        ]);

        // totalEmployees is simply the length of the nonAdminIds array
        res.json({ 
            totalEmployees: nonAdminIds.length, 
            presentToday, 
            pendingLeaves, 
            onLeaveToday 
        });
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

        // 1. Calculate Real Leave Balance from the Database
        const currentUser = await User.findById(userId);
        const leaveBalance = (currentUser.casualLeaveBalance || 0) + (currentUser.earnedLeaveBalance || 0);

        // 2. My Pending Requests
        const myPending = await Leave.countDocuments({ userId, status: 'Pending' });

        // 3. Attendance this month (Simple count)
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const presentDays = await Attendance.countDocuments({
            userId,
            createdAt: { $gte: startOfMonth } 
        });

        res.json({
            leaveBalance,
            myPending,
            presentDays,
            totalLeaves: leaveBalance // Updating this to reflect their live balance pool
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;