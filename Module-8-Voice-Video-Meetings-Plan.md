# Module 8 — Voice, Video & Meetings
### Implementation Plan — Phase 3

**Prepared for:** Technical review before build
**Relates to:** `Project-Collaboration-Platform-Feature-Draft.md` §Module 8 (F8.1–F8.7)
**Status:** Plan — not started. Sizing figures need confirming against the live VPS.

---

## 1. Context

The feature draft parks Module 8 in Phase 3 (~September) and deliberately leaves the
architecture questions open so that decisions taken during Phase 2 don't block it. Phase 2 is
now largely built — the project workspace, groups, chat and vendor access are in — so this
plan closes those questions and turns Module 8 into something buildable.

Two things prompted it:

1. **Calling itself** — F8.1 to F8.5: one-to-one audio and video, small group calls, screen
   sharing, and recording.
2. **The attention problem** — an incoming call is worthless if nobody notices it. Today the
   app has *no* way to get a user's attention: no ringtone, no tab-title flash, no OS
   notification, and no `visibilitychange` handling anywhere in `client/src`. A socket event
   lands in a backgrounded tab and sits there silently. That gap has to close alongside the
   calling feature, and it is useful on its own for chat mentions before a single call is ever
   placed.

The third question is cost: what this does to a 2 GB InterServer VPS that is already running
the API, nginx, and a headless Chromium for the WhatsApp gateway.

### 1.1 Decisions taken

| Question | Decision |
|---|---|
| Scope | Full Module 8 — 1-to-1, small group calls via SFU, screen share, recording |
| Recording | **Browser-side** (MediaRecorder), uploaded to S3 after the call ends |
| Alert reach | Ringing on any open tab · OS notification when the tab is backgrounded · missed call to WhatsApp. **Web Push for a closed browser is out of scope.** |
| Hosting | Single VPS, upgraded — no second media box, no managed service |

### 1.2 One factor to flag before building

Group calls plus a single box is the one combination above that carries real risk. An SFU is a
genuine media server, and it would be sharing a machine with the OpenWA Chromium session
(documented in `Whatsapp.md:467` as "the heavy tenant on a 2 GB box") and with two concurrent
`libx264 -preset medium` transcodes that run every midnight
(`server/cron/videoCompressionCron.js:20`, `CONCURRENCY = 2`).

That is workable, but only if the box is sized for it and the nightly batch is moved out of the
way — both covered in §2. Browser-side recording is what makes it affordable at all: it removes
the single most expensive server-side component, which is why the sizing below is far less
brutal than the feature draft's cost note implies.

---

## 2. Infrastructure and sizing

### 2.1 What is on the box today

Established from `Whatsapp.md` and the code. The repo contains no nginx conf, Dockerfile, pm2
ecosystem file or systemd unit, so anything not listed here has to be read off the server
directly.

| Tenant | Typical RSS | Notes |
|---|---|---|
| OS + nginx | ~250 MB | nginx serves `client/build`, proxies `/api` + socket.io to `:5000` |
| OpenWA + headless Chromium | 400–700 MB | Separate systemd unit, own user, Node 22 via nvm. RSS is documented as climbing over uptime |
| HRMS Node under pm2 | 150–300 MB | Node 20, socket.io, sharp, 28 models. Spikes on `express.json({limit:'50mb'})` bodies and sharp re-encodes |
| Nightly ffmpeg | +200–400 MB for minutes | 2 concurrent transcodes at 00:00, plus a catch-up sweep 2 min after every pm2 restart |
| MongoDB | **0 MB** | Atlas, remote. The single biggest thing in our favour |

Roughly 800 MB–1.4 GB in use, leaving perhaps 600 MB–1.2 GB of genuine headroom — before
anything in this plan is added.

### 2.2 What calling adds

**Signalling — free.** SDP offers and ICE candidates over the socket.io connection we already
have. An SDP blob is 5–10 KB, an ICE candidate a couple of hundred bytes. Even a hundred
concurrent calls is noise.

**coturn (TURN relay) — cheap in RAM, expensive in bandwidth.** Needed because roughly 15–20%
of connections sit behind corporate NATs that peer-to-peer cannot traverse. It is a packet
relay, not a transcoder, so CPU stays low and RAM is 50–150 MB. The cost is bandwidth: a
relayed call passes through the server in *both* directions.

