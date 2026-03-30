const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { uploadToS3 } = require('../utils/s3Service');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const Expense = require('../models/Expense'); 
// Helper
const isHRorAdmin = (role) => ['HR', 'ADMIN'].includes(role);

// @route   GET /api/reimbursements/negative-balances
// @desc    Get all employees who are owed reimbursement
router.get('/negative-balances', auth, async (req, res) => {
    try {
        if (!isHRorAdmin(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        // Find wallets where balance is less than 0 (Company owes employee)
        const negativeWallets = await Wallet.find({ balance: { $lt: 0 } })
            .populate('userId', 'name email employeeId')
            .sort({ balance: 1 }); // Sort by most owed first

        res.json(negativeWallets);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/reimbursements/history
// @desc    Get history of all processed reimbursement payouts
router.get('/history', auth, async (req, res) => {
    try {
        if (!isHRorAdmin(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        // Fetch WalletTransactions that were Credits to employees, and have linked expenses
        const history = await WalletTransaction.find({
            type: 'Credit',
            linkedExpenseIds: { $exists: true, $not: { $size: 0 } }
        })
        .populate('userId', 'name employeeId')
        .populate('performedBy', 'name')
        .populate('linkedExpenseIds', 'category projectName amount expenseDate descriptionTags') // Fetch the exact receipts!
        .sort({ createdAt: -1 });

        res.json(history);
    } catch (err) {
        console.error("Error fetching history:", err);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/reimbursements/unpaid/:userId
// @desc    Get all Approved but Unpaid expenses for a specific employee
router.get('/unpaid/:userId', auth, async (req, res) => {
    try {
        if (!isHRorAdmin(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        const unpaidExpenses = await Expense.find({
            paymentSourceId: req.params.userId,
            status: 'Approved',
            isReimbursed: false // Only fetch those that haven't been paid back yet
        }).sort({ expenseDate: 1 }); // Oldest first

        res.json(unpaidExpenses);
    } catch (err) {
        console.error("Error fetching unpaid expenses:", err);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/reimbursements/settle
// @desc    HR pays an employee back based on selected expenses
router.post('/settle', auth, upload.single('proofDocument'), async (req, res) => {
    try {
        if (!isHRorAdmin(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        // We no longer accept a typed 'amount'. We only accept the array of selected IDs!
        const { targetUserId, notes, expenseIds } = req.body;
        
        // Parse the stringified JSON array sent from the frontend
        let parsedExpenseIds = [];
        if (expenseIds) {
            try {
                parsedExpenseIds = JSON.parse(expenseIds);
            } catch (e) {
                return res.status(400).json({ message: 'Invalid expense selection format' });
            }
        }

        if (parsedExpenseIds.length === 0) {
            return res.status(400).json({ message: 'Please select at least one expense to reimburse' });
        }

        // 👇 SECURITY FIX: Fetch the exact expenses directly from the database to calculate the total
        const expensesToSettle = await Expense.find({
            _id: { $in: parsedExpenseIds },
            paymentSourceId: targetUserId,
            status: 'Approved',
            isReimbursed: false
        });

        // Ensure all requested items are valid, approved, and unpaid
        if (expensesToSettle.length !== parsedExpenseIds.length) {
            return res.status(400).json({ message: 'Some selected expenses are invalid, rejected, or already reimbursed.' });
        }

        // 👇 AUTO-CALCULATION: The backend dictates the final amount
        const settleAmount = expensesToSettle.reduce((sum, exp) => sum + exp.amount, 0);

        // Handle File Upload
        let attachmentUrl = '';
        if (req.file) {
            attachmentUrl = await uploadToS3(req.file, 'Reimbursements');
        }

        // 1. Update Employee Wallet (Credit)
        let employeeWallet = await Wallet.findOne({ userId: targetUserId });
        if (!employeeWallet) return res.status(404).json({ message: 'Employee wallet not found' });
        
        employeeWallet.balance += settleAmount; 
        await employeeWallet.save();

        // 2. Create Employee Transaction Record
        const empTxn = await WalletTransaction.create({
            userId: targetUserId,
            amount: settleAmount,
            type: 'Credit',
            description: `Reimbursement Settlement for ${expensesToSettle.length} item(s). ${notes || ''}`,
            performedBy: req.user.id,
            attachmentUrl,
            linkedExpenseIds: parsedExpenseIds // 👇 Perfect Audit Link
        });

        // 3. Update HR/Company Wallet (Debit)
        let hrWallet = await Wallet.findOne({ userId: req.user.id });
        if (!hrWallet) {
            hrWallet = new Wallet({ userId: req.user.id, balance: 0 });
        }
        hrWallet.balance -= settleAmount; 
        await hrWallet.save();

        // 4. Create HR Transaction Record
        await WalletTransaction.create({
            userId: req.user.id,
            amount: settleAmount,
            type: 'Debit',
            description: `Reimbursed Employee ID: ${targetUserId} for ${expensesToSettle.length} item(s). ${notes || ''}`,
            performedBy: req.user.id,
            attachmentUrl,
            linkedExpenseIds: parsedExpenseIds // 👇 Perfect Audit Link
        });

        // 5. 👇 THE LOOP: Mark all selected expenses as Reimbursed and link the Receipt ID!
        for (let exp of expensesToSettle) {
            exp.isReimbursed = true;
            exp.reimbursementTxnId = empTxn._id; // Points directly to the HR payout receipt
            await exp.save();
        }

        res.json({ message: 'Settlement processed successfully', updatedBalance: employeeWallet.balance });
    } catch (err) {
        console.error("Settlement Error:", err);
        res.status(500).json({ message: 'Server Error processing settlement' });
    }
});

module.exports = router;