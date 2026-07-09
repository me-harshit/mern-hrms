const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, default: "Policy" }, // Policy | Handbook | Pledge | Other

    fileUrl: { type: String, required: true },
    fileName: { type: String, default: "" },
    // SHA-256 of the exact file bytes. Proves *which* file a user acknowledged,
    // even if the S3 object is later replaced.
    fileHash: { type: String, default: "" },

    // Bumped whenever the file is replaced -> everyone must acknowledge again.
    version: { type: Number, default: 1 },

    isActive: { type: Boolean, default: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Document', documentSchema);
