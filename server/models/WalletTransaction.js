const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['Credit', 'Debit'], required: true },
    description: { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    attachmentUrl: { type: String } ,
    linkedExpenseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }]
}, { timestamps: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);