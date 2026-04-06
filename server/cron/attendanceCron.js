const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');

// Gracefully load optional models
let Leave = null, Wfh = null, Holiday = null;
try { Leave = require('../models/Leave'); } catch (e) {}
try { Wfh = require('../models/Wfh'); } catch (e) {}
try { Holiday = require('../models/Holiday'); } catch (e) {}

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
        const targetDateStr = getShiftDate(now, shiftType);
        
        // Parse the exact shift date to ensure Night Shifts are checked correctly
        const [d, m, y] = targetDateStr.split('/').map(Number);
        const shiftDateObj = new Date(y, m - 1, d);

        // 1. Skip Sundays (0 = Sunday) based on the SHIFT date, not execution date
        if (shiftDateObj.getDay() === 0) {
            console.log(`[CRON] Shift date ${targetDateStr} is a Sunday. Skipping auto-check.`);
            return;
        }

        const startOfDay = new Date(shiftDateObj); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(shiftDateObj); endOfDay.setHours(23, 59, 59, 999);

        // 2. Skip Official Holidays
        if (Holiday) {
            const todayHoliday = await Holiday.findOne({
                date: { $gte: startOfDay, $lte: endOfDay }
            });
            if (todayHoliday) {
                console.log(`[CRON] Shift date ${targetDateStr} is a Holiday (${todayHoliday.name}). Skipping auto-check.`);
                return;
            }
        }

        // 3. Find all active employees/HR/Managers of this shift type (Exclude ADMIN)
        const query = { status: 'ACTIVE', role: { $ne: 'ADMIN' } };
        if (shiftType === 'DAY') {
            query.$or = [{ shiftType: 'DAY' }, { shiftType: null }, { shiftType: { $exists: false } }];
        } else {
            query.shiftType = shiftType;
        }

        const users = await User.find(query).select('_id name joiningDate');
        const userIds = users.map(u => u._id);

        // 4. Fetch today's Attendances, Leaves, and WFHs
        const todayAttendances = await Attendance.find({ date: targetDateStr, userId: { $in: userIds } });
        
        let todayLeaves = [], todayWfh = [];
        if (Leave) {
            todayLeaves = await Leave.find({
                userId: { $in: userIds }, status: 'Approved',
                fromDate: { $lte: endOfDay }, toDate: { $gte: startOfDay }
            });
        }
        if (Wfh) {
            todayWfh = await Wfh.find({
                userId: { $in: userIds }, status: 'Approved',
                fromDate: { $lte: endOfDay }, toDate: { $gte: startOfDay }
            });
        }

        let markedLeave = 0, markedWfh = 0, markedAbsent = 0;

        // 5. Check each user
        for (const user of users) {
            if (user.joiningDate) {
                const joinDate = new Date(user.joiningDate);
                joinDate.setHours(0, 0, 0, 0);
                if (shiftDateObj < joinDate) continue;
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