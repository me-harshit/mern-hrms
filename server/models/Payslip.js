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
        absent: { type: Number, default: 0 },
        // Sundays and holidays charged under the sandwich rule.
        sandwich: { type: Number, default: 0 },
        // Working days with neither an attendance row nor a leave to explain
        // them. Never charged; kept so the gap is on the record.
        noRecord: { type: Number, default: 0 },
        // Casual leave spent against unapplied half days when this payslip was
        // finalized. The employee's balance was debited by this much, and
        // reverting the payslip gives it back.
        clAdjustment: { type: Number, default: 0 }
    },
    // The exact days off the sandwich rule charged for, as D/M/YYYY, so a
    // query months later can be answered without recalculating anything.
    sandwichDates: [{ type: String }],
    // How the pay period was made up. Purely a record of what HR saw when
    // finalizing: salary is always base/30 per day, never divided by these.
    calendar: {
        daysInMonth: { type: Number },
        workingDays: { type: Number },
        sundays: { type: Number },
        holidays: { type: Number }
    },
    status: {
        type: String,
        enum: ['Generated', 'Paid'],
        default: 'Generated'
    },
    // Employee-initiated request to have this payslip emailed to them.
    // A payslip must already be finalized before it can be requested; a new
    // request overwrites the previous one, so an employee can ask again for a
    // resend after a rejection or a bounced email.
    request: {
        status: {
            type: String,
            enum: ['None', 'Pending', 'Approved', 'Rejected'],
            default: 'None'
        },
        requestedAt: { type: Date },
        actionedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        actionedAt: { type: Date },
        rejectionReason: { type: String, default: '' },
        // Where the payslip was actually delivered, recorded only on a
        // confirmed send so a failed SMTP attempt isn't reported as sent.
        emailedTo: { type: String, default: '' },
        emailedAt: { type: Date }
    }
}, { timestamps: true });

// Admin queue reads pending requests across all users, oldest first.
payslipSchema.index({ 'request.status': 1, 'request.requestedAt': 1 });

// Ensure one payslip per user per month/year
payslipSchema.index({ userId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Payslip', payslipSchema);
