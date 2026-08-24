const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { uploadToS3 } = require('./s3Service');

const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
const AUDIO_EXTS = ['.mp3', '.m4a', '.wav', '.ogg', '.oga', '.aac'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Project names like "AI Expo" or "LW Sope (VR)" would put raw spaces and
 * brackets into the S3 key, and the resulting url is not fetchable without
 * manual encoding. Fold anything unsafe into underscores instead.
 */
const s3Folder = (projectName, suffix = '') => {
    const safe = (projectName || 'General')
        .replace(/[^a-zA-Z0-9\-_]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'General';
    return `Tasks/${safe}${suffix}`;
};

// Checked before isVideo, and mimetype first: a voice note is .webm too, so
// the extension alone would call it a video and send it to the night job.
const isAudio = (file) =>
    file.mimetype.startsWith('audio/') ||
    AUDIO_EXTS.includes(path.extname(file.originalname).toLowerCase());

const isVideo = (file) =>
    !isAudio(file) && (
        file.mimetype.startsWith('video/') ||
        VIDEO_EXTS.includes(path.extname(file.originalname).toLowerCase())
    );

const isImage = (file) =>
    file.mimetype.startsWith('image/') ||
    IMAGE_EXTS.includes(path.extname(file.originalname).toLowerCase());

/**
 * Turns the files multer staged on disk into task media entries.
 *
 * Images    -> pushed to S3 right away, local copy deleted, marked `ready`.
 * Videos    -> left on the VPS and served from /uploads/tasks/... so they are
 *              watchable immediately, marked `processing_compression`. The
 *              midnight cron compresses them and swaps the url to S3.
 * Documents -> anything the upload filter allows that isn't audio/video/image
 *              (currently just HTML briefs) — pushed to S3 like an image, but
 *              tagged `document` rather than `image` so the client renders a
 *              file tile instead of trying to draw it as a picture.
 *
 * Returns { media, pendingVideos } where pendingVideos carries what the caller
 * needs to write into VideoCompressionQueue once the parent Task has an _id.
 */
const processTaskFiles = async (files, subFolder = 'Tasks/General') => {
    const media = [];
    const pendingVideos = [];

    for (const file of files || []) {
        // Pre-generate the id so the queue row can point at this exact media
        // entry before the parent document is ever saved.
        const mediaId = new mongoose.Types.ObjectId();

        if (isAudio(file)) {
            // Small enough to go straight to S3 — a voice note is seconds of
            // Opus, not the hundreds of megabytes a screen capture can be.
            const buffer = fs.readFileSync(file.path);
            const url = await uploadToS3(
                { buffer, mimetype: file.mimetype, originalname: file.originalname },
                subFolder
            );

            fs.unlink(file.path, (err) => {
                if (err) console.error('[TASK MEDIA] Could not remove staged audio:', err.message);
            });

            media.push({
                _id: mediaId,
                url,
                fileName: file.originalname,
                type: 'audio',
                status: 'ready'
            });
        } else if (isVideo(file)) {
            media.push({
                _id: mediaId,
                url: `/uploads/tasks/${file.filename}`,
                fileName: file.originalname,
                type: 'video',
                status: 'processing_compression'
            });

            pendingVideos.push({
                mediaId,
                localPath: file.path,
                originalName: file.originalname
            });
        } else {
            // Small enough to round-trip through memory safely. uploadToS3
            // only runs its resize step for an image/* mimetype, so a
            // document's bytes go up untouched either way — this branch just
            // needs to record the right `type` for the client to render.
            const buffer = fs.readFileSync(file.path);
            const url = await uploadToS3(
                { buffer, mimetype: file.mimetype, originalname: file.originalname },
                subFolder
            );

            // The staged copy has served its purpose.
            fs.unlink(file.path, (err) => {
                if (err) console.error('[TASK MEDIA] Could not remove staged file:', err.message);
            });

            media.push({
                _id: mediaId,
                url,
                fileName: file.originalname,
                type: isImage(file) ? 'image' : 'document',
                status: 'ready'
            });
        }
    }

    return { media, pendingVideos };
};

/**
 * Best-effort cleanup: if a route fails after multer already wrote files to
 * disk, we don't want orphans piling up in the staging folder.
 */
const discardStagedFiles = (files) => {
    for (const file of files || []) {
        fs.unlink(file.path, () => { });
    }
};

module.exports = { processTaskFiles, discardStagedFiles, isVideo, isAudio, s3Folder };
