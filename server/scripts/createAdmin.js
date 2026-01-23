const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');

async function createAdmin() {
    await mongoose.connect(process.env.MONGO_URI);

    const existingAdmin = await User.findOne({ role: 'ADMIN' });
    if (existingAdmin) {
        console.log('Admin already exists');
        process.exit(0);
    }

    const hashedPassword = await bcrypt.hash('1234', 10);

    const admin = new User({
        name: 'Super Admin',
        email: 'admin@gts.ai',
        password: hashedPassword,
        role: 'ADMIN'
    });

    await admin.save();
    console.log('Admin user created successfully');
    process.exit(0);
}

createAdmin().catch(err => {
    console.error(err);
    process.exit(1);
});
