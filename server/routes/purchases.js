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
    { name: 'productMedia', maxCount: 1 } // <-- 1. ADDED THIS
]), async (req, res) => {
    try {
        const {
            itemName, quantity, projectName,
            purchaseDate, vendorName, amount, storageLocation, notes
        } = req.body;

        // Extract file paths if they were uploaded
        let invoiceUrl = '';
        let paymentScreenshotUrl = '';
        let productMediaUrl = ''; // <-- 2. ADDED THIS

        if (req.files && req.files['invoice']) {
            invoiceUrl = `/uploads/purchases/${req.files['invoice'][0].filename}`;
        }
        if (req.files && req.files['paymentScreenshot']) {
            paymentScreenshotUrl = `/uploads/purchases/${req.files['paymentScreenshot'][0].filename}`;
        }
        // <-- 3. CATCH THE NEW FILE -->
        if (req.files && req.files['productMedia']) {
            productMediaUrl = `/uploads/purchases/${req.files['productMedia'][0].filename}`;
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
            productMediaUrl, // <-- 4. SAVE TO DB
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
        // STRICT FILTER: Only find purchases where purchasedBy matches the token ID
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
        // Security Check: Block standard employees
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

// @route   PUT /api/purchases/:id
// @desc    Update inventory details (e.g., moving an item to a new cupboard)
router.put('/:id', auth, async (req, res) => {
    try {
        const { storageLocation, inventoryStatus, notes } = req.body;
        
        let purchase = await Purchase.findById(req.params.id);
        if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

        if (storageLocation !== undefined) purchase.storageLocation = storageLocation;
        if (inventoryStatus) purchase.inventoryStatus = inventoryStatus;
        if (notes !== undefined) purchase.notes = notes;

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