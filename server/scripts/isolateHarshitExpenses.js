require('dotenv').config();
const mongoose = require('mongoose');
const Expense = require('../models/Expense');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    try {
        const exps = await Expense.find({paymentSourceId: '6971a5a5afce1f1e8782bc38', status: 'Approved', isReimbursed: false});
        let target = 1643;
        let found = [];
        
        const findSubset = (arr, target, partial) => { 
            let s = partial.reduce((a,b)=>a+b.amount, 0); 
            if (s === target) { found = partial; return true; } 
            if (s > target) return false; 
            for (let i=0; i<arr.length; i++) { 
                if (findSubset(arr.slice(i+1), target, [...partial, arr[i]])) return true; 
            } 
            return false; 
        }; 
        
        findSubset(exps, target, []);
        
        if (found.length === 0) {
            console.log("Could not find combination summing to 1643");
            process.exit(1);
        }
        
        const foundIds = found.map(e => e._id.toString());
        console.log(`Found ${foundIds.length} expenses summing to 1643. Keeping them unpaid.`);
        
        // Mark all other expenses as reimbursed
        const result = await Expense.updateMany(
            { 
                paymentSourceId: '6971a5a5afce1f1e8782bc38', 
                status: 'Approved', 
                isReimbursed: false,
                _id: { $nin: foundIds } 
            },
            { $set: { isReimbursed: true, adminFeedback: 'Settled automatically against wallet advance.' } }
        );
        
        console.log(`Updated ${result.modifiedCount} expenses as reimbursed.`);
        process.exit(0);
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
});
