const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
    itemName: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    projectName: { type: String },
    
    // Links directly to your existing User table
    purchasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
    
    purchaseDate: { type: Date, required: true, default: Date.now },
    vendorName: { type: String },
    amount: { type: Number, required: true },
    
    // File paths for the uploads
    invoiceUrl: { type: String }, 
    paymentScreenshotUrl: { type: String },
    
    // 👇 CHANGED: Now an array to support multiple photos/videos
    productMediaUrls: [{ type: String }], 
    
    // Inventory Tracking
    storageLocation: { type: String }, // e.g., "A1", "Cupboard B3"
    inventoryStatus: { 
        type: String, 
        enum: ['Available', 'In Use', 'Consumed', 'Lost/Damaged'], 
        default: 'Available' 
    },
    
    notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Purchase', purchaseSchema);