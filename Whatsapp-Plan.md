# WhatsApp for HRMS — Step-by-step Implementation Plan

Companion to `openwa-whatsapp-integration-plan.md`, which describes the **server
build**: the VPS, the domain, Nginx, SSL, and getting OpenWA running on
`whatsapp.gts.ai`. That document stays the authority on all of that and is not
repeated here.

This one covers the other half — **what the HRMS does with it once it exists**.
It is written as an ordered build, and the first phase is already done.

---

## 0. Where this stands today

| Phase | What it is | Status |
| --- | --- | --- |
| 1 | Task nudges: in-app + email, with WhatsApp wired but inert | **Built** |
| 2 | OpenWA on the VPS (`openwa-whatsapp-integration-plan.md`) | Not started |
| 3 | Turn the WhatsApp channel on for nudges | Blocked on 2 |
| 4 | Delivery log + retry queue | Not started |
| 5 | The rest of the notifications (task, leave, attendance) | Not started |
| 6 | Inbound replies — answering a nudge over WhatsApp | Not started |

The order matters and it is deliberate. **Phase 1 shipped without WhatsApp
working at all**, because the interesting question in a nudge feature is not
"can we send a WhatsApp message" — it is "who may ask, how often, what counts as
an answer, and what happens when a channel fails". All of that is now settled and
tested against email, which already works. Phase 3 is then a matter of filling in
two environment variables.

---

## 1. The architecture, in one picture

```text
                    HRMS action (a nudge, a task assignment, a leave decision)
                                    │
                                    ▼
                         server/utils/nudge.js
                    (and, later, notification.service.js)
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
      Notification model      utils/sendEmail.js   services/whatsapp.service.js
        (in-app, always)         (optional)              (optional)
              │                     │                     │
              ▼                     ▼                     ▼
        socket.io push           SMTP              OpenWA @ :2785
                                                          │
                                                          ▼
                                                      WhatsApp
```

Two rules hold throughout, and everything below depends on them:

1. **In-app is not a channel choice.** It always happens. It is the record of
   the event *inside the product* — the thing that can be listed, filtered,
   answered and reported on. Email and WhatsApp are only ways of getting
   somebody's attention when they are not looking at HRMS.

2. **No channel may fail the action.** A nudge whose WhatsApp send died is still
   a nudge. Every outbound call is wrapped, and the failure is recorded against
   the nudge rather than thrown at the user who pressed the button.

---

## 2. Phase 1 — Task nudges (built)

### 2.1 What it does

Anyone with access to a task can ask an assignee **"how long will this take?"**.
The employee answers with one tap. The asker is notified of the answer.

* **In-app** always.
* **Email** and **WhatsApp** are checkboxes the sender ticks, per nudge.
* The email carries five one-tap answer buttons that work **without logging in**.

### 2.2 Files

| File | What it is |
| --- | --- |
| `server/models/Nudge.js` | One document per *recipient*: the question, the channels, per-channel delivery status, and the answer |
| `server/utils/nudge.js` | The engine — permissions, the ETA presets, the email template, dispatch, and recording an answer |
| `server/services/whatsapp.service.js` | The only file in the HRMS that knows OpenWA exists |
| `server/routes/tasks.js` | Five endpoints, §2.5 below |
| `client/src/components/NudgeModal.js` | Compose: who, what, which channels |
| `client/src/components/TaskNudges.js` | The task-page panel: answer box + history |
| `client/src/components/PendingNudges.js` | The strip on My Tasks: every outstanding question, answerable in place |
| `client/src/styles/nudge.css` | Styling for all three |
| `server/scripts/testNudges.js` | 52-assertion harness, `node scripts/testNudges.js` |

### 2.3 Who may nudge

Exactly the rule the discussion thread already uses (`getTaskVisibilityFilter`),
so there is no second notion of "access to a task":

* whoever assigned it,
* Admin / HR,
* anyone assigned to it — including a co-assignee nudging the other people on it,
* a Team Lead whose own team member is an assignee.

Nobody can nudge themselves, and nobody who is not an assignee can be nudged.
Completed tasks cannot be nudged at all.

### 2.4 The cooldown

`NUDGE_COOLDOWN_MINUTES`, default **120**.

The same sender cannot re-ask the same person about the same task while an
earlier nudge is still unanswered. Without this, "Nudge" becomes a button
somebody taps six times while annoyed and the whole feature is muted within a
fortnight.

