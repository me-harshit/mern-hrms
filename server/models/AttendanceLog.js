const mongoose = require('mongoose');

const attendanceLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    employeeId: { type: String, required: true }, // Biometric ID (e.g. GTS003)
    timestamp: { type: Date, required: true },
    direction: { type: String, enum: ['IN', 'OUT'], required: true },
    deviceId: { type: String, required: true }, // e.g., 'Hik_In' or 'Hik_Out'
    shiftDate: { type: String, required: true } // Formatted 'DD/MM/YYYY'
}, { timestamps: true });

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);