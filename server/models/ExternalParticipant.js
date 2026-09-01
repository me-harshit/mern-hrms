const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Somebody outside the company who has been let into exactly one conversation
 * — feature draft Module 2 (F2.1-F2.7).
 *
 * A separate collection rather than a User row with a role of EXTERNAL, and
 * that choice is the whole security model of this module.
 *
 * A User carries a token that satisfies middleware/authMiddleware, which every
 * one of the two dozen route files in this server trusts. Making a vendor a
 * User would mean F2.3 ("sees only the group they were invited to") had to be
 * re-established by hand in payroll, attendance, tasks, employees, documents
 * and everywhere else — and the first route that forgot would hand an outsider
 * employee data. Giving them their own identity instead means the default is
 * no access to anything, and the only thing that grants access is the portal
 * middleware, which resolves the conversation from this row rather than from
 * anything the caller sends.
 *
 * Membership also lives here, not as a second array on Conversation. One row
 * is the invitation, the identity and the membership at once, so there is no
 * pair of lists that can drift apart.
 */

const STATUSES = [
    'invited',    // link sent, never opened
    'pending',    // opened, waiting on the inviter to approve (F2.2)
    'active',     // in the conversation
    'declined',   // the inviter said no
    'revoked'     // access withdrawn; history stays (F2.6)
];

const externalParticipantSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },

    /**
     * Where the invite was sent, and the identity the code is checked against.
     * Lowercased because an invite to Name@Vendor.com and one to
     * name@vendor.com are the same person, and a duplicate row would give them
     * two identities in the same thread.
     */
    email: { type: String, required: true, trim: true, lowercase: true },

    company: { type: String, default: '', trim: true },

    /**
     * The one conversation this person can reach. Every portal route derives
     * the thread from this field and never from a url parameter, which is what
     * makes F2.3 structural rather than a check somebody has to remember.
     */
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },

    // Denormalised so a revoked participant still shows which project they were
    // brought into after the conversation has moved on.
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },

    // "We have to know who invited that person."
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    invitedAt: { type: Date, default: Date.now },

    /**
     * The link. Stored as the token itself rather than a hash, deliberately:
     * the inviter has to be able to copy it later and send it over WhatsApp or
     * read it down a phone, which a hash cannot serve. The trade is that
     * database read access is group read access, so the token is 32 random
     * bytes, scoped to one conversation, and expires.
     */
    token: { type: String, required: true, unique: true, index: true },

    /**
     * The emailed verification code (F2.1).
     *
     * Optional. Management asked for one-click joining, so this is off unless
     * the inviter ticks the box; when it is on, the link alone is not enough
     * and the code binds it to the mailbox it was sent to. Six digits is weak
     * on its own and strong enough alongside a 32-byte token.
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

    // Their own read watermark, the external mirror of members[].lastReadAt.
    lastReadAt: { type: Date, default: null },

    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Where the link was opened from. Not identification, just the thread of
    // evidence if an invite is ever disputed.
    lastIp: { type: String, default: '' }
}, { timestamps: true });

/**
 * The visible identity (F2.4 — "each vendor gets an ID").
 *
 * Derived from the _id rather than counted, because a sequential counter needs
 * either a counter document every insert races on, or a scan of the collection.
 * The last five hex characters of an ObjectId are drawn from its random and
 * counter portions, so two rows colliding inside one conversation is not a
 * practical concern, and this needs no extra field, no migration and no lock.
 */
externalParticipantSchema.virtual('externalId').get(function () {
    return `EXT-${String(this._id).slice(-5).toUpperCase()}`;
});

externalParticipantSchema.set('toJSON', { virtuals: true });
externalParticipantSchema.set('toObject', { virtuals: true });

/** Access is a live question, not a stored one — an expiry passes on its own. */
externalParticipantSchema.methods.hasAccess = function () {
    if (this.status !== 'active') return false;
    if (this.revokedAt) return false;
    if (this.expiresAt && this.expiresAt < new Date()) return false;
    return true;
};

/** The panel listing a group's externals, newest invite first. */
externalParticipantSchema.index({ conversationId: 1, createdAt: -1 });

// "Who has this person let in", for the accountability view.
externalParticipantSchema.index({ invitedBy: 1, createdAt: -1 });

/**
 * One live invitation per address per conversation.
 *
 * Partial so that revoked and declined rows — which are kept as the record of
 * what happened — do not block the same vendor being invited back later.
 */
externalParticipantSchema.index(
    { conversationId: 1, email: 1 },
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
