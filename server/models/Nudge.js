const mongoose = require('mongoose');

/**
 * A nudge is one person asking one assignee "how long will this take?".
 *
 * It is deliberately *not* a task comment. A comment is a conversation with no
 * shape — nobody can query "who was asked and never answered". A nudge is a
 * question with a known recipient, a known channel set, and an answer slot that
 * is either filled or conspicuously empty, which is the whole point of the
 * feature: the assigner wants an ETA back, not a chat.
 *
 * One document per recipient rather than one per nudge-with-many-recipients:
 * delivery succeeds or fails per person (their email bounces, their WhatsApp
 * number is missing), and each of them answers separately. A shared document
 * would have to carry parallel arrays of both and could never be indexed by
 * "my unanswered nudges".
 */

const NUDGE_CHANNELS = ['inApp', 'email', 'whatsapp'];
const DELIVERY_STATUSES = ['pending', 'sent', 'failed', 'skipped'];
const NUDGE_STATUSES = ['pending', 'answered', 'cancelled'];

/**
 * What happened on one channel for this one nudge.
 *
 * `skipped` is distinct from `failed` on purpose — "the employee has no
 * WhatsApp number" and "OpenWA was down" both mean the message did not arrive,
 * but only the second is worth retrying, and only the first is worth telling
 * the sender to go fix a profile.
 */
const deliverySchema = new mongoose.Schema({
    channel: { type: String, enum: NUDGE_CHANNELS, required: true },
    status: { type: String, enum: DELIVERY_STATUSES, default: 'pending' },

    // Provider id on success, the error on failure, the reason on skip.
    detail: { type: String, default: "" },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, default: null }
}, { _id: false });

const nudgeSchema = new mongoose.Schema({
    /**
     * Which collection `taskId` points into. A recurring schedule can be nudged
     * about as a whole ("this daily report keeps landing late"), separately from
     * any one day it generated — the same split TaskComment already makes.
     */
    ownerModel: { type: String, enum: ['Task', 'RecurringTask'], default: 'Task' },
    taskId: { type: mongoose.Schema.Types.ObjectId, refPath: 'ownerModel', required: true },

    nudgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Optional free text from the sender. Empty means the default ETA question.
    message: { type: String, default: "", trim: true },

    /**
     * Which channels the sender asked for. In-app is always present — it is not
     * offered as a choice anywhere in the UI because a nudge that exists only in
     * an email has no record inside the app the employee can act on.
     */
    channels: {
        type: [{ type: String, enum: NUDGE_CHANNELS }],
        default: ['inApp']
    },
    deliveries: [deliverySchema],

    status: { type: String, enum: NUDGE_STATUSES, default: 'pending' },

    /**
     * The answer.
     *
     * Two fields for the ETA because the two ways of answering give different
     * precision. A quick-reply from the email ("about an hour") produces both an
     * `etaAt` derived from the preset and the label that was clicked; a typed
     * answer in the app produces an exact `etaAt` and no label. Reporting reads
     * `etaAt`; the UI shows `etaLabel` when there is one, because "about an
     * hour" is more honest than the false precision of a timestamp.
     */
    response: {
        etaAt: { type: Date, default: null },
        etaLabel: { type: String, default: "" },
        note: { type: String, default: "" },
        respondedAt: { type: Date, default: null },
        via: { type: String, enum: ['app', 'email', 'whatsapp', ''], default: '' }
    }
}, { timestamps: true });

// "What am I being asked about, and have I answered it" — drives the badge and
// the response box on the task page.
nudgeSchema.index({ recipient: 1, status: 1, createdAt: -1 });

// The nudge history shown on a task, and the cooldown check before sending.
nudgeSchema.index({ taskId: 1, ownerModel: 1, createdAt: -1 });

module.exports = mongoose.model('Nudge', nudgeSchema);
module.exports.NUDGE_CHANNELS = NUDGE_CHANNELS;
module.exports.NUDGE_STATUSES = NUDGE_STATUSES;
module.exports.DELIVERY_STATUSES = DELIVERY_STATUSES;
