const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        trim: true
    },
    address: { 
        type: String, 
        required: true 
    },
    gstNumber: { 
        type: String, 
        trim: true,
        uppercase: true 
    },
    notes: { 
        type: String 
    },
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);