const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');

let Leave = null, Wfh = null, Holiday = null;
try { Leave = require('../models/Leave'); } catch (e) {}
try { Wfh = require('../models/Wfh'); } catch (e) {}
try { Holiday = require('../models/Holiday'); } catch (e) {}

// Helper: Calculate shift date (Ensures Night Shifts that end in the morning are logged to yesterday's date)
const getShiftDate = (punchTime, shiftType) => {
    const d = new Date(punchTime);
    if (shiftType === 'NIGHT' && d.getHours() < 14) {
        d.setDate(d.getDate() - 1);
    }
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

// Turns the D/M/YYYY shift date back into a Date at local midnight.
const parseShiftDate = (dateStr) => {
    const [d, m, y] = dateStr.split('/').map(Number);
    return new Date(y, m - 1, d);
};

// Shared by the morning setup and the evening sweep. Returns why the day is a
// non-working day, or null if it is a normal working day. Both ends have to ask:
// a holiday entered in HRMS after the 7 AM setup would otherwise still get every
// employee swept to Absent at 8 PM.
const getNonWorkingReason = async (shiftDateObj) => {
    if (shiftDateObj.getDay() === 0) return 'Sunday';
    if (Holiday) {
        const startOfDay = new Date(shiftDateObj); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(shiftDateObj); endOfDay.setHours(23, 59, 59, 999);
        const holiday = await Holiday.findOne({ date: { $gte: startOfDay, $lte: endOfDay } });
        if (holiday) return `Holiday (${holiday.name})`;
    }
    return null;
};

// ========================================================
// 🌅 MORNING SETUP: Creates Pending/Leave/WFH records before shift
// ========================================================
const setupMorningRecords = async (shiftType) => {
    try {
        console.log(`[CRON - MORNING] Setting up pre-shift records for ${shiftType}...`);
        const now = new Date();
        const targetDateStr = getShiftDate(now, shiftType);
        
        const [d, m, y] = targetDateStr.split('/').map(Number);
        const shiftDateObj = new Date(y, m - 1, d);

        // 1. Skip Sundays and official holidays
        const nonWorkingReason = await getNonWorkingReason(shiftDateObj);
        if (nonWorkingReason) {
            console.log(`[CRON] Shift date ${targetDateStr} is ${nonWorkingReason}. Skipping setup.`);
            return;
        }

        const startOfDay = new Date(shiftDateObj); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(shiftDateObj); endOfDay.setHours(23, 59, 59, 999);

        // 3. Find Users for this Shift
        const query = { status: 'ACTIVE', role: { $ne: 'ADMIN' } };
        if (shiftType === 'DAY') {
            query.$or = [{ shiftType: 'DAY' }, { shiftType: null }, { shiftType: { $exists: false } }];
        } else {
            query.shiftType = shiftType;
        }

        const users = await User.find(query).select('_id name joiningDate');
        const userIds = users.map(u => u._id);

        // 4. Fetch existing records to prevent duplicates
        const existingAttendances = await Attendance.find({ date: targetDateStr, userId: { $in: userIds } });
        
        let todayLeaves = [], todayWfh = [];
        if (Leave) todayLeaves = await Leave.find({ userId: { $in: userIds }, status: 'Approved', fromDate: { $lte: endOfDay }, toDate: { $gte: startOfDay } });
        if (Wfh) todayWfh = await Wfh.find({ userId: { $in: userIds }, status: 'Approved', fromDate: { $lte: endOfDay }, toDate: { $gte: startOfDay } });

        let createdCount = 0;
        let notJoinedYet = 0;
        const failures = [];

        // 5. Generate Records
        for (const user of users) {
            if (user.joiningDate && shiftDateObj < new Date(new Date(user.joiningDate).setHours(0,0,0,0))) {
                notJoinedYet++;
                continue;
            }

            const recordExists = existingAttendances.some(a => a.userId.toString() === user._id.toString());

            if (!recordExists) {
                const isOnLeave = todayLeaves.some(l => l.userId.toString() === user._id.toString());
                const isOnWfh = todayWfh.some(w => w.userId.toString() === user._id.toString());

                let finalStatus = 'Pending';
                let finalNote = 'Shift Scheduled';

                if (isOnLeave) { finalStatus = 'On Leave'; finalNote = 'Approved Leave'; }
                else if (isOnWfh) { finalStatus = 'WFH'; finalNote = 'Approved WFH'; }

                // Isolate each employee. A single bad row (validation error, a
                // duplicate racing with a punch) used to throw out of this loop
                // and leave everyone after it with no attendance record at all.
                try {
                    await Attendance.create({
                        userId: user._id,
                        date: targetDateStr,
                        status: finalStatus,
                        note: finalNote,
                        totalHours: 0
                    });
                    createdCount++;
                } catch (rowErr) {
                    failures.push(`${user.name}: ${rowErr.message}`);
                }
            }
        }
        // Coverage is the thing worth watching. A run that quietly produces 8
        // rows instead of 52 is what left two days of August blank, and nothing
        // in the log said so at the time.
        const expected = users.length - notJoinedYet;
        const covered = existingAttendances.length + createdCount;
        console.log(`[CRON - MORNING] ${shiftType} ${targetDateStr}: ${expected} employee(s) due,` +
            ` ${existingAttendances.length} already had a row, ${createdCount} created,` +
            ` ${failures.length} failed, ${notJoinedYet} not joined yet.`);

        if (failures.length) {
            console.error(`[CRON - MORNING] ${shiftType} skipped ${failures.length} employee(s):`);
            failures.forEach(f => console.error(`   - ${f}`));
        }
        if (covered < expected) {
            console.error(`[CRON - MORNING] *** ${shiftType} ${targetDateStr} COVERED ONLY ${covered}/${expected}` +
                ` — ${expected - covered} employee(s) have no attendance row for this day ***`);
        }
    } catch (err) {
        console.error('[CRON - MORNING] Error:', err);
    }
};

// ========================================================
// 🌙 EVENING SWEEP: Converts leftover 'Pending' to 'Absent'
// ========================================================
const sweepEveningAbsentees = async (shiftType) => {
    try {
        console.log(`[CRON - EVENING] Sweeping leftover Pending records for ${shiftType}...`);
        const now = new Date();
        const targetDateStr = getShiftDate(now, shiftType);

        // Re-check the calendar. The day may have become a holiday since the
        // morning setup ran, and those skeletons must not turn into Absent —
        // an Absent row is an unpaid day in payroll. Drop them instead, so the
        // holiday ends up looking like a Sunday: no attendance rows at all.
        const nonWorkingReason = await getNonWorkingReason(parseShiftDate(targetDateStr));
        if (nonWorkingReason) {
            const cleared = await Attendance.deleteMany({ date: targetDateStr, status: 'Pending' });
            console.log(`[CRON - EVENING] ${targetDateStr} is ${nonWorkingReason}. Removed ${cleared.deletedCount} leftover skeleton(s); nobody marked Absent.`);
            return;
        }

        // Backstop. The sweep can only flip rows that already exist, so anything
        // the morning run missed — a crash, a server restart over 7 AM, an
        // account created later in the day — would otherwise leave the day blank
        // for ever rather than absent. Re-running the setup here is safe:
        // employees who already have a row are skipped, and it is the same code
        // path, so a day is either covered by the morning or by the evening.
        await setupMorningRecords(shiftType);

        // This single line replaces all the heavy math we used to do!
        const result = await Attendance.updateMany(
            { date: targetDateStr, status: 'Pending' },
            { 
                $set: { 
                    status: 'Absent', 
                    note: 'Auto-marked Absent (No punch detected)' 
                } 
            }
        );

        console.log(`[CRON - EVENING] ${shiftType} Complete. Marked ${result.modifiedCount} employees Absent.`);
    } catch (err) {
        console.error('[CRON - EVENING] Error:', err);
    }
};

// --- SCHEDULES ---
// DAY SHIFT (Starts ~9:30 AM | Ends ~6:00 PM)
cron.schedule('0 7 * * 1-6', () => setupMorningRecords('DAY'));    
cron.schedule('0 20 * * 1-6', () => sweepEveningAbsentees('DAY')); // 8:00 PM

// NIGHT SHIFT (Starts ~7:30 PM | Ends ~4:00 AM next day)
cron.schedule('0 17 * * 1-6', () => setupMorningRecords('NIGHT')); // 5:00 PM
cron.schedule('0 8 * * 1-6', () => sweepEveningAbsentees('NIGHT'));// 8:00 AM (Runs the next morning to sweep)
// setupMorningRecords('DAY');   // TEMP: Force run this once right now to populate today's missing data

module.exports = { setupMorningRecords, sweepEveningAbsentees };