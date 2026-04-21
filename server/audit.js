// audit.js - Run with: node audit.js
const mongoose = require('mongoose');
require('dotenv').config(); // Assuming you have a .env file for your DB URI

// Import your models (Adjust the paths if necessary)
const User = require('./models/User');
const Wallet = require('./models/Wallet');
const WalletTransaction = require('./models/WalletTransaction');

async function runAudit() {
    try {
        // Connect to DB
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/your_db_name');
        console.log("✅ Connected to Database");

        const targetEmployeeId = 'GTS007';
        
        // 1. Find User
        const user = await User.findOne({ employeeId: targetEmployeeId });
        if (!user) {
            console.log(`❌ User with Employee ID ${targetEmployeeId} not found.`);
            process.exit(1);
        }
        console.log(`\n👤 Auditing Employee: ${user.name} (${user.employeeId}) | MongoDB ID: ${user._id}`);

        // 2. Find Wallet
        const wallet = await Wallet.findOne({ userId: user._id });
        const actualDbBalance = wallet ? wallet.balance : 0;
        console.log(`\n💳 ACTUAL MONGODB WALLET BALANCE: ₹${actualDbBalance}`);

        // 3. Fetch Ledger chronologically (Oldest first)
        const txs = await WalletTransaction.find({ userId: user._id }).sort({ date: 1, createdAt: 1 });
        
        console.log(`\n📜 TRANSACTION LEDGER (${txs.length} records found):`);
        console.log("---------------------------------------------------------");
        
        let calculatedBalance = 0;

        txs.forEach((tx, index) => {
            const dateStr = new Date(tx.date || tx.createdAt).toLocaleDateString('en-IN');
            
            if (tx.type === 'Credit') calculatedBalance += tx.amount;
            else if (tx.type === 'Debit') calculatedBalance -= tx.amount;
            else if (tx.type === 'Reset') calculatedBalance = tx.amount; // Manual override

            console.log(`${index + 1}. [${dateStr}] ${tx.type === 'Credit' ? '🟢' : tx.type === 'Debit' ? '🔴' : '🔵'} ${tx.type} | Amount: ₹${tx.amount} | Running Calc: ₹${calculatedBalance} | Note: ${tx.description}`);
        });

        console.log("---------------------------------------------------------");
        console.log(`\n🧮 Final Calculated Ledger Balance: ₹${calculatedBalance}`);
        console.log(`🏦 Actual Database Wallet Balance:  ₹${actualDbBalance}`);
        
        if (calculatedBalance !== actualDbBalance) {
            console.log(`\n⚠️ DISCREPANCY DETECTED: ₹${actualDbBalance - calculatedBalance} in Ghost Funds.`);
            console.log("Fix: You likely need to create a manual 'Credit' transaction to balance the ledger, OR reset the database wallet to match the ledger.");
        } else {
            console.log("\n✅ Ledger perfectly matches the database.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Audit Failed:", err);
        process.exit(1);
    }
}

runAudit();