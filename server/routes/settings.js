const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Settings = require('../models/Settings');

// @route   GET /api/settings
// @desc    Get Office Rules
router.get('/', auth, async (req, res) => {
    try {
        let settings = await Settings.findOne();
        // Create default if not exists
        if (!settings) {
            settings = new Settings();
            await settings.save();
        }
        res.json(settings);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/settings
// @desc    Update Office Rules (Admin Only)
router.put('/', auth, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Access Denied' });

        const { officeStartTime, officeCloseTime, gracePeriod, halfDayThreshold } = req.body;
        
        let settings = await Settings.findOne();
        if (!settings) settings = new Settings();

        settings.officeStartTime = officeStartTime;
        settings.officeCloseTime = officeCloseTime;
        settings.gracePeriod = gracePeriod;
        settings.halfDayThreshold = halfDayThreshold;

        await settings.save();
        res.json(settings);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;

module.exports = router;