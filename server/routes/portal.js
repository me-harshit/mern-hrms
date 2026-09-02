const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const externalAuth = require('../middleware/externalAuthMiddleware');
const { signExternalToken } = require('../middleware/externalAuthMiddleware');
const chatUpload = require('../middleware/chatUploadMiddleware');

const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const ExternalParticipant = require('../models/ExternalParticipant');

const { processTaskFiles, discardStagedFiles, s3Folder } = require('../utils/taskMedia');
const { previewFor, touchConversation, postSystemMessage } = require('../utils/conversationAccess');
const { portalMessage, portalConversation, broadcastMessage } = require('../utils/portalShape');
const { notifyOwners } = require('./externalParticipants');

/**
 * The vendor's view — feature draft Module 2, the outside half.
 *
 * Everything here answers one question: what can somebody who is not an
 * employee do? The answer is "read and write one conversation", and the shape
 * of this file is what makes that true rather than merely intended.
 *
 * Two rules hold throughout, and neither is re-decided per route:
 *
 *   1. The conversation is ALWAYS req.external.conversationId. No handler
 *      reads a conversation id from the url, the query or the body. There is
 *      therefore no parameter an outsider can change to reach another thread —
 *      F2.3 is a property of the routing, not a check somebody could forget.
 *
 *   2. Nothing employee-shaped is ever serialised. Everything sent outwards
 *      goes through utils/portalShape.js, which reduces a colleague to a name
 *      and a picture; no email, employee number, department, job title or role
 *      reaches an outsider, over HTTP or over the socket.
 *
 * The two public routes at the top take a raw invite token instead of a
 * session, because they are what a person reaches by clicking a link in their
 * email, before any session exists.
 */

const PAGE_SIZE = 40;
const MAX_CODE_ATTEMPTS = 5;

/**
 * The earliest message an external participant may read.
 *
 * Their invitation, not the beginning of the thread.
 *
 * A project group usually has months of internal discussion behind it — costs,
 * staffing, opinions about the vendor now being invited — all of it said by
 * people who had no idea an outsider would later be reading. Handing over the
 * full backlog on a single click would be the kind of disclosure nobody
 * consented to and nobody would notice had happened.
 *
 * The system line announcing the invitation is the visible boundary, so what
 * they see starts exactly where the team was told to expect them.
 */
const historyFloor = (participant) => participant.invitedAt || participant.createdAt;

/* ================================================================== *
 * OPENING THE LINK  (F2.1, F2.2)
 * ================================================================== */

/**
 * GET /api/portal/invite/:token
 *
 * What is behind this link? Deliberately says almost nothing: the group name
 * and who invited them, so the recipient can tell a real invitation from a
 * stray one — and no messages, no member list, nothing until they are in.
 */
router.get('/invite/:token', async (req, res) => {
    try {
        const participant = await ExternalParticipant.findOne({ token: req.params.token })
            .populate('invitedBy', 'name')
            .populate('externalUser');
        if (!participant) {
            return res.status(404).json({ message: 'This invitation link is not valid.' });
        }

        const conversation = await Conversation.findById(participant.conversationId)
            .populate('projectId', 'name');
        if (!conversation) {
            return res.status(404).json({ message: 'That conversation no longer exists.' });
        }

        if (!participant.firstOpenedAt) {
            participant.firstOpenedAt = new Date();
            await participant.save();
        }

        const expired = participant.expiresAt && participant.expiresAt < new Date();

        res.json({
            name: participant.externalUser?.name || '',
            groupName: conversation.name,
            projectName: conversation.projectId?.name || '',
            invitedByName: participant.invitedBy?.name || 'A colleague',
            status: participant.status,
            requiresCode: Boolean(participant.code),
            requiresApproval: participant.requireApproval,
            expired,
            revoked: participant.status === 'revoked'
        });
    } catch (err) {
        console.error('[PORTAL] invite lookup error:', err.message);
        res.status(500).json({ message: 'Could not open that invitation' });
    }
});

/**
 * POST /api/portal/invite/:token/join   { code? }
 *
 * The join itself. No password and no account: management asked for a link that
 * opens the conversation directly, so possession of a 32-byte token is the
 * credential, and the reply is a session token scoped to one conversation.
 *
 * Two optional gates, both chosen per invite by whoever sent it:
 *   code            — the emailed verification code (F2.1), which binds the
 *                     link to the mailbox rather than to whoever it was
 *                     forwarded to.
 *   requireApproval — parks them at `pending` and asks the inviter (F2.2).
 */