**mediasoup SFU — the real new tenant.** It forwards streams rather than transcoding them, so
CPU is packet handling and SRTP encryption rather than video encoding. Budget 300 MB–1 GB
depending on worker count and concurrent calls.

**Browser-side recording — near-zero during the call, disk pressure after it.** The
participant's browser does the encoding. The server cost is the upload and the existing video
pipeline.

### 2.3 The number that will surprise you: bandwidth, not RAM

This is the binding constraint on a single VPS, and it is worth internalising before committing
to group calls.

An SFU receives one upstream per participant and sends N−1 downstream to each. For a
five-person call at 720p (~1.5 Mbps per stream):

| | |
|---|---|
| Server ingress | 5 × 1.5 = **7.5 Mbps** |
| Server egress | 5 × (4 × 1.5) = **30 Mbps** |
| One hour of that call | ≈ **13.5 GB of egress** |

Twenty hour-long five-person meetings a month is ~270 GB. A daily half-hour standup is
~150 GB/month on its own. **Check the transfer allowance on the InterServer plan before sizing
anything else** — this is far more likely to bite than RAM.

Two mitigations, both worth building in from the start:

- **Simulcast with a 360p layer** (~500 kbps). Drops the same call to ~4.5 GB/hour — a
  three-fold saving for a quality difference few people notice in a five-person grid.
- **Audio-only by default above ~4 people**, video opt-in. Audio is ~40 kbps; a ten-person
  audio call is under 4 Mbps of egress in total.

### 2.4 Recommended sizing

| | RAM | vCPU | Disk | Covers |
|---|---|---|---|---|
| Today | 2 GB | ? | ? | App + WhatsApp only. No headroom for calling |
| **Phase 1–3 (1-to-1 + TURN)** | **4 GB** | **2** | +20 GB | 1-to-1 audio/video/screen share, TURN relay, recording staging |
| **Phase 5 (group SFU)** | **8 GB** | **4** | +100 GB | Small group calls up to ~6, 2–3 concurrent |

**On RAM:** 4 GB is the floor for anything in this plan; 2 GB has no room once coturn and a
larger Node heap are added. 8 GB is what group calls need — not because mediasoup is enormous,
but because it has to coexist with a Chromium session whose RSS grows and with the nightly
transcode spike.

**On CPU:** more binding than RAM for the SFU. mediasoup runs one C++ worker per core, and
packet forwarding for a handful of concurrent calls wants real cores. 4 vCPU is the realistic
minimum for group calling; 2 is fine for 1-to-1, where media never touches the server at all.

**On disk:** browser recordings land on VPS disk before going to S3. A one-hour 720p WebM is
roughly 500 MB–1 GB. Recordings currently follow the video path in
`server/utils/taskMedia.js:58-127` — local disk, compressed overnight, then pushed to S3 — so a
day's recordings sit on the box until the next midnight run. 100 GB gives comfortable headroom;
the true long-term storage is S3, which needs a lifecycle policy.

### 2.5 Server changes required beyond the resize

1. **Firewall.** ufw currently allows only 22/80/443 (`Whatsapp.md:462-465`). TURN needs
   UDP 3478 plus a relay port range (e.g. 49160–49200/udp); the SFU needs its own UDP range.
   Both must be opened, and both range-limited rather than opened wide.
2. **TLS for TURN.** `getUserMedia` already requires HTTPS, which `hrm.gts.ai` has. But the
   restrictive networks that need TURN at all are often the ones that only allow 443 — and 443
   is taken by nginx. Either run TURN over TLS on 5349 and accept that some networks still
   fail, or use nginx's `stream` module to demux TLS-TURN off 443. Start with 5349.
3. **Move the nightly transcode.** Two `-preset medium` encodes at 00:00 will saturate the
   cores an SFU needs. Change the schedule at `server/cron/videoCompressionCron.js:190` away
   from midnight, drop `CONCURRENCY` to 1 on the shared box, and `nice` the ffmpeg children.
4. **nginx.** Confirm `client_max_body_size` (must already be ≥300 MB since chat uploads work)
   and raise `proxy_read_timeout` for long-lived socket.io connections.
