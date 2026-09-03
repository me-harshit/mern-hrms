const cron = require('node-cron');
const { scheduleIfEnabled } = require('./enabled');
const whatsapp = require('../services/whatsapp.service');
const User = require('../models/User');
const Notification = require('../models/Notification');
const sendEmail = require('../utils/sendEmail');

/**
 * Keeps the WhatsApp session alive, and tells somebody when it cannot.
 *
 * Written after a 20-hour outage nobody noticed. The chain was:
 *
 *   1. Chromium crashed underneath a healthy OpenWA process.
 *   2. The process restarted; AUTO_START_SESSIONS fired and *failed*, because
 *      Chromium had not recovered yet ("Target closed").
 *   3. Nothing ever tried again.
 *
 * AUTO_START_SESSIONS only runs once, at gateway boot. It has no answer for a
 * session that dies later, or for its own single attempt failing — which is
 * exactly what happened. This is the retry loop that gap needs.
 *
 * It deliberately lives in the HRMS rather than on the gateway: the HRMS is the
 * thing that *cares* whether WhatsApp works, it already runs node-cron, and it
 * can reach the admins to escalate. The gateway cannot do the last part.
 */

// Every five minutes. Frequent enough that an outage is minutes not hours,
// infrequent enough that a genuinely dead gateway is not hammered.
const SCHEDULE = process.env.WHATSAPP_HEALTH_CRON || '*/5 * * * *';

/**
 * How many consecutive failed recoveries before a human is told.
 *
 * Three ticks of five minutes = 15 minutes of genuinely broken. A single crash
 * that self-heals on the next tick stays silent: an alert that cries wolf gets
 * ignored on the day it matters.
 */
const ALERT_AFTER = Number(process.env.WHATSAPP_ALERT_AFTER || 3);

/**
 * Who owns WhatsApp.
 *
 * One person, not "every admin". An outage alert that lands on six people is an
 * alert nobody owns — each assumes another is on it. This is the address the
 * email goes to, and the same address is looked up in the employee directory to
 * decide whose in-app bell rings.
 */
const ALERT_EMAIL = process.env.WHATSAPP_ALERT_EMAIL || '';

let consecutiveFailures = 0;
let alerted = false;

/**
 * Tell the owner, once per outage.
 *
 * `alerted` latches until recovery, so a long outage produces one alert rather
 * than one every five minutes.
 *
 * Both channels are attempted independently and neither can break the other:
 * the whole point of this function is that something is already broken.
 */
const alertOwner = async (detail) => {
    if (!ALERT_EMAIL) {
        console.error(`[WA-HEALTH] outage (${detail}) but WHATSAPP_ALERT_EMAIL is unset — nobody told`);
        return;
    }

    const subject = 'HRMS: WhatsApp notifications are down';
    const lines = [
        `The WhatsApp gateway has been unreachable for at least ${ALERT_AFTER * 5} minutes and could not be recovered automatically.`,
        '',
        `Reason: ${detail}`,
        '',
        'In-app notifications are unaffected — only WhatsApp delivery is down.',
        '',
        `Check it at ${process.env.APP_BASE_URL || 'https://hrm.gts.ai'}/whatsapp`
    ];
    const body = lines.join('\n');

    // --- In-app, to whoever owns that address.
    try {
        const owner = await User.findOne({
            $or: [{ email: ALERT_EMAIL.toLowerCase() }, { workEmail: ALERT_EMAIL.toLowerCase() }]
        }).select('_id name');

        if (owner) {
            await Notification.create({
                recipient: owner._id,
                title: 'WhatsApp notifications are down',
                message: `Could not be recovered automatically (${detail}). ` +
                    `Open the WhatsApp page to reconnect. In-app notifications are unaffected.`,
                type: 'SYSTEM',
                link: '/whatsapp',
                refKey: 'whatsapp:outage'
            });
            console.error(`[WA-HEALTH] in-app alert sent to ${owner.name}`);
        } else {
            console.error(`[WA-HEALTH] no employee found for ${ALERT_EMAIL} — in-app alert skipped`);
        }
    } catch (err) {
        console.error('[WA-HEALTH] in-app alert failed:', err.message);
    }

    // --- Email. Independent of the above: if the bell fails, the mail should
    // still go, and vice versa.
    try {
        const ok = await sendEmail({
            email: ALERT_EMAIL,
            subject,
            text: body,
            message: lines.map(l => (l ? `<p style="margin:0 0 10px">${l}</p>` : '')).join('')
        });
        console.error(`[WA-HEALTH] outage email to ${ALERT_EMAIL}: ${ok ? 'accepted by relay' : 'FAILED'}`);
    } catch (err) {
        console.error('[WA-HEALTH] outage email threw:', err.message);
    }
};

const tick = async () => {
    if (!whatsapp.isConfigured()) return;

    try {
        const status = await whatsapp.getSessionStatus();

        if (status.connected) {
            if (consecutiveFailures > 0) {
                console.log(`[WA-HEALTH] recovered after ${consecutiveFailures} failed check(s)`);
            }
            consecutiveFailures = 0;
            alerted = false;
            return;
        }

        /**
         * `qr_ready` means the phone is unlinked, not that the session is
         * stuck. Restarting cannot fix that — only a human with the handset
         * can — so escalate immediately instead of retrying pointlessly.
         */
        if (status.detail === 'qr_ready') {
            consecutiveFailures = ALERT_AFTER;
            if (!alerted) {
                alerted = true;
                await alertOwner('the number is no longer linked and must be paired again');
            }
            return;
        }

        console.warn(`[WA-HEALTH] session not ready (${status.detail}) — attempting start`);
        const started = await whatsapp.startSession();

        if (started.ok) {
            // Not "recovered" yet: start() only means the request was accepted.
            // The next tick reads the real state, which is what clears the
            // counter. Claiming success here would hide a start that accepts
            // and then dies, which is precisely this outage.
            console.log(`[WA-HEALTH] start requested (${started.detail})`);
            return;
        }

        consecutiveFailures += 1;
        console.error(`[WA-HEALTH] start failed (${consecutiveFailures}/${ALERT_AFTER}): ${started.detail}`);

        if (consecutiveFailures >= ALERT_AFTER && !alerted) {
            alerted = true;
            await alertOwner(started.detail);
        }
    } catch (err) {
        // Never let a health check take the process down.
        consecutiveFailures += 1;
        console.error('[WA-HEALTH] check threw:', err.message);
    }
};

if (process.env.WHATSAPP_HEALTH_DISABLED === 'true') {
    console.log('⏸️  WhatsApp health watchdog disabled by env');
} else {
    // CRON=false also silences this one. Locally OPENWA_BASE_URL points at a
    // 127.0.0.1 port that only exists on the VPS, so every tick failed the
    // fetch and spammed the boot log with retries.
    scheduleIfEnabled('WhatsApp health watchdog', () => {
        cron.schedule(SCHEDULE, tick);
        console.log(`✅ WhatsApp health watchdog scheduled (${SCHEDULE})`);
    });
}

module.exports = { tick };
