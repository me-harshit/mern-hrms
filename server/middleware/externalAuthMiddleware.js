const jwt = require('jsonwebtoken');
const ExternalParticipant = require('../models/ExternalParticipant');

/**
 * Authenticates a vendor or other outsider on the portal (feature draft
 * Module 2), and nothing else.
 *
 * The counterpart to middleware/authMiddleware, and deliberately not an
 * extension of it. Two rules make F2.3 ("sees only the group they were invited
 * to") structural rather than something each route has to remember:
 *
 *   1. The token carries `ext`, never `user`. authMiddleware refuses it, so a
 *      portal token replayed against /api/tasks or /api/employees is a 401 at
 *      the door - not a route-by-route question.
 *
 *   2. The conversation comes from the participant row, never from the request.
 *      req.external.conversationId is what portal routes read; there is no
 *      parameter an outsider can send that changes which thread they reach.
 *
 * Access is re-checked from the database on every call rather than trusted from
 * the token, because F2.6 promises revoke works "in one click". A token issued
 * before the revoke is still cryptographically valid and will be until it
 * expires; only re-reading the row makes the click take effect immediately.
 */

const TOKEN_TTL = '30d';

/** The session token handed to a participant once they are through the door. */
const signExternalToken = (participant) => jwt.sign(
    {
        ext: {
            pid: String(participant._id),
            cid: String(participant.conversationId)
        }
    },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
);

const externalAuth = async (req, res, next) => {
    const token = req.header('x-portal-token') || req.query.pt;
    if (!token) {
        return res.status(401).json({ message: 'This link is missing its access token' });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ message: 'This session has expired. Open your invite link again.' });
    }

    if (!decoded.ext?.pid) {
        // A staff token. Not an error worth explaining to an outsider, and not
        // one that should ever grant portal access either.
        return res.status(401).json({ message: 'Not a valid portal session' });
    }

    const participant = await ExternalParticipant.findById(decoded.ext.pid);
    if (!participant) {
        return res.status(401).json({ message: 'This invitation no longer exists' });
    }

    if (participant.revokedAt || participant.status === 'revoked') {
        return res.status(403).json({ message: 'Your access to this conversation has been withdrawn.' });
    }
    if (participant.status === 'pending') {
        return res.status(403).json({ message: 'Your request is still waiting for approval.', pending: true });
    }
    if (!participant.hasAccess()) {
        return res.status(403).json({ message: 'Your access to this conversation has expired.' });
    }

    /*
     * The conversation id is pinned in the token as well as held on the row.
     * They cannot disagree unless a participant row was edited to point
     * somewhere else, which would be a bug rather than an attack - but if it
     * ever happens, refusing is the right outcome and it costs one comparison.
     */
    if (decoded.ext.cid && String(participant.conversationId) !== String(decoded.ext.cid)) {
        return res.status(403).json({ message: 'This session no longer matches its conversation' });
    }

    req.external = participant;

    // Last-seen is a presence hint for the internal side, not an audit record,
    // so it is written at most once a minute rather than on every poll.
    const stale = !participant.lastSeenAt
        || Date.now() - participant.lastSeenAt.getTime() > 60_000;
    if (stale) {
        ExternalParticipant.updateOne(
            { _id: participant._id },
            { $set: { lastSeenAt: new Date(), lastIp: req.ip || '' } }
        ).catch(() => { /* presence is not worth failing a request over */ });
    }

    next();
};

module.exports = externalAuth;
module.exports.signExternalToken = signExternalToken;
