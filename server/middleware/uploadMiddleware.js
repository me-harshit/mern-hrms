const multer = require('multer');
const path = require('path');

// Use MemoryStorage so the file is kept in memory (req.file.buffer)
const storage = multer.memoryStorage();

// Filter to accept Images, PDFs, and short Videos
const fileFilter = (req, file, cb) => {
    const allowedExts = /jpeg|jpg|png|pdf|mp4|webm|mov/;
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
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: fileFilter
});

module.exports = upload;