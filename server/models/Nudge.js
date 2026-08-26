const mongoose = require('mongoose');

/**
 * A nudge is a ping: "someone is waiting on this task".
 *
 * It is deliberately not a question and not a conversation. Nobody replies to
 * it, nothing is expected back, and there is no ETA to record — the employee
 * simply learns that the work is being watched, and the task carries a count of
 * how many times that has happened. That count is the whole point: a task
 * nudged five times is visibly different from one nudged never, without anyone
 * having to read a thread to find out.
 *
 * Anything the assignee wants to say goes in the existing discussion thread,
 * which already exists and is better at it.
 *
 * One document per recipient rather than one per nudge-with-many-recipients:
 * delivery succeeds or fails per person (their WhatsApp number is missing, the
 * gateway is down), and "how many nudges has this person had" is a question
 * worth being able to index.
 */

const NUDGE_CHANNELS = ['inApp', 'whatsapp'];
const DELIVERY_STATUSES = ['pending', 'sent', 'failed', 'skipped'];

/**
 * What happened on one channel for this one nudge.
 *
 * `skipped` is distinct from `failed` on purpose — "the employee has no
 * WhatsApp number" and "the gateway was down" both mean the message did not
 * arrive, but only the second is worth retrying, and only the first is worth
 * telling the sender to go fix a profile.
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

    /**
     * Which channels the sender asked for. In-app is always present — it is not
     * offered as a choice anywhere in the UI because a nudge that exists only on
     * WhatsApp leaves no record inside the app to count.
     */
    channels: {
        type: [{ type: String, enum: NUDGE_CHANNELS }],
        default: ['inApp']
    },
    deliveries: [deliverySchema]
}, { timestamps: true });

// The nudge history and count shown on a task, and the cooldown check before
// sending.
nudgeSchema.index({ taskId: 1, ownerModel: 1, createdAt: -1 });

// "How much has this person been chased" — across every task.
nudgeSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Nudge', nudgeSchema);
module.exports.NUDGE_CHANNELS = NUDGE_CHANNELS;
module.exports.DELIVERY_STATUSES = DELIVERY_STATUSES;
