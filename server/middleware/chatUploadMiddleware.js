const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Chat attachments.
 *
 * Same disk-first strategy as taskUploadMiddleware — a screen recording can be
 * hundreds of megabytes and buffering that in RAM would take the server down —
 * but with a wider file filter. A task attachment is evidence of work, so the
 * narrow image/video/html list is right there; a chat is where people send each
 * other the PDF quote and the Excel sheet, and rejecting those is the fastest
 * way to push the conversation back to WhatsApp, which is the one outcome this
 * whole module exists to prevent.
 *
 * Staged in its own directory so the two features' temp files never collide and
 * a cleanup sweep of one cannot eat the other's pending uploads.
 */

const STAGING_DIR = path.join(__dirname, '../uploads/chat');

if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, STAGING_DIR),
    filename: (req, file, cb) => {
        // Random: staged videos are served over the public /uploads route until
        // the cron moves them, so the name must not be guessable from the
        // conversation or the sender.
        const unique = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
        cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
    }
});

/*
 * Extension and mimetype must BOTH pass.
 *
 * Checking only the mimetype trusts a header the browser lets the client set;
 * checking only the extension trusts a filename. Requiring both is what makes
 * renaming an executable to .pdf insufficient on its own.
 *
 * Deliberately absent: .svg (scriptable, and it renders inline in an <img>),
 * and every archive-of-executables and script extension. A chat that forwards
 * .exe or .js between colleagues is a malware delivery path with a company
 * logo on it.
 */
const ALLOWED_EXTS = /^\.(jpe?g|png|webp|gif|heic|mp4|webm|mov|avi|mkv|mp3|m4a|wav|ogg|oga|aac|opus|pdf|docx?|xlsx?|pptx?|txt|csv|zip)$/;

const ALLOWED_MIMES = new RegExp([
    'image/(jpeg|jpg|png|webp|gif|heic)',
    'video/(mp4|webm|quicktime|x-msvideo|x-matroska)',
    'audio/(mpeg|mp4|mp4a-latm|wav|x-wav|ogg|aac|webm|opus|m4a|x-m4a)',
    'application/pdf',
    'application/msword',
    'application/vnd\\.openxmlformats-officedocument\\.(wordprocessingml\\.document|spreadsheetml\\.sheet|presentationml\\.presentation)',
    'application/vnd\\.ms-(excel|powerpoint)',
    'application/(zip|x-zip-compressed|octet-stream)',
    'text/(plain|csv)'
].join('|'));

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const extOk = ALLOWED_EXTS.test(ext);
    const mimeOk = ALLOWED_MIMES.test(file.mimetype.toLowerCase());

    /*
     * application/octet-stream is in the allow-list above because that is what
     * several browsers send for .m4a voice notes and for .zip — but it is also
     * the fallback for anything unrecognised, so on its own it would wave
     * through any extension the regex happens to miss. Paired with the
     * extension check it is safe: the name still has to be one we accept.
     */
    if (extOk && mimeOk) return cb(null, true);

    cb(new Error(
        'That file type is not allowed. Send images, video, audio, PDF, Office documents, text, CSV or ZIP.'
    ), false);
};

const chatUpload = multer({
    storage,
    limits: {
        fileSize: 300 * 1024 * 1024,  // matches tasks — raw screen recording, pre-compression
        files: 10                      // one message, not a bulk uploader
    },
    fileFilter
});

module.exports = chatUpload;
module.exports.STAGING_DIR = STAGING_DIR;
// Exposed for direct testing — multer's own instance doesn't surface it.
module.exports.fileFilter = fileFilter;
