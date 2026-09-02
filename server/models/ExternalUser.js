const mongoose = require('mongoose');

/**
 * A person outside the company, as a company-wide record — feature draft
 * Module 2, and the answer to F2.7's open question about whether a vendor
 * profile is per-project or company-wide.
 *
 * Split out of ExternalParticipant, which used to be identity and membership
 * at once. That worked while somebody was only ever in one conversation, and
 * broke the moment they were in two: their name, email and company had to be
 * typed again for the second group, giving one person two records that could
 * disagree about who they were, and no way to see everywhere they had access.
 *
 * So the two facts are now separate:
 *
 *   ExternalUser        who they are        — one row per person, forever
 *   ExternalParticipant where they can go   — one row per conversation
 *
 * Their access, their link, its expiry and its verification code all stay on
 * the membership. That is deliberate: revoking a vendor from one project must
 * not touch their access to another, and a single shared link would make that
 * impossible to express.
 */

// What kind of outsider this is. Not free text: the point of the field is to
// be able to filter and count by it, which a typed-in string cannot serve.
const EXTERNAL_TYPES = ['VENDOR', 'CLIENT', 'CONSULTANT', 'CONTRACTOR', 'OTHER'];

const externalUserSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },

    /**
     * The identity key. One row per address, company-wide.
     *
     * Lowercased and uniquely indexed, because Name@Vendor.com and
     * name@vendor.com are the same person and two rows for them would put the
     * same human in a group twice under two different names.
     */
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true,
        index: true
    },

    company: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },

    type: { type: String, enum: EXTERNAL_TYPES, default: 'VENDOR' },

    // Free-form context for whoever looks them up later: what they supply, who
    // owns the relationship, anything the next person would want to know.
    notes: { type: String, default: '', trim: true },

    /**
     * Blocked company-wide.
     *
     * Distinct from revoking one membership. This is the switch for "this
     * person should not be able to reach us anywhere", and the portal checks
     * it on every request alongside the per-group status, so it takes effect
     * everywhere at once without having to walk their conversations.
     */
    isActive: { type: Boolean, default: true },
    deactivatedAt: { type: Date, default: null },
    deactivatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

/**
 * The visible identity (F2.4 — "each vendor gets an ID").
 *
 * Derived from the _id rather than counted, because a sequential counter needs
 * either a document every insert races on or a scan of the collection. The
 * last five hex characters of an ObjectId come from its random and counter
 * portions, so this needs no extra field, no migration and no lock.
 *
 * It lives on the person, not on the membership: an ID that changed when
 * somebody was added to a second project would not be an identity.
 */
externalUserSchema.virtual('externalId').get(function () {
    return `EXT-${String(this._id).slice(-5).toUpperCase()}`;
});

externalUserSchema.set('toJSON', { virtuals: true });
externalUserSchema.set('toObject', { virtuals: true });

// The directory list: by name, and by type.
externalUserSchema.index({ name: 1 });
externalUserSchema.index({ type: 1, name: 1 });

module.exports = mongoose.model('ExternalUser', externalUserSchema);
module.exports.EXTERNAL_TYPES = EXTERNAL_TYPES;
