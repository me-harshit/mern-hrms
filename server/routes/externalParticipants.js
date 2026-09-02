const express = require('express');
const router = express.Router({ mergeParams: true });

const auth = require('../middleware/authMiddleware');

const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const Notification = require('../models/Notification');
const ExternalParticipant = require('../models/ExternalParticipant');
const ExternalUser = require('../models/ExternalUser');

const { emitToUsers, emitToConversation, emitToConversationExternals } = require('../utils/realtime');
const { broadcastMessage } = require('../utils/portalShape');
const { portalLink, sendInviteEmail } = require('../utils/externalInvite');
const { recordActivity } = require('../utils/projectAccess');
const {
    canRead, canManage, postSystemMessage
} = require('../utils/conversationAccess');

/**
 * The company's side of external access — feature draft Module 2.
 *
 * Mounted inside routes/conversations.js at /:id/externals, because every one
 * of these operations is a fact about one conversation and inherits its
 * permission model: if you may manage the group, you may decide who from
 * outside it can see the group.
 *
 * The outsider's own side lives in routes/portal.js and shares nothing with
 * this file but the ExternalParticipant model. That separation is deliberate;
 * see the header of models/ExternalParticipant.js.
 */

const MAX_DAYS = 90;
const DEFAULT_DAYS = 7;

/** Direct chats are between two named people; there is nobody to invite into one. */
const loadGroup = async (req, res) => {
    const conversation = await Conversation.findById(req.params.id)
        .populate('projectId', 'name');
    if (!conversation) {
        res.status(404).json({ message: 'Conversation not found' });
        return null;
    }
    if (conversation.kind !== 'group') {
        res.status(400).json({ message: 'External participants can only be added to groups' });
        return null;
    }
    return conversation;
};

/**
 * What the internal side sees about an outsider.
 *
 * The token is included only for people who can manage the group, because the
 * link IS the access: handing it to every member would turn "who may invite"
 * into a formality. The inviter needs it back so they can send it another way,
 * which is the whole reason it is copyable at all.
 */
const present = (p, req, withLink) => ({
    _id: p._id,

    /*
     * Who they are is read through the populated directory record, never
     * copied onto the membership. Two rows that each held a name is exactly
     * the drift this split was made to remove, and a `p.name ||` fallback here
     * would quietly reintroduce it the first time somebody forgot to populate.
     */
    externalUser: p.externalUser?._id || p.externalUser,
    externalId: p.externalUser?.externalId,
    name: p.externalUser?.name || 'External participant',
    email: p.externalUser?.email || '',
    company: p.externalUser?.company || '',
    type: p.externalUser?.type || null,
    personActive: p.externalUser?.isActive !== false,

    status: p.status,
    requireApproval: p.requireApproval,
    hasCode: Boolean(p.code),
    invitedBy: p.invitedBy,
    invitedAt: p.invitedAt,
    joinedAt: p.joinedAt,
    lastSeenAt: p.lastSeenAt,
    expiresAt: p.expiresAt,
    revokedAt: p.revokedAt,
    isActive: p.hasAccess(),
    link: withLink ? portalLink(req, p.token) : undefined
});

/* ================================================================== *
 * INVITE  (F2.1)
 * ================================================================== */

/**
 * POST /api/conversations/:id/externals
 * { name, email, company?, note?, days?, requireCode?, requireApproval? }
 *
 * Creates the participant, mails the link, and returns the link so the inviter
 * can also send it themselves — management asked for both, because a vendor
 * whose mail server eats the invite is otherwise stuck with no way in.
 *
 * The link works on its own by default. A verification code (draft F2.1) is
 * available per invite but off unless asked for: management chose one-click
 * joining, and the code is precisely the thing that would make it two clicks.
 * What the code buys is binding the link to the mailbox it was sent to, so a
 * forwarded invite does not quietly become a second reader.
 */
