const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- DEBUGGING PATH RESOLUTION ---
// process.cwd() gets the folder you are in when you run 'node index.js'
const uploadDir = path.join(process.cwd(), 'uploads');

console.log("------------------------------------------------");
console.log("📂 UPLOAD DIRECTORY SET TO:", uploadDir);
console.log("✅ Does folder exist?", fs.existsSync(uploadDir));
console.log("------------------------------------------------");

// Ensure folder exists
if (!fs.existsSync(uploadDir)) {
    console.log("⚠️ Folder missing. Creating it now...");
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Use the explicit absolute path
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        if (!req.user || !req.user.id) {
            return cb(new Error('User not authenticated in Multer'));
        }
        const uniqueSuffix = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${req.user.id}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({ storage });

// --- UPLOAD ROUTE WITH ERROR HANDLING ---
router.post('/upload-avatar', auth, (req, res, next) => {
    const uploadMiddleware = upload.single('avatar');
    
    uploadMiddleware(req, res, (err) => {
        if (err) {
            console.error("❌ MULTER UPLOAD ERROR:", err);
            // Return JSON error so frontend doesn't get HTML 500 page
            return res.status(500).json({ 
                message: "Upload failed on server", 
                error: err.message,
                pathAttempted: uploadDir 
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Save relative path for the frontend URL
        const filePath = `/uploads/${req.file.filename}`;
        
        console.log("✅ File saved successfully at:", req.file.path);
        
        await User.findByIdAndUpdate(req.user.id, { profilePic: filePath });
        res.json({ filePath });
    } catch (err) {
        console.error("❌ DB SAVE ERROR:", err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid Credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid Credentials' });

        const payload = { user: { id: user.id, role: user.role } };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '24h' },
            (err, token) => {
                if (err) throw err;
                res.json({ 
                    token, 
                    user: { id: user.id, name: user.name, role: user.role } 
                });
            }
        );
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/auth/me
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/auth/update-profile
router.put('/update-profile', auth, async (req, res) => {
    try {
        const { name, email, phoneNumber, address } = req.body;
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: { name, email, phoneNumber, address } },
            { new: true }
        ).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;