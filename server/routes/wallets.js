const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction'); // <-- NEW IMPORT

// @route   GET /api/wallets/my-balance
router.get('/my-balance', auth, async (req, res) => {
    try {
        let wallet = await Wallet.findOne({ userId: req.user.id });
        if (!wallet) {
            wallet = new Wallet({ userId: req.user.id, balance: 0 });
            await wallet.save();
        }
        res.json({ balance: wallet.balance });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/my-transactions', auth, async (req, res) => {
    try {
        const transactions = await WalletTransaction.find({ userId: req.user.id })
            .populate('performedBy', 'name')
            .sort({ createdAt: -1 });
        res.json(transactions);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/wallets/user/:id
router.get('/user/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Unauthorized' });

        let wallet = await Wallet.findOne({ userId: req.params.id });
        if (!wallet) {
            wallet = new Wallet({ userId: req.params.id, balance: 0 });
            await wallet.save();
        }
        res.json({ balance: wallet.balance });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// 👇 NEW: FETCH TRANSACTION HISTORY 👇
// @route   GET /api/wallets/transactions/:userId
router.get('/transactions/:userId', auth, async (req, res) => {
    try {
        const transactions = await WalletTransaction.find({ userId: req.params.userId })
            .populate('performedBy', 'name')
            .sort({ createdAt: -1 });
        res.json(transactions);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/wallets/add-funds
router.post('/add-funds', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Unauthorized' });

        const { targetUserId, amount } = req.body;
        let wallet = await Wallet.findOne({ userId: targetUserId });
        if (!wallet) wallet = new Wallet({ userId: targetUserId, balance: 0 });

        wallet.balance += Number(amount);
        await wallet.save();

        // 👇 NEW: LOG THE TRANSACTION 👇
        await WalletTransaction.create({
            userId: targetUserId,
            amount: Number(amount),
            type: 'Credit',
            description: 'Funds added to wallet manually',
            performedBy: req.user.id
        });

        res.json({ message: 'Funds added successfully', newBalance: wallet.balance });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/wallets/update
// @desc    Update wallet balance manually (Admin/HR/Manager)
router.put('/update', auth, async (req, res) => {
    try {
        // 👇 Extracted 'date' from req.body
        const { targetUserId, newBalance, action, amountChanged, date } = req.body;

        let wallet = await Wallet.findOne({ userId: targetUserId });
        if (!wallet) {
            wallet = new Wallet({ userId: targetUserId, balance: 0 });
        }

        wallet.balance = newBalance;
        await wallet.save();

        let type = 'Reset';
        if (action === 'add') type = 'Credit';
        if (action === 'deduct') type = 'Debit';

        await WalletTransaction.create({
            userId: targetUserId,
            amount: amountChanged,
            type: type,
            description: `Manual Wallet Adjustment`,
            performedBy: req.user.id,
            date: date ? new Date(date) : Date.now()
        });

        res.json(wallet);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;