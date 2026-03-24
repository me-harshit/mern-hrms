const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');

// @route   GET /api/dashboard/admin-stats
// @desc    Global Stats for Admin/HR or Team Stats for Manager
router.get('/admin-stats', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const now = new Date();
        const todayStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

        let targetUserIds = [];

        // 🚀 MANAGER LOGIC: Fetch only their direct reports
        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            targetUserIds = await User.find({ 
                status: 'ACTIVE', 
                reportingManagerEmail: manager.email.toLowerCase() 
            }).distinct('_id');
        } else {
            // HR and ADMIN: Fetch all active, non-admin employees
            targetUserIds = await User.find({ 
                status: 'ACTIVE', 
                role: { $ne: 'ADMIN' } 
            }).distinct('_id');
        }

        // 2. Count metrics strictly for the targeted IDs (Company-wide or Team-wide)
        const [presentToday, pendingLeaves, onLeaveToday] = await Promise.all([
            Attendance.countDocuments({ date: todayStr, userId: { $in: targetUserIds } }),
            Leave.countDocuments({ status: 'Pending', userId: { $in: targetUserIds } }),
            Leave.countDocuments({ status: 'Approved', fromDate: { $lte: now }, toDate: { $gte: now }, userId: { $in: targetUserIds } })
        ]);

        // totalEmployees is simply the length of the targetUserIds array
        res.json({ 
            totalEmployees: targetUserIds.length, 
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