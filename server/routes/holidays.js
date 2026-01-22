const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Holiday = require('../models/Holiday');

// @route   GET /api/holidays
// @desc    Get all holidays (Accessible to everyone)
router.get('/', auth, async (req, res) => {
    try {
        const holidays = await Holiday.find().sort({ date: 1 });
        res.json(holidays);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/holidays
// @desc    Add a holiday (Admin Only)
router.post('/', auth, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Access Denied' });

        const { name, date } = req.body;
        const newHoliday = new Holiday({ name, date });
        await newHoliday.save();
        res.json(newHoliday);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/holidays/:id
// @desc    Remove holiday (Admin Only)
router.delete('/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Access Denied' });
        await Holiday.findByIdAndDelete(req.params.id);
        res.json({ message: 'Holiday removed' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;