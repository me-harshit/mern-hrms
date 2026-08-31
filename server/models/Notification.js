const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['LEAVE', 'SALARY', 'BIRTHDAY', 'SYSTEM', 'WFH', 'SHORT_LEAVE', 'TASK', 'CHAT'],
        default: 'SYSTEM'
    },
    // In-app route to open when the notification is clicked. Topbar.js and
    // Notifications.js already read this — it just never existed on the schema.
    link: {
        type: String,
        default: ""
    },
    // Stable identifier for the thing this notification is about, so it can be
    // targeted later without matching on human-readable text.
    // Payroll uses `salary:<userId>:<month>:<year>`.
    refKey: {
        type: String,
        default: "",
        index: true
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Remember whether this save was an insert; post('save') alone can't tell, and
// marking a notification as read must not re-push it to the user.
// Promise-style (no `next` argument) — Mongoose 9 dropped callback-style
// middleware, and passing a `next` parameter throws "next is not a function".
NotificationSchema.pre('save', function () {
    this.$locals.wasNew = this.isNew;
});

// Pushing from the model means every notification in the app becomes realtime,
// including the ones created by leaves/wfh/payroll/attendance, without those
// routes needing to know sockets exist.
NotificationSchema.post('save', function (doc) {
    if (!doc.$locals?.wasNew) return;
    try {
        const { emitToUser } = require('../utils/realtime');
        emitToUser(doc.recipient, 'notification:new', doc.toObject());
    } catch (err) {
        console.error('[REALTIME] notification emit failed:', err.message);
    }
});

module.exports = mongoose.model('Notification', NotificationSchema);
