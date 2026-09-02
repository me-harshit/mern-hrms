const express = require('express');
const router = express.Router();

const auth = require('../middleware/authMiddleware');

const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const ExternalUser = require('../models/ExternalUser');
const ExternalParticipant = require('../models/ExternalParticipant');

/**
 * The directory of people outside the company — feature draft Module 2.
 *
 * Separate from routes/externalParticipants.js, which is about access to one
 * conversation. This file is about the person: created once, edited in one
 * place, and then added to as many groups as the work needs.
 *
 * The split exists because the two questions have different lifetimes. A
 * vendor's name and company are true regardless of which project they are
 * currently helping with; their access to Spectra is true only until somebody
 * revokes it. Keeping them in one row meant retyping the first every time the
 * second changed.
 */

/*
 * Who may do what.
 *
 * Reading is open to anyone who can invite, because picking somebody from the
 * directory is the first half of inviting them - a manager who cannot list
 * external users cannot add one to their own project group.
 *
 * Deleting is narrower than editing on purpose: an edit is recoverable by
 * editing again, and removing a vendor record is the kind of thing that should
 * not be one mis-click away for everyone who can run a project.
 */
const CAN_READ = ['ADMIN', 'HR', 'MANAGER', 'TEAM LEAD'];
const CAN_WRITE = ['ADMIN', 'HR', 'MANAGER', 'TEAM LEAD'];
const CAN_DELETE = ['ADMIN', 'HR'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const present = (u) => ({
    _id: u._id,
    externalId: u.externalId,
    name: u.name,
    email: u.email,
    company: u.company,
    phone: u.phone,
    type: u.type,
    notes: u.notes,
    isActive: u.isActive,
    createdBy: u.createdBy,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
});

/* ================================================================== *
 * THE LIST
 * ================================================================== */

/**
 * GET /api/external-users?q=&type=&includeInactive=
 *
 * Carries a live membership count with each row, so the picker can say "in 2
 * groups" and the directory page can warn before a delete. Counted in one
 * aggregate rather than a query per row - this list is the thing a picker
 * opens, and it should not cost one round trip per vendor.
 */
router.get('/', auth, async (req, res) => {
    try {
        if (!CAN_READ.includes(req.user.role)) {
            return res.status(403).json({ message: 'You cannot view external users' });
        }

        const filter = {};
        if (!['1', 'true'].includes(String(req.query.includeInactive))) {
            filter.isActive = true;
        }
        if (req.query.type) filter.type = req.query.type;

        const q = (req.query.q || '').trim();
        if (q) {
            // Escaped: a vendor called "C++ Systems" would otherwise be a
            // regex, and at best find nothing.
            const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rx = new RegExp(safe, 'i');
            filter.$or = [{ name: rx }, { email: rx }, { company: rx }];
        }

        const rows = await ExternalUser.find(filter)
            .populate('createdBy', 'name')
            .sort({ name: 1 })
            .limit(500);

        const counts = await ExternalParticipant.aggregate([
            {
                $match: {
                    externalUser: { $in: rows.map((r) => r._id) },
                    status: { $in: ['invited', 'pending', 'active'] }
                }
            },
            { $group: { _id: '$externalUser', n: { $sum: 1 } } }
        ]);
        const byUser = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));

        res.json(rows.map((u) => ({
            ...present(u),
            groupCount: byUser[String(u._id)] || 0
        })));
    } catch (err) {
        console.error('[EXTERNAL USERS] list error:', err.message);
        res.status(500).json({ message: 'Could not load external users' });
    }
});

/**
 * GET /api/external-users/:id
 *
 * The company-wide profile the draft leaves open in F2.7: who they are, every
 * group they can reach, and what they have contributed. Built here rather than
 * per-project because that is the shape the directory made possible.
 */
router.get('/:id', auth, async (req, res) => {
    try {
        if (!CAN_READ.includes(req.user.role)) {
            return res.status(403).json({ message: 'You cannot view external users' });
        }

        const person = await ExternalUser.findById(req.params.id)
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');
        if (!person) return res.status(404).json({ message: 'Not found' });

        const memberships = await ExternalParticipant.find({ externalUser: person._id })
            .populate('conversationId', 'name groupType')
            .populate('invitedBy', 'name')
            .sort({ createdAt: -1 });

        const messageCount = await Message.countDocuments({
            externalSender: person._id,
            deletedAt: null
        });

        res.json({
            person: present(person),
            messageCount,
            memberships: memberships.map((m) => ({
                _id: m._id,
                conversation: m.conversationId,
                status: m.status,
                isActive: m.hasAccess(),
                invitedBy: m.invitedBy,
                invitedAt: m.invitedAt,
                joinedAt: m.joinedAt,
                lastSeenAt: m.lastSeenAt,
                expiresAt: m.expiresAt
            }))
        });
    } catch (err) {
        console.error('[EXTERNAL USERS] detail error:', err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Not found' });
        res.status(500).json({ message: 'Could not load that person' });
    }
});

/* ================================================================== *
 * CREATE / EDIT / DELETE
 * ================================================================== */

/** POST /api/external-users  { name, email, company?, phone?, type?, notes? } */
router.post('/', auth, async (req, res) => {
    try {
        if (!CAN_WRITE.includes(req.user.role)) {
            return res.status(403).json({ message: 'You cannot add external users' });
        }

        const name = String(req.body.name || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();

        if (!name || !email) {
            return res.status(400).json({ message: 'A name and an email address are both needed' });
        }
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ message: 'That does not look like an email address' });
        }

        /*
         * A colleague must never become an external user.
         *
         * Without this, adding a staff member's own address mints portal
         * tokens for a real employee's mailbox that bypass the login and the
         * role checks entirely - a second, weaker way into the building.
         */
        const staff = await User.findOne({ email }).select('_id name');
        if (staff) {
            return res.status(400).json({
                message: `${staff.name} works here — add them as an employee, not an external user.`
            });
        }

        const existing = await ExternalUser.findOne({ email });
        if (existing) {
            return res.status(409).json({
                message: `${existing.name} is already in the directory with that email.`,
                existing: present(existing)
            });
        }

        const person = await ExternalUser.create({
            name,
            email,
            company: String(req.body.company || '').trim(),
            phone: String(req.body.phone || '').trim(),
            type: req.body.type || 'VENDOR',
            notes: String(req.body.notes || '').trim(),
            createdBy: req.user.id
        });

        res.status(201).json(present(person));
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: 'Somebody with that email is already in the directory.' });
        }
        console.error('[EXTERNAL USERS] create error:', err.message);
        res.status(500).json({ message: 'Could not add that person' });
    }
});