5. **S3 lifecycle policy.** Recordings accumulate permanently otherwise. At ~500 MB/hour, 100
   hours a month is 50 GB/month compounding. Decide retention before the first recording is
   made — the feature draft flags this as F8.6, and it is a policy question, not a technical
   one.

### 2.6 Raise the upload cap for recordings

`server/middleware/chatUploadMiddleware.js:86` caps a file at 300 MB. An hour-long recording
will exceed that. Either raise the cap on a dedicated recording endpoint or — better — upload
recordings to S3 in chunks directly from the browser using a presigned URL, which bypasses the
VPS entirely. `server/utils/s3Service.js` already has the S3 client, and
`@aws-sdk/s3-request-presigner` is already a dependency.

---

## 3. The attention stack — build this first

Independent of WebRTC, useful on its own, and the piece without which calling cannot work at
all. It should ship before a single line of media code.

The socket is already live on every authenticated page — `client/src/utils/socket.js` is a
module-level singleton, and `Topbar` and `Sidebar` both subscribe to it from `DashboardLayout`
(`client/src/App.js:139,142`), which wraps every authenticated route. So events already arrive
everywhere. What is missing is any way to *notice* them.

**New file `client/src/utils/attention.js`** — four functions, no dependencies:

- `unlockAudio()` — browsers block audio playback without a prior user gesture, so a ringtone
  will silently fail on a page the user has not clicked. Attach a one-time `pointerdown`
  listener at app mount that plays a silent buffer to unlock an `Audio` element, and keep that
  element for later. **Without this, ringing works in development — where you have clicked
  around — and fails for a user who left a tab open.**
- `startRinging()` / `stopRinging()` — loop a ringtone asset. One needs adding to
  `client/public`; there are no audio assets today.
- `flashTitle(text)` — `setInterval` alternating `document.title` between the alert and the
  real title. Nothing mutates `document.title` today; it is the static `HRMS GTS` from
  `client/public/index.html:17`.
- `notify({title, body, onClick})` — Web Notifications API, fired **only** when
  `document.hidden` is true.

**Permission prompt placement.** Do not request notification permission on page load — browsers
penalise it and users reflexively decline. Request it the first time the user starts or answers
a call, and expose a toggle in profile settings for anyone who declined.

**Wire it to chat first.** Point `attention.js` at the existing `notification:new` event that
`Topbar.js:33-43` already consumes. Mentions and DMs start making a sound and raising an OS
banner with no calling code in the tree — immediate value, and it de-risks the audio unlock and
permission flow before calls depend on them.

---

## 4. Signalling and call state

### 4.1 Server

**`server/models/Call.js`** — new model.

```
conversationId  → Conversation        (calls hang off a conversation, not a project)
initiator       → User
participants[]  { user, joinedAt, leftAt, state: invited|ringing|joined|declined|missed }
kind            'audio' | 'video'
mode            'p2p' | 'sfu'
state           'ringing' | 'active' | 'ended'
startedAt / answeredAt / endedAt / durationSec
endReason       'completed' | 'declined' | 'missed' | 'cancelled' | 'failed'
recording       { s3Key, url, uploadedBy, durationSec, status }
```

Index on `{ conversationId: 1, createdAt: -1 }` for history.

**`server/utils/callSignalling.js`** — new module holding every `socket.on('call:*')` handler.
Called from inside `io.on('connection')` in `server/utils/realtime.js` as
`registerCallHandlers(socket)`, keeping `realtime.js` as the transport and this as the
protocol. Emits only through the existing `emitToUser` / `emitToUsers` helpers — no new emit
paths.

**`server/routes/calls.js`** — REST for call history per conversation, a single call's detail,
and the presigned-URL mint for recording upload.

**Events, client → server:** `call:start` · `call:accept` · `call:decline` · `call:cancel` ·
`call:leave` · `call:signal` (SDP and ICE passthrough, `{callId, toUserId, data}`).

**Events, server → client:** `call:incoming` · `call:ringing` · `call:accepted` ·
`call:declined` · `call:claimed` · `call:ended` · `call:signal` · `call:participant-joined` /
`-left`.

**Authorisation on every single event** — resolve the `Call`, then check the socket's `userId`
against conversation membership using the existing `isMember` from
`server/utils/conversationAccess.js`. A socket may not signal into a call it is not in.

