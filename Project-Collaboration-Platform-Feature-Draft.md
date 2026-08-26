# From Task Management to Project Collaboration Platform
### Feature Requirements — Draft v1 for Discussion

**Prepared for:** Management review and development scoping
**Status:** Draft — not committed. Items marked ⚠️ need an explicit decision before build.

---

## 1. Where We Are Today (Already Proposed / In Scope)

These are the features from the approved Task Management System proposal. They form the base that everything below builds on.

| # | Feature | Status |
|---|---------|--------|
| B1 | Task creation with priority (Urgent / High / Medium / Low) and deadline | Base scope |
| B2 | Attachments on tasks (photos, videos, files) | Base scope |
| B3 | Multi-assignee tasks with **separate progress tracking per person** | Base scope |
| B4 | Instant notification on assignment | Base scope |
| B5 | "My Tasks" personal view | Base scope |
| B6 | Per-task discussion box | Base scope |
| B7 | Status flow: Pending → In Progress → On Hold → Completed | Base scope |
| B8 | Mandatory reason when a task is put On Hold | Base scope |
| B9 | Manager / Team Lead dashboard with filters (Ongoing, Completed, On Hold, Pending) | Base scope |
| B10 | Employee task history (what, by whom, on-time vs late, On Hold reasons) | Base scope |
| B11 | Role permissions — Manager assigns to anyone; Team Lead to own team; Employee views only | Base scope |
| B12 | Tasks can be project-linked or standalone | Base scope |

**The core gap identified:** tasks are already tagged to a project, but there is **no way to open a project and see everything inside it**. Today the only lens is "who is doing what." We need a second lens: "what is happening on this project."

---

## 2. New Features Requested

### Module 1 — Project Workspace (the missing view)

The single most important addition. A project stops being just a tag on a task and becomes a place you can open.

| ID | Feature | Description |
|----|---------|-------------|
| F1.1 | **Project list page** | All active projects, visible in both admin and user panel. User sees projects they are a member of; admin sees all. |
| F1.2 | **Project detail page** | Open a project (e.g. "Spectra") and see everything about it on one screen. |
| F1.3 | Tasks tab | All tasks in this project — pending, in progress, on hold, completed — with assignee and deadline. |
| F1.4 | Team tab | Who is working on this project, their role, and their current open task count. |
| F1.5 | Discussions tab | All groups and conversations belonging to this project. |
| F1.6 | Vendor conversations tab | External/vendor threads for this project, kept visually distinct from internal chat. |
| F1.7 | Documents tab | Every file shared in this project — from tasks, chats, or direct upload — in one library. |
| F1.8 | Activity / notification feed | Recent events: new task, status change, new message, vendor reply, document uploaded. |
| F1.9 | **Dashboard filter by project** | Existing manager dashboard gets a "Project" filter, so instead of only "show me my team," you can ask "show me everything on Spectra." |
| F1.10 | Project health summary | Small header strip: total tasks, % complete, overdue count, open vendor questions. |

**Hierarchy to be built:**
`Project → Groups (multiple) → Discussion threads → Messages`
Plus: `Project → Tasks`, `Project → Documents`, `Project → External participants`

---

### Module 2 — Vendor / External Participant Access

Letting people outside the company into a specific conversation, without giving them an HRMS account.

| ID | Feature | Description |
|----|---------|-------------|
| F2.1 | **Invite by link + email code** | Manager/Team Lead generates an invite link for a vendor. Vendor receives an email at their address containing a verification code. They open the link, enter the code, and join. No password, no account creation. |
| F2.2 | **Request-to-join approval** | Alternative flow: someone with the link requests access; the project owner gets a prompt — "X wants to join this chat. Approve / Decline." |
| F2.3 | Scoped access | A vendor sees **only** the group they were invited to. No visibility into tasks, other projects, employee data, or any other conversation. |
| F2.4 | Vendor identity | Each vendor gets an ID and a clear "External" badge next to their name everywhere they appear. |
| F2.5 | Vendor file upload | Vendors can upload documents/files directly into the thread; internal team responds inline. |
| F2.6 | Access expiry & revoke | Invite links expire (configurable, e.g. 7 days). Access can be revoked in one click. Conversation history is retained. |
| F2.7 | ⚠️ Vendor profile section | A place per vendor holding their submitted files and conversation history. *Needs definition: is this per-project or company-wide?* |

---

### Module 3 — Groups & Internal Chat (WhatsApp-style)

