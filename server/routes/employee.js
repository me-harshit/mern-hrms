const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const bcrypt = require('bcryptjs');

// @route   GET /api/employees
router.get('/', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access denied' });
        
        let query = {};
        
        // 🚀 MANAGER LOGIC: Only fetch their direct reports
        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            query = { reportingManagerEmail: manager.email.toLowerCase() };
        }

        const employees = await User.find(query).select('-password');
        res.json(employees);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/employees/payment-sources
// @desc    Get allowed payment sources for an employee (Themselves, Manager, HR)
router.get('/payment-sources', auth, async (req, res) => {
    try {
        const currentUser = await User.findById(req.user.id);
        
        let allowedUsers = [];

        // 1. Add their specific manager
        if (currentUser.reportingManagerEmail) {
            const manager = await User.findOne({ email: currentUser.reportingManagerEmail.toLowerCase() }).select('name role');
            if (manager) allowedUsers.push(manager);
        }

        // 2. Add all HRs and Admins
        const hrAdmins = await User.find({ role: { $in: ['HR'] } }).select('name role');
        
        // Combine and filter out duplicates (in case Manager is also an Admin)
        const combined = [...allowedUsers, ...hrAdmins];
        const uniqueUsers = Array.from(new Set(combined.map(u => u._id.toString())))
            .map(id => combined.find(u => u._id.toString() === id));

        res.json(uniqueUsers);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/employees/project-leads
// @desc    Get all eligible project leads (Managers)
router.get('/project-leads', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') {
            return res.status(403).json({ message: 'Access denied' });
        }
        
        const leads = await User.find({ role: { $in: ['MANAGER'] } }).select('name role');
        
        res.json(leads);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/employees/:id
router.get('/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access denied' });
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ message: 'Employee not found' });
        res.json(user);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Employee not found' });
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/employees/add
router.post('/add', auth, async (req, res) => {
    try {
        const {
            name, email, password, role, shiftType,  
            joiningDate, dateOfBirth, aadhaar, emergencyContact, 
            reportingManagerName, reportingManagerEmail,
            employeeId, isPurchaser
        } = req.body;

        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'User already exists' });

        user = new User({
            name,
            email,
            password,
            role,
            shiftType: shiftType || 'DAY', 
            joiningDate,
            dateOfBirth,
            aadhaar,
            emergencyContact,
            reportingManagerName, 
            reportingManagerEmail,
            employeeId,
            isPurchaser: isPurchaser || false
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

        const { 
            name, email, role, shiftType, status, joiningDate, dateOfBirth, password,
            aadhaar, emergencyContact, phoneNumber, address,
            salary, casualLeaveBalance, earnedLeaveBalance,
            reportingManagerName, reportingManagerEmail,
            employeeId, isPurchaser
        } = req.body;

        let updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (shiftType) updateData.shiftType = shiftType; 
        if (status) updateData.status = status;
        if (joiningDate) updateData.joiningDate = joiningDate;
        if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth; 
        
        if (aadhaar !== undefined) updateData.aadhaar = aadhaar;
        if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact;
        if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
        if (address !== undefined) updateData.address = address;

        if (salary !== undefined) updateData.salary = salary;
        if (casualLeaveBalance !== undefined) updateData.casualLeaveBalance = casualLeaveBalance;
        if (earnedLeaveBalance !== undefined) updateData.earnedLeaveBalance = earnedLeaveBalance;

        if (reportingManagerName !== undefined) updateData.reportingManagerName = reportingManagerName;
        if (reportingManagerEmail !== undefined) updateData.reportingManagerEmail = reportingManagerEmail;
        
        if (employeeId !== undefined) updateData.employeeId = employeeId;
        if (isPurchaser !== undefined) updateData.isPurchaser = isPurchaser;

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