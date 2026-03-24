const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

// @route   POST /api/purchases
// @desc    Add a new dynamic expense entry
router.post('/', auth, upload.fields([
    { name: 'paymentScreenshot', maxCount: 1 },
    { name: 'expenseMedia', maxCount: 10 } // <-- Updated Name
]), async (req, res) => {
    try {
        const {
            expenseType, category, purchaseDate, amount, 
            paymentSourceId, projectName, descriptionTags, expenseDetails
        } = req.body;

        // Parse the dynamic details from the form data string
        let parsedExpenseDetails = {};
        if (expenseDetails) {
            try { parsedExpenseDetails = JSON.parse(expenseDetails); } 
            catch (e) { console.error("Error parsing expenseDetails", e); }
        }

        // Extract file paths
        let paymentScreenshotUrl = '';
        let expenseMediaUrls = [];

        if (req.files && req.files['paymentScreenshot']) {
            paymentScreenshotUrl = `/uploads/purchases/${req.files['paymentScreenshot'][0].filename}`;
        }
        if (req.files && req.files['expenseMedia']) {
            expenseMediaUrls = req.files['expenseMedia'].map(file => `/uploads/purchases/${file.filename}`);
        }

        const newPurchase = new Purchase({
            expenseType,
            category,
            purchaseDate: purchaseDate || Date.now(),
            amount,
            paymentSourceId,
            projectName,
            descriptionTags,
            expenseDetails: parsedExpenseDetails,
            purchasedBy: req.user.id,
            paymentScreenshotUrl,
            expenseMediaUrls,
            status: 'Pending' // Always starts as pending
        });

        await newPurchase.save();
        res.status(201).json(newPurchase);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/purchases
// @desc    Get all purchases for the logged-in user
router.get('/', auth, async (req, res) => {
    try {
        const purchases = await Purchase.find({ purchasedBy: req.user.id })
            .populate('purchasedBy', 'name email employeeId')
            .populate('paymentSourceId', 'name role') 
            .populate('approvedBy', 'name')
            .sort({ purchaseDate: -1 });

        res.json(purchases);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/purchases/all
// @desc    Get all purchases across the company (or Team for Managers)
router.get('/all', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        let query = {};

        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            const teamMembers = await User.find({ reportingManagerEmail: manager.email.toLowerCase() }).select('_id');
            const teamIds = teamMembers.map(emp => emp._id);
            query = { purchasedBy: { $in: teamIds } };
        }

        const purchases = await Purchase.find(query)
            .populate('purchasedBy', 'name email employeeId')
            .populate('paymentSourceId', 'name role')
            .populate('approvedBy', 'name')
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
        const purchase = await Purchase.findById(req.params.id).populate('paymentSourceId', 'name');
        if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

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
// @desc    Update expense details
router.put('/:id', auth, upload.fields([
    { name: 'paymentScreenshot', maxCount: 1 },
    { name: 'expenseMedia', maxCount: 10 }
]), async (req, res) => {
    try {
        let purchase = await Purchase.findById(req.params.id).populate('purchasedBy');
        if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

        // Security Check
        let isAuthorized = false;
        if (req.user.role === 'ADMIN' || req.user.role === 'HR') isAuthorized = true;
        else if (purchase.purchasedBy._id.toString() === req.user.id) isAuthorized = true;
        else if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            if (purchase.purchasedBy.reportingManagerEmail === manager.email) isAuthorized = true;
        }

        if (!isAuthorized) return res.status(403).json({ message: 'Unauthorized' });

        // Do not allow edits if already approved (Safety check)
        if (purchase.status === 'Approved') {
            return res.status(400).json({ message: 'Cannot edit an approved expense.' });
        }

        const {
            expenseType, category, purchaseDate, amount, 
            paymentSourceId, projectName, descriptionTags, expenseDetails,
            inventoryStatus, notes
        } = req.body;

        if (expenseType) purchase.expenseType = expenseType;
        if (category) purchase.category = category;
        if (purchaseDate) purchase.purchaseDate = purchaseDate;
        if (amount) purchase.amount = amount;
        if (paymentSourceId) purchase.paymentSourceId = paymentSourceId;
        if (projectName !== undefined) purchase.projectName = projectName;
        if (descriptionTags) purchase.descriptionTags = descriptionTags;
        if (inventoryStatus) purchase.inventoryStatus = inventoryStatus;
        if (notes !== undefined) purchase.notes = notes;

        if (expenseDetails) {
            try { purchase.expenseDetails = JSON.parse(expenseDetails); } 
            catch (e) { console.error("Error parsing expenseDetails"); }
        }

        if (req.files && req.files['paymentScreenshot']) {
            purchase.paymentScreenshotUrl = `/uploads/purchases/${req.files['paymentScreenshot'][0].filename}`;
        }
        if (req.files && req.files['expenseMedia']) {
            purchase.expenseMediaUrls = req.files['expenseMedia'].map(file => `/uploads/purchases/${file.filename}`);
        }

        // Reset to pending if edited (optional, but good practice)
        purchase.status = 'Pending';

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

// @route   PUT /api/purchases/:id/status
// @desc    Approve or Reject an expense & Deduct Wallet (Manager/Admin only)
router.put('/:id/status', auth, async (req, res) => {
    try {
        const { status } = req.body; // Expects 'Approved' or 'Rejected'
        const purchase = await Purchase.findById(req.params.id).populate('purchasedBy');

        if (!purchase) return res.status(404).json({ message: 'Purchase not found' });
        if (purchase.status !== 'Pending') return res.status(400).json({ message: 'Expense is already processed' });

        // 1. Authorization Check (Is this user allowed to approve this?)
        let isAuthorized = false;
        if (req.user.role === 'ADMIN' || req.user.role === 'HR') {
            isAuthorized = true;
        } else if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            if (purchase.purchasedBy.reportingManagerEmail === manager.email) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) return res.status(403).json({ message: 'Unauthorized to approve this expense' });

        // 2. Financial Deduction Logic
        if (status === 'Approved') {
            // Find the wallet of the person who paid (paymentSourceId)
            let wallet = await Wallet.findOne({ userId: purchase.paymentSourceId });
            
            // If they don't have a wallet yet, create one starting at 0
            if (!wallet) {
                wallet = new Wallet({ userId: purchase.paymentSourceId, balance: 0 });
            }
            
            // Deduct the expense amount from their wallet
            wallet.balance -= purchase.amount;
            await wallet.save();
        }

        // 3. Stamp the Approval
        purchase.status = status;
        purchase.approvedBy = req.user.id; // Record the Manager/Admin who clicked the button
        await purchase.save();

        res.json(purchase);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;