router.post('/', auth, async (req, res) => {
    try {
        const conversation = await loadGroup(req, res);
        if (!conversation) return;

        if (!canManage(conversation, req.user)) {
            return res.status(403).json({
                message: 'Only group admins can invite people from outside the company'
            });
        }

        /*
         * Two ways in, one outcome.
         *
         * externalUserId  - picked from the directory, which is the normal
         *                   path now that a person exists independently of any
         *                   one group.
         * name + email    - typed here, for somebody nobody has dealt with
         *                   before. It creates the directory record rather
         *                   than storing details on this row, so the second
         *                   group they are added to can pick them instead of
         *                   retyping them.
         */
        let person = null;

        if (req.body.externalUserId) {
            person = await ExternalUser.findById(req.body.externalUserId);
            if (!person) {
                return res.status(404).json({ message: 'That external user is no longer in the directory' });
            }
            if (!person.isActive) {
                return res.status(400).json({
                    message: `${person.name} is switched off in the external users directory. Turn them back on before adding them to a group.`
                });
            }
        } else {
            const name = String(req.body.name || '').trim();
            const email = String(req.body.email || '').trim().toLowerCase();

            if (!name || !email) {
                return res.status(400).json({
                    message: 'Pick somebody from the directory, or give a name and an email address'
                });
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
                return res.status(400).json({ message: 'That does not look like an email address' });
            }

            /*
             * A colleague must never be turned into an external user.
             *
             * Without this, inviting a staff member by their own email mints a
             * portal token for a real employee mailbox that bypasses the login
             * and the role checks entirely - a second, weaker way into the
             * building.
             */
            const staff = await User.findOne({ email }).select('_id name');
            if (staff) {
                return res.status(400).json({
                    message: `${staff.name} works here - add them as a member instead of an external participant.`
                });
            }

            // Reuse the existing record if that address is already known. The
            // whole point of the directory is that one person is one row.
            person = await ExternalUser.findOne({ email });
            if (person && !person.isActive) {
                return res.status(400).json({
                    message: `${person.name} is already in the directory but switched off. Turn them back on before adding them to a group.`
                });
            }
            if (!person) {
                person = await ExternalUser.create({
                    name,
                    email,
                    company: String(req.body.company || '').trim(),
                    type: req.body.type || 'VENDOR',
                    createdBy: req.user.id
                });
            }
        }

        const existing = await ExternalParticipant.findOne({
            conversationId: conversation._id,
            externalUser: person._id,
            status: { $in: ['invited', 'pending', 'active'] }
        });
        if (existing) {
            return res.status(409).json({
                message: `${person.name} has already been invited to this group. Resend their link instead.`
            });
        }

        const days = Math.min(Math.max(parseInt(req.body.days, 10) || DEFAULT_DAYS, 1), MAX_DAYS);

        const participant = await ExternalParticipant.create({
            externalUser: person._id,
            conversationId: conversation._id,
            projectId: conversation.projectId?._id || conversation.projectId || null,
            invitedBy: req.user.id,
            token: ExternalParticipant.mintToken(),
            code: req.body.requireCode ? ExternalParticipant.mintCode() : null,
            requireApproval: Boolean(req.body.requireApproval),
            expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        });
        // Attached rather than re-fetched, so present() and the invitation
        // email both see the person without another round trip.
        participant.externalUser = person;

        const link = portalLink(req, participant.token);
        const me = await User.findById(req.user.id).select('name');

        /*
         * Announce it now rather than when they arrive. Members deciding what
         * to say in this thread need to know an outsider is coming while that
         * decision is still ahead of them.
         */
        const sys = await postSystemMessage(conversation._id, {
            type: 'external_invited',
            actor: req.user.id,
            actorName: me?.name || 'Someone',
            targetNames: [person.name]
        });
        broadcastMessage(conversation._id, sys);

        // The vendor tab and the project feed both need to know (F1.6, F1.8).
        // participant.projectId is the denormalised copy that survives the
        // membership being revoked later.
        recordActivity(participant.projectId, {
            type: 'vendor_invited',
            actor: req.user.id,
            actorName: me?.name || '',
            text: `${me?.name || 'Someone'} invited ${person.name} (external) to ${conversation.name}`,
            refModel: 'ExternalParticipant',
            refId: participant._id,
            link: `/chats/${conversation._id}`,
            meta: {
                conversationId: String(conversation._id),
                groupName: conversation.name || '',
                externalName: person.name,
                company: person.company || ''
            }
        });

        // Mail failure must not lose the invitation — the link is already
        // minted and copyable, which is the fallback the inviter asked for.
        let emailed = false;
        try {
            emailed = await sendInviteEmail({
                person,
                link,
                code: participant.code,
                inviterName: me?.name || 'A colleague',
                groupName: conversation.name,
                projectName: conversation.projectId?.name || '',
                expiresAt: participant.expiresAt,
                note: req.body.note
            });
        } catch (mailErr) {
            console.error('[EXTERNAL] invite mail failed:', mailErr.message);
        }

        res.status(201).json({
            participant: present(participant, req, true),
            link,
            emailed,
            code: participant.code
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: 'That person has already been invited to this group.' });
        }
        console.error('[EXTERNAL] invite error:', err.message);
        res.status(500).json({ message: 'Could not send that invitation' });
    }
});

