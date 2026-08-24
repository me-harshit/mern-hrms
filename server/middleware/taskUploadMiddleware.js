const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Task attachments are handled differently from expense attachments:
 * everything lands on disk first instead of in memory, because a task can carry
 * a several-hundred-MB video and buffering that in RAM would take the server
 * down. Images are read back off disk and pushed to S3 immediately by the route;
 * videos stay put until the midnight compression job picks them up.
 */

const STAGING_DIR = path.join(__dirname, '../uploads/tasks');

// Multer will not create the destination for us.
if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, STAGING_DIR),
    filename: (req, file, cb) => {
        // Random name: these are served over the public /uploads static route,
        // so the filename must not be guessable from the task or user.
        const unique = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
        cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
    }
});

const fileFilter = (req, file, cb) => {
    // html/htm covers "supporting document" briefs — a report or a mockup
    // someone exported as a static page rather than a screenshot.
    const allowedExts = /jpeg|jpg|png|webp|mp4|webm|mov|avi|mkv|mp3|m4a|wav|ogg|oga|aac|html|htm/;
    const allowedMimes = /jpeg|jpg|png|webp|mp4|webm|quicktime|x-msvideo|x-matroska|mpeg|mp4a|wav|ogg|aac|opus|html/;

    const extname = allowedExts.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimes.test(file.mimetype.toLowerCase());

    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only images (JPG/PNG/WEBP), videos (MP4/WEBM/MOV/AVI/MKV) and HTML documents are allowed!'), false);
    }
};

const taskUpload = multer({
    storage: storage,
    limits: { fileSize: 300 * 1024 * 1024 }, // 300MB — raw video, pre-compression
    fileFilter: fileFilter
});

module.exports = taskUpload;
module.exports.STAGING_DIR = STAGING_DIR;
// Exposed for direct testing — multer's own instance doesn't surface it.
module.exports.fileFilter = fileFilter;