It is **per sender**: a Team Lead being on cooldown must not stop Admin from
asking, because they are asking as different people. Nudging a pair where one is
on cooldown still reaches the other — the response reports both `sent` and
`skipped`.

### 2.5 Endpoints

| Method | Route | Notes |
| --- | --- | --- |
| `POST` | `/api/tasks/:id/nudge` | `{ recipientIds?, message?, channels: ['email','whatsapp'] }` — defaults to every assignee but you |
| `GET` | `/api/tasks/:id/nudges` | The nudge history on one task |
| `POST` | `/api/tasks/:id/nudges/:nudgeId/respond` | `{ preset? , etaAt?, note? }` — only the person asked |
| `GET` | `/api/tasks/nudges/pending` | The current user's unanswered questions |
| `GET` | `/api/tasks/nudge-reply?token=…` | **No auth.** The email's one-tap buttons |

All five are declared **above** `GET /api/tasks/:id` in `routes/tasks.js`.
Express matches in declaration order, so `/nudge-reply` declared after `/:id`
would be swallowed by it.

### 2.6 The ETA presets

Defined once in `server/utils/nudge.js` as `ETA_PRESETS`, and mirrored in the
client for rendering only — the server maps the key it is given and ignores
anything it does not recognise, so a stale browser can never write a label the
server did not choose.

| Key | Label | Resolves to |
| --- | --- | --- |
| `30m` | About 30 minutes | now + 30 min |
| `2h` | About 2 hours | now + 2 h |
| `today` | By end of today | 18:30 IST today |
| `tomorrow` | By end of tomorrow | 18:30 IST tomorrow |
| `blocked` | I am blocked — need help | **no time at all** |

`blocked` deliberately stores no `etaAt`. It is an answer, and a useful one, but
it is not an estimate — inventing a timestamp for it would quietly corrupt any
later "how accurate are people's estimates" report.

Times are computed in IST via `istWallClockToUTC`, the same helper the overdue
logic uses. "End of day" resolving to whatever midnight the Node process thinks
it is would put a five-and-a-half-hour hole in every ETA.

### 2.7 Answering from the email

The buttons are signed JWTs in the query string — the same magic-link pattern
`routes/leaves.js` already uses for leave approvals.

An employee answering from their phone at a client site must not have to log in
first; if they do, they simply will not answer. The token carries only
`{ nudgeId, preset, kind: 'nudge-reply' }` and expires in 7 days. The route
re-reads the nudge and re-checks it is still unanswered, so:

* a double-tapped button says "already answered" instead of overwriting,
* a leave-approval token cannot be replayed here (`kind` is checked),
* an expired or forged token gets a plain "open the task in HRMS" page.

### 2.8 Delivery status

Each nudge carries a `deliveries[]` row per channel with one of four statuses:

| Status | Meaning |
| --- | --- |
| `sent` | It went |
| `failed` | We tried and it broke — worth retrying |
| `skipped` | We never tried: no number on file, employee opted out, or WhatsApp not configured |
| `pending` | Queued, not yet attempted (unused until Phase 4) |

`failed` and `skipped` are separate on purpose. "OpenWA was down" and "this
employee has no WhatsApp number" both mean the message did not arrive, but only
the first is worth retrying and only the second is worth telling the sender to
go fix a profile. The task panel surfaces both, and only when something actually
went wrong — a sender whose message went out fine does not need a receipt.

---

## 3. Phase 2 — Stand up OpenWA

Follow `openwa-whatsapp-integration-plan.md` end to end. Nothing in the HRMS
changes during this phase. The short version of what must be true when it is
finished:

- [ ] OpenWA running under systemd or PM2, bound to `127.0.0.1:2785`
- [ ] `whatsapp.gts.ai` resolving, SSL issued, Nginx proxying to `:2785`
- [ ] Port `2785` **not** reachable from the internet
- [ ] A dedicated company WhatsApp number linked — never a personal account
- [ ] API key generated and stored server-side only
- [ ] Session/auth data included in the backup routine

Verify before touching the HRMS:

```bash
curl -H "api_key: $OPENWA_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"args":{}}' \
     http://127.0.0.1:2785/getConnectionState
```

Expect `CONNECTED`.

---

## 4. Phase 3 — Turn the channel on

### 4.1 Environment

Add to `server/.env`, restart the API:

