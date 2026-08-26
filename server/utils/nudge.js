const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const Nudge = require('../models/Nudge');
const User = require('../models/User');
const Notification = require('../models/Notification');
const sendEmail = require('./sendEmail');
const whatsapp = require('../services/whatsapp.service');
const { emitToUser, emitToTask } = require('./realtime');
const { IS_PRIVILEGED, getTaskVisibilityFilter } = require('./taskScoping');
const { todayIST, addDays } = require('./recurringSchedule');
const { istWallClockToUTC } = require('./taskOverdue');

/**
 * The nudge engine — everything between "someone pressed Nudge" and "the
 * employee's phone buzzed".
 *
 * Lives here rather than in routes/tasks.js for the same reason taskDiscussion
 * does: a recurring schedule can be nudged about too, and the rules for who may
 * ask, what the message says, and how an answer is recorded must not exist in
 * two copies that drift.
 */

// ---------------------------------------------------------------------------
// ETA presets
// ---------------------------------------------------------------------------

/**
 * The quick answers, offered identically in the app, in the email, and later
 * over WhatsApp.
 *
 * Presets rather than a free-text box as the primary answer because the point
 * of a nudge is an answer in one tap, from a phone, without logging in. The
 * exact-time input is still there for anyone who wants it.
 *
 * `at` returns the instant the preset means, computed in IST — the whole app
 * treats IST as the working timezone (see taskOverdue.js), and "by end of day"
 * resolving to whatever midnight the Node process thinks it is would put a
 * five-and-a-half hour hole in every ETA.
 *
 * `blocked` deliberately has no time: it is an answer, and a useful one, but it
 * is not an estimate. Storing a made-up etaAt for it would quietly corrupt any
 * later "how accurate are people's ETAs" report.
 */
const ETA_PRESETS = {
    '30m': {
        label: 'About 30 minutes',
        at: () => new Date(Date.now() + 30 * 60 * 1000)
    },
    '2h': {
        label: 'About 2 hours',
        at: () => new Date(Date.now() + 2 * 60 * 60 * 1000)
    },
    'today': {
        label: 'By end of today',
        at: () => istWallClockToUTC(todayIST(), 18, 30)
    },
    'tomorrow': {
        label: 'By end of tomorrow',
        at: () => istWallClockToUTC(addDays(todayIST(), 1), 18, 30)
    },
    'blocked': {
        label: 'I am blocked — need help',
        at: () => null
    }
};

const isPreset = (key) => Object.prototype.hasOwnProperty.call(ETA_PRESETS, key);

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * How long before the same person may nudge the same employee about the same
 * task again.
 *
 * A nudge is a notification the recipient cannot turn off, sent to their inbox
 * and their phone. Without a floor, "nudge" becomes a button someone taps six
 * times in a row while annoyed, and the feature is dead within a fortnight
 * because everybody mutes it. Two hours is long enough to be a real check-in
 * and short enough to chase twice in a working day.
 *
 * Scoped per sender: a Team Lead being on cooldown must not stop the Admin from
 * asking, since they are asking as different people about different things.
 */
const NUDGE_COOLDOWN_MINUTES = Number(process.env.NUDGE_COOLDOWN_MINUTES || 120);

/**
 * Who may nudge on this task.
 *
 * "The assigner, or anyone with access to the task" — which is exactly the rule
 * the discussion thread already uses, so this reuses the same visibility filter
 * rather than inventing a second notion of access. Being able to open a task
 * and read its thread is the same permission as being able to ask its assignee
 * a question about it.
 */
const canNudgeOn = async (doc, reqUser, ownerModel = 'Task') => {
    if (doc.assignedBy.toString() === reqUser.id) return true;
    if (IS_PRIVILEGED.includes(reqUser.role)) return true;
    if (doc.assignees.some(a => a.toString() === reqUser.id)) return true;

    const visibility = await getTaskVisibilityFilter(reqUser);
    if (!visibility) return false;

    const Model = mongoose.model(ownerModel);
    return Boolean(await Model.exists({ _id: doc._id, ...visibility }));
};

// ---------------------------------------------------------------------------
// Message building
// ---------------------------------------------------------------------------

