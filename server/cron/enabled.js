/**
 * Master on/off switch for every scheduled job in this process.
 *
 * The cron modules are required for their exported helpers as well as their
 * schedules (routes/recurringTasks.js pulls generateForSchedule out of one, for
 * example), so the gate cannot live at the require site in index.js — it has to
 * sit around the cron.schedule() calls and the boot catch-up sweeps themselves.
 *
 * Deliberately fails OPEN: only the literal string 'false' turns jobs off. The
 * VPS .env predates this flag, so defaulting to disabled would silently stop
 * attendance marking and recurring task generation in production the moment
 * this shipped. Local dev opts out explicitly with CRON=false.
 */
const CRON_ENABLED = String(process.env.CRON ?? 'true').trim().toLowerCase() !== 'false';

/**
 * Register a job only when cron is enabled.
 *
 * @param {string} label  shown in the boot log so it is obvious what was skipped
 * @param {Function} register  performs the cron.schedule() / setTimeout() call
 */
const scheduleIfEnabled = (label, register) => {
    if (!CRON_ENABLED) {
        console.log(`⏸️  [CRON DISABLED] ${label} not scheduled (CRON=false)`);
        return;
    }
    register();
};

module.exports = { CRON_ENABLED, scheduleIfEnabled };
