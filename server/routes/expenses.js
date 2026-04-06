const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { uploadToS3 } = require('../utils/s3Service');

const Expense = require('../models/Expense');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const Project = require('../models/Project');
const Inventory = require('../models/Inventory');

// @route   POST /api/expenses
// @desc    Add a new dynamic expense entry
router.post('/', auth, upload.fields([
    { name: 'paymentScreenshots', maxCount: 5 },
    { name: 'expenseMedia', maxCount: 10 }
]), async (req, res) => {
    try {
        const {
            expenseType, category, expenseDate, amount,
            paymentSourceId, projectName, descriptionTags, expenseDetails,
            vendorId,
            isCompanyPayment // 👇 NEW: Extract payment method
        } = req.body;

        let parsedExpenseDetails = {};
        if (expenseDetails) {
            try { parsedExpenseDetails = JSON.parse(expenseDetails); }
            catch (e) { console.error("Error parsing expenseDetails", e); }
        }

        // Handle FormData boolean strings
        const isCorpPayment = isCompanyPayment === 'true' || isCompanyPayment === true;

        let paymentScreenshotUrls = [];
        let expenseMediaUrls = [];

        if (req.files && req.files['paymentScreenshots']) {
            const proofPromises = req.files['paymentScreenshots'].map(file => uploadToS3(file));
            paymentScreenshotUrls = await Promise.all(proofPromises);
        }

        if (req.files && req.files['expenseMedia']) {
            const uploadPromises = req.files['expenseMedia'].map(file => uploadToS3(file));
            expenseMediaUrls = await Promise.all(uploadPromises);
        }

        const newExpense = new Expense({
            expenseType,
            category,
            expenseDate: expenseDate || Date.now(),
            amount,
            // 👇 NEW: If it's a company payment, force payment source to null
            paymentSourceId: isCorpPayment ? null : paymentSourceId,
            isCompanyPayment: isCorpPayment,
            projectName,
            descriptionTags,
            expenseDetails: parsedExpenseDetails,
            vendorId: vendorId || null,
            submittedBy: req.user.id,
            paymentScreenshotUrls,
            expenseMediaUrls,
            status: 'Pending'
        });

        await newExpense.save();
        res.status(201).json(newExpense);

    } catch (err) {
        console.error("Expense Creation Error:", err.message);
        res.status(500).json({ message: 'Server Error during upload' });
    }
});