const DEFAULT_QUESTION = 'How long will this take to complete?';

const dueLabel = (doc) => {
    if (!doc.dueDate) return null;
    const date = new Date(doc.dueDate).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
    return doc.dueTime ? `${date}, ${doc.dueTime}` : date;
};

/**
 * The plain-text body, used verbatim for WhatsApp and as the human sentence
 * inside the in-app notification.
 *
 * Kept free of markup so the same words can go down every channel — the moment
 * WhatsApp and email say different things, the employee gets two messages that
 * look like two separate requests.
 */
const buildPlainMessage = ({ senderName, doc, message, replyUrl, replyUrls }) => {
    const due = dueLabel(doc);
    const lines = [
        `${senderName} is checking in on your task.`,
        ``,
        `Task: ${doc.title}`
    ];
    if (due) lines.push(`Due: ${due}`);
    lines.push(``, message || DEFAULT_QUESTION);

    /**
     * The text alternative for the email carries the *same* links as the HTML.
     *
     * Without this the plain-text part is the tag-stripped HTML — the button
     * labels with every href discarded — so the message arrives as an HTML
     * half full of links beside a text half with none. Filters score that
     * mismatch, and it is a needless reason for a perfectly legitimate mail to
     * be quarantined.
     */
    if (replyUrls) {
        lines.push(``, `Answer by opening one of these:`);
        for (const [key, url] of Object.entries(replyUrls)) {
            lines.push(`  ${ETA_PRESETS[key].label}: ${url}`);
        }
    }

    if (replyUrl) lines.push(``, `Or open the task: ${replyUrl}`);
    return lines.join('\n');
};

// Every string that lands inside an HTML email has been typed by a user
// somewhere — a task title, a sender's note. Without this a task called
// `<b>urgent` would silently reformat the mail, and a crafted one could plant a
// link in a message that appears to come from HRMS.
const esc = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const PRESET_COLOURS = {
    '30m': '#215D7B',
    '2h': '#215D7B',
    'today': '#0f766e',
    'tomorrow': '#b45309',
    'blocked': '#A6477F'
};

/**
 * The email, with the ETA presets as one-click links.
 *
 * The buttons are the same magic-link pattern the leave approvals already use
 * (routes/leaves.js `email-action`): a signed, single-purpose JWT in the query
 * string that the server can act on without a session. An employee answering a
 * nudge from their phone at a client site should not have to log in first — if
 * they do, they will simply not answer.
 */
