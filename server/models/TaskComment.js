const mongoose = require('mongoose');

/**
 * Discussion thread on a task. Kept in its own collection rather than embedded
 * in Task because comments grow without bound and would bloat every task list
 * query that only needs the summary fields.
 */
const taskCommentSchema = new mongoose.Schema({
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    message: { type: String, default: "", trim: true },

    // Images only — videos stay in task attachments / completion proof, where
    // the overnight compression pipeline handles them.
    attachments: [{
        url: { type: String, required: true },
        fileName: { type: String, default: "" }
    }]
}, { timestamps: true });

taskCommentSchema.index({ taskId: 1, createdAt: 1 });

module.exports = mongoose.model('TaskComment', taskCommentSchema);
