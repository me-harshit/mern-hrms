# WhatsApp for HRMS

How the HRMS sends WhatsApp messages, where everything lives, and how to check
it is working.

**Status: live.** The gateway is running, the number is linked, and task nudges
go out over WhatsApp today.

---

## 1. How it fits together

```text
HRMS (task nudge, later: leave/attendance notices)
        │
        ▼
server/utils/nudge.js
        │
        ├──────────────► Notification model  ──► socket.io  ──► in-app bell
        │                (always, not optional)
        │
        ▼
server/services/whatsapp.service.js     ← the ONLY file that knows OpenWA exists
        │
        ▼  HTTP, localhost only
OpenWA gateway  (127.0.0.1:2785, systemd unit `openwa`)
        │
        ▼  headless Chromium running WhatsApp Web
   WhatsApp
```

Both processes sit on the **same VPS**, so the HRMS talks to OpenWA over
`127.0.0.1` — no TLS, no public hop, no Nginx in between.

Two rules hold throughout:

1. **In-app is not a channel choice.** It always fires. It is the record inside
   the product — the thing the per-task nudge count counts. WhatsApp is an extra
   way to get someone's attention.
2. **No channel may fail the action.** A nudge whose WhatsApp send died is still
   a nudge, recorded with `failed` against its WhatsApp row. Every outbound call
   is wrapped; nothing is thrown at the user who pressed the button.

There is deliberately **no public subdomain**. `whatsapp.gts.ai` was set up and
then removed — the gateway needs no inbound access, and exposing it would put a
logged-in WhatsApp account on the open internet. See §6 for how to reach the
dashboard when you need it.

---

## 2. Folder structure

### The gateway — kept outside the HRMS project

```text
/var/www/Whatsapp/OpenWA/
├── .env                      ← API key, port, AUTO_START_SESSIONS
├── dist/                     ← built API (npm run build)
├── dashboard/dist/           ← built UI  (npm run build:all)
├── node_modules/
└── data/
    ├── openwa.sqlite         ← sessions, message log
    ├── main.sqlite           ← api keys, audit log
    ├── sessions/             ← WhatsApp auth — THIS IS THE CREDENTIAL, back it up
    ├── .api-key              ← the generated key, if you ever lose it
    └── .env.generated        ← settings the dashboard owns (do not hand-edit)
```

Deliberately **not** inside `/var/www/mern-hrms`. It is a separate application
with its own dependencies, its own Node version, and its own failure modes.

### The HRMS side

```text
/var/www/mern-hrms/server/
├── .env                          ← OPENWA_BASE_URL / _API_KEY / _SESSION_ID
├── services/
│   └── whatsapp.service.js       ← the OpenWA boundary. Swap providers here.
├── utils/
│   └── nudge.js                  ← who may nudge, cooldown, dispatch
├── models/
│   └── Nudge.js                  ← one doc per recipient, per-channel delivery
├── routes/
│   └── tasks.js                  ← GET /:id/nudges, POST /:id/nudge
└── scripts/
    └── testNudges.js             ← 36-assertion harness (OpenWA stubbed)

/var/www/mern-hrms/client/src/
├── components/
│   ├── NudgeModal.js             ← compose: who + WhatsApp on/off
│   └── TaskNudges.js             ← task panel: counts + log
└── styles/nudge.css
```

### System

```text
/etc/systemd/system/openwa.service   ← the service definition
/home/openwa/.nvm/versions/node/v22.23.2/bin/node   ← Node 22 (nvm, openwa user)
```

---

## 3. Why it is built this way

**A dedicated `openwa` system user.** OpenWA drives a headless Chromium
processing content from WhatsApp — a large, hostile-input attack surface.
Whatever user it runs as can read `mern-hrms/server/.env`, which holds the Atlas
connection string, AWS keys and the JWT secret. A separate user removes that
link entirely.

**Node 22 via nvm, not a system upgrade.** OpenWA's `package.json` declares
`engines: >=22.13` and genuinely will not build on the system's Node 20. The
HRMS runs on 20 and is left untouched; systemd points at the nvm binary by
absolute path.

**One number, one place.** WhatsApp permits a single active session per phone
number. Running a second OpenWA instance anywhere — including a developer laptop
— on the same number logs the first one out. For local development, tunnel to
the server instead (§6).

