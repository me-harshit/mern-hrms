const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { uploadToS3 } = require('../utils/s3Service');
const Document = require('../models/Document');
const Ack = require('../models/DocumentAcknowledgement');
const User = require('../models/User');

// Only ADMIN and HR may upload / edit / view compliance.
const canManage = (req) => ['ADMIN', 'HR'].includes(req.user.role);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const clientIp = (req) =>
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';

// @route GET /api/documents
// @desc  All active documents + the CURRENT user's acknowledgement status. (Everyone)
router.get('/', auth, async (req, res) => {
    try {
        const docs = await Document.find({ isActive: true }).sort({ createdAt: 1 }).lean();
        const acks = await Ack.find({ userId: req.user.id, documentId: { $in: docs.map(d => d._id) } }).lean();

        const byDoc = new Map();
        for (const a of acks) {
            const k = String(a.documentId);
            const prev = byDoc.get(k);
            if (!prev || a.version > prev.version) byDoc.set(k, a);
        }

        const data = docs.map(d => {
            const ack = byDoc.get(String(d._id));
            const acknowledged = !!ack && ack.version === d.version;
            return {
                ...d,
                acknowledged,
                // Signed an older version -> the file changed, must sign again.
                needsReacknowledge: !!ack && ack.version < d.version,
                acknowledgedAt: acknowledged ? ack.acknowledgedAt : null,
                signedName: acknowledged ? ack.signedName : null
            };
        });

        res.json(data);
    } catch (err) {
        console.error('Documents fetch error:', err.message);
        res.status(500).send('Server Error');
    }
});

// @route GET /api/documents/pending-count
// @desc  Number of documents this user still needs to acknowledge (sidebar badge / banner).
router.get('/pending-count', auth, async (req, res) => {
    try {
        const docs = await Document.find({ isActive: true }).select('version').lean();
        if (!docs.length) return res.json({ pending: 0, total: 0 });

        const acks = await Ack.find({ userId: req.user.id, documentId: { $in: docs.map(d => d._id) } })
            .select('documentId version').lean();

        const signed = new Set(acks.map(a => `${a.documentId}:${a.version}`));
        const pending = docs.filter(d => !signed.has(`${d._id}:${d.version}`)).length;

        res.json({ pending, total: docs.length });
    } catch (err) {
        console.error('Pending count error:', err.message);
        res.status(500).send('Server Error');
    }
});

// @route POST /api/documents
// @desc  Upload a new document. (ADMIN/HR)
router.post('/', auth, upload.single('file'), async (req, res) => {
    try {
        if (!canManage(req)) return res.status(403).json({ message: 'Access denied' });
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const { title, description, category } = req.body;
        if (!title || !title.trim()) return res.status(400).json({ message: 'Title is required' });

        const fileHash = sha256(req.file.buffer);
        const fileUrl = await uploadToS3(req.file, 'Documents');

        const doc = await new Document({
            title: title.trim(),
            description: description || '',
            category: category || 'Policy',
            fileUrl,
            fileName: req.file.originalname,
            fileHash,
            version: 1,
            uploadedBy: req.user.id
        }).save();

        res.json(doc);
    } catch (err) {
        console.error('Document upload error:', err.message);
        res.status(500).json({ message: 'Server error during upload' });
    }
});

// @route PUT /api/documents/:id
// @desc  Update metadata, or replace the file (bumps version -> forces re-acknowledgement). (ADMIN/HR)
router.put('/:id', auth, upload.single('file'), async (req, res) => {
    try {
        if (!canManage(req)) return res.status(403).json({ message: 'Access denied' });

        const doc = await Document.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: 'Document not found' });

        const { title, description, category } = req.body;
        if (title !== undefined) doc.title = title.trim();
        if (description !== undefined) doc.description = description;
        if (category !== undefined) doc.category = category;

        if (req.file) {
            doc.fileHash = sha256(req.file.buffer);
            doc.fileUrl = await uploadToS3(req.file, 'Documents');
            doc.fileName = req.file.originalname;
            doc.version += 1; // new file => everyone re-acknowledges
        }

        await doc.save();
        res.json(doc);
    } catch (err) {
        console.error('Document update error:', err.message);
        res.status(500).send('Server Error');
    }
});

// @route DELETE /api/documents/:id  (soft delete — keeps the acknowledgement audit trail)
router.delete('/:id', auth, async (req, res) => {
    try {
        if (!canManage(req)) return res.status(403).json({ message: 'Access denied' });
        const doc = await Document.findByIdAndUpdate(req.params.id, { $set: { isActive: false } }, { new: true });
        if (!doc) return res.status(404).json({ message: 'Document not found' });
        res.json({ message: 'Document archived' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route POST /api/documents/:id/acknowledge
// @desc  Click-wrap acknowledgement: checkbox + typed name, recorded with IP/UA/version/hash. (Everyone)
router.post('/:id/acknowledge', auth, async (req, res) => {
    try {
        const { signedName, agreed } = req.body;

        if (agreed !== true) return res.status(400).json({ message: 'You must confirm you have read the document.' });
        if (!signedName || !signedName.trim()) return res.status(400).json({ message: 'Please type your full name to sign.' });

        const doc = await Document.findById(req.params.id);
        if (!doc || !doc.isActive) return res.status(404).json({ message: 'Document not found' });

        const existing = await Ack.findOne({ documentId: doc._id, userId: req.user.id, version: doc.version });
        if (existing) return res.status(400).json({ message: 'You have already acknowledged this version.' });

        const ack = await new Ack({
            documentId: doc._id,
            userId: req.user.id,
            version: doc.version,
            fileHash: doc.fileHash,
            signedName: signedName.trim(),
            acknowledgedAt: new Date(),
            ipAddress: clientIp(req),
            userAgent: req.get('user-agent') || ''
        }).save();

        res.json({ message: 'Acknowledged', ack });
    } catch (err) {
        // Duplicate key -> raced double-submit
        if (err.code === 11000) return res.status(400).json({ message: 'You have already acknowledged this version.' });
        console.error('Acknowledge error:', err.message);
        res.status(500).send('Server Error');
    }
});

// @route GET /api/documents/:id/acknowledgements
// @desc  Compliance report: who has signed the current version, who hasn't. (ADMIN/HR)
router.get('/:id/acknowledgements', auth, async (req, res) => {
    try {
        if (!canManage(req)) return res.status(403).json({ message: 'Access denied' });

        const doc = await Document.findById(req.params.id).lean();
        if (!doc) return res.status(404).json({ message: 'Document not found' });

        const users = await User.find({ status: 'ACTIVE', role: { $ne: 'ADMIN' } })
            .select('name email employeeId').sort({ employeeId: 1 }).lean();

        const acks = await Ack.find({ documentId: doc._id, version: doc.version }).lean();
        const byUser = new Map(acks.map(a => [String(a.userId), a]));

        const rows = users.map(u => {
            const a = byUser.get(String(u._id));
            return {
                userId: u._id, name: u.name, email: u.email, employeeId: u.employeeId,
                acknowledged: !!a,
                acknowledgedAt: a ? a.acknowledgedAt : null,
                signedName: a ? a.signedName : null,
                ipAddress: a ? a.ipAddress : null
            };
        });

        res.json({
            document: { _id: doc._id, title: doc.title, version: doc.version },
            summary: { total: rows.length, acknowledged: rows.filter(r => r.acknowledged).length },
            rows
        });
    } catch (err) {
        console.error('Compliance report error:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