const buildEmailHtml = ({ senderName, doc, message, tokens, taskUrl }) => {
    const due = dueLabel(doc);

    const buttons = Object.entries(ETA_PRESETS).map(([key, preset]) => `
        <td align="center" style="padding: 4px;">
            <a href="${esc(tokens[key])}" target="_blank"
               style="display:inline-block; font-family: Arial, sans-serif; font-size:14px; font-weight:600;
                      color:#ffffff; background-color:${PRESET_COLOURS[key]}; text-decoration:none;
                      padding:11px 18px; border-radius:6px;">${esc(preset.label)}</a>
        </td>`).join('');

    return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">

        <div style="background-color: #215D7B; padding: 24px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0; font-size: 21px; letter-spacing: 0.3px;">Quick check-in on your task</h2>
        </div>

        <div style="padding: 28px 30px;">
            <p style="font-size: 15px; color: #475569; margin-top: 0;">
                <strong>${esc(senderName)}</strong> would like an update.
            </p>

            <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; text-align: left; overflow: hidden;">
                <tr>
                    <td style="padding: 12px 15px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; width: 30%; color: #64748b; font-weight: 600; font-size: 13px;">Task</td>
                    <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; font-size: 14px;">${esc(doc.title)}</td>
                </tr>
                ${due ? `<tr>
                    <td style="padding: 12px 15px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600; font-size: 13px;">Due</td>
                    <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #A6477F; font-weight: 600; font-size: 14px;">${esc(due)}</td>
                </tr>` : ''}
                <tr>
                    <td style="padding: 12px 15px; background-color: #f8fafc; color: #64748b; font-weight: 600; font-size: 13px; vertical-align: top;">Asking</td>
                    <td style="padding: 12px 15px; color: #334155; font-size: 14px; line-height: 1.55;">${esc(message || DEFAULT_QUESTION)}</td>
                </tr>
            </table>

            <p style="font-size: 14px; color: #64748b; margin-bottom: 14px; text-align: center;">
                Tap an answer — no need to log in.
            </p>

            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>${buttons}</tr>
            </table>

            <p style="text-align:center; margin: 22px 0 0;">
                <a href="${esc(taskUrl)}" target="_blank" style="font-size: 13px; color: #215D7B; text-decoration: underline;">
                    Open the task to answer in detail
                </a>
            </p>
        </div>
    </div>`;
};

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/**
 * Signed one-shot reply links.
 *
 * `nudgeId` plus the preset is all the token carries — the reply route re-reads
 * the nudge and re-checks it is still unanswered, so a token is not a licence
 * to overwrite an answer that already exists. Seven days matches the leave
 * links; past that the question is stale anyway.
 */
const replyToken = (nudgeId, preset) => jwt.sign(
    { nudgeId: String(nudgeId), preset, kind: 'nudge-reply' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
);

const buildReplyUrls = (nudgeId, backendUrl) => {
    const urls = {};
    for (const key of Object.keys(ETA_PRESETS)) {
        urls[key] = `${backendUrl}/api/tasks/nudge-reply?token=${replyToken(nudgeId, key)}`;
    }
    return urls;
};

/**
 * Record what happened on one channel.
 *
 * Upserts by channel rather than appending, so a retry overwrites its own row
 * instead of leaving two contradictory answers to "did the email go out".
 */
const setDelivery = (nudge, channel, status, detail) => {
    let row = nudge.deliveries.find(d => d.channel === channel);
    if (!row) {
        nudge.deliveries.push({ channel });
        row = nudge.deliveries[nudge.deliveries.length - 1];
    }

    row.status = status;
    row.detail = String(detail || '').slice(0, 300);
    row.attempts = (row.attempts || 0) + 1;
    if (status === 'sent') row.sentAt = new Date();
};

/**
 * Send one nudge down every channel it asked for.
 *
 * Channels are independent and none of them can fail the request: a nudge whose
 * email bounced is still a nudge, sitting unanswered in the app with `failed`
 * recorded against the email row, which is exactly what the sender needs to
 * see. That is why every branch here is wrapped rather than allowed to throw.
 */
const dispatchNudge = async ({ nudge, doc, sender, recipient, backendUrl, appUrl }) => {
    const taskUrl = `${appUrl}/task/${doc._id}`;
    const replyUrls = buildReplyUrls(nudge._id, backendUrl);
    const plain = buildPlainMessage({
        senderName: sender.name,
        doc,
        message: nudge.message,
        replyUrl: taskUrl
    });

    // --- In-app: always, and first. It is the record of the nudge inside the
    // product; the other channels are only ways of getting someone's attention.
    try {
        await Notification.create({
            recipient: recipient._id,
            title: `Update requested on "${doc.title}"`,
            message: `${sender.name}: ${nudge.message || DEFAULT_QUESTION}`,
            type: 'TASK',
            link: `/task/${doc._id}`,
            refKey: `nudge:${nudge._id}`
        });
        setDelivery(nudge, 'inApp', 'sent', 'delivered');
    } catch (err) {
        console.error('[NUDGE] in-app failed:', err.message);
        setDelivery(nudge, 'inApp', 'failed', err.message);
    }

    // --- Email
    if (nudge.channels.includes('email')) {
        const address = recipient.workEmail || recipient.email;
        if (!address) {
            setDelivery(nudge, 'email', 'skipped', 'No email address on the profile');
        } else {
            const ok = await sendEmail({
                email: address,
                subject: `Update requested: ${doc.title}`,
                // Mirrors the HTML, links included — see buildPlainMessage.
                text: buildPlainMessage({
                    senderName: sender.name,
                    doc,
                    message: nudge.message,
                    replyUrl: taskUrl,
                    replyUrls
                }),
                message: buildEmailHtml({
                    senderName: sender.name,
                    doc,
                    message: nudge.message,
                    tokens: replyUrls,
                    taskUrl
                })
            });
            /**
             * `sent` here means "the SMTP relay accepted it", which is a
             * weaker claim than it looks: this relay returns 250 OK even for
             * mailboxes that do not exist, so acceptance is not delivery.
             * Anything after handoff — a spam verdict, a dead address, an
             * async bounce — is invisible from in here and lands in the
             * postmaster mailbox instead. The detail says so rather than
             * implying we watched it arrive.
             */
            setDelivery(nudge, 'email', ok ? 'sent' : 'failed',
                ok ? `accepted by relay for ${address}` : 'SMTP send failed');
        }
    }

    // --- WhatsApp
    if (nudge.channels.includes('whatsapp')) {
        if (recipient.whatsappNotificationsEnabled === false) {
            setDelivery(nudge, 'whatsapp', 'skipped', 'Employee has opted out of WhatsApp');
        } else {
            const number = recipient.whatsappNumber || recipient.phoneNumber;
            const res = await whatsapp.sendWhatsAppMessage(number, plain);
            setDelivery(
                nudge,
                'whatsapp',
                res.ok ? 'sent' : (res.skipped ? 'skipped' : 'failed'),
                res.detail
            );
        }
    }

    await nudge.save();

    // The recipient's open tabs get the nudge without a refresh, and anyone
    // watching the task sees it appear in the history.
    const payload = await Nudge.findById(nudge._id)
        .populate('nudgedBy', 'name profilePic')
        .populate('recipient', 'name profilePic');

    emitToUser(recipient._id, 'nudge:new', payload.toObject());
    emitToTask(doc._id, 'task:nudge', payload.toObject());

    return payload;
};

/**
 * Record an answer.
 *
 * Shared by the in-app response and the emailed quick-reply so both write the
 * same fields — an ETA that means one thing when typed and another when tapped
 * would make the history unreadable.
 *
 * Returns null when the nudge is already answered, which both callers treat as
 * "fine, say so" rather than an error: a double-tapped email button is the
 * normal case, not a fault.
 */
const recordResponse = async (nudge, { preset, etaAt, note, via }) => {
    if (nudge.status !== 'pending') return null;

    let label = '';
    let at = null;

    if (preset && isPreset(preset)) {
        label = ETA_PRESETS[preset].label;
        at = ETA_PRESETS[preset].at();
    } else if (etaAt) {
        const parsed = new Date(etaAt);
        if (!Number.isNaN(parsed.getTime())) at = parsed;
    }

    nudge.response = {
        etaAt: at,
        etaLabel: label,
        note: String(note || '').trim().slice(0, 1000),
        respondedAt: new Date(),
        via: via || 'app'
    };
    nudge.status = 'answered';
    await nudge.save();

    const Model = mongoose.model(nudge.ownerModel);
    const doc = await Model.findById(nudge.taskId).select('title');
    const responder = await User.findById(nudge.recipient).select('name');

    const answer = label || (at
        ? `by ${at.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
        : 'replied');

    try {
        await Notification.create({
            recipient: nudge.nudgedBy,
            title: `${responder?.name || 'Someone'} answered your nudge`,
            message: `"${doc?.title || 'Task'}" — ${answer}${nudge.response.note ? `: ${nudge.response.note}` : ''}`,
            type: 'TASK',
            link: `/task/${nudge.taskId}`,
            refKey: `nudge:${nudge._id}`
        });
    } catch (err) {
        console.error('[NUDGE] response notification failed:', err.message);
    }

    const populated = await Nudge.findById(nudge._id)
        .populate('nudgedBy', 'name profilePic')
        .populate('recipient', 'name profilePic');

    emitToUser(nudge.nudgedBy, 'nudge:answered', populated.toObject());
    emitToTask(nudge.taskId, 'task:nudge', populated.toObject());

    return populated;
};

module.exports = {
    ETA_PRESETS,
    isPreset,
    // Exported for the deliverability harness, which sends the real template
    // rather than an approximation of it.
    buildEmailHtml,
    DEFAULT_QUESTION,
    NUDGE_COOLDOWN_MINUTES,
    canNudgeOn,
    dispatchNudge,
    recordResponse,
    buildPlainMessage,
    esc
};
