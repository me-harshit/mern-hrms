const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    dayShiftStartTime: { type: String, default: "09:30" }, 
    dayShiftEndTime: { type: String, default: "18:30" },
    nightShiftStartTime: { type: String, default: "19:00" }, 
    nightShiftEndTime: { type: String, default: "04:00" },
    gracePeriod: { type: Number, default: 15 }, 
    halfDayThreshold: { type: Number, default: 30 }
});

module.exports = mongoose.model('Settings', settingsSchema);