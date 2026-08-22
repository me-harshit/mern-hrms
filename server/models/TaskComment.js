const mongoose = require('mongoose');
const { mediaSchema } = require('./Task');

/**
 * Discussion thread on a task. Kept in its own collection rather than embedded
 * in Task because comments grow without bound and would bloat every task list
 * query that only needs the summary fields.
 */
const taskCommentSchema = new mongoose.Schema({
    /**
     * Which collection `taskId` points into. Recurring schedules have their own
     * thread, separate from the threads on the individual days they generate.
     * Defaults to 'Task' so every comment written before this existed keeps
     * behaving identically.
     */
    ownerModel: { type: String, enum: ['Task', 'RecurringTask'], default: 'Task' },

    taskId: { type: mongoose.Schema.Types.ObjectId, refPath: 'ownerModel', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    message: { type: String, default: "", trim: true },

    // Set the first time the author rewrites it, so the thread can say so
    // rather than silently showing different words than people replied to.
    editedAt: { type: Date, default: null },

    /**
     * Images, voice notes and screen recordings.
     *
     * Uses the same shape as task media so the compression pipeline, the
     * lightbox and the players all work on it unchanged — images and audio are
     * `ready` at once, a screen recording is `processing_compression` until the
     * midnight job moves it to S3.
     */
    attachments: [mediaSchema]
}, { timestamps: true });

taskCommentSchema.index({ taskId: 1, ownerModel: 1, createdAt: 1 });

module.exports = mongoose.model('TaskComment', taskCommentSchema);
