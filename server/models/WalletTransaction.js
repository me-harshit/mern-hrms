const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['Credit', 'Debit', 'Reset'], required: true },
    description: { type: String },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    date: { type: Date, default: Date.now }
    
}, { timestamps: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);