const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); // Memory storage for S3
const { uploadToS3 } = require('../utils/s3Service');

const Inventory = require('../models/Inventory');

// Helper function to check permissions
const isAdminOrHR = (role) => ['ADMIN', 'HR'].includes(role);

// @route   POST /api/inventory
// @desc    Add a new asset
router.post('/', auth, upload.fields([{ name: 'media', maxCount: 5 }]), async (req, res) => {
    try {
        if (!isAdminOrHR(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        // 👇 Updated to match the new storageLocation field
        const { itemName, status, storageLocation, assignedTo, notes } = req.body;

        // Upload media files to S3 in parallel
        let mediaUrls = [];
        if (req.files && req.files['media']) {
            const uploadPromises = req.files['media'].map(file => uploadToS3(file, 'Inventory'));
            mediaUrls = await Promise.all(uploadPromises);
        }

        const newAsset = new Inventory({
            itemName,
            status,
            // Only save location if it's available in the office
            storageLocation: status === 'Available' ? storageLocation : '',
            // Only save assignment if it's actually assigned
            assignedTo: status === 'Assigned' && assignedTo ? assignedTo : null,
            notes,
            mediaUrls,
            createdBy: req.user.id
        });

        await newAsset.save();
        res.status(201).json(newAsset);

    } catch (err) {
        console.error("Inventory Create Error:", err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/inventory
// @desc    Get all inventory items
router.get('/', auth, async (req, res) => {
    try {
        if (!isAdminOrHR(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        const items = await Inventory.find()
            .populate('assignedTo', 'name employeeId')
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });

        res.json(items);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/inventory/:id
// @desc    Get a single asset by ID (For Edit Page)
router.get('/:id', auth, async (req, res) => {
    try {
        if (!isAdminOrHR(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        const item = await Inventory.findById(req.params.id).populate('assignedTo', 'name');
        if (!item) return res.status(404).json({ message: 'Asset not found' });

        res.json(item);
    } catch (err) {
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Asset not found' });
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/inventory/:id
// @desc    Update an existing asset
router.put('/:id', auth, upload.fields([{ name: 'media', maxCount: 5 }]), async (req, res) => {
    try {
        if (!isAdminOrHR(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        let item = await Inventory.findById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Asset not found' });

        const { itemName, status, storageLocation, assignedTo, notes } = req.body;

        if (itemName) item.itemName = itemName;
        if (status) item.status = status;
        if (notes !== undefined) item.notes = notes;

        // Handle dynamic fields based on status
        if (status === 'Available') {
            item.storageLocation = storageLocation || '';
            item.assignedTo = null;
        } else if (status === 'Assigned') {
            item.storageLocation = '';
            item.assignedTo = assignedTo || null;
        } else {
            // Damaged or Lost
            item.storageLocation = '';
            item.assignedTo = null;
        }

        // Handle new media uploads without deleting the old ones (can add delete logic later if needed)
        if (req.files && req.files['media']) {
            const uploadPromises = req.files['media'].map(file => uploadToS3(file, 'Inventory'));
            const newMediaUrls = await Promise.all(uploadPromises);
            item.mediaUrls = [...item.mediaUrls, ...newMediaUrls];
        }

        await item.save();
        res.json(item);

    } catch (err) {
        console.error("Inventory Update Error:", err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/inventory/:id
// @desc    Delete an asset
router.delete('/:id', auth, async (req, res) => {
    try {
        if (!isAdminOrHR(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        const item = await Inventory.findById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Asset not found' });

        await item.deleteOne();
        res.json({ message: 'Asset removed' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;