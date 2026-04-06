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

        const { itemName, quantity, status, storageLocation, assignedTo, notes } = req.body;
        
        let mediaUrls = [];
        if (req.files && req.files['media']) {
            const uploadPromises = req.files['media'].map(file => uploadToS3(file, 'Inventory'));
            mediaUrls = await Promise.all(uploadPromises);
        }

        const newAsset = new Inventory({
            itemName,
            quantity: Number(quantity) || 1,
            status,
            storageLocation: status === 'Available' ? storageLocation : '',
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
// @desc    Get all inventory items (Paginated & Filtered)
router.get('/', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let query = {};
        let andConditions = [];

        // --- 1. STATUS FILTER ---
        if (req.query.status && req.query.status !== 'All') {
            andConditions.push({ status: req.query.status });
        }

        // --- 2. SEARCH FILTER ---
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            
            // Find users matching search to allow searching by "Assigned To" name
            const matchingUsers = await User.find({ name: searchRegex }).distinct('_id');

            andConditions.push({
                $or: [
                    { itemName: searchRegex },
                    { storageLocation: searchRegex },
                    { notes: searchRegex },
                    { assignedTo: { $in: matchingUsers } }
                ]
            });
        }

        if (andConditions.length > 0) query.$and = andConditions;

        // --- 3. FETCH DATA & TOTALS ---
        const totalRecords = await Inventory.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        const items = await Inventory.find(query)
            .populate('assignedTo', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // --- 4. CALCULATE GLOBAL STATS (For the top cards) ---
        // We run this once so the cards show the total company state
        const allStats = await Inventory.aggregate([
            {
                $group: {
                    _id: null,
                    totalQty: { $sum: "$quantity" },
                    available: { 
                        $sum: { $cond: [{ $eq: ["$status", "Available"] }, "$quantity", 0] } 
                    },
                    assigned: { 
                        $sum: { $cond: [{ $eq: ["$status", "Assigned"] }, "$quantity", 0] } 
                    },
                    issues: { 
                        $sum: { $cond: [{ $in: ["$status", ["Damaged", "Lost"]] }, "$quantity", 0] } 
                    }
                }
            }
        ]);

        const stats = allStats[0] || { totalQty: 0, available: 0, assigned: 0, issues: 0 };

        res.json({
            data: items,
            stats,
            pagination: { totalRecords, totalPages, currentPage: page, limit }
        });

    } catch (err) {
        console.error("Inventory Fetch Error:", err);
        res.status(500).send('Server Error');
    }
});

router.get('/my-items', auth, async (req, res) => {
    try {
        const items = await Inventory.find({ 
            assignedTo: req.user.id, 
            status: 'Assigned' 
        });
        res.json(items);
    } catch (err) {
        console.error("Error fetching my inventory:", err);
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

        const { itemName, status, storageLocation, assignedTo, notes, quantityToUpdate } = req.body;

        let updateQty = parseInt(quantityToUpdate) || item.quantity;
        if (updateQty > item.quantity) {
            return res.status(400).json({ message: "Cannot update more than existing quantity" });
        }

        let isSplitting = updateQty < item.quantity;
        let targetItem = item;

        // --- 1. THE SPLIT LOGIC ---
        if (isSplitting) {
            item.quantity -= updateQty;
            await item.save();

            let cloneData = item.toObject();
            delete cloneData._id;
            delete cloneData.createdAt;
            delete cloneData.updatedAt;

            targetItem = new Inventory(cloneData);
            targetItem.quantity = updateQty;
        }

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

        // --- 2. THE MERGE LOGIC (UPDATED) ---
        let existingPool = null;

        // Check if we can merge with an Available pool
        if (status === 'Available') {
            existingPool = await Inventory.findOne({
                _id: { $ne: targetItem._id }, 
                itemName: targetItem.itemName,
                status: 'Available',
                storageLocation: targetItem.storageLocation
            });
        } 
        // 👇 Check if we can merge with an Employee's existing assigned pool
        else if (status === 'Assigned') {
            existingPool = await Inventory.findOne({
                _id: { $ne: targetItem._id }, 
                itemName: targetItem.itemName,
                status: 'Assigned',
                assignedTo: targetItem.assignedTo
            });
        }

        // If we found a match for EITHER scenario, merge them!
        if (existingPool) {
            existingPool.quantity += targetItem.quantity;

            // Merge Media safely
            const combinedMedia = new Set([...existingPool.mediaUrls, ...targetItem.mediaUrls]);
            existingPool.mediaUrls = Array.from(combinedMedia);

            // Merge Notes safely so we don't lose data
            if (targetItem.notes && targetItem.notes.trim() !== '') {
                if (existingPool.notes && !existingPool.notes.includes(targetItem.notes)) {
                    existingPool.notes = `${existingPool.notes} | ${targetItem.notes}`;
                } else if (!existingPool.notes) {
                    existingPool.notes = targetItem.notes;
                }
            }

            await existingPool.save();

            // Clean up the old row if we moved the entire stack
            if (!isSplitting) {
                await Inventory.findByIdAndDelete(targetItem._id);
            }

            return res.json(existingPool);
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