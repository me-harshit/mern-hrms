const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const auth = require('../middleware/authMiddleware');
const Wfh = require('../models/Wfh');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

// @route   GET /api/wfh/my-requests
// @desc    Get WFH history for logged-in user
router.get('/my-requests', auth, async (req, res) => {
    try {
        const history = await Wfh.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json({ history });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/wfh/apply
// @desc    Submit a new WFH Request & Email Manager
router.post('/apply', auth, async (req, res) => {
    try {
        const { fromDate, toDate, reason } = req.body;
        const userId = req.user.id;

        const start = new Date(fromDate);
        const end = new Date(toDate);
        const diffTime = Math.abs(end - start);
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        const user = await User.findById(userId);

        const newWfh = new Wfh({
            userId, fromDate, toDate, days, reason, status: 'Pending'
        });

        await newWfh.save();

        // --- EMAIL LOGIC: Generate Secure Magic Links ---
        if (user.reportingManagerEmail) {
            const backendUrl = `${req.protocol}://${req.get('host')}`;

            const approveToken = jwt.sign({ wfhId: newWfh._id, status: 'Approved' }, process.env.JWT_SECRET, { expiresIn: '7d' });
            const rejectToken = jwt.sign({ wfhId: newWfh._id, status: 'Rejected' }, process.env.JWT_SECRET, { expiresIn: '7d' });

            const approveLink = `${backendUrl}/api/wfh/email-action?token=${approveToken}`;
            const rejectLink = `${backendUrl}/api/wfh/email-action?token=${rejectToken}`;

            const subject = `New WFH Request: ${user.name}`;
            const message = `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                    <div style="background-color: #215D7B; padding: 25px; text-align: center;">
                        <h2 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px;">Work From Home Request</h2>
                    </div>
                    <div style="padding: 30px; text-align: center;">
                        <p style="font-size: 16px; color: #475569; margin-top: 0;"><strong>${user.name}</strong> has requested to Work From Home.</p>
                        
                        <table style="width: 100%; max-width: 450px; border-collapse: separate; border-spacing: 0; margin: 25px auto; border: 1px solid #e2e8f0; border-radius: 8px; text-align: left; overflow: hidden;">
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

        res.json(newWfh);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/wfh/email-action
// @desc    Handle Magic Link Clicks (No Auth Required)
router.get('/email-action', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.send('<h1>Invalid Link</h1><p>No token provided.</p>');

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { wfhId, status } = decoded;

        const wfhRequest = await Wfh.findById(wfhId);
        if (!wfhRequest) return res.send('<div style="text-align:center; padding: 50px; font-family: sans-serif;"><h2>Request Not Found</h2></div>');

        if (wfhRequest.status !== 'Pending') {
            return res.send(`
                <div style="text-align:center; padding: 50px; font-family: sans-serif; color: #334155;">
                    <h2 style="color: #A6477F;">Action Already Taken</h2>
                    <p>This WFH request has already been marked as <strong>${wfhRequest.status}</strong>.</p>
                    <p style="color: #94a3b8; font-size: 14px;">You may safely close this window.</p>
                </div>
            `);
        }

        const user = await User.findById(wfhRequest.userId);

        // Update WFH Status
        wfhRequest.status = status;
        wfhRequest.adminComment = `Processed via Email Quick-Action by Manager/HR.`;
        await wfhRequest.save();

        // Notify Employee
        const statusColor = status === 'Approved' ? '#16a34a' : '#A6477F';
        const subject = `WFH Request ${status} - GTS HRMS`;
        const message = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div style="background-color: ${statusColor}; padding: 25px; text-align: center;">
                    <h2 style="color: #ffffff; margin: 0; font-size: 22px;">WFH Request ${status}</h2>
                </div>
                <div style="padding: 30px; text-align: center;">
                    <p style="font-size: 16px; color: #475569;">Dear <strong>${user.name}</strong>,</p>
                    <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 15px auto;">
                        Your Work From Home request for <strong style="color: ${statusColor};">${wfhRequest.days} day(s)</strong> has been <strong>${status.toLowerCase()}</strong>.
                    </p>
                </div>
            </div>
        `;

        await sendEmail({ email: user.email, cc: process.env.HR_EMAIL || 'hr@gts.ai', subject, message });

        res.send(`
            <div style="text-align:center; padding: 60px; font-family: 'Segoe UI', sans-serif; color: #0f172a;">
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 400px; margin: 0 auto; padding: 40px;">
                    <h1 style="color: ${statusColor}; margin-top: 0;">${status}!</h1>
                    <p style="font-size: 16px;">The WFH request for <strong>${user.name}</strong> has been successfully updated.</p>
                    <p style="color: #64748b; font-size: 14px; margin-top: 20px;">The employee has been notified. You can close this window.</p>
                </div>
            </div>
        `);

    } catch (err) {
        console.error(err);
        res.send('<div style="text-align:center; padding:50px; font-family:sans-serif;"><h2>Link Expired or Invalid</h2><p>Please log in to the HRMS to process this request.</p></div>');
    }
});

// @route   PUT /api/wfh/action/:id 
// @desc    Handle action from HRMS Portal
router.put('/action/:id', auth, async (req, res) => {
    try {
        const { status, adminRemark } = req.body;
        const wfhRequest = await Wfh.findById(req.params.id);

        if (!wfhRequest) return res.status(404).json({ message: 'Request not found' });
        if (wfhRequest.status !== 'Pending') return res.status(400).json({ message: 'Request already processed' });

        const user = await User.findById(wfhRequest.userId);

        wfhRequest.status = status;
        if (adminRemark) wfhRequest.adminComment = adminRemark;
        await wfhRequest.save();

        const statusColor = status === 'Approved' ? '#16a34a' : '#A6477F';
        const subject = `WFH Request ${status} - GTS HRMS`;
        const remarkHtml = adminRemark ? `<div style="background-color: #fef2f2; border-left: 4px solid ${statusColor}; padding: 15px; margin: 20px auto; max-width: 450px; text-align: left; border-radius: 4px;"><p style="margin: 0; font-size: 12px; color: #64748b; font-weight: 600;">Manager Note</p><p style="margin: 5px 0 0 0; font-size: 14px; font-style: italic;">"${adminRemark}"</p></div>` : '';

        const message = `
            <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div style="background-color: ${statusColor}; padding: 25px; text-align: center;">
                    <h2 style="color: #ffffff; margin: 0;">WFH Request ${status}</h2>
                </div>
                <div style="padding: 30px; text-align: center;">
                    <p style="font-size: 16px;">Dear <strong>${user.name}</strong>,</p>
                    <p>Your Work From Home request for <strong>${wfhRequest.days} day(s)</strong> has been <strong>${status.toLowerCase()}</strong>.</p>
                    ${remarkHtml}
                </div>
            </div>
        `;

        await sendEmail({ email: user.email, cc: process.env.HR_EMAIL || 'hr@gts.ai', subject, message });

        res.json(wfhRequest);

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/wfh/all-requests 
// @desc    Get all WFH requests for HR/Manager Dashboard
router.get('/all-requests', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });
        
        const requests = await Wfh.find().populate('userId', 'name email').sort({ createdAt: -1 });
        res.json(requests);
    } catch (err) { 
        res.status(500).send('Server Error'); 
    }
});

module.exports = router;