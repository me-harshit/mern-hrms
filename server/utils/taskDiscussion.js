const TaskComment = require('../models/TaskComment');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { emitToTask } = require('./realtime');
const { processTaskFiles, discardStagedFiles, s3Folder } = require('./taskMedia');
const VideoCompressionQueue = require('../models/VideoCompressionQueue');
const { IS_PRIVILEGED } = require('./taskScoping');

/**
 * One discussion implementation, used by both one-off tasks and recurring
 * schedules (TaskPlan.md §13.15).
 *
 * A schedule has the same shape a task does for this purpose — title,
 * assignees, assignedBy, taskType, projectId — so the only thing that differs
 * between the two is how the parent is loaded and which url a notification
 * should point at. Everything else (permissions, image handling, notifying the
 * people involved, the live socket push) is identical, and duplicating it was
 * how the two would quietly drift apart.
 */

const notify = async (recipientId, title, message, link) => {
    try {
        await Notification.create({ recipient: recipientId, title, message, type: 'TASK', link });
    } catch (err) {
        console.error('[DISCUSSION] Notification error:', err.message);
    }
};

/**
 * Anyone involved can read and post: the assignees, whoever assigned it, and
 * Admin/HR.
 */
const canJoinDiscussion = (doc, reqUser) =>
    doc.assignees.some(a => a.toString() === reqUser.id) ||
    doc.assignedBy.toString() === reqUser.id ||
    IS_PRIVILEGED.includes(reqUser.role);

/**
 * @param {object}   opts
 * @param {string}   opts.ownerModel  'Task' or 'RecurringTask'
 * @param {Function} opts.load        (id) => document or null, with projectId populated
 * @param {Function} opts.link        (doc) => in-app url for the notification
 * @param {string}   opts.notFound    wording when the parent is missing
 */