### 4.2 Two traps specific to this codebase

**Hidden oversight admins must never be invited to a call.** `conversationAccess.js` supports
`hidden: true` members (F3.10 — an ADMIN silently watching a group). If call invites are
resolved from `conversation.members` naively, a hidden admin's phone rings and the concealment
collapses — or worse, they join a call invisibly, which is a materially more serious thing than
reading a text log. **Resolve callees through `visibleMembers`, never the raw array**, mirroring
what `server/utils/projectAccess.js` already does when it excludes hidden members from the
project Team tab.

**External participants cannot join calls in Phase 1** — this settles F8.7. Portal users are
scoped to exactly one conversation by `middleware/externalAuthMiddleware.js`, and granting them
media access widens the surface for the least-trusted account class in the system. Recommend
deferring until internal calling is proven.

### 4.3 The multi-tab ringing problem

`emitToUser` uses `io.to(roomFor(userId))`, so `call:incoming` lands in **every tab the user has
open**, with no leader election and no "answered elsewhere" signal. Two layers fix it:

1. **Server-side** — when one tab sends `call:accept`, the server emits `call:claimed` carrying
   the winning `socket.id` to `user:<id>`. Every other tab compares against its own socket id
   and stops ringing.
2. **Client-side** — a `BroadcastChannel('hrms-call')` leader election so only one tab plays the
   ringtone even before the server round-trip. Without this, three open tabs produce three
   overlapping ringtones for the ~200 ms until the server replies.

### 4.4 Missed calls

When ringing times out (~35 s), write a `Notification` with a new `CALL` type. The `post('save')`
hook at `server/models/Notification.js:53-61` pushes it over the socket for free, and the
existing bell in `Topbar` renders it with no extra wiring.

**Add `'CALL'` to the enum at `Notification.js:19` *and* to the `TYPES` array at
`server/routes/notifications.js:7`.** There is an existing bug where `CHAT` was added to the
model but not to that array, so `?type=CHAT` is silently dropped by the filter — worth fixing at
the same time, and worth not reproducing.

Then fire a WhatsApp message using `sendWhatsAppMessage` from
`server/services/whatsapp.service.js`, **unawaited, after the response** — the established
pattern at `server/routes/tasks.js:1511-1532` and `server/utils/nudge.js:172-180`, because a
single send costs seconds of Chromium typing simulation.

### 4.5 Client

| File | Job |
|---|---|
| `client/src/context/CallContext.js` | Provider mounted in `DashboardLayout` alongside Topbar and Sidebar, so it is live on every page. Owns call state, the `RTCPeerConnection` map, and socket subscriptions |
| `client/src/components/call/IncomingCallModal.js` | The ringing UI |
| `client/src/components/call/CallScreen.js` | Video tiles, mute, camera, screen share, hang up |
| `client/src/utils/webrtc.js` | Peer connection construction, ICE config, track handling |

Call buttons go in the `ChatWindow` header (`client/src/components/chat/ChatWindow.js`) and in
`GroupInfoPanel` for group calls.

---

## 5. Recording (browser-side)

Recording runs in the participant's browser via `MediaRecorder`, which is what keeps the server
sizing in §2 affordable.

**What gets recorded.** Start with **audio only** — the local microphone plus every remote audio
track, mixed through a single `AudioContext` destination. Small files, high reliability, and it
covers the actual business need: what was agreed in the meeting. A video composite requires
drawing every tile to a `<canvas>` and capturing that stream, which is real work and should be a
later phase.

**Chunking and upload.** Call `mediaRecorder.start(10000)` for 10-second chunks and upload them
progressively to S3 via presigned multipart URLs, rather than accumulating an hour of Blob in
memory and uploading at the end. Uploading direct from the browser also **bypasses the 300 MB
multer cap** at `server/middleware/chatUploadMiddleware.js:86`, which an hour-long recording
would otherwise exceed, and keeps the file off the VPS disk entirely.

**The honest trade-off.** If the recorder's tab crashes or they close the window, everything
after the last uploaded chunk is lost. Progressive upload bounds the loss to ~10 seconds rather
than the whole meeting, but browser-side recording is best-effort by nature. Say so in the UI
rather than implying a guarantee.

