require('dotenv').config();
const sendEmail = require('./utils/sendEmail');

const runTest = async () => {
    console.log("Testing email connection with real-world content...");
    
    await sendEmail({
        email: "deadshotdaddy07@gmail.com", 
        subject: "Leave Application Approved - HR Department",
        message: `
            <h3>Leave Application Status</h3>
            <p>Dear Employee,</p>
            <p>Your recent leave application has been formally approved by the HR department. Please ensure all pending tasks are handed over to your team members before your departure.</p>
            <br>
            <p>If you have any questions, please contact the HR desk.</p>
            <br>
            <p>Best Regards,</p>
            <p><strong>GTS HRMS Administration</strong></p>
            <p>hrm@gts.ai</p>
        `
    });

    console.log("Test finished.");
    process.exit();
};

runTest();