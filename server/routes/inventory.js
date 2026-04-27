const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { uploadToS3 } = require('../utils/s3Service');

const Inventory = require('../models/Inventory');
const User = require('../models/User');
const Settings = require('../models/Settings');

// Helper function to check permissions
const isAdminOrHR = (role) => ['ADMIN', 'HR'].includes(role);

// @route   POST /api/inventory
// @desc    Add a new asset
router.post('/', auth, upload.fields([{ name: 'media', maxCount: 5 }]), async (req, res) => {
    try {
        if (!isAdminOrHR(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        const { itemName, quantity, price, status, storageLocation, assignedTo, notes } = req.body;

        let mediaUrls = [];
        if (req.files && req.files['media']) {
            const uploadPromises = req.files['media'].map(file => uploadToS3(file, 'Inventory'));
            mediaUrls = await Promise.all(uploadPromises);
        }

        const newAsset = new Inventory({
            itemName,
            quantity: Number(quantity) || 1,
            price: price ? Number(price) : null, // 👇 NEW: Save price safely
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

        if (req.query.status && req.query.status !== 'All') {
            andConditions.push({ status: req.query.status });
        }

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
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
        // --- 3. CATEGORY FILTER (A, B, C) ---
        if (req.query.category && req.query.category !== 'All') {
            const settings = await Settings.findOne() || { inventoryCatAThreshold: 500, inventoryCatBThreshold: 100 };

            if (req.query.category === 'Cat A') {
                andConditions.push({ price: { $gte: settings.inventoryCatAThreshold } });
            } else if (req.query.category === 'Cat B') {
                andConditions.push({
                    price: {
                        $gte: settings.inventoryCatBThreshold,
                        $lt: settings.inventoryCatAThreshold
                    }
                });
            } else if (req.query.category === 'Cat C') {
                andConditions.push({
                    $or: [
                        { price: { $lt: settings.inventoryCatBThreshold } },
                        { price: null },
                        { price: { $exists: false } }
                    ]
                });
            }
        }

        if (andConditions.length > 0) query.$and = andConditions;

        const totalRecords = await Inventory.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        const items = await Inventory.find(query)
            .populate('assignedTo', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const allStats = await Inventory.aggregate([
            {
                $group: {
                    _id: null,
                    totalQty: { $sum: "$quantity" },
                    available: { $sum: { $cond: [{ $eq: ["$status", "Available"] }, "$quantity", 0] } },
                    assigned: { $sum: { $cond: [{ $eq: ["$status", "Assigned"] }, "$quantity", 0] } },
                    issues: { $sum: { $cond: [{ $in: ["$status", ["Damaged", "Lost"]] }, "$quantity", 0] } }
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


// @route   GET /api/inventory/unbilled
// @desc    Get all inventory items not yet linked to an expense bill (Grouped by Name)
router.get('/unbilled', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const unbilledGrouped = await Inventory.aggregate([
            // 1. Find all items that are NOT linked to an expense
            {
                $match: {
                    $or: [
                        { linkedExpenseId: null },
                        { linkedExpenseId: { $exists: false } }
                    ]
                }
            },
            // 2. Group them by their exact Name
            {
                $group: {
                    _id: "$itemName",
                    totalUnbilledQty: { $sum: "$quantity" },
                    // Optional: keep a rough idea of estimated price if available
                    estimatedTotalValue: { 
                        $sum: { $multiply: ["$quantity", { $ifNull: ["$price", 0] }] } 
                    }
                }
            },
            // 3. Clean up the output format for the frontend
            {
                $project: {
                    itemName: "$_id",
                    totalUnbilledQty: 1,
                    estimatedTotalValue: 1,
                    _id: 0
                }
            },
            // 4. Sort alphabetically
            { $sort: { itemName: 1 } }
        ]);

        res.json(unbilledGrouped);
    } catch (err) {
        console.error("Unbilled Inventory Fetch Error:", err.message);
        res.status(500).json({ message: 'Server Error fetching unbilled inventory' });
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

        // 👇 NEW: Extract price
        const { itemName, status, storageLocation, assignedTo, notes, quantityToUpdate, price } = req.body;

        let updateQty = parseInt(quantityToUpdate) || item.quantity;
        if (updateQty > item.quantity) {
            return res.status(400).json({ message: "Cannot update more than existing quantity" });
        }

        let isSplitting = updateQty < item.quantity;
        let targetItem = item;

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

        // 👇 NEW: Update price safely
        if (price !== undefined) {
            targetItem.price = price === '' ? null : Number(price);
        }

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

        let existingPool = null;

        if (status === 'Available') {
            existingPool = await Inventory.findOne({
                _id: { $ne: targetItem._id },
                itemName: targetItem.itemName,
                status: 'Available',
                storageLocation: targetItem.storageLocation
            });
        }
        else if (status === 'Assigned') {
            existingPool = await Inventory.findOne({
                _id: { $ne: targetItem._id },
                itemName: targetItem.itemName,
                status: 'Assigned',
                assignedTo: targetItem.assignedTo
            });
        }

        if (existingPool) {
            existingPool.quantity += targetItem.quantity;
            const combinedMedia = new Set([...existingPool.mediaUrls, ...targetItem.mediaUrls]);
            existingPool.mediaUrls = Array.from(combinedMedia);

            if (targetItem.notes && targetItem.notes.trim() !== '') {
                if (existingPool.notes && !existingPool.notes.includes(targetItem.notes)) {
                    existingPool.notes = `${existingPool.notes} | ${targetItem.notes}`;
                } else if (!existingPool.notes) {
                    existingPool.notes = targetItem.notes;
                }
            }

            await existingPool.save();

            if (!isSplitting) {
                await Inventory.findByIdAndDelete(targetItem._id);
            }

            return res.json(existingPool);
        }

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