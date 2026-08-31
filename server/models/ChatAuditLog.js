const mongoose = require('mongoose');

/**
 * Record of an oversight read: an admin opening a conversation they are not an
 * ordinary participant in, or acting inside one as a hidden member.
 *
 * Management chose the silent-presence option for F3.10 (feature draft §4). The
 * log is what keeps that defensible internally — the access is invisible to
 * members, but it is not invisible to the company. It also means that if the
 * policy later moves to the disclosed audit view §4 recommends, the evidence of
 * who looked at what already exists rather than starting from empty.
 *
 * Written best-effort. A logging failure must never block the read, or an
 * admin investigating an incident is stopped by a database hiccup.
 */
const chatAuditLogSchema = new mongoose.Schema({
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole: { type: String, default: '' },

    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },

    action: {
        type: String,
        enum: ['read', 'search', 'post', 'join_hidden', 'leave_hidden'],
        required: true
    },

    // Free-form context: the search term, the message count returned, etc.
    detail: { type: String, default: '' },

    ip: { type: String, default: '' }
}, { timestamps: true });

chatAuditLogSchema.index({ conversationId: 1, createdAt: -1 });
chatAuditLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('ChatAuditLog', chatAuditLogSchema);