const buildDiscussionHandlers = ({ ownerModel, load, link, notFound = 'Not found' }) => {

    const loadFor = async (id, reqUser) => {
        const doc = await load(id);
        if (!doc) return { error: { code: 404, message: notFound } };
        if (!canJoinDiscussion(doc, reqUser)) {
            return { error: { code: 403, message: 'Unauthorized to view this discussion' } };
        }
        return { doc };
    };

    const list = async (req, res) => {
        try {
            const { doc, error } = await loadFor(req.params.id, req.user);
            if (error) return res.status(error.code).json({ message: error.message });

            const comments = await TaskComment.find({ taskId: doc._id, ownerModel })
                .populate('author', 'name role employeeId profilePic')
                .sort({ createdAt: 1 });

            res.json(comments);
        } catch (err) {
            console.error('Discussion Fetch Error:', err.message);
            if (err.kind === 'ObjectId') return res.status(404).json({ message: notFound });
            res.status(500).send('Server Error');
        }
    };

    const create = async (req, res) => {
        try {
            const { doc, error } = await loadFor(req.params.id, req.user);
            if (error) {
                discardStagedFiles(req.files);
                return res.status(error.code).json({ message: error.message });
            }

            const message = (req.body.message || '').trim();
            if (!message && (!req.files || req.files.length === 0)) {
                discardStagedFiles(req.files);
                return res.status(400).json({ message: 'Write something or attach an image' });
            }

            // Images, voice notes and screen recordings all go through the same
            // pipeline the rest of the app uses: images and audio land on S3 at
            // once, a screen recording stages on the VPS so it plays straight
            // away and is compressed overnight.
            const subFolder = doc.taskType === 'Regular Office Task'
                ? s3Folder('Office', '/Discussion')
                : s3Folder(doc.projectId?.name, '/Discussion');

            const { media, pendingVideos } = await processTaskFiles(req.files, subFolder);

            // The browser measures the voice note while recording it, so the
            // player can draw the waveform without re-downloading and decoding
            // the audio for every message in the thread.
            let waveform = null;
            try {
                if (req.body.waveform) waveform = JSON.parse(req.body.waveform);
            } catch (e) { /* a bad payload just means no waveform */ }

            media.forEach(m => {
                if (m.type !== 'audio') return;
                m.durationMs = parseInt(req.body.durationMs, 10) || 0;
                if (Array.isArray(waveform) && waveform.length) {
                    m.waveform = waveform.slice(0, 200).map(Number).filter(n => !Number.isNaN(n));
                }
            });

            const comment = await TaskComment.create({
                taskId: doc._id,
                ownerModel,
                author: req.user.id,
                message,
                attachments: media
            });

            if (pendingVideos.length > 0) {
                await VideoCompressionQueue.insertMany(pendingVideos.map(v => ({
                    ownerModel: 'TaskComment',
                    taskId: comment._id,
                    mediaId: v.mediaId,
                    field: 'attachments',
                    localPath: v.localPath,
                    originalName: v.originalName,
                    projectName: doc.taskType === 'Regular Office Task' ? 'Office' : (doc.projectId?.name || 'General')
                })));
            }

            // Everyone involved except whoever just spoke.
            const author = await User.findById(req.user.id).select('name');
            const recipients = [
                ...doc.assignees.map(a => a.toString()),
                doc.assignedBy.toString()
            ].filter((id, i, arr) => id !== req.user.id && arr.indexOf(id) === i);

            const kind = media[0]?.type;
            const fallback = kind === 'audio' ? 'sent a voice note'
                : kind === 'video' ? 'shared a recording'
                    : 'shared an image';
            const preview = message.length > 80 ? message.slice(0, 80) + '…' : (message || fallback);
            await Promise.all(recipients.map(id => notify(
                id,
                `New message on "${doc.title}"`,
                `${author?.name || 'Someone'}: ${preview}`,
                link(doc)
            )));

            const populated = await TaskComment.findById(comment._id)
                .populate('author', 'name role employeeId profilePic');

            // Anyone with this open sees the message appear immediately.
            emitToTask(doc._id, 'task:comment', populated.toObject());

            res.status(201).json(populated);
        } catch (err) {
            discardStagedFiles(req.files);
            console.error('Discussion Post Error:', err);
            res.status(500).json({ message: 'Server Error while posting message' });
        }
    };

    /**
     * Rewording your own message.
     *
     * Only the author, and only the text — swapping the attachments after
     * people have replied would change what the thread appears to be about.
     * Admin/HR can delete a message but not put words in someone's mouth.
     */
    const update = async (req, res) => {
        try {
            const { error } = await loadFor(req.params.id, req.user);
            if (error) return res.status(error.code).json({ message: error.message });

            const comment = await TaskComment.findOne({
                _id: req.params.commentId,
                taskId: req.params.id,
                ownerModel
            });
            if (!comment) return res.status(404).json({ message: 'Message not found' });

            if (comment.author.toString() !== req.user.id) {
                return res.status(403).json({ message: 'You can only edit your own messages' });
            }

            const message = (req.body.message || '').trim();
            if (!message && comment.attachments.length === 0) {
                return res.status(400).json({ message: 'A message cannot be left empty' });
            }

            comment.message = message;
            comment.editedAt = new Date();
            await comment.save();

            const populated = await TaskComment.findById(comment._id)
                .populate('author', 'name role employeeId profilePic');

            emitToTask(req.params.id, 'task:comment-edited', populated.toObject());
            res.json(populated);
        } catch (err) {
            console.error('Discussion Edit Error:', err.message);
            if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Message not found' });
            res.status(500).json({ message: 'Server Error while editing the message' });
        }
    };

    const remove = async (req, res) => {
        try {
            const comment = await TaskComment.findOne({
                _id: req.params.commentId,
                taskId: req.params.id,
                ownerModel
            });
            if (!comment) return res.status(404).json({ message: 'Message not found' });

            // Your own words, or Admin/HR moderating.
            if (comment.author.toString() !== req.user.id && !IS_PRIVILEGED.includes(req.user.role)) {
                return res.status(403).json({ message: 'You can only delete your own messages' });
            }

            await comment.deleteOne();
            emitToTask(req.params.id, 'task:comment-deleted', { _id: comment._id });
            res.json({ message: 'Message deleted' });
        } catch (err) {
            console.error('Discussion Delete Error:', err.message);
            if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Message not found' });
            res.status(500).send('Server Error');
        }
    };

    return { list, create, update, remove };
};

module.exports = { buildDiscussionHandlers, canJoinDiscussion };
