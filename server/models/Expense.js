const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    expenseType: { type: String, enum: ['Project Expense', 'Regular Office Expense'], required: true },
    category: { type: String, required: true },
    projectName: { type: String }, // Optional, needed if it's a Project Expense
    descriptionTags: { type: String, required: true },
    amount: { type: Number, required: true },
    
    expenseDate: { type: Date, required: true, default: Date.now }, 

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
    paymentSourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 

    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Returned'], default: 'Pending' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
    adminFeedback: { type: String, default: '' },

    expenseDetails: { type: mongoose.Schema.Types.Mixed, default: {} },

    paymentScreenshotUrls: [{ type: String }],
    expenseMediaUrls: [{ type: String }], 

    inventorySynced: { 
        type: Boolean, 
        default: false 
    },
    linkedInventoryId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Inventory'
    },

    inventoryStatus: {
        type: String,
        enum: ['Available', 'In Use', 'Consumed', 'Lost/Damaged'],
        default: 'Available'
    },
    notes: { type: String },
    
    isReimbursed: { type: Boolean, default: false },
    reimbursementTxnId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null }
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);