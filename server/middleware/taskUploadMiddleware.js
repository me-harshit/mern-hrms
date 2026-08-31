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

/*
 * Extension and mimetype must BOTH pass.
 *
 * Checking only the mimetype trusts a header the client sets; checking only the
 * extension trusts a filename. Requiring both is what makes renaming an
 * executable to .pdf insufficient on its own.
 *
 * Documents were previously limited to html/htm, which meant the honest answer
 * to "here is the signed PDF proving the work" was a rejection — so people
 * screenshotted the PDF, and the task carried a picture of evidence instead of
 * the evidence. The list now matches what the chat accepts, minus the things a
 * task attachment has no use for.
 *
 * Deliberately absent: .svg (scriptable, renders inline in an <img>), and every
 * script and executable extension.
 *
 * Audio stays allowed even though the task attach menu no longer offers a voice
 * note: the per-task discussion thread still records them, and it shares this
 * middleware.
 */
const ALLOWED_EXTS = /^\.(jpe?g|png|webp|gif|heic|mp4|webm|mov|avi|mkv|mp3|m4a|wav|ogg|oga|aac|opus|pdf|docx?|xlsx?|pptx?|txt|csv|zip|html?|htm)$/;

const ALLOWED_MIMES = new RegExp([
    'image/(jpeg|jpg|png|webp|gif|heic)',
    'video/(mp4|webm|quicktime|x-msvideo|x-matroska)',
    'audio/(mpeg|mp4|mp4a-latm|wav|x-wav|ogg|aac|webm|opus|m4a|x-m4a)',
    'application/pdf',
    'application/msword',
    'application/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)',
    'application/vnd\.ms-(excel|powerpoint)',
    'application/(zip|x-zip-compressed|octet-stream)',
    'text/(plain|csv|html)'
].join('|'));

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const extOk = ALLOWED_EXTS.test(ext);
    const mimeOk = ALLOWED_MIMES.test(file.mimetype.toLowerCase());

    /*
     * application/octet-stream is allowed above because that is what several
     * browsers send for .m4a and .zip — but it is also the fallback for anything
     * unrecognised, so on its own it would wave through any extension the regex
     * happens to miss. Paired with the extension check it is safe: the name
     * still has to be one we accept.
     */
    if (extOk && mimeOk) return cb(null, true);

    cb(new Error(
        'That file type is not allowed. Attach images, video, PDF, Office documents, HTML, text, CSV or ZIP.'
    ), false);
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
