const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['Credit', 'Debit', 'Reset'], required: true },
    description: { type: String },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    /**
     * Receipt for a reimbursement settlement, as an S3 url.
     *
     * reimbursements.js has always passed this to create(), but it was not
     * declared here -- and Mongoose's default strict mode drops undeclared
     * paths without complaint. So every receipt was uploaded to S3 and then
     * had its url thrown away: unreachable from the app, absent from the audit
     * trail, and invisible to any orphan sweep driven off the database.
     */
    attachmentUrl: { type: String, default: '' },

    /**
     * The expenses this settlement paid out. Dropped silently for the same
     * reason attachmentUrl was, which is why settlements could not be traced
     * back to the claims they cleared.
     */
    linkedExpenseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }],

    date: { type: Date, default: Date.now }
    
}, { timestamps: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);