```env
# --- WHATSAPP (OpenWA) ---
OPENWA_BASE_URL=http://127.0.0.1:2785
OPENWA_API_KEY=your-long-random-secret
OPENWA_TIMEOUT_MS=15000
WHATSAPP_DEFAULT_COUNTRY_CODE=91

# Used for the one-tap reply links inside emails. Only needed where the API and
# the React app are not on the same origin (i.e. local development).
# APP_BASE_URL=https://hrm.gts.ai
# API_BASE_URL=https://hrm.gts.ai

# Optional — how long before the same person may chase again. Default 120.
# NUDGE_COOLDOWN_MINUTES=120
```

`OPENWA_BASE_URL` points at **localhost**, not `whatsapp.gts.ai`. Both the HRMS
and OpenWA are on the same VPS; going out through Nginx and back in would add
TLS, a public hop, and a second thing that can break, for nothing.

`whatsapp.service.js` treats "both `OPENWA_BASE_URL` and `OPENWA_API_KEY` are
set" as *configured*. Until then every WhatsApp send returns
`{ ok: false, skipped: true }` and is recorded as a `skipped` delivery — which
is why the channel is already selectable in the UI today and simply reports that
it is not connected yet.

### 4.2 Employee numbers

`whatsappNumber` and `whatsappNotificationsEnabled` are already on the `User`
model and editable on **Edit Employee**.

`whatsappNumber` is deliberately separate from `phoneNumber`. For most people
they are the same and the field can be left blank — sends fall back to
`phoneNumber`, so nothing needs backfilling. For some they are not: a work
handset that has never had WhatsApp installed, a personal number someone will
take messages on but does not want in the directory. Blasting automated messages
at whatever happens to sit in `phoneNumber` is how a company ends up texting a
landline every morning.

`normalisePhone()` copes with how people actually type numbers —
`+91 98765 43210`, `098765-43210`, `9876543210` all become `919876543210`.
Anything that cannot plausibly be a phone number returns `null` and the send is
skipped rather than fired into the void.

**Before switching the channel on**, run a one-off audit of who is reachable:

```bash
node -e "
require('dotenv').config();
const m=require('mongoose'), U=require('./models/User');
const { normalisePhone }=require('./services/whatsapp.service');
m.connect(process.env.MONGO_URI).then(async()=>{
  const bad=(await U.find({status:'ACTIVE'}).select('name phoneNumber whatsappNumber'))
    .filter(u=>!normalisePhone(u.whatsappNumber||u.phoneNumber));
  console.log(bad.length+' active employees have no usable number:');
  bad.forEach(u=>console.log('  '+u.name));
  process.exit(0);
});"
```

### 4.3 Verify

1. **Session** — `getSessionStatus()` reports `connected: true`.
2. **One message** — nudge yourself on a throwaway task with WhatsApp ticked.
3. **Missing number** — nudge someone with no number; expect a `skipped`
   delivery and the warning line on the task panel, and the nudge itself still
   sitting there in-app.
4. **Opt-out** — set `whatsappNotificationsEnabled: false`; expect `skipped`
   and nothing sent.
5. **Outage** — `systemctl stop openwa`, send a nudge. It must return 201, the
   in-app notification must arrive, and the WhatsApp row must read `failed`.
   Restart OpenWA.

Steps 3–5 are the ones that matter. Step 2 working proves very little; the
system is only trustworthy if it degrades correctly.

---

## 5. Phase 4 — Delivery log and retries

Everything so far sends inline, inside the request. That is the right trade at
this volume — a nudge is one message to one person and the sender is watching.
It stops being right the moment a single action fans out to twenty people.

### 5.1 The queue

Per §17 of the OpenWA plan, a **database-backed** queue. No Redis: the VPS has
~1.4 GB free and this is a queue that will hold tens of rows, not thousands.

```text
server/models/OutboundMessage.js
├── channel        'whatsapp' | 'email'
├── to             normalised number / address
├── body
├── refModel       'Nudge' | 'Task' | 'Leave' | ...
├── refId
├── status         pending | sent | failed | dead
├── attempts       Number
├── lastError
├── nextAttemptAt  Date
└── sentAt
```

```text
server/cron/outboundCron.js   — every minute:
  find { status: 'pending', nextAttemptAt: { $lte: now } }, limit 20
  send each through whatsapp.service
  on failure: attempts++, back off, or mark 'dead' at 3
```

