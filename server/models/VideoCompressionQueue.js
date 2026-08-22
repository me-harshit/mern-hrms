const mongoose = require('mongoose');

/**
 * One row per raw video sitting on the VPS waiting for the midnight batch.
 *
 * Kept as its own collection (instead of a flag buried inside Task) so the cron
 * job can find its work with a single flat query rather than scanning every
 * task's nested media arrays.
 */
const videoCompressionQueueSchema = new mongoose.Schema({
    /**
     * Which collection `taskId` points into. A recurring schedule carries its
     * own brief media (TaskPlan.md §13.7), and those videos stage and compress
     * exactly like a task's — but the cron has to look them up in the right
     * place. Defaults to 'Task' so every row written before this existed keeps
     * behaving identically.
     */
    ownerModel: { type: String, enum: ['Task', 'RecurringTask', 'TaskComment'], default: 'Task' },

    taskId: { type: mongoose.Schema.Types.ObjectId, refPath: 'ownerModel', required: true },

    // _id of the media subdocument inside the task — stable even if the array
    // is reordered, unlike an index would be.
    mediaId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // Which array on the Task holds that media.
    field: { type: String, enum: ['attachments', 'completionProof'], required: true },

    // Only set for completionProof — tells us which assignee's row to look in.
    assigneeUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    localPath: { type: String, required: true },
    originalName: { type: String, default: "" },
    projectName: { type: String, default: "General" }, // used to build the S3 subfolder

    status: {
        type: String,
        enum: ['queued', 'processing', 'done', 'failed'],
        default: 'queued'
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
    processedAt: { type: Date }
}, { timestamps: true });

videoCompressionQueueSchema.index({ status: 1, attempts: 1 });

module.exports = mongoose.model('VideoCompressionQueue', videoCompressionQueueSchema);
