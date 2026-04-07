const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    itemName: { 
        type: String, 
        required: true,
        trim: true 
    },
    quantity: {
        type: Number,
        required: true,
        default: 1,
        min: 1
    },
    price: { 
        type: Number, 
        default: null 
    },
    status: { 
        type: String, 
        enum: ['Available', 'Assigned', 'Damaged', 'Lost'], 
        default: 'Available' 
    },
    storageLocation: { 
        type: String 
    },
    assignedTo: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        default: null
    },
    notes: { 
        type: String 
    },
    mediaUrls: [{ 
        type: String 
    }],
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true
    },
    linkedExpenseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Expense',
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('Inventory', inventorySchema);