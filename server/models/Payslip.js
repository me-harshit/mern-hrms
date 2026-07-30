const mongoose = require('mongoose');

const payslipSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    month: {
        type: Number, // 1-12
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    baseSalary: {
        type: Number,
        required: true
    },
    totalWorkingDays: {
        type: Number,
        required: true
    },
    payableDays: {
        type: Number,
        required: true
    },
    calculatedSalary: {
        type: Number,
        required: true
    },
    breakdown: {
        present: { type: Number, default: 0 },
        wfh: { type: Number, default: 0 },
        onLeave: { type: Number, default: 0 },
        unpaidLeave: { type: Number, default: 0 },
        halfDays: { type: Number, default: 0 },
        absent: { type: Number, default: 0 }
    },
    status: {
        type: String,
        enum: ['Generated', 'Paid'],
        default: 'Generated'
    }
}, { timestamps: true });

// Ensure one payslip per user per month/year
payslipSchema.index({ userId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Payslip', payslipSchema);
