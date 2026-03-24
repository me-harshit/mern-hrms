const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const { uploadToS3 } = require('../utils/s3Service');

const upload = require('../middleware/uploadMiddleware'); 

// @route   POST /api/auth/upload-avatar
router.post('/upload-avatar', auth, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image provided' });
        }

        // Send to the 'ProfilePic' subfolder! (S3 service handles the sharp compression)
        const fileUrl = await uploadToS3(req.file, 'ProfilePic');

        // Update the user's record in the DB
        const user = await User.findById(req.user.id);
        user.profilePic = fileUrl; // This is now an AWS URL!
        await user.save();

        res.json({ filePath: fileUrl });
    } catch (err) {
        console.error("Avatar Upload Error:", err.message);
        res.status(500).json({ message: 'Server error during upload' });
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
                role: user.role,
                isPurchaser: user.isPurchaser
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
                    user: { 
                        id: user.id, 
                        name: user.name, 
                        role: user.role,
                        isPurchaser: user.isPurchaser,
                        profilePic: user.profilePic // Good practice to send this on login too
                    } 
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