/* ================================================================== *
 * WHO IS IN HERE FROM OUTSIDE  (F2.4)
 * ================================================================== */

/**
 * GET /api/conversations/:id/externals
 *
 * Readable by anyone who can read the conversation — knowing an outsider is
 * present is exactly the kind of thing every member should be able to check,
 * not a manager-only fact. Only managers get the link back with it.
 */
router.get('/', auth, async (req, res) => {
    try {
        const conversation = await loadGroup(req, res);
        if (!conversation) return;

        if (!canRead(conversation, req.user).ok) {
            return res.status(403).json({ message: 'You are not in this conversation' });
        }

        const manage = canManage(conversation, req.user);
        const rows = await ExternalParticipant.find({ conversationId: conversation._id })
            .populate('invitedBy', 'name profilePic role')
            .populate('externalUser')
            .sort({ createdAt: -1 });

        res.json(rows.map((p) => present(p, req, manage)));
    } catch (err) {
        console.error('[EXTERNAL] list error:', err.message);
        res.status(500).json({ message: 'Could not load external participants' });
    }
});

/**
 * GET /api/conversations/:id/externals/:pid
 *
 * The per-vendor view the draft flags as undefined in F2.7 — built as the
 * per-project version, which is the one this data model can answer honestly:
 * a participant row IS scoped to one conversation, so "their files and their
 * history" means the ones in this thread. A company-wide profile would need a
 * vendor identity spanning conversations, and that is the policy decision the
 * draft raises in §4.4, not a missing query.
 */
router.get('/:pid', auth, async (req, res) => {
    try {
        const conversation = await loadGroup(req, res);
        if (!conversation) return;

        if (!canRead(conversation, req.user).ok) {
            return res.status(403).json({ message: 'You are not in this conversation' });
        }

        const participant = await ExternalParticipant.findOne({
            _id: req.params.pid,
            conversationId: conversation._id
        }).populate('invitedBy', 'name profilePic role')
            .populate('externalUser');
        if (!participant) return res.status(404).json({ message: 'Not found' });

        /*
         * Keyed on the directory record, and narrowed to THIS conversation.
         *
         * externalSender points at the person, so without the conversation
         * filter this would return what they had written in every group they
         * belong to - handing whoever opened one project a window into
         * another. The company-wide view of the same person is a separate,
         * deliberately-asked-for endpoint (routes/externalUsers.js).
         */
        const messages = await Message.find({
            externalSender: participant.externalUser?._id || participant.externalUser,
            conversationId: conversation._id,
            deletedAt: null
        }).sort({ createdAt: -1 }).limit(200);

        const files = [];
        messages.forEach((m) => (m.attachments || []).forEach((a) => files.push({
            ...(a.toObject ? a.toObject() : a),
            messageId: m._id,
            at: m.createdAt
        })));

        res.json({
            participant: present(participant, req, canManage(conversation, req.user)),
            messageCount: messages.length,
            files
        });
    } catch (err) {
        console.error('[EXTERNAL] profile error:', err.message);
        res.status(500).json({ message: 'Could not load that participant' });
    }
});

/* ================================================================== *
 * RESEND, EXTEND, APPROVE, REVOKE
 * ================================================================== */

