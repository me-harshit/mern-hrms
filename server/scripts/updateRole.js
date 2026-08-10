require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const user = await User.findOne({email: 'kaumoodi2@gmail.com'});
    console.log("Old Role:", user.role);
    user.role = 'HR';
    await user.save();
    console.log("Updated Role:", user.role);
    process.exit(0);
});
