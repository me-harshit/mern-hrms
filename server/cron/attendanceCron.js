const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');

let Leave = null;
let Wfh = null;
try { Leave = require('../models/Leave'); } catch (e) {}
try { Wfh = require('../models/Wfh'); } catch (e) {}

// Helper: Calculate shift date
const getShiftDate = (punchTime, shiftType) => {
    const d = new Date(punchTime);
    if (shiftType === 'NIGHT' && d.getHours() < 14) {
        d.setDate(d.getDate() - 1);
    }
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

// Core Engine to check and mark statuses
const markAbsentees = async (shiftType) => {
    try {
        console.log(`[CRON] Starting Daily Status Check for ${shiftType} shift...`);
        const now = new Date();

        // 1. Skip Sundays (0 = Sunday)
        if (now.getDay() === 0) {
            console.log('[CRON] Today is Sunday. Skipping auto-check.');
            return;
        }

        const targetDateStr = getShiftDate(now, shiftType);
        const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

        // 2. Find all active employees/HR/Managers of this shift type (Exclude ADMIN)
        const query = { status: 'ACTIVE', role: { $ne: 'ADMIN' } };
        if (shiftType === 'DAY') {
            query.$or = [{ shiftType: 'DAY' }, { shiftType: null }, { shiftType: { $exists: false } }];
        } else {
            query.shiftType = shiftType;
        }

        const users = await User.find(query).select('_id name joiningDate');
        const userIds = users.map(u => u._id);

        // 3. Fetch today's Attendances, Leaves, and WFHs
        const todayAttendances = await Attendance.find({ date: targetDateStr, userId: { $in: userIds } });
        
        let todayLeaves = [];
        if (Leave) {
            todayLeaves = await Leave.find({
                userId: { $in: userIds }, status: 'Approved',
                fromDate: { $lte: endOfDay }, toDate: { $gte: startOfDay }
            });
        }

        let todayWfh = [];
        if (Wfh) {
            todayWfh = await Wfh.find({
                userId: { $in: userIds }, status: 'Approved',
                fromDate: { $lte: endOfDay }, toDate: { $gte: startOfDay }
            });
        }

        let markedLeave = 0, markedWfh = 0, markedAbsent = 0;

        // 4. Check each user
        for (const user of users) {
            if (user.joiningDate) {
                const [d, m, y] = targetDateStr.split('/').map(Number);
                if (new Date(y, m - 1, d) < new Date(new Date(user.joiningDate).setHours(0,0,0,0))) continue;
            }

            const hasPunched = todayAttendances.some(a => a.userId.toString() === user._id.toString());
            
            if (!hasPunched) {
                const isOnLeave = todayLeaves.some(l => l.userId.toString() === user._id.toString());
                const isOnWfh = todayWfh.some(w => w.userId.toString() === user._id.toString());

                let finalStatus = 'Absent';
                let finalNote = 'Auto-marked by system (No punch detected)';

                if (isOnLeave) {
                    finalStatus = 'On Leave';
                    finalNote = 'Approved Leave';
                    markedLeave++;
                } else if (isOnWfh) {
                    finalStatus = 'WFH';
                    finalNote = 'Approved WFH (No punch detected)';
                    markedWfh++;
                } else {
                    markedAbsent++;
                }

                await Attendance.create({
                    userId: user._id,
                    date: targetDateStr,
                    status: finalStatus,
                    note: finalNote,
                    totalHours: 0
                });
            }
        }

        console.log(`[CRON] ${shiftType} Complete. Absences: ${markedAbsent} | WFH: ${markedWfh} | Leaves: ${markedLeave}`);

    } catch (err) {
        console.error('[CRON] Error marking statuses:', err);
    }
};

// Run Every Day at 20:00 (8:00 PM) for DAY Shift employees
cron.schedule('0 20 * * 1-6', () => markAbsentees('DAY'));

// Run Every Day at 08:00 (8:00 AM) for NIGHT Shift employees
cron.schedule('0 8 * * 1-6', () => markAbsentees('NIGHT'));

module.exports = { markAbsentees };