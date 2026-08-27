const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const whatsapp = require('../services/whatsapp.service');

/**
 * Admin control surface for the WhatsApp gateway.
 *
 * Everything here is a thin pass-through to services/whatsapp.service.js. The
 * point is not new capability — the gateway's own dashboard has all of it —
 * but *reach*: that dashboard sits behind an SSH tunnel on purpose, so without
 * this page a dead session is a sysadmin job rather than something an admin can
 * fix from the app.
 *
 * ADMIN only, not ADMIN+HR. Stopping this session stops every outbound
 * WhatsApp message in the company, and re-pairing hands someone the ability to
 * bind the company number to a handset. That is a narrower group than "can see
 * salaries".
 */
const adminOnly = (req, res, next) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Access Denied' });
    }
    next();
};

/**
 * Everything the admin screen needs in one call.
 *
 * Deliberately reports gateway health and session state separately: "OpenWA is
 * down" and "OpenWA is up but the phone was unlinked" look identical from the
 * outside and have completely different fixes, so collapsing them into one
 * "working / not working" flag would send people to the wrong place.
 */
router.get('/status', auth, adminOnly, async (req, res) => {
    try {
        const configured = whatsapp.isConfigured();
        if (!configured) {
            return res.json({
                configured: false,
                gatewayUp: false,
                session: null,
                summary: 'not-configured'
            });
        }

        const [health, session] = await Promise.all([
            whatsapp.getGatewayHealth(),
            whatsapp.getSessionStatus()
        ]);

        // One word the UI can switch on, worked out here so the client is not
        // re-deriving the same rules in JSX.
        const summary = !health.ok ? 'gateway-down'
            : session.connected ? 'ready'
                : session.detail === 'qr_ready' ? 'needs-linking'
                    : 'session-down';

        // Only worth fetching when there is a live session to count for.
        const stats = session.connected ? await whatsapp.getStats() : null;

        res.json({
            configured: true,
            gatewayUp: health.ok,
            gatewayDetail: health.detail,
            session: {
                status: session.detail,
                connected: session.connected,
                phone: session.phone || null
            },
            messages: stats?.ok ? stats.messages : null,
            summary
        });
    } catch (err) {
        console.error('WhatsApp Status Error:', err);
        res.status(500).json({ message: 'Could not read WhatsApp status' });
    }
});

router.post('/start', auth, adminOnly, async (req, res) => {
    try {
        const result = await whatsapp.startSession();
        if (!result.ok) return res.status(502).json({ message: result.detail });
        res.json({ message: 'Session starting', detail: result.detail });
    } catch (err) {
        console.error('WhatsApp Start Error:', err);
        res.status(500).json({ message: 'Could not start the session' });
    }
});

router.post('/stop', auth, adminOnly, async (req, res) => {
    try {
        const result = await whatsapp.stopSession();
        if (!result.ok) return res.status(502).json({ message: result.detail });
        res.json({ message: 'Session stopped', detail: result.detail });
    } catch (err) {
        console.error('WhatsApp Stop Error:', err);
        res.status(500).json({ message: 'Could not stop the session' });
    }
});

/**
 * Re-link the company number.
 *
 * Starts the session if it is not already running, waits for it to reach
 * `qr_ready`, then asks for the code — the gateway refuses a pairing request in
 * any other state, and making the admin press Start, wait, then press Pair is
 * three chances to get the timing wrong.
 *
 * The wait is bounded: a session that never reaches qr_ready is a real fault
 * and the admin should see it, not a spinner.
 */
router.post('/pair', auth, adminOnly, async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ message: 'Enter the WhatsApp number to link' });
        }

        let status = await whatsapp.getSessionStatus();
        if (status.connected) {
            return res.status(400).json({
                message: `Already linked to ${status.phone}. Stop the session first if you want to link a different number.`
            });
        }

        if (status.detail !== 'qr_ready') {
            const started = await whatsapp.startSession();
            if (!started.ok) return res.status(502).json({ message: started.detail });

            // ~30s ceiling. Chromium has to boot and load WhatsApp Web.
            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 2000));
                status = await whatsapp.getSessionStatus();
                if (status.detail === 'qr_ready' || status.connected) break;
            }
        }

        if (status.connected) {
            return res.json({ message: 'Session connected on its own — no code needed.', code: null });
        }
        if (status.detail !== 'qr_ready') {
            return res.status(502).json({
                message: `Session did not become ready to link (stuck at "${status.detail}"). Check the gateway logs.`
            });
        }

        const result = await whatsapp.requestPairingCode(phoneNumber);
        if (!result.ok) return res.status(502).json({ message: result.detail });

        res.json({ message: 'Enter this code in WhatsApp', code: result.detail });
    } catch (err) {
        console.error('WhatsApp Pair Error:', err);
        res.status(500).json({ message: 'Could not start pairing' });
    }
});

/**
 * The QR image for linking by scan.
 *
 * Same prerequisite as the pairing code — the session must be `qr_ready` — so
 * this starts it and waits, exactly as /pair does, rather than making the admin
 * sequence it themselves.
 */
router.post('/qr', auth, adminOnly, async (req, res) => {
    try {
        let status = await whatsapp.getSessionStatus();
        if (status.connected) {
            return res.status(400).json({
                message: `Already linked to ${status.phone}. Stop the session first to link a different number.`
            });
        }

        if (status.detail !== 'qr_ready') {
            const started = await whatsapp.startSession();
            if (!started.ok) return res.status(502).json({ message: started.detail });

            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 2000));
                status = await whatsapp.getSessionStatus();
                if (status.detail === 'qr_ready' || status.connected) break;
            }
        }

        if (status.connected) {
            return res.json({ message: 'Session connected on its own — no scan needed.', qr: null });
        }

        const result = await whatsapp.getQrCode();
        if (!result.ok) return res.status(502).json({ message: result.detail });

        res.json({ message: 'Scan this in WhatsApp', qr: result.qr });
    } catch (err) {
        console.error('WhatsApp QR Error:', err);
        res.status(500).json({ message: 'Could not fetch the QR code' });
    }
});

/**
 * A test message to a number the admin nominates.
 *
 * The honest end-to-end check: it runs the same service call a nudge does, so a
 * green result here means nudges will work, not merely that a status endpoint
 * says "ready".
 */
router.post('/test', auth, adminOnly, async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ message: 'Enter a number to test' });

        const result = await whatsapp.sendWhatsAppMessage(
            phoneNumber,
            'Test message from GTS HRMS. WhatsApp notifications are working.'
        );
        if (!result.ok) return res.status(502).json({ message: result.detail });

        res.json({ message: 'Test message sent', detail: result.detail });
    } catch (err) {
        console.error('WhatsApp Test Error:', err);
        res.status(500).json({ message: 'Could not send the test message' });
    }
});

module.exports = router;
