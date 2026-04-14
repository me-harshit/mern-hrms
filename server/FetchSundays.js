require('dotenv').config();
const mongoose = require('mongoose');

// Models
const AttendanceLog = require('./models/AttendanceLog');
const User = require('./models/User');

const fetchRawSundays = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ MongoDB Connected successfully.\n');

        // The exact string formats saved by your webhook
        const sundayDates = ['5/4/2026', '12/4/2026'];

        console.log(`🔍 Searching RAW PUNCHES (AttendanceLog) for: ${sundayDates.join(' and ')}`);

        // Fetch the raw logs
        const rawLogs = await AttendanceLog.find({
            shiftDate: { $in: sundayDates }
        })
        .populate('userId', 'name employeeId')
        .sort({ timestamp: 1 }); // Sort chronologically

        if (rawLogs.length === 0) {
            console.log(`\n⚠️ NO RAW PUNCHES FOUND.`);
            console.log(`Conclusion: The biometric machine truly did not send any data on these Sundays (or the internet was down).`);
        } else {
            console.log(`\n📋 Found ${rawLogs.length} raw punch(es)!\n`);

            // Group the punches by Employee and Date to make it readable
            const groupedPunches = {};
            
            rawLogs.forEach(log => {
                const name = log.userId?.name || 'Unknown User';
                const empId = log.userId?.employeeId || log.employeeId || 'N/A';
                const dateKey = `${name} (ID: ${empId}) | Date: ${log.shiftDate}`;

                if (!groupedPunches[dateKey]) {
                    groupedPunches[dateKey] = [];
                }

                // Format the exact time
                const time = new Date(log.timestamp).toLocaleTimeString('en-IN', { 
                    hour: '2-digit', minute: '2-digit', second: '2-digit' 
                });

                groupedPunches[dateKey].push(`[${log.direction}] at ${time} (Device: ${log.deviceId})`);
            });

            // Print the grouped results
            let counter = 1;
            for (const [employeeInfo, punches] of Object.entries(groupedPunches)) {
                console.log(`${counter}. ${employeeInfo}`);
                punches.forEach(punch => console.log(`   -> ${punch}`));
                console.log('--------------------------------------------------');
                counter++;
            }
            
            console.log(`\n💡 Conclusion: The machine IS sending data, but the Webhook logic might be ignoring Sunday punches!`);
        }

    } catch (error) {
        console.error('❌ Error during script execution:', error);
    } finally {
        mongoose.connection.close();
        console.log('\n🔌 Database connection closed.');
        process.exit(0);
    }
};

fetchRawSundays();