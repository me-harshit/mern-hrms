const { emitToConversation, emitToConversationExternals } = require('./realtime');
const { visibleMembers } = require('./conversationAccess');

/**
 * What an external participant is allowed to be told — feature draft F2.3.
 *
 * This lives in its own file, apart from routes/portal.js, for one reason: the
 * portal is not the only thing that sends data to an outsider. A live socket
 * room does too, and the payload broadcast into `conv:<id>` is the full
 * internal message — sender populated with employee number, department, job
 * title and role.
 *
 * If an external socket sat in that room, every one of those fields would reach
 * a vendor's browser on every message, whatever the portal chose to draw. So
 * externals sit in a room of their own and this module is the only thing that
 * writes into it. Reduction happens once, here, and `broadcastMessage` is what
 * routes call so that neither audience can be served by accident.
 */

/**
 * How much of an employee an outsider sees.
 *
 * A name is unavoidable — a thread where every reply is anonymous is not a
 * conversation. Everything else the User document holds is company data and
 * stays behind this function.
 */
const colleague = (user) => (user ? {
    _id: user._id,
    name: user.name,
    profilePic: user.profilePic || ''
} : null);

/**
 * One message, as an outsider may see it.
 *
 * Deliberately does NOT decide whether the message is "mine" — the same object
 * is broadcast to every external participant in the conversation at once, so
 * there is no single viewer to answer that for. The author's own id is included
 * and the client compares it. A per-viewer field here would be a field that is
 * right for the first recipient and wrong for the rest.
 */
const portalMessage = (m) => {
    const doc = typeof m.toObject === 'function' ? m.toObject() : { ...m };
    const external = doc.externalSender;

    return {
        _id: doc._id,
        text: doc.deletedAt ? '' : (doc.text || ''),
        attachments: doc.deletedAt ? [] : (doc.attachments || []),
        createdAt: doc.createdAt,
        editedAt: doc.editedAt || null,
        deletedAt: doc.deletedAt || null,
        systemEvent: doc.systemEvent?.type ? { type: doc.systemEvent.type } : null,
        replyTo: doc.replyTo?.messageId ? doc.replyTo : null,
        author: external
            ? {
                name: external.name || 'External participant',
                external: true,
                externalId: String(external._id || external)
            }
            : { ...colleague(doc.sender), external: false, externalId: null }
    };
};

/**
 * The group itself, as an outsider may see it.
 *
 * visibleMembers is called with no viewer id, which drops any hidden oversight
 * admin (F3.10). An outsider is the last person who should be able to work out
 * that a group has a silent reader in it.
 */
const portalConversation = (conversation, participant) => ({
    _id: conversation._id,
    name: conversation.name,
    description: conversation.description || '',
    avatar: conversation.avatar || '',
    projectName: conversation.projectId?.name || '',
    members: visibleMembers(conversation, null).map((m) => colleague(m.user)).filter(Boolean),
    me: {
        _id: participant._id,
        name: participant.name,
        externalId: participant.externalId,
        company: participant.company || '',
        expiresAt: participant.expiresAt
    }
});

/**
 * Send one message to both audiences, in the shape each is entitled to.
 *
 * Every route that adds a message to a conversation calls this instead of
 * emitToConversation directly, so that adding a new kind of message cannot
 * quietly leave outsiders out of the thread, and cannot quietly hand them the
 * internal payload either.
 */
const broadcastMessage = (conversationId, populatedMessage) => {
    const internal = typeof populatedMessage.toObject === 'function'
        ? populatedMessage.toObject()
        : populatedMessage;

    emitToConversation(conversationId, 'message:new', internal);
    emitToConversationExternals(conversationId, 'message:new', portalMessage(populatedMessage));
};

module.exports = { colleague, portalMessage, portalConversation, broadcastMessage };
