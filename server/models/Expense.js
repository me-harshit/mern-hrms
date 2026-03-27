const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    // Core Categorization
    expenseType: { type: String, enum: ['Project Expense', 'Regular Office Expense'], required: true },
    category: { type: String, required: true },
    projectName: { type: String }, // Optional, needed if it's a Project Expense
    descriptionTags: { type: String, required: true },
    amount: { type: Number, required: true },
    
    expenseDate: { type: Date, required: true, default: Date.now }, 

    // Routing & Tracking
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
    paymentSourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 

    // Approval Flow
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 

    expenseDetails: { type: mongoose.Schema.Types.Mixed, default: {} },

    // File paths
    paymentScreenshotUrls: [{ type: String }],
    expenseMediaUrls: [{ type: String }], 

    // Legacy / Admin Notes
    inventoryStatus: {
        type: String,
        enum: ['Available', 'In Use', 'Consumed', 'Lost/Damaged'],
        default: 'Available'
    },
    notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);