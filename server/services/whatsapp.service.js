/**
 * The one place in the HRMS that knows OpenWA exists.
 *
 * Everything above this file — nudges, and later task/leave/attendance
 * notices — calls sendWhatsAppMessage(phone, message) and gets back a plain
 * { ok, detail } result. When OpenWA is swapped for the Meta Cloud API, or for
 * a different self-hosted bridge, only this file changes.
 *
 * See Whatsapp.md for the server-side setup this talks to.
 *
 * Two rules hold everywhere in here:
 *
 *   1. It never throws. A WhatsApp outage must not fail the action that
 *      triggered the message — the caller records a failed delivery and moves
 *      on. Everything is caught and turned into { ok: false }.
 *
 *   2. It never blocks forever. OpenWA sits behind a browser session that can
 *      hang rather than refuse, so every request carries its own timeout.
 */

const DEFAULT_TIMEOUT_MS = Number(process.env.OPENWA_TIMEOUT_MS || 15000);
const DEFAULT_COUNTRY_CODE = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91';

/**
 * Whether WhatsApp is wired up at all.
 *
 * The channel is offered in the UI regardless — the sender is told it is not
 * connected rather than having the option silently vanish — but nothing is
 * attempted while this is false, so a half-configured server produces a clean
 * `skipped` delivery instead of a connection error on every nudge.
 *
 * OPENWA_SESSION_ID is required alongside the URL and key: this gateway is
 * session-scoped (POST /api/sessions returns the id every other route needs),
 * not a single global connection, so sending is meaningless without one.
 */
const isConfigured = () => Boolean(
    process.env.OPENWA_BASE_URL && process.env.OPENWA_API_KEY && process.env.OPENWA_SESSION_ID
);

/**
 * Turn whatever is stored on a profile into the digits-only form OpenWA wants.
 *
 * Profiles in this HRMS hold Indian numbers written every way a human writes
 * them: "+91 98765 43210", "098765-43210", "9876543210". All three are the same
 * number, and only the last shape is unambiguous, so:
 *
 *   - strip everything that is not a digit
 *   - drop a single leading 0 (the domestic trunk prefix, meaningless abroad)
 *   - prepend the default country code when what is left is a bare 10-digit
 *     subscriber number
 *
 * Returns null when the result cannot plausibly be a phone number, which the
 * caller reports as a `skipped` delivery rather than sending into the void.
 */
const normalisePhone = (raw, countryCode = DEFAULT_COUNTRY_CODE) => {
    if (!raw) return null;

    let digits = String(raw).replace(/\D/g, '');
    if (!digits) return null;

    // 00 as an international prefix, and the domestic trunk 0.
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.length > 10 && digits.startsWith('0')) digits = digits.slice(1);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

    if (digits.length === 10) digits = `${countryCode}${digits}`;

    // Shortest plausible international number is 8 digits, longest is 15 (E.164).
    if (digits.length < 8 || digits.length > 15) return null;

    return digits;
};

/** OpenWA addresses individual chats as <number>@c.us. */
const toChatId = (digits) => `${digits}@c.us`;

