require('dotenv').config(); // Load environment variables (MONGO_URI)
const mongoose = require('mongoose');

// Import your models
const User = require('./models/User');
const Attendance = require('./models/Attendance');
let Leave = null;
try {
    Leave = require('./models/Leave');
} catch (e) {
    console.log("Leave model not found. Proceeding without leave checks.");
}

// Helper: Format standard Date object into your DB format (D/M/YYYY)
const formatToDBDate = (dateObj) => {
    return `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;
};

const runSync = async () => {
    // 1. Get the date argument from the terminal command
    const inputDate = process.argv[2]; // Expected format: YYYY-MM-DD

    if (!inputDate) {
        console.error("❌ Please provide a date in YYYY-MM-DD format.");
        console.error("👉 Example: node syncAbsentees.js 2026-04-01");
        process.exit(1);
    }

    // Parse input date
    const targetDateObj = new Date(inputDate);
    targetDateObj.setHours(0, 0, 0, 0); // Normalize time

    if (isNaN(targetDateObj.getTime())) {
        console.error("❌ Invalid date format. Use YYYY-MM-DD.");
        process.exit(1);
    }

    // 2. Skip Sundays (0 = Sunday)
    if (targetDateObj.getDay() === 0) {
        console.log(`[INFO] ${inputDate} is a Sunday. Skipping absent marking.`);
        process.exit(0);
    }

    const targetDateStr = formatToDBDate(targetDateObj);
    console.log(`\n🚀 [START] Syncing absentees for Date: ${targetDateStr}...`);

    try {
        // Connect to the database
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI is not defined in your .env file");
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to Database.");

        // 3. Get active employees (Exclude Admins)
        const employees = await User.find({ status: 'ACTIVE', role: { $ne: 'ADMIN' } }).select('_id name employeeId joiningDate');
        const employeeIds = employees.map(emp => emp._id);

        console.log(`Found ${employees.length} active employees. Checking records...`);

        // 4. Fetch Attendances for this exact date
        const attendances = await Attendance.find({ 
            date: targetDateStr, 
            userId: { $in: employeeIds } 
        });

        // 5. Fetch Approved Leaves overlapping this date
        let leaves = [];
        if (Leave) {
            // To ensure the day falls within the leave window
            leaves = await Leave.find({
                status: 'Approved',
                userId: { $in: employeeIds },
                fromDate: { $lte: targetDateObj },
                toDate: { $gte: targetDateObj }
            });
        }

        let markedCount = 0;

        // 6. Iterate and Mark
        for (const emp of employees) {
            // Protect against marking new hires absent before they joined
            if (emp.joiningDate) {
                const joinDate = new Date(emp.joiningDate);
                joinDate.setHours(0, 0, 0, 0);
                if (targetDateObj < joinDate) continue; 
            }

            const hasPunched = attendances.some(a => a.userId.toString() === emp._id.toString());
            const isOnLeave = leaves.some(l => l.userId.toString() === emp._id.toString());

            // If no attendance record AND not on leave -> Create Absent Record
            if (!hasPunched && !isOnLeave) {
                await Attendance.create({
                    userId: emp._id,
                    date: targetDateStr,
                    status: 'Absent',
                    note: 'Manual Script Sync (No punch detected)',
                    totalHours: 0
                });
                markedCount++;
                console.log(`   🔴 Marked Absent: ${emp.name} (${emp.employeeId || 'N/A'})`);
            }
        }

        console.log(`\n🎉 [SUCCESS] Script finished. Marked ${markedCount} employees as absent on ${targetDateStr}.`);
        process.exit(0);

    } catch (err) {
        console.error("\n❌ [ERROR] An error occurred:", err.message);
        process.exit(1);
    }
};

runSync();