**SQLite, no Redis, no Postgres.** The VPS has ~1.4 GB free and Chromium is the
heavy tenant. Nothing here needs more.

---

## 4. Setup, as actually performed

Reference for rebuilding this on a new box. Not a script — read each step.

### 4.1 System user and dependencies

```bash
sudo adduser --system --group --home /home/openwa --shell /bin/bash openwa
sudo mkdir -p /var/www/Whatsapp && sudo chown openwa:openwa /var/www/Whatsapp

sudo apt update && sudo apt install -y \
  build-essential python3 \
  ca-certificates fonts-liberation libatk-bridge2.0-0 libatk1.0-0 \
  libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
  libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 \
  libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
  libasound2t64
```

`build-essential` is not optional — `better-sqlite3` compiles from source and
fails with `not found: make` without it. The `lib*` packages are Chromium's
runtime; without them the browser will not launch and sessions never leave
`initializing`. On Ubuntu 22.04 use `libasound2` instead of `libasound2t64`.

### 4.2 Node 22, scoped to the openwa user

```bash
sudo -u openwa -H bash -lc '
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  source ~/.nvm/nvm.sh
  nvm install 22
  which node
'
```

Note the printed path — systemd needs it verbatim.

### 4.3 Clone and build

```bash
sudo -u openwa -H bash -lc '
  source ~/.nvm/nvm.sh
  cd /var/www/Whatsapp
  git clone https://github.com/rmyndharis/OpenWA.git
  cd OpenWA
  npm ci
  npm run build:all
'
```

`build:all`, not `build` — plain `build` compiles only the API and leaves the
dashboard unbuilt (the startup banner says so).

### 4.4 Configure

```bash
openssl rand -hex 32          # generate the API key
sudo -u openwa -H bash -lc 'cd /var/www/Whatsapp/OpenWA && cp .env.example .env && nano .env'
```

Set only these. **Every other line stays commented** — per that file's own
header, an uncommented value *pins* the setting and the dashboard can no longer
change it:

```env
NODE_ENV=production
PORT=2785
API_MASTER_KEY=<the openssl output>
AUTO_START_SESSIONS=true
```

`AUTO_START_SESSIONS=true` is what makes a crash or reboot self-heal. Without
it the process comes back but the WhatsApp session stays down, and sends fail
silently until someone calls `/start` by hand.

### 4.5 systemd

`/etc/systemd/system/openwa.service`:

```ini
[Unit]
Description=OpenWA WhatsApp Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=openwa
Group=openwa
WorkingDirectory=/var/www/Whatsapp/OpenWA
ExecStart=/home/openwa/.nvm/versions/node/v22.23.2/bin/node dist/main
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

No `EnvironmentFile=` — the app loads its own `.env`, and pointing systemd at it
too risks two parsers disagreeing.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openwa
```

### 4.6 Link the number

Pairing code, not QR — an 8-character code typed into the phone, so no image has
to leave the server.

```bash
API="http://127.0.0.1:2785"
KEY="<your API_MASTER_KEY>"
PHONE="916376137350"          # digits only, country code first, no +

# create
curl -s -X POST "$API/api/sessions" -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" -d '{"name":"hrms-primary"}'
# note the returned "id" — that is OPENWA_SESSION_ID

SID="<the returned id>"
curl -s -X POST "$API/api/sessions/$SID/start" -H "X-API-Key: $KEY"

# wait until status reads qr_ready, then:
curl -s -X POST "$API/api/sessions/$SID/pairing-code" -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" -d "{\"phoneNumber\":\"$PHONE\"}"
```

On the **dedicated** handset: WhatsApp → Settings → Linked Devices → Link a
Device → *Link with phone number instead* → enter the 8-character code.

Never a personal number. Unofficial automation carries account-restriction risk,
and a ban on someone's personal WhatsApp is a bad day.

### 4.7 Point the HRMS at it

In `/var/www/mern-hrms/server/.env`:

```env
OPENWA_BASE_URL=http://127.0.0.1:2785
OPENWA_API_KEY=<same key>
OPENWA_SESSION_ID=<the session id from 4.6>
WHATSAPP_DEFAULT_COUNTRY_CODE=91

APP_BASE_URL=https://hrm.gts.ai
```

