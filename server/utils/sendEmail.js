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
            /**
             * Spam filters penalize HTML-only emails, so there is always a
             * plain-text part. Stripping the tags is a decent default, but it
             * throws away every href — which on a mail built out of link
             * buttons leaves a text part with no urls at all while the HTML has
             * several. Filters score that mismatch against you.
             *
             * So callers whose mail is mostly links pass their own `text`.
             * Everyone else is unchanged.
             */
            text: options.text || options.message.replace(/<[^>]*>?/gm, '').trim(),
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
        /**
         * Deliberately not "sent successfully".
         *
         * All this proves is that the SMTP relay accepted the message. It can
         * still be deferred, discarded by a router, or bounced afterwards, and
         * none of that is visible from here — which is exactly how a fortnight
         * of mail can vanish while the logs read green.
         */
        console.log(`[MAIL] accepted by relay for ${options.email} (acceptance is not delivery)`);
        // Callers that need to record whether delivery actually happened
        // (e.g. marking a payslip as emailed) check this. Existing callers
        // ignore it, so the previous fire-and-forget behaviour is unchanged.
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

module.exports = sendEmail;