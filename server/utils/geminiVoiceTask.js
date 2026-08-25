const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { todayIST, addDays, weekday, isValidDateStr } = require('./recurringSchedule');

/**
 * Turns a spoken task briefing (already transcribed to text in the browser —
 * see BulkVoiceTask.md §2) into one or more structured task-creation drafts.
 *
 * Gemini's only job here is understanding English. It never sees anyone
 * outside the caller's own scoped roster/project list (both are built by the
 * route from utils/taskScoping, exactly like the manual form's dropdowns),
 * it never returns a database id, and it never computes exact calendar
 * dates for a recurring run — all of that stays deterministic, server-side
 * Node code in resolveDrafts() below. See BulkVoiceTask.md §5 for why.
 */

const genAI = () => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured on the server.');
    }
    return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
};

const TASK_TYPES = ['Project Task', 'Regular Office Task'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const MAX_DRAFTS = 20;
const MAX_RECURRING_COUNT = 60; // guard against a hallucinated/mis-heard count

const draftSchema = {
    type: SchemaType.ARRAY,
    items: {
        type: SchemaType.OBJECT,
        properties: {
            kind: { type: SchemaType.STRING, enum: ['single', 'recurring'] },
            title: { type: SchemaType.STRING },
            description: { type: SchemaType.STRING },
            taskType: { type: SchemaType.STRING, enum: TASK_TYPES },
            projectNameGuess: { type: SchemaType.STRING, nullable: true },
            assigneeNamesGuess: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            priority: { type: SchemaType.STRING, enum: PRIORITIES },
            startDateGuess: { type: SchemaType.STRING, nullable: true },
            dueDateGuess: { type: SchemaType.STRING, nullable: true },
            recurrence: {
                type: SchemaType.OBJECT,
                nullable: true,
                properties: {
                    unit: { type: SchemaType.STRING, enum: ['calendar_day', 'working_day'] },
                    count: { type: SchemaType.INTEGER }
                }
            },
            notes: { type: SchemaType.STRING }
        },
        required: ['kind', 'title', 'taskType', 'assigneeNamesGuess', 'priority']
    }
};

const SYSTEM_INSTRUCTION = `You turn a manager's spoken task briefing into structured task-assignment drafts for an HR system. Output strictly follows the given JSON schema — no prose.

Rules:
- Only output tasks the speaker is actually assigning to someone. Ignore small talk, greetings, or anything that isn't a work instruction.
- "kind" is "recurring" only when the speaker explicitly describes repetition ("every day", "daily", "for the next N days/weeks"). Otherwise "single".
- assigneeNamesGuess: names exactly as spoken, one entry per person. If ONE task is for several people, put all their names in that ONE draft — only create separate drafts when the speaker is clearly describing different, unrelated pieces of work.
- projectNameGuess: only set this for project-related work; leave it null and set taskType to "Regular Office Task" for routine internal work not tied to a client project.
- startDateGuess / dueDateGuess: resolve relative dates ("tomorrow", "next Friday", "in 3 days") against the given "today" date. Format strictly as YYYY-MM-DD. Leave null if genuinely not stated — never guess a date that wasn't implied.
- recurrence: only present when kind is "recurring". "unit" is "working_day" for the common case (implicitly skips Sundays), or "calendar_day" only if the speaker explicitly insists on including Sundays. "count" is how many occurrences were asked for — do not try to compute the actual calendar dates yourself, just the count and unit.
- notes: plain-English flag for anything you're unsure about (e.g. "unclear if urgent"). Leave empty if nothing is ambiguous.
- Never invent an employee or project name that was not spoken, and never pick one from the provided roster just because it sounds similar — leave the name as you heard it and let the system match it.`;

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Handing the model the weekday name alongside the date measurably cuts
// "this Friday"-style off-by-one errors versus making it derive the weekday
// from the date itself — confirmed against a real Gemini call while building
// this (see server/scripts/testVoiceTaskParse.js).
const buildUserPrompt = ({ transcript, todayStr, employees, projects }) => `Today's date: ${todayStr}, a ${WEEKDAY_NAMES[weekday(todayStr)]} (YYYY-MM-DD format)

Employees who work under the speaker (only these may be assigned):
${employees.map(e => `- ${e.name}`).join('\n') || '(none available)'}

Active projects:
${projects.map(p => `- ${p.name}`).join('\n') || '(none available)'}

Transcript of the manager's spoken briefing:
"""
${transcript}
"""

Extract the task(s) being assigned, per the schema.`;

/**
 * Calls Gemini once and returns the raw (unresolved) drafts array. Never
 * throws on a malformed model response — an empty array just means "nothing
 * usable was heard", which the route reports back plainly.
 */
const parseTranscript = async ({ transcript, todayStr, employees, projects }) => {
    const model = genAI().getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: draftSchema
        }
    });

    const result = await model.generateContent(buildUserPrompt({ transcript, todayStr, employees, projects }));
    const text = result.response.text();

    let drafts;
    try {
        drafts = JSON.parse(text);
    } catch (err) {
        console.error('[VOICE TASK] Gemini returned non-JSON output:', text);
        return [];
    }

    return Array.isArray(drafts) ? drafts.slice(0, MAX_DRAFTS) : [];
};

const normalise = (s) => String(s || '').toLowerCase().trim();

