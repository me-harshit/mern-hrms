const mongoose = require('mongoose');
const fs = require('fs');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User'); 

// --- HELPER FUNCTIONS FOR MISSING COLUMNS ---
// These ensure the script doesn't crash if a column is missing from the CSV
const safeString = (val) => val ? String(val).trim() : "";
const safeNumber = (val, defaultVal) => (val && !isNaN(val)) ? Number(val) : defaultVal;
const safeBoolean = (val) => val ? String(val).trim().toLowerCase() === 'true' : false;

const importUsers = async () => {
    const filePath = process.argv[2];
    
    if (!filePath || !filePath.endsWith('.csv')) {
        console.error('❌ Please provide a valid path to a .csv file.');
        console.log('👉 Usage: node scripts/AddUsers.js path/to/users.csv');
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');
        console.log(`📂 Reading CSV file: ${filePath}...`);

        const rawData = [];

        // 1. Stream and Parse the CSV File
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (row) => rawData.push(row))
                .on('end', resolve)
                .on('error', reject);
        });

        console.log(`📊 Found ${rawData.length} rows. Starting import...\n`);

        let successCount = 0;
        let skipCount = 0;

        // 2. Loop through each row
        for (const row of rawData) {
            const name = safeString(row.name);
            const email = safeString(row.email).toLowerCase();
            const employeeId = safeString(row.employeeId);

            // Skip if core data is missing
            if (!name || !email) {
                console.log(`⚠️ Skipped row: Missing Name or Email.`);
                skipCount++;
                continue;
            }

            // 3. Duplicate Check: Look for existing Email OR existing Employee ID
            const query = [{ email: email }];
            if (employeeId) {
                query.push({ employeeId: employeeId });
            }

            const existingUser = await User.findOne({ $or: query });
            
            if (existingUser) {
                const conflictType = existingUser.email === email ? 'Email' : 'Employee ID';
                console.log(`⏭️ Skipped ${name}: ${conflictType} already exists in database.`);
                skipCount++;
                continue;
            }

            // 4. Hash Password
            const plainPassword = safeString(row.password) || '1234';
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(plainPassword, salt);

            // 5. Build User Object (Safely handling missing columns)
            const newUser = new User({
                employeeId: employeeId,
                name: name,
                email: email,
                password: hashedPassword,
                role: safeString(row.role) || 'EMPLOYEE',
                isPurchaser: safeBoolean(row.isPurchaser),
                phoneNumber: safeString(row.phoneNumber),
                address: safeString(row.address),
                aadhaar: safeString(row.aadhaar),
                emergencyContact: safeString(row.emergencyContact),
                reportingManagerName: safeString(row.reportingManagerName),
                reportingManagerEmail: safeString(row.reportingManagerEmail).toLowerCase(),
                salary: safeNumber(row.salary, 0),
                casualLeaveBalance: safeNumber(row.casualLeaveBalance, 1),
                earnedLeaveBalance: safeNumber(row.earnedLeaveBalance, 0)
            });

            await newUser.save();
            console.log(`✅ Added: ${name} (${email})`);
            successCount++;
        }

        console.log('\n====================================');
        console.log(`🎉 CSV Import Complete!`);
        console.log(`✅ Successfully added: ${successCount}`);
        console.log(`⏭️ Skipped duplicates: ${skipCount}`);
        console.log('====================================\n');

    } catch (error) {
        console.error('❌ Error during import:', error.message);
    } finally {
        mongoose.connection.close();
        process.exit(0);
    }
};

importUsers();