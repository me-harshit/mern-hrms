const mongoose = require('mongoose');
const { mediaSchema } = require('./Task');

/**
 * One message in a conversation.
 *
 * Reuses `mediaSchema` from Task rather than defining its own attachment shape,
 * which is what lets a chat attachment ride the pipeline that already exists:
 * images and voice notes land on S3 immediately, a screen recording stages on
 * the VPS (so it plays back at once) and the midnight cron swaps it for the
 * compressed S3 copy. TaskComment does the same thing for the same reason.
 */

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },

    // Null for system messages ("Riya added Amit"), and for anything an
    // external participant wrote - see externalSender below.
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /**
     * Set instead of `sender` when the author is a vendor or other outsider
     * writing through the portal (feature draft Module 2).
     *
     * A separate field rather than a polymorphic sender/senderModel pair,
     * because exactly one question is asked of it everywhere in the client and
     * the server: is this from inside the company or outside. A single field
     * that is either populated or not answers that at a glance, and it makes
     * the External badge (F2.4) impossible to forget to render - there is no
     * value of `sender` that could stand in for an outsider by accident.
     */
    externalSender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExternalParticipant',
        default: null
    },

    text: { type: String, default: '', trim: true },

    // Images, files, voice notes and screen recordings.
    attachments: [mediaSchema],

    /**
     * People @mentioned in `text` (F3.5).
     *
     * Stored as ids resolved at send time rather than re-parsed from the text
     * on read: a display name can change, and a mention should keep notifying
     * the person it meant, not whoever is called that today.
     */
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // WhatsApp-style quoted reply. Not populated deeply — the client only needs
    // the snippet, so a light denormalised copy avoids an N+1 on thread render.
    replyTo: {
        messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
        text: { type: String, default: '' },
        senderName: { type: String, default: '' },
        kind: { type: String, default: 'text' }
    },

    /**
     * Membership changes, rendered as centred grey pills rather than bubbles.
     * `text` carries the rendered sentence so old events keep reading correctly
     * even if the wording changes later.
     */
    systemEvent: {
        type: {
            type: String,
            enum: [
                'created', 'added', 'removed', 'left', 'renamed', 'joined_via_link',
                // Module 2. An outsider arriving or losing access is the single
                // most important thing to be able to see in the thread
                // afterwards, so it is announced inline like any other
                // membership change.
                'external_invited', 'external_joined', 'external_revoked', null
            ],
            default: null
        },
        actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        targets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    },

    /**
     * Read receipts (F3.8) — who has actually opened this message.
     *
     * Distinct from Conversation.members.lastReadAt, which answers "how many
     * unread do I have" cheaply. This answers "has Amit seen it", which is what
     * the ticks show, and only that needs a per-message row.
     *
     * Capped in practice by group size; a 200-person group is not what this
     * product is for.
     */
    readBy: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        _id: false
    }],

    /**
     * The external mirror of readBy. Kept apart rather than adding a type
     * discriminator to the rows above, so that counting how many *colleagues*
     * have read a message - which is what the ticks mean - does not have to
     * filter outsiders back out on every render.
     */
    readByExternal: [{
        participant: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalParticipant' },
        at: { type: Date, default: Date.now },
        _id: false
    }],

    editedAt: { type: Date, default: null },

    /**
     * Delete-for-everyone: the row stays so the thread keeps its shape and
     * replies quoting it still resolve, but the content is not sent to clients.
     * Matches WhatsApp's "This message was deleted".
     */
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

// Thread render and pagination: newest N in one conversation.
messageSchema.index({ conversationId: 1, createdAt: -1 });

/*
 * No text index here on purpose.
 *
 * Search (F3.9) always runs inside the set of conversations the searcher
 * belongs to, and MongoDB will not combine a $text stage with that id filter
 * without a compound index it cannot build on a text field. The route narrows
 * by conversationId first — which the index above serves — and matches within
 * that. A text index would therefore never be consulted while still costing on
 * every message written. Revisit if global search ever needs relevance ranking
 * rather than recency.
 */

// "What have I been mentioned in" without scanning the collection.
messageSchema.index({ mentions: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
