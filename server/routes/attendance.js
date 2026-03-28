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
// 🚀 1. BIOMETRIC UPLOAD ROUTE & CALCULATOR
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

        if (endHour < startHour) {
            shiftEndObj.setDate(shiftEndObj.getDate() + 1);
        }

        let isInside = false;
        let lastOutTime = null;
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

        let record = await Attendance.findOne({ userId, date: shiftDate });

        if (!record) {
            if (firstIn) {
                let status = 'Present';
                let note = 'Biometric Punch';
                const diffMinutes = Math.floor((firstIn - shiftStartObj) / 60000);

                if (diffMinutes > (settings.halfDayThreshold || 30)) {
                    status = 'Half Day';
                    note = `Late by ${formatLateTime(diffMinutes)}`;
                } else if (diffMinutes > (settings.gracePeriod || 15)) {
                    status = 'Late';
                    note = `Late by ${formatLateTime(diffMinutes)}`;
                }

                record = new Attendance({
                    userId, date: shiftDate, checkIn: firstIn, checkOut: lastOut,
                    status, note, totalHours: calculatedGrossHours, breakTimeTaken: calculatedBreakMinutes
                });
                await record.save();
            }
        } else {
            record.checkIn = firstIn || record.checkIn;
            record.checkOut = lastOut || record.checkOut;
            record.totalHours = calculatedGrossHours;
            record.breakTimeTaken = calculatedBreakMinutes;
            await record.save();
        }

        res.status(200).send({ status: "success" });
    } catch (error) {
        console.error("Processing Error:", error);
        res.sendStatus(200);
    }
});

