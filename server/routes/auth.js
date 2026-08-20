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
        user.profilePic = fileUrl;
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

        // 1. Data Sanitization: Strip spaces and force lowercase
        const sanitizedEmail = email.trim().toLowerCase();

        // 2. The $or Query: Check both personal and work email fields
        const user = await User.findOne({
            $or: [
                { email: sanitizedEmail },
                { workEmail: sanitizedEmail }
            ]
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid Email' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid Password' });
        }

        const payload = {
            user: {
                id: user.id,
                role: user.role,
                isPurchaser: user.isPurchaser
            }
        };

        const jwt = require('jsonwebtoken'); // Ensure jwt is imported at the top of your file
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
                        profilePic: user.profilePic,
                        workLocation: user.workLocation
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
        // 1. Extract ALL possible fields sent from the frontend React state
        const {
            name, email, phoneNumber, currentAddress, permanentAddress,
            bloodGroup, aadhaar, emergencyContactName, emergencyContactRelation,
            emergencyContact, jobTitle, department, workLocation, shiftType
        } = req.body;

        // 2. Build a dynamic update object safely
        const updateFields = {};

        if (name) updateFields.name = name;
        if (email) updateFields.email = email;

        // Use !== undefined so users can intentionally clear optional fields by saving an empty string
        if (phoneNumber !== undefined) updateFields.phoneNumber = phoneNumber;
        if (currentAddress !== undefined) updateFields.currentAddress = currentAddress;
        if (permanentAddress !== undefined) updateFields.permanentAddress = permanentAddress;
        if (bloodGroup !== undefined) updateFields.bloodGroup = bloodGroup;
        if (aadhaar !== undefined) updateFields.aadhaar = aadhaar;
        if (emergencyContactName !== undefined) updateFields.emergencyContactName = emergencyContactName;
        if (emergencyContactRelation !== undefined) updateFields.emergencyContactRelation = emergencyContactRelation;
        if (emergencyContact !== undefined) updateFields.emergencyContact = emergencyContact;

        // Employment fields (Open for now, will lock down via RBAC later)
        if (jobTitle !== undefined) updateFields.jobTitle = jobTitle;
        if (department !== undefined) updateFields.department = department;
        if (workLocation !== undefined) updateFields.workLocation = workLocation;
        if (shiftType !== undefined) updateFields.shiftType = shiftType;

        // 3. Execute the update in MongoDB
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updateFields },
            { new: true } // Return the freshly updated document
        ).select('-password');

        res.json(user);
    } catch (err) {
        console.error("Profile Update Error:", err);
        res.status(500).send('Server Error');
    }
});


