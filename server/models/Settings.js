const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    officeStartTime: { type: String, default: "09:30" }, 
    officeCloseTime: { type: String, default: "18:00" },
    gracePeriod: { type: Number, default: 10 }, 
    halfDayThreshold: { type: Number, default: 30 }
});

module.exports = mongoose.model('Settings', settingsSchema);