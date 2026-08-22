const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/authMiddleware');
const Notification = require('../models/Notification');

const TYPES = ['LEAVE', 'SALARY', 'BIRTHDAY', 'SYSTEM', 'WFH', 'SHORT_LEAVE', 'TASK'];

/**
 * Turn the query string into a Mongo filter.
 *
 * Shared by the list and by mark-all-read, so "mark these as read" always means
 * exactly the set the user is looking at — the two can't drift.
 */
const buildFilter = (userId, q = {}) => {
    const filter = { recipient: userId };

    if (q.type && q.type !== 'All' && TYPES.includes(q.type)) {
        filter.type = q.type;
    }

    if (q.isRead === 'true') filter.isRead = true;
    if (q.isRead === 'false') filter.isRead = false;

    // Dates arrive as YYYY-MM-DD. Built as local day bounds so "today" means the
    // whole of today rather than midnight onwards.
    const dayBounds = (str, endOfDay) => {
        const [y, m, d] = String(str).split('-').map(Number);
        if (!y || !m || !d) return null;
        return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d);
    };

    const from = q.from ? dayBounds(q.from, false) : null;
    const to = q.to ? dayBounds(q.to, true) : null;
    if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = from;
        if (to) filter.createdAt.$lte = to;
    }

    if (q.search && q.search.trim()) {
        const rx = new RegExp(q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ title: rx }, { message: rx }];
    }

    return filter;
};

// ==========================================
// 1. LIST (filtered + paginated)
// ==========================================
router.get('/', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const filter = buildFilter(req.user.id, req.query);

        const [data, totalRecords, unreadCount, counts] = await Promise.all([
            Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Notification.countDocuments(filter),
            // Always the true unread total, not just within this page or filter —
            // it drives the bell badge.
            Notification.countDocuments({ recipient: req.user.id, isRead: false }),
            // Per-category totals so the filter can show what is actually there
            // rather than offering empty options.
            Notification.aggregate([
                { $match: { recipient: new mongoose.Types.ObjectId(req.user.id) } },
                { $group: { _id: '$type', count: { $sum: 1 } } }
            ])
        ]);

        res.json({
            data,
            unreadCount,
            countsByType: counts.reduce((acc, c) => ({ ...acc, [c._id || 'SYSTEM']: c.count }), {}),
            pagination: {
                totalRecords,
                totalPages: Math.ceil(totalRecords / limit) || 1,
                currentPage: page,
                limit
            }
        });
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
// 3. MARK AS READ (all, or just what is filtered)
// ==========================================
/**
 * With no filters this marks everything, as it always did. With filters it marks
 * only the matching set — so "mark all read" while looking at Leave notices
 * doesn't quietly clear the task ones you had not seen yet.
 */
router.put('/mark-all-read', auth, async (req, res) => {
    try {
        const filter = buildFilter(req.user.id, req.body || {});
        filter.isRead = false;

        const result = await Notification.updateMany(filter, { $set: { isRead: true } });
        res.json({
            message: 'Notifications marked as read',
            modified: result.modifiedCount || 0
        });
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
module.exports.NOTIFICATION_TYPES = TYPES;
