const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer();
const cron = require('node-cron');
const auth = require('../middleware/authMiddleware');
const Attendance = require('../models/Attendance');
const AttendanceLog = require('../models/AttendanceLog');
const Settings = require('../models/Settings');
const User = require('../models/User');

// --- HELPER: Format Lateness ---
const formatLateTime = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return `${h} hr ${m} min`;
    return `${m} min`;
};

// --- HELPER: Shift Date Calculator (Extended to 7:30 AM) ---
const getShiftDate = (punchTime) => {
    const d = new Date(punchTime);
    // Convert time to a decimal (e.g., 7:30 AM = 7.5)
    const timeInHours = d.getHours() + (d.getMinutes() / 60);
    
    // If the punch happens before 7:30 AM, it belongs to yesterday's shift
    if (timeInHours <= 7.5) { 
        d.setDate(d.getDate() - 1);
    }
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

const getTodayStr = () => {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

// --- HELPER: Determine Shift Type (Extended to 7:30 AM) ---
const isNightShift = (dateObj) => {
    const timeInHours = dateObj.getHours() + (dateObj.getMinutes() / 60);
    // Night shift spans from 3:00 PM (15.0) to 7:30 AM (7.5) the next day
    return (timeInHours >= 15 || timeInHours <= 7.5); 
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
        const shiftDate = getShiftDate(punchTime);

        // --- 1. SAVE RAW LOG ---
        await AttendanceLog.create({
            userId, employeeId: biometricId, timestamp: punchTime, direction, deviceId: event.deviceName, shiftDate
        });

        // --- 2. FETCH ALL LOGS FOR THIS SHIFT ---
        const shiftLogs = await AttendanceLog.find({ userId, shiftDate }).sort({ timestamp: 1 });

        // --- BUG FIX: FIND ACTUAL 'IN' PUNCH TO DETERMINE SHIFT TYPE ---
        const firstInLog = shiftLogs.find(log => log.direction === 'IN');
        const referenceTime = firstInLog ? firstInLog.timestamp : shiftLogs[0].timestamp;
        const isNight = isNightShift(referenceTime); 
        
        let settings = await Settings.findOne() || { 
            dayShiftStartTime: "09:30", dayShiftEndTime: "18:30", 
            nightShiftStartTime: "19:00", nightShiftEndTime: "04:00", 
            gracePeriod: 15, halfDayThreshold: 30 
        };

        const shiftStartStr = isNight ? (settings.nightShiftStartTime || "19:00") : (settings.dayShiftStartTime || "09:30");
        const shiftEndStr = isNight ? (settings.nightShiftEndTime || "04:00") : (settings.dayShiftEndTime || "18:30");

        const [startHour, startMin] = shiftStartStr.split(':').map(Number);
        const [endHour, endMin] = shiftEndStr.split(':').map(Number);
        const [d, m, y] = shiftDate.split('/').map(Number);

        const shiftStartObj = new Date(y, m - 1, d, startHour, startMin, 0, 0);
        const shiftEndObj = new Date(y, m - 1, d, endHour, endMin, 0, 0);
        
        if (isNight && endHour < 12) {
            shiftEndObj.setDate(shiftEndObj.getDate() + 1);
        }

        // --- 4. STATE MACHINE: OVERLAPPING BREAK TIME ---
        let isInside = false;
        let lastOutTime = null;
        let breakMs = 0;
        
        let firstIn = null;
        let lastOut = null;

        shiftLogs.forEach(log => {
            if (log.direction === 'IN') {
                if (!firstIn) firstIn = log.timestamp; 
                if (!isInside) {
                    if (lastOutTime) {
                        const breakStart = Math.max(lastOutTime.getTime(), shiftStartObj.getTime());
                        const breakEnd = Math.min(log.timestamp.getTime(), shiftEndObj.getTime());
                        
                        if (breakEnd > breakStart) {
                            breakMs += (breakEnd - breakStart);
                        }
                    }
                    isInside = true;
                }
            } else if (log.direction === 'OUT') {
                lastOut = log.timestamp; 
                if (isInside) {
                    lastOutTime = log.timestamp;
                    isInside = false;
                }
            }
        });

        // --- GROSS TIME CALCULATION ---
        let calculatedGrossHours = 0;
        if (firstIn && lastOut && lastOut > firstIn) {
            const grossMs = lastOut.getTime() - firstIn.getTime();
            calculatedGrossHours = Number((grossMs / 3600000).toFixed(2));
        }

        const calculatedBreakMinutes = Math.floor(breakMs / 60000);

        // --- 5. UPDATE OR CREATE DAILY AGGREGATE ---
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
                console.log(`✅ [${isNight ? 'Night' : 'Day'} Shift] ${user.name} IN at ${firstIn.toLocaleTimeString()}`);
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
// 2. GET CURRENT USER LOGS & AUTO-CLEANUP
// ==========================================
router.get('/my-logs', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const dateStr = getTodayStr(); 

        const staleSession = await Attendance.findOne({ 
            userId, checkOut: null, date: { $ne: dateStr } 
        });

        if (staleSession && staleSession.checkIn) {
            let settings = await Settings.findOne() || { dayShiftEndTime: "18:30", nightShiftEndTime: "04:00" };
            
            const isNight = isNightShift(staleSession.checkIn);
            const closeTimeStr = isNight ? (settings.nightShiftEndTime || "04:00") : (settings.dayShiftEndTime || "18:30");
            const [closeH, closeM] = closeTimeStr.split(':').map(Number);
            const [d, m, y] = staleSession.date.split('/').map(Number); 

            const autoOutTime = new Date(y, m - 1, d, closeH, closeM, 0, 0); 
            if (isNight && closeH < 12) autoOutTime.setDate(autoOutTime.getDate() + 1);

            if (autoOutTime > staleSession.checkIn) {
                const diffMs = autoOutTime - new Date(staleSession.checkIn);
                staleSession.totalHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
            }

            staleSession.checkOut = autoOutTime;
            staleSession.status = 'Absent'; 
            staleSession.note = (staleSession.note || '') + ' [Auto-closed]';
            await staleSession.save();
        }

        const logs = await Attendance.find({ userId }).sort({ createdAt: -1 }).limit(30);
        res.json(logs);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 3. GET ALL LOGS (Admin/HR Only)
// ==========================================
router.get('/all-logs', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });
        const logs = await Attendance.find().populate('userId', 'name email').sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/raw-logs', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const logs = await AttendanceLog.find()
            .populate('userId', 'name email')
            .sort({ timestamp: -1 }); 

        res.json(logs);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// ==========================================
// 4. GET LOGS BY USER ID
// ==========================================
router.get('/admin/user-logs/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });
        const logs = await Attendance.find({ userId: req.params.id }).sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) { res.status(500).send('Server Error'); }
});

// ==========================================
// 5. MANUAL UPDATE / OVERRIDE (Admin/HR)
// ==========================================
router.put('/update/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const { checkIn, checkOut, status, note } = req.body;
        let newStatus = status;

        if (status === 'Auto') {
            const settings = await Settings.findOne() || { dayShiftStartTime: "09:30", nightShiftStartTime: "19:00", gracePeriod: 15, halfDayThreshold: 30 };
            const checkInDate = new Date(checkIn);
            
            const isNight = isNightShift(checkInDate);
            const shiftStartStr = isNight ? (settings.nightShiftStartTime || "19:00") : (settings.dayShiftStartTime || "09:30");
            const shiftDateStr = getShiftDate(checkInDate);
            
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

cron.schedule('0 10 * * *', async () => {
    console.log('Running daily absence check...');
    try {
        // Look at yesterday's date
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const formattedDate = `${yesterday.getDate()}/${yesterday.getMonth() + 1}/${yesterday.getFullYear()}`;

        // Find all active employees
        const employees = await User.find({ role: 'EMPLOYEE' });

        for (const emp of employees) {
            // Check if they have an attendance record for yesterday
            const recordExists = await Attendance.findOne({ 
                userId: emp._id, 
                date: formattedDate 
            });

            // If no record exists, auto-generate an Absent log
            if (!recordExists) {
                await Attendance.create({
                    userId: emp._id,
                    date: formattedDate,
                    status: 'Absent',
                    checkIn: null,
                    checkOut: null,
                    note: 'Auto-marked absent (No punches)'
                });
                console.log(`❌ Marked ${emp.name} as Absent for ${formattedDate}`);
            }
        }
    } catch (err) {
        console.error('Error in daily absence check:', err);
    }
});

module.exports = router;