const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    itemName: { 
        type: String, 
        required: true,
        trim: true 
    },
    // 👇 NEW: The Magic Quantity Field 👇
    quantity: {
        type: Number,
        required: true,
        default: 1,
        min: 1
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
    }
}, { timestamps: true });

module.exports = mongoose.model('Inventory', inventorySchema);