const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Use the absolute path variable
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Ensure req.user exists before accessing id to prevent crashes
        if (!req.user || !req.user.id) {
            return cb(new Error('User not authenticated in Multer'));
        }
        cb(null, `${req.user.id}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage });

router.post('/upload-avatar', auth, (req, res, next) => {
    // Manually call the upload middleware to catch errors
    const uploadMiddleware = upload.single('avatar');

    uploadMiddleware(req, res, (err) => {
        if (err) {
            // THIS WILL PRINT THE REAL ERROR IN PM2 LOGS
            console.error("❌ MULTER UPLOAD ERROR:", err);
            return res.status(500).json({
                message: "Upload failed on server",
                error: err.message
            });
        }
        // If no error, continue to your DB logic
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const filePath = `/uploads/${req.file.filename}`;
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

        // 1. Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        // 2. Compare hashed password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        // 3. Create JWT Payload (Include ID and Role)
        const payload = {
            user: {
                id: user.id,
                role: user.role
            }
        };

        // 4. Sign the token
        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '24h' }, // Token valid for 1 day
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

router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});


router.put('/update-profile', auth, async (req, res) => {
    try {
        const { name, email, phoneNumber, address } = req.body;

        // Find user and update
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