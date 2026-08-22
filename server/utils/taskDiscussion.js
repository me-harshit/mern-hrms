const TaskComment = require('../models/TaskComment');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { emitToTask } = require('./realtime');
const { processTaskFiles, discardStagedFiles, s3Folder, isVideo } = require('./taskMedia');
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

            // Videos belong on the parent, where the overnight pipeline can
            // handle them — a discussion image is expected to appear instantly.
            if ((req.files || []).some(f => isVideo(f))) {
                discardStagedFiles(req.files);
                return res.status(400).json({ message: 'Only images can be attached to a message. Add videos to the task itself.' });
            }

            const { media } = await processTaskFiles(
                req.files,
                doc.taskType === 'Regular Office Task'
                    ? s3Folder('Office', '/Discussion')
                    : s3Folder(doc.projectId?.name, '/Discussion')
            );

            const comment = await TaskComment.create({
                taskId: doc._id,
                ownerModel,
                author: req.user.id,
                message,
                attachments: media.map(m => ({ url: m.url, fileName: m.fileName }))
            });

            // Everyone involved except whoever just spoke.
            const author = await User.findById(req.user.id).select('name');
            const recipients = [
                ...doc.assignees.map(a => a.toString()),
                doc.assignedBy.toString()
            ].filter((id, i, arr) => id !== req.user.id && arr.indexOf(id) === i);

            const preview = message.length > 80 ? message.slice(0, 80) + '…' : (message || 'shared an image');
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

    return { list, create, remove };
};

module.exports = { buildDiscussionHandlers, canJoinDiscussion };