Backoff **1 min → 5 min → 30 min**, then `dead`. Three attempts, per §21 of the
OpenWA plan. Do not retry forever: if OpenWA has been down for six hours, a
"how long will this take?" from six hours ago is no longer a question worth
delivering.

### 5.2 The switch

`whatsapp.service.js` grows one function, `queueWhatsAppMessage()`, and
`utils/nudge.js` calls that instead of `sendWhatsAppMessage()`. Nothing else in
the app changes — that is the entire reason the service exists as a boundary.

Keep the direct send for the settings-screen test message, where the operator is
staring at the screen waiting for a yes or no.

---

## 6. Phase 5 — The rest of the notifications

Only after Phase 4. These are fan-outs, and fan-outs need the queue.

`server/services/notification.service.js` becomes the single entry point:

```js
notify({ userId, type, title, message, link, channels: ['email', 'whatsapp'] })
```

It writes the in-app `Notification`, then queues whichever extra channels were
asked for. Every caller below goes through it — no route builds a WhatsApp
message itself.

| Event | Where | Default channels |
| --- | --- | --- |
| Task assigned | `routes/tasks.js` POST `/` | in-app + WhatsApp |
| Task due today | new cron, 09:30 IST | in-app + WhatsApp |
| Task overdue | `overdueAt` sweep | in-app + WhatsApp |
| Self-assigned task needs approval | `routes/tasks.js` POST `/self` | in-app + email |
| Leave approved / rejected | `routes/leaves.js` | in-app + email + WhatsApp |
| Attendance not marked | `cron/attendanceCron.js` | WhatsApp only |
| Payslip published | `routes/payroll.js` | in-app + email |

Message wording per §18 of the OpenWA plan.

**Two things to get right before any of this ships:**

*Quiet hours.* Nothing automated goes out before 09:00 or after 20:00 IST.
The queue holds it to the next window. An overdue-task ping at 23:40 is how a
company teaches its staff to mute the number.

*Per-employee opt-out, per category.* `whatsappNotificationsEnabled` is one
switch today, which is fine while the only WhatsApp message is a nudge someone
deliberately sent. Once attendance reminders exist, an employee who wants
nudges but not daily reminders has only one option — turning the whole thing
off. Expand it to a small map (`{ tasks: true, attendance: false, leave: true }`)
**before** the first automated category ships, not after.

---

## 7. Phase 6 — Inbound: answering over WhatsApp

The end state described in the brief: the employee replies **in WhatsApp** and
the answer lands on the task.

### 7.1 The webhook

```text
OpenWA  ──POST──▶  https://hrm.gts.ai/api/whatsapp/webhook
```

```text
server/routes/whatsapp.js
├── POST /webhook        — receives inbound messages
└── GET  /status         — session state, for the settings screen
```

Non-negotiable, in this order, before the body is even parsed:

1. **Shared secret** on the webhook URL or in a header. The endpoint is public.
2. **Reject anything not from a known employee number.** Match the normalised
   sender against `whatsappNumber`/`phoneNumber`. An unknown number gets a
   polite "this number is not monitored" and nothing else — never an error that
   confirms the endpoint is live.
3. **Rate limit per sender.** A stuck client re-sending in a loop must not be
   able to write unbounded rows.

### 7.2 Matching a reply to a question

The hard part, and the reason this is Phase 6 rather than Phase 3. WhatsApp
gives no thread id to work with, so:

**Numbered quick replies.** The outbound nudge already ends with its options;
number them, and parse a bare `1`–`5` against the recipient's most recent
unanswered nudge.

```text
Ravi is checking in on your task.

Task: Ship the Spectra deck
Due: 28 Aug 2026

How long will this take to complete?

Reply with a number:
1 — About 30 minutes
2 — About 2 hours
3 — By end of today
4 — By end of tomorrow
5 — I'm blocked, need help
```

That covers the overwhelming majority. Everything else is:

**Free text → note.** Anything unparsed attaches to the same nudge as
`response.note`, with no `etaAt`, and the asker is notified in full. A wrong
guess at an ETA is worse than no ETA.

**Ambiguity → ask.** More than one outstanding nudge and a bare number is
ambiguous. Reply listing them and asking which; do not guess.

`recordResponse()` in `utils/nudge.js` already takes `via: 'whatsapp'` and is
the single place an answer is written, so the webhook calls it and every surface
in the app updates — including the live socket push to whoever asked.

### 7.3 Explicitly out of scope

