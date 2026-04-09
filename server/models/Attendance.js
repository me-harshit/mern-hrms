const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: String,
        required: true
    },
    checkIn: {
        type: Date,
        required: function () {
            return !['Absent', 'On Leave', 'Pending'].includes(this.status);
        }
    },
    checkOut: {
        type: Date
    },
    status: {
        type: String,
        enum: ['Present', 'Absent', 'Half Day', 'Late', 'On Leave', 'WFH', 'Pending'],
        default: 'Pending'
    },
    totalHours: {
        type: Number, // Stored in decimal hours (e.g. 8.5)
        default: 0
    },
    breakTimeTaken: {
        type: Number, // In minutes
        default: 0
    },
    note: {
        type: String, // For "Late by 30 mins" or admin overrides
        default: ""
    }
}, { timestamps: true });

attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);