const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { uploadToS3 } = require('../utils/s3Service');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');

// Helper
const isHRorAdmin = (role) => ['HR', 'ADMIN'].includes(role);

// @route   GET /api/wallets/negative-balances
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

// @route   POST /api/wallets/settle
// @desc    HR pays an employee back (Credit employee, Debit HR, attach proof)
router.post('/settle', auth, upload.single('proofDocument'), async (req, res) => {
    try {
        if (!isHRorAdmin(req.user.role)) return res.status(403).json({ message: 'Access Denied' });

        const { targetUserId, amount, notes } = req.body;
        const settleAmount = Math.abs(parseFloat(amount)); // Ensure it's a positive number

        if (!settleAmount || settleAmount <= 0) return res.status(400).json({ message: 'Invalid amount' });

        // Handle File Upload
        let attachmentUrl = '';
        if (req.file) {
            attachmentUrl = await uploadToS3(req.file, 'Reimbursements');
        }

        // 1. Update Employee Wallet (Credit)
        let employeeWallet = await Wallet.findOne({ userId: targetUserId });
        if (!employeeWallet) return res.status(404).json({ message: 'Employee wallet not found' });
        
        employeeWallet.balance += settleAmount; // Add money back to employee
        await employeeWallet.save();

        // 2. Create Employee Transaction Record
        await WalletTransaction.create({
            userId: targetUserId,
            amount: settleAmount,
            type: 'Credit',
            description: `Reimbursement Settlement. ${notes || ''}`,
            performedBy: req.user.id,
            attachmentUrl
        });

        let hrWallet = await Wallet.findOne({ userId: req.user.id });
        if (!hrWallet) {
            hrWallet = new Wallet({ userId: req.user.id, balance: 0 });
        }
        hrWallet.balance -= settleAmount; // Deduct from HR
        await hrWallet.save();

        await WalletTransaction.create({
            userId: req.user.id,
            amount: settleAmount,
            type: 'Debit',
            description: `Reimbursed Employee ID: ${targetUserId}. ${notes || ''}`,
            performedBy: req.user.id,
            attachmentUrl
        });

        res.json({ message: 'Settlement processed successfully', updatedBalance: employeeWallet.balance });
    } catch (err) {
        console.error("Settlement Error:", err);
        res.status(500).json({ message: 'Server Error processing settlement' });
    }
});

module.exports = router;