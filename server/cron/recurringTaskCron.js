const cron = require('node-cron');
const { scheduleIfEnabled } = require('./enabled');

const RecurringTask = require('../models/RecurringTask');
const Task = require('../models/Task');
const Notification = require('../models/Notification');

const {
    MAX_ROLL_FORWARD_DAYS,
    todayIST,
    addDays,
    dayBounds,
    buildEligibility
} = require('../utils/recurringSchedule');

/**
 * Materialises today's task from every active recurring schedule
 * (TaskPlan.md §13.5).
 *
 * Runs at 06:00 India time, every day including Sunday — the job decides for
 * itself whether a given person should get a task today, which means it can log
 * *why* it skipped. Encoding "not Sundays" in the cron expression instead would
 * throw that reason away.
 */

const GENERATION_HOUR_IST = 6;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const istHour = () => new Date(Date.now() + IST_OFFSET_MS).getUTCHours();

const notify = async (recipientId, title, message, link) => {
    try {
        await Notification.create({ recipient: recipientId, title, message, type: 'TASK', link });
    } catch (err) {
        console.error('[RECURRING CRON] Notification error:', err.message);
    }
};

// ========================================================
// GENERATE ONE SCHEDULE FOR ONE DAY
// ========================================================
/**
 * @returns {number} how many tasks were actually created
 *
 * Safe to call twice for the same day: the occurrence log is checked first, and
 * the unique index on (recurringTaskId, occurrenceDate, assignees) catches
 * anything that slips past a race.
 */
const generateForSchedule = async (schedule, dateStr) => {
    if (schedule.status !== 'Active') return 0;

    const activeStates = schedule.assigneeState.filter(s => s.status === 'Active');
    if (activeStates.length === 0) return 0;

    // Only the people whose plan actually includes today need evaluating.
    const dueToday = activeStates.filter(s => schedule.datesFor(s.user).includes(dateStr));
    if (dueToday.length === 0) return 0;

    const { check } = await buildEligibility(
        [dateStr],
        dueToday.map(s => s.user),
        {
            skipSundays: schedule.skipSundays,
            skipHolidays: schedule.skipHolidays,
            skipOnLeave: schedule.skipOnLeave
        }
    );

    let created = 0;
    let dirty = false;

    for (const state of dueToday) {
        const userId = String(state.user);

        // Already handled — a second run for this day must be a no-op.
        const already = schedule.occurrences.some(
            o => o.date === dateStr && String(o.assignee) === userId
        );
        if (already) continue;

        // The run is over for this person; nothing more is owed.
        if (state.generatedCount >= schedule.targetCount) {
            state.status = 'Completed';
            dirty = true;
            continue;
        }

        const verdict = check(dateStr, state.user);

        if (!verdict.ok) {
            schedule.occurrences.push({
                date: dateStr,
                assignee: state.user,
                taskId: null,
                result: 'skipped',
                skipReason: verdict.reason,
                // A skipped day was never owed, so it is neither done nor missed.
                outcome: 'not-applicable'
            });
            dirty = true;

            // A deactivated employee is not a scheduling problem — no amount of
            // rolling forward will find them a working day.
            const permanent = verdict.reason === 'Employee no longer active' ||
                verdict.reason === 'Employee not found';
            if (permanent) {
                state.status = 'Stalled';
                continue;
            }

            if (state.extraDates.length >= MAX_ROLL_FORWARD_DAYS) {
                state.status = 'Stalled';
                await notify(
                    schedule.assignedBy,
                    'Recurring task stalled',
                    `"${schedule.title}" has been rolled forward ${MAX_ROLL_FORWARD_DAYS} days without running. It has been stopped — check whether it is still needed.`,
                    `/tasks/recurring/${schedule._id}`
                );
                continue;
            }

            // Extend by one calendar day, not "the next working day". If the new
            // tail is itself a Sunday it will skip and extend again tomorrow,
            // which converges on the same answer without this job having to
            // predict leave nobody has requested yet.
            const dates = schedule.datesFor(state.user).sort();
            state.extraDates.push(addDays(dates[dates.length - 1], 1));
            continue;
        }

        // --- eligible: create the day's task ---
        const bounds = dayBounds(dateStr);

        try {
            const task = await Task.create({
                title: schedule.title,
                description: schedule.description,
                taskType: schedule.taskType,
                projectId: schedule.projectId || null,
                assignedBy: schedule.assignedBy,
                priority: schedule.priority,
                status: 'Pending',
                startDate: bounds.start,
                dueDate: bounds.end,
                // The schedule's time window (TaskPlan.md §16), copied onto
                // every day it generates — the brief includes it the same way
                // it includes the title and priority, so it doesn't vary
                // day to day. Absent on the schedule, these stay null and
                // the Task model's own pre-validate hook falls back to
                // bounds.end (end of day) exactly as before.
                startTime: schedule.startTime || null,
                dueTime: schedule.dueTime || null,
                timeAllottedMinutes: schedule.timeAllottedMinutes || null,
                // Inherited from the brief like the time window above, so
                // every day of the run demands proof if the schedule does.
                requiresAttachment: schedule.requiresAttachment || false,
                // The brief is *referenced*, never copied — see TaskPlan.md
                // §13.7. Copying a still-compressing video here would leave this
                // task pointing at a staged file the midnight job later deletes.
                attachments: [],
                assignees: [state.user],
                recurringTaskId: schedule._id,
                occurrenceDate: dateStr
            });

            state.generatedCount += 1;
            schedule.occurrences.push({
                date: dateStr,
                assignee: state.user,
                taskId: task._id,
                result: 'generated',
                outcome: 'pending'
            });
            created++;
            dirty = true;

            if (state.generatedCount >= schedule.targetCount) state.status = 'Completed';

            await notify(
                state.user,
                'Task for today',
                `"${schedule.title}" — day ${state.generatedCount} of ${schedule.targetCount}.`,
                `/task/${task._id}`
            );
        } catch (err) {
            // The unique index did its job: this day already exists for this
            // person, created by a run we raced with. Adopt it rather than
            // failing, so the occurrence log still lines up.
            if (err.code === 11000) {
                const existing = await Task.findOne({
                    recurringTaskId: schedule._id,
                    occurrenceDate: dateStr,
                    assignees: state.user
                }).select('_id');

                if (existing) {
                    schedule.occurrences.push({
                        date: dateStr,
                        assignee: state.user,
                        taskId: existing._id,
                        result: 'generated',
                        outcome: 'pending'
                    });
                    dirty = true;
                }
                console.log(`[RECURRING CRON] ${dateStr} already generated for ${userId} — skipped duplicate.`);
            } else {
                console.error(`[RECURRING CRON] Could not create task for ${userId} on ${dateStr}:`, err.message);
            }
        }
    }

    // Everyone finished or stalled means the schedule itself is done.
    if (schedule.assigneeState.every(s => s.status !== 'Active')) {
        schedule.status = 'Completed';
        dirty = true;
    }

    if (dirty) await schedule.save();
    return created;
};

