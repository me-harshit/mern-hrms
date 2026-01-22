const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Leave = require('../models/Leave');
const User = require('../models/User');

// @route   POST /api/leaves/apply
// @desc    Apply for a new leave
router.post('/apply', auth, async (req, res) => {
    try {
        const { leaveType, fromDate, toDate, reason } = req.body;

        // Calculate Days Difference
        const start = new Date(fromDate);
        const end = new Date(toDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include start date

        const newLeave = new Leave({
            userId: req.user.id,
            leaveType,
            fromDate,
            toDate,
            days: diffDays,
            reason
        });

        await newLeave.save();
        res.json(newLeave);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/leaves/my-leaves
// @desc    Get current user's leave history
router.get('/my-leaves', auth, async (req, res) => {
    try {
        const leaves = await Leave.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(leaves);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/leaves/all-requests
// @desc    Get All Leaves (For Admin/HR)
router.get('/all-requests', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const leaves = await Leave.find()
            .populate('userId', 'name email role')
            .sort({ createdAt: -1 }); // Newest first
        res.json(leaves);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/leaves/action/:id
// @desc    Approve or Reject Leave (Admin Only)
router.put('/action/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const { status } = req.body; // 'Approved' or 'Rejected'
        const leave = await Leave.findById(req.params.id);
        
        if (!leave) return res.status(404).json({ message: 'Leave not found' });

        leave.status = status;
        await leave.save();
        
        res.json(leave);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;