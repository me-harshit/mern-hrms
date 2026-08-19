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