| ID | Feature | Description |
|----|---------|-------------|
| F3.1 | Create a group | Any employee can create a group, name it, add a description. |
| F3.2 | Add members | By search, or by sharing an internal invite link. |
| F3.3 | Multiple groups per project | A project can have several groups (e.g. Design, Site, Vendor–Spectra). |
| F3.4 | Standalone groups | Groups not tied to any project (e.g. "Diwali Committee"). |
| F3.5 | Tagging / @mentions | Tag a person; they get a direct notification. |
| F3.6 | 1-to-1 personal chat | Direct messages between any two employees. |
| F3.7 | File & media sharing | Documents, images, video in chat, stored to the project document library where applicable. |
| F3.8 | Read receipts / unread counts | Standard chat behaviour. |
| F3.9 | Message search | Search within a group, and globally across chats the user has access to. |
| F3.10 | ⚠️ **Admin oversight of group chats** | **Requested as: admin silently present in groups, invisible to members, able to read and also chat.** See Section 4 — this needs a decision, and there is a safer way to get the same outcome. |

---

### Module 4 — Bot, Nudges & Follow-up

The "nobody replied" problem — solved by an automated follow-up agent.

| ID | Feature | Description |
|----|---------|-------------|
| F4.1 | **Vendor no-response escalation** | If a vendor posts a message and no internal member replies within X hours (configurable), the bot sends a personal DM to every tagged/assigned member: *"Vendor #V-1042 asked a question on Project Spectra and is waiting for a reply."* |
| F4.2 | **Internal no-response nudge** | Same logic for internal group messages where a specific person was tagged and hasn't responded. |
| F4.3 | **Task inactivity nudge** | If an assignee hasn't updated a task in X days, or the deadline is approaching with no progress, the bot messages them. |
| F4.4 | Escalation ladder | 1st nudge → the person. 2nd nudge → the person + their Team Lead. 3rd → Manager. Configurable. |
| F4.5 | **Nudge counter** | Every nudge is logged per person. Feeds directly into the analytics module (F6). |
| F4.6 | Deadline reminders | Automatic notification a set time before a task is due. *(Was already listed as a recommendation in the original proposal — now confirmed as wanted.)* |
| F4.7 | Bot identity | The bot posts as a clearly-labelled system account, not impersonating a human. |

---

### Module 5 — Manual Reports & Small Work Logging

| ID | Feature | Description |
|----|---------|-------------|
| F5.1 | **Manual daily/dated report** | An employee can submit a written report against a date, independent of any task — for the many small pieces of work that never get formally assigned. |
| F5.2 | Attach to project (optional) | Report can be tagged to a project or left general. |
| F5.3 | Attachments | Files/photos supported. |
| F5.4 | Manager view | Reports appear in the project feed and in the employee's history. |
| F5.5 | Optional scheduled prompt | System can ask for a report on set days (e.g. every Friday) if enabled. |

---

### Module 6 — Analytics & Performance Dashboard

| ID | Feature | Description |
|----|---------|-------------|
| F6.1 | **On-time completion rate** | Per employee, per team, per project. |
| F6.2 | **Estimated vs actual time** | Compare the time allotted to a task against actual time to close. Used to recalibrate future estimates — if a 4.5-hour allotment is consistently closed in 1.5 hours, the estimate is wrong. |
| F6.3 | **Workload distribution** | Who has the most / least open tasks. Surfaces both overload and under-utilisation. |
| F6.4 | **Activity tracking** | Login frequency, time active in the application, last-seen. ⚠️ See Section 4 — scope limits explained there. |
| F6.5 | **Nudge frequency report** | How many times each person has been nudged, and for what. |
| F6.6 | **Inactivity flag** | Automatically flag employees with no task updates / no activity over a defined window. |
| F6.7 | **Leave-conflict flag** | If a task is assigned to someone who is on approved leave or marked absent for that period, flag it immediately to the assigner — and to the manager if the deadline falls inside the leave. This uses the leave data the HRMS already holds. |
| F6.8 | **Overdue highlighting** | Past-deadline tasks flagged in red on employee and manager views. |
| F6.9 | Team performance summary | On-time rate per employee/team for monthly & quarterly reviews. |
| F6.10 | Export | Task lists, employee history, and analytics downloadable as Excel/PDF. |

---

### Module 7 — Help & Tutorials

| ID | Feature | Description |
|----|---------|-------------|
| F7.1 | **Help section on every user dashboard** | Persistent, always-accessible. |
| F7.2 | How-to guides | How to add a task, how to apply for leave, how to update status, how to create a group, how to invite a vendor. |
| F7.3 | GTS / policy documents | Company documents hosted here for reference. |
| F7.4 | Video tutorials | Short screen recordings per feature. |
| F7.5 | Searchable | Type a question, get the relevant guide. |

---

### Module 8 — Voice, Video & Meetings (Phase 3 — target September)

Explicitly **not now**. Listed so architecture decisions taken today don't block it later.

