const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure the upload directory exists
const uploadDir = path.join(__dirname, '../uploads/purchases');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Create a unique filename: timestamp-originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// Filter to accept Images, PDFs, and short Videos
const fileFilter = (req, file, cb) => {
    // Allowed file extensions
    const allowedExts = /jpeg|jpg|png|pdf|mp4|webm|mov/;
    // Allowed MIME types (Note: .mov files have a MIME type of video/quicktime)
    const allowedMimes = /jpeg|jpg|png|pdf|mp4|webm|quicktime/;

    const extname = allowedExts.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimes.test(file.mimetype.toLowerCase());

    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only images (JPG/PNG), PDFs, and videos (MP4/WEBM/MOV) are allowed!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // Increased to 15MB to match frontend video limit
    fileFilter: fileFilter
});

module.exports = upload;