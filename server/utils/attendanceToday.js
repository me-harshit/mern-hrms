const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Wfh = require('../models/Wfh');
const Settings = require('../models/Settings');

/**
 * The attendance day a punch belongs to. A night shift that starts on Monday
 * evening and ends Tuesday morning is all filed under Monday, so anything
 * punched before 14:00 belongs to the previous calendar day.
 */
const getShiftDate = (punchTime, shiftType) => {
    const d = new Date(punchTime);
    if (shiftType === 'NIGHT') {
        if (d.getHours() < 14) {
            d.setDate(d.getDate() - 1);
        }
    }
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

/**
 * Which of these employees is not at work today, and why.
 *
 * The rule is the one /attendance/absent already applies, so the two screens
 * cannot disagree about who is in: **a check-in is the whole test**. Someone
 * who punched in is at work even if they also hold a half-day leave — they
 * turned up. Leave and WFH are read from their own collections rather than
 * from the attendance row, because the row is written by a cron that can miss
 * people, and a missing row would otherwise report someone on approved leave
 * as a plain no-show.
 *
 * Two guards keep this from reporting the whole company as absent:
 *
 *   - Nobody is absent before their shift has started. At 08:00 nobody has
 *     punched in yet, and calling the entire roster absent would be worse
 *     than saying nothing. Each shift is judged against its own start time.
 *   - Anyone whose joining date is still in the future is not expected today
 *     at all, and is reported as such rather than as a no-show.
 *
 * Shifts are handled per employee rather than per request, because a mixed
 * roster has both on it at once and they roll over on different clocks.
 *
 * @param  {Array} employees  objects carrying _id, and optionally shiftType
 *                            and joiningDate
 * @return {Map}   userId (string) -> reason string, for absent people only.
 *                 Anyone at work today is simply absent from the map.
 */
const getAbsentToday = async (employees) => {
    const absent = new Map();
    if (!employees || employees.length === 0) return absent;

    const settings = (await Settings.findOne()) || {};
    const now = new Date();

    // Group by shift so each is measured against its own start time and date.
    const byShift = { DAY: [], NIGHT: [] };
    employees.forEach(e => {
        byShift[e.shiftType === 'NIGHT' ? 'NIGHT' : 'DAY'].push(e);
    });

    for (const shift of ['DAY', 'NIGHT']) {
        const group = byShift[shift];
        if (group.length === 0) continue;

        const shiftDateStr = getShiftDate(now, shift);
        const startStr = shift === 'NIGHT'
            ? (settings.nightShiftStartTime || '19:30')
            : (settings.dayShiftStartTime || '09:30');

        const [startHour, startMin] = startStr.split(':').map(Number);
        const [dd, mm, yyyy] = shiftDateStr.split('/').map(Number);
        const shiftStartAt = new Date(yyyy, mm - 1, dd, startHour, startMin, 0, 0);

        // Before the shift begins nobody is late, let alone absent.
        if (now < shiftStartAt) continue;

        const ids = group.map(e => e._id);
        const shiftDateObj = new Date(yyyy, mm - 1, dd);
        const startOfDay = new Date(shiftDateObj); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(shiftDateObj); endOfDay.setHours(23, 59, 59, 999);
        const overlapsDate = {
            userId: { $in: ids }, status: 'Approved',
            fromDate: { $lte: endOfDay }, toDate: { $gte: startOfDay }
        };

        const [records, leaves, wfhs] = await Promise.all([
            Attendance.find({ userId: { $in: ids }, date: shiftDateStr })
                .select('userId status checkIn').lean(),
            Leave.find(overlapsDate).select('userId leaveType').lean(),
            Wfh.find(overlapsDate).select('userId').lean()
        ]);

        const recordByUser = new Map(records.map(r => [r.userId.toString(), r]));
        const leaveByUser = new Map(leaves.map(l => [l.userId.toString(), l.leaveType]));
        const wfhUsers = new Set(wfhs.map(w => w.userId.toString()));

        for (const emp of group) {
            const uid = emp._id.toString();

            if (emp.joiningDate &&
                shiftDateObj < new Date(new Date(emp.joiningDate).setHours(0, 0, 0, 0))) {
                absent.set(uid, 'Not joined yet');
                continue;
            }

            const record = recordByUser.get(uid);
            if (record && record.checkIn) continue; // turned up

            if (leaveByUser.has(uid)) absent.set(uid, `On Leave (${leaveByUser.get(uid)})`);
            else if (record?.status === 'On Leave') absent.set(uid, 'On Leave');
            else if (wfhUsers.has(uid) || record?.status === 'WFH') absent.set(uid, 'WFH - Not Checked In');
            else absent.set(uid, 'Not Punched In');
        }
    }

    return absent;
};

module.exports = { getShiftDate, getAbsentToday };