// @route   POST /api/auth/impersonate/:id
// @desc    Get a login token for another user (Admin Only)
router.post('/impersonate/:id', auth, async (req, res) => {
    try {
        // 1. Only admins can do this
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access Denied: Admins Only' });
        }

        // 2. Find the target employee
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: 'User not found' });

        // Optional safety: Prevent admin from impersonating another admin
        if (targetUser.role === 'ADMIN') {
            return res.status(400).json({ message: 'Cannot impersonate another Admin' });
        }

        // 3. Generate a real token for the target employee
        const payload = {
            user: {
                id: targetUser.id,
                role: targetUser.role
            }
        };

        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' }, (err, token) => {
            if (err) throw err;
            // Send back the new token and the target user's data
            res.json({ token, user: targetUser });
        });

    } catch (err) {
        console.error("Impersonation Error:", err.message);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// PASSWORD MANAGEMENT
// ==========================================

const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

const MIN_PASSWORD_LENGTH = 8;
const RESET_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_RESET_ATTEMPTS = 5;

// The code is only ever stored hashed, so a database leak doesn't hand over
// working reset codes. SHA-256 is fine here — unlike a password, a 6-digit code
// lives for ten minutes and is rate limited.
const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

// crypto.randomInt is uniform; Math.random is not, and is predictable.
const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// Login accepts either address, so the reset flow has to match on both.
const findByAnyEmail = (email, withResetFields = false) => {
    const sanitized = String(email || '').trim().toLowerCase();
    if (!sanitized) return null;
    const query = User.findOne({ $or: [{ email: sanitized }, { workEmail: sanitized }] });
    if (withResetFields) {
        query.select('+resetPasswordCodeHash +resetPasswordExpires +resetPasswordAttempts');
    }
    return query;
};

const validatePassword = (password) => {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    return null;
};

// @route   PUT /api/auth/change-password
// @desc    Change your own password (must know the current one)
router.put('/change-password', auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current and new password are both required' });
        }

        const invalid = validatePassword(newPassword);
        if (invalid) return res.status(400).json({ message: invalid });

        if (currentPassword === newPassword) {
            return res.status(400).json({ message: 'New password must be different from the current one' });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        // Any pending reset code is void once the password changes deliberately.
        user.resetPasswordCodeHash = undefined;
        user.resetPasswordExpires = undefined;
        user.resetPasswordAttempts = 0;

        await user.save();
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        console.error('Change Password Error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   POST /api/auth/forgot-password
// @desc    Email a 6-digit reset code
router.post('/forgot-password', async (req, res) => {
    // Always the same reply, whether or not the account exists — otherwise this
    // endpoint becomes a way to discover which emails are registered.
    const genericReply = { message: 'If that email is registered, a 6-digit code is on its way.' };

    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const user = await findByAnyEmail(email);
        if (!user) return res.json(genericReply);

        const code = generateCode();
        user.resetPasswordCodeHash = hashCode(code);
        user.resetPasswordExpires = new Date(Date.now() + RESET_CODE_TTL_MS);
        user.resetPasswordAttempts = 0;
        await user.save();

        // Send to the address they actually typed, since it belongs to this account.
        const target = String(email).trim().toLowerCase();

        const message = `
            <div style="font-family: 'Segoe UI', sans-serif; max-width: 520px; margin: auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #215D7B; margin-top: 0;">Password Reset Code</h2>
                <p style="color: #334155; font-size: 15px;">Hi ${user.name},</p>
                <p style="color: #334155; font-size: 15px;">Use this code to reset your GTS HRMS password:</p>
                <div style="font-size: 34px; font-weight: 700; letter-spacing: 10px; color: #0f172a; background: #f1f5f9; padding: 18px; text-align: center; border-radius: 10px; margin: 22px 0;">
                    ${code}
                </div>
                <p style="color: #64748b; font-size: 14px;">This code expires in <strong>10 minutes</strong> and can only be used once.</p>
                <p style="color: #64748b; font-size: 14px;">If you didn't request this, you can ignore this email — your password will not change.</p>
            </div>
        `;

        try {
            await sendEmail({ email: target, subject: 'Your GTS HRMS password reset code', message });
        } catch (mailErr) {
            // Don't strand the user with a stored code they never received.
            console.error('Reset email failed:', mailErr.message);
            user.resetPasswordCodeHash = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();
            return res.status(500).json({ message: 'Could not send the reset email. Please try again later.' });
        }

        res.json(genericReply);
    } catch (err) {
        console.error('Forgot Password Error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

/** Shared check for both the verify step and the final reset. */
const checkResetCode = async (email, code) => {
    const user = await findByAnyEmail(email, true);
    if (!user || !user.resetPasswordCodeHash || !user.resetPasswordExpires) {
        return { error: 'Invalid or expired code' };
    }

    if (user.resetPasswordExpires.getTime() < Date.now()) {
        return { error: 'That code has expired. Request a new one.' };
    }

    if ((user.resetPasswordAttempts || 0) >= MAX_RESET_ATTEMPTS) {
        return { error: 'Too many incorrect attempts. Request a new code.' };
    }

    if (user.resetPasswordCodeHash !== hashCode(String(code).trim())) {
        user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
        await user.save();
        const left = MAX_RESET_ATTEMPTS - user.resetPasswordAttempts;
        return { error: left > 0 ? `Incorrect code. ${left} attempt(s) remaining.` : 'Too many incorrect attempts. Request a new code.' };
    }

    return { user };
};

// @route   POST /api/auth/verify-reset-code
// @desc    Check a code before asking for the new password
router.post('/verify-reset-code', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ message: 'Email and code are required' });

        const { error } = await checkResetCode(email, code);
        if (error) return res.status(400).json({ message: error });

        res.json({ message: 'Code verified' });
    } catch (err) {
        console.error('Verify Reset Code Error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   POST /api/auth/reset-password
// @desc    Set a new password using the emailed code
router.post('/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword) {
            return res.status(400).json({ message: 'Email, code and new password are required' });
        }

        const invalid = validatePassword(newPassword);
        if (invalid) return res.status(400).json({ message: invalid });

        const { user, error } = await checkResetCode(email, code);
        if (error) return res.status(400).json({ message: error });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        // One code, one use.
        user.resetPasswordCodeHash = undefined;
        user.resetPasswordExpires = undefined;
        user.resetPasswordAttempts = 0;
        await user.save();

        res.json({ message: 'Password reset successfully. You can sign in now.' });
    } catch (err) {
        console.error('Reset Password Error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;