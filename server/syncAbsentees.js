require('dotenv').config();
const mongoose = require('mongoose');

const User = require('./models/User');
const Attendance = require('./models/Attendance');

let Leave = null, Wfh = null;
try { Leave = require('./models/Leave'); } catch (e) {}
try { Wfh = require('./models/Wfh'); } catch (e) {}

const formatToDBDate = (dateObj) => `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;

const runSync = async () => {
    const inputDate = process.argv[2]; 

    if (!inputDate) {
        console.error("❌ Please provide a date. Example: node syncAbsentees.js 2026-04-01");
        process.exit(1);
    }

    const targetDateObj = new Date(inputDate);
    const startOfDay = new Date(targetDateObj); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDateObj); endOfDay.setHours(23, 59, 59, 999);

    if (isNaN(targetDateObj.getTime())) {
        console.error("❌ Invalid date format. Use YYYY-MM-DD.");
        process.exit(1);
    }

    if (targetDateObj.getDay() === 0) {
        console.log(`[INFO] ${inputDate} is a Sunday. Skipping.`);
        process.exit(0);
    }

    const targetDateStr = formatToDBDate(targetDateObj);
    console.log(`\n🚀 [START] Syncing statuses for Date: ${targetDateStr}...`);

    try {
        if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to Database.");

        const employees = await User.find({ status: 'ACTIVE', role: { $ne: 'ADMIN' } }).select('_id name employeeId joiningDate');
        const employeeIds = employees.map(emp => emp._id);

        const attendances = await Attendance.find({ date: targetDateStr, userId: { $in: employeeIds } });

        let leaves = [], wfhs = [];
        if (Leave) {
            leaves = await Leave.find({
                status: 'Approved', userId: { $in: employeeIds },
                fromDate: { $lte: endOfDay }, toDate: { $gte: startOfDay }
            });
        }
        if (Wfh) {
            wfhs = await Wfh.find({
                status: 'Approved', userId: { $in: employeeIds },
                fromDate: { $lte: endOfDay }, toDate: { $gte: startOfDay }
            });
        }

        let stats = { Absent: 0, Leave: 0, WFH: 0 };

        for (const emp of employees) {
            if (emp.joiningDate && targetDateObj < new Date(new Date(emp.joiningDate).setHours(0,0,0,0))) continue;

            const hasPunched = attendances.some(a => a.userId.toString() === emp._id.toString());
            
            if (!hasPunched) {
                const isOnLeave = leaves.some(l => l.userId.toString() === emp._id.toString());
                const isOnWfh = wfhs.some(w => w.userId.toString() === emp._id.toString());

                let finalStatus = 'Absent';
                let finalNote = 'Manual Script Sync (No punch detected)';

                if (isOnLeave) {
                    finalStatus = 'On Leave';
                    finalNote = 'Approved Leave';
                    stats.Leave++;
                } else if (isOnWfh) {
                    finalStatus = 'WFH';
                    finalNote = 'Approved WFH (No punch detected)';
                    stats.WFH++;
                } else {
                    stats.Absent++;
                }

                await Attendance.create({
                    userId: emp._id, date: targetDateStr, status: finalStatus,
                    note: finalNote, totalHours: 0
                });
                
                let color = finalStatus === 'Absent' ? '🔴' : finalStatus === 'WFH' ? '🔵' : '🟢';
                console.log(`   ${color} Logged ${finalStatus}: ${emp.name}`);
            }
        }

        console.log(`\n🎉 [SUCCESS] Finished! Added: ${stats.Absent} Absences | ${stats.WFH} WFH | ${stats.Leave} Leaves.`);
        process.exit(0);

    } catch (err) {
        console.error("\n❌ [ERROR]", err.message);
        process.exit(1);
    }
};

runSync();