const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
let Leave = null;
try {
    Leave = require('../models/Leave');
} catch (e) {}

// Helper: Calculate shift date (same as your attendance.js)
const getShiftDate = (punchTime, shiftType) => {
    const d = new Date(punchTime);
    if (shiftType === 'NIGHT' && d.getHours() < 14) {
        d.setDate(d.getDate() - 1);
    }
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

// Core Engine to check and mark absences
const markAbsentees = async (shiftType) => {
    try {
        console.log(`[CRON] Starting Auto-Absent Check for ${shiftType} shift...`);
        const now = new Date();

        // 1. Skip Sundays (0 = Sunday)
        if (now.getDay() === 0) {
            console.log('[CRON] Today is Sunday. Skipping auto-absent check.');
            return;
        }

        const targetDateStr = getShiftDate(now, shiftType);

        // 2. Find all active employees/HR/Managers of this shift type (Exclude ADMIN)
        const query = { 
            status: 'ACTIVE', 
            role: { $ne: 'ADMIN' } 
        };
        
        if (shiftType === 'DAY') {
            query.$or = [{ shiftType: 'DAY' }, { shiftType: null }, { shiftType: { $exists: false } }];
        } else {
            query.shiftType = shiftType;
        }

        const users = await User.find(query).select('_id name joiningDate');

        // 3. Fetch today's attendance and active leaves
        const userIds = users.map(u => u._id);
        const todayAttendances = await Attendance.find({ date: targetDateStr, userId: { $in: userIds } });
        
        let todayLeaves = [];
        if (Leave) {
            todayLeaves = await Leave.find({
                userId: { $in: userIds },
                status: 'Approved',
                fromDate: { $lte: now },
                toDate: { $gte: new Date(now.setHours(0,0,0,0)) }
            });
        }

        let absentCount = 0;

        // 4. Check each user
        for (const user of users) {
            // Skip if they joined after today
            if (user.joiningDate) {
                const [d, m, y] = targetDateStr.split('/').map(Number);
                const checkDateForJoin = new Date(y, m - 1, d);
                const joinDate = new Date(user.joiningDate);
                joinDate.setHours(0, 0, 0, 0);
                if (checkDateForJoin < joinDate) continue;
            }

            const hasPunched = todayAttendances.some(a => a.userId.toString() === user._id.toString());
            
            if (!hasPunched) {
                // Check if they are on leave
                const isOnLeave = todayLeaves.some(l => l.userId.toString() === user._id.toString());
                
                // If not on leave, insert an Absent record!
                if (!isOnLeave) {
                    await Attendance.create({
                        userId: user._id,
                        date: targetDateStr,
                        status: 'Absent',
                        note: 'Auto-marked by system (No punch detected)',
                        totalHours: 0
                    });
                    absentCount++;
                }
            }
        }

        console.log(`[CRON] ${shiftType} Check Complete. Marked ${absentCount} users as Absent.`);

    } catch (err) {
        console.error('[CRON] Error marking absentees:', err);
    }
};

// ========================================================
// ⏰ SCHEDULE THE JOBS
// ========================================================

// Run Every Day at 20:00 (8:00 PM) for DAY Shift employees
cron.schedule('0 20 * * 1-6', () => {
    markAbsentees('DAY');
});

// Run Every Day at 08:00 (8:00 AM) for NIGHT Shift employees
cron.schedule('0 8 * * 1-6', () => {
    markAbsentees('NIGHT');
});

module.exports = { markAbsentees };