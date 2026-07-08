const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    leaveType: {
        type: String,
        enum: ['CL', 'EL', 'UL'], 
        required: true
    },
    fromDate: {
        type: Date,
        required: true
    },
    toDate: {
        type: Date,
        required: true
    },
    days: {
        type: Number,
        required: true
    },
    // Half-day support: only the first and last day of a range (or the single day)
    // can be a half day. FULL = whole day, FIRST_HALF / SECOND_HALF = 0.5 day.
    startHalf: {
        type: String,
        enum: ['FULL', 'FIRST_HALF', 'SECOND_HALF'],
        default: 'FULL'
    },
    endHalf: {
        type: String,
        enum: ['FULL', 'FIRST_HALF', 'SECOND_HALF'],
        default: 'FULL'
    },
    reason: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    adminComment: {
        type: String,
        default: ""
    }
}, { timestamps: true });

module.exports = mongoose.model('Leave', leaveSchema);