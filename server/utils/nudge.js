const mongoose = require('mongoose');

const Nudge = require('../models/Nudge');
const Notification = require('../models/Notification');
const whatsapp = require('../services/whatsapp.service');
const { emitToUser, emitToTask } = require('./realtime');
const { IS_PRIVILEGED, getTaskVisibilityFilter } = require('./taskScoping');

/**
 * The nudge engine — everything between "someone pressed Nudge" and "the
 * employee's phone buzzed".
 *
 * Lives here rather than in routes/tasks.js for the same reason taskDiscussion
 * does: a recurring schedule can be nudged about too, and the rules for who may
 * ping, how often, and what the message says must not exist in two copies that
 * drift.
 *
 * A nudge expects no reply. See models/Nudge.js for why.
 */

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * How long before the same person may nudge the same employee about the same
 * task again.
 *
 * A nudge is a notification the recipient cannot turn off, sent to their phone.
 * Without a floor, "nudge" becomes a button someone taps six times in a row
 * while annoyed, and the feature is dead within a fortnight because everybody
 * mutes it. It also keeps the per-task count meaningful: a count of 30 that is
 * really one frustrated afternoon says nothing useful.
 *
 * Scoped per sender: a Team Lead being on cooldown must not stop the Admin from
 * pinging, since they are chasing as different people.
 */
const NUDGE_COOLDOWN_MINUTES = Number(process.env.NUDGE_COOLDOWN_MINUTES || 120);

/**
 * Who may nudge on this task.
 *
 * "The assigner, or anyone with access to the task" — which is exactly the rule
 * the discussion thread already uses, so this reuses the same visibility filter
 * rather than inventing a second notion of access. Being able to open a task
 * and read its thread is the same permission as being able to chase its
 * assignee about it.
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

const NUDGE_HEADLINE = 'is waiting on this task';
const NUDGE_ASK = 'Please update its status when you get a moment.';

const dueLabel = (doc) => {
    if (!doc.dueDate) return null;
    const date = new Date(doc.dueDate).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
    return doc.dueTime ? `${date}, ${doc.dueTime}` : date;
};

/**
 * The WhatsApp body.
 *
 * Fixed wording rather than anything the sender types. A free-text box on a
 * one-tap chase button invites the exact messages a chase should not carry, and
 * the employee reads the same sentence every time — which is what makes it
 * skimmable rather than something to stop and parse.
 */
const buildPlainMessage = ({ senderName, doc, taskUrl }) => {
    const due = dueLabel(doc);
    const lines = [
        `${senderName} ${NUDGE_HEADLINE}.`,
        ``,
        `Task: ${doc.title}`
    ];
    if (due) lines.push(`Due: ${due}`);
    lines.push(``, NUDGE_ASK);
    if (taskUrl) lines.push(``, `Open it here: ${taskUrl}`);
    return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/**
 * Record what happened on one channel.
 *
 * Upserts by channel rather than appending, so a retry overwrites its own row
 * instead of leaving two contradictory answers to "did it go out".
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
 * WhatsApp send died is still a nudge, counted on the task with `failed`
 * recorded against the WhatsApp row, which is exactly what the sender needs to
 * see. That is why every branch here is wrapped rather than allowed to throw.
 */
const populated = (nudge) => Nudge.findById(nudge._id)
    .populate('nudgedBy', 'name profilePic')
    .populate('recipient', 'name profilePic');

/**
 * Everything that must finish before the sender gets a response.
 *
 * In-app only. It is a single local write and it is the record the per-task
 * count counts, so it is the one thing worth making the user wait for.
 *
 * WhatsApp is deliberately NOT sent here — see deliverWhatsApp below.
 */
const dispatchNudge = async ({ nudge, doc, sender, recipient }) => {
    try {
        await Notification.create({
            recipient: recipient._id,
            title: `Nudge on "${doc.title}"`,
            message: `${sender.name} ${NUDGE_HEADLINE}. ${NUDGE_ASK}`,
            type: 'TASK',
            link: `/task/${doc._id}`,
            refKey: `nudge:${nudge._id}`
        });
        setDelivery(nudge, 'inApp', 'sent', 'delivered');
    } catch (err) {
        console.error('[NUDGE] in-app failed:', err.message);
        setDelivery(nudge, 'inApp', 'failed', err.message);
    }

    // Recorded up front so the row exists in the state it is actually in:
    // asked for, not yet attempted. If the process dies before the background
    // send runs, it stays `pending` — which is honest, and exactly the gap a
    // real delivery queue closes later.
    if (nudge.channels.includes('whatsapp')) {
        setDelivery(nudge, 'whatsapp', 'pending', 'Queued');
    }

    await nudge.save();

    const payload = await populated(nudge);
    emitToUser(recipient._id, 'nudge:new', payload.toObject());
    emitToTask(doc._id, 'task:nudge', payload.toObject());

    return payload;
};

/**
 * The WhatsApp send, run *after* the response has gone out.
 *
 * This is the slow part by a wide margin. OpenWA drives WhatsApp Web inside a
 * headless Chromium, and its `SIMULATE_TYPING` anti-ban delay alone can add
 * several seconds per message — none of which the person who pressed Nudge
 * should sit and watch, because nothing they do next depends on it.
 *
 * The result is written back to the delivery row and pushed over the socket, so
 * a failure still surfaces on the task panel moments later rather than being
 * lost. Never throws: it runs unawaited, and an unhandled rejection here would
 * take the process down.
 */
const deliverWhatsApp = async ({ nudgeId, doc, sender, recipient, appUrl }) => {
    try {
        const nudge = await Nudge.findById(nudgeId);
        if (!nudge) return;

        if (recipient.whatsappNotificationsEnabled === false) {
            setDelivery(nudge, 'whatsapp', 'skipped', 'Employee has opted out of WhatsApp');
        } else {
            const number = recipient.whatsappNumber || recipient.phoneNumber;
            const res = await whatsapp.sendWhatsAppMessage(
                number,
                buildPlainMessage({
                    senderName: sender.name,
                    doc,
                    taskUrl: `${appUrl}/task/${doc._id}`
                })
            );
            setDelivery(
                nudge,
                'whatsapp',
                res.ok ? 'sent' : (res.skipped ? 'skipped' : 'failed'),
                res.detail
            );
        }

        await nudge.save();

        // Second push: the panel swaps "queued" for the real outcome without a
        // refresh, and a failure shows up on its own.
        const payload = await populated(nudge);
        emitToTask(doc._id, 'task:nudge', payload.toObject());
    } catch (err) {
        console.error('[NUDGE] whatsapp delivery failed:', err.message);
    }
};

module.exports = {
    NUDGE_COOLDOWN_MINUTES,
    NUDGE_HEADLINE,
    NUDGE_ASK,
    canNudgeOn,
    dispatchNudge,
    deliverWhatsApp,
    buildPlainMessage
};