// ========================================================
// SWEEP: settle every day that has already passed
// ========================================================
/**
 * Anything still `pending` from a day before today gets its verdict: the task
 * was completed, or it was missed and comes off the board.
 *
 * Sweeps *all* stale days rather than only yesterday, so a weekend of downtime
 * settles correctly instead of leaving a permanent hole in the log.
 */
const sweepStaleOccurrences = async (today) => {
    const schedules = await RecurringTask.find({ 'occurrences.outcome': 'pending' });

    let completed = 0;
    let missed = 0;

    for (const schedule of schedules) {
        let dirty = false;

        for (const occ of schedule.occurrences) {
            if (occ.outcome !== 'pending' || occ.date >= today) continue;

            const task = occ.taskId ? await Task.findById(occ.taskId) : null;

            if (!task) {
                // Deleted out from under us; nothing was submitted.
                occ.outcome = 'missed';
                missed++;
            } else if (task.status === 'Completed') {
                occ.outcome = 'completed';
                completed++;
            } else {
                occ.outcome = 'missed';
                missed++;

                // Off the board, not deleted — still openable from the
                // schedule's compliance view.
                if (!task.isArchived) {
                    task.isArchived = true;
                    await task.save();
                }
            }
            dirty = true;
        }

        if (dirty) await schedule.save();
    }

    if (completed || missed) {
        console.log(`[RECURRING CRON] Swept past days: ${completed} completed, ${missed} missed.`);
    }
};

// ========================================================
// THE DAILY RUN
// ========================================================
const runDailyGeneration = async (dateStr = todayIST()) => {
    try {
        console.log(`[RECURRING CRON] Run for ${dateStr}...`);

        await sweepStaleOccurrences(dateStr);

        const schedules = await RecurringTask.find({ status: 'Active' });
        if (schedules.length === 0) {
            console.log('[RECURRING CRON] No active schedules.');
            return 0;
        }

        let total = 0;
        for (const schedule of schedules) {
            try {
                total += await generateForSchedule(schedule, dateStr);
            } catch (err) {
                // One broken schedule must not stop the rest of the company's.
                console.error(`[RECURRING CRON] Schedule ${schedule._id} failed:`, err.message);
            }
        }

        console.log(`[RECURRING CRON] Done. Created ${total} task(s) across ${schedules.length} schedule(s).`);
        return total;
    } catch (err) {
        console.error('[RECURRING CRON] Run error:', err);
        return 0;
    }
};

// 06:00 India time. Pinned explicitly rather than trusting server local time —
// a UTC VPS rolls its date over at 05:30 IST, which is exactly the half hour
// that would make this job generate the wrong day.
scheduleIfEnabled('Recurring task daily generation', () => {
    cron.schedule('0 6 * * *', () => runDailyGeneration(), { timezone: 'Asia/Kolkata' });
});

/**
 * Catch-up sweep on boot.
 *
 * node-cron does not fire while the process is down, and §11 records this
 * happening in production to the video compression job. If the server was
 * restarting at 06:00, today's tasks would simply never appear.
 *
 * Gated on the hour so a 02:00 restart doesn't hand people their task four
 * hours early — before 06:00 IST the scheduled run has not been missed yet.
 * Generation is idempotent, so running it a second time costs nothing.
 */
const STARTUP_DELAY_MS = 2 * 60 * 1000;

scheduleIfEnabled('Recurring task startup catch-up', () => {
    setTimeout(async () => {
        try {
            if (istHour() < GENERATION_HOUR_IST) return;
            console.log('[RECURRING CRON] Startup catch-up: verifying today has been generated...');
            await runDailyGeneration();
        } catch (err) {
            console.error('[RECURRING CRON] Startup catch-up error:', err.message);
        }
    }, STARTUP_DELAY_MS).unref(); // never hold the process open on its own
});

module.exports = { generateForSchedule, runDailyGeneration, sweepStaleOccurrences };
