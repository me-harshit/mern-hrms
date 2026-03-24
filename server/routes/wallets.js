const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Wallet = require('../models/Wallet');

// @route   GET /api/wallets/my-balance
// @desc    Get logged-in user's wallet balance
router.get('/my-balance', auth, async (req, res) => {
    try {
        let wallet = await Wallet.findOne({ userId: req.user.id });
        if (!wallet) {
            // Auto-create a 0 balance wallet if they don't have one yet
            wallet = new Wallet({ userId: req.user.id, balance: 0 });
            await wallet.save();
        }
        res.json({ balance: wallet.balance });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/wallets/add-funds
// @desc    Add funds to an employee's wallet (Admin/HR/Manager)
router.post('/add-funds', auth, async (req, res) => {
    try {
        // 👇 ALLOW MANAGERS TO ADD FUNDS TOO
        if (req.user.role === 'EMPLOYEE') {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const { targetUserId, amount } = req.body;

        let wallet = await Wallet.findOne({ userId: targetUserId });
        if (!wallet) {
            wallet = new Wallet({ userId: targetUserId, balance: 0 });
        }

        wallet.balance += Number(amount);
        await wallet.save();

        res.json({ message: 'Funds added successfully', newBalance: wallet.balance });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/wallets/user/:id
// @desc    Get specific user's wallet balance (Admin/HR/Manager)
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
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;