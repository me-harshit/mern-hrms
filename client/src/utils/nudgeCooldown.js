/**
 * Cooldown maths, shared by the nudge panel and the compose dialog so the two
 * can never disagree about whether someone is nudgeable or how long is left.
 *
 * The server sends an absolute `until` timestamp rather than "minutes
 * remaining" — a number computed at fetch time is wrong the moment the user
 * leaves the tab open, and these screens routinely sit open for a while.
 */

/** Is this person still on cooldown for the current user, right now? */
export const isOnCooldown = (cooldowns, userId, now = Date.now()) => {
    const entry = cooldowns?.[String(userId)];
    if (!entry?.until) return false;
    return new Date(entry.until).getTime() > now;
};

/** Milliseconds left, or 0 when free. */
export const msLeft = (cooldowns, userId, now = Date.now()) => {
    const entry = cooldowns?.[String(userId)];
    if (!entry?.until) return 0;
    return Math.max(0, new Date(entry.until).getTime() - now);
};

/**
 * "1h 20m" / "45m" / "under a minute".
 *
 * Rounds up rather than down: telling someone to wait "0m" while the button is
 * still disabled reads as a bug.
 */
export const formatLeft = (ms) => {
    if (ms <= 0) return '';
    const totalMin = Math.ceil(ms / 60000);
    if (totalMin < 1) return 'under a minute';
    if (totalMin < 60) return `${totalMin}m`;

    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

/** The hover text on a disabled person or button. */
export const cooldownTitle = (cooldowns, userId, now = Date.now()) => {
    const left = msLeft(cooldowns, userId, now);
    if (left <= 0) return '';
    return `Already nudged — can nudge again in ${formatLeft(left)}`;
};
