const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // --- BASIC INFO ---
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['EMPLOYEE', 'ADMIN', 'HR'], default: 'EMPLOYEE' },
    status: { type: String, default: 'ACTIVE' },
    joiningDate: { type: Date, default: Date.now },
    profilePic: { type: String, default: "" },

    // --- CONTACT DETAILS (Restored) ---
    phoneNumber: { type: String, default: "" },
    address: { type: String, default: "" },
    aadhaar: { type: String, default: "" },
    emergencyContact: { type: String, default: "" },

    // --- HR & LEAVE SETTINGS (New) ---
    salary: { type: Number, default: 0 }, 
    
    // Auto-managed leave balances
    casualLeaveBalance: { type: Number, default: 1 }, 
    earnedLeaveBalance: { type: Number, default: 0 },
    leavesLastReset: { type: Date, default: Date.now }

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);