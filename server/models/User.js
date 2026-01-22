const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['EMPLOYEE', 'HR', 'ADMIN'],
        default: 'EMPLOYEE'
    },
    phoneNumber: {
        type: String,
        default: ""
    },
    address: {
        type: String,
        default: ""
    },
    profilePic: {
        type: String,
        default: ""
    },
    aadhaar: {
        type: String,
        default: "Not Updated"
    },
    emergencyContact: {
        type: String,
        default: ""
    },
    joiningDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE'],
        default: 'ACTIVE'
    },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);