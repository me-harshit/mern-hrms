const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');

const { CAN_ASSIGN, getScopedEmployees, getScopedProjects } = require('../utils/taskScoping');
const { todayIST } = require('../utils/recurringSchedule');
const { parseTranscript, resolveDrafts } = require('../utils/geminiVoiceTask');

/**
 * Voice-driven task creation (BulkVoiceTask.md).
 *
 * The browser does its own speech-to-text (Web Speech API) and only ever
 * sends plain transcript text here — no audio, no file upload. This route
 * turns that text into reviewable drafts; it never writes to the database
 * itself. Actual task creation still goes through the existing
 * POST /api/tasks and POST /api/tasks/recurring, exactly as the manual form
 * uses them, so every scoping/validation rule those routes already enforce
 * applies here unchanged.
 */
router.post('/parse', auth, async (req, res) => {
    try {
        if (!CAN_ASSIGN.includes(req.user.role)) {
            return res.status(403).json({ message: 'You are not allowed to assign tasks' });
        }

        const transcript = String(req.body.transcript || '').trim();
        if (!transcript) {
            return res.status(400).json({ message: 'Nothing was heard — try recording again' });
        }
        if (transcript.length > 4000) {
            return res.status(400).json({ message: 'That recording is too long to parse in one go — try a shorter briefing' });
        }

        const [employees, projects] = await Promise.all([
            getScopedEmployees(req.user),
            getScopedProjects()
        ]);

        const rawDrafts = await parseTranscript({
            transcript,
            todayStr: todayIST(),
            employees,
            projects
        });

        if (rawDrafts.length === 0) {
            return res.json({ drafts: [], message: "Couldn't make out any task instructions in that recording." });
        }

        const drafts = resolveDrafts(rawDrafts, { employees, projects });
        res.json({ drafts });
    } catch (err) {
        console.error('Voice Task Parse Error:', err);
        const message = err.message === 'GEMINI_API_KEY is not configured on the server.'
            ? err.message
            : 'Server error while parsing the voice command';
        res.status(500).json({ message });
    }
});

module.exports = router;
