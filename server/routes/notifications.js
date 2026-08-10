const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Notification = require('../models/Notification');

// ==========================================
// 1. GET ALL NOTIFICATIONS FOR USER
// ==========================================
router.get('/', auth, async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user.id })
            .sort({ createdAt: -1 })
            .limit(50); // Get latest 50 notifications
        res.json(notifications);
    } catch (err) {
        console.error("Fetch Notifications Error:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// 2. GET UNREAD COUNT
// ==========================================
router.get('/unread-count', auth, async (req, res) => {
    try {
        const count = await Notification.countDocuments({ recipient: req.user.id, isRead: false });
        res.json({ count });
    } catch (err) {
        console.error("Unread Count Error:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// 3. MARK ALL AS READ
// ==========================================
router.put('/mark-all-read', auth, async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user.id, isRead: false },
            { $set: { isRead: true } }
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        console.error("Mark All Read Error:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// 4. MARK SINGLE AS READ
// ==========================================
router.put('/read/:id', auth, async (req, res) => {
    try {
        const notification = await Notification.findOne({ _id: req.params.id, recipient: req.user.id });
        if (!notification) return res.status(404).json({ message: 'Notification not found' });
        
        notification.isRead = true;
        await notification.save();
        res.json(notification);
    } catch (err) {
        console.error("Mark Single Read Error:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
