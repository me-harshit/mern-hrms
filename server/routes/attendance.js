const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Attendance = require('../models/Attendance');
const Settings = require('../models/Settings');


// Helper: Get today's date string (DD/MM/YYYY)
const getTodayStr = () => {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

// @route   POST /api/attendance/checkin
// @desc    User Check In
router.post('/checkin', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const dateStr = getTodayStr();
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

        // 3. Logic: Calculate Lateness
        const [startHour, startMin] = settings.officeStartTime.split(':').map(Number);

        const officeStartTime = new Date();
        officeStartTime.setHours(startHour, startMin, 0, 0);

        // Difference in minutes
        const diffMinutes = Math.floor((now - officeStartTime) / 60000);

        let status = 'Present';
        let note = '';

        // --- HELPER: Format Minutes to "X hr Y min" ---
        const formatLateTime = (mins) => {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            if (h > 0) return `${h} hr ${m} min`;
            return `${m} min`;
        };
        // ----------------------------------------------

        if (diffMinutes > settings.halfDayThreshold) {
            status = 'Half Day';
            note = `Late by ${formatLateTime(diffMinutes)} (Auto-marked)`;
        } else if (diffMinutes > settings.gracePeriod) {
            status = 'Late';
            note = `Late by ${formatLateTime(diffMinutes)}`;
        }

        // 4. Save to DB
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
        const dateStr = getTodayStr(); // Function defined in previous step (DD/MM/YYYY)
        const now = new Date();

        // 1. Find today's record
        let record = await Attendance.findOne({ userId, date: dateStr });
        if (!record) {
            return res.status(400).json({ message: 'No check-in record found for today.' });
        }

        // 2. Early Exit Logic (Before 14:30)
        // 14:30 = 2:30 PM. We check if current hour is < 14 OR (hour is 14 AND minute < 30)
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();

        // Default to existing status (e.g., 'Present' or 'Late')
        let finalStatus = record.status;
        let note = record.note;

        // If leaving before 14:30, force Half Day
        if (currentHour < 14 || (currentHour === 14 && currentMin < 30)) {
            finalStatus = 'Half Day';
            note = (note ? note + '; ' : '') + 'Early exit before 14:30';
        }

        // 3. Calculate Total Hours
        const checkInTime = new Date(record.checkIn);
        const diffMs = now - checkInTime;
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
// @desc    Get current user's logs (and auto-close stale sessions)
router.get('/my-logs', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const dateStr = getTodayStr(); 

        // --- 1. AUTO-CLEANUP STALE SESSIONS ---
        const staleSession = await Attendance.findOne({ 
            userId, 
            checkOut: null,
            date: { $ne: dateStr } 
        });

        if (staleSession) {
            // A. Fetch Dynamic Settings
            let settings = await Settings.findOne();
            // Default to 18:30 if setting missing
            const closeTimeStr = settings?.officeCloseTime || "18:30"; 
            
            // Parse "18:30" -> [18, 30]
            const [closeH, closeM] = closeTimeStr.split(':').map(Number);

            // B. Set Auto-Out Time
            const autoOutTime = new Date(staleSession.checkIn);
            autoOutTime.setHours(closeH, closeM, 0, 0); 

            // Calculate hours
            const diffMs = autoOutTime - new Date(staleSession.checkIn);
            const totalHours = (diffMs / (1000 * 60 * 60)).toFixed(2);

            // Update record
            staleSession.checkOut = autoOutTime;
            staleSession.totalHours = Number(totalHours) > 0 ? Number(totalHours) : 0;
            staleSession.status = 'Absent'; 
            staleSession.note = (staleSession.note || '') + ' [Auto-closed: Forgot Checkout]';
            
            await staleSession.save();
        }
        // ----------------------------------------

        // --- 2. FETCH LOGS ---
        const logs = await Attendance.find({ userId })
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

router.get('/admin/user-logs/:id', auth, async (req, res) => {
    try {
        if (req.user.role === 'EMPLOYEE') return res.status(403).json({ message: 'Access Denied' });
        const logs = await Attendance.find({ userId: req.params.id }).sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) { res.status(500).send('Server Error'); }
});

module.exports = router;