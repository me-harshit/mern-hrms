const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // --- BASIC INFO ---
    employeeId: { type: String, default: "" },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    workEmail: { type: String, default: "", lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['EMPLOYEE', 'ADMIN', 'HR', 'MANAGER', 'ACCOUNTS'], default: 'EMPLOYEE' },

    // --- JOB / ORG ---
    jobTitle: { type: String, default: "" },
    department: { type: String, default: "" },
    workLocation: { type: String, enum: ['WFO', 'WFH', 'HYBRID', ''], default: '' },
    employmentType: { type: String, default: "" }, // e.g. Full-time, Internship

    shiftType: { type: String, enum: ['DAY', 'NIGHT'], default: 'DAY' },
    dateOfBirth: { type: Date },
    bloodGroup: { type: String, default: "" },

    isPurchaser: { type: Boolean, default: false },
    status: { type: String, default: 'ACTIVE' },
    joiningDate: { type: Date, default: Date.now },
    profilePic: { type: String, default: "" },

    // --- CONTACT DETAILS ---
    phoneNumber: { type: String, default: "" },
    address: { type: String, default: "" }, // kept for backward compatibility (mirrors currentAddress)
    permanentAddress: { type: String, default: "" },
    currentAddress: { type: String, default: "" },
    aadhaar: { type: String, default: "" },
    emergencyContact: { type: String, default: "" }, // phone (kept for backward compatibility)
    emergencyContactName: { type: String, default: "" },
    emergencyContactRelation: { type: String, default: "" },

    // --- REPORTING MANAGER ---
    reportingManagerName: { type: String, default: "" },
    reportingManagerEmail: { type: String, default: "" },

    // --- HR & LEAVE SETTINGS ---
    salary: { type: Number, default: 0 }, 
    casualLeaveBalance: { type: Number, default: 1 }, 
    earnedLeaveBalance: { type: Number, default: 0 },
    leavesLastReset: { type: Date, default: Date.now }

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);