# Bulk Voice Task Creation — Feature Plan

Status: **PLANNED — not yet built.**

Goal: let a Manager/Team Lead/Admin/HR speak a task briefing instead of filling the form by hand — one task, one task to several people, or several unrelated tasks in a single recording (including recurring/daily ones) — and have it come out the other side as the exact same drafts a human would have typed, sitting in a review screen for confirmation before anything is created.

Decisions locked in from the initial Q&A (see bottom for what's still open):

| Question | Decision |
|---|---|
| How does audio become structured data? | **Browser Web Speech API for transcription** (not raw audio sent to Gemini) — the transcript text is what goes to Gemini |
| Review before create? | **Always.** Nothing is written to the DB until the manager clicks Create |
| What counts as "bulk"? | **Everything a human can do manually**: one task/many assignees, several distinct tasks, and recurring/repetitive tasks — all in one recording |
| Where does it live? | **A dedicated page** (`/add-task/voice`, linked from a "Voice Assign" button on `AddTask.js`) — not folded into the single-task form, since "several distinct tasks in one recording" needs a *list* of drafts, not one form |

---

## 1. Why this fits cleanly

Two pieces this feature needs already exist and are reused, not rebuilt:

| Piece | File | Reused as |
|---|---|---|
| Gemini SDK + API key | `@google/generative-ai` in `server/package.json`, `GEMINI_API_KEY` in `.env` | Same client, same env var. `server/controllers/chatController.js` already proves the pattern (model `gemini-2.5-flash`, server-side only) |
| Voice capture UX | `client/src/hooks/useAudioRecorder.js` + `components/AudioRecorder.js` (built for task-discussion voice notes) | **Not reused directly** — that hook records an audio *blob* for upload/playback. This feature needs live *text*, so it gets its own hook (§2) built the same way (feature-detected, same idle→recording→preview shape) |
| Task creation validation, scoping, notifications | `POST /api/tasks` (`server/routes/tasks.js`), `POST /api/tasks/recurring` (`server/routes/recurringTasks.js`), `server/utils/taskScoping.js` | **Untouched.** Voice never creates a task directly — it only ever calls these same routes, the same way the manual form does (§4) |
| Deterministic date math | `server/utils/recurringSchedule.js` (`todayIST`, `addDays`, `weekday`, `isValidDateStr`), `normaliseDates()` in `routes/recurringTasks.js` | Reused for turning "every day for 10 days" into real `plannedDates` — **never trust the model to do calendar arithmetic** |
| Multi-select / date UI | `EmployeeMultiSelect.js`, `DatePickerField.js`, `ScheduleCalendar.js` | Reused as-is for both the single-draft autofill and the multi-draft review cards |

Net new work is small: one speech-to-text hook, one Gemini prompt/endpoint, one draft-review UI. No new npm dependencies, no new create-path logic on the server.

---

## 2. Speech capture — `useVoiceDictation` (new hook, client)

Wraps the browser's native `SpeechRecognition` (`window.SpeechRecognition || window.webkitSpeechRecognition`) — **no server round-trip, no dependency, free.**

```
idle → listening → (interim captions update live) → stopped → transcript ready for edit
```

- `continuous: true`, `interimResults: true` so the manager sees a live caption ("assign the client report to Rahul and…") while talking, same immediacy as `useAudioRecorder`'s live level bars.
- `lang` defaults to `en-IN` (handles a lot of Hinglish reasonably); exposed as a switchable setting, not hardcoded — see Open Questions.
- Auto-stops after ~2.5s of silence (via `onspeechend`/`onend` + manual restart-until-Stop-pressed pattern, since Chrome's recognizer stops on any pause by default and needs to be restarted to feel "continuous"), or the manager taps Stop.
- `isSupported` feature-detect exactly like `useAudioRecorder.isSupported` / `useScreenRecorder` — Chrome/Edge desktop: yes. Safari: partial. Firefox: no. When unsupported, the "🎤 Voice Assign" toggle in `AddTask.js` simply doesn't render — same graceful-degrade precedent as the screen recorder (TaskPlan.md §12).
- **The transcript is always shown in an editable textarea before parsing.** A mic mishearing "Priya" as "Freya" is corrected here by the manager, not fought with better STT — this is the real safety net, not recognition accuracy.

Component: `VoiceCommandBar` — mic button, live caption line, editable transcript box, "Parse with AI" button (disabled while empty), "Re-record" to discard and start over.

---

## 3. Structured parsing — Gemini call (server, new)

### Endpoint

`POST /api/tasks/voice/parse` — `auth`, gated on `CAN_ASSIGN` (same roles as task creation: `MANAGER`, `TEAM LEAD`, `ADMIN`, `HR`).

**Body:** `{ transcript: string }` — plain JSON, no file upload. Small, cheap, no multer/staging involved.

**What the server sends Gemini** (all built server-side, never trust the client for this):
- The transcript.
- Today's date in IST (`todayIST()` from `recurringSchedule.js`), so "Friday" / "tomorrow" / "next 10 days" resolve against the real date.
- The caller's **own scoped employee roster** — `getScopedEmployees(req.user)` (name + id). A Team Lead's Gemini call only ever sees their own team; a Manager sees everyone. This is the same call `assignable-employees` already makes.
- The caller's scoped project list — `getScopedProjects()`.
- The fixed enums: `taskType`, `priority`.

### Why structured output, not function-calling

`chatController.js` uses Gemini's function-calling loop (ask → tool call → feed DB result back → final answer) because it's a multi-turn conversation over live data. This feature is a single-shot extraction with no back-and-forth, so it uses **`generationConfig.responseMimeType: 'application/json'` + `responseSchema`** instead (supported in the installed `@google/generative-ai` SDK) — one call, strictly-shaped JSON out, no second round trip.

Response schema — an **array of drafts**, because "bulk" here explicitly includes multiple distinct tasks in one utterance:

```js
{
  type: "array",
  items: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["single", "recurring"] },
      title: { type: "string" },
      description: { type: "string" },
      taskType: { type: "string", enum: ["Project Task", "Regular Office Task"] },
      projectNameGuess: { type: "string", nullable: true },
      assigneeNamesGuess: { type: "array", items: { type: "string" } },
      priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"] },
      startDateGuess: { type: "string", nullable: true },   // YYYY-MM-DD or null
      dueDateGuess: { type: "string", nullable: true },
      recurrence: {
        type: "object", nullable: true,
        properties: {
          unit: { type: "string", enum: ["calendar_day", "working_day"] },
          count: { type: "integer" }
        }
      },
      notes: { type: "string" }   // anything Gemini wants to flag as ambiguous
    },
    required: ["kind", "title", "taskType", "assigneeNamesGuess", "priority"]
  }
}
```

Deliberately **names, not ids**: Gemini returns `"Rahul"`, never a Mongo ObjectId. Resolving a name to an id is a permissions-relevant decision and stays entirely in Node (§3.1) — the model is only ever asked to *understand English*, never to *decide who is allowed to be assigned*.

Deliberately **no exact recurring dates from the model**: it returns `{ unit: 'working_day', count: 10 }`, not a list of ten dates. LLMs are unreliable at exact calendar math; the actual `plannedDates` are computed the same deterministic way the manual "Next 10 working days" quick-pick in `ScheduleCalendar.js` already does (§3.2).

### 3.1 Resolving names → ids (server, deterministic)

A small hand-rolled matcher (no new dependency, consistent with this codebase's low-dependency style) run against the **already-scoped** roster/project list from §3:

1. Exact case-insensitive match.
2. Substring / starts-with match ("Raj" → "Rajesh Kumar").
3. If still nothing, or more than one candidate ties, leave it **unresolved** with the candidate list attached — this is a review-screen flag, never a guess the code makes for the manager.

Because the roster handed to Gemini (and matched against here) was already filtered by `getScopedEmployees(req.user)`, **a name can never resolve to someone outside the caller's permitted scope** — the matcher literally has no one else to pick from. Same for projects via `getScopedProjects()`.

### 3.2 Resolving recurrence → real dates (server, deterministic)

`{ unit: 'working_day', count: 10 }` + a resolved `startDateGuess` (or `todayIST()` if the model left it null) is walked forward exactly like the manual quick-picks: skip Sundays via `weekday()`, using `addDays()` from `recurringSchedule.js`. The result is a plain `plannedDates[]` array — from here on it is indistinguishable from a manager having dragged a range on `ScheduleCalendar`, and can be handed straight into the existing `POST /recurring/preview` call to show the same "8 will run, 2 skipped" footer the manual flow already has.

### Response shape back to the client

```js
{
  drafts: [
    {
      // everything from Gemini, plus:
      resolvedAssignees: [{ nameHeard: "Rahul", id, name, matched: true }, { nameHeard: "Freya", id: null, matched: false, candidates: [...] }],
      resolvedProject: { nameHeard: "...", id, name, matched: true } | null,
      resolvedDates: { startDate, dueDate } | { plannedDates: [...], targetCount },
      hasBlockingIssue: boolean   // any unmatched name/project, or a recurring task with 0 resolved dates
    }
  ]
}
```

---

## 4. Review UI — a dedicated page (`/add-task/voice`)

`AddTask.js` gets one addition: a **"🎤 Voice Assign"** button in its header that navigates to `VoiceAssignTask.js`, a standalone page. Voice input needs a review surface built around a *list* of drafts (since one recording can yield several unrelated tasks), which doesn't fit naturally as a mode of a single-task form — so it's its own page rather than a toggle inside `AddTask.js`, and `AddTask.js` itself is otherwise untouched.

The page shows `VoiceCommandBar` (record → live captions → editable transcript → Parse) until a parse succeeds, then swaps to `VoiceTaskDraftList` — every parsed task, whether it's one or several, goes through the same list view for a consistent review experience regardless of how many things were heard.

### The draft list — one card per task

Each parsed task is its own card, defaulting to a **one-line collapsed summary** ("Rahul, Priya · Website Redesign · High · due Fri") — except a card with something unresolved (an unmatched name, a missing date) starts **expanded automatically**, so problems are visible without hunting for them.

Every card carries its own:
- **Edit** — expands the card into the same field set the single-task form uses (`EmployeeMultiSelect`, project/priority `<select>`s, date inputs, recurrence start/count), so there's no second form implementation, just the same fields repeated per card
- **Create** — creates *that task alone*, immediately, independent of the others
- an include checkbox and a remove (🗑) button, so an unwanted draft can be dropped from the batch entirely

A **"Create All"** button sits in a sticky header at the top of the page (not buried at the bottom), alongside a live count ("4 to create · 1 needs attention"). It walks every included, not-yet-created card **sequentially** (not `Promise.all`) and, per card, calls the exact existing endpoint:
- `kind: 'single'` → `POST /api/tasks` (multipart, same body shape `AddTask.js` already builds)
- `kind: 'recurring'` → `POST /api/tasks/recurring`

A card that fails shows the server's own error message and stays editable/retryable — via its own Create button or the next Create All pass — without re-submitting cards that already succeeded. Once every included card is done, the header's action becomes "Done — Go to Tasks." No bulk-create endpoint, no duplicated create logic — every card's create is the exact same request the manual form already makes, just sent once per card, whether triggered individually or via Create All.

---

## 5. The permission boundary — worth stating explicitly

Gemini's only job in this feature is **turning messy English into a structured guess**. It never:
- touches the database,
- sees anyone outside the caller's own `getScopedEmployees`/`getScopedProjects` result,
- causes a task to be created on its own.

Every actual write still goes through `POST /api/tasks` or `POST /api/tasks/recurring` exactly as today, which **independently** re-check `CAN_ASSIGN` and re-validate every assignee id against `getScopedEmployees(req.user)` server-side, regardless of what the client sends. A hallucinated or malicious transcript can, at worst, produce a draft the manager has to explicitly review and click Create on — it cannot assign work outside the caller's real permissions, because the create routes don't trust the voice-parse output any more than they trust a hand-typed form submission.

---

## 6. New files

| File | Purpose |
|---|---|
| `client/src/hooks/useVoiceDictation.js` | Web Speech API wrapper — idle/listening/stopped, live interim captions |
| `client/src/components/VoiceCommandBar.js` | Mic button, live caption, editable transcript, Parse/Re-record |
| `client/src/components/VoiceTaskDraftList.js` | Per-task cards (collapsed summary, Edit, individual Create) + a top "Create All" |
| `client/src/pages/Admin/VoiceAssignTask.js` | The dedicated page (`/add-task/voice`) hosting the two components above |
| `client/src/utils/scheduleDates.js` | `+nextWorkingDays()` — lets a card's recurring dates be retimed without the full calendar picker |
| `server/utils/geminiVoiceTask.js` | Prompt + `responseSchema` + the Gemini call, name/project fuzzy resolution, recurrence→dates |
| `server/routes/voiceTasks.js` | `POST /api/tasks/voice/parse`, mounted at `/api/tasks/voice` (before `/api/tasks`, `CAN_ASSIGN`-gated) |

Touched, minimally: `client/src/App.js` (+1 route), `client/src/pages/Admin/AddTask.js` (+1 button, navigates away — no internal state), `server/index.js` (+1 mount). `Task.js`, `RecurringTask.js`, `taskScoping.js`, and both create routes are untouched.

---

## 7. Build order

1. `useVoiceDictation` hook + feature detection
2. `VoiceCommandBar` — mic, live captions, editable transcript
3. `server/utils/geminiVoiceTask.js` — schema, prompt, Gemini call
4. Server-side name/project fuzzy resolver + deterministic recurrence date computation (reusing `recurringSchedule.js`)
5. `POST /api/tasks/voice/parse` route
6. `VoiceTaskDraftList.js` — per-card Edit/Create, sticky "Create All" header
7. `VoiceAssignTask.js` page + route + the "Voice Assign" button on `AddTask.js`
8. Manual test pass:
   - one task, one assignee
   - one task, several assignees
   - two unrelated tasks in one recording, different assignees/projects
   - a recurring phrase ("every day for the next 10 days")
   - a name that doesn't match anyone in scope (unmatched-candidate flag shows, form doesn't silently guess)
   - a Team Lead's recording naming someone outside their team (must come back unmatched, never auto-resolved)
   - unsupported browser (Firefox) → voice mode hidden, form works normally

---

## 8. Open questions

1. **Recognition language.** Default `en-IN`. Worth a language toggle for Hindi-medium briefings (`hi-IN`), or is English/Hinglish enough for v1?
2. **Gemini model.** `chatController.js` uses `gemini-2.5-flash` — same default recommended here for consistency and cost, but structured extraction may do better on `gemini-2.5-pro` if flash mis-parses multi-task recordings often in testing. Worth revisiting after real usage.
3. **Read-back confirmation (TTS).** Raised in the initial discussion — after parsing, have the browser (or a nicer voice via a service like Edge TTS) read the drafts back before the manager reviews the screen. Recommended as a **Phase 2 nice-to-have**, not required for v1: the visual review screen is already the safety net, and the browser's built-in `speechSynthesis` (zero new dependency) would be the natural first cut if wanted, rather than pulling in an external TTS service.
4. **Recording length cap.** `useAudioRecorder` caps voice notes at 5 minutes; a task-briefing dictation is likely much shorter. Recommend capping continuous listening at ~90 seconds with a visible countdown, auto-stopping into the transcript box — open to adjustment once real usage is seen.
5. **Retry semantics on "Create All."** If 2 of 5 drafts fail (e.g. a project got archived mid-review), should the successful 3 auto-navigate to the task list, or should the manager stay on the review screen until every row is green? Leaning toward: stay until every row is resolved, with successes locked (greyed, non-resubmittable) and failures still editable.
