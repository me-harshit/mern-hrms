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

        // 1. Skip Sundays
        if (shiftDateObj.getDay() === 0) {
            console.log(`[CRON] Shift date ${targetDateStr} is Sunday. Skipping setup.`);
            return;
        }

        const startOfDay = new Date(shiftDateObj); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(shiftDateObj); endOfDay.setHours(23, 59, 59, 999);

        // 2. Skip Official Holidays
        if (Holiday) {
            const todayHoliday = await Holiday.findOne({ date: { $gte: startOfDay, $lte: endOfDay } });
            if (todayHoliday) {
                console.log(`[CRON] Shift date ${targetDateStr} is a Holiday. Skipping setup.`);
                return;
            }
        }

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

        // 5. Generate Records
        for (const user of users) {
            if (user.joiningDate && shiftDateObj < new Date(new Date(user.joiningDate).setHours(0,0,0,0))) continue;

            const recordExists = existingAttendances.some(a => a.userId.toString() === user._id.toString());
            
            if (!recordExists) {
                const isOnLeave = todayLeaves.some(l => l.userId.toString() === user._id.toString());
                const isOnWfh = todayWfh.some(w => w.userId.toString() === user._id.toString());

                let finalStatus = 'Pending';
                let finalNote = 'Shift Scheduled';

                if (isOnLeave) { finalStatus = 'On Leave'; finalNote = 'Approved Leave'; } 
                else if (isOnWfh) { finalStatus = 'WFH'; finalNote = 'Approved WFH'; }

                await Attendance.create({
                    userId: user._id,
                    date: targetDateStr,
                    status: finalStatus,
                    note: finalNote,
                    totalHours: 0
                });
                createdCount++;
            }
        }
        console.log(`[CRON - MORNING] ${shiftType} Complete. Created ${createdCount} skeleton records.`);
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