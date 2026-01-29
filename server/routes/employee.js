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
        const employees = await User.find().select('-password');
        res.json(employees);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/employees/:id
// @desc    Get single employee by ID (Fixes the 404 on Profile Page)
router.get('/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') {
            return res.status(403).json({ message: 'Access denied' });
        }
        
        const user = await User.findById(req.params.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        
        res.json(user);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Employee not found' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/employees/add
// @desc    HR/Admin adds a new employee
router.post('/add', auth, async (req, res) => {
    try {
        const {
            name, email, password, role,
            joiningDate, aadhaar, emergencyContact
        } = req.body;

        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'User already exists' });

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
// @desc    Update employee details
router.put('/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Denied' });

        const { 
            name, email, role, status, joiningDate, password, 
            aadhaar, emergencyContact, phoneNumber, address, // <--- Added these
            salary, casualLeaveBalance, earnedLeaveBalance 
        } = req.body;

        // Build update object
        let updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (status) updateData.status = status;
        if (joiningDate) updateData.joiningDate = joiningDate;
        
        // Contact Info
        if (aadhaar !== undefined) updateData.aadhaar = aadhaar;
        if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact;
        if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
        if (address !== undefined) updateData.address = address;

        // HR Fields
        if (salary !== undefined) updateData.salary = salary;
        if (casualLeaveBalance !== undefined) updateData.casualLeaveBalance = casualLeaveBalance;
        if (earnedLeaveBalance !== undefined) updateData.earnedLeaveBalance = earnedLeaveBalance;

        // Password Reset
        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        const updatedEmployee = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true }
        ).select('-password');

        if (!updatedEmployee) return res.status(404).json({ message: 'User not found' });

        res.json(updatedEmployee);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;