Free-form Q&A over WhatsApp — "ask the bot about the process". It is a much
larger feature (intent parsing, an escalation path, and an audit trail of what
the bot told an employee), and it should not be bolted onto a nudge webhook.
Revisit once §7.2 has been running for a while and there is real traffic to
learn from.

---

## 8. Security

Beyond §24 of the OpenWA plan:

* **The API key never leaves the server.** No `REACT_APP_` variable holds it,
  ever. The browser talks to HRMS; HRMS talks to OpenWA.
* **Escape everything user-typed that lands in a message.** Task titles and
  nudge notes are typed by users. `esc()` in `utils/nudge.js` handles the email;
  WhatsApp is plain text and needs no escaping, but it must never carry a link
  built from user input.
* **Reply tokens are single-purpose.** `kind: 'nudge-reply'` is checked so a
  leave-approval token cannot be replayed against a nudge, and vice versa.
* **The webhook is a public endpoint.** Treat every field in its body as hostile.
* **Session data is credentials.** OpenWA's session folder is a logged-in
  WhatsApp account. Back it up encrypted; never commit it.

---

## 9. Resource budget

The VPS has ~1.4 GB free and OpenWA runs a headless browser — comfortably the
heaviest process on the box.

After Phase 2, take a baseline:

```bash
free -h && ps aux --sort=-%mem | head -10
```

Watch for OpenWA's RSS climbing over days. If it does, a nightly restart via
systemd (`RuntimeMaxSec`) is a cheaper fix than more RAM, provided the session
survives the restart — **verify that it does before relying on it**.

Do not add Redis, Postgres, or a second VPS for any of this. Nothing above needs
them, and §29 of the OpenWA plan is right about why.

---

## 10. Build order

**Phase 1 — done**

- [x] `Nudge` model with per-channel delivery status
- [x] `whatsapp.service.js` — the OpenWA boundary, inert until configured
- [x] `utils/nudge.js` — permissions, presets, email, dispatch, responses
- [x] Five endpoints on `routes/tasks.js`, declared above `GET /:id`
- [x] Magic-link email replies, `kind`-checked
- [x] Compose dialog, task panel, My Tasks strip
- [x] `whatsappNumber` + opt-out on `User` and Edit Employee
- [x] `scripts/testNudges.js` — 52 assertions, all passing

**Phase 2 — OpenWA on the VPS** (see `openwa-whatsapp-integration-plan.md`)

- [ ] Everything in §3 above

**Phase 3 — turn it on**

- [ ] Add the four env vars, restart the API
- [ ] Audit employee numbers (§4.2)
- [ ] Run the five verification steps (§4.3), especially 3–5

**Phase 4 — reliability**

- [ ] `OutboundMessage` model
- [ ] `outboundCron.js`, 1 minute, backoff 1/5/30, dead at 3
- [ ] `queueWhatsAppMessage()`; point `utils/nudge.js` at it
- [ ] Session status on the settings screen

**Phase 5 — the rest of the notifications**

- [ ] Per-category opt-out on `User` **before** the first automated category
- [ ] Quiet hours in the queue (09:00–20:00 IST)
- [ ] `notification.service.js`
- [ ] Migrate the events in §6 one at a time

**Phase 6 — inbound**

- [ ] `routes/whatsapp.js` — shared secret, known-sender check, rate limit
- [ ] Numbered quick replies into `recordResponse({ via: 'whatsapp' })`
- [ ] Free text → note; ambiguity → ask

---

## 11. Open questions

1. **Cooldown of 2 hours** — a guess, and it is one env var. Watch how often
   people hit it in the first fortnight and move it.
2. **Nudging recurring schedules.** `Nudge.ownerModel` already accepts
   `'RecurringTask'` and the engine handles it; only the routes are Task-only.
   Worth adding once there is a complaint that a daily task keeps landing late —
   the question there is about the *run*, not about today's copy.
3. **Should an unanswered nudge escalate?** After N hours, tell the assignee's
   manager. Powerful and easy to make obnoxious. Not until nudges have been in
   use long enough to know whether they usually get answered.
4. **A dedicated `NUDGE` notification type.** Currently `TASK`, so existing
   filters and routing work unchanged. Splitting it means touching the model
   enum, `routes/notifications.js`, the Notifications page filter and Topbar.
   Only worth it if people ask to filter for them.
5. **One number or several?** One company number is right at this size. If
   volume ever justifies a second, `whatsapp.service.js` is the only file that
   has to learn about sessions.