/** POST /:pid/resend — same link, fresh code, fresh expiry. */
router.post('/:pid/resend', auth, async (req, res) => {
    try {
        const conversation = await loadGroup(req, res);
        if (!conversation) return;
        if (!canManage(conversation, req.user)) {
            return res.status(403).json({ message: 'Only group admins can do that' });
        }

        const participant = await ExternalParticipant.findOne({
            _id: req.params.pid,
            conversationId: conversation._id
        }).populate('externalUser');
        if (!participant) return res.status(404).json({ message: 'Not found' });
        if (participant.status === 'revoked') {
            return res.status(400).json({ message: 'That access was withdrawn. Invite them again instead.' });
        }

        const days = Math.min(Math.max(parseInt(req.body.days, 10) || DEFAULT_DAYS, 1), MAX_DAYS);
        participant.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

        // A resend re-arms the code: the first mail may have gone somewhere it
        // should not have, and that copy of the code should stop working.
        if (participant.code) {
            participant.code = ExternalParticipant.mintCode();
            participant.codeAttempts = 0;
        }
        await participant.save();

        const me = await User.findById(req.user.id).select('name');
        const link = portalLink(req, participant.token);

        let emailed = false;
        try {
            emailed = await sendInviteEmail({
                person: participant.externalUser,
                link,
                code: participant.code,
                inviterName: me?.name || 'A colleague',
                groupName: conversation.name,
                projectName: conversation.projectId?.name || '',
                expiresAt: participant.expiresAt,
                note: req.body.note
            });
        } catch (mailErr) {
            console.error('[EXTERNAL] resend mail failed:', mailErr.message);
        }

        res.json({ participant: present(participant, req, true), link, emailed, code: participant.code });
    } catch (err) {
        console.error('[EXTERNAL] resend error:', err.message);
        res.status(500).json({ message: 'Could not resend that invitation' });
    }
});

/** PUT /:pid — extend (or shorten) how long the link keeps working (F2.6). */
router.put('/:pid', auth, async (req, res) => {
    try {
        const conversation = await loadGroup(req, res);
        if (!conversation) return;
        if (!canManage(conversation, req.user)) {
            return res.status(403).json({ message: 'Only group admins can do that' });
        }

        const participant = await ExternalParticipant.findOne({
            _id: req.params.pid,
            conversationId: conversation._id
        }).populate('externalUser');
        if (!participant) return res.status(404).json({ message: 'Not found' });

        const days = Math.min(Math.max(parseInt(req.body.days, 10) || DEFAULT_DAYS, 1), MAX_DAYS);
        participant.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await participant.save();

        res.json(present(participant, req, true));
    } catch (err) {
        console.error('[EXTERNAL] extend error:', err.message);
        res.status(500).json({ message: 'Could not update that access' });
    }
});

/**
 * POST /:pid/approve  |  POST /:pid/decline   (F2.2)
 *
 * The other half of the request-to-join flow: the outsider opened a link marked
 * "needs approval", which parked them at `pending` and notified the inviter.
 */
const decide = (approved) => async (req, res) => {
    try {
        const conversation = await loadGroup(req, res);
        if (!conversation) return;
        if (!canManage(conversation, req.user)) {
            return res.status(403).json({ message: 'Only group admins can decide that' });
        }

        const participant = await ExternalParticipant.findOne({
            _id: req.params.pid,
            conversationId: conversation._id
        }).populate('externalUser');
        if (!participant) return res.status(404).json({ message: 'Not found' });
        if (participant.status !== 'pending') {
            return res.status(400).json({ message: 'That request has already been decided' });
        }

        participant.status = approved ? 'active' : 'declined';
        participant.decidedBy = req.user.id;
        if (approved) participant.joinedAt = participant.joinedAt || new Date();
        await participant.save();

        if (approved) {
            const sys = await postSystemMessage(conversation._id, {
                type: 'external_joined',
                actor: req.user.id,
                actorName: '',
                targetNames: [participant.externalUser?.name || 'An external participant']
            });
            broadcastMessage(conversation._id, sys);
        }

        emitToConversation(conversation._id, 'external:updated', {
            conversationId: String(conversation._id),
            participant: present(participant, req, false)
        });

        res.json(present(participant, req, true));
    } catch (err) {
        console.error('[EXTERNAL] decision error:', err.message);
        res.status(500).json({ message: 'Could not record that decision' });
    }
};

