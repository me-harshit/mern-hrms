const mongoose = require('mongoose');

const documentAcknowledgementSchema = new mongoose.Schema({
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Which version of the document was acknowledged.
    version: { type: Number, required: true },
    // Hash of the file at the moment of signing (audit trail).
    fileHash: { type: String, default: "" },

    // --- Click-wrap e-signature record ---
    signedName: { type: String, required: true },   // typed full name
    acknowledgedAt: { type: Date, default: Date.now },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" }
}, { timestamps: true });

// A user acknowledges a given version of a document exactly once.
documentAcknowledgementSchema.index({ documentId: 1, userId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('DocumentAcknowledgement', documentAcknowledgementSchema);