| ID | Feature | Description |
|----|---------|-------------|
| F8.1 | 1-to-1 audio call | Between employees. |
| F8.2 | 1-to-1 video call | Between employees. |
| F8.3 | Group call | Small teams. Participant ceiling to be set — this drives infrastructure cost more than any other decision. |
| F8.4 | Screen sharing | During any call. |
| F8.5 | **Call recording** | Recorded, stored, retrievable. The most expensive component — see cost note below. |
| F8.6 | ⚠️ Recording consent & retention | Who can record, who is notified, how long recordings are kept. Must be decided before build. |
| F8.7 | Vendor calls | Whether external participants can join calls. Decision needed. |

**Infrastructure note (summary):**
Text chat, file sharing, notifications and the bot all run comfortably on your existing server — this is a WebSocket connection plus database and file storage. Very low incremental cost.

Calls are a different system. Realistic path:
- **1-to-1 calls** — peer-to-peer (WebRTC). Media never touches your server. Cost is near zero apart from a small relay server needed for roughly 10–20% of connections behind restrictive corporate networks.
- **Group calls (4+ people)** — requires a media server (SFU). Open-source options exist and can be self-hosted on a mid-sized VPS.
- **Recording** — the genuinely expensive piece. Server-side recording spins up a rendering process per concurrent recording; it is CPU- and storage-hungry. A cheaper first version records in the participant's browser and uploads afterwards, with the trade-off that it's less reliable.

Recommendation: build chat now on the existing server, and treat calling as a separate service added in September. Do not let the calling requirement inflate the architecture of the chat module today.

---

## 3. Suggested Phasing

| Phase | Timeline | Contents |
|-------|----------|----------|
| **Phase 1** | Current | Base task management (B1–B12) — build, test, pilot, roll out. |
| **Phase 2A** | Immediately after Phase 1 | Module 1 (Project Workspace) + Module 3 (Groups & Chat) + Module 7 (Help). *These deliver the most visible value fastest.* |
| **Phase 2B** | +2–3 weeks | Module 2 (Vendor access) + Module 4 (Bot & Nudges) + Module 5 (Manual reports). |
| **Phase 2C** | +2–3 weeks | Module 6 (Analytics dashboard). Needs Phase 2A/2B data to be meaningful. |
| **Phase 3** | ~September | Module 8 (Voice, video, screen share, recording). |

---

## 4. Open Decisions Requiring Management Sign-Off

These are flagged deliberately. Each is a policy question, not a technical one — the build can go either way, but the direction must be chosen first.

**1. Silent admin presence in group chats (F3.10)**
The request is for the admin to sit invisibly inside employee groups, reading and able to chat, without members knowing. This carries real exposure: covert interception of employee communications sits awkwardly against the IT Act and the DPDP Act's notice-and-consent requirements, and if it becomes known internally — which it usually does — trust in the platform collapses and people simply move the conversation back to WhatsApp, defeating the entire purpose.

*Suggested alternative that achieves the same business outcome:* state plainly in the employee IT policy that all communication on the company platform is a company record and may be reviewed. Then give admin a **compliance/audit view** — read access to any group, logged, without needing to be secretly listed as a member. Same visibility, disclosed, defensible, and it doesn't require the admin to pretend to be absent while chatting. If the admin needs to participate, they join openly.

**2. Scope of activity tracking (F6.4)**
"How many people have opened the browser / how much they are working" is only measurable *inside your application* — session time, page activity, actions performed. Measuring overall computer usage would require installing monitoring software on employee machines, which is a separate product, a separate cost, and a much larger consent question. Recommend: in-app activity only, disclosed to employees.

**3. Efficiency metrics are gameable (F6.2)**
If people learn that closing tasks early scores well, tasks will be closed early and marked done regardless of quality. Recommend pairing time metrics with the optional approval step (manager confirms completion) already suggested in the original proposal, so speed alone doesn't drive the score.

**4. Vendor data boundaries (Module 2)**
Confirm exactly what an external participant may see, and how long their access and their uploaded files are retained after a project closes.

**5. Recording storage & retention (F8.5/F8.6)**
Recordings grow fast and are legally sensitive. Decide retention period and who can access recordings before building.

---

## 5. Summary — What Changes

**Before:** A task list. You can see who has what.

**After:** A project workspace. You open "Spectra" and see its tasks, its team, its conversations, its vendor threads, its documents, and what's overdue — in one place. External vendors join a specific conversation by email code without an account. A bot chases unanswered messages and stalled tasks and keeps count. Management gets a dashboard showing on-time performance, workload balance, and who has gone quiet. Later, the same platform carries calls and recorded meetings.

**And critically:** it replaces WhatsApp for work conversation — which is the only way any of the record-keeping, accountability or analytics above actually works.

---

*Draft prepared for internal discussion. Item IDs (F1.1, F2.3, etc.) are stable — please reference them when giving feedback or raising tickets.*
