const express = require('express');
const router = express.Router();
const { stampBalanceAnchor } = require('../utils/leaveAccrual');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const bcrypt = require('bcryptjs');
const { canAccessSalary, canEditPrivilegedFields, sanitizeSalary } = require('../utils/permissions');

// @route   GET /api/employees/managers
// @desc    Get all users who can be assigned as reporting managers
router.get('/managers', auth, async (req, res) => {
    try {
        const managers = await User.find({ role: { $in: ['MANAGER', 'TEAM LEAD', 'ADMIN', 'HR'] } })
            .select('name email role')
            .sort({ name: 1 });
        res.json(managers);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/employees/teamleads
// @desc    Get all users who can be assigned as team leads
router.get('/teamleads', auth, async (req, res) => {
    try {
        const leads = await User.find({ role: { $in: ['TEAM LEAD', 'MANAGER', 'ADMIN', 'HR'] } })
            .select('name email role')
            .sort({ name: 1 });
        res.json(leads);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

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
        } else if (req.user.role === 'TEAM LEAD') {
            const lead = await User.findById(req.user.id);
            if (lead) {
                andConditions.push({ teamLeadsEmail: lead.email.toLowerCase() });
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
            .select('-password')
            .sort({ employeeId: 1 }) // Sorted by ID alphabetically
            .skip(skip)
            .limit(limit);

        res.json({
            data: sanitizeSalary(employees, req.user),
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
        const employees = await User.find({}).select('name role employeeId profilePic').sort({ name: 1 });
        res.json(employees);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/employees/payment-sources
// @desc    Get full list of all employees as payment sources for expense forms
router.get('/payment-sources', auth, async (req, res) => {
    try {
        const allEmployees = await User.find({}).select('name role employeeId').sort({ name: 1 });
        res.json(allEmployees);
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
        res.json(sanitizeSalary(user, req.user));
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ message: 'Employee not found' });
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/employees/add
router.post('/add', auth, async (req, res) => {
    try {
        // This route had no role gate at all — any logged-in user could create
        // an account, including one with role ADMIN.
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access denied' });

        const {
            name, email, workEmail, password, role, shiftType,
            joiningDate, dateOfBirth, bloodGroup, aadhaar, phoneNumber,
            emergencyContact, emergencyContactName, emergencyContactRelation,
            address, permanentAddress, currentAddress,
            jobTitle, department, workLocation, employmentType,
            reportingManagerName, reportingManagerEmail,
            teamLeadsName, teamLeadsEmail,
            employeeId, isPurchaser, salary
        } = req.body;

        const sanitizedEmail = email ? email.trim().toLowerCase() : '';
        const sanitizedWorkEmail = workEmail ? workEmail.trim().toLowerCase() : '';

        let user = await User.findOne({ email: sanitizedEmail });
        if (user) return res.status(400).json({ message: 'User already exists' });

        // MANAGER/TEAM LEAD may onboard people, but only ADMIN/HR decide what
        // role a new account gets — otherwise they could mint an ADMIN.
        const mayEditPrivileged = canEditPrivilegedFields(req.user);
        if (role && role !== 'EMPLOYEE' && !mayEditPrivileged) {
            return res.status(403).json({ message: 'Only ADMIN or HR can assign a role other than EMPLOYEE' });
        }

        user = new User({
            name,
            email: sanitizedEmail,
            workEmail: sanitizedWorkEmail,
            password,
            role: mayEditPrivileged ? role : 'EMPLOYEE',
            shiftType: shiftType || 'DAY',
            joiningDate,
            dateOfBirth,
            bloodGroup,
            aadhaar,
            phoneNumber,
            emergencyContact,
            emergencyContactName,
            emergencyContactRelation,
            address: address || currentAddress,
            permanentAddress,
            currentAddress,
            jobTitle,
            department,
            workLocation,
            employmentType,
            reportingManagerName,
            reportingManagerEmail,
            teamLeadsName,
            teamLeadsEmail,
            employeeId,
            isPurchaser: (mayEditPrivileged && isPurchaser) || false,
            // Only ADMIN/HR may set a starting salary; others default to 0.
            salary: (canAccessSalary(req.user) && salary) ? Number(salary) : 0
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
            name, email, workEmail, role, shiftType, status, joiningDate, dateOfBirth, bloodGroup, password,
            aadhaar, emergencyContact, emergencyContactName, emergencyContactRelation, phoneNumber,
            whatsappNumber, whatsappNotificationsEnabled,
            address, permanentAddress, currentAddress,
            jobTitle, department, workLocation, employmentType,
            salary, casualLeaveBalance, earnedLeaveBalance,
            reportingManagerName, reportingManagerEmail,
            teamLeadsName, teamLeadsEmail,
            employeeId, isPurchaser
        } = req.body;

        // role / password / status / isPurchaser grant privilege or control
        // account access. Without this gate a TEAM LEAD or MANAGER could PUT
        // themselves to ADMIN, reset anyone's password, or disable an account.
        // These are dropped rather than rejected: the edit form always submits
        // every field, so a 403 would block otherwise-legitimate saves. The UI
        // already disables these controls for the roles that can't use them.
        const mayEditPrivileged = canEditPrivilegedFields(req.user);

        let updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (workEmail !== undefined) updateData.workEmail = workEmail;
        if (role && mayEditPrivileged) updateData.role = role;
        if (shiftType) updateData.shiftType = shiftType;
        if (status && mayEditPrivileged) updateData.status = status;
        if (joiningDate) updateData.joiningDate = joiningDate;
        if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
        if (bloodGroup !== undefined) updateData.bloodGroup = bloodGroup;

        if (aadhaar !== undefined) updateData.aadhaar = aadhaar;
        if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact;
        if (emergencyContactName !== undefined) updateData.emergencyContactName = emergencyContactName;
        if (emergencyContactRelation !== undefined) updateData.emergencyContactRelation = emergencyContactRelation;
        if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;

        // Kept separate from phoneNumber on purpose — see models/User.js. Left
        // blank, WhatsApp notifications fall back to phoneNumber.
        if (whatsappNumber !== undefined) updateData.whatsappNumber = whatsappNumber;
        if (whatsappNotificationsEnabled !== undefined) {
            updateData.whatsappNotificationsEnabled = Boolean(whatsappNotificationsEnabled);
        }
        if (address !== undefined) updateData.address = address;
        if (permanentAddress !== undefined) updateData.permanentAddress = permanentAddress;
        if (currentAddress !== undefined) updateData.currentAddress = currentAddress;

        if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
        if (department !== undefined) updateData.department = department;
        if (workLocation !== undefined) updateData.workLocation = workLocation;
        if (employmentType !== undefined) updateData.employmentType = employmentType;

        // Only ADMIN/HR may set salary — silently ignore it for anyone else so a
        // MANAGER/TEAM LEAD editing a teammate can't change their pay.
        if (salary !== undefined && canAccessSalary(req.user)) updateData.salary = salary;
        if (casualLeaveBalance !== undefined) updateData.casualLeaveBalance = casualLeaveBalance;
        if (earnedLeaveBalance !== undefined) updateData.earnedLeaveBalance = earnedLeaveBalance;
        // Setting a balance by hand has to re-anchor the accrual clock. Without
        // this, the next time the employee opened their leave page the accrual
        // back-filled every month since the *old* anchor straight over the top
        // of the correction that was just made.
        if (casualLeaveBalance !== undefined || earnedLeaveBalance !== undefined) {
            stampBalanceAnchor(updateData);
        }

        if (reportingManagerName !== undefined) updateData.reportingManagerName = reportingManagerName;
        if (reportingManagerEmail !== undefined) updateData.reportingManagerEmail = reportingManagerEmail;
        if (teamLeadsName !== undefined) updateData.teamLeadsName = teamLeadsName;
        if (teamLeadsEmail !== undefined) updateData.teamLeadsEmail = teamLeadsEmail;

        if (employeeId !== undefined) updateData.employeeId = employeeId;
        if (isPurchaser !== undefined && mayEditPrivileged) updateData.isPurchaser = isPurchaser;

        // 👇 FIXED: Safely hash and append to updateData
        if (password && password.trim() !== "" && mayEditPrivileged) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        const updatedEmployee = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true }
        ).select('-password');

        if (!updatedEmployee) return res.status(404).json({ message: 'User not found' });

        res.json(sanitizeSalary(updatedEmployee, req.user));
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;