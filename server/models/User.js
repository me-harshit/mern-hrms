const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // --- BASIC INFO ---
    employeeId: { type: String, default: "" },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    workEmail: { type: String, default: "", lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['EMPLOYEE', 'ADMIN', 'HR', 'MANAGER', 'TEAM LEAD', 'ACCOUNTS'], default: 'EMPLOYEE' },

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

    /**
     * WhatsApp is deliberately its own field rather than reusing phoneNumber.
     *
     * The two are the same number for most people and emphatically not for
     * some — a work handset that has never had WhatsApp installed, a personal
     * number someone is happy to be messaged on but does not want in the
     * directory. Sending automated messages to whatever happens to be in
     * `phoneNumber` is how a company ends up texting a landline every morning.
     *
     * Left empty, notifications fall back to phoneNumber, so nothing has to be
     * backfilled for the feature to work on day one.
     */
    whatsappNumber: { type: String, default: "" },

    // Opt-out. Defaults to true so existing employees are reachable, and the
    // nudge/notification path checks it before every WhatsApp send.
    whatsappNotificationsEnabled: { type: Boolean, default: true },
    address: { type: String, default: "" }, // kept for backward compatibility (mirrors currentAddress)
    permanentAddress: { type: String, default: "" },
    currentAddress: { type: String, default: "" },
    aadhaar: { type: String, default: "" },
    emergencyContact: { type: String, default: "" }, // phone (kept for backward compatibility)
    emergencyContactName: { type: String, default: "" },
    emergencyContactRelation: { type: String, default: "" },

    // --- REPORTING MANAGER & TEAM LEAD ---
    reportingManagerName: { type: [String], default: [] },
    reportingManagerEmail: { type: [String], default: [] },
    teamLeadsName: { type: [String], default: [] },
    teamLeadsEmail: { type: [String], default: [] },

    // --- PASSWORD RESET ---
    // select:false so these never ride along on /auth/me, the employee
    // directory, or any other query that forgets to exclude them.
    resetPasswordCodeHash: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    resetPasswordAttempts: { type: Number, default: 0, select: false },

    // --- HR & LEAVE SETTINGS ---
    salary: { type: Number, default: 0 }, 
    casualLeaveBalance: { type: Number, default: 1 }, 
    earnedLeaveBalance: { type: Number, default: 0 },
    leavesLastReset: { type: Date, default: Date.now }

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);