`APP_BASE_URL` is what builds the task link inside the WhatsApp message. Left
unset it falls back to the request host, which on a local run is `localhost` —
a dead link in the recipient's phone.

Restart the HRMS (`pm2 restart <name>`) — editing `.env` changes nothing until
the process reloads.

### 4.8 Employee numbers

`whatsappNumber` and `whatsappNotificationsEnabled` live on the `User` model and
are editable on **Edit Employee**.

`whatsappNumber` is deliberately separate from `phoneNumber`: for most people
they are the same and it can be left blank (sends fall back to `phoneNumber`),
but a work handset that has never had WhatsApp installed is exactly how a
company ends up messaging a landline every morning.

`normalisePhone()` copes with how people actually type numbers —
`+91 98765 43210`, `098765-43210`, `9876543210` all become `919876543210`.
Anything implausible returns `null` and the send is recorded `skipped`.

---

## 5. Health checks

### Is the service running?

```bash
sudo systemctl status openwa
```

### Is WhatsApp actually connected?

**This is the one that matters.** The service can be running happily with the
phone unlinked, and every send fails silently.

```bash
source /var/www/mern-hrms/server/.env 2>/dev/null
curl -s "http://127.0.0.1:2785/api/sessions/$OPENWA_SESSION_ID" \
  -H "X-API-Key: $OPENWA_API_KEY" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'],'|',d['phone'],'|',d.get('lastError'))"
```

Want: `ready | 916376137350 | None`

| status | meaning |
| --- | --- |
| `ready` | connected, sends will work |
| `initializing` / `authenticating` | starting up, wait ~40s |
| `disconnected` | reconnect backoff in progress |
| `failed` | terminal — check `lastError` and the journal |
| `qr_ready` | **not linked** — needs pairing again |

### Logs

```bash
journalctl -u openwa -n 100 --no-pager    # recent
journalctl -u openwa -f                   # live
```

### From the HRMS side, through the real code path

```bash
cd /var/www/mern-hrms/server
node -e "
require('dotenv').config();
const w = require('./services/whatsapp.service');
w.getSessionStatus().then(s => console.log(s));
"
```

Want: `{ configured: true, connected: true, detail: 'ready', phone: '...' }`

---

## 6. Reaching the dashboard

There is no public URL by design. Tunnel in:

```bash
ssh -L 2785:127.0.0.1:2785 root@163.245.209.108
```

Then open `http://localhost:2785` and log in with the API key.

**If the page renders blank white:** that is `CSP_UPGRADE_INSECURE_REQUESTS`,
which defaults on under `NODE_ENV=production`. The browser upgrades the UI's own
scripts to `https://`, the plain-HTTP tunnel cannot answer, and you get an empty
page with no error. Add `CSP_UPGRADE_INSECURE_REQUESTS=false` to the gateway's
`.env` and restart.

---

## 7. Testing

### 7.1 The automated harness — run this after any change to nudge code

```bash
cd /var/www/mern-hrms/server
node scripts/testNudges.js
```

Needs a **local mongod**. It drops its own database each run and refuses to
start against anything that is not localhost with `test` in the name. OpenWA is
stubbed, so it tests the rules — permissions, cooldown, counting, how a dead
channel is recorded — not the gateway.

Expect: `ALL PASS - 36 passed, 0 failed`

### 7.2 One real message, end to end

```bash
cd /var/www/mern-hrms/server
node -e "
require('dotenv').config();
const w = require('./services/whatsapp.service');
w.sendWhatsAppMessage('916376137350', 'Test from HRMS.').then(r => console.log(r));
"
```

Want `{ ok: true, detail: 'true_...' }` and the message on the phone. This runs
the finished service, not a hand-built curl — it validates the whole path.

### 7.3 Through the app, as a user

The strongest test, because it exercises `routes/tasks.js` → `utils/nudge.js` →
`whatsapp.service.js` → OpenWA and writes the delivery record back to Mongo the
way real use does:

1. Open a task you are the assigner or an assignee on.
2. Press **Nudge**, leave WhatsApp ticked, send.
3. The Nudges panel count goes up, and the per-person tally appears.
4. The message lands on the recipient's phone.
5. The recipient's bell shows an in-app notification too.

