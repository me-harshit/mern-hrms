require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    try {
        await User.deleteMany({ email: { $in: ['testadmin@gts.ai', 'testuser@gts.ai'] } });
        
        const password = await bcrypt.hash('password123', 10);
        
        const admin = await User.create({ 
            name: 'Test Admin', 
            email: 'testadmin@gts.ai', 
            password, 
            role: 'ADMIN', 
            employeeId: 'TEST-A-01', 
            phone: '1234567890',
            casualLeaveBalance: 20,
            earnedLeaveBalance: 20
        }); 
        
        const user = await User.create({ 
            name: 'Test User', 
            email: 'testuser@gts.ai', 
            password, 
            role: 'EMPLOYEE', 
            employeeId: 'TEST-U-01', 
            phone: '0987654321', 
            reportingManagerEmail: 'testadmin@gts.ai',
            casualLeaveBalance: 20,
            earnedLeaveBalance: 20
        }); 
        
        console.log('Test Admin & Test User created successfully');
        process.exit(0);
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
});