router.post('/invite/:token/join', async (req, res) => {
    try {
        const participant = await ExternalParticipant.findOne({ token: req.params.token })
            .populate('externalUser');
        if (!participant) {
            return res.status(404).json({ message: 'This invitation link is not valid.' });
        }
        if (!participant.externalUser || participant.externalUser.isActive === false) {
            // Switched off in the directory: every link they hold stops
            // working, without having to walk their conversations.
            return res.status(403).json({ message: 'This invitation has been withdrawn.' });
        }
        if (participant.status === 'revoked') {
            return res.status(403).json({ message: 'This invitation has been withdrawn.' });
        }
        if (participant.status === 'declined') {
            return res.status(403).json({ message: 'This request was not approved.' });
        }
        if (participant.expiresAt && participant.expiresAt < new Date()) {
            return res.status(410).json({
                message: 'This invitation has expired. Ask your contact to send a new one.'
            });
        }

        if (participant.code) {
            /*
             * A six-digit code is a million guesses, which is nothing to a
             * script — so the attempt counter, not the code length, is what
             * makes it a second factor. Exhausting it needs a resend, which
             * mints a fresh code and tells the inviter it happened.
             */
            if (participant.codeAttempts >= MAX_CODE_ATTEMPTS) {
                return res.status(429).json({
                    message: 'Too many incorrect codes. Ask your contact to resend the invitation.'
                });
            }

            const given = String(req.body.code || '').trim();
            if (given !== participant.code) {
                participant.codeAttempts += 1;
                await participant.save();
                const left = Math.max(MAX_CODE_ATTEMPTS - participant.codeAttempts, 0);
                return res.status(401).json({
                    message: left
                        ? `That code is not right. ${left} attempt${left === 1 ? '' : 's'} left.`
                        : 'Too many incorrect codes. Ask your contact to resend the invitation.'
                });
            }
        }

        const conversation = await Conversation.findById(participant.conversationId)
            .populate('members.user', 'name profilePic')
            .populate('projectId', 'name');
        if (!conversation) {
            return res.status(404).json({ message: 'That conversation no longer exists.' });
        }

        // Who they are lives in the directory (models/ExternalUser.js); this
        // membership only says which conversation they may reach.
        const person = participant.externalUser;

        // F2.2 — first arrival on an approval-gated invite asks rather than admits.
        if (participant.requireApproval && participant.status !== 'active') {
            if (participant.status !== 'pending') {
                participant.status = 'pending';
                participant.codeAttempts = 0;
                await participant.save();

                await notifyOwners(conversation, participant, {
                    title: `${person.name} wants to join ${conversation.name}`,
                    body: `${person.name} (${person.email}) opened your invitation and is waiting to be approved.`
                });
            }
            return res.status(202).json({
                pending: true,
                message: 'Your request has been sent. You will be able to open the conversation once it is approved.'
            });
        }

        const firstTime = participant.status !== 'active';
        participant.status = 'active';
        participant.codeAttempts = 0;
        participant.joinedAt = participant.joinedAt || new Date();
        participant.lastSeenAt = new Date();
        participant.lastIp = req.ip || '';
        await participant.save();

        if (firstTime) {
            const sys = await postSystemMessage(conversation._id, {
                type: 'external_joined',
                actor: null,
                actorName: '',
                targetNames: [person.name]
            });
            broadcastMessage(conversation._id, sys);

            await notifyOwners(conversation, participant, {
                title: `${person.name} joined ${conversation.name}`,
                body: `${person.name} opened the invitation you sent and can now read and reply in this group.`
            });
        }

        res.json({
            token: signExternalToken(participant),
            conversation: portalConversation(conversation, participant)
        });
    } catch (err) {
        console.error('[PORTAL] join error:', err.message);
        res.status(500).json({ message: 'Could not open that conversation' });
    }
});

/* ================================================================== *
 * INSIDE THE CONVERSATION
 * ================================================================== */

/** Loads the one conversation this session is pinned to. Never takes an id. */
const loadMine = async (req) => Conversation.findById(req.external.conversationId)
    .populate('members.user', 'name profilePic')
    .populate('projectId', 'name');

/** GET /api/portal/conversation */
router.get('/conversation', externalAuth, async (req, res) => {
    try {
        const conversation = await loadMine(req);
        if (!conversation) return res.status(404).json({ message: 'That conversation no longer exists.' });
        res.json(portalConversation(conversation, req.external));
    } catch (err) {
        console.error('[PORTAL] conversation error:', err.message);
        res.status(500).json({ message: 'Could not load the conversation' });
    }
});

/** GET /api/portal/messages?before=<ISO> */
router.get('/messages', externalAuth, async (req, res) => {
    try {
        const filter = {
            conversationId: req.external.conversationId,
            // Never earlier than their invitation. See historyFloor.
            createdAt: { $gt: new Date(historyFloor(req.external)) }
        };
        if (req.query.before) {
            filter.createdAt.$lt = new Date(req.query.before);
        }

        const messages = await Message.find(filter)
            .populate('sender', 'name profilePic')
            .populate('externalSender', 'name')
            .sort({ createdAt: -1 })
            .limit(PAGE_SIZE);

        res.json({
            messages: messages.reverse().map(portalMessage),
            hasMore: messages.length === PAGE_SIZE
        });
    } catch (err) {
        console.error('[PORTAL] messages error:', err.message);
        res.status(500).json({ message: 'Could not load messages' });
    }
});

