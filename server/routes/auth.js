const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 1. Define Upload Directory
const uploadDir = path.join(__dirname, '../uploads');

// 2. Ensure directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 3. Configure Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        if (!req.user || !req.user.id) {
            return cb(new Error('User not authenticated'));
        }
        const uniqueSuffix = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${req.user.id}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({ storage });

// @route   POST /api/auth/upload-avatar
router.post('/upload-avatar', auth, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const filePath = `/uploads/${req.file.filename}`;
        
        // Update User Profile
        await User.findByIdAndUpdate(req.user.id, { profilePic: filePath });
        
        res.json({ filePath });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        const payload = {
            user: {
                id: user.id,
                role: user.role
            }
        };

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