**Consent (F8.6) is not optional.** Every participant must see a persistent recording indicator,
a system message must be posted into the conversation when recording starts, and the `Call`
document records who started it. The feature draft flags retention as needing sign-off before
build — that decision gates the S3 lifecycle policy in §2.5.

---

## 6. Group calls (SFU)

**Recommendation: mediasoup**, over LiveKit or Janus.

The deciding factor is that by the time we reach this phase we will already have written a
complete signalling layer over socket.io for one-to-one calls. mediasoup is a Node library with
C++ worker processes — it provides transport and routing and expects *us* to own signalling, so
that existing layer is reused rather than replaced. LiveKit is a well-built separate Go server,
but it brings its own signalling protocol and its own JWT auth model, which would mean running a
second service with a second notion of identity next to the one in
`middleware/authMiddleware.js`. On a single shared box with an auth system already in place,
mediasoup is the smaller total system.

The cost is that mediasoup is lower-level and we write more code. Acceptable, given the
signalling work is already done.

**Sizing constraints from §2.3 apply here**: enable simulcast with a 360p layer, and default
calls above four people to audio-only with video opt-in. Egress, not RAM, is what limits how
many concurrent group calls this box can carry.

---

## 7. Build order

Each phase is independently shippable and useful on its own.

| Phase | Delivers | Notes |
|---|---|---|
| **1. Attention stack** | Ringtone, tab-title flash, OS notifications — wired to existing chat mentions | No WebRTC at all. De-risks audio unlock and the permission flow |
| **2. 1-to-1 audio** | P2P audio calls, coturn deployed, call history, missed-call notification + WhatsApp | The `Call` model, signalling module and multi-tab fix all land here |
| **3. 1-to-1 video + screen share** | F8.1, F8.2, F8.4 | Mostly client work; Phase 2 signalling is unchanged |
| **4. Audio recording** | Browser-side, progressive S3 upload, consent indicators | Needs the retention decision made first |
| **5. Group calls** | mediasoup SFU, simulcast | Requires the 8 GB / 4 vCPU resize |
| **6. Video recording** | Canvas composite | Only if Phase 4 proves the demand |

Phases 1 and 2 are worth doing regardless of whether group calling ever ships.

---

## 8. Verification

**Phase 1 (attention).** Open the HRMS in two browser profiles, background one tab, send a
mention from the other. Expect a sound, a flashing title, and an OS banner. Then reload the
backgrounded tab and *do not click it* before sending another mention — this is the autoplay
case, and it is the one that breaks.

**Phase 2 (1-to-1).** Place calls between the `testadmin@gts.ai` and `testuser@gts.ai` accounts
already used in the QA guide.

- Both on the office network → `chrome://webrtc-internals` should show a `host` or `srflx`
  candidate pair, confirming peer-to-peer with no relay.
- One end tethered to a phone hotspot → expect a `relay` pair, confirming coturn works.
- Open three tabs as the callee: exactly one should ring, and all three should stop the moment
  one answers.
- Decline one call, then let another ring out — expect a `CALL` notification in the bell and a
  WhatsApp message.
- As an ADMIN silently watching a group, start a group call from another member's account and
  confirm the admin is **not** invited and does not ring.

**Sizing.** Before and after the resize, run `free -h`, `pm2 list` and `df -h` on the box, and
watch `free -h` during a call. Confirm the nightly transcode has been moved off midnight before
running a call at 00:00.

**Load.** A five-person call for ten minutes while watching `vnstat` or `iftop` for actual
egress. Compare against the 30 Mbps estimate in §2.3 before committing to a plan tier.

---

## 9. Open items needing a decision

1. **Recording retention** (F8.6) — how long recordings are kept, and who can access them. Gates
   the S3 lifecycle policy. Policy question, not technical.
2. **InterServer transfer allowance** — must be read off the current plan before group calling
   is committed to. §2.3 is the reason.
3. **Whether external participants ever get calls** (F8.7) — recommended as no for now; needs a
   decision if that changes.
4. **Two facts that cannot be answered from the repo** and must be read off `163.245.209.108`:
   the nginx config (`client_max_body_size`, proxy timeouts, socket.io upgrade handling), and
   actual `free -h` / `df -h` / `pm2 list` output.