/**
 * POST /api/portal/messages   (F2.5)
 *
 * Text and files, the same multipart contract the internal composer uses, so
 * attachments ride the pipeline that already exists: images and documents to
 * S3, video staged on the VPS and compressed by the night job.
 */
router.post('/messages', externalAuth, chatUpload.array('attachments', 5), async (req, res) => {
    try {
        const conversation = await loadMine(req);
        if (!conversation) {
            discardStagedFiles(req.files);
            return res.status(404).json({ message: 'That conversation no longer exists.' });
        }

        const text = (req.body.text || '').trim();
        if (!text && !(req.files || []).length) {
            discardStagedFiles(req.files);
            return res.status(400).json({ message: 'Write something or attach a file' });
        }

        /*
         * External uploads go to their own prefix.
         *
         * Draft §4.5 asks how long a vendor's files are kept after a project
         * closes, and that is a retention decision still to be made. Whatever
         * it turns out to be, it is enforceable against a prefix and painful
         * against files mixed in with the team's own.
         */
        const subFolder = conversation.projectId?.name
            ? s3Folder(conversation.projectId.name, '/Chat/External')
            : s3Folder('Chats', '/External');

        const { media, pendingVideos } = await processTaskFiles(
            req.files, subFolder, '/uploads/chat'
        );

        let waveform = null;
        try {
            if (req.body.waveform) waveform = JSON.parse(req.body.waveform);
        } catch (e) { /* a bad payload just means no waveform */ }

        media.forEach((m) => {
            if (m.type !== 'audio') return;
            m.durationMs = parseInt(req.body.durationMs, 10) || 0;
            if (Array.isArray(waveform) && waveform.length) {
                m.waveform = waveform.slice(0, 200).map(Number).filter((n) => !Number.isNaN(n));
            }
        });

        /*
         * A reply must point at a message in this conversation AND at one this
         * participant was allowed to see. Without the second test, quoting an
         * arbitrary id would echo pre-invitation text back into the thread and
         * hand them the history historyFloor is there to withhold.
         */
        let replyTo = { messageId: null, text: '', senderName: '', kind: 'text' };
        if (req.body.replyToId && mongoose.isValidObjectId(req.body.replyToId)) {
            const parent = await Message.findOne({
                _id: req.body.replyToId,
                conversationId: conversation._id,
                createdAt: { $gt: new Date(historyFloor(req.external)) }
            })
                .populate('sender', 'name')
                .populate('externalSender', 'name');
            if (parent) {
                const preview = previewFor(parent);
                replyTo = {
                    messageId: parent._id,
                    text: preview.text,
                    senderName: parent.sender?.name || parent.externalSender?.name || '',
                    kind: preview.kind
                };
            }
        }

        const message = await Message.create({
            conversationId: conversation._id,
            sender: null,
            externalSender: req.external.externalUser._id,
            text,
            attachments: media,
            replyTo,
            readByExternal: [{ participant: req.external.externalUser._id, at: new Date() }]
        });

        if (pendingVideos.length) {
            const VideoCompressionQueue = require('../models/VideoCompressionQueue');
            await VideoCompressionQueue.insertMany(pendingVideos.map((v) => ({
                ownerModel: 'Message',
                taskId: message._id,
                mediaId: v.mediaId,
                field: 'attachments',
                localPath: v.localPath,
                originalName: v.originalName,
                projectName: conversation.projectId?.name || 'Chats'
            })));
        }

        await touchConversation(conversation._id, message, req.external.externalUser.name);

        // broadcastMessage sends the full internal shape to colleagues and the
        // reduced one to any other external participant, in one call.
        const populated = await Message.findById(message._id)
            .populate('externalSender', 'name company status');
        broadcastMessage(conversation._id, populated);

        /*
         * Somebody inside the company is told, every time.
         *
         * An outsider's question landing in a group with no badge and no bell
         * is exactly the failure the draft's Module 4 is built to chase, and
         * the escalation there needs a first notification to escalate from.
         */
        await notifyOwners(conversation, req.external, {
            title: `${req.external.externalUser.name} (external) posted in ${conversation.name}`,
            body: previewFor(message).text || 'sent an attachment'
        });

        res.status(201).json(portalMessage(populated));
    } catch (err) {
        discardStagedFiles(req.files);
        console.error('[PORTAL] send error:', err);
        res.status(500).json({ message: 'Could not send your message' });
    }
});

/** POST /api/portal/read — move this participant's watermark. */
router.post('/read', externalAuth, async (req, res) => {
    try {
        await ExternalParticipant.updateOne(
            { _id: req.external._id },
            { $set: { lastReadAt: new Date() } }
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('[PORTAL] read error:', err.message);
        res.status(500).json({ message: 'Could not update read state' });
    }
});

module.exports = router;
