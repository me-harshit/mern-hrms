const sendEmail = require('./sendEmail');

/**
 * The invitation half of Module 2: where a portal link points, and what the
 * vendor actually receives.
 *
 * Kept out of the routes because the link is built in three places - the invite
 * itself, the resend, and the copy-to-clipboard value returned to the inviter -
 * and a link that differs between the email and the copy button is a support
 * call nobody can reproduce.
 */

/**
 * Where the portal lives.
 *
 * APP_BASE_URL is preferred and should be set in production. The fallback reads
 * the request Host, which is what the reverse proxy sets on a real deployment
 * and what makes this work on localhost without configuration - but a Host
 * header is client-controlled, and this url goes out in mail sent from the
 * company's own domain. So the fallback exists for development and says so
 * loudly, rather than being a silent default in production.
 */
const baseUrl = (req) => {
    const configured = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
    if (configured) return configured;

    if (process.env.NODE_ENV === 'production') {
        console.warn(
            '[EXTERNAL] APP_BASE_URL is not set. Invite links are being built from the '
            + 'request Host header, which is client-controlled. Set APP_BASE_URL in .env.'
        );
    }
    return `${req.protocol}://${req.get('host')}`;
};

const portalLink = (req, token) => `${baseUrl(req)}/portal/${token}`;

/**
 * The invite email (F2.1).
 *
 * Takes the ExternalUser rather than the membership: the name and address are
 * facts about the person, and reading them off the membership was what let one
 * human end up with two spellings of their own name in two groups.
 *
 * Sends its own plain-text part. sendEmail's default strips tags, which on a
 * mail whose entire purpose is one link would produce a text alternative with
 * no url in it at all - and filters score that mismatch against the sender.
 */
const sendInviteEmail = async ({
    person, link, code, inviterName, groupName, projectName, expiresAt, note
}) => {
    const expiry = new Date(expiresAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    const where = projectName ? `${groupName} (${projectName})` : groupName;

    const codeBlock = code ? `
        <p style="color:#334155;font-size:15px;margin:22px 0 8px;">
            You will be asked for this verification code:
        </p>
        <div style="font-size:30px;font-weight:700;letter-spacing:9px;color:#0f172a;background:#f1f5f9;padding:16px;text-align:center;border-radius:10px;">
            ${code}
        </div>` : '';

    const noteBlock = note ? `
        <div style="background:#f8fafc;border-left:3px solid #215D7B;padding:12px 14px;margin:20px 0;color:#334155;font-size:14px;">
            ${String(note).replace(/</g, '&lt;')}
        </div>` : '';

    const message = `
        <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:auto;padding:30px;border:1px solid #e2e8f0;border-radius:12px;">
            <h2 style="color:#215D7B;margin-top:0;">You have been invited to a conversation</h2>
            <p style="color:#334155;font-size:15px;">Hi ${person.name},</p>
            <p style="color:#334155;font-size:15px;">
                <strong>${inviterName}</strong> has invited you to join
                <strong>${where}</strong> to discuss work directly with the team.
            </p>
            ${noteBlock}
            <div style="text-align:center;margin:26px 0;">
                <a href="${link}" style="display:inline-block;background:#215D7B;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 30px;border-radius:9px;">
                    Open the conversation
                </a>
            </div>
            ${codeBlock}
            <p style="color:#64748b;font-size:13.5px;">
                There is no account to create and no password to remember - the link opens
                the conversation directly. It works until <strong>${expiry}</strong>.
            </p>
            <p style="color:#64748b;font-size:13.5px;">
                You will only be able to see this one conversation. If you were not expecting
                this invitation, you can ignore this email.
            </p>
            <p style="color:#94a3b8;font-size:12px;word-break:break-all;margin-top:22px;">
                If the button does not work, paste this into your browser:<br>${link}
            </p>
        </div>
    `;

    const text = [
        `Hi ${person.name},`,
        '',
        `${inviterName} has invited you to join "${where}" to discuss work directly with the team.`,
        note ? `\n${note}\n` : '',
        `Open the conversation: ${link}`,
        code ? `\nYour verification code is ${code}.` : '',
        '',
        `There is no account to create and no password to remember. The link works until ${expiry}.`,
        'You will only be able to see this one conversation.'
    ].filter(Boolean).join('\n');

    return sendEmail({
        email: person.email,
        subject: `${inviterName} invited you to ${groupName}`,
        message,
        text
    });
};

module.exports = { baseUrl, portalLink, sendInviteEmail };
