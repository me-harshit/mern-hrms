const mongoose = require('mongoose');

/**
 * A place messages live: a 1-to-1 direct chat, or a group.
 *
 * Deliberately one collection rather than separate Group/DirectChat models —
 * the chat list, the unread counts, the message pipeline and the access rules
 * are identical for both, and splitting them would mean every list query became
 * two queries plus a merge sort.
 *
 * Note the name: `Conversation`, not `Chat`. /api/chat is already the Gemini
 * assistant (controllers/chatController.js) and reusing the word in the routing
 * layer would put two unrelated features on one namespace.
 */

const CONVERSATION_KINDS = ['direct', 'group'];

// Only meaningful when kind === 'group'.
//   project — created automatically alongside a Project, named after it.
//   custom  — made by a person, WhatsApp-style, tied to a project or not.
const GROUP_TYPES = ['project', 'custom'];

const MEMBER_ROLES = ['owner', 'admin', 'member'];

const memberSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    role: { type: String, enum: MEMBER_ROLES, default: 'member' },

    joinedAt: { type: Date, default: Date.now },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    /**
     * Everything created at or before this instant has been seen by this
     * person. One timestamp rather than a per-message read row: unread counts
     * are then a single countDocuments with a $gt, instead of a growing array
     * on every message that would have to be scanned for every badge.
     *
     * Read receipts (the ticks) are a separate thing and live on Message.readBy
     * — that answers "who has seen *this* message", which a watermark cannot.
     */
    lastReadAt: { type: Date, default: null },

    // Stays in the list, stops raising notifications.
    muted: { type: Boolean, default: false },

    /**
     * "Clear chat" — hide everything up to this instant from THIS person only.
     *
     * Per-viewer on purpose. The whole reason this module exists is that work
     * conversation becomes a company record, and admin oversight of groups
     * depends on that record still being there; a clear that deleted messages
     * for everyone would let one participant erase a thread for all of them.
     * So nothing is destroyed — the messages simply stop being sent to the
     * person who cleared, and every other member's view is untouched.
     */
    clearedAt: { type: Date, default: null },

    /**
     * "Close chat" — drop it out of this person's list until it next moves.
     *
     * Not the same as leaving: membership, history and notifications are all
     * intact. The row comes back on its own the moment a new message arrives,
     * which is what makes closing safe to offer for a DM — you cannot lose a
     * conversation by tidying it away.
     */
    closedAt: { type: Date, default: null },

    /**
     * Admin oversight (F3.10), built as management asked: a hidden member reads
     * and posts without appearing in the member list.
     *
     * GROUPS ONLY. Never set on a direct chat — a 1-to-1 conversation is
     * readable by its two participants and by nobody else, admin included.
     * Enforced in utils/conversationAccess.js → canRead and again at the
     * oversight routes; this flag simply never gets written on a DM.
     *
     * Isolated to this one flag on purpose. Every read path filters on it in a
     * single helper (→ visibleMembers), so if the policy moves to the disclosed
     * audit view recommended in §4 of the feature draft, that is one function
     * and one flag — not a rewrite.
     *
     * Reads by a hidden member are recorded regardless; see ChatAuditLog.
     */
    hidden: { type: Boolean, default: false },

    /**
     * Reserved for a soft-leave.
     *
     * Removal currently pulls the member row outright (routes/conversations.js)
     * so that a removed person stops matching the chat-list query at once. This
     * field exists because messages already reference their author by id and
     * render fine without a member row — so a future "left the group but their
     * history stays attributable" flow needs no migration, only a change of
     * verb. Every membership query filters on it already.
     */
    leftAt: { type: Date, default: null }
}, { _id: false });

const conversationSchema = new mongoose.Schema({
    kind: { type: String, enum: CONVERSATION_KINDS, required: true },

    groupType: {
        type: String,
        enum: GROUP_TYPES,
        default: null
    },

    // Groups only. A direct chat is titled by whoever you are talking to, which
    // is per-viewer and so cannot be a stored field.
    name: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    avatar: { type: String, default: '' },

    // Set for project groups, and optionally for a custom group scoped to a
    // project (F3.3 — "a project can have several groups").
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },

    members: { type: [memberSchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    /**
     * Denormalised copy of the newest message.
     *
     * The chat list shows a preview and sorts by recency for every conversation
     * a person is in. Doing that from the Message collection means a
     * per-conversation lookup on every render of the sidebar; keeping it here
     * makes the list one query. Written by utils/conversationAccess.js →
     * touchConversation so no route has to remember to.
     */
    lastMessage: {
        text: { type: String, default: '' },
        sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        senderName: { type: String, default: '' },
        kind: { type: String, default: 'text' },   // text | image | audio | video | document | system
        at: { type: Date, default: null }
    },

    /**
     * Sorting key for the sidebar. Mirrors lastMessage.at once there is one,
     * but is set at creation too so a brand-new empty group doesn't sink to the
     * bottom of the list where its creator cannot find it.
     */
    lastActivityAt: { type: Date, default: Date.now },

    /**
     * Join-by-link (F3.2). Rotated on demand; null means link joining is off.
     * Internal only — an employee still has to be logged in to use it, so this
     * is a convenience, not the vendor invite flow in Module 2.
     */
    inviteToken: { type: String, default: null, index: true, sparse: true },
    inviteExpiresAt: { type: Date, default: null },

    /**
     * Direct chats only: the two member ids sorted and joined, e.g.
     * "64ab…:64cd…". A unique index on it is what stops two people who message
     * each other simultaneously from ending up with two parallel threads —
     * checking "does a DM already exist" in application code races.
     */
    directKey: { type: String, default: null },

    isArchived: { type: Boolean, default: false }
}, { timestamps: true });

// The sidebar query: "conversations I am in, newest first".
conversationSchema.index({ 'members.user': 1, lastActivityAt: -1 });

// One DM per pair. Sparse so the thousands of group docs, which have no
// directKey, are not all indexed under null.
conversationSchema.index(
    { directKey: 1 },
    { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } }
);

// "Does this project already have its auto-created group?"
conversationSchema.index({ projectId: 1, groupType: 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
module.exports.CONVERSATION_KINDS = CONVERSATION_KINDS;
module.exports.GROUP_TYPES = GROUP_TYPES;
module.exports.MEMBER_ROLES = MEMBER_ROLES;