// Two routes rather than one with an inline regex parameter: Express 5's path
// parser no longer accepts `:decision(approve|decline)`, and a shared handler
// says the same thing without depending on how paths are compiled.
router.post('/:pid/approve', auth, decide(true));
router.post('/:pid/decline', auth, decide(false));

/**
 * DELETE /:pid — revoke access (F2.6).
 *
 * The row is marked, never deleted, and the messages are left exactly where
 * they are. "Conversation history is retained" is the explicit requirement, and
 * it is also the only way the thread still makes sense afterwards: removing a
 * vendor's messages would leave the team's replies answering nothing.
 */
router.delete('/:pid', auth, async (req, res) => {
    try {
        const conversation = await loadGroup(req, res);
        if (!conversation) return;
        if (!canManage(conversation, req.user)) {
            return res.status(403).json({ message: 'Only group admins can withdraw access' });
        }

        const participant = await ExternalParticipant.findOne({
            _id: req.params.pid,
            conversationId: conversation._id
        }).populate('externalUser');
        if (!participant) return res.status(404).json({ message: 'Not found' });

        if (participant.status !== 'revoked') {
            participant.status = 'revoked';
            participant.revokedAt = new Date();
            participant.revokedBy = req.user.id;
            await participant.save();

            const me = await User.findById(req.user.id).select('name');
            const sys = await postSystemMessage(conversation._id, {
                type: 'external_revoked',
                actor: req.user.id,
                actorName: me?.name || 'Someone',
                targetNames: [participant.externalUser?.name || 'An external participant']
            });
            broadcastMessage(conversation._id, sys);

            recordActivity(participant.projectId, {
                type: 'vendor_revoked',
                actor: req.user.id,
                actorName: me?.name || '',
                text: `${me?.name || 'Someone'} removed ${participant.externalUser?.name || 'an external participant'} (external) from ${conversation.name}`,
                refModel: 'ExternalParticipant',
                refId: participant._id,
                link: `/chats/${conversation._id}`,
                meta: {
                    conversationId: String(conversation._id),
                    groupName: conversation.name || '',
                    externalName: participant.externalUser?.name || ''
                }
            });
        }

        /*
         * Tell the portal, so a vendor with the page open is shut out now
         * rather than at their next click. externalAuthMiddleware re-reads the
         * row on every request, so this is presentation — the access itself is
         * already gone either way.
         */
        emitToConversationExternals(conversation._id, 'external:revoked', {
            conversationId: String(conversation._id),
            participantId: String(participant._id)
        });

        res.json(present(participant, req, false));
    } catch (err) {
        console.error('[EXTERNAL] revoke error:', err.message);
        res.status(500).json({ message: 'Could not withdraw that access' });
    }
});

/**
 * Notify the people responsible when an outsider does something.
 *
 * Exported rather than kept private because routes/portal.js is what observes
 * these events, while the rule for who hears about them belongs here with the
 * rest of the external-participant policy.
 *
 * The inviter is always told. They chose to let this person in, which is the
 * whole reason invitedBy is recorded, and it is what gives the draft's Module 4
 * escalation ("nobody replied to the vendor") somebody to escalate to.
 */
const notifyOwners = async (conversation, participant, { title, body }) => {
    const targets = new Set([String(participant.invitedBy)]);

    // Plus whoever runs the group, so an inviter on leave is not a dead end.
    (conversation.members || [])
        .filter((m) => !m.leftAt && (m.role === 'owner' || m.role === 'admin'))
        .forEach((m) => targets.add(String(m.user?._id || m.user)));

    await Promise.all([...targets].filter(Boolean).map(async (id) => {
        try {
            await Notification.create({
                recipient: id,
                title,
                message: String(body).slice(0, 140),
                type: 'CHAT',
                link: `/chats/${conversation._id}`
            });
        } catch (err) {
            console.error('[EXTERNAL] notification failed:', err.message);
        }
    }));

    emitToUsers([...targets], 'conversation:activity', {
        conversationId: String(conversation._id)
    });
};

module.exports = router;
module.exports.notifyOwners = notifyOwners;
module.exports.present = present;
