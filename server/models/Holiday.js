const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
    name: { type: String, required: true },
    date: { type: Date, required: true }, // Store as Date object
    type: { type: String, default: 'Public' } // Optional: Public, Restricted, etc.
});

module.exports = mongoose.model('Holiday', holidaySchema);