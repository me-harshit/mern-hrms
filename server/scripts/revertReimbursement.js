require('dotenv').config();
const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const Expense = require('../models/Expense');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    try {
        const txnId = '6a72e7faa51419dbf868117f';
        const txn = await WalletTransaction.findById(txnId);
        
        if (!txn) {
            console.log("Transaction not found");
            process.exit(1);
        }

        const amount = txn.amount;
        const hrId = txn.performedBy;
        const empId = txn.userId;

        console.log(`Reverting transaction ${txnId} for amount ${amount}`);

        // 1. Revert Employee Wallet
        const empWallet = await Wallet.findOne({ userId: empId });
        empWallet.balance -= amount;
        await empWallet.save();
        console.log(`Employee wallet reverted. New balance: ${empWallet.balance}`);

        // 2. Revert HR Wallet
        const hrWallet = await Wallet.findOne({ userId: hrId });
        if (hrWallet) {
            hrWallet.balance += amount;
            await hrWallet.save();
            console.log(`HR wallet reverted. New balance: ${hrWallet.balance}`);
        }

        // 3. Find corresponding HR transaction (Debit of same amount around same time)
        const hrTxn = await WalletTransaction.findOne({
            userId: hrId,
            type: 'Debit',
            amount: amount,
            date: { $gte: new Date(txn.date.getTime() - 1000), $lte: new Date(txn.date.getTime() + 1000) }
        });
        if (hrTxn) {
            await WalletTransaction.findByIdAndDelete(hrTxn._id);
            console.log("Deleted HR debit transaction");
        }

        // 4. Mark expenses as not reimbursed
        const expenseIds = txn.linkedExpenseIds || [];
        if (expenseIds.length > 0) {
            await Expense.updateMany(
                { _id: { $in: expenseIds } },
                { $set: { isReimbursed: false, reimbursementTxnId: null } }
            );
            console.log(`Reverted ${expenseIds.length} expenses to isReimbursed = false`);
        } else {
            // fallback if linkedExpenseIds was missing
            await Expense.updateMany(
                { reimbursementTxnId: txnId },
                { $set: { isReimbursed: false, reimbursementTxnId: null } }
            );
        }

        // 5. Delete Employee transaction
        await WalletTransaction.findByIdAndDelete(txnId);
        console.log("Deleted Employee credit transaction");

        process.exit(0);
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
});