const request = async (path, { method = 'POST', body } = {}) => {
    const base = String(process.env.OPENWA_BASE_URL || '').replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
        const res = await fetch(`${base}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                // Confirmed against the running instance's own OpenAPI schema
                // (components.securitySchemes) — apiKey-in-header, this name
                // exactly. The Bearer scheme that exists on this gateway is a
                // different one (`metrics-bearer`), scoped only to the
                // Prometheus scrape endpoint, and has no bearing here.
                'X-API-Key': process.env.OPENWA_API_KEY
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal
        });

        const text = await res.text();
        let payload = null;
        try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = { raw: text }; }

        if (!res.ok) {
            return { ok: false, status: res.status, detail: (payload?.message || text || `HTTP ${res.status}`).slice(0, 300) };
        }
        return { ok: true, status: res.status, payload };
    } catch (err) {
        const detail = err.name === 'AbortError'
            ? `Timed out after ${DEFAULT_TIMEOUT_MS}ms`
            : err.message;
        return { ok: false, status: 0, detail };
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Send one plain-text WhatsApp message.
 *
 * @returns {Promise<{ok: boolean, skipped?: boolean, detail: string}>}
 *   `skipped` marks the cases nothing was even attempted — not configured, or
 *   the number is unusable — so callers can tell "we could not" from "it broke".
 */
const sendWhatsAppMessage = async (phone, message) => {
    if (!isConfigured()) {
        return { ok: false, skipped: true, detail: 'WhatsApp is not connected on this server yet' };
    }

    const digits = normalisePhone(phone);
    if (!digits) {
        return { ok: false, skipped: true, detail: 'No usable WhatsApp number on the employee profile' };
    }

    // Confirmed against SendTextMessageDto: { chatId, text }, chatId shaped
    // "<digits>@c.us" for a one-to-one chat. Path and body both verified
    // against the running instance's own OpenAPI schema, not guessed.
    const res = await request(`/api/sessions/${process.env.OPENWA_SESSION_ID}/messages/send-text`, {
        body: {
            chatId: toChatId(digits),
            text: message
        }
    });

    if (!res.ok) {
        console.error('[WHATSAPP] send failed:', res.detail);
        return { ok: false, detail: res.detail };
    }

    const id = res.payload?.id || res.payload?.messageId;
    return { ok: true, detail: typeof id === 'string' ? id : 'sent' };
};

/**
 * Is the WhatsApp account actually logged in right now?
 *
 * Separate from isConfigured(): the env vars can be perfectly correct while the
 * phone has been unlinked and every send would fail. The settings screen uses
 * this so someone can see the session is dead before employees stop getting
 * messages.
 */
const getSessionStatus = async () => {
    if (!isConfigured()) return { configured: false, connected: false, detail: 'Not configured' };

    // GET /api/sessions/{id} -> SessionResponseDto. `status` runs through a
    // known enum (created/initializing/qr_ready/authenticating/ready/
    // disconnected/action_required/failed) — 'ready' is the only one that
    // means "a send will actually go out".
    const res = await request(`/api/sessions/${process.env.OPENWA_SESSION_ID}`, { method: 'GET' });
    if (!res.ok) return { configured: true, connected: false, detail: res.detail };

    const status = res.payload?.status;
    return {
        configured: true,
        connected: status === 'ready',
        detail: res.payload?.lastError || status || 'Unknown',
        phone: res.payload?.phone || null
    };
};

// ---------------------------------------------------------------------------
// Session lifecycle — driven from the HRMS admin screen
// ---------------------------------------------------------------------------

/**
 * These exist so nobody has to SSH into the VPS to restart a WhatsApp session.
 *
 * The gateway's own dashboard can do all of this, but it lives behind an SSH
 * tunnel by design (it fronts a logged-in WhatsApp account, see Whatsapp.md),
 * which makes "the nudges stopped" a sysadmin task at 6pm rather than something
 * an admin can fix from the page they are already on.
 *
 * All of them follow the same contract as sendWhatsAppMessage: never throw,
 * always return { ok, detail }.
 */

const startSession = async () => {
    if (!isConfigured()) return { ok: false, detail: 'WhatsApp is not configured on this server' };

    const res = await request(`/api/sessions/${process.env.OPENWA_SESSION_ID}/start`);
    // 400 "already started" is success from the caller's point of view — the
    // button exists to make the session run, and it is running.
    if (!res.ok && /already started/i.test(res.detail || '')) {
        return { ok: true, detail: 'Session was already running' };
    }
    return res.ok
        ? { ok: true, detail: res.payload?.status || 'starting' }
        : { ok: false, detail: res.detail };
};

const stopSession = async () => {
    if (!isConfigured()) return { ok: false, detail: 'WhatsApp is not configured on this server' };

    const res = await request(`/api/sessions/${process.env.OPENWA_SESSION_ID}/stop`);
    return res.ok
        ? { ok: true, detail: 'Session stopped' }
        : { ok: false, detail: res.detail };
};

/**
 * An 8-character code to type into WhatsApp → Linked Devices.
 *
 * Preferred over the QR: no image has to travel from the VPS to a browser, and
 * it is the same flow whether the admin is at their desk or on a phone.
 *
 * Only valid while the session is `qr_ready`, which is why the route calls
 * start() first and waits for that state.
 */
const requestPairingCode = async (phoneNumber) => {
    if (!isConfigured()) return { ok: false, detail: 'WhatsApp is not configured on this server' };

    const digits = normalisePhone(phoneNumber);
    if (!digits) return { ok: false, detail: 'That does not look like a valid phone number' };

    const res = await request(`/api/sessions/${process.env.OPENWA_SESSION_ID}/pairing-code`, {
        body: { phoneNumber: digits }
    });
    return res.ok
        ? { ok: true, detail: res.payload?.pairingCode, status: res.payload?.status }
        : { ok: false, detail: res.detail };
};

/**
 * The QR image, as a data URL, for linking by scan instead of by code.
 *
 * Both routes to the same place: some people find scanning easier, some are
 * reading the screen over a call and would rather type eight characters. The
 * gateway only produces either while the session is `qr_ready`.
 */
const getQrCode = async () => {
    if (!isConfigured()) return { ok: false, detail: 'WhatsApp is not configured on this server' };

    const res = await request(`/api/sessions/${process.env.OPENWA_SESSION_ID}/qr`, { method: 'GET' });
    return res.ok
        ? { ok: true, qr: res.payload?.qrCode, status: res.payload?.status }
        : { ok: false, detail: res.detail };
};

/**
 * Message counters, for the admin page.
 *
 * Purely informational — enough to answer "is anything actually going out"
 * without opening the gateway's own dashboard.
 */
const getStats = async () => {
    if (!isConfigured()) return { ok: false, detail: 'Not configured' };

    const res = await request(`/api/stats/sessions/${process.env.OPENWA_SESSION_ID}`, { method: 'GET' });
    return res.ok
        ? { ok: true, messages: res.payload?.messages || null }
        : { ok: false, detail: res.detail };
};

/**
 * Is the gateway process itself up?
 *
 * Distinct from getSessionStatus: this answers "is OpenWA running at all",
 * which is what separates "the service is down" from "the service is fine but
 * the phone was unlinked". The admin screen shows them as two different
 * problems because they have two different fixes.
 */
const getGatewayHealth = async () => {
    if (!isConfigured()) return { ok: false, detail: 'Not configured' };

    const res = await request('/api/health', { method: 'GET' });
    return res.ok
        ? { ok: true, detail: 'reachable' }
        : { ok: false, detail: res.detail };
};

module.exports = {
    isConfigured,
    normalisePhone,
    sendWhatsAppMessage,
    getSessionStatus,
    startSession,
    stopSession,
    requestPairingCode,
    getQrCode,
    getStats,
    getGatewayHealth
};
