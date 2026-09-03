const mongoose = require('mongoose');

/**
 * One thing that happened on a project — feature draft F1.8.
 *
 * An append-only log, written at the point each event occurs, rather than a
 * feed assembled at read time by merging Task, Message and ExternalParticipant.
 * Three reasons that merge was rejected:
 *
 *   - it is four collections sorted together on every render of the tab, and
 *     cursor pagination across four independently-ordered sources cannot be
 *     expressed without over-fetching all of them;
 *   - a status change is not a document, it is a transition. Task.statusHistory
 *     records it, but pulling "every status change on this project, newest
 *     first" out of an array nested inside every task means unwinding the whole
 *     task collection to render one page of a feed;
 *   - Module 6 (analytics) wants exactly this shape anyway — who did what,
 *     when, on which project.
 *
 * The trade is that history starts the day this ships: nothing backfills it,
 * and the feed must read as "recent activity", never as a complete audit of the
 * project's life. ChatAuditLog remains the record for oversight reads; this is
 * a product feature, not a compliance one.
 *
 * Every write goes through utils/projectActivity.js → recordActivity, which
 * swallows its own errors. A feed row is never worth failing the task
 * assignment or the message send that produced it.
 */

const ACTIVITY_TYPES = [
    'task_created',
    'task_status',      // moved between statuses; meta carries from/to
    'task_completed',
    'task_attachment',
    'message',          // internal chat in a project-scoped conversation
    'vendor_message',   // an external participant wrote in one (F1.6)
    'vendor_invited',
    'vendor_joined',
    'vendor_revoked',
    'group_created'
];

const projectActivitySchema = new mongoose.Schema({
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true
    },

    type: { type: String, enum: ACTIVITY_TYPES, required: true },

    /**
     * Who did it. Exactly one of these is set — mirroring the split on
     * models/Message.js, and for the same reason: "was this us or an outsider"
     * is the only question the feed ever asks of the author, and a single
     * populated-or-not field makes the External badge (F2.4) impossible to
     * forget to render.
     *
     * Both are null for anything the system did on its own.
     */
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    externalActor: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalUser', default: null },

    /**
     * The author's name as it was at the time.
     *
     * Denormalised deliberately. The feed is read far more often than it is
     * written, and populating two different author collections across a page of
     * mixed rows costs two extra queries per page to render text that has
     * already been decided. It also keeps a revoked vendor's events readable
     * after their directory record is deactivated.
     */
    actorName: { type: String, default: '' },

    /**
     * The rendered sentence, e.g. "Riya moved 'Site survey' to In Progress".
     *
     * Stored rather than composed on read so that old events keep reading
     * correctly when the wording changes later — the same choice
     * models/Message.js makes for system lines.
     */
    text: { type: String, default: '' },

    // What it happened to, for the row's click target.
    refModel: {
        type: String,
        enum: ['Task', 'Conversation', 'Message', 'ExternalParticipant', null],
        default: null
    },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // In-app route the row opens. Resolved at write time because the caller
    // already knows where the thing lives; the feed should not have to
    // reconstruct a URL per row per render.
    link: { type: String, default: '' },

    /**
     * Type-specific extras the row renders but does not filter on — the
     * from/to of a status change, an attachment count, the conversation a
     * message landed in. Loose on purpose: pinning a schema here would mean a
     * migration every time a new event type carries a new detail, and nothing
     * queries inside it.
     */
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },

    /**
     * When the feed should show this, which is not always when it was written.
     *
     * Consecutive events of the same kind, by the same person, in the same
     * place collapse into a single row — see recordActivity's `collapseMs`.
     * Twenty messages in a group over one lunchtime are one line saying so,
     * not twenty lines that bury every task and vendor event under chat noise.
     *
     * Collapsing means moving an existing row back to the top, and
     * `timestamps: true` makes createdAt immutable. So the feed sorts on this
     * field, and createdAt stays honest about when the row was first written.
     */
    at: { type: Date, default: Date.now }
}, { timestamps: true });

// The feed itself, and the only access pattern there is: one project, newest
// first, paginated on `at`.
projectActivitySchema.index({ projectId: 1, at: -1 });

module.exports = mongoose.model('ProjectActivity', projectActivitySchema);
module.exports.ACTIVITY_TYPES = ACTIVITY_TYPES;
