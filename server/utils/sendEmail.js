const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: true,
            // Add these two lines to fix cPanel & IPv6 issues:
            family: 4, // Forces Node to use IPv4 instead of IPv6
            tls: {
                rejectUnauthorized: false // Prevents SSL certificate errors in cPanel
            },
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        const mailOptions = {
            from: `"GTS HRMS" <${process.env.SMTP_USER}>`, // Ensure this matches exactly
            replyTo: process.env.HR_EMAIL || process.env.SMTP_USER, // Adds a trusted reply-to
            to: options.email,
            cc: options.cc || '',
            subject: options.subject,
            // Spam filters penalize HTML-only emails. We add a plain-text version by stripping HTML tags:
            text: options.message.replace(/<[^>]*>?/gm, '').trim(),
            // Wrap your message in a proper HTML document structure
            html: `<!DOCTYPE html>
                   <html>
                     <head><meta charset="UTF-8"></head>
                     <body>
                       ${options.message}
                     </body>
                   </html>`,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully to ${options.email}`);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};

module.exports = sendEmail;