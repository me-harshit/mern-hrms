const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const bcrypt = require('bcryptjs');

// @route   GET /api/employees
// @desc    Get all employees (HR/Admin only)
router.get('/', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') {
            return res.status(403).json({ message: 'Access denied' });
        }
        const employees = await User.find().select('-password'); // Don't send passwords
        res.json(employees);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/employees/add
// @desc    HR/Admin adds a new employee
router.post('/add', auth, async (req, res) => {
    try {
        // 1. Destructure ALL fields sent from frontend
        const {
            name, email, password, role,
            joiningDate, aadhaar, emergencyContact
        } = req.body;

        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'User already exists' });

        // 2. Create User with ALL fields
        user = new User({
            name,
            email,
            password,
            role,
            joiningDate,
            aadhaar,
            emergencyContact
        });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();
        res.json({ message: 'Employee added successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/employees/:id
router.put('/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Denied' });

        const { name, email, role, status, joiningDate, password, aadhaar, emergencyContact } = req.body;

        // 2. Add them to the update object
        let updateData = {
            name,
            email,
            role,
            status,
            joiningDate,
            aadhaar,           // Added
            emergencyContact   // Added
        };

        // If a password is provided, hash it
        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        const updatedEmployee = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true }
        ).select('-password');

        res.json(updatedEmployee);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;