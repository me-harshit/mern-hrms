# Task Management — Feature Plan

Status: **Implemented and verified end-to-end.** See §9 for what changed during the first build, and **§11 for changes made after it** — sections 3–6 and 10 describe the original design and have since been superseded in places. Read §11 before trusting them.

§12 is a **planned, not-yet-built** feature.

Goal: let a **Manager** or **Team Lead** create and assign a task — to one or several employees at once — within a specific project, with priority, timeline, and image/video attachments. Assignees get notified in their existing notification panel (bell icon + `/notifications` page) and see their tasks in a new "My Tasks" view. Videos are compressed and pushed to S3 in a nightly batch rather than blocking the upload.

---

## 1. What already exists (reused, not rebuilt)

| Piece | File | Reused as-is? |
|---|---|---|
| Roles | `server/models/User.js` — `EMPLOYEE, ADMIN, HR, MANAGER, TEAM LEAD, ACCOUNTS` | Yes |
| Team scoping | `reportingManagerEmail[]`, `teamLeadsEmail[]` on `User` | Yes — same pattern `employee.js` and `expenses.js` already use to scope a Manager/Team Lead to "their people" |
| Project scoping | `Project.projectLead` (ObjectId → User) | Yes — same pattern `expenses.js` `/status` route uses to check "is this Manager the lead of this project" |
| Notifications | `Notification` model + `/api/notifications` routes + bell dropdown in `Topbar.js` + full list in `pages/User/Notifications.js` | Yes, extended — add a `TASK` type and a `link` field (the client already reads `notif.link` in both Topbar and Notifications page, but the schema never actually had that field — small pre-existing gap closed as part of this) |
| Image upload | `middleware/uploadMiddleware.js` (multer, memory storage) + `utils/s3Service.js` `uploadToS3()` | Yes, unchanged — images still go straight to S3, resized via `sharp`, exactly like expense attachments today |
| Scheduled jobs | `server/cron/attendanceCron.js` using `node-cron` (already a dependency) | Yes — the new video-compression job follows the same file/registration pattern |
| Pagination UI | `client/src/components/Pagination.js` | Yes |
| List/filter/search pattern | `routes/expenses.js` `/all`, `pages/Admin/Projects.js` | Yes, same shape |
| Static file serving | `index.js` already does `app.use('/uploads', express.static(...))`, and `server/uploads/` already exists (currently empty/unused) | Yes — this is what makes raw videos viewable immediately, before compression |

---

## 2. Video handling — the two-stage pipeline you asked for

**Requirement:** uploading a task shouldn't hang waiting for video compression, but nothing gets pushed to S3 uncompressed. Raw video lands on the VPS immediately; a nightly batch job compresses it and moves the compressed copy to S3.

**Flow:**

1. **At upload time** (task creation, or an employee attaching completion proof):
   - Images → unchanged, compressed by `sharp` and uploaded to S3 synchronously (fast, small, no reason to defer).
   - Videos → **not** touched by ffmpeg or S3 at this point. The raw file is written straight to disk at `server/uploads/pending-videos/<uuid>.<ext>`, and the API responds immediately. The task is saved with that video pointing at the local static path (`/uploads/pending-videos/<uuid>.mp4`), so it's **playable right away** through the site (via the existing static `/uploads` route) — nobody has to wait until midnight to see it, only the "final, compressed, S3-hosted" version is deferred.
   - A queue entry is written recording "this file still needs compressing."

