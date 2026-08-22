const mongoose = require('mongoose');

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

    // Images only — videos stay in task attachments / completion proof, where
    // the overnight compression pipeline handles them.
    attachments: [{
        url: { type: String, required: true },
        fileName: { type: String, default: "" }
    }]
}, { timestamps: true });

taskCommentSchema.index({ taskId: 1, ownerModel: 1, createdAt: 1 });

module.exports = mongoose.model('TaskComment', taskCommentSchema);
