const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer();
const auth = require('../middleware/authMiddleware');
const Attendance = require('../models/Attendance');
const AttendanceLog = require('../models/AttendanceLog');
const Settings = require('../models/Settings');
const User = require('../models/User');

// --- Try to load Leave model ---
let Leave = null;
try {
    Leave = require('../models/Leave');
} catch (e) {
    console.log("Note: Leave model not found in attendance route, 'On Leave' status fallback disabled.");
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
// 🚀 1. BIOMETRIC UPLOAD ROUTE (UPDATED FOR PENDING RECORDS)
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
        let determinedStatus = 'Pending';
        let determinedNote = 'Biometric Punch';

        if (firstIn) {
            const diffMinutes = Math.floor((firstIn - shiftStartObj) / 60000);
            if (diffMinutes > (settings.halfDayThreshold || 30)) {
                determinedStatus = 'Half Day';
                determinedNote = `Late by ${formatLateTime(diffMinutes)}`;
            } else if (diffMinutes > (settings.gracePeriod || 15)) {
                determinedStatus = 'Late';
                determinedNote = `Late by ${formatLateTime(diffMinutes)}`;
            } else {
                determinedStatus = 'Present';
            }
        }

        // --- Database Update ---
        let record = await Attendance.findOne({ userId, date: shiftDate });

        if (!record) {
            // Fallback: If cron failed to run morning setup, create the record normally
            if (firstIn) {
                record = new Attendance({
                    userId, date: shiftDate, checkIn: firstIn, checkOut: lastOut,
                    status: determinedStatus, note: determinedNote,
                    totalHours: calculatedGrossHours, breakTimeTaken: calculatedBreakMinutes
                });
                await record.save();
            }
        } else {
            // Success: Update the Pre-populated Cron Record!
            record.checkIn = firstIn || record.checkIn;
            record.checkOut = lastOut || record.checkOut;
            record.totalHours = calculatedGrossHours;
            record.breakTimeTaken = calculatedBreakMinutes;

            // ONLY overwrite status if it's currently Pending or Absent
            if (record.status === 'Pending' || record.status === 'Absent') {
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
// 🚀 2. LIVE ABSENCE CALCULATOR (Ultra-Fast Pending Query)
// ==========================================
router.get('/absent', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const now = new Date();
        
        let userQuery = { role: 'EMPLOYEE', status: 'ACTIVE' };
        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            userQuery.reportingManagerEmail = manager.email.toLowerCase();
        }

        const employees = await User.find(userQuery).select('_id');
        const employeeIds = employees.map(emp => emp._id);

        // Instead of math, just find who is "Pending" for today's dates
        const todayDayStr = getShiftDate(now, 'DAY');
        const todayNightStr = getShiftDate(now, 'NIGHT');

        const liveAbsences = await Attendance.find({
            userId: { $in: employeeIds },
            date: { $in: [todayDayStr, todayNightStr] },
            status: 'Pending'
        }).populate('userId', 'name email employeeId shiftType');

        const formattedMissing = liveAbsences.map(record => ({
            _id: record.userId._id,
            name: record.userId.name,
            employeeId: record.userId.employeeId,
            shiftType: record.userId.shiftType || 'DAY',
            targetDate: record.date,
            status: 'Pending Punch'
        }));

        res.json(formattedMissing);
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

        let userQuery = { role: 'EMPLOYEE', status: 'ACTIVE' };

        if (req.query.shiftType === 'DAY') {
            userQuery.$or = [{ shiftType: 'DAY' }, { shiftType: null }, { shiftType: { $exists: false } }];
        } else if (req.query.shiftType === 'NIGHT') {
            userQuery.shiftType = 'NIGHT';
        }

        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            userQuery.reportingManagerEmail = manager.email.toLowerCase();
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
            // Included 'Pending' so HR can see people who haven't punched in today yet
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
        res.json(logs);
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
        let andConditions = [];

        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            const teamIds = await User.find({ reportingManagerEmail: manager.email.toLowerCase() }).distinct('_id');
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
            .populate('userId', 'name email shiftType')
            .sort({ createdAt: -1 })
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

        // 1. Manager Scope
        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            const teamIds = await User.find({ reportingManagerEmail: manager.email.toLowerCase() }).distinct('_id');
            andConditions.push({ userId: { $in: teamIds } });
        }

        // 2. Date Range Filtering
        if (req.query.startDate && req.query.endDate) {
            andConditions.push({
                timestamp: {
                    $gte: new Date(req.query.startDate),
                    $lte: new Date(req.query.endDate)
                }
            });
        }

        // 3. Text Search (Employee Name, Bio ID, or Device ID)
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

        // 4. Combine all conditions safely
        let query = {};
        if (andConditions.length > 0) {
            query.$and = andConditions;
        }

        const totalRecords = await AttendanceLog.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        const logs = await AttendanceLog.find(query)
            .populate('userId', 'name email shiftType')
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
router.put('/update/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const currentRecord = await Attendance.findById(req.params.id).populate('userId');
        if (!currentRecord) return res.status(404).json({ message: 'Log not found' });

        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            if (currentRecord.userId.reportingManagerEmail?.toLowerCase() !== manager.email.toLowerCase()) {
                return res.status(403).json({ message: 'Unauthorized: Not your team member' });
            }
        }

        const { checkIn, checkOut, status, note } = req.body;
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
        }

        let updatePayload = { checkIn, checkOut, status: newStatus, note };
        if (checkIn && checkOut) {
            const cIn = new Date(checkIn);
            const cOut = new Date(checkOut);
            if (cOut > cIn) {
                updatePayload.totalHours = Number(((cOut - cIn) / 3600000).toFixed(2));
            }
        }

        const updatedLog = await Attendance.findByIdAndUpdate(
            req.params.id, updatePayload, { new: true }
        );
        res.json(updatedLog);

    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;