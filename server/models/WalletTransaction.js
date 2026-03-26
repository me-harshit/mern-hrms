const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Whose wallet
    amount: { type: Number, required: true },
    type: { type: String, enum: ['Credit', 'Debit', 'Reset'], required: true },
    description: { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Admin/Manager who approved/added it
}, { timestamps: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);