// @route   GET /api/expenses
// @desc    Get all expenses for the logged-in user
router.get('/', auth, async (req, res) => {
    try {
        const expenses = await Expense.find({ submittedBy: req.user.id })
            .populate('submittedBy', 'name email employeeId')
            .populate('paymentSourceId', 'name role')
            .populate('approvedBy', 'name')
            .populate('vendorId', 'name gstNumber')
            .sort({ expenseDate: -1 });

        res.json(expenses);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/expenses/all
// @desc    Get all expenses (Paginated & Filtered via Server)
router.get('/all', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        // --- 1. PAGINATION SETUP ---
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let query = {};
        let andConditions = [];

        // --- 2. ROLE BASED SCOPE ---
        if (req.user.role === 'MANAGER') {
            const myProjects = await Project.find({ projectLead: req.user.id }).select('name');
            const myProjectNames = myProjects.map(p => p.name);
            andConditions.push({ expenseType: 'Project Expense', projectName: { $in: myProjectNames } });
        }

        // --- 3. EXACT FILTERS ---
        if (req.query.expenseType) andConditions.push({ expenseType: req.query.expenseType });
        if (req.query.category) andConditions.push({ category: req.query.category });
        if (req.query.projectName) andConditions.push({ projectName: req.query.projectName });
        if (req.query.submittedBy) andConditions.push({ submittedBy: req.query.submittedBy });
        if (req.query.approvedBy) andConditions.push({ approvedBy: req.query.approvedBy });
        if (req.query.status) andConditions.push({ status: req.query.status });

        // --- 4. NUMBER & DATE RANGE FILTERS ---
        if (req.query.minAmount || req.query.maxAmount) {
            let amountFilter = {};
            if (req.query.minAmount) amountFilter.$gte = Number(req.query.minAmount);
            if (req.query.maxAmount) amountFilter.$lte = Number(req.query.maxAmount);
            andConditions.push({ amount: amountFilter });
        }

        if (req.query.fromDate && req.query.toDate) {
            const start = new Date(req.query.fromDate); start.setHours(0, 0, 0, 0);
            const end = new Date(req.query.toDate); end.setHours(23, 59, 59, 999);
            andConditions.push({ expenseDate: { $gte: start, $lte: end } });
        }

        // --- 5. GST FILTER ---
        if (req.query.hasGst === 'Yes') {
            andConditions.push({ 'expenseDetails.gstNumber': { $exists: true, $ne: "", $regex: /[^ ]/ } });
        } else if (req.query.hasGst === 'No') {
            andConditions.push({
                $or: [
                    { 'expenseDetails.gstNumber': { $exists: false } },
                    { 'expenseDetails.gstNumber': "" },
                    { 'expenseDetails.gstNumber': null }
                ]
            });
        }

        // --- 6. SMART SEARCH FILTER ---
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');

            // Find users matching search to allow searching by Submitter Name
            const matchingUsers = await User.find({ name: searchRegex }).select('_id');
            const userIds = matchingUsers.map(u => u._id);

            let searchOr = [
                { category: searchRegex },
                { descriptionTags: searchRegex },
                { projectName: searchRegex },
                { 'expenseDetails.gstNumber': searchRegex },
                { submittedBy: { $in: userIds } }
            ];

            // If search is a valid number, allow searching by amount
            if (!isNaN(req.query.search)) {
                searchOr.push({ amount: Number(req.query.search) });
            }

            andConditions.push({ $or: searchOr });
        }

        // --- 7. EXECUTE QUERY ---
        if (andConditions.length > 0) {
            query.$and = andConditions;
        }

        const totalRecords = await Expense.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        const expenses = await Expense.find(query)
            .populate('submittedBy', 'name email employeeId')
            .populate('paymentSourceId', 'name role')
            .populate('approvedBy', 'name')
            .populate('vendorId', 'name gstNumber')
            .sort({ expenseDate: -1 })
            .skip(skip)
            .limit(limit);

        // Return Data AND Pagination Meta
        res.json({
            data: expenses,
            pagination: { totalRecords, totalPages, currentPage: page, limit }
        });

    } catch (err) {
        console.error("Pagination Route Error:", err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/expenses/:id
// @desc    Get a single expense by ID (Used for Edit Page)
router.get('/:id', auth, async (req, res) => {
    try {
        const expense = await Expense.findById(req.params.id)
            .populate('paymentSourceId', 'name')
            .populate('vendorId', 'name gstNumber');

        if (!expense) return res.status(404).json({ message: 'Expense not found' });

        if (req.user.role === 'EMPLOYEE' && expense.submittedBy.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        res.json(expense);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Expense not found' });
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/expenses/:id
// @desc    Update expense details
router.put('/:id', auth, upload.fields([
    { name: 'paymentScreenshots', maxCount: 5 },
    { name: 'expenseMedia', maxCount: 10 }
]), async (req, res) => {
    try {
        let expense = await Expense.findById(req.params.id).populate('submittedBy');
        if (!expense) return res.status(404).json({ message: 'Expense not found' });

        let isAuthorized = false;
        if (req.user.role === 'ADMIN' || req.user.role === 'HR') {
            isAuthorized = true;
        } else if (expense.submittedBy._id.toString() === req.user.id) {
            isAuthorized = true;
        } else if (req.user.role === 'MANAGER') {
            if (expense.expenseType === 'Project Expense' && expense.projectName) {
                const project = await Project.findOne({ name: expense.projectName, projectLead: req.user.id });
                if (project) isAuthorized = true;
            }
        }

        if (!isAuthorized) return res.status(403).json({ message: 'Unauthorized' });

        if (expense.status === 'Approved' && req.user.role !== 'ADMIN' && req.user.role !== 'HR') {
            return res.status(400).json({ message: 'Cannot edit an approved expense.' });
        }

        const {
            expenseType, category, expenseDate, amount,
            paymentSourceId, projectName, descriptionTags, expenseDetails, notes,
            vendorId, isCompanyPayment // 👇 NEW
        } = req.body;

        if (expenseType) expense.expenseType = expenseType;
        if (category) expense.category = category;
        if (expenseDate) expense.expenseDate = expenseDate;
        if (amount) expense.amount = amount;
        if (projectName !== undefined) expense.projectName = projectName;
        if (descriptionTags) expense.descriptionTags = descriptionTags;
        if (notes !== undefined) expense.notes = notes;
        if (vendorId !== undefined) expense.vendorId = vendorId === '' ? null : vendorId;

        // 👇 NEW: Handle Payment Method Switch on Edit
        if (isCompanyPayment !== undefined) {
            const isCorpPayment = isCompanyPayment === 'true' || isCompanyPayment === true;
            expense.isCompanyPayment = isCorpPayment;
            expense.paymentSourceId = isCorpPayment ? null : (paymentSourceId || expense.paymentSourceId);
        } else if (paymentSourceId) {
            expense.paymentSourceId = paymentSourceId;
        }

        if (expenseDetails) {
            try { expense.expenseDetails = JSON.parse(expenseDetails); }
            catch (e) { console.error("Error parsing expenseDetails"); }
        }

        if (req.files && req.files['paymentScreenshots']) {
            const proofPromises = req.files['paymentScreenshots'].map(file => uploadToS3(file));
            expense.paymentScreenshotUrls = await Promise.all(proofPromises);
        }
        if (req.files && req.files['expenseMedia']) {
            const uploadPromises = req.files['expenseMedia'].map(file => uploadToS3(file));
            expense.expenseMediaUrls = await Promise.all(uploadPromises);
        }

        if (expense.status === 'Pending' || expense.status === 'Returned') {
            expense.status = 'Pending';
            expense.adminFeedback = '';
        }

        await expense.save();
        res.json(expense);
    } catch (err) {
        console.error("Update Error:", err.message);
        res.status(500).json({ message: 'Server Error during update' });
    }
});

// @route   DELETE /api/expenses/:id
// @desc    Delete an expense record
router.delete('/:id', auth, async (req, res) => {
    try {
        const expense = await Expense.findById(req.params.id);
        if (!expense) return res.status(404).json({ message: 'Expense not found' });

        await expense.deleteOne();
        res.json({ message: 'Expense record removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Expense not found' });
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/expenses/:id/status
// @desc    Approve/Reject/Return expense & Auto-Sync Inventory
router.put('/:id/status', auth, async (req, res) => {
    try {
        const { status, adminFeedback } = req.body;
        const expense = await Expense.findById(req.params.id).populate('submittedBy', 'name email');

        if (!expense) return res.status(404).json({ message: 'Expense not found' });
        if (expense.status !== 'Pending' && expense.status !== 'Returned') {
            return res.status(400).json({ message: 'Expense is already processed' });
        }

        let isAuthorized = false;
        if (req.user.role === 'ADMIN' || req.user.role === 'HR') {
            isAuthorized = true;
        } else if (req.user.role === 'MANAGER') {
            if (expense.expenseType === 'Project Expense' && expense.projectName) {
                const project = await Project.findOne({ name: expense.projectName, projectLead: req.user.id });
                if (project) {
                    isAuthorized = true;
                }
            }
        }

        if (!isAuthorized) return res.status(403).json({ message: 'Unauthorized to approve this expense' });

        // If Approved: Deduct Wallet & Sync Inventory
        if (status === 'Approved') {

            // 1. 👇 FIXED LOGIC: Skip wallet deduction ONLY if it's a Company Payment
            if (!expense.isCompanyPayment) {
                let wallet = await Wallet.findOne({ userId: expense.paymentSourceId });
                if (!wallet) {
                    wallet = new Wallet({ userId: expense.paymentSourceId, balance: 0 });
                }
                wallet.balance -= expense.amount;
                await wallet.save();

                await WalletTransaction.create({
                    userId: expense.paymentSourceId,
                    amount: expense.amount,
                    type: 'Debit',
                    description: `Expense Approved: ${expense.category} - ${expense.projectName || 'General'}`,
                    performedBy: req.user.id
                });
            }

            // 2. Auto-Sync to Inventory
            if (expense.category === 'Product / Item Purchase' && !expense.inventorySynced) {
                const details = expense.expenseDetails;

                if (details && details.inventoryItemStatus && details.inventoryItemStatus !== 'Do Not Track') {
                    const invStatus = details.inventoryItemStatus;
                    const qty = Number(details.quantity) || 1;

                    let existingPool = null;
                    if (invStatus === 'Available') {
                        existingPool = await Inventory.findOne({
                            itemName: details.productName,
                            status: 'Available',
                            storageLocation: details.storageLocation
                        });
                    } else if (invStatus === 'Assigned') {
                        existingPool = await Inventory.findOne({
                            itemName: details.productName,
                            status: 'Assigned',
                            assignedTo: details.inventoryAssignedTo
                        });
                    }

                    let linkedInvId;

                    if (existingPool) {
                        existingPool.quantity += qty;
                        if (expense.expenseMediaUrls && expense.expenseMediaUrls.length > 0) {
                            const combined = new Set([...existingPool.mediaUrls, ...expense.expenseMediaUrls]);
                            existingPool.mediaUrls = Array.from(combined);
                        }
                        await existingPool.save();
                        linkedInvId = existingPool._id;
                    } else {
                        const newAsset = new Inventory({
                            itemName: details.productName,
                            quantity: qty,
                            status: invStatus,
                            storageLocation: invStatus === 'Available' ? details.storageLocation : '',
                            assignedTo: invStatus === 'Assigned' ? details.inventoryAssignedTo : null,
                            mediaUrls: expense.expenseMediaUrls || [],
                            createdBy: req.user.id,
                            linkedExpenseId: expense._id
                        });
                        await newAsset.save();
                        linkedInvId = newAsset._id;
                    }

                    expense.inventorySynced = true;
                    expense.linkedInventoryId = linkedInvId;
                } else if (details && details.inventoryItemStatus === 'Do Not Track') {
                    expense.inventorySynced = true;
                }
            }
        }
        else if (status === 'Returned' || status === 'Rejected') {
            expense.adminFeedback = adminFeedback || '';
        }

        expense.status = status;
        expense.approvedBy = req.user.id;
        await expense.save();

        res.json(expense);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;