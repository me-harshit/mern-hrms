const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); 
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
        const { itemName, quantity, status, storageLocation, assignedTo, notes } = req.body;
        // Upload media files to S3 in parallel
        let mediaUrls = [];
        if (req.files && req.files['media']) {
            const uploadPromises = req.files['media'].map(file => uploadToS3(file, 'Inventory'));
            mediaUrls = await Promise.all(uploadPromises);
        }

        const newAsset = new Inventory({
            itemName,
            quantity: Number(quantity) || 1,
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
// @desc    Update an asset (Includes Split & Merge Logic for Quantities)
router.put('/:id', auth, upload.fields([{ name: 'media', maxCount: 5 }]), async (req, res) => {
    try {
        if (!isAdminOrHR(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        let item = await Inventory.findById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Asset not found' });

        // 'quantityToUpdate' is how many units the admin is moving. Defaults to the whole stack.
        const { itemName, status, storageLocation, assignedTo, notes, quantityToUpdate } = req.body;

        let updateQty = parseInt(quantityToUpdate) || item.quantity;
        if (updateQty > item.quantity) {
            return res.status(400).json({ message: "Cannot update more than existing quantity" });
        }

        let isSplitting = updateQty < item.quantity;
        let targetItem = item;

        // --- 1. THE SPLIT LOGIC ---
        if (isSplitting) {
            // Deduct from the original stack
            item.quantity -= updateQty;
            await item.save();

            // Create a fresh clone for the separated units
            let cloneData = item.toObject();
            delete cloneData._id;
            delete cloneData.createdAt;
            delete cloneData.updatedAt;

            targetItem = new Inventory(cloneData);
            targetItem.quantity = updateQty;
        }

        // Apply the edits to our target (either the whole stack, or the new clone)
        if (itemName) targetItem.itemName = itemName;
        if (notes !== undefined) targetItem.notes = notes;

        targetItem.status = status;

        if (status === 'Available') {
            targetItem.storageLocation = storageLocation || '';
            targetItem.assignedTo = null;
        } else if (status === 'Assigned') {
            targetItem.storageLocation = '';
            targetItem.assignedTo = assignedTo || null;
        } else {
            targetItem.storageLocation = '';
            targetItem.assignedTo = null;
        }

        if (req.files && req.files['media']) {
            const uploadPromises = req.files['media'].map(file => uploadToS3(file, 'Inventory'));
            const newMediaUrls = await Promise.all(uploadPromises);
            targetItem.mediaUrls = [...targetItem.mediaUrls, ...newMediaUrls];
        }

        // --- 2. THE MERGE LOGIC ---
        // If we are returning items to the "Available" pool, see if a matching pool already exists!
        if (status === 'Available') {
            const existingPool = await Inventory.findOne({
                _id: { $ne: targetItem._id }, // Don't merge with itself
                itemName: targetItem.itemName,
                status: 'Available',
                storageLocation: targetItem.storageLocation
            });

            if (existingPool) {
                // Add the quantity to the existing stack
                existingPool.quantity += targetItem.quantity;

                // Safely merge media URLs (avoiding duplicates)
                const combinedMedia = new Set([...existingPool.mediaUrls, ...targetItem.mediaUrls]);
                existingPool.mediaUrls = Array.from(combinedMedia);

                await existingPool.save();

                // If we didn't split, it means we are converting an entire assigned stack back to available. 
                // Since it merged, we must delete the old assigned row!
                if (!isSplitting) {
                    await Inventory.findByIdAndDelete(targetItem._id);
                }

                return res.json(existingPool);
            }
        }

        // If no merge happened, just save the target item normally
        await targetItem.save();
        res.json(targetItem);

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