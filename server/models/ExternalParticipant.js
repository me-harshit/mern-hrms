const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * One external person's access to ONE conversation — feature draft Module 2.
 *
 * This row used to carry the person's name and email as well, which made it
 * both the identity and the membership. That collapsed the moment somebody was
 * invited to a second group: their details had to be typed again, giving one
 * human two records that could disagree, and no way to ask "where does this
 * vendor have access". Who they are now lives in models/ExternalUser.js, one
 * row per person, and this is only where they can go.
 *
 * Everything about ACCESS stays here, per conversation, and that is the point:
 * the link, its expiry, its verification code, the approval state and the
 * revocation are all facts about one group. Revoking a vendor from Spectra
 * must leave their access to Coco 2.0 untouched, and a single shared token
 * could not express that.
 *
 * The security model is unchanged and still rests on two rules:
 *   - portal routes take the conversation from this row, never from a request
 *     parameter, so F2.3 is a property of the routing (see routes/portal.js);
 *   - an outsider's token carries `ext`, never `user`, so it is refused by
 *     every internal route (see middleware/authMiddleware.js).
 */

const STATUSES = [
    'invited',    // link sent, never opened
    'pending',    // opened, waiting on the inviter to approve (F2.2)
    'active',     // in the conversation
    'declined',   // the inviter said no
    'revoked'     // access withdrawn; history stays (F2.6)
];

const externalParticipantSchema = new mongoose.Schema({
    /** Who. The directory record; this row holds no copy of their details. */
    externalUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExternalUser',
        required: true,
        index: true
    },

    /**
     * Where. The one conversation this membership can reach.
     *
     * Every portal route derives the thread from this field and never from a
     * url parameter, which is what makes scoped access structural rather than
     * a check somebody has to remember.
     */
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },

    // Denormalised so a revoked membership still shows which project it was
    // for, after the conversation itself has moved on.
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },

    // "We have to know who invited that person" — per group, because the
    // person who brought them into one project is rarely the one who brought
    // them into the next.
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    invitedAt: { type: Date, default: Date.now },

    /**
     * The link, for this group only.
     *
     * Stored as the token itself rather than a hash, deliberately: the inviter
     * has to be able to copy it later and send it over WhatsApp or read it
     * down a phone, which a hash cannot serve. The trade is that database read
     * access is group read access, so the token is 32 random bytes, scoped to
     * one conversation, and expires.
     */
    token: { type: String, required: true, unique: true, index: true },

    /**
     * The emailed verification code (F2.1).
     *
     * Optional and per invitation. Management asked for one-click joining, so
     * this is off unless the inviter ticks the box; when it is on, the link
     * alone is not enough and the code binds it to the mailbox it was sent to.
     */
    code: { type: String, default: null },
    codeAttempts: { type: Number, default: 0 },

    // F2.2. When set, opening the link asks rather than admits.
    requireApproval: { type: Boolean, default: false },

    status: { type: String, enum: STATUSES, default: 'invited' },

    // F2.6 — configurable, defaulted to a week by the invite route.
    expiresAt: { type: Date, required: true },

    firstOpenedAt: { type: Date, default: null },
    joinedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },

    // Their read watermark for this conversation.
    lastReadAt: { type: Date, default: null },

    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Where the link was opened from. Not identification, just the thread of
    // evidence if an invitation is ever disputed.
    lastIp: { type: String, default: '' }
}, { timestamps: true });

/**
 * Access is a live question, not a stored one — an expiry passes on its own,
 * with no job needing to run.
 *
 * Takes the directory record when it has been populated, so that a person
 * blocked company-wide is shut out of every group at once rather than one
 * membership at a time. Callers that have not populated it must check
 * externalUser.isActive themselves; middleware/externalAuthMiddleware.js
 * always populates.
 */
externalParticipantSchema.methods.hasAccess = function () {
    const person = this.externalUser;
    if (person && typeof person === 'object' && person.isActive === false) return false;

    if (this.status !== 'active') return false;
    if (this.revokedAt) return false;
    if (this.expiresAt && this.expiresAt < new Date()) return false;
    return true;
};

/** The panel listing a group's externals, newest invitation first. */
externalParticipantSchema.index({ conversationId: 1, createdAt: -1 });

// "Where does this person have access" — the directory's detail view.
externalParticipantSchema.index({ externalUser: 1, createdAt: -1 });

// "Who has this person let in", for the accountability view.
externalParticipantSchema.index({ invitedBy: 1, createdAt: -1 });

/**
 * One live membership per person per conversation.
 *
 * Partial so that revoked and declined rows — kept as the record of what
 * happened — do not block the same person being invited back later.
 */
externalParticipantSchema.index(
    { conversationId: 1, externalUser: 1 },
    {
        unique: true,
        partialFilterExpression: { status: { $in: ['invited', 'pending', 'active'] } }
    }
);

externalParticipantSchema.statics.mintToken = () => crypto.randomBytes(32).toString('hex');

// Six digits, from the CSPRNG rather than Math.random: a predictable code is
// not a second factor.
externalParticipantSchema.statics.mintCode = () =>
    String(crypto.randomInt(0, 1000000)).padStart(6, '0');

module.exports = mongoose.model('ExternalParticipant', externalParticipantSchema);
module.exports.STATUSES = STATUSES;
