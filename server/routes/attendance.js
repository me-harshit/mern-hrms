const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Attendance = require('../models/Attendance');
const Settings = require('../models/Settings');

const getISTDate = () => {
    const now = new Date();
    // Convert current UTC time to IST string
    const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    return new Date(istString);
};

// Helper: Get today's date string (DD/MM/YYYY)
const getTodayStr = () => {
    // 1. Get current time in UTC
    const d = new Date();

    // 2. Add 5 hours 30 minutes (330 minutes) to get IST
    const istOffset = 330 * 60 * 1000;
    const istDate = new Date(d.getTime() + istOffset);

    // 3. Format DD/MM/YYYY
    return `${istDate.getUTCDate()}/${istDate.getUTCMonth() + 1}/${istDate.getUTCFullYear()}`;
};

// @route   POST /api/attendance/checkin
// @desc    User Check In
router.post('/checkin', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const dateStr = getTodayStr(); // Correct IST Date
        const now = new Date();

        // 1. Check if already checked in
        let existingRecord = await Attendance.findOne({ userId, date: dateStr });
        if (existingRecord) {
            return res.status(400).json({ message: 'Already checked in for today.' });
        }

        // 2. Fetch Settings
        let settings = await Settings.findOne();
        if (!settings) {
            settings = { officeStartTime: "09:30", gracePeriod: 15, halfDayThreshold: 30 };
        }

        // 3. CALCULATE LATENESS (The Fix)
        // We convert everything to "Minutes from Midnight" in IST

        // A. Office Start (e.g., 09:30 -> 570 minutes)
        const [startH, startM] = settings.officeStartTime.split(':').map(Number);
        const officeStartMinutes = (startH * 60) + startM;

        // B. Current Time in IST
        // UTC Hours/Mins + 5:30 offset
        const currentUtcMinutes = (now.getUTCHours() * 60) + now.getUTCMinutes();
        const currentIstMinutes = currentUtcMinutes + 330; // Add 330 mins for IST

        // C. Calculate Difference
        const diffMinutes = currentIstMinutes - officeStartMinutes;

        let status = 'Present';
        let note = '';

        // --- Helper for Note formatting ---
        const formatTime = (mins) => {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return h > 0 ? `${h} hr ${m} min` : `${m} min`;
        };

        // D. Determine Status
        if (diffMinutes > settings.halfDayThreshold) {
            // Case 1: Too late (Half Day)
            status = 'Half Day';
            note = `Late by ${formatTime(diffMinutes)} (Auto-marked Half Day)`;
        } else if (diffMinutes > settings.gracePeriod) {
            // Case 2: In Grace Period (Late)
            status = 'Late';
            note = `Late by ${formatTime(diffMinutes)}`;
        } else {
            // Case 3: On Time (or Early)
            status = 'Present';
        }

        // 4. Save to DB
        // We store the raw UTC timestamp (now) so the DB is standard, 
        // but the Status and Note were calculated using IST.
        const newAttendance = new Attendance({
            userId,
            date: dateStr,
            checkIn: now,
            status,
            note
        });

        await newAttendance.save();
        res.json(newAttendance);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// ... rest of the file (checkout, all-logs, etc.) remains same ...

// @route   POST /api/attendance/checkout
// @desc    User Check Out
// @route   POST /api/attendance/checkout
router.post('/checkout', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const dateStr = getTodayStr(); // Using corrected IST helper
        const now = new Date(); // Actual UTC time for saving
        const nowIST = getISTDate(); // IST time for logic

        // 1. Find today's record
        let record = await Attendance.findOne({ userId, date: dateStr });
        if (!record) {
            return res.status(400).json({ message: 'No check-in record found for today.' });
        }

        // 2. Early Exit Logic (Before 14:30 IST)
        const currentHour = nowIST.getHours();
        const currentMin = nowIST.getMinutes();

        let finalStatus = record.status;
        let note = record.note;

        // If leaving before 14:30, force Half Day
        if (currentHour < 14 || (currentHour === 14 && currentMin < 30)) {
            // Only overwrite if they weren't already absent/half-day
            if (finalStatus !== 'Absent') {
                finalStatus = 'Half Day';
                note = (note ? note + '; ' : '') + 'Early exit before 14:30';
            }
        }

        // 3. Calculate Total Hours
        const checkInTime = new Date(record.checkIn);
        const diffMs = now - checkInTime; // UTC - UTC works fine for duration
        const totalHours = (diffMs / (1000 * 60 * 60)).toFixed(2);

        // 4. Update Record
        record.checkOut = now;
        record.totalHours = Number(totalHours);
        record.status = finalStatus;
        record.note = note;

        await record.save();
        res.json(record);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/attendance/my-logs
// @desc    Get current user's logs
router.get('/my-logs', auth, async (req, res) => {
    try {
        // Fetch last 30 days of logs, sorted newest first
        const logs = await Attendance.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(30);
        res.json(logs);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/attendance/all-logs
// @desc    Get All Attendance Logs (Admin/HR Only)
router.get('/all-logs', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        // Fetch logs and populate user details (name, email)
        // Sort by most recent date (using createdAt is safer for sorting than string date)
        const logs = await Attendance.find()
            .populate('userId', 'name email')
            .sort({ createdAt: -1 });

        res.json(logs);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/attendance/update/:id
// @desc    Admin Manually Updates a Log
router.put('/update/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });

        const { checkIn, checkOut, status, note } = req.body;

        let newStatus = status;

        // --- AUTO-CALCULATION LOGIC ---
        if (status === 'Auto') {
            // 1. Fetch Settings
            const settings = await Settings.findOne();
            const officeStart = settings?.officeStartTime || '09:30';
            const gracePeriod = settings?.gracePeriod || 15;
            const halfDayThreshold = settings?.halfDayThreshold || 30;

            // 2. Parse Times
            const checkInDate = new Date(checkIn);

            // Create "Office Start" date object for comparison
            const [officeH, officeM] = officeStart.split(':');
            const officeTime = new Date(checkInDate); // Clone the day
            officeTime.setHours(officeH, officeM, 0, 0);

            // 3. Calculate Difference in Minutes
            const diffMs = checkInDate - officeTime;
            const lateMinutes = Math.floor(diffMs / 60000);

            // 4. Determine Status
            if (lateMinutes > halfDayThreshold) {
                newStatus = 'Half Day';
            } else if (lateMinutes > gracePeriod) {
                newStatus = 'Late';
            } else {
                newStatus = 'Present';
            }
        }

        const updatedLog = await Attendance.findByIdAndUpdate(
            req.params.id,
            {
                checkIn,
                checkOut,
                status: newStatus,
                note
            },
            { new: true }
        );

        res.json(updatedLog);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;