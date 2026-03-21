const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const Purchase = require('../models/Purchase');

// @route   POST /api/purchases
// @desc    Add a new purchase entry with files
router.post('/', auth, upload.fields([
    { name: 'invoice', maxCount: 1 },
    { name: 'paymentScreenshot', maxCount: 1 },
    { name: 'productMedia', maxCount: 10 }
]), async (req, res) => {
    try {
        const {
            itemName, quantity, projectName,
            purchaseDate, vendorName, amount, storageLocation, notes
        } = req.body;

        // Extract file paths if they were uploaded
        let invoiceUrl = '';
        let paymentScreenshotUrl = '';
        let productMediaUrls = [];

        if (req.files && req.files['invoice']) {
            invoiceUrl = `/uploads/purchases/${req.files['invoice'][0].filename}`;
        }
        if (req.files && req.files['paymentScreenshot']) {
            paymentScreenshotUrl = `/uploads/purchases/${req.files['paymentScreenshot'][0].filename}`;
        }
        if (req.files && req.files['productMedia']) {
            productMediaUrls = req.files['productMedia'].map(file => `/uploads/purchases/${file.filename}`);
        }

        const newPurchase = new Purchase({
            itemName,
            quantity: quantity || 1,
            projectName,
            purchasedBy: req.user.id,
            purchaseDate: purchaseDate || Date.now(),
            vendorName,
            amount,
            invoiceUrl,
            paymentScreenshotUrl,
            productMediaUrls, 
            storageLocation,
            notes
        });

        await newPurchase.save();
        res.status(201).json(newPurchase);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/purchases
// @desc    Get all purchases (Inventory & Dashboard View)
router.get('/', auth, async (req, res) => {
    try {
        const purchases = await Purchase.find({ purchasedBy: req.user.id })
            .populate('purchasedBy', 'name email employeeId')
            .sort({ purchaseDate: -1 });

        res.json(purchases);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/purchases/all
// @desc    Get all purchases across the company
router.get('/all', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') {
            return res.status(403).json({ message: 'Access Denied' });
        }

        const purchases = await Purchase.find()
            .populate('purchasedBy', 'name email employeeId')
            .sort({ purchaseDate: -1 });

        res.json(purchases);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/purchases/:id
// @desc    Get a single purchase by ID (Used for Edit Page)
router.get('/:id', auth, async (req, res) => {
    try {
        const purchase = await Purchase.findById(req.params.id);
        if (!purchase) return res.status(404).json({ message: 'Purchase not found' });
        
        // Security check: Only the creator or an Admin/HR can view it
        if (req.user.role === 'EMPLOYEE' && purchase.purchasedBy.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        res.json(purchase);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Purchase not found' });
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/purchases/:id
// @desc    Update inventory details & handle new file uploads
router.put('/:id', auth, upload.fields([
    { name: 'invoice', maxCount: 1 },
    { name: 'paymentScreenshot', maxCount: 1 },
    { name: 'productMedia', maxCount: 10 } 
]), async (req, res) => {
    try {
        let purchase = await Purchase.findById(req.params.id);
        if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

        // Security check: Only the creator or Admin/HR can edit
        if (req.user.role === 'EMPLOYEE' && purchase.purchasedBy.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const {
            itemName, quantity, projectName, vendorName, amount, 
            storageLocation, inventoryStatus, notes
        } = req.body;

        // Update basic text fields if they are provided
        if (itemName) purchase.itemName = itemName;
        if (quantity) purchase.quantity = quantity;
        if (projectName !== undefined) purchase.projectName = projectName;
        if (vendorName !== undefined) purchase.vendorName = vendorName;
        if (amount) purchase.amount = amount;
        if (storageLocation !== undefined) purchase.storageLocation = storageLocation;
        if (inventoryStatus) purchase.inventoryStatus = inventoryStatus;
        if (notes !== undefined) purchase.notes = notes;

        // Process File Overwrites
        if (req.files && req.files['invoice']) {
            purchase.invoiceUrl = `/uploads/purchases/${req.files['invoice'][0].filename}`;
        }
        if (req.files && req.files['paymentScreenshot']) {
            purchase.paymentScreenshotUrl = `/uploads/purchases/${req.files['paymentScreenshot'][0].filename}`;
        }
        if (req.files && req.files['productMedia']) {
            // Overwrite the array with the newly uploaded batch
            purchase.productMediaUrls = req.files['productMedia'].map(file => `/uploads/purchases/${file.filename}`);
        }

        await purchase.save();
        res.json(purchase);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/purchases/:id
// @desc    Delete a purchase record
router.delete('/:id', auth, async (req, res) => {
    try {
        const purchase = await Purchase.findById(req.params.id);
        if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

        await purchase.deleteOne();
        res.json({ message: 'Purchase record removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Purchase not found' });
        res.status(500).send('Server Error');
    }
});

module.exports = router;