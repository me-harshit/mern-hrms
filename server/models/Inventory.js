const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    itemName: { 
        type: String, 
        required: true,
        trim: true 
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
        type: String // Stores the S3 URLs for images/videos
    }],
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Inventory', inventorySchema);