// ==========================================
// 🚀 2. LIVE ABSENCE CALCULATOR (Optimized for Speed)
// ==========================================
router.get('/absent', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        // 🚀 MANAGER LOGIC
        let userQuery = { role: 'EMPLOYEE', status: 'ACTIVE' };
        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            userQuery.reportingManagerEmail = manager.email.toLowerCase();
        }

        const employees = await User.find(userQuery).select('name email employeeId shiftType');
        if (!employees.length) return res.json([]);

        const now = new Date();
        const employeeIds = employees.map(emp => emp._id);

        const neededDates = new Set();
        const empTargetDates = new Map();

        for (const emp of employees) {
            const shiftType = emp.shiftType || 'DAY';
            const targetDateStr = getShiftDate(now, shiftType);
            neededDates.add(targetDateStr);
            empTargetDates.set(emp._id.toString(), targetDateStr);
        }

        const attendances = await Attendance.find({
            userId: { $in: employeeIds },
            date: { $in: Array.from(neededDates) }
        });

        let leaves = [];
        if (Leave) {
            const startCheck = new Date(now);
            startCheck.setDate(startCheck.getDate() - 2);
            startCheck.setHours(0, 0, 0, 0);

            leaves = await Leave.find({
                userId: { $in: employeeIds },
                status: 'Approved',
                fromDate: { $lte: now },
                toDate: { $gte: startCheck }
            });
        }

        const isDateInLeave = (dateStr, leave) => {
            const [d, m, y] = dateStr.split('/').map(Number);
            const checkDate = new Date(y, m - 1, d);
            const lFrom = new Date(leave.fromDate); lFrom.setHours(0, 0, 0, 0);
            const lTo = new Date(leave.toDate); lTo.setHours(23, 59, 59, 999);
            return checkDate >= lFrom && checkDate <= lTo;
        };

        const missingEmployees = [];

        for (const emp of employees) {
            const targetDateStr = empTargetDates.get(emp._id.toString());

            // 👇 SUNDAY CHECK: Parse the date string and check if it's Sunday
            const [d, m, y] = targetDateStr.split('/').map(Number);
            const checkDateObj = new Date(y, m - 1, d);
            
            // getDay() returns 0 for Sunday. If Sunday, skip flagging this user as absent!
            if (checkDateObj.getDay() === 0) {
                continue; 
            }
            // 👆 END SUNDAY CHECK

            const record = attendances.find(a =>
                a.userId.toString() === emp._id.toString() &&
                a.date === targetDateStr &&
                a.status !== 'Absent'
            );

            if (!record) {
                let currentStatus = 'Absent';

                if (Leave) {
                    const empLeaves = leaves.filter(l => l.userId.toString() === emp._id.toString());
                    const onLeave = empLeaves.find(l => isDateInLeave(targetDateStr, l));
                    if (onLeave) currentStatus = 'On Leave';
                }

                missingEmployees.push({
                    _id: emp._id,
                    name: emp.name,
                    employeeId: emp.employeeId,
                    shiftType: emp.shiftType || 'DAY',
                    targetDate: targetDateStr,
                    status: currentStatus
                });
            }
        }

        res.json(missingEmployees);
    } catch (err) {
        console.error("Absence Check Error:", err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 🚀 3. LIVE & HISTORICAL ABSENCE REPORT
// ==========================================
router.post('/absent-report', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const { startDate, endDate, shiftType } = req.body;
        const targetShift = shiftType || 'DAY';

        const shiftQueryConditions = [{ shiftType: targetShift }];
        if (targetShift === 'DAY') {
            shiftQueryConditions.push({ shiftType: null });
            shiftQueryConditions.push({ shiftType: '' });
            shiftQueryConditions.push({ shiftType: { $exists: false } });
        }

        // 🚀 MANAGER LOGIC
        let userQuery = { role: 'EMPLOYEE', status: 'ACTIVE', $or: shiftQueryConditions };
        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            userQuery.reportingManagerEmail = manager.email.toLowerCase();
        }

        const employees = await User.find(userQuery).select('name email employeeId shiftType joiningDate');

        let start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        let end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const now = new Date();
        let maxAllowedDate = new Date(now);
        if (targetShift === 'NIGHT' && now.getHours() < 14) {
            maxAllowedDate.setDate(maxAllowedDate.getDate() - 1);
        }
        maxAllowedDate.setHours(23, 59, 59, 999);

        if (end > maxAllowedDate) end = new Date(maxAllowedDate);
        if (start > end) return res.json([]);

        const dateArray = [];
        let currentDate = new Date(start);
        while (currentDate <= end) {
            dateArray.push(`${currentDate.getDate()}/${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        const attendances = await Attendance.find({
            date: { $in: dateArray },
            userId: { $in: employees.map(e => e._id) }
        });

        let leaves = [];
        if (Leave) {
            leaves = await Leave.find({
                status: 'Approved',
                userId: { $in: employees.map(e => e._id) },
                $or: [
                    { fromDate: { $lte: end }, toDate: { $gte: start } }
                ]
            });
        }

        const isDateInLeave = (dateStr, leave) => {
            const [d, m, y] = dateStr.split('/').map(Number);
            const checkDate = new Date(y, m - 1, d);
            const lFrom = new Date(leave.fromDate); lFrom.setHours(0, 0, 0, 0);
            const lTo = new Date(leave.toDate); lTo.setHours(23, 59, 59, 999);
            return checkDate >= lFrom && checkDate <= lTo;
        };

        const missingList = [];

        for (const dateStr of dateArray) {
            // 👇 SUNDAY CHECK: Parse the date string and check if it's Sunday
            const [d, m, y] = dateStr.split('/').map(Number);
            const checkDateObj = new Date(y, m - 1, d);
            
            // If it's Sunday (0), skip adding "Absent" flags for this date entirely
            if (checkDateObj.getDay() === 0) {
                continue;
            }
            // 👆 END SUNDAY CHECK

            for (const emp of employees) {
                if (emp.joiningDate) {
                    const [d2, m2, y2] = dateStr.split('/').map(Number);
                    const checkDateForJoin = new Date(y2, m2 - 1, d2);
                    const joinDate = new Date(emp.joiningDate);
                    joinDate.setHours(0, 0, 0, 0);
                    if (checkDateForJoin < joinDate) continue;
                }

                const record = attendances.find(a => a.date === dateStr && a.userId.toString() === emp._id.toString());

                if (!record || record.status === 'Absent') {
                    let currentStatus = 'Absent';

                    const empLeaves = leaves.filter(l => l.userId.toString() === emp._id.toString());
                    const onLeave = empLeaves.find(l => isDateInLeave(dateStr, l));
                    if (onLeave) currentStatus = 'On Leave';

                    missingList.push({
                        _id: `${emp._id}-${dateStr}`,
                        name: emp.name,
                        employeeId: emp.employeeId,
                        shiftType: emp.shiftType || 'DAY',
                        targetDate: dateStr,
                        status: currentStatus
                    });
                }
            }
        }

        missingList.sort((a, b) => {
            const [d1, m1, y1] = a.targetDate.split('/').map(Number);
            const [d2, m2, y2] = b.targetDate.split('/').map(Number);
            return new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1);
        });

        res.json(missingList);
    } catch (err) {
        console.error("Absent Report Error:", err);
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

            // 👇 FIXED: Removed the line that forces "Absent". 
            // Now we just update the note to let HR know they forgot to punch out!
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
// 5. GET ALL LOGS
// ==========================================
router.get('/all-logs', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        let query = {};
        // 🚀 MANAGER LOGIC
        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            const teamIds = await User.find({ reportingManagerEmail: manager.email.toLowerCase() }).distinct('_id');
            query = { userId: { $in: teamIds } };
        }

        const logs = await Attendance.find(query).populate('userId', 'name email shiftType').sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/raw-logs', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        let query = {};
        // 🚀 MANAGER LOGIC
        if (req.user.role === 'MANAGER') {
            const manager = await User.findById(req.user.id);
            const teamIds = await User.find({ reportingManagerEmail: manager.email.toLowerCase() }).distinct('_id');
            query = { userId: { $in: teamIds } };
        }

        const logs = await AttendanceLog.find(query).populate('userId', 'name email shiftType').sort({ timestamp: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 6. GET LOGS BY USER ID
// ==========================================
router.get('/admin/user-logs/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });
        const logs = await Attendance.find({ userId: req.params.id }).sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) { res.status(500).send('Server Error'); }
});

// ==========================================
// 7. MANUAL UPDATE / OVERRIDE
// ==========================================
router.put('/update/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const currentRecord = await Attendance.findById(req.params.id).populate('userId');
        if (!currentRecord) return res.status(404).json({ message: 'Log not found' });

        // 🚀 MANAGER LOGIC: Check authorization
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