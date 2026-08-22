const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

const Task = require('../models/Task');
const RecurringTask = require('../models/RecurringTask');
const TaskComment = require('../models/TaskComment');
const VideoCompressionQueue = require('../models/VideoCompressionQueue');
const { uploadToS3 } = require('../utils/s3Service');
const { s3Folder } = require('../utils/taskMedia');

// Use the bundled binary so the VPS doesn't need a system-wide ffmpeg install.
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const MAX_ATTEMPTS = 3;
const CONCURRENCY = 2;      // keep a couple of cores free on the VPS
const MAX_WIDTH = 1280;
const CRF = 28;

// ========================================================
// COMPRESS ONE FILE
// ========================================================
const compressVideo = (inputPath, outputPath) => new Promise((resolve, reject) => {
    ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('128k')
        .outputOptions([
            `-crf ${CRF}`,
            '-preset medium',
            // Downscale only if it's wider than the cap; -2 keeps the aspect
            // ratio and forces an even height (libx264 requires that).
            `-vf scale='min(${MAX_WIDTH},iw)':-2`,
            '-movflags +faststart' // lets the browser start playing before full download
        ])
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath);
});

// ========================================================
// POINT THE OWNER AT THE NEW S3 URL
// ========================================================
// A queued video belongs either to a Task or to a RecurringTask's brief. Both
// keep their media in a top-level `attachments` array of the same shape, so the
// only difference is which collection to update.
const OWNERS = { Task, RecurringTask, TaskComment };
const ownerFor = (job) => OWNERS[job.ownerModel] || Task;

// Both media arrays live at the top level, so a positional match on the media
// _id is all that's needed.
const attachCompressedUrl = async (job, url) => {
    const field = job.field === 'completionProof' ? 'completionProof' : 'attachments';
    return ownerFor(job).updateOne(
        { _id: job.taskId, [`${field}._id`]: job.mediaId },
        { $set: { [`${field}.$.url`]: url, [`${field}.$.status`]: 'ready' } }
    );
};

const markMediaFailed = async (job) => {
    const field = job.field === 'completionProof' ? 'completionProof' : 'attachments';
    return ownerFor(job).updateOne(
        { _id: job.taskId, [`${field}._id`]: job.mediaId },
        { $set: { [`${field}.$.status`]: 'failed' } }
    );
};

const safeUnlink = (filePath) => {
    if (!filePath) return;
    fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
            console.error('[VIDEO CRON] Could not delete', filePath, '-', err.message);
        }
    });
};

// ========================================================
// PROCESS ONE QUEUE ROW
// ========================================================
const processJob = async (job) => {
    const compressedPath = job.localPath.replace(path.extname(job.localPath), '') + '-compressed.mp4';

    try {
        job.status = 'processing';
        job.attempts += 1;
        await job.save();

        // The owner (or just this attachment) may have been removed since upload.
        const owner = await ownerFor(job).findById(job.taskId).select('_id');
        if (!owner) {
            console.log(`[VIDEO CRON] ${job.ownerModel || 'Task'} ${job.taskId} is gone — discarding raw file.`);
            safeUnlink(job.localPath);
            job.status = 'done';
            job.lastError = 'Parent record no longer exists';
            job.processedAt = new Date();
            await job.save();
            return;
        }

        if (!fs.existsSync(job.localPath)) {
            throw new Error(`Staged file missing at ${job.localPath}`);
        }

        const beforeBytes = fs.statSync(job.localPath).size;
        await compressVideo(job.localPath, compressedPath);
        const afterBytes = fs.statSync(compressedPath).size;

        const buffer = fs.readFileSync(compressedPath);
        const url = await uploadToS3(
            {
                buffer,
                mimetype: 'video/mp4',
                originalname: (job.originalName || 'video').replace(/\.[^.]+$/, '') + '.mp4'
            },
            s3Folder(job.projectName, job.field === 'completionProof' ? '/Proof' : '')
        );

        await attachCompressedUrl(job, url);

        // Only reclaim disk once S3 has the file and the task points at it.
        safeUnlink(job.localPath);
        safeUnlink(compressedPath);

        job.status = 'done';
        job.lastError = '';
        job.processedAt = new Date();
        await job.save();

        const saved = (100 - (afterBytes / beforeBytes) * 100).toFixed(1);
        console.log(`[VIDEO CRON] ✅ ${job.originalName}: ${(beforeBytes / 1048576).toFixed(1)}MB → ${(afterBytes / 1048576).toFixed(1)}MB (-${saved}%)`);
    } catch (err) {
        // Clear the half-written output, but never the raw source — that's the
        // only copy we have to retry from.
        safeUnlink(compressedPath);

        job.status = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued';
        job.lastError = err.message;
        await job.save();

        if (job.status === 'failed') {
            await markMediaFailed(job);
            console.error(`[VIDEO CRON] ❌ ${job.originalName} failed permanently after ${job.attempts} attempts: ${err.message}. Raw file kept at ${job.localPath}`);
        } else {
            console.error(`[VIDEO CRON] ⚠ ${job.originalName} attempt ${job.attempts} failed, will retry tomorrow: ${err.message}`);
        }
    }
};

// ========================================================
// THE NIGHTLY BATCH
// ========================================================
const runCompressionBatch = async () => {
    try {
        const jobs = await VideoCompressionQueue.find({
            status: { $in: ['queued', 'failed'] },
            attempts: { $lt: MAX_ATTEMPTS }
        });

        if (jobs.length === 0) {
            console.log('[VIDEO CRON] Nothing queued tonight.');
            return;
        }

        console.log(`[VIDEO CRON] Starting batch of ${jobs.length} video(s)...`);

        // Small fixed-size worker pool — compressing everything at once would
        // peg the VPS.
        let cursor = 0;
        const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
            while (cursor < jobs.length) {
                const job = jobs[cursor++];
                await processJob(job);
            }
        });
        await Promise.all(workers);

        console.log('[VIDEO CRON] Batch complete.');
    } catch (err) {
        console.error('[VIDEO CRON] Batch error:', err);
    }
};

// Midnight, every night.
cron.schedule('0 0 * * *', runCompressionBatch);

/**
 * Catch-up sweep on boot.
 *
 * node-cron only fires inside a live process, so if the server is down or
 * restarting at 00:00 that night's batch is silently skipped and the raw files
 * sit on disk until the next one. This picks up anything that has been waiting
 * longer than a day and clears the backlog shortly after startup.
 *
 * Delayed a couple of minutes so it never competes with boot, and it reuses the
 * same queue + retry logic, so a file is still only ever processed once.
 */
const STARTUP_DELAY_MS = 2 * 60 * 1000;
const STALE_AFTER_MS = 20 * 60 * 60 * 1000; // ~a missed nightly run

setTimeout(async () => {
    try {
        const stale = await VideoCompressionQueue.countDocuments({
            status: { $in: ['queued', 'failed'] },
            attempts: { $lt: MAX_ATTEMPTS },
            createdAt: { $lt: new Date(Date.now() - STALE_AFTER_MS) }
        });

        if (stale > 0) {
            console.log(`[VIDEO CRON] Startup catch-up: ${stale} video(s) missed a nightly run. Processing now...`);
            await runCompressionBatch();
        }
    } catch (err) {
        console.error('[VIDEO CRON] Startup catch-up error:', err.message);
    }
}, STARTUP_DELAY_MS).unref(); // never hold the process open on its own

module.exports = { runCompressionBatch, compressVideo };
