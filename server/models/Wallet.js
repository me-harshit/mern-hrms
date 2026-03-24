const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    // One wallet per user
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    
    // Positive = Company gave them advance funds.
    // Negative = Employee spent out of pocket; Company owes them reimbursement.
    balance: { type: Number, default: 0 }
    
}, { timestamps: true });

module.exports = mongoose.model('Wallet', walletSchema);