2. **At midnight** (`node-cron`, e.g. `0 0 * * *`), a batch job:
   - Picks up every queued video, processes them a couple at a time (not all at once — caps CPU load on the VPS) via `fluent-ffmpeg` (wrapping a bundled `@ffmpeg-installer/ffmpeg` binary, so the VPS doesn't need ffmpeg installed system-wide).
   - Compresses each to H.264 MP4 (default: max width 1280px, CRF 28, AAC audio ~128kbps — tunable).
   - Uploads the compressed result to S3 under `Tasks/<ProjectName>/`.
   - Updates that specific attachment's `url` on the Task document to the new S3 link and flips its status to `ready`.
   - Deletes the local raw file (and the temp compressed file) to reclaim VPS disk space.
   - On failure, leaves the queue entry for a retry the next night (up to 3 attempts, then flagged `failed` and left for manual attention — nothing is silently lost).

**New dependencies:** `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg` (adds ~60-80MB to `node_modules` for the bundled binary — normal for this approach).

**New model — `server/models/VideoCompressionQueue.js`:**

| Field | Type | Notes |
|---|---|---|
| `taskId` | ObjectId → `Task` | |
| `mediaId` | ObjectId | The `_id` of the specific media subdocument inside the Task's attachment array (Mongoose auto-assigns subdocument IDs, so this is a stable pointer even if the array is reordered) |
| `field` | enum `attachments` / `completionProof` | Which array on the Task this media lives in |
| `localPath` | String | Where the raw file currently sits on the VPS |
| `status` | enum `queued / processing / done / failed` | |
| `attempts` | Number, default 0 | |
| `lastError` | String | |

Kept as its own collection (rather than a status flag buried in Task) so the nightly job has one simple query — `find({status: {$in: ['queued','failed']}, attempts: {$lt: 3}})` — instead of scanning every task's nested arrays.

**Operational note:** raw videos sit on the VPS disk between upload and the next midnight run, so disk headroom needs to comfortably cover a day's worth of video uploads. Worth a rough size cap per upload (see Open Question #3) and maybe a periodic disk-usage check, but not a blocker for v1.

---

## 3. Data model — new `Task` collection

`server/models/Task.js`

| Field | Type | Notes |
|---|---|---|
| `title` | String, required | |
| `description` | String | Plain textarea is enough for v1 |
| `projectId` | ObjectId → `Project`, required | |
| `assignedBy` | ObjectId → `User`, required | Manager/Team Lead/Admin/HR who created it |
| `priority` | enum `Low / Medium / High / Urgent`, default `Medium` | |
| `startDate` | Date | |
| `dueDate` | Date, required | |
| `attachments` | `[MediaSchema]` | Uploaded by the creator at task creation (images ready immediately, videos `processing_compression` until the nightly job finishes them) |
| `assignees` | `[AssigneeProgressSchema]` | **One entry per assigned employee** — see below. This is the answer to "assign multiple employees to a single task": one `Task` document, shared title/description/project/deadline/attachments, but each person's own progress is tracked independently so nobody's completion gets conflated with anyone else's. |
| `isArchived` | Boolean, default `false` | Soft-delete |

`MediaSchema` (subdocument, keeps its own `_id` so the compression queue can reference it):
```js
{
    url: String,        // local /uploads path first, swapped to the S3 URL after compression (images: S3 immediately)
    type: 'image' | 'video',
    status: 'ready' | 'processing_compression'
}
```

`AssigneeProgressSchema` (subdocument):
```js
{
    user: ObjectId (→ User),
    status: 'To Do' | 'In Progress' | 'Blocked' | 'Completed',
    completedAt: Date,
    completionProof: [MediaSchema]   // optional photos/video this specific person attaches when they mark it done
}
```

**Task-level "overall status"** is *derived*, not stored — computed on read from the `assignees[]` array for list views:
- `Not Started` → everyone is `To Do`
- `In Progress` → at least one assignee has moved off `To Do`
- `Completed` → every assignee is `Completed`

This keeps per-person accountability (who on the team actually finished their part) while still letting "Task Management" show one row per task instead of one row per person.

**`Notification` model change** — add:
```js
type: { enum: [...existing, 'TASK'] }
link: { type: String, default: "" }   // e.g. "/my-tasks/<taskId>" — closes the existing dead link gap
```

---

## 4. Permissions

| Action | Who |
|---|---|
| Create a task | `MANAGER`, `TEAM LEAD`, `ADMIN`, `HR` |
| Assignee picker scope | **Admin / HR / Manager → any active employee in the HRMS.** **Team Lead → only people where `teamLeadsEmail` includes them.** Multi-select checkbox list, not a single dropdown. Enforced server-side, not just hidden in the UI. |
| Project picker scope | **Any Active project, for everyone who can assign.** |
| View "Tasks I Assigned" | The creator, plus Admin/HR (oversight) |
| View "My Tasks" | Anyone listed in that task's `assignees[]` — sees only their own row's status/proof, plus the shared task info |
| Edit task (title/description/priority/dates/project/add-remove assignees) | `assignedBy` or Admin/HR |
| Update **own** progress status / attach own completion proof | The assignee themself, for their own row only |
| Override any assignee's status | `assignedBy` or Admin/HR |
| Archive/delete | `assignedBy` or Admin/HR. Blocked once every assignee is `Completed`, same "can't touch a finished record" guard style as the expense delete route |
| `EMPLOYEE` role | Can only see/update tasks they're assigned to — cannot create tasks for others |

---

## 5. API routes — `server/routes/tasks.js`

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/tasks/assignable-employees` | Scoped employee list for the multi-select assignee picker |
| `POST` | `/api/tasks` | Create a task — `multipart/form-data` with `attachments` files + an `assigneeIds[]` array. Images upload to S3 synchronously; videos get staged to disk + queued (see §2). Fires one `TASK` notification per assignee, each initialized with `status: 'To Do'` |
| `GET` | `/api/tasks/my` | Paginated tasks where `req.user` is in `assignees[]` — filters: `status` (own row), `priority`, `projectId` |
| `GET` | `/api/tasks/assigned-by-me` | Paginated tasks `req.user` created — filters: derived overall `status`, `assigneeId`, `projectId` |
| `GET` | `/api/tasks/all` | Admin/HR — every task, same filter/search/pagination shape as `expenses/all` |
| `GET` | `/api/tasks/:id` | Single task detail — 403 unless one of the assignees / assignedBy / Admin / HR |
| `PUT` | `/api/tasks/:id` | Edit shared fields (title/description/priority/dueDate/projectId), add/remove assignees — assignedBy or Admin/HR only. Adding an assignee fires them a fresh `TASK` notification |
| `PUT` | `/api/tasks/:id/assignees/:userId/status` | Update one assignee's progress; accepts optional `completionProof` files when moving to `Completed`. Callable by that assignee for themself, or by assignedBy/Admin/HR for anyone. Fires a `TASK` notification to `assignedBy` ("X marked their part of '<task>' as Completed"), plus one more if that was the *last* assignee to finish ("All assignees have completed '<task>'") |
| `DELETE` | `/api/tasks/:id` | Archive (soft-delete) |

S3 subfolder convention for the compressed videos: `Tasks/<ProjectName>/`, same style as `Spectra/VendorPayment` used in the recent import script.

---

## 6. Client changes

### New pages
- `pages/Admin/Tasks.js` — "Task Management" list (Manager/Team Lead see their assigned tasks; Admin/HR see all). Table with project, assignee avatars (multiple), priority badge, due date (red if overdue), derived overall status with a small progress fraction like "2/4 done". Search + filters + pagination, same visual pattern as `Projects.js`/`AllExpenses.js`.
- `pages/Admin/AddTask.js` — creation form: title, description, project dropdown, assignee **multi-select** (checkbox list from the scoped employee list), priority, start/due date, file dropzone for images/videos (same upload UX as `AddExpense.js`). A short inline note that videos will appear immediately but the "optimized" copy finishes overnight.
- `pages/Admin/EditTask.js` — edit shared task details / add or remove assignees / override anyone's status.
- `pages/User/MyTasks.js` — employee's own panel, grouped by *their own* status (To Do / In Progress / Blocked / Completed) as cards, priority badge, due-date countdown/overdue flag, small "assigned with: Name, Name" note when it's a shared task. Click → detail view with description, attachments (image preview, `<video>` playback — shows a "processing…" chip if a video hasn't finished compressing yet), a status dropdown, and an optional "attach proof" upload when marking Complete.

### Routing (`App.js`)
```
/tasks           → Tasks.js         (isManagement only)
/add-task        → AddTask.js       (isManagement only)
/edit-task/:id   → EditTask.js      (isManagement only)
/my-tasks        → MyTasks.js       (everyone — Admin/Manager can be assignees too)
```

### Sidebar (`Sidebar.js`)
- Personal section (everyone): **"My Tasks"** link, with a badge count of open/overdue tasks — same visual pattern already used for `pendingDocs` on the "GTS Documents" link.
- Management block (`isManagement`): **"Task Management"** link near "Projects" / "Team Requests" — label reads "Assign Tasks" for Manager/Team Lead, "All Tasks" for Admin/HR.

### Notification wiring
No changes needed to `Topbar.js` / `Notifications.js` beyond the `link` field already being read — a `TASK` notification's `link` points to `/my-tasks/<id>` (assignee) or `/tasks/<id>` (assignedBy), and clicking it navigates straight there.

---

## 7. Open questions (defaults noted — flag anything you want changed)

1. ~~**Project scope for who a Manager/Team Lead can assign in.**~~ **DECIDED: any Active project.** The live data showed all 13 active projects are led by just 5 managers and **zero Team Leads**, so the "only projects you lead" rule would have locked the entire TEAM LEAD role out of the feature. Team scoping on *who* can be assigned is the real guardrail.

2. **Status set:** `To Do / In Progress / Blocked / Completed` per assignee — good enough, or something closer to Kanban with more states (e.g. `Under Review`)?

3. **Raw video size cap:** since raw videos sit on VPS disk (not S3) until the midnight job runs, what's a sane per-file limit? Recommended: `300MB`, adjustable.

4. **Compression settings:** default proposed above (max width 1280px, H.264 CRF 28, AAC 128kbps) — fine as a starting point, or do you have specific quality/size targets?

5. **Approval step:** should a Manager have to "confirm" an assignee's completion (like expense approval), or is the employee's own "Completed" mark final? Recommended: final for v1 — keeps scope tight, can add later.

6. **Due-date reminders:** a cron job (like `attendanceCron.js`) that nudges people a day before a task is due — worth building now, or later? Recommended: later (Phase 2).

7. ~~**Comments/discussion thread on a task.**~~ **BUILT** — see §10.

---

## 8. Build order (once you approve)

1. `Task` + `VideoCompressionQueue` models; `Notification` model tweak (`TASK` type, `link` field)
2. `server/routes/tasks.js` (all routes above) + mount in `index.js`
3. Video pipeline: local staging on upload, `server/cron/videoCompressionCron.js` (install `fluent-ffmpeg` + `@ffmpeg-installer/ffmpeg`), S3 helper for buffer-based uploads
4. `AddTask.js` + `Tasks.js` (management side)
5. `MyTasks.js` (employee side) + task detail view, including the "processing…" state for pending videos
6. Sidebar/App.js routing + notification badge
7. Manual test pass across roles: Admin, Manager, Team Lead, Employee — including a task with multiple assignees completing at different times, and a video that's still compressing when first viewed

---

## 9. What actually shipped (and what changed during the build)

**Files added**

| File | Purpose |
|---|---|
| `server/models/Task.js` | Task + `assignees[]` + `attachments[]`, with derived `overallStatus` / `completedCount` virtuals |
| `server/models/VideoCompressionQueue.js` | The nightly batch's work list |
| `server/routes/tasks.js` | All 9 endpoints |
| `server/middleware/taskUploadMiddleware.js` | Disk-staging multer (300MB cap) |
| `server/utils/taskMedia.js` | Images→S3 now, videos→disk+queue; S3 folder sanitiser |
| `server/cron/videoCompressionCron.js` | Midnight batch, 2-at-a-time, 3 retries |
| `client/src/pages/Admin/{Tasks,AddTask,EditTask}.js` | Management side |
| `client/src/pages/User/MyTasks.js` | Employee side |
| `client/src/components/TaskDetailModal.js` | Shared detail/progress modal |
| `client/src/styles/tasks.css` | Task-specific styling |

**Files modified:** `server/index.js` (mount route + cron), `server/models/Notification.js` (`TASK` type + `link` field), `client/src/App.js` (4 routes), `client/src/components/Sidebar.js` (2 links + open-task badge), `client/src/components/Topbar.js` + `client/src/pages/User/Notifications.js` (explicit `link` now takes priority when routing a notification click).

**Deviations from the draft**

1. **Assignment scope widened.** Any Active project is selectable by anyone who can assign. On top of that, Managers (like Admin/HR) can assign to **any employee in the company**, since they run work across teams rather than only their direct reports. Team Leads keep the tighter rule: any project, but only their own team members. Verified enforced server-side — a Team Lead assigning outside their team gets `403`, while the identical request from a Manager succeeds.
2. **S3 folder names are sanitised** (`AI Expo` → `AI_Expo`). Verified bug: the raw space produced a url that could not be fetched at all. Since most project names contain spaces, this would have broken nearly every task attachment.
3. **`GET /api/tasks/all` merged into `GET /api/tasks/managed`** — one endpoint that returns everything for Admin/HR and own-created tasks for Manager/Team Lead, instead of two near-identical routes.
4. **Added `GET /api/tasks/my/open-count`** for the sidebar badge, so the sidebar doesn't have to pull the full task list.
5. **Notification deep links** use `?task=<id>` (e.g. `/my-tasks?task=…`) and auto-open that task's modal, rather than a separate detail route.

**Verified end-to-end against real data** (test records created and then fully deleted — DB, S3 and disk all confirmed clean afterwards):

- Role scoping: Admin 13 projects/54 employees; Manager 2 team members; Team Lead 3; Employee correctly `403` on all management endpoints; anonymous `401`.
- Video upload returns immediately and the raw file is **playable over HTTP straight away** (`200`, `video/mp4`) before any compression.
- Nightly batch: 1080p clip compressed **−94.9%**, uploaded to S3, task url swapped to the S3 link, status → `ready`, local raw file deleted.
- Completion-proof path (the nested `assignees[].completionProof[]` `arrayFilters` update) works and lands in the `/Proof` subfolder.
- Staging folder returns to 0 files after the batch.

---

## 10. Discussion thread (added after the first pass)

A chat box on every task so assignees and the assigner can ask questions and post updates.

**Model — `server/models/TaskComment.js`:** `taskId`, `author`, `message`, `attachments[{url, fileName}]`, timestamps. Its own collection rather than embedded in `Task`, because comments grow without bound and would bloat every task-list query that only needs summary fields. Indexed on `{ taskId, createdAt }`.

**Endpoints** (all require you to be an assignee, the assigner, or Admin/HR):

| Method | Route | Notes |
|---|---|---|
| `GET` | `/api/tasks/:id/comments` | Oldest-first thread |
| `POST` | `/api/tasks/:id/comments` | Text and/or up to 5 images. Rejects empty messages and rejects videos (those belong on the task itself, where the overnight pipeline handles them) |
| `DELETE` | `/api/tasks/:id/comments/:commentId` | Author only, or Admin/HR moderating |

**Images**, not video: they upload straight to S3 under `Tasks/<Project>/Discussion/` and appear instantly. Compressed in the browser first, same as everywhere else in the app.

**Notifications:** every participant except the sender gets a `TASK` notification carrying an 80-char preview and a deep link back to the task.

**UI:** chat-style thread in the task detail modal — your own messages mirror right with a teal bubble, others left. Avatars, relative timestamps ("5m ago"), inline image thumbnails that open full size, delete on your own messages. Composer sends on Enter, newline on Shift+Enter.

**Verified:** an employee who is neither assignee nor assigner gets `403` on read, post, and delete; an assignee can read/post/delete their own; empty messages `400`; and a post by one assignee notified exactly the other assignee + the assigner, excluding the sender.

**Known limitation:** the thread is not real-time. It loads when the task is opened; new messages from others appear on reopen (the bell notification is the live signal). Polling or websockets would be the upgrade if you want live chat.

---

**Still open:** questions 2–6 above (status set, video size cap, compression quality, manager approval step, due-date reminders, comments) — all running on the recommended defaults.

---

## 11. Changes made after the first build

Sections 3–6 and 10 describe the original design. These superseded it:

| Area | Was | Is now |
|---|---|---|
| **Status model** | One status per assignee, task status derived | **One shared status on the task.** Whoever moves it moves it for everyone. `assignees` is a plain user-id array; `completionProof` moved to task level with `uploadedBy` per item |
| **Status values** | `To Do / In Progress / Blocked / Completed` | **`Pending / In Progress / On Hold / Completed`** |
| **Status endpoint** | `PUT /:id/assignees/:userId/status` | **`PUT /:id/status`** — callable by any assignee, the assigner, or Admin/HR |
| **Task type** | Every task belonged to a project | **`taskType`: `Project Task` or `Regular Office Task`.** Office tasks store `projectId: null`; `projectId` is conditionally required at the schema level |
| **Assignment scope** | Manager limited to direct reports | **Admin/HR/Manager can assign to anyone; Team Leads stay scoped to their own team.** Any Active project is selectable |
| **Task detail UI** | Modal | **Full page at `/task/:id`** — discussion sticky on the left (40%), details scrolling on the right (60%) |
| **Employee view** | Card list | **Trello-style board** with drag-to-change-status, plus a list view; choice persisted |
| **Admin list** | Basic table | Single-bar toolbar with active-filter highlighting and Clear; fixed column widths; progress bar driven by status (grey/blue/amber/green) |
| **Discussion** | Not real-time | **Live via socket.io.** Notifications push from a `post('save')` hook on the `Notification` model, so *every* notification in the app is realtime, not just tasks |
| **Media viewing** | Opened in a new tab | **In-page lightbox** with keyboard nav, counter and download |
| **Media management** | Edit page only | `POST /:id/media` and `DELETE /:id/media/:mediaId` — add/remove from the detail page. Deletion also removes the S3 object, or the staged file *and* its queue row |
| **Employee profile** | No task visibility | **Tasks tab** — `GET /tasks/user/:userId` with `assigned` / `created` scopes and status tiles |
| **Video compression** | Midnight only | Midnight **plus a startup catch-up sweep**, because `node-cron` doesn't fire if the process is down at 00:00 — which happened in practice |

**Bugs found and fixed along the way, worth remembering:**

- `require('./cron/videoCompressionCron')` sat **above** `dotenv.config()` in `index.js`. It pulls in `s3Service`, which builds its `S3Client` at module load — so it captured undefined AWS credentials and **broke every S3 upload in the app** (expenses and documents too, not just tasks). `s3Service` now builds its client lazily and throws a clear error if credentials are missing.
- A `pre('save')` hook written callback-style (`function(next)`) throws `next is not a function` on **Mongoose 9**, which dropped callback middleware. Because the hook was on the shared `Notification` model, it silently broke all notification creation. Hooks must be promise-style.
- S3 keys built from raw project names produced unfetchable urls (`Tasks/AI Expo/…`). Folder names are now sanitised (`AI_Expo`).
- Defining a component inside another component remounts it on every render — it killed drag-and-drop mid-drag. Card components live at module scope.

---

## 12. PLANNED — in-browser screen recorder (not built)

Record the screen directly in the app while creating a task, so a manager can talk through a brief instead of writing it. Confirmed scope: **microphone narration included**, available for **both reference media and completion proof**.

### Why it fits cleanly

**No backend changes are needed.** Verified against the running code:

- `.webm` is already whitelisted in `taskUploadMiddleware`, by both extension and mime
- `isVideo()` already routes it to disk staging and the compression queue
- The bundled ffmpeg has VP8, VP9 and Opus decoders and demuxes WebM
- A real VP9/Opus WebM was pushed through the cron's `compressVideo()` unchanged and transcoded to H.264 MP4 successfully

A recording is just another video upload. It stages on the VPS, plays immediately, and is compressed to MP4 at midnight like everything else.

**Useful side effect:** Chrome records VP9 WebM, which Safari plays poorly. The nightly transcode to H.264 MP4 *fixes* cross-browser playback. In the window before midnight, a Safari viewer may not be able to play the raw WebM — self-correcting, worth knowing.

**HTTPS is confirmed in production**, which `getDisplayMedia` requires. `localhost` is exempt, so local development works too.

### Approach

Two native APIs, no new dependencies:

- **`getDisplayMedia()`** — Chrome supplies its own screen/window/tab picker; we don't build that UI
- **`MediaRecorder`** — emits chunks; on stop they assemble into a `Blob`, wrapped in a `File` and pushed into the same `files` state the file picker already fills

### Component

`<ScreenRecorder onRecorded={file => …} />`, state machine `idle → requesting → recording ⇄ paused → preview`.

Preview is not optional: you watch it back and choose **Attach** or **Discard and re-record**. Recording straight into the attachment list with no review would be a mistake.

Mounts in four places, all of which already exist: **AddTask**, **EditTask**, the **Add reference media** panel on the task detail page, and the **completion proof** control.

### Microphone narration — the fiddly part

Clicking Record requests **both** permissions: the screen picker, then the mic. They arrive as **two separate `MediaStream`s** and must be merged before recording:

```
AudioContext
  ├── createMediaStreamSource(displayStream)   // tab/system audio, if shared
  └── createMediaStreamSource(micStream)       // narration
        └── → createMediaStreamDestination()
              └── combine its audio track with the display video track
                    └── new MediaStream([videoTrack, mixedAudioTrack]) → MediaRecorder
```

Roughly 15 lines, but this is the part that goes wrong. Notes:

- If the user **denies** the mic, record video-only rather than failing — narration is a bonus, not a prerequisite
- Tab/system audio is only offered for tab and window shares in Chrome, not full-screen on every platform, so the mixer must tolerate a missing display-audio track
- Show a live mic level meter while recording; discovering a dead mic after a ten-minute take is miserable

### Edge cases that must be handled

1. **Stopping outside our UI.** Chrome shows its own "Stop sharing" bar. Listening only to our own stop button leaves a dangling recorder — must handle `track.onended`.
2. **Memory.** Chunks accumulate in RAM until stop. Cap the bitrate and enforce a hard duration limit with a visible countdown and auto-stop.
3. **Codec negotiation.** Use `MediaRecorder.isTypeSupported()` in preference order — VP9/Opus → VP8/Opus → generic WebM → MP4 for Safari — rather than hardcoding.
4. **Feature detection.** Mobile browsers do not support `getDisplayMedia` at all. Hide the button rather than letting it fail.
5. **Navigation while recording.** Warn on route change or tab close with an active recorder.

### Proposed settings

| Setting | Value | Why |
|---|---|---|
| Video bitrate | **1.5 Mbps** | ~11 MB/min; screen text stays readable and it compresses well |
| Duration cap | **10 minutes** | ~110 MB, comfortably inside the 300 MB upload limit |
| Audio | Opus, mic + tab audio mixed | Narration is the point |
| Filename | `screen-recording-YYYY-MM-DD-HHmm.webm` | Recognisable in the attachment list |

### Build order

1. `useScreenRecorder` hook — permissions, audio mixing, lifecycle, `track.onended`
2. `ScreenRecorder` component — record/pause/stop, timer, mic meter, preview, attach/discard
3. Mount in AddTask and EditTask (reference media)
4. Mount on the task detail page — both Add reference media and completion proof
5. Cross-browser pass: Chrome, Edge, Firefox; graceful hide on Safari/mobile; verify a real recording survives the midnight transcode

### Open questions

- **Webcam bubble** (picture-in-picture of the presenter) — nice for briefs, meaningfully more work. Out of scope unless wanted.
- **Countdown before recording starts** (3-2-1) so the first seconds aren't of the picker closing.
- Should a recording **auto-attach on stop**, or always require the preview step? Recommend always previewing.

---

## 13. Recurring daily tasks — **built**

Status: implemented end to end. Server verified by `node server/scripts/testRecurringTasks.js` (61 assertions). §13.12 records what changed during the build — read it before trusting 13.1–13.9.

Let a manager assign the *same* task to an employee every day for a chosen stretch of days — "post on LinkedIn daily for the next 10 days". Each morning it lands as a **fresh, blank task**: its own status, its own completion proof, its own discussion thread. Yesterday's submission has no bearing on today's.

Days that fall on a Sunday, a company holiday, or an approved full-day leave are **skipped**, and the schedule **rolls forward** so the agreed number of tasks still gets done.

### 13.1 The core decision — template + generated instances

A `RecurringTask` document is the **template**. It is never a task itself. A cron **materialises a real `Task`** from it each morning, linked back by `recurringTaskId` + `occurrenceDate`.

Three alternatives were rejected:

| Rejected | Why |
|---|---|
| Pre-create all N `Task` docs at save time | Leave and holidays would be evaluated against the state *today*, not the state on the day. Leave approved next week wouldn't be honoured. Also floods the employee's board with ten future cards. |
| One `Task` holding N days internally | Breaks the board, the detail page, the discussion thread and completion proof — all of which assume one status and one proof set per document. |
| An `isRecurring` flag on `Task` that resets itself nightly | Destroys history. "Did he post on the 27th?" becomes unanswerable, and the discussion thread accumulates across unrelated days. |

The payoff for template-plus-instance is that **the entire existing employee-facing stack is reused untouched** — Trello board, `/task/:id`, socket discussion, completion proof, the video compression queue, notifications. A generated task is an ordinary `Task`. The only client change on the employee side is a small "Day 3 of 10" badge.

### 13.2 New model — `server/models/RecurringTask.js`

| Field | Type | Notes |
|---|---|---|
| `title`, `description`, `taskType`, `projectId`, `priority` | | Same shape and validation as `Task` |
| `assignedBy` | ObjectId → `User` | |
| `assignees` | `[ObjectId → User]` | See 13.3 — fanned out per person, not shared |
| `attachments` | `[MediaSchema]` | The brief. **Referenced by generated tasks, never copied** — see 13.7 |
| `plannedDates` | `[String]` | Normalised `YYYY-MM-DD`. The plan, which grows on roll-forward |
| `targetCount` | Number | `plannedDates.length` at save time. The promise being kept |
| `skipSundays` / `skipHolidays` / `skipOnLeave` | Boolean, default `true` | |
| `status` | enum `Active / Paused / Completed / Cancelled` | |
| `occurrences` | `[OccurrenceSchema]` | The audit log, below |

`OccurrenceSchema`:
```js
{
    date: String,            // YYYY-MM-DD
    assignee: ObjectId,      // -> User
    taskId: ObjectId,        // -> Task, null when skipped
    result: 'generated' | 'skipped',
    skipReason: String,      // 'Sunday' | 'Holiday: Diwali' | 'On leave' | 'Employee inactive'
    outcome: 'pending' | 'completed' | 'missed'
}
```

`occurrences[]` is deliberately **not** derivable by querying `Task`, because skipped days never produce a Task. It is the only place the full picture lives, and it is what drives the manager's compliance calendar (13.8). Denormalising `outcome` here also means that view is one document read rather than an N-day fan-out query.

**Additive changes to `Task`** — nothing existing is modified:
```js
recurringTaskId: { type: ObjectId, ref: 'RecurringTask', default: null },
occurrenceDate:  { type: String, default: null }    // YYYY-MM-DD
```

### 13.3 One task per assignee per day

Per §11, a `Task` carries **one shared status** across all its assignees. That is right for collaborative work and wrong here: if three people are each told to post daily, one person marking it Completed must not clear it for the other two.

So the daily generation **fans out per assignee** — three assignees on a 10-day schedule produce 30 `Task` documents over its life, one per person per day. The `RecurringTask` holds all three; `occurrences[]` carries `assignee` for exactly this reason.

### 13.4 Skip rules, and the two kinds of "not today"

This is the subtle part of the design and the easiest thing to get wrong.

- A day the **manager deselected** in the calendar is simply *not in `plannedDates`*. It is not a skip, produces no `occurrences` row, and **must not extend the schedule**. Otherwise deselecting every Saturday would push the end date out indefinitely.
- A day the **system skips** — Sunday, holiday, approved leave, deactivated employee — is a skip. It logs an `occurrences` row with a reason, and **appends the next eligible date** after the current last `plannedDates` entry, so `targetCount` is still met.

Roll-forward is evaluated **per assignee**. If Rahul is on leave Wednesday but Priya is not, Rahul's schedule extends by a day and Priya's does not. `plannedDates` is therefore the shared baseline, and per-assignee extension is tracked through `occurrences[]`.

Guard rail: cap roll-forward at `targetCount + 30` days. A long sick leave should stall and alert the assigner, not silently trail a task into next quarter.

Two rules that are easy to get backwards:

- **Half-day leave does not skip.** `Leave` carries `startHalf` / `endHalf`. Someone on a half day can still write a post. Skip only when the day is `FULL`.
- **WFH never skips.** They are working.

### 13.5 The generation cron — `server/cron/recurringTaskCron.js`

Follows `attendanceCron.js` closely; its defensive `Leave` / `Wfh` / `Holiday` requires and its Sunday/holiday checks lift almost verbatim.

Schedule: **06:00 every day**, including Sunday — the job decides for itself whether to skip, rather than encoding that in the cron expression where it can't log a reason.

Each run, in order:

1. **Sweep yesterday.** Every `occurrences` row with `outcome: 'pending'` whose Task is still `Pending` or `In Progress` flips to `outcome: 'missed'`, and the Task is archived (`isArchived: true`) so the board stays clean. Nothing is deleted — it stays openable from the schedule view.
2. **Generate today.** For each `Active` schedule containing today in `plannedDates`, for each assignee: check Sunday → holiday → full-day approved leave → user still `ACTIVE`. Skip with a reason and roll forward, or create the `Task` and notify.
3. **Close finished schedules.** Once generated + skipped-beyond-cap covers `targetCount`, set `status: 'Completed'`.

Three things that must be built in from the start, not retrofitted:

- **Startup catch-up sweep.** §11 records that `node-cron` silently does not fire when the process is down at the scheduled minute — this already bit the video compression job in production. On boot, run the same generation for today if it hasn't already happened.
- **Idempotency.** Unique compound index on `{ recurringTaskId, occurrenceDate, assignee }`. Without it, the catch-up sweep plus a restart double-assigns the day. This is the single highest-risk bug in the feature.
- **Timezone.** The classic off-by-one. `Attendance` already sidesteps this by storing its `date` as a string rather than a `Date`, and `occurrenceDate` follows that precedent with normalised `YYYY-MM-DD`. Pin the cron's notion of "today" to IST explicitly rather than trusting server local time — a UTC VPS rolls the date over at 05:30 IST, an hour before this job runs.

### 13.6 The calendar

No date library is installed (`react-select`, `recharts`, `sweetalert2`, and nothing else), and the codebase hand-rolls its UI — `Pagination.js`, the board, the lightbox. `<ScheduleCalendar />` is hand-rolled too, for a reason beyond consistency: the whole value here is **per-day annotation**, which a picker library fights rather than helps.

Two months side by side, Airbnb-style drag to select a range, then click any day to toggle it individually — inside the range to drop it, outside to add a one-off.

Each day cell renders its own state:

| State | Appearance |
|---|---|
| Past | Disabled |
| Sunday | Greyed |
| Company holiday | Greyed, name on hover |
| Selected assignee on approved full-day leave | Striped amber, "Rahul on leave" |
| Selected | Filled |

Live footer, updating as the selection changes:

> **10 days selected → 8 tasks will be created, 2 skipped (Sun 24 Aug, Diwali) → schedule ends Thu 4 Sep**

Quick-picks for the common phrasing: **next 5 / 7 / 14 working days**.

### 13.7 Reference media must be referenced, not copied

Copying the template's `attachments` into each generated `Task` looks obvious and is a trap. If the brief contains a video, it stages at `/uploads/tasks/…` and only becomes an S3 url after the midnight compression job — which then **deletes the local file**. Day 1's copy is left pointing at a path that no longer exists.

Instead, populate `recurringTaskId` on the task detail page and render the template's attachments as the brief, alongside the task's own (empty) `attachments`. The compression job updates the template once, and every day — past and future — sees the corrected url. Editing the brief stays consistent across the whole schedule too.

### 13.8 UI surface

| Where | What |
|---|---|
| `AddTask` | A **"Repeat daily"** toggle. The date field is a button that opens the calendar popup in either mode; everything else on the form is unchanged |
| `/tasks` → **Recurring** tab | Manager list of schedules — title, assignees, progress (`6 of 10`), status, Pause / End / Extend. A third view beside "By Task" and "By Employee", **not** a separate sidebar entry |
| `/tasks/recurring/:id` (new) | The **compliance calendar**: done, missed, skipped (with reason), open. Per assignee. This is the view that answers "did he actually post for 10 days" |
| Employee board | Unchanged, plus a small **"Day 3 of 10"** badge on generated cards |

### 13.9 API

| Route | Purpose |
|---|---|
| `POST /api/tasks/recurring/preview` | Assignees + date range → `[{date, willRun, reason}]`. Powers the calendar footer |
| `POST /api/tasks/recurring` | Create the schedule. Same multipart shape and `CAN_ASSIGN` / scope checks as `POST /api/tasks` |
| `GET /api/tasks/recurring` | List, scoped like `/managed` |
| `GET /api/tasks/recurring/:id` | Detail + `occurrences[]` for the compliance view |
| `PUT /api/tasks/recurring/:id` | Edit brief, pause, resume, end early, extend |

The preview endpoint is **advisory only**. Leave approved *after* the schedule is created won't appear in it, and that is fine — the cron re-checks every morning and is the sole authority. Worth a line of copy on the form so nobody reads the preview as a guarantee.

### 13.10 Build order

1. ~~`RecurringTask` model + the two additive `Task` fields + the unique index~~ **done**
2. ~~`POST /recurring/preview` + the skip-evaluation helper~~ **done** (`utils/recurringSchedule.js`)
3. ~~`recurringTaskCron.js` — generation, sweep, roll-forward, startup catch-up~~ **done**
4. ~~`<ScheduleCalendar />` standalone~~ **done**
5. ~~Wire the "Repeat daily" toggle into `AddTask`~~ **done**
6. ~~`/tasks/recurring` list + compliance detail page~~ **done**
7. ~~"Day 3 of 10" badge; brief-from-template rendering on `/task/:id`~~ **done**

Steps 1–3 also shipped the full route surface from 13.9 (create/list/detail/update) — a cron with no way to create a schedule cannot be tested.

### 13.11 Open questions

- **Should a missed day roll forward too?** Currently only *system* skips extend the schedule. If someone simply doesn't post, should they owe an extra day at the end? Leaning no — that's a management conversation, not an automation.
- **Notify the assigner on a miss?** The `notify()` helper in `routes/tasks.js` makes it a two-line addition. Probably wanted, but it is a daily nag if a schedule goes stale.
- **Time of day.** 06:00 assumes the day shift. Night-shift employees would get the task mid-shift. `attendanceCron` already splits DAY/NIGHT — this may need the same treatment.

---

## 13.12 What the backend build actually changed

13.1–13.11 are the design as drawn. These are the deviations, and the two bugs the build turned up.

### Files

| File | |
|---|---|
| `server/utils/recurringSchedule.js` | **new** — date helpers, eligibility, roll-forward projection. The whole rules engine; no HTTP or cron in it |
| `server/utils/taskScoping.js` | **new** — roles + team scoping, *extracted from* `routes/tasks.js` |
| `server/models/RecurringTask.js` | **new** |
| `server/routes/recurringTasks.js` | **new** — the five routes from 13.9 |
| `server/cron/recurringTaskCron.js` | **new** |
| `server/scripts/testRecurringTasks.js` | **new** — 61-assertion harness; refuses to run against anything but a local `*test*` database |
| `server/models/Task.js` | `recurringTaskId`, `occurrenceDate`, the unique partial index, exports `mediaSchema` |
| `server/models/VideoCompressionQueue.js` | `ownerModel` discriminator — see below |
| `server/cron/videoCompressionCron.js` | resolves Task vs RecurringTask via `ownerModel` |
| `server/routes/tasks.js` | uses `utils/taskScoping`; status route reports back to the occurrence log |
| `server/index.js` | cron required; `/api/tasks/recurring` mounted **before** `/api/tasks` |
| `client/src/utils/scheduleDates.js` | **new** — 'YYYY-MM-DD' helpers and the month-grid builder |
| `client/src/components/ScheduleCalendar.js` | **new** — the two-month picker, `mode="multi"` (recurring) or `"range"` (one-off start..due) |
| `client/src/components/DatePickerField.js` | **new** — the field plus its anchored calendar popover |
| `client/src/components/ScheduleProjection.js` | **new** — the "8 will run, 2 skipped" footer |
| `client/src/components/RecurringTaskList.js` | **new** — schedules list, embedded as a third view on the Tasks page |
| `client/src/pages/Admin/RecurringTaskDetail.js` | **new** — compliance calendar |
| `client/src/styles/recurring.css` | **new** |
| `client/src/pages/Admin/AddTask.js` | "Repeat daily" toggle; posts to `/tasks/recurring` when on |
| `client/src/pages/TaskDetail.js` | "Day N of M" badge; brief inherited from the schedule |
| `client/src/pages/User/MyTasks.js` | "Daily" chip on generated cards |
| `client/src/components/Sidebar.js`, `client/src/App.js` | nav link and the two routes |

### Deviations from the design

- **Scoping was extracted, not duplicated.** Both task routers now share `utils/taskScoping.js`. Two copies of "which employees may this Team Lead assign to" is exactly the thing that drifts into a permissions hole.
- **`assigneeState[]` was added to the model.** 13.4 said per-assignee roll-forward would be tracked "through `occurrences[]`", which would mean recomputing each person's date set from the log on every run. An explicit `{ user, extraDates[], generatedCount, status }` is cheaper and directly renderable.
- **A schedule starting today generates immediately** on create instead of waiting for 06:00 tomorrow. It calls the cron's own generator, so that path is identical to every other day, duplicate guard included.
- **The sweep settles every past day, not just yesterday.** A weekend of downtime would otherwise leave a permanent hole in the log.
- **The startup catch-up is gated on the hour** — only past 06:00 IST. A 02:00 restart must not hand people their task four hours early.
- **`outcome: 'not-applicable'`** was added for skipped days. With only pending/completed/missed, a Sunday would have to be one of those, and none is true.
- **The status route reports back**, so a completed task turns green on the compliance calendar immediately rather than at the next sweep.

### Two bugs found during the build

**1. The compression queue would have destroyed a brief's video.** A schedule carries its own reference media, so its videos stage on disk and queue like any other. But `VideoCompressionQueue.taskId` was `ref: 'Task'`, and the cron does `Task.findById(job.taskId)` — with a *schedule* id that returns null, and the null branch **deletes the raw file and marks the job done**. The only copy, gone at midnight. Fixed with an `ownerModel` discriminator (defaulting to `'Task'`, so every existing row behaves exactly as before) plus `refPath`.

**2. `GET /recurring/:id` locked out the schedule's own creator.** The route populates `assignedBy` before the permission check, and `.toString()` on a populated Mongoose document returns an inspect string, not an id — so the comparison never matched and the manager got a 403 on their own schedule. `routes/tasks.js` has the same shape of check but runs it on an *unpopulated* document, which is why it never surfaced there. Now normalised through an `idOf()` helper that handles both.

### Verified

`node server/scripts/testRecurringTasks.js` — needs a local mongod, drops only its own database.

The generation suite simulates Fri 21 → Sat 29 Aug 2026: a 5-day schedule with a Sunday deliberately selected, a holiday on the Monday, a full-day leave for one assignee and a half-day for the other.

```
Rahul                                Priya
  08-21 RUN                            08-21 RUN
  08-22 RUN                            08-22 RUN   <- half day, NOT skipped
  08-23 skip: Sunday                   08-23 skip: Sunday
  08-24 skip: Holiday                  08-24 skip: Holiday
  08-25 skip: On approved leave        08-25 RUN
  08-26 RUN                            08-26 RUN
  08-27 RUN                            08-27 RUN
  08-28 RUN
  = 5 tasks, ends 28th                 = 5 tasks, ends 27th
```

Both get their 5 tasks; the runs end on different days because roll-forward is per person. Re-running all nine days creates nothing new.

### Client notes

- **The calendar keeps Sundays and holidays clickable.** They are greyed, not disabled. Selecting one is not a mistake: it counts toward the target, gets skipped on the day, and rolls the run forward — so the person still does the agreed number. The footer says so explicitly rather than the calendar silently refusing the click.
- **The preview is one debounced call** carrying both jobs: annotations for the months on screen, and the projection for the days picked. It re-runs on every day clicked and every assignee added, and dragging a range fires a burst of those.
- **`GET /tasks/:id` gained `recurringDayNumber`**, counted over that person's *generated* occurrences only — a skipped Sunday is not a day number, so "Day 3 of 10" stays honest.
- **The calendar is an anchored popover, not inline and not a modal.** Inline, a two-month calendar is ~380px tall and shoved the rest of the form off screen. A centred modal fixed that but overcorrected — dimming the whole page to pick a date hides the form you are filling in. It now drops open directly under the date field like an ordinary date input, compact (~500px, 208px months), right-aligned so it grows leftward into the page rather than off the edge, closing on click-outside or Escape. The full skip breakdown stays in the form rather than the popover, which is what lets the popover stay small.
- **The one-off task uses the same picker.** A task's start and due date *is* a contiguous range, so `mode="range"` gives one calendar for both kinds of task instead of two different date UIs on the same form. The native `<input type="date">` pair is gone from `AddTask`; the row is now a clean two-column `Priority | Dates` grid that looks identical whichever mode the switch is in. Note the button cannot carry `required`, so the due-date check moved into `handleSubmit`.
- **"Normal Tasks" genuinely means one-off.** The tab passes `excludeRecurring=true` to `/tasks/managed`, so days generated by a schedule appear only under Recurring. Without that the two tabs would overlap and the split would be cosmetic. The flag is opt-in, so every other caller of `/managed` still sees everything.
- **Recurring lives inside the Tasks page, not the sidebar.** It was briefly its own nav entry and its own route, which was wrong: a recurring task is still task assignment, so two menu items for one concept is a menu that has to be explained. It is now the third tab beside "By Task" and "By Employee" (`/tasks?view=recurring`), and the only recurring-specific route left is the compliance page at `/tasks/recurring/:id`. Creating one is a "Repeat daily" switch on the existing Assign Task form — there is no second form.
- **Task cards are a uniform height**, board and list alike. Not by hard-coding one — title, description and the tag row are each pinned to an exact line count, so the total comes out identical and there is no dead padding. Three things had to be fixed to get there: a long title pushed the card taller (`min-height` → exact `height`), a flex-grown description leaked a third line under the `-webkit-line-clamp` ellipsis (the clamp draws the ellipsis but does not hide overflow once the box is taller than the clamp), and the `Daily` badge was 2px taller than the other chips, which alone put recurring cards out of line. The empty-description block is still rendered, as "No description", because omitting it would shorten the card.
- **The board shows only a "Daily" chip**, not the day number. The precise position needs the schedule document, and fetching one per card to render a badge is not worth it; the detail page has the full count.

### Still open

- **`EditTask` still uses native date inputs.** Only `AddTask` was moved to the popup picker. Editing an existing task is a different enough context that this was left alone, but the two forms now look slightly different.
- **Night shift.** 06:00 IST suits the day shift; a night-shift employee gets the task mid-shift. `attendanceCron` already splits DAY/NIGHT and this likely needs the same.
- **Missed days do not roll forward.** Only system skips extend a schedule; someone simply not posting does not earn an extra day.
