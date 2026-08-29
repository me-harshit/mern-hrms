const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer();
const auth = require('../middleware/authMiddleware');
const Attendance = require('../models/Attendance');
const AttendanceLog = require('../models/AttendanceLog');
const Settings = require('../models/Settings');
const User = require('../models/User');
const ExcelJS = require('exceljs');

// --- Try to load Leave model ---
let Leave = null;
try {
    Leave = require('../models/Leave');
} catch (e) {
    console.log("Note: Leave model not found in attendance route, 'On Leave' status fallback disabled.");
}

let Wfh = null;
try {
    Wfh = require('../models/Wfh');
} catch (e) {
    console.log("Note: Wfh model not found in attendance route, WFH absence reasons disabled.");
}

// --- HELPER: Format Lateness ---
const formatLateTime = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return `${h} hr ${m} min`;
    return `${m} min`;
};

// --- HELPER: Shift Date Calculator ---
const getShiftDate = (punchTime, shiftType) => {
    const d = new Date(punchTime);
    if (shiftType === 'NIGHT') {
        if (d.getHours() < 14) {
            d.setDate(d.getDate() - 1);
        }
    }
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

// ==========================================
// 🚀 1. BIOMETRIC UPLOAD ROUTE 
// ==========================================
router.post('/upload', upload.any(), async (req, res) => {
    try {
        const rawBody = req.body.event_log;
        if (!rawBody) return res.sendStatus(200);

        const data = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
        const event = data.AccessControllerEvent;

        if (event.subEventType !== 38) return res.status(200).send("Ignored: System Event");

        const biometricId = event.employeeNoString;
        const rawTimeStr = data.dateTime.substring(0, 19);
        const punchTime = new Date(rawTimeStr);
        const direction = event.deviceName === 'Hik_In' ? 'IN' : 'OUT';

        const user = await User.findOne({ employeeId: biometricId });
        if (!user) {
            console.log(`⚠️ Ignored: Punch for ${event.name} (${biometricId}) - Not mapped.`);
            return res.status(200).send("User not mapped");
        }

        const userId = user._id;
        const userShift = user.shiftType || 'DAY';
        const isNight = userShift === 'NIGHT';
        const shiftDate = getShiftDate(punchTime, userShift);

        await AttendanceLog.create({
            userId, employeeId: biometricId, timestamp: punchTime, direction, deviceId: event.deviceName, shiftDate
        });

        const shiftLogs = await AttendanceLog.find({ userId, shiftDate }).sort({ timestamp: 1 });

        let settings = await Settings.findOne() || {
            dayShiftStartTime: "09:30", dayShiftEndTime: "18:00",
            nightShiftStartTime: "19:30", nightShiftEndTime: "04:00",
            gracePeriod: 15, halfDayThreshold: 30
        };

        const shiftStartStr = isNight ? (settings.nightShiftStartTime || "19:30") : (settings.dayShiftStartTime || "09:30");
        const shiftEndStr = isNight ? (settings.nightShiftEndTime || "04:00") : (settings.dayShiftEndTime || "18:00");

        const [startHour, startMin] = shiftStartStr.split(':').map(Number);
        const [endHour, endMin] = shiftEndStr.split(':').map(Number);
        const [d, m, y] = shiftDate.split('/').map(Number);

        const shiftStartObj = new Date(y, m - 1, d, startHour, startMin, 0, 0);
        const shiftEndObj = new Date(y, m - 1, d, endHour, endMin, 0, 0);

        if (endHour < startHour) shiftEndObj.setDate(shiftEndObj.getDate() + 1);

        let breakMs = 0;
        let firstIn = null;
        let lastOut = null;
        let currentInTime = null;

        shiftLogs.forEach(log => {
            if (log.direction === 'IN') {
                if (!firstIn) firstIn = log.timestamp;
                if (!currentInTime) {
                    currentInTime = log.timestamp;
                    if (lastOut) {
                        const breakStart = Math.max(lastOut.getTime(), shiftStartObj.getTime());
                        const breakEnd = Math.min(log.timestamp.getTime(), shiftEndObj.getTime());
                        if (breakEnd > breakStart) breakMs += (breakEnd - breakStart);
                    }
                }
            } else if (log.direction === 'OUT') {
                lastOut = log.timestamp;
                if (currentInTime) {
                    lastOut = log.timestamp;
                    currentInTime = null;
                }
            }
        });

        let calculatedGrossHours = 0;
        if (firstIn && lastOut && lastOut > firstIn) {
            const grossMs = lastOut.getTime() - firstIn.getTime();
            calculatedGrossHours = Number((grossMs / 3600000).toFixed(2));
        }

        const calculatedBreakMinutes = Math.floor(breakMs / 60000);

        // --- Determine Status Based on Punch ---
        const firstInLog = shiftLogs.find(l => l.timestamp === firstIn && l.direction === 'IN');
        const isRemoteIn = firstInLog && firstInLog.deviceId === 'WEB_PORTAL';
        
        let determinedStatus = 'Pending';
        let determinedNote = isRemoteIn ? 'Remote Punch In' : 'Biometric Punch';

        if (firstIn) {
            const diffMinutes = Math.floor((firstIn - shiftStartObj) / 60000);
            if (diffMinutes > (settings.halfDayThreshold || 30)) {
                determinedStatus = 'Half Day';
                determinedNote = `Late by ${formatLateTime(diffMinutes)} ${isRemoteIn ? '(Remote Punch In)' : ''}`.trim();
            } else if (diffMinutes > (settings.gracePeriod || 15)) {
                determinedStatus = 'Late';
                determinedNote = `Late by ${formatLateTime(diffMinutes)} ${isRemoteIn ? '(Remote Punch In)' : ''}`.trim();
            } else {
                determinedStatus = 'Present';
            }

            // Hourly Overrides
            if (lastOut && calculatedGrossHours > 0) {
                if (calculatedGrossHours < 6) {
                    determinedStatus = 'Half Day';
                    determinedNote = (determinedNote === 'Biometric Punch' ? '' : determinedNote + ' | ') + 'Worked < 6 hrs';
                } else if (calculatedGrossHours >= 8.33) {
                    determinedStatus = 'Present';
                    determinedNote = 'Present (Worked >= 8h 20m)';
                }
            }
        }

        // --- Database Update ---
        let record = await Attendance.findOne({ userId, date: shiftDate });

        if (!record) {
            if (firstIn) {
                record = new Attendance({
                    userId, date: shiftDate, checkIn: firstIn, checkOut: lastOut,
                    status: determinedStatus, note: determinedNote,
                    totalHours: calculatedGrossHours, breakTimeTaken: calculatedBreakMinutes
                });
                await record.save();
            }
        } else {
            record.checkIn = firstIn || record.checkIn;
            record.checkOut = lastOut || record.checkOut;
            record.totalHours = calculatedGrossHours;
            record.breakTimeTaken = calculatedBreakMinutes;

            if (record.status === 'Pending' || record.status === 'Absent' || lastOut) {
                record.status = determinedStatus;
                record.note = record.status === 'Absent' ? determinedNote + ' (Recovered from Absent)' : determinedNote;
            }
            await record.save();
        }

        res.status(200).send({ status: "success" });
    } catch (error) {
        console.error("Processing Error:", error);
        res.sendStatus(200);
    }
});

// ==========================================
// 🚀 2. LIVE ABSENCE CALCULATOR
// ==========================================
// Anyone who has not checked in for their shift is absent — whether they are on
// approved leave, approved WFH without a remote punch, or simply never showed.
//
// This works off the employee roster, NOT off attendance rows. Rows are created
// by a cron that can miss people; starting from the roster means an employee
// with no row at all still gets counted instead of vanishing from the numbers.
//
// Query: ?shift=DAY (default) | NIGHT — the two are never mixed.
router.get('/absent', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const now = new Date();
        const shift = req.query.shift === 'NIGHT' ? 'NIGHT' : 'DAY';
        const isNight = shift === 'NIGHT';
        const shiftDateStr = getShiftDate(now, shift);

        // --- Has the shift actually started? -------------------------------
        // Nobody is "absent" before their shift begins; they are simply not due
        // in yet. This is what keeps night staff off the list during the day.
        const settings = await Settings.findOne() || {};
        const shiftStartStr = isNight
            ? (settings.nightShiftStartTime || '19:30')
            : (settings.dayShiftStartTime || '09:30');

        const [startHour, startMin] = shiftStartStr.split(':').map(Number);
        const [dd, mm, yyyy] = shiftDateStr.split('/').map(Number);
        const shiftStartAt = new Date(yyyy, mm - 1, dd, startHour, startMin, 0, 0);
        const shiftStarted = now >= shiftStartAt;

        // --- Who works this shift ------------------------------------------
        let userQuery = { role: { $ne: 'ADMIN' }, status: 'ACTIVE' };

        if (isNight) {
            userQuery.shiftType = 'NIGHT';
        } else {
            userQuery.shiftType = { $in: ['DAY', null] };
        }

        if (req.user.role === 'MANAGER' || req.user.role === 'TEAM LEAD') {
            const manager = await User.findById(req.user.id);
            userQuery.$or = [
                { reportingManagerEmail: manager.email.toLowerCase() },
                { teamLeadsEmail: manager.email.toLowerCase() }
            ];
        }

        const employees = await User.find(userQuery)
            // profilePic so the absent list can show faces, not just names.
            .select('_id name employeeId shiftType joiningDate profilePic')
            .sort({ name: 1 });

        if (!shiftStarted) {
            return res.json({
                shift, date: shiftDateStr, shiftStarted: false,
                shiftStartTime: shiftStartStr, totalOnShift: employees.length,
                count: 0, employees: []
            });
        }

        const employeeIds = employees.map(e => e._id);

        // --- Their attendance rows for this shift's date --------------------
        const records = await Attendance.find({
            userId: { $in: employeeIds },
            date: shiftDateStr
        }).select('userId status checkIn note');

        const recordByUser = new Map(records.map(r => [r.userId.toString(), r]));

        // --- Approved leave / WFH, read straight from their own collections --
        // The attendance row is not trustworthy for this: if the setup cron
        // never wrote a row, someone on approved leave would otherwise be
        // reported as a plain no-show.
        const shiftDateObj = new Date(yyyy, mm - 1, dd);
        const startOfDay = new Date(shiftDateObj); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(shiftDateObj); endOfDay.setHours(23, 59, 59, 999);
        const overlapsDate = {
            userId: { $in: employeeIds }, status: 'Approved',
            fromDate: { $lte: endOfDay }, toDate: { $gte: startOfDay }
        };

        const [leaves, wfhs] = await Promise.all([
            Leave ? Leave.find(overlapsDate).select('userId leaveType') : [],
            Wfh ? Wfh.find(overlapsDate).select('userId') : []
        ]);

        const leaveByUser = new Map(leaves.map(l => [l.userId.toString(), l.leaveType]));
        const wfhUsers = new Set(wfhs.map(w => w.userId.toString()));

        // --- Bucket: present means checked in and not away on leave ----------
        const absentees = [];

        for (const emp of employees) {
            // Not on the payroll yet on this date.
            if (emp.joiningDate && shiftDateObj < new Date(new Date(emp.joiningDate).setHours(0, 0, 0, 0))) continue;

            const uid = emp._id.toString();
            const record = recordByUser.get(uid);

            // A check-in is the whole test. Someone who punched in is present
            // even if they also hold a half-day leave — they turned up.
            if (record && record.checkIn) continue;

            let reason;
            if (leaveByUser.has(uid)) {
                reason = `On Leave (${leaveByUser.get(uid)})`;
            } else if (record?.status === 'On Leave') {
                reason = 'On Leave';
            } else if (wfhUsers.has(uid) || record?.status === 'WFH') {
                reason = 'WFH - Not Checked In';
            } else {
                reason = 'Not Punched In';
            }

            absentees.push({
                _id: emp._id,
                name: emp.name,
                employeeId: emp.employeeId,
                // The response is an explicit whitelist, so widening the
                // select() above is not enough on its own -- the field has to
                // be copied across here too or the list shows only initials.
                profilePic: emp.profilePic,
                shiftType: emp.shiftType || 'DAY',
                date: shiftDateStr,
                reason,
                note: record ? record.note : ''
            });
        }

        res.json({
            shift,
            date: shiftDateStr,
            shiftStarted: true,
            shiftStartTime: shiftStartStr,
            totalOnShift: employees.length,
            count: absentees.length,
            employees: absentees
        });
    } catch (err) {
        console.error("Live Absence Check Error:", err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 🚀 3. ABSENCE REPORT (Fast DB Query with Pagination)
// ==========================================
router.get('/absent-report', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // 👇 FIXED: Includes everyone except ADMIN
        let userQuery = { role: { $ne: 'ADMIN' }, status: 'ACTIVE' };

        if (req.query.shiftType === 'DAY') {
            userQuery.$or = [{ shiftType: 'DAY' }, { shiftType: null }, { shiftType: { $exists: false } }];
        } else if (req.query.shiftType === 'NIGHT') {
            userQuery.shiftType = 'NIGHT';
        }

        if (req.user.role === 'MANAGER' || req.user.role === 'TEAM LEAD') {
            const manager = await User.findById(req.user.id);
            userQuery.$or = [
                { reportingManagerEmail: manager.email.toLowerCase() },
                { teamLeadsEmail: manager.email.toLowerCase() }
            ];
        }

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            userQuery.$and = [
                { $or: [{ name: searchRegex }, { employeeId: searchRegex }] }
            ];
        }

        const matchingUsers = await User.find(userQuery).select('_id');
        const userIds = matchingUsers.map(u => u._id);

        let dateArray = [];
        if (req.query.startDate && req.query.endDate) {
            let start = new Date(req.query.startDate);
            let end = new Date(req.query.endDate);

            let curr = new Date(start);
            while (curr <= end) {
                dateArray.push(`${curr.getDate()}/${curr.getMonth() + 1}/${curr.getFullYear()}`);
                curr.setDate(curr.getDate() + 1);
            }
        }

        let attendanceQuery = {
            userId: { $in: userIds },
            status: { $in: ['Absent', 'On Leave', 'Pending'] }
        };

        if (dateArray.length > 0) {
            attendanceQuery.date = { $in: dateArray };
        }

        const totalRecords = await Attendance.countDocuments(attendanceQuery);
        const totalPages = Math.ceil(totalRecords / limit);

        const absences = await Attendance.find(attendanceQuery)
            .populate('userId', 'name employeeId shiftType')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            data: absences,
            pagination: { totalRecords, totalPages, currentPage: page, limit }
        });

    } catch (err) {
        console.error("Absent Report DB Error:", err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 4. GET CURRENT USER LOGS
// ==========================================
router.get('/my-logs', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const shiftType = user.shiftType || 'DAY';
        const dateStr = getShiftDate(new Date(), shiftType);

        const staleSession = await Attendance.findOne({
            userId: req.user.id, checkOut: null, date: { $ne: dateStr }
        });

        if (staleSession && staleSession.checkIn) {
            let settings = await Settings.findOne() || { dayShiftEndTime: "18:00", nightShiftEndTime: "04:00" };
            const isNight = shiftType === 'NIGHT';
            const closeTimeStr = isNight ? (settings.nightShiftEndTime || "04:00") : (settings.dayShiftEndTime || "18:00");
            const [closeH, closeM] = closeTimeStr.split(':').map(Number);
            const [d, m, y] = staleSession.date.split('/').map(Number);

            const autoOutTime = new Date(y, m - 1, d, closeH, closeM, 0, 0);
            if (isNight && closeH < 14) autoOutTime.setDate(autoOutTime.getDate() + 1);

            if (autoOutTime > staleSession.checkIn) {
                const diffMs = autoOutTime - new Date(staleSession.checkIn);
                staleSession.totalHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
            }

            staleSession.checkOut = autoOutTime;
            staleSession.note = (staleSession.note || '') + ' [Missed Punch Out]';
            await staleSession.save();
        }

        const logs = await Attendance.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(30);

        // Check for leaves and dynamically update Absent statuses
        const Leave = require('../models/Leave');
        const leaves = await Leave.find({ userId: req.user.id });

        const mappedLogs = logs.map(log => {
            if (log.status === 'Absent' || log.status === 'Pending') {
                const [d, m, y] = log.date.split('/').map(Number);
                const logDate = new Date(y, m - 1, d);
                
                const matchingLeave = leaves.find(l => {
                    const from = new Date(l.fromDate);
                    from.setHours(0,0,0,0);
                    const to = new Date(l.toDate);
                    to.setHours(23,59,59,999);
                    return logDate >= from && logDate <= to;
                });

                if (matchingLeave) {
                    const updatedLog = log.toObject ? log.toObject() : { ...log };
                    if (matchingLeave.status === 'Approved') {
                        updatedLog.status = 'On Leave';
                        updatedLog.note = 'Approved Leave';
                    } else if (matchingLeave.status === 'Pending') {
                        updatedLog.status = 'On Leave'; // Or Leave Pending, but UI expects primary for On Leave
                        updatedLog.note = 'Leave Request Pending';
                    }
                    return updatedLog;
                }
            }
            return log;
        });

        res.json(mappedLogs);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 5. GET ALL LOGS (Server-Side Paginated & Filtered)
// ==========================================
router.get('/all-logs', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let query = {};

        // 👇 FIXED: Explicitly filter OUT Absent and Pending records
        let andConditions = [
            { status: { $nin: ['Absent', 'Pending'] } }
        ];

        if (req.user.role === 'MANAGER' || req.user.role === 'TEAM LEAD') {
            const manager = await User.findById(req.user.id);
            const teamIds = await User.find({
                $or: [
                    { reportingManagerEmail: manager.email.toLowerCase() },
                    { teamLeadsEmail: manager.email.toLowerCase() }
                ]
            }).distinct('_id');
            andConditions.push({ userId: { $in: teamIds } });
        }

        const { filterType, fromDate, toDate } = req.query;
        const now = new Date();

        const generateDateArray = (start, end) => {
            let arr = [];
            let curr = new Date(start);
            curr.setHours(0, 0, 0, 0);
            let last = new Date(end);
            last.setHours(23, 59, 59, 999);
            while (curr <= last) {
                arr.push(`${curr.getDate()}/${curr.getMonth() + 1}/${curr.getFullYear()}`);
                curr.setDate(curr.getDate() + 1);
            }
            return arr;
        };

        if (filterType === 'Today') {
            andConditions.push({ date: `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}` });
        } else if (filterType === 'Yesterday') {
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            andConditions.push({ date: `${yesterday.getDate()}/${yesterday.getMonth() + 1}/${yesterday.getFullYear()}` });
        } else if (filterType === 'Week') {
            const oneWeekAgo = new Date(now);
            oneWeekAgo.setDate(now.getDate() - 7);
            andConditions.push({ date: { $in: generateDateArray(oneWeekAgo, now) } });
        } else if (filterType === 'Month') {
            const oneMonthAgo = new Date(now);
            oneMonthAgo.setDate(now.getDate() - 30);
            andConditions.push({ date: { $in: generateDateArray(oneMonthAgo, now) } });
        } else if (filterType === 'Custom' && fromDate && toDate) {
            const start = new Date(fromDate);
            const end = new Date(toDate);
            andConditions.push({ date: { $in: generateDateArray(start, end) } });
        }

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            const matchingUsers = await User.find({ name: searchRegex }).distinct('_id');

            andConditions.push({
                $or: [
                    { userId: { $in: matchingUsers } },
                    { note: searchRegex },
                    { status: searchRegex }
                ]
            });
        }

        if (andConditions.length > 0) {
            query.$and = andConditions;
        }

        const totalRecords = await Attendance.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        const logs = await Attendance.find(query)
            .populate('userId', 'name email shiftType employeeId profilePic')
            .sort({ checkIn: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            data: logs,
            pagination: { totalRecords, totalPages, currentPage: page, limit }
        });

    } catch (err) {
        console.error("All Logs Pagination Error:", err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 6. RAW LOGS GETTER (For RawPunches.js)
// ==========================================
router.get('/raw-logs', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const skip = (page - 1) * limit;

        let andConditions = [];

        if (req.user.role === 'MANAGER' || req.user.role === 'TEAM LEAD') {
            const manager = await User.findById(req.user.id);
            const teamIds = await User.find({
                $or: [
                    { reportingManagerEmail: manager.email.toLowerCase() },
                    { teamLeadsEmail: manager.email.toLowerCase() }
                ]
            }).distinct('_id');
            andConditions.push({ userId: { $in: teamIds } });
        }

        if (req.query.startDate && req.query.endDate) {
            andConditions.push({
                timestamp: {
                    $gte: new Date(req.query.startDate),
                    $lte: new Date(req.query.endDate)
                }
            });
        }

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            const matchingUsers = await User.find({
                $or: [{ name: searchRegex }, { employeeId: searchRegex }]
            }).distinct('_id');

            andConditions.push({
                $or: [
                    { userId: { $in: matchingUsers } },
                    { deviceId: searchRegex }
                ]
            });
        }

        let query = {};
        if (andConditions.length > 0) {
            query.$and = andConditions;
        }

        const totalRecords = await AttendanceLog.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        const logs = await AttendanceLog.find(query)
            .populate('userId', 'name email shiftType employeeId profilePic')
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            data: logs,
            pagination: { totalRecords, totalPages, currentPage: page, limit }
        });
    } catch (err) {
        console.error("Raw Logs Error:", err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 6b. GET RAW PUNCHES FOR ONE USER ON ONE DAY
// ==========================================
// @route   GET /api/attendance/user-raw-logs/:userId?shiftDate=D/M/YYYY
// @desc    Raw biometric punches for a single employee on a specific shift date (for modal)
router.get('/user-raw-logs/:userId', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const { shiftDate } = req.query;
        if (!shiftDate) return res.status(400).json({ message: 'shiftDate is required' });

        // Managers can only view punches for members of their own team
        if (req.user.role === 'MANAGER' || req.user.role === 'TEAM LEAD') {
            const manager = await User.findById(req.user.id);
            const target = await User.findById(req.params.userId).select('reportingManagerEmail teamLeadsEmail');
            if (!target || (!target.reportingManagerEmail.includes(manager.email.toLowerCase()) && !target.teamLeadsEmail.includes(manager.email.toLowerCase()))) {
                return res.status(403).json({ message: 'Access Denied: Not your reportee' });
            }
        }

        const logs = await AttendanceLog.find({ userId: req.params.userId, shiftDate })
            .sort({ timestamp: 1 });

        res.json({ data: logs });
    } catch (err) {
        console.error("User Raw Logs Error:", err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 7. GET LOGS BY USER ID (Paginated)
// ==========================================
router.get('/admin/user-logs/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const totalRecords = await Attendance.countDocuments({ userId: req.params.id });
        const totalPages = Math.ceil(totalRecords / limit);

        const logs = await Attendance.find({ userId: req.params.id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            data: logs,
            pagination: { totalRecords, totalPages, currentPage: page, limit }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 8. MANUAL UPDATE / OVERRIDE
// ==========================================
// @route   GET /api/attendance/export
// @desc    Export attendance logs to formatted Excel (.xlsx) with Summaries, Colors & Sorting
router.get('/export', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        let query = {};
        let andConditions = [{ status: { $nin: ['Absent', 'Pending'] } }];

        if (req.user.role === 'MANAGER' || req.user.role === 'TEAM LEAD') {
            const manager = await User.findById(req.user.id);
            const teamIds = await User.find({
                $or: [
                    { reportingManagerEmail: manager.email.toLowerCase() },
                    { teamLeadsEmail: manager.email.toLowerCase() }
                ]
            }).distinct('_id');
            andConditions.push({ userId: { $in: teamIds } });
        }

        const { filterType, fromDate, toDate } = req.query;
        let start = new Date();
        let end = new Date();

        if (filterType === 'Today') {
            start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
        } else if (filterType === 'Yesterday') {
            start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
            end.setDate(end.getDate() - 1); end.setHours(23, 59, 59, 999);
        } else if (filterType === 'Week') {
            start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
        } else if (filterType === 'Month' || filterType === 'All') {
            start.setDate(start.getDate() - 30); start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
        } else if (filterType === 'Custom' && fromDate && toDate) {
            start = new Date(fromDate); start.setHours(0, 0, 0, 0);
            end = new Date(toDate); end.setHours(23, 59, 59, 999);
        }

        let fullDateArray = [];
        let curr = new Date(start);
        while (curr <= end) {
            fullDateArray.push(`${curr.getDate()}/${curr.getMonth() + 1}/${curr.getFullYear()}`);
            curr.setDate(curr.getDate() + 1);
        }

        andConditions.push({ date: { $in: fullDateArray } });

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            const matchingUsers = await User.find({ name: searchRegex }).distinct('_id');
            andConditions.push({
                $or: [{ userId: { $in: matchingUsers } }, { note: searchRegex }, { status: searchRegex }]
            });
        }

        if (andConditions.length > 0) query.$and = andConditions;

        const logs = await Attendance.find(query).populate('userId', 'name employeeId').sort({ checkIn: 1 });

        const usersMap = {};
        logs.forEach(log => {
            if (!log.userId) return;
            const uid = log.userId._id.toString();
            if (!usersMap[uid]) {
                usersMap[uid] = { name: log.userId.name, empId: log.userId.employeeId || 'N/A', records: {} };
            }
            usersMap[uid].records[log.date] = log;
        });

        const sortedUsers = Object.values(usersMap).sort((a, b) => {
            const idA = a.empId !== 'N/A' ? a.empId : 'ZZZZZ';
            const idB = b.empId !== 'N/A' ? b.empId : 'ZZZZZ';
            return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
        });

        const isSunday = (dateStr) => {
            const [d, m, y] = dateStr.split('/');
            return new Date(y, m - 1, d).getDay() === 0;
        };
        const totalWorkingDays = fullDateArray.filter(d => !isSunday(d)).length;

        const formatFilenameDate = (d) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(-2)}`;
        const fileName = `AttendanceLogs_${formatFilenameDate(start)}_${formatFilenameDate(end)}.xlsx`;

        // --- EXCEL GENERATION START ---
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Attendance Export');

        const thinBorder = {
            top: { style: 'thin' }, left: { style: 'thin' },
            bottom: { style: 'thin' }, right: { style: 'thin' }
        };

        sortedUsers.forEach(user => {
            const empRow = worksheet.addRow(['Details', `ID: ${user.empId}`, `Name: ${user.name}`]);
            empRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            empRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF215D7B' } };

            const headerRowData = ['Date', ...fullDateArray.map(d => `${d.split('/')[0]}/${d.split('/')[1]}`), 'SUMMARY'];
            const headerRow = worksheet.addRow(headerRowData);
            headerRow.font = { bold: true };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

            headerRow.eachCell((cell, colNum) => {
                if (colNum > 1 && colNum <= fullDateArray.length + 1) {
                    if (isSunday(fullDateArray[colNum - 2])) cell.font = { color: { argb: 'FFDC2626' }, bold: true };
                }
            });

            const statusRowData = ['Status'];
            const inRowData = ['In Time'];
            const outRowData = ['Out Time'];
            const durationRowData = ['Duration'];

            let presentCount = 0, halfCount = 0, lateCount = 0, absentCount = 0;

            fullDateArray.forEach(date => {
                const log = user.records[date];
                const sun = isSunday(date);

                if (log) {
                    if (['Present', 'WFH', 'Late', 'Half Day'].includes(log.status)) presentCount++;
                    if (log.status === 'Absent') absentCount++;
                    if (log.status === 'Half Day') halfCount++;
                    if (log.status === 'Late') lateCount++;

                    statusRowData.push(log.status);
                    inRowData.push(log.checkIn ? new Date(log.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-');
                    outRowData.push(log.checkOut ? new Date(log.checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-');
                    durationRowData.push(log.totalHours || 0);
                } else {
                    statusRowData.push(sun ? 'Sunday' : 'Absent');
                    inRowData.push('-');
                    outRowData.push('-');
                    durationRowData.push('-');

                    if (!sun) absentCount++;
                }
            });

            statusRowData.push(`Present: ${presentCount}/${totalWorkingDays}`);
            inRowData.push(`Absent: ${absentCount}`);
            outRowData.push(`Late: ${lateCount}`);
            durationRowData.push(`Half Days: ${halfCount}`);

            const sRow = worksheet.addRow(statusRowData);
            const iRow = worksheet.addRow(inRowData);
            const oRow = worksheet.addRow(outRowData);
            const dRow = worksheet.addRow(durationRowData);

            const styleCell = (row, isStatusRow = false) => {
                row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                    cell.border = thinBorder;
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };

                    if (colNum > 1 && colNum <= fullDateArray.length + 1) {
                        const val = cell.value;
                        const isSun = isSunday(fullDateArray[colNum - 2]);

                        if (isStatusRow && val === 'Absent') {
                            cell.font = { color: { argb: 'FFDC2626' }, bold: true };
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                        } else if (isSun && val !== 'Sunday' && val !== '-') {
                            cell.font = { color: { argb: 'FF16A34A' }, bold: true };
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
                        } else if (isSun) {
                            if (isStatusRow && val === 'Sunday') cell.font = { color: { argb: 'FF94A3B8' }, italic: true };
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
                        }
                    } else if (colNum === fullDateArray.length + 2) {
                        cell.font = { bold: true, color: { argb: 'FF215D7B' } };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
                    }
                });
            };

            styleCell(sRow, true);
            styleCell(iRow);
            styleCell(oRow);
            styleCell(dRow);

            [empRow, headerRow, sRow, iRow, oRow, dRow].forEach(row => {
                row.getCell(1).font = { bold: true, color: { argb: 'FF334155' } };
                row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
                row.getCell(1).border = thinBorder;
            });

            worksheet.addRow([]);
        });

        worksheet.columns.forEach(column => { column.width = 12; });
        worksheet.getColumn(1).width = 18;
        worksheet.getColumn(fullDateArray.length + 2).width = 18;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error("Export Error:", err);
        res.status(500).send('Server Error during export');
    }
});

// ==========================================
// 9. MANUAL UPDATE / OVERRIDE
// ==========================================
router.put('/update/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const currentRecord = await Attendance.findById(req.params.id).populate('userId');
        if (!currentRecord) return res.status(404).json({ message: 'Log not found' });

        if (req.user.role === 'MANAGER' || req.user.role === 'TEAM LEAD') {
            const manager = await User.findById(req.user.id);
            const rme = currentRecord.userId.reportingManagerEmail || [];
            const tle = currentRecord.userId.teamLeadsEmail || [];
            const rmeLower = rme.map(e => e.toLowerCase());
            const tleLower = tle.map(e => e.toLowerCase());
            if (!rmeLower.includes(manager.email.toLowerCase()) && !tleLower.includes(manager.email.toLowerCase())) {
                return res.status(403).json({ message: 'Unauthorized: Not your team member' });
            }
        }

        const { checkIn, checkOut, status, note, shortLeaveStatus } = req.body;
        let newStatus = status;

        if (status === 'Auto') {
            const settings = await Settings.findOne() || { dayShiftStartTime: "09:30", nightShiftStartTime: "19:30", gracePeriod: 15, halfDayThreshold: 30 };
            const checkInDate = new Date(checkIn);
            const userShift = currentRecord.userId.shiftType || 'DAY';

            const isNight = userShift === 'NIGHT';
            const shiftStartStr = isNight ? (settings.nightShiftStartTime || "19:30") : (settings.dayShiftStartTime || "09:30");
            const shiftDateStr = getShiftDate(checkInDate, userShift);

            const [startH, startM] = shiftStartStr.split(':').map(Number);
            const [d, m, y] = shiftDateStr.split('/').map(Number);

            const officeTime = new Date(y, m - 1, d, startH, startM, 0, 0);
            const diffMs = checkInDate - officeTime;
            const lateMinutes = Math.floor(diffMs / 60000);

            if (lateMinutes > (settings.halfDayThreshold || 30)) newStatus = 'Half Day';
            else if (lateMinutes > (settings.gracePeriod || 15)) newStatus = 'Late';
            else newStatus = 'Present';

            // Hourly Overrides for Auto
            if (checkIn && checkOut) {
                const cIn = new Date(checkIn);
                const cOut = new Date(checkOut);
                if (cOut > cIn) {
                    const hrs = Number(((cOut - cIn) / 3600000).toFixed(2));
                    if (hrs < 6) newStatus = 'Half Day';
                    else if (hrs >= 8.33) newStatus = 'Present';
                }
            }
        }

        let updatePayload = { checkIn, checkOut, status: newStatus, note };
        if (shortLeaveStatus) updatePayload.shortLeaveStatus = shortLeaveStatus;
        if (checkIn && checkOut) {
            const cIn = new Date(checkIn);
            const cOut = new Date(checkOut);
            if (cOut > cIn) {
                updatePayload.totalHours = Number(((cOut - cIn) / 3600000).toFixed(2));
            }
        }

        // If manually updated to Present, clear Short Leave request if it was pending
        if (newStatus === 'Present' && currentRecord.shortLeaveStatus === 'Pending') {
            updatePayload.shortLeaveStatus = 'Approved';
            updatePayload.note = (note ? note + ' | ' : '') + 'Short Leave Approved';
        }

        const updatedLog = await Attendance.findByIdAndUpdate(
            req.params.id, updatePayload, { new: true }
        );
        res.json(updatedLog);

    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 10. WFH PUNCH ROUTE (Manual Check In / Out)
// ==========================================
router.post('/wfh-punch', auth, async (req, res) => {
    try {
        const { direction } = req.body; // 'IN' or 'OUT'
        if (!['IN', 'OUT'].includes(direction)) return res.status(400).json({ message: 'Invalid punch direction' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        const punchTime = new Date();
        const userShift = user.shiftType || 'DAY';
        const shiftDate = getShiftDate(punchTime, userShift);
        const deviceId = 'WEB_PORTAL';

        // 1. Log the punch in AttendanceLog
        await AttendanceLog.create({
            userId: user._id, 
            employeeId: user.employeeId || 'WFH', 
            timestamp: punchTime, 
            direction, 
            deviceId, 
            shiftDate
        });

        // 2. Fetch all logs for today and recalculate attendance
        const shiftLogs = await AttendanceLog.find({ userId: user._id, shiftDate }).sort({ timestamp: 1 });

        let settings = await Settings.findOne() || {
            dayShiftStartTime: "09:30", dayShiftEndTime: "18:00",
            nightShiftStartTime: "19:30", nightShiftEndTime: "04:00",
            gracePeriod: 15, halfDayThreshold: 30
        };

        const isNight = userShift === 'NIGHT';
        const shiftStartStr = isNight ? (settings.nightShiftStartTime || "19:30") : (settings.dayShiftStartTime || "09:30");
        const shiftEndStr = isNight ? (settings.nightShiftEndTime || "04:00") : (settings.dayShiftEndTime || "18:00");

        const [startHour, startMin] = shiftStartStr.split(':').map(Number);
        const [endHour, endMin] = shiftEndStr.split(':').map(Number);
        const [d, m, y] = shiftDate.split('/').map(Number);

        const shiftStartObj = new Date(y, m - 1, d, startHour, startMin, 0, 0);
        const shiftEndObj = new Date(y, m - 1, d, endHour, endMin, 0, 0);
        if (endHour < startHour) shiftEndObj.setDate(shiftEndObj.getDate() + 1);

        let firstIn = null;
        let lastOut = null;

        shiftLogs.forEach(log => {
            if (log.direction === 'IN') {
                if (!firstIn) firstIn = log.timestamp;
            } else if (log.direction === 'OUT') {
                lastOut = log.timestamp;
            }
        });

        // --- Calculate break time from BREAK_START/BREAK_END pairs ---
        let totalBreakMs = 0;
        let breakStartTime = null;
        shiftLogs.forEach(log => {
            if (log.direction === 'BREAK_START') {
                breakStartTime = log.timestamp;
            } else if (log.direction === 'BREAK_END' && breakStartTime) {
                totalBreakMs += (log.timestamp.getTime() - breakStartTime.getTime());
                breakStartTime = null;
            }
        });
        // If punching OUT while on break, auto-close the break
        if (direction === 'OUT' && breakStartTime) {
            totalBreakMs += (punchTime.getTime() - breakStartTime.getTime());
            // Also create a BREAK_END log to keep the data consistent
            await AttendanceLog.create({
                userId: user._id, employeeId: user.employeeId || 'WFH',
                timestamp: punchTime, direction: 'BREAK_END', deviceId, shiftDate
            });
        }
        const calculatedBreakMinutes = Math.floor(totalBreakMs / 60000);

        let calculatedGrossHours = 0;
        if (firstIn && lastOut && lastOut > firstIn) {
            const grossMs = lastOut.getTime() - firstIn.getTime();
            calculatedGrossHours = Number((grossMs / 3600000).toFixed(2));
        }

        let determinedStatus = 'Present';
        let determinedNote = 'Manual WFH Punch';

        if (firstIn) {
            const diffMinutes = Math.floor((firstIn - shiftStartObj) / 60000);
            if (diffMinutes > (settings.halfDayThreshold || 30)) {
                determinedStatus = 'Half Day';
                determinedNote = `Late by ${formatLateTime(diffMinutes)} (Remote Punch In)`;
            } else if (diffMinutes > (settings.gracePeriod || 15)) {
                determinedStatus = 'Late';
                determinedNote = `Late by ${formatLateTime(diffMinutes)} (Remote Punch In)`;
            } else {
                determinedStatus = 'Present';
                determinedNote = 'Remote Punch In';
            }
        }

        let record = await Attendance.findOne({ userId: user._id, date: shiftDate });

        if (!record) {
            if (firstIn) {
                record = new Attendance({
                    userId: user._id, date: shiftDate, checkIn: firstIn, checkOut: lastOut,
                    status: determinedStatus, note: determinedNote,
                    totalHours: calculatedGrossHours,
                    breakTimeTaken: calculatedBreakMinutes,
                    isOnBreak: false
                });
                await record.save();
            }
        } else {
            record.checkIn = firstIn || record.checkIn;
            record.checkOut = lastOut || record.checkOut;
            record.totalHours = calculatedGrossHours;
            record.breakTimeTaken = calculatedBreakMinutes;
            if (direction === 'OUT') record.isOnBreak = false;
            
            if (record.status === 'Pending' || record.status === 'Absent') {
                record.status = determinedStatus;
                record.note = determinedNote;
            }
            await record.save();
        }

        res.status(200).json({ message: "Punch successful", record });
    } catch (error) {
        console.error("WFH Punch Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// ==========================================
// 11. WFH BREAK ROUTE (Start / End Break)
// ==========================================
router.post('/wfh-break', auth, async (req, res) => {
    try {
        const { action } = req.body; // 'start' or 'end'
        if (!['start', 'end'].includes(action)) return res.status(400).json({ message: 'Invalid break action' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const breakTime = new Date();
        const userShift = user.shiftType || 'DAY';
        const shiftDate = getShiftDate(breakTime, userShift);
        const deviceId = 'WEB_PORTAL';

        // Verify user is checked in today
        let record = await Attendance.findOne({ userId: user._id, date: shiftDate });
        if (!record || !record.checkIn || record.checkOut) {
            return res.status(400).json({ message: 'You must be checked in (and not checked out) to take a break.' });
        }

        const direction = action === 'start' ? 'BREAK_START' : 'BREAK_END';

        if (action === 'start') {
            if (record.isOnBreak) {
                return res.status(400).json({ message: 'You are already on a break.' });
            }
            // Create BREAK_START log
            await AttendanceLog.create({
                userId: user._id, employeeId: user.employeeId || 'WFH',
                timestamp: breakTime, direction, deviceId, shiftDate
            });
            record.isOnBreak = true;
            await record.save();
        } else {
            // action === 'end'
            if (!record.isOnBreak) {
                return res.status(400).json({ message: 'You are not currently on a break.' });
            }
            // Create BREAK_END log
            await AttendanceLog.create({
                userId: user._id, employeeId: user.employeeId || 'WFH',
                timestamp: breakTime, direction, deviceId, shiftDate
            });

            // Recalculate total break time from all BREAK_START/BREAK_END pairs
            const shiftLogs = await AttendanceLog.find({ userId: user._id, shiftDate }).sort({ timestamp: 1 });
            let totalBreakMs = 0;
            let breakStartTs = null;
            shiftLogs.forEach(log => {
                if (log.direction === 'BREAK_START') {
                    breakStartTs = log.timestamp;
                } else if (log.direction === 'BREAK_END' && breakStartTs) {
                    totalBreakMs += (log.timestamp.getTime() - breakStartTs.getTime());
                    breakStartTs = null;
                }
            });

            record.breakTimeTaken = Math.floor(totalBreakMs / 60000);
            record.isOnBreak = false;
            await record.save();
        }

        res.status(200).json({ message: `Break ${action === 'start' ? 'started' : 'ended'} successfully`, record });
    } catch (error) {
        console.error("WFH Break Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// ==========================================
// 12. SHORT LEAVE ROUTE (Employee Apply)
// ==========================================
router.post('/short-leave/:id', auth, async (req, res) => {
    try {
        const { reason } = req.body;
        const record = await Attendance.findOne({ _id: req.params.id, userId: req.user.id });
        if (!record) return res.status(404).json({ message: 'Attendance record not found' });
        if (record.status !== 'Half Day') return res.status(400).json({ message: 'Short Leave can only be applied on Half Day records' });
        // 1. Get the month and year of this attendance record
        const dateParts = record.date.split('/');
        const month = dateParts[1];
        const year = dateParts[2];
        const monthRegex = new RegExp(`^\\d{1,2}/${month}/${year}$`);

        // 2. Count existing short leaves (Pending or Approved) for this month
        const shortLeavesThisMonth = await Attendance.countDocuments({
            userId: req.user.id,
            date: monthRegex,
            shortLeaveStatus: { $in: ['Pending', 'Approved'] }
        });

        if (shortLeavesThisMonth >= 2) {
            return res.status(400).json({ message: 'Limit reached: You can only apply for 2 Short Leaves per month.' });
        }

        record.shortLeaveStatus = 'Pending';
        record.shortLeaveReason = reason;
        await record.save();

        res.json({ message: 'Short Leave Request submitted successfully', record });
    } catch (err) {
        console.error("Short Leave Error:", err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 13. ALL SHORT LEAVE REQUESTS (Admin/HR)
// ==========================================
router.get('/short-leaves/all-requests', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let andConditions = [
            { shortLeaveStatus: { $in: ['Pending', 'Approved', 'Rejected'] } }
        ];

        if (req.query.status) {
            andConditions.push({ shortLeaveStatus: req.query.status });
        }

        if (req.user.role === 'MANAGER' || req.user.role === 'TEAM LEAD') {
            const manager = await User.findById(req.user.id);
            const teamIds = await User.find({
                $or: [
                    { reportingManagerEmail: manager.email.toLowerCase() },
                    { teamLeadsEmail: manager.email.toLowerCase() }
                ]
            }).distinct('_id');
            andConditions.push({ userId: { $in: teamIds } });
        }

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            const matchingUsers = await User.find({ name: searchRegex }).distinct('_id');
            andConditions.push({
                $or: [
                    { userId: { $in: matchingUsers } },
                    { shortLeaveReason: searchRegex }
                ]
            });
        }

        let query = { $and: andConditions };

        const totalRecords = await Attendance.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        const records = await Attendance.find(query)
            .populate('userId', 'name email employeeId profilePic')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Format to match Leaves/WFH structure for the UI
        const formattedData = records.map(record => {
            const [d, m, y] = record.date.split('/').map(Number);
            const isoDate = new Date(y, m - 1, d).toISOString();
            
            return {
                _id: record._id,
                userId: record.userId,
                fromDate: isoDate,
                toDate: isoDate,
                days: 0.5, 
                status: record.shortLeaveStatus,
                reason: record.shortLeaveReason,
                leaveType: 'Short Leave'
            };
        });

        res.json({
            data: formattedData,
            pagination: { totalRecords, totalPages, currentPage: page, limit }
        });
    } catch (err) {
        console.error("Short Leaves Pagination Error:", err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 14. SHORT LEAVE ACTION (Admin/HR)
// ==========================================
router.put('/short-leave/action/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const { status } = req.body;
        const record = await Attendance.findById(req.params.id);

        if (!record) return res.status(404).json({ message: 'Record not found' });

        record.shortLeaveStatus = status;
        
        // If approved, fix the main attendance status to Present
        if (status === 'Approved') {
            record.status = 'Present';
        } else if (status === 'Rejected') {
            record.status = 'Half Day';
        }

        await record.save();

        const Notification = require('../models/Notification');
        await Notification.create({
            recipient: record.userId,
            title: `Short Leave ${status}`,
            message: `Your Short Leave request on ${record.date} has been ${status.toLowerCase()}.`,
            type: 'SHORT_LEAVE'
        });

        res.json({ message: 'Short Leave updated successfully', record });

    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/attendance/short-leave/:id (Testing)
router.delete('/short-leave/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });
        
        const record = await Attendance.findById(req.params.id);
        if (!record) return res.status(404).json({ message: 'Record not found' });

        // Wipe the short leave fields
        record.shortLeaveStatus = undefined;
        record.shortLeaveReason = undefined;
        record.shortLeaveTime = undefined;
        // Optionally revert status to something default, but we'll leave it or set to Half Day
        if (record.status === 'Present') record.status = 'Half Day';
        
        await record.save();
        res.json({ message: 'Short leave request deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;