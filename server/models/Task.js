const mongoose = require('mongoose');

const TASK_STATUSES = ['Pending', 'In Progress', 'On Hold', 'Completed'];
const TASK_TYPES = ['Project Task', 'Regular Office Task'];

// A single image/video attached to a task.
// Images go straight to S3. Videos are staged on the VPS first (`url` points at
// /uploads/tasks/...) and only swap to an S3 url after the nightly compression
// job runs — that's why `status` exists.
const mediaSchema = new mongoose.Schema({
    url: { type: String, required: true },
    fileName: { type: String, default: "" },
    type: { type: String, enum: ['image', 'video'], required: true },
    status: {
        type: String,
        enum: ['ready', 'processing_compression', 'failed'],
        default: 'ready'
    },
    // Only set on completion proof — who submitted this piece of evidence.
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const taskSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    // Mirrors Expense.expenseType — not all work belongs to a client project.
    taskType: {
        type: String,
        enum: ['Project Task', 'Regular Office Task'],
        default: 'Project Task'
    },

    // Only meaningful for project work; office tasks leave this null.
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: function () { return this.taskType === 'Project Task'; }
    },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High', 'Urgent'],
        default: 'Medium'
    },

    // One status for the whole task. However many people are on it, they are
    // working towards the same outcome — whoever moves it, moves it for everyone.
    status: {
        type: String,
        enum: TASK_STATUSES,
        default: 'Pending'
    },
    statusNote: { type: String, default: "" },
    statusUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: { type: Date },

    startDate: { type: Date },
    dueDate: { type: Date, required: true },

    attachments: [mediaSchema],
    completionProof: [mediaSchema],

    // Simple membership list — everyone here shares the one status above.
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    isArchived: { type: Boolean, default: false }
}, { timestamps: true });

// The list views constantly ask "tasks for this user" and "tasks I created".
taskSchema.index({ assignees: 1, isArchived: 1 });
taskSchema.index({ assignedBy: 1, isArchived: 1 });
taskSchema.index({ status: 1, isArchived: 1 });

module.exports = mongoose.model('Task', taskSchema);
module.exports.TASK_STATUSES = TASK_STATUSES;
module.exports.TASK_TYPES = TASK_TYPES;