/**
 * PUT /api/external-users/:id
 *
 * Name, company, phone, type and notes. The email is deliberately NOT editable:
 * it is the identity this record is keyed on and the address every live
 * invitation was sent to, so changing it would silently point existing links at
 * a different person. Somebody who has genuinely changed address is a new
 * record, and the old one can be deactivated.
 */
router.put('/:id', auth, async (req, res) => {
    try {
        if (!CAN_WRITE.includes(req.user.role)) {
            return res.status(403).json({ message: 'You cannot edit external users' });
        }

        const person = await ExternalUser.findById(req.params.id);
        if (!person) return res.status(404).json({ message: 'Not found' });

        if (req.body.name !== undefined) {
            const name = String(req.body.name).trim();
            if (!name) return res.status(400).json({ message: 'A name is needed' });
            person.name = name;
        }
        if (req.body.company !== undefined) person.company = String(req.body.company).trim();
        if (req.body.phone !== undefined) person.phone = String(req.body.phone).trim();
        if (req.body.notes !== undefined) person.notes = String(req.body.notes).trim();
        if (req.body.type !== undefined) person.type = req.body.type;

        if (req.body.isActive !== undefined) {
            const active = Boolean(req.body.isActive);
            if (active !== person.isActive) {
                person.isActive = active;
                person.deactivatedAt = active ? null : new Date();
                person.deactivatedBy = active ? null : req.user.id;
            }
        }

        person.updatedBy = req.user.id;
        await person.save();

        res.json(present(person));
    } catch (err) {
        console.error('[EXTERNAL USERS] update error:', err.message);
        res.status(500).json({ message: 'Could not save those changes' });
    }
});

/**
 * DELETE /api/external-users/:id
 *
 * Really deletes ONLY somebody who has never been anywhere. The moment a person
 * has a membership or has written a message, deleting the row would orphan
 * both: their messages would lose their author and render as being from nobody,
 * in threads the company keeps as a record.
 *
 * So a person with history is deactivated instead, which is the outcome the
 * caller actually wants - they stop being able to reach us anywhere, and stop
 * appearing in the picker - and the response says which of the two happened so
 * the client is not left guessing.
 */
router.delete('/:id', auth, async (req, res) => {
    try {
        if (!CAN_DELETE.includes(req.user.role)) {
            return res.status(403).json({ message: 'Only an admin or HR can remove an external user' });
        }

        const person = await ExternalUser.findById(req.params.id);
        if (!person) return res.status(404).json({ message: 'Not found' });

        const [memberships, messages] = await Promise.all([
            ExternalParticipant.countDocuments({ externalUser: person._id }),
            Message.countDocuments({ externalSender: person._id })
        ]);

        if (memberships === 0 && messages === 0) {
            await ExternalUser.deleteOne({ _id: person._id });
            return res.json({ deleted: true, deactivated: false });
        }

        if (person.isActive) {
            person.isActive = false;
            person.deactivatedAt = new Date();
            person.deactivatedBy = req.user.id;
            person.updatedBy = req.user.id;
            await person.save();
        }

        res.json({
            deleted: false,
            deactivated: true,
            memberships,
            messages,
            message: `${person.name} has taken part in conversations, so their record is kept and their access has been switched off everywhere instead.`
        });
    } catch (err) {
        console.error('[EXTERNAL USERS] delete error:', err.message);
        res.status(500).json({ message: 'Could not remove that person' });
    }
});

/**
 * GET /api/external-users/:id/available/:conversationId
 *
 * Whether this person can still be added to a given group — used by the picker
 * to grey out somebody who is already in it rather than letting the invite
 * fail on submit.
 */
router.get('/:id/available/:conversationId', auth, async (req, res) => {
    try {
        if (!CAN_READ.includes(req.user.role)) {
            return res.status(403).json({ message: 'You cannot view external users' });
        }

        const conversation = await Conversation.findById(req.params.conversationId).select('_id');
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

        const live = await ExternalParticipant.findOne({
            externalUser: req.params.id,
            conversationId: conversation._id,
            status: { $in: ['invited', 'pending', 'active'] }
        }).select('status');

        res.json({ available: !live, status: live?.status || null });
    } catch (err) {
        console.error('[EXTERNAL USERS] availability error:', err.message);
        res.status(500).json({ message: 'Could not check that' });
    }
});

module.exports = router;
module.exports.CAN_READ = CAN_READ;
module.exports.CAN_WRITE = CAN_WRITE;