// Exact match first, then a narrowing substring match — only returns a match
// when exactly one candidate remains, so an ambiguous name is surfaced to the
// manager rather than silently guessed.
const matchByName = (nameHeard, pool, idOf, nameOf) => {
    const heard = normalise(nameHeard);
    if (!heard) return { nameHeard, id: null, name: null, matched: false, candidates: [] };

    const exact = pool.find(p => normalise(nameOf(p)) === heard);
    if (exact) return { nameHeard, id: idOf(exact), name: nameOf(exact), matched: true, candidates: [] };

    const startsWith = pool.filter(p => {
        const n = normalise(nameOf(p));
        return n.startsWith(heard) || heard.startsWith(n);
    });
    if (startsWith.length === 1) {
        return { nameHeard, id: idOf(startsWith[0]), name: nameOf(startsWith[0]), matched: true, candidates: [] };
    }

    const words = heard.split(/\s+/).filter(w => w.length > 2);
    const contains = pool.filter(p => {
        const n = normalise(nameOf(p));
        return n.includes(heard) || words.some(w => n.includes(w));
    });
    const pool2 = startsWith.length > 1 ? startsWith : contains;
    if (pool2.length === 1) {
        return { nameHeard, id: idOf(pool2[0]), name: nameOf(pool2[0]), matched: true, candidates: [] };
    }

    return {
        nameHeard,
        id: null,
        name: null,
        matched: false,
        candidates: pool2.slice(0, 5).map(p => ({ id: idOf(p), name: nameOf(p) }))
    };
};

const matchPerson = (nameHeard, employees) =>
    matchByName(nameHeard, employees, e => e._id.toString(), e => e.name);

const matchProject = (nameHeard, projects) =>
    matchByName(nameHeard, projects, p => p._id.toString(), p => p.name);

// Walks forward from `start`, skipping Sundays when unit is 'working_day',
// exactly like the manual calendar's "Next N working days" quick-pick
// (client/src/components/ScheduleCalendar.js). Deliberately does not know
// about holidays or leave here — those are re-evaluated fresh every morning
// by the generation cron regardless of what plannedDates says (TaskPlan.md
// §13.5), so baking them into a one-off client-side guess would be a false
// precision, not a real one.
const walkPlannedDates = ({ start, count, unit }) => {
    const out = [];
    let cursor = start;
    let guard = 0;
    while (out.length < count && guard++ < count + 120) {
        if (unit === 'calendar_day' || weekday(cursor) !== 0) out.push(cursor);
        cursor = addDays(cursor, 1);
    }
    return out;
};

const resolveRecurringDates = (raw) => {
    const count = Number.isFinite(raw?.recurrence?.count)
        ? Math.min(Math.max(Math.round(raw.recurrence.count), 1), MAX_RECURRING_COUNT)
        : 0;
    if (count === 0) return { plannedDates: [], targetCount: 0 };

    const unit = raw.recurrence.unit === 'calendar_day' ? 'calendar_day' : 'working_day';
    const start = isValidDateStr(raw.startDateGuess) && raw.startDateGuess >= todayIST()
        ? raw.startDateGuess
        : todayIST();

    const plannedDates = walkPlannedDates({ start, count, unit });
    return { plannedDates, targetCount: plannedDates.length };
};

const resolveSingleDates = (raw) => ({
    startDate: isValidDateStr(raw.startDateGuess) ? raw.startDateGuess : null,
    dueDate: isValidDateStr(raw.dueDateGuess) ? raw.dueDateGuess : null
});

/**
 * Enriches Gemini's raw guesses with deterministic, permission-safe
 * resolution: names -> ids from the caller's own scoped roster, and
 * recurrence -> real dates. `hasBlockingIssue` is true whenever the review
 * screen must stop the manager before this draft can be submitted.
 */
const resolveDrafts = (rawDrafts, { employees, projects }) => {
    return rawDrafts.map((raw) => {
        const kind = raw.kind === 'recurring' ? 'recurring' : 'single';
        const taskType = TASK_TYPES.includes(raw.taskType) ? raw.taskType : 'Project Task';
        const priority = PRIORITIES.includes(raw.priority) ? raw.priority : 'Medium';
        const isOfficeTask = taskType === 'Regular Office Task';

        const names = Array.isArray(raw.assigneeNamesGuess) ? raw.assigneeNamesGuess : [];
        const resolvedAssignees = names.map(n => matchPerson(n, employees));

        const resolvedProject = (!isOfficeTask && raw.projectNameGuess)
            ? matchProject(raw.projectNameGuess, projects)
            : null;

        const resolvedDates = kind === 'recurring' ? resolveRecurringDates(raw) : resolveSingleDates(raw);

        const hasUnmatchedAssignee = resolvedAssignees.length === 0 || resolvedAssignees.some(a => !a.matched);
        const hasUnresolvedProject = !isOfficeTask && (!resolvedProject || !resolvedProject.matched);
        const hasMissingDates = kind === 'recurring'
            ? resolvedDates.plannedDates.length === 0
            : !resolvedDates.dueDate;

        return {
            kind,
            title: (raw.title || '').trim(),
            description: (raw.description || '').trim(),
            taskType,
            priority,
            notes: (raw.notes || '').trim(),
            resolvedAssignees,
            resolvedProject,
            resolvedDates,
            hasBlockingIssue: !raw.title || hasUnmatchedAssignee || hasUnresolvedProject || hasMissingDates
        };
    });
};

module.exports = { parseTranscript, resolveDrafts };
