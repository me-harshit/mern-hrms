const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const bcrypt = require('bcryptjs');

// @route   GET /api/employees (or /api/users depending on your setup)
// @desc    Get all employees (Paginated & Filtered)
router.get('/', auth, async (req, res) => {
    try {
        // --- 1. PAGINATION SETUP ---
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let query = {};
        let andConditions = [];

        // --- 2. MANAGER SCOPE ---
        // If a Manager is viewing the directory, they only see their team.
        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            if (manager) {
                andConditions.push({ reportingManagerEmail: manager.email.toLowerCase() });
            }
        }

        // --- 3. COMPREHENSIVE SEARCH FILTERING ---
        if (req.query.search) {
            // 'i' makes the search case-insensitive
            const searchRegex = new RegExp(req.query.search, 'i');

            andConditions.push({
                $or: [
                    { name: searchRegex },
                    { email: searchRegex },
                    { employeeId: searchRegex },
                    { role: searchRegex },
                    { status: searchRegex },
                    { shiftType: searchRegex }
                ]
            });
        }

        // --- 4. EXECUTE QUERY ---
        // If we have conditions (Manager rule OR Search rule), apply them via $and
        if (andConditions.length > 0) {
            query.$and = andConditions;
        }

        const totalRecords = await User.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        const employees = await User.find(query)
            .sort({ employeeId: 1 }) // Sorted by ID alphabetically
            .skip(skip)
            .limit(limit);

        res.json({
            data: employees,
            pagination: { totalRecords, totalPages, currentPage: page, limit }
        });

    } catch (err) {
        console.error("Employee Fetch Error:", err);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/employees/directory
// @desc    Get a safe, basic list of all employees for dropdowns
router.get('/directory', auth, async (req, res) => {
    try {
        // We use .select() to ensure sensitive data (passwords, salaries) is NEVER sent
        const employees = await User.find({}).select('name role employeeId').sort({ name: 1 });
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