### 7.4 The failure paths — these matter more than the happy path

Anyone can make one message send. The system is only trustworthy if it degrades
correctly:

| Test | How | Expect |
| --- | --- | --- |
| No number on file | Nudge someone whose profile has no phone/WhatsApp number | delivery `skipped`, reason names the profile; nudge still recorded in-app |
| Opted out | Set `whatsappNotificationsEnabled: false` on Edit Employee | delivery `skipped`; nothing sent |
| Gateway down | `sudo systemctl stop openwa`, send a nudge | HTTP 201, in-app notification arrives, WhatsApp row reads `failed`. Then `sudo systemctl start openwa` |
| Cooldown | Nudge the same person on the same task twice | second returns **429** with "You can nudge again in N min" |
| Completed task | Nudge a task marked Completed | 400, refused |
| Reboot recovery | `sudo systemctl restart openwa`, poll status | reaches `ready` on its own within ~40s, no manual `/start` |

The reboot-recovery test is the one to re-run after any change to the gateway's
`.env` — it is what proves `AUTO_START_SESSIONS` is still doing its job.

---

## 8. What the nudge feature actually does

A nudge is a **ping, not a question**. Nobody replies to it; there is no ETA to
record. The employee learns the work is being watched, and the task carries a
count of how many times that has happened. That count is the point — a task
nudged five times reads differently from one never nudged.

Anything worth actually saying goes in the task's discussion thread, which
already exists and is better at it.

- **Who may nudge:** the assigner, Admin/HR, any assignee (including nudging a
  co-assignee), or a Team Lead whose own team member is on it. Same rule the
  discussion thread uses — there is no second notion of "access to a task".
- **Nobody can nudge themselves**, and only people on the task can be nudged.
- **Cooldown:** `NUDGE_COOLDOWN_MINUTES`, default **120**, per sender. Without a
  floor, "Nudge" becomes a button someone taps six times while annoyed — and the
  count stops meaning anything.
- **Channels:** in-app always; WhatsApp optional per nudge.
- **Fixed wording.** No sender free text. A free-text box on a one-tap chase
  button invites exactly the messages a chase should not carry.

---

## 9. Operational notes

**Back up `data/sessions/`.** It is a logged-in WhatsApp account. Losing it means
re-pairing from the handset. Never commit it.

**The API key is server-side only.** No `REACT_APP_` variable holds it. The
browser talks to the HRMS; the HRMS talks to OpenWA.

**Port 2785 must stay closed.** `ufw` is default-deny with only 22/80/443 open,
which is what actually protects it — the app itself binds `0.0.0.0`. Verify with
`sudo ufw status verbose`; the `Default: deny (incoming)` line is the one that
matters.

**Watch memory.** Chromium is the heavy tenant on a 2 GB box. `free -h` after a
few days of uptime; if RSS climbs steadily, a nightly systemd restart is cheaper
than more RAM — but confirm the session survives the restart before relying on
it.

**Keep the OS patched.** `unattended-upgrades` was found wedged for 103 days on
this box. Check occasionally:

```bash
systemctl list-timers | grep apt
apt list --upgradable 2>/dev/null | head
```

---

## 10. Not built yet

Deliberately out of scope for now, in rough order of value:

1. **A delivery queue.** Sends are inline, inside the request. Right for one
   message to one person with the sender watching; wrong the moment an action
   fans out to twenty people. A DB-backed queue with 1/5/30-minute backoff and
   three attempts, then dead — no Redis needed at this volume.
2. **Quiet hours.** Nothing automated before 09:00 or after 20:00 IST. Needed
   *before* any scheduled notification ships, not after — an overdue-task ping
   at 23:40 teaches staff to mute the number.
3. **Per-category opt-out.** `whatsappNotificationsEnabled` is one switch, fine
   while a nudge is the only WhatsApp message. Once attendance reminders exist,
   someone who wants nudges but not daily pings has only one option: off.
4. **Wider notifications** — task assigned, due today, overdue, leave decisions,
   attendance reminders — all through a single `notification.service.js` so no
   route builds a WhatsApp message itself.
5. **Inbound replies.** Requires a public webhook with a shared secret, a
   known-sender check and a rate limit, plus a way to match a reply to a task.
   Much larger than it looks; leave until there is a reason.
