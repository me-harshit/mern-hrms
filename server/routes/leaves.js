const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken'); // 👇 NEW: Required for secure email links
const auth = require('../middleware/authMiddleware');
const Leave = require('../models/Leave');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

// @route   GET /api/leaves/my-leaves
// @desc    Get history AND fetch stored balances (with Auto-Reset logic)
router.get('/my-leaves', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        let user = await User.findById(userId).select('casualLeaveBalance earnedLeaveBalance leavesLastReset');

        // --- 1. AUTO-ACCRUAL & YEARLY RESET LOGIC ---
        const now = new Date();
        const lastReset = new Date(user.leavesLastReset || Date.now());
        let isUpdated = false;

        if (now.getFullYear() > lastReset.getFullYear()) {
            user.casualLeaveBalance = now.getMonth() + 1;
            user.leavesLastReset = now;
            isUpdated = true;
        } else {
            const monthsPassed = now.getMonth() - lastReset.getMonth();
            if (monthsPassed > 0) {
                user.casualLeaveBalance += monthsPassed;
                user.leavesLastReset = now;
                isUpdated = true;
            }
        }

        if (isUpdated) await user.save();

        // --- 2. Calculate Available Balance ---
        const pendingLeaves = await Leave.find({ userId, status: 'Pending' });

        const pendingCL = pendingLeaves.filter(l => l.leaveType === 'CL').reduce((acc, curr) => acc + curr.days, 0);
        const pendingEL = pendingLeaves.filter(l => l.leaveType === 'EL').reduce((acc, curr) => acc + curr.days, 0);

        const clAvailable = Math.max(0, user.casualLeaveBalance - pendingCL);
        const elAvailable = Math.max(0, user.earnedLeaveBalance - pendingEL);

        // --- 3. Fetch History ---
        const leaves = await Leave.find({ userId }).sort({ createdAt: -1 });

        res.json({
            history: leaves,
            balances: { CL: clAvailable, EL: elAvailable }
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/leaves/apply
router.post('/apply', auth, async (req, res) => {
    try {
        const { leaveType, fromDate, toDate, reason } = req.body;
        const userId = req.user.id;

        const start = new Date(fromDate);
        const end = new Date(toDate);
        const diffTime = Math.abs(end - start);
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        const user = await User.findById(userId);

        // --- VALIDATION: Check Stored Balance ---
        if (leaveType === 'CL' || leaveType === 'EL') {
            const pending = await Leave.find({ userId, leaveType, status: 'Pending' });
            const pendingDays = pending.reduce((acc, curr) => acc + curr.days, 0);

            let dbBalance = (leaveType === 'CL') ? user.casualLeaveBalance : user.earnedLeaveBalance;
            let actualAvailable = dbBalance - pendingDays;

            if (days > actualAvailable) {
                return res.status(400).json({
                    message: `Insufficient ${leaveType} balance. You have ${actualAvailable} days available.`
                });
            }
        }

        const newLeave = new Leave({
            userId, leaveType, fromDate, toDate, days, reason, status: 'Pending'
        });

        await newLeave.save();

        // --- EMAIL LOGIC: Generate Secure Magic Links ---
        if (user.reportingManagerEmail) {
            // Determine backend URL dynamically for the links
            const backendUrl = `${req.protocol}://${req.get('host')}`;

            // Create Secure Tokens (Expires in 7 days)
            const approveToken = jwt.sign({ leaveId: newLeave._id, status: 'Approved' }, process.env.JWT_SECRET, { expiresIn: '7d' });
            const rejectToken = jwt.sign({ leaveId: newLeave._id, status: 'Rejected' }, process.env.JWT_SECRET, { expiresIn: '7d' });

            const approveLink = `${backendUrl}/api/leaves/email-action?token=${approveToken}`;
            const rejectLink = `${backendUrl}/api/leaves/email-action?token=${rejectToken}`;

            const subject = `New Leave Request: ${user.name}`;
            const message = `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                    
                    <div style="background-color: #215D7B; padding: 25px; text-align: center;">
                        <h2 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px;">New Leave Request</h2>
                    </div>
                    
                    <div style="padding: 30px; text-align: center;">
                        <p style="font-size: 16px; color: #475569; margin-top: 0;"><strong>${user.name}</strong> has requested time off.</p>
                        
                        <table style="width: 100%; max-width: 450px; border-collapse: separate; border-spacing: 0; margin: 25px auto; border: 1px solid #e2e8f0; border-radius: 8px; text-align: left; overflow: hidden;">
                            <tr>
                                <td style="padding: 12px 15px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; width: 35%; color: #64748b; font-weight: 600; font-size: 14px;">Leave Type</td>
                                <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; font-size: 14px;">${leaveType}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 15px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600; font-size: 14px;">Duration</td>
                                <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 14px;">${start.toLocaleDateString('en-GB')} <span style="color: #94a3b8;">&rarr;</span> ${end.toLocaleDateString('en-GB')}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 15px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600; font-size: 14px;">Total Days</td>
                                <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #A6477F; font-weight: 700; font-size: 15px;">${days} Day(s)</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 15px; background-color: #f8fafc; color: #64748b; font-weight: 600; font-size: 14px; vertical-align: top;">Reason</td>
                                <td style="padding: 12px 15px; color: #475569; font-size: 14px; line-height: 1.5;">${reason}</td>
                            </tr>
                        </table>

                        <p style="font-size: 14px; color: #64748b; margin-bottom: 20px;">You can process this request instantly using the buttons below:</p>
                        
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 10px; margin-bottom: 20px;">
                            <tr>
                                <td align="center">
                                    <table border="0" cellspacing="0" cellpadding="0">
                                        <tr>
                                            <td align="center" style="border-radius: 6px;" bgcolor="#16a34a">
                                                <a href="${approveLink}" target="_blank" style="font-size: 15px; font-family: Arial, sans-serif; font-weight: 600; color: #ffffff; text-decoration: none; padding: 12px 25px; border-radius: 6px; display: inline-block;">Approve</a>
                                            </td>
                                            
                                            <td width="15"></td> 
                                            
                                            <td align="center" style="border-radius: 6px;" bgcolor="#A6477F">
                                                <a href="${rejectLink}" target="_blank" style="font-size: 15px; font-family: Arial, sans-serif; font-weight: 600; color: #ffffff; text-decoration: none; padding: 12px 25px; border-radius: 6px; display: inline-block;">Reject</a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                        
                    </div>
                </div>
            `;

            await sendEmail({
                email: user.reportingManagerEmail,
                cc: process.env.HR_EMAIL || 'hr@gts.ai',
                subject,
                message
            });
        }

        res.json(newLeave);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// 👇 NEW: GET Route for Email Magic Links (No Auth Middleware Required)
router.get('/email-action', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.send('<h1>Invalid Link</h1><p>No token provided.</p>');

        // Verify the secure token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { leaveId, status } = decoded;

        const leave = await Leave.findById(leaveId);
        if (!leave) return res.send('<div style="text-align:center; padding: 50px; font-family: sans-serif;"><h2>Request Not Found</h2></div>');

        // Check if already processed (This prevents double-clicking the email button)
        if (leave.status !== 'Pending') {
            return res.send(`
                <div style="text-align:center; padding: 50px; font-family: sans-serif; color: #334155;">
                    <h2 style="color: #A6477F;">Action Already Taken</h2>
                    <p>This leave request has already been marked as <strong>${leave.status}</strong>.</p>
                    <p style="color: #94a3b8; font-size: 14px;">You may safely close this window.</p>
                </div>
            `);
        }

        const user = await User.findById(leave.userId);

        // --- DEDUCTION LOGIC ---
        if (status === 'Approved') {
            if (leave.leaveType === 'CL') {
                if (user.casualLeaveBalance < leave.days) return res.send('<h2 style="text-align:center; padding:50px;">Employee has insufficient Casual Leave balance.</h2>');
                user.casualLeaveBalance -= leave.days;
            }
            else if (leave.leaveType === 'EL') {
                if (user.earnedLeaveBalance < leave.days) return res.send('<h2 style="text-align:center; padding:50px;">Employee has insufficient Earned Leave balance.</h2>');
                user.earnedLeaveBalance -= leave.days;
            }
            await user.save();
        }

        // Update Leave Status
        leave.status = status;
        leave.adminComment = `Processed via Email Quick-Action by Manager/HR.`;
        await leave.save();

        // --- SEND CONFIRMATION EMAIL TO EMPLOYEE ---
        const statusColor = status === 'Approved' ? '#16a34a' : '#A6477F';
        const subject = `Leave Request ${status} - GTS HRMS`;
        const message = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div style="background-color: ${statusColor}; padding: 25px; text-align: center;">
                    <h2 style="color: #ffffff; margin: 0; font-size: 22px;">Leave Request ${status}</h2>
                </div>
                <div style="padding: 30px; text-align: center;">
                    <p style="font-size: 16px; color: #475569;">Dear <strong>${user.name}</strong>,</p>
                    <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 15px auto;">
                        Your <strong>${leave.leaveType}</strong> request for <strong style="color: ${statusColor};">${leave.days} day(s)</strong> has been <strong>${status.toLowerCase()}</strong>.
                    </p>
                </div>
            </div>
        `;

        await sendEmail({ email: user.email, cc: process.env.HR_EMAIL || 'hr@gts.ai', subject, message });

        // --- RENDER SUCCESS PAGE TO MANAGER ---
        res.send(`
            <div style="text-align:center; padding: 60px; font-family: 'Segoe UI', sans-serif; color: #0f172a;">
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 400px; margin: 0 auto; padding: 40px;">
                    <h1 style="color: ${statusColor}; margin-top: 0;">${status}!</h1>
                    <p style="font-size: 16px;">The leave request for <strong>${user.name}</strong> has been successfully updated in the system.</p>
                    <p style="color: #64748b; font-size: 14px; margin-top: 20px;">The employee has been notified. You can close this window.</p>
                </div>
            </div>
        `);

    } catch (err) {
        console.error(err);
        res.send('<div style="text-align:center; padding:50px; font-family:sans-serif;"><h2>Link Expired or Invalid</h2><p>Please log in to the HRMS to process this request.</p></div>');
    }
});


// @route   PUT /api/leaves/action/:id (HRMS Portal Action)
router.put('/action/:id', auth, async (req, res) => {
    try {
        const { status, adminRemark } = req.body;
        const leave = await Leave.findById(req.params.id);

        if (!leave) return res.status(404).json({ message: 'Leave not found' });
        if (leave.status !== 'Pending') return res.status(400).json({ message: 'Request already processed' });

        const user = await User.findById(leave.userId);

        if (status === 'Approved') {
            if (leave.leaveType === 'CL') {
                if (user.casualLeaveBalance < leave.days) return res.status(400).json({ message: 'Insufficient Balance' });
                user.casualLeaveBalance -= leave.days;
            }
            else if (leave.leaveType === 'EL') {
                if (user.earnedLeaveBalance < leave.days) return res.status(400).json({ message: 'Insufficient Balance' });
                user.earnedLeaveBalance -= leave.days;
            }
            await user.save();
        }

        leave.status = status;
        if (adminRemark) leave.adminComment = adminRemark;
        await leave.save();

        const statusColor = status === 'Approved' ? '#16a34a' : '#A6477F';
        const subject = `Leave Request ${status} - GTS HRMS`;
        const remarkHtml = adminRemark ? `<div style="background-color: #fef2f2; border-left: 4px solid ${statusColor}; padding: 15px; margin: 20px auto; max-width: 450px; text-align: left; border-radius: 4px;"><p style="margin: 0; font-size: 12px; color: #64748b; font-weight: 600;">Manager Note</p><p style="margin: 5px 0 0 0; font-size: 14px; font-style: italic;">"${adminRemark}"</p></div>` : '';

        const message = `
            <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div style="background-color: ${statusColor}; padding: 25px; text-align: center;">
                    <h2 style="color: #ffffff; margin: 0;">Leave Request ${status}</h2>
                </div>
                <div style="padding: 30px; text-align: center;">
                    <p style="font-size: 16px;">Dear <strong>${user.name}</strong>,</p>
                    <p>Your <strong>${leave.leaveType}</strong> request for <strong>${leave.days} day(s)</strong> has been <strong>${status.toLowerCase()}</strong>.</p>
                    ${remarkHtml}
                </div>
            </div>
        `;

        await sendEmail({ email: user.email, cc: process.env.HR_EMAIL || 'hr@gts.ai', subject, message });

        res.json(leave);

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/leaves/all-requests (Admin/HR/Manager)
router.get('/all-requests', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        // --- 1. PAGINATION SETUP ---
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let andConditions = [];

        // --- 2. STATUS FILTER ---
        if (req.query.status) {
            andConditions.push({ status: req.query.status });
        }

        // --- 3. MANAGER SCOPE ---
        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            const teamIds = await User.find({ reportingManagerEmail: manager.email.toLowerCase() }).distinct('_id');
            andConditions.push({ userId: { $in: teamIds } });
        }

        // --- 4. SEARCH FILTER ---
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            const matchingUsers = await User.find({ name: searchRegex }).distinct('_id');
            
            andConditions.push({
                $or: [
                    { userId: { $in: matchingUsers } },
                    { reason: searchRegex },
                    { leaveType: searchRegex }
                ]
            });
        }

        let query = {};
        if (andConditions.length > 0) {
            query.$and = andConditions;
        }

        // --- 5. EXECUTE QUERY ---
        const totalRecords = await Leave.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        const requests = await Leave.find(query)
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            data: requests,
            pagination: { totalRecords, totalPages, currentPage: page, limit }
        });

    } catch (err) { 
        console.error("Leaves Pagination Error:", err);
        res.status(500).send('Server Error'); 
    }
});

// @route   POST /api/leaves/admin/update-balance (HR Only)
router.post('/admin/update-balance', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });
        const { userId, cl, el, salary } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (cl !== undefined) user.casualLeaveBalance = Number(cl);
        if (el !== undefined) user.earnedLeaveBalance = Number(el);
        if (salary !== undefined) user.salary = Number(salary);

        await user.save();
        res.json({ message: 'User profile updated successfully', user });
    } catch (err) { res.status(500).send('Server Error'); }
});

router.get('/admin/user-leaves/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });
        const leaves = await Leave.find({ userId: req.params.id }).sort({ createdAt: -1 });
        res.json({ history: leaves });
    } catch (err) { res.status(500).send('Server Error'); }
});

module.exports = router;