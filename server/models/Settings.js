const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    officeStartTime: { type: String, default: "09:30" }, // 24-hour format
    gracePeriod: { type: Number, default: 15 }, // minutes before marked 'Late'
    halfDayThreshold: { type: Number, default: 30 } // minutes before marked 'Half Day'
});

module.exports = mongoose.model('Settings', settingsSchema);