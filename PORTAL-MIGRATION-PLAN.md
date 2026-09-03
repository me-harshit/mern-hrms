# GTS Portal migration runbook

Renaming the product from **GTS HRMS** to **GTS Portal**: domain, mailbox, storage, database, repo and
branding. Work through the stages in order — each one is gated by its own verification and each has a
rollback. Nothing after Stage 3 is destructive; the old database and old bucket are read-only sources
throughout and are only deleted at the very end, after a bake period.

Tick the boxes as you go. This file is tracked, so its state is the migration's state.

---

## Name mapping

| Thing | From | To |
|---|---|---|
| GitHub repo | `me-harshit/mern-hrms` | `me-harshit/GTS-Portal` |
| Local folder | `C:\mern-hrms` | `C:\GTS-Portal` |
| VPS app dir | `/var/www/mern-hrms` | `/var/www/gts-portal` |
| Bare deploy repo | `/var/repo/hrms.git` | `/var/repo/gts-portal.git` |
| Domain | `hrm.gts.ai` | `portal.gts.ai` |
| Sending mailbox | `hrm@gts.ai` | `portal@gts.ai` |
| Mongo database | `hrms_db` | `gtsportal_db` |
| S3 bucket | `gts-hrm` | `gts-portal` |
| S3 key prefix | `HRMS/` | `GTSPortal/` |
| Display name | `GTS HRMS` | `GTS Portal` |

## Deliberately NOT renamed

| Thing | Value | Why |
|---|---|---|
| Atlas cluster host | `clusterhrms.zonrtdk.mongodb.net` | Atlas cluster names are **immutable**. Changing it means provisioning a new cluster and doing a live migration. It appears only inside the connection string — no user ever sees it. |
| WhatsApp session | `OPENWA_SESSION_ID=hrms-primary` | Renaming forces a re-pair: someone re-scans a QR code and WhatsApp notifications are down until they do. Invisible to users. |
| Atlas DB user | `GtsHRMS_User` | Optional cosmetic change. If you want it, create the new user and grant it access to `gtsportal_db` during Stage 6, then delete the old one after the bake period. |

## ⚠️ Standing hazard: do not rename anything containing `portal`

"Portal" is **already a distinct feature** in this codebase — the external participant portal, for people
outside the company. A find-and-replace on the word `portal` would be catastrophic. These must not be touched:

- `/api/portal` namespace — `server/index.js:69`
- `server/routes/portal.js`, `server/utils/portalShape.js`
- `server/middleware/externalAuthMiddleware.js` (the `x-portal-token` header)
- `client/src/pages/Portal.js`, `client/src/utils/portalApi.js`
- The `portalToken` localStorage key
- The public route `/portal/:inviteToken`

Every rename in this document targets the strings `HRMS`, `hrm`, `mern-hrms` and `gts-hrm` **only**.

---

## Stage 0 — Facts, access and baselines

Read-only. Do this before anything moves.

- [ ] **Production IP is `163.245.209.108`.** The `production` git remote in `.git/config` points at
      `69.164.245.132`, which is **stale — do not push to it**. Fix it in Stage 7:
      `git remote set-url production root@163.245.209.108:/var/repo/gts-portal.git`
- [ ] SSH in and capture the things that exist only on the server:
      ```bash
      pm2 list                                    # the app name — not recorded anywhere in the repo
      pm2 describe <name>                         # cwd, script path, env
      cat /etc/nginx/sites-available/*            # server_name, root, proxy_pass, client_max_body_size
      cat /var/repo/hrms.git/hooks/post-receive   # how deploy actually works
      certbot certificates                        # which cert covers hrm.gts.ai
      crontab -l; systemctl list-units | grep -Ei 'openwa|hrms'
      free -h; df -h                              # 2 GB box — check headroom before an ffmpeg run
      ```
- [ ] Commit those into the repo as `deploy/nginx.conf`, `deploy/post-receive`, `deploy/openwa.service`,
      `deploy/README.md`.

      > This is worth doing regardless of the rename. There is no `.github/`, Dockerfile, nginx conf, PM2
      > ecosystem file or systemd unit anywhere in the repo **or in its git history** — the deployment is
      > currently not reproducible from source. If the VPS is lost, the deployment is lost with it. Later
      > stages then edit these files under version control instead of editing blind on the server.

- [ ] **Full database backup:**
      ```bash
      mongodump --uri="<MONGO_URI>" --out=backup-preRename-$(date +%F)
      ```
- [ ] **S3 baseline** — you need these numbers to verify the copy in Stage 2:
      ```bash
      aws s3 ls s3://gts-hrm --recursive --summarize | tail -5
      aws s3api get-public-access-block --bucket gts-hrm
      aws s3api get-bucket-policy --bucket gts-hrm > policy.json
      aws s3api get-bucket-cors --bucket gts-hrm
      ```
- [ ] **Drain the video compression queue.** `VideoCompressionQueue.localPath`
      (`server/models/VideoCompressionQueue.js:32`) stores an **absolute** path built from
      `path.join(__dirname, '../uploads/tasks')` — i.e. `/var/www/mern-hrms/server/uploads/...`. Any row still
      `queued` when the directory is renamed fails with "Staged file missing"
      (`server/cron/videoCompressionCron.js:106`). Let the midnight job clear it, or handle it in Stage 6.
      ```
      db.videocompressionqueues.countDocuments({ status: { $in: ['queued', 'processing'] } })
      ```

---

## Stage 1 — DNS: cPanel + Cloudflare

- [ ] Create the `portal.gts.ai` subdomain in cPanel.
- [ ] In Cloudflare, add an **A record**: `portal` → `163.245.209.108`.
- [ ] Leave `hrm.gts.ai` exactly as it is. It stays live for 90 days.

### ✅ Done — proxied (orange cloud), matching `hrm.gts.ai`

`portal.gts.ai` was created proxied through Cloudflare, the same as `hrm.gts.ai` already was. That is a
consistent choice and it works: Cloudflare's Universal SSL cert covers `gts.ai` and `*.gts.ai`, so the new
hostname served valid HTTPS immediately, before any nginx change. See Stage 3 for the full verified chain.

**Consequence to be aware of — the 100 MB request-body cap.** Cloudflare Free and Pro cap uploads at 100 MB
(Business 200 MB). `README.md:131` describes task videos of "several hundred megabytes"; those fail with a 413
that nginx never sees. Because `hrm.gts.ai` was **already proxied**, this is a pre-existing limit, not
something the migration introduced — but it is now worth confirming deliberately.

- [ ] Test an upload above 100 MB and see whether it succeeds.
- [ ] If it must work: either grey-cloud the record (safe once Stage 3 gives the origin a cert covering both
      names) or move to a plan with a higher cap.

Also relevant while proxied:
- SSL mode is currently **Full**. Stage 3 moves it to **Full (strict)** once the origin cert is valid.
  Never *Flexible* — Flexible plus nginx's HTTP→HTTPS redirect gives an infinite redirect loop.
- Socket.IO works proxied, but WebSockets must be enabled under Network settings.
- The origin IP `163.245.209.108` is still directly reachable, bypassing Cloudflare entirely. Consider
  firewalling :80/:443 to Cloudflare's published ranges (https://www.cloudflare.com/ips/).

### Mail records go on `gts.ai`, not on `portal.gts.ai`

The planned mailbox is **`portal@gts.ai`** — the `@` domain is `gts.ai`, so it is delivered by the **root
domain's** MX (`sys19.prosuperservers.com`). The `portal.gts.ai` subdomain does not need MX, SPF, DKIM or
DMARC records at all; a subdomain MX would only matter for `portal@portal.gts.ai`.

- [ ] Confirm `gts.ai` already has correct **SPF**, **DKIM** and **DMARC** covering the cPanel mail host.
      The new mailbox inherits them.
- [ ] Do **not** add SPF/DKIM to the `portal.gts.ai` zone. Putting them in the wrong zone is the classic
      reason a renamed sender starts landing in spam.

**Verify:** `nslookup portal.gts.ai` returns Cloudflare anycast addresses (e.g. `104.21.7.161`,
`172.67.136.243`) — expected, since the record is proxied. Confirm the origin behind it with
`curl -skI https://163.245.209.108 -H "Host: portal.gts.ai"`.

**Rollback:** delete the A record. Nothing else has changed.

---

## Stage 2 — S3: create and sync `gts-portal`

S3 buckets cannot be renamed. Create the new one and sync early so the eventual cutover window is short.

- [ ] Create the bucket in the same region:
      ```bash
      aws s3 mb s3://gts-portal --region ap-south-1
      ```
- [ ] **Replicate the public-access configuration BEFORE copying.** New buckets have Block Public Access
      **on** by default. Files are served as direct public URLs
      (`server/utils/s3Service.js:74` builds `https://<bucket>.s3.<region>.amazonaws.com/<key>`), so without
      this every image 403s.
      ```bash
      aws s3api put-public-access-block --bucket gts-portal --public-access-block-configuration \
        "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
      # edit policy.json from Stage 0 to say gts-portal, then:
      aws s3api put-bucket-policy --bucket gts-portal --policy file://policy.json
      # if Stage 0 showed a CORS config, apply it too
      ```
- [ ] Copy the objects, remapping the prefix as you go:
      ```bash
      aws s3 sync s3://gts-hrm/HRMS/     s3://gts-portal/GTSPortal/
      aws s3 sync s3://gts-hrm/tempzips/ s3://gts-portal/tempzips/
      ```
      `tempzips/` belongs to the foreverBegins feature (`server/utils/s3Service.js:77-118`). It is served
      through pre-signed URLs generated on demand, so it needs **copying but no URL rewriting**.
- [ ] Re-run both `sync` commands immediately before Stage 6 to pick up anything uploaded in the meantime.
      `sync` is incremental, so the second run is fast.

**Verify:**
```bash
aws s3 ls s3://gts-portal --recursive --summarize | tail -5   # match Stage 0 counts and total bytes
curl -I https://gts-portal.s3.ap-south-1.amazonaws.com/GTSPortal/ProfilePic/<some-known-file>.jpg   # 200
```

**Rollback:** delete the new bucket. `gts-hrm` has not been touched — it is still the live bucket and the app
is still pointed at it.

### ⚠️ State change 2026-09-03: `AWS_S3_BUCKET_NAME` switched early

`AWS_S3_BUCKET_NAME=gts-portal` was set in the server `.env` **before** Stage 6, so new uploads now write to
the new bucket while the key prefix in code is still `HRMS/`. Current layout:

```
gts-hrm     HRMS/        all history — now frozen, no new writes
            tempzips/
gts-portal  GTSPortal/   synced copy of gts-hrm/HRMS/
            tempzips/    synced
            HRMS/        NEW uploads since the env change
```

Nothing is broken: every stored URL points at where its object actually is. Historical rows still read from
`gts-hrm`, new rows read from `gts-portal/HRMS/`.

**Keep the `GTSPortal/` prefix.** Reverting to a plain `HRMS/` prefix would mean re-copying the whole history;
the bulk already landed in `GTSPortal/`, so the only outstanding work is a small intra-bucket copy of the
interim uploads at cutover. Stage 6 handles it, and now needs **two** rewrite rules rather than one.

### 🔴 Live bug introduced by the early switch — `deleteFromS3` aims at the wrong bucket

`server/utils/s3Service.js:125-138` takes the **key** from the stored URL but the **bucket** from the
environment. Those now disagree for every historical file:

| Step | Value |
|---|---|
| Stored URL | `https://gts-hrm.s3…/HRMS/x.jpg` |
| Key extracted | `HRMS/x.jpg` ✅ |
| Bucket used | `gts-portal` ❌ (from env) |
| `gts-portal/HRMS/x.jpg` | does not exist — the copy is at `GTSPortal/x.jpg` |
| S3 response | **204 success** — deleting a nonexistent key is not an error |
| Real object in `gts-hrm` | **still present, still publicly readable** |
| DB row | removed |

So a "deleted" policy document, expense receipt or profile picture stays publicly reachable at its original
URL indefinitely, while the app reports success. That is a data-retention problem, not just wasted storage.

- [ ] Fix it — derive the bucket from the URL that already encodes it, falling back to env:
      ```js
      const parsed = new URL(url);
      const Bucket = parsed.hostname.split('.s3.')[0] || process.env.AWS_S3_BUCKET_NAME;
      ```
      Correct regardless of the migration, and it makes the whole transition period safe.
- [ ] Until that ships, treat every deletion as leaving an orphan. Reconcile after cutover by listing both
      buckets and removing objects no longer referenced by any DB row.

---

## Stage 3 — nginx serves both hostnames

Purely additive. `hrm.gts.ai` keeps working exactly as before, `portal.gts.ai` starts working alongside it.
No redirect yet — that is Stage 4.

### Discovered state (verified 2026-09-03)

Both hostnames are **proxied through Cloudflare** (orange cloud), not DNS-only:

```
browser ──TLS──▶ Cloudflare edge ──TLS──▶ nginx :443 ──▶ app
                 cert: gts.ai + *.gts.ai   cert: hrm.gts.ai only
                 (Google Trust Services)   (mismatched, unvalidated)
```

This is why `portal.gts.ai` served the app **before any nginx change**: Cloudflare's Universal SSL cert already
covers `*.gts.ai`, and the origin's `:443` block is nginx's **default server**, so any `Host` header reaches the
app regardless of `server_name`.

Probing the origin directly at `163.245.209.108`:

| Request | Result | Meaning |
|---|---|---|
| `http://` + `Host: portal.gts.ai` | **404** | port 80 has no matching `server_name` |
| `https://` + `Host: portal.gts.ai` | **200** | default `:443` block answers |
| Origin cert SAN | `DNS:hrm.gts.ai` only | expires Oct 23 2026 |
| `http://portal.gts.ai/.well-known/...` | reaches origin, not 301'd | **"Always Use HTTPS" is OFF** → HTTP-01 will work |

Since HTTP 404s at the origin but the public site works, Cloudflare must be reaching the origin over HTTPS —
so **SSL/TLS mode is "Full", not "Flexible" and not "Full (strict)"**. Full does not validate the origin
certificate at all, which is why the `hrm.gts.ai` mismatch is tolerated.

### Why this still needs fixing

It works, but by accident:

1. **Port 80 404s for `portal.gts.ai`** — certbot's HTTP-01 challenge fails as-is.
2. **The origin cert does not name `portal.gts.ai`** — blocks Full (strict), and blocks ever going grey-cloud.
3. **It relies on default-server fallback** — Stage 4 adds a second vhost, at which point routing changes and
   this breaks in a way that is annoying to debug.

### Steps

- [ ] Back up first:
      ```bash
      ssh root@163.245.209.108
      cp -a /etc/nginx/sites-available /root/nginx-backup-$(date +%F)
      ls -la /etc/nginx/sites-enabled/
      ```
- [ ] Inspect the current vhost — expect two blocks, `listen 80` and `listen 443 ssl`, both
      `server_name hrm.gts.ai;`:
      ```bash
      nginx -T | grep -nE "server_name|listen|root |client_max_body_size"
      ```
- [ ] Add the new host to `server_name` in **both** blocks (port 80 matters — it is what certbot validates
      against):
      ```nginx
      server_name hrm.gts.ai portal.gts.ai;
      ```
- [ ] ```bash
      nginx -t && systemctl reload nginx
      ```
- [ ] **Gate for the next step** — port 80 must stop 404ing:
      ```bash
      curl -sI http://163.245.209.108 -H "Host: portal.gts.ai" | head -3
      ```
- [ ] Expand the existing certificate to cover both names (choose **expand**, not a separate cert):
      ```bash
      certbot --nginx -d hrm.gts.ai -d portal.gts.ai
      ```
      If HTTP-01 fails, fall back to DNS-01 via `certbot-dns-cloudflare` with a scoped API token, which
      sidesteps the proxy entirely.
- [ ] Verify the SAN now lists both names:
      ```bash
      certbot certificates
      echo | openssl s_client -connect 127.0.0.1:443 -servername portal.gts.ai 2>/dev/null \
        | openssl x509 -noout -subject -ext subjectAltName
      ```
- [ ] **Only after that passes:** switch Cloudflare SSL/TLS → Overview → **Full (strict)**.
      A **526** on either hostname means the cert did not expand — revert to Full and recheck.

      > Worth doing on its own merits: "Full" accepts *any* certificate from the origin, including a
      > self-signed one presented by a man-in-the-middle. "Full (strict)" actually validates it.

**Verify:** both `https://portal.gts.ai` and `https://hrm.gts.ai` load the app with a valid cert and no
mixed-content warnings. Log in through the new hostname and confirm Socket.IO connects (two sessions, send a
chat message).

**Rollback:** remove `portal.gts.ai` from both `server_name` lines, set Cloudflare back to Full, reload nginx.
The certificate can keep the extra name harmlessly.

### Two issues this surfaced (not blockers, decide separately)

- **The Cloudflare 100 MB request-body cap is live now.** Free/Pro cap at 100 MB, and `hrm.gts.ai` is proxied
  too — so this is **pre-existing, not introduced by the migration**. `README.md:131` describes task videos of
  "several hundred megabytes"; those are failing with a 413 that nginx never sees. Test a >100 MB upload
  deliberately. If it is needed: grey-cloud the record (safe once the origin cert covers both names) or
  upgrade the plan.
- **The origin IP is publicly reachable** — `163.245.209.108` answers directly, bypassing Cloudflare entirely.
  Consider firewalling :80/:443 to Cloudflare's published ranges (https://www.cloudflare.com/ips/).

### ✅ Stage 3 completed 2026-09-03

Certbot expanded the existing certificate in place and, in deploying it, added `portal.gts.ai` to the
port-80 block as well — which is why the earlier 404 on `:80` resolved itself without a second manual edit.

Verified from outside the network:

| Check | Result |
|---|---|
| origin `:80` + `Host: portal.gts.ai` | `301` → https (was `404`) |
| origin `:443` + `Host: portal.gts.ai` | `200`, explicit `server_name` match |
| origin cert under SNI `portal.gts.ai` | SAN `DNS:hrm.gts.ai, DNS:portal.gts.ai`, expires 2026-12-02 |

Cert lives at `/etc/letsencrypt/live/hrm.gts.ai/` (the lineage keeps the old name — harmless, and renaming
the lineage would break the renewal timer for no gain).

- [x] Cloudflare SSL/TLS → Overview → **Full (strict)** — done 2026-09-03, both hostnames verified 200.
      both names. A `526` would mean the cert did not take.

### 🔴 Discovered: `client_max_body_size` history and the 413 log

`/etc/nginx/sites-available/default:194` was **50M**, not the ≥300 MB that
`Module-8-Voice-Video-Meetings-Plan.md:153` assumed. Raised to **512M** on 2026-09-03, with
`client_body_timeout` / `proxy_read_timeout` / `proxy_send_timeout` set to 300s for large uploads.

**The 28 log entries are historical, not an active failure.** Rejected body sizes were 1.1–2.5 MB — against
nginx's **default 1M**, not against 50M. The limit was raised to 50M at some point after, and the failures
stopped. Most recent entry: **2026/04/26**.

| Endpoint | Count | What it was |
|---|---|---|
| `POST /api/inventory` | 13 | asset media uploads, killed by the old 1M default |
| `POST /api/expenses` | 11 | receipt uploads, same cause |
| `POST /` | 4 | hostile probes claiming 80 GB bodies, from `210.176.44.217`, sent to `host: 163.245.209.108:443` — **direct to the origin IP, bypassing Cloudflare**. Correctly rejected. |

So raising to 512M is headroom for the video pipeline (50M sat below what `README.md:136` describes), not a
fix for an active bleed.

- [ ] **Origin IP hardening** — the probes above reached nginx directly. `server_name` still includes the raw
      IP `163.245.209.108`, so the app is served to anyone who asks for it by address. Firewall :80/:443 to
      Cloudflare's published ranges (https://www.cloudflare.com/ips/); optionally drop the IP from
      `server_name` too.

### 🔴 Pre-existing bug: reimbursement receipts are uploaded then discarded

Found while tracing every `uploadToS3` caller for the prefix change. Not caused by the migration, but it
changes the Stage 6 field list and it orphans S3 objects.

`server/routes/reimbursements.js:115` uploads the receipt, then line ~127 does:

```js
const empTxn = await WalletTransaction.create({
    userId, amount, type: 'Credit', description, performedBy: req.user.id,
    attachmentUrl,                    // ← not in the schema
    linkedExpenseIds: parsedExpenseIds // ← not in the schema  ("Perfect Audit Link")
});
```

`server/models/WalletTransaction.js` declares only `userId`, `amount`, `type`, `description`, `performedBy`,
`date`. Mongoose runs `strict: true` by default, so **both fields are silently dropped**. The receipt reaches
S3 and the url is thrown away — the file is unreachable from the app, invisible in any audit trail, and
undiscoverable by a database-driven orphan sweep. The expense links the comment celebrates are lost the same way.

- [ ] Confirm on the live database:
      ```
      db.wallettransactions.findOne({ attachmentUrl: { $exists: true } })   // expect null
      ```
- [ ] Add `attachmentUrl: { type: String, default: '' }` and
      `linkedExpenseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }]` to the schema.
- [ ] Every receipt uploaded before that fix is an orphan under `Reimbursements/`. They cannot be matched back
      to a transaction from the database — recovery, if wanted, means matching S3 object timestamps against
      `WalletTransaction.createdAt`. Decide whether that is worth doing or whether they are written off.
- [ ] Once fixed, add `WalletTransaction.attachmentUrl` to the Stage 6 rewrite field list.

### ✅ Fixed 2026-09-03 — `deleteFromS3` bucket derivation

`server/utils/s3Service.js:125` now reads the bucket off the url instead of `AWS_S3_BUCKET_NAME`:

```js
const [urlBucket, hostRest] = parsed.hostname.split('.s3.');
const Bucket = hostRest ? urlBucket : process.env.AWS_S3_BUCKET_NAME;
```

Verified against all four url shapes (`gts-hrm/HRMS/`, `gts-portal/HRMS/`, `gts-portal/GTSPortal/`, and a
path-style url falling back to env). Deletions of pre-2026-09-03 files now remove the real object from
`gts-hrm` instead of silently no-opping against `gts-portal`.

- [ ] Deploy it. Orphans created before it ships still need the teardown reconciliation in Stage 8.

### Also noted

`server_name hrm.gts.ai 163.245.209.108;` includes the raw IP, and the origin is publicly reachable, so
`http://163.245.209.108` serves the app directly, bypassing Cloudflare. Firewalling :80/:443 to Cloudflare's
published ranges (https://www.cloudflare.com/ips/) would close both that and the origin-IP exposure.

---

## Stage 4 — Flip to `portal.gts.ai`

> **Target config lives at `deploy/nginx.conf` in this repo.** Copy it up, `nginx -t`, reload.
>
> **Use `302`, not `301`, for the first week.** A 301 is cached by browsers permanently and cannot be
> withdrawn — if you need to back out, every user who hit the old host stays redirected. Promote to 301
> once it has run clean, then retire the block at the 90-day mark.
>
> The config also adds `X-Forwarded-Proto` / `X-Real-IP` / `X-Forwarded-For` to the three proxy locations.
> `server/routes/leaves.js:116` and `server/routes/wfh.js:44` build the 7-day approve links from
> `req.protocol`, which is `http` behind an nginx that sends no forwarded-proto header. Needs
> `app.set('trust proxy', 1)` in `server/index.js` to take effect — the header alone does nothing.

- [ ] In `server/.env` on the VPS:
      ```
      APP_BASE_URL=https://portal.gts.ai
      API_BASE_URL=https://portal.gts.ai
      ```
- [ ] `pm2 restart <name>` — editing `.env` changes nothing until the process restarts.
- [ ] Split the vhost. Primary:
      ```nginx
      server_name portal.gts.ai;
      root /var/www/mern-hrms/client/build;   # becomes /var/www/gts-portal/... in Stage 7
      ```
      Redirect vhost:
      ```nginx
      server {
          server_name hrm.gts.ai;
          return 301 https://portal.gts.ai$request_uri;
      }
      ```
- [ ] `nginx -t && systemctl reload nginx`

### Why the redirect has to stay for a while

`server/routes/leaves.js:116` and `server/routes/wfh.js:44` build the one-click approve/reject email links from
`` `${req.protocol}://${req.get('host')}` `` — they **ignore `API_BASE_URL` entirely** — and those tokens have a
**7-day TTL**. Every approval email already sitting in someone's inbox points at `hrm.gts.ai`.

Seven days is the hard minimum. **Agreed window: 90 days.** Diarise the teardown (Stage 8) so it does not
linger unowned.

### Expect everyone to be logged out

Auth tokens live in `localStorage`, which is scoped per origin, so `portal.gts.ai` starts empty and every user
lands on the login screen once. Harmless, but send a heads-up or it reads as an outage.

**Verify:**
```bash
curl -I https://hrm.gts.ai/login     # 301 → https://portal.gts.ai/login
```
Log in on the new host, upload a large file (>100 MB if you have one — this is where an orange cloud would show
itself), and confirm the WhatsApp health cron's link now reads `portal.gts.ai`
(`server/cron/whatsappHealthCron.js:76`).

**Rollback:** merge the vhosts back into one `server_name` with both hosts, revert the two `.env` values,
`pm2 restart`.

### ✅ Stage 4 completed 2026-09-03

`APP_BASE_URL` / `API_BASE_URL` switched to `https://portal.gts.ai` on the VPS, app restarted, vhost split.
Config mirrored in this repo at `deploy/nginx.conf`.

Verified from outside the network:

```
https://hrm.gts.ai/tasks/abc123?tab=proof
  → 302  Location: https://portal.gts.ai/tasks/abc123?tab=proof
  → 200
```

Single hop, no loop, path and query string preserved.

- [ ] `pm2 restart hrms-backend --update-env && pm2 save` — PM2 warned that a plain restart does not refresh
      its saved environment. `dotenv.config()` **does not override variables already set**
      (`server/index.js:11`), so if PM2's launch snapshot still carries the old `APP_BASE_URL`, dotenv
      silently skips it and the stale value survives.
- [ ] Sync the **local** `server/.env` too — it still reads `APP_BASE_URL=https://hrm.gts.ai`. Only the VPS
      copy was changed. Harmless for local dev, but it will confuse the next person to read it.
- [ ] Promote `302` → `301` after roughly a week of clean running.

PM2 app name, finally recorded: **`hrms-backend`** (id 0, fork mode). Rename to `gts-portal` in Stage 7.

---

## Stage 5 — Email: `hrm@gts.ai` → `portal@gts.ai`

### 🔶 Stage 5 partially done 2026-09-03

Mailbox `portal@gts.ai` created on `sys19.prosuperservers.com`; `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`
switched on both the VPS and locally. `SMTP_PORT=465`, `SMTP_HOST` unchanged.

**The prerequisite code fix is now made** — `server/utils/sendEmail.js:21` hardcoded
`` `"GTS HRMS" <${process.env.SMTP_USER}>` ``, so mail was going out branded **GTS HRMS** from the new
**portal@gts.ai** address. It now reads `SMTP_FROM`:

```js
from: process.env.SMTP_FROM || `"GTS Portal" <${process.env.SMTP_USER}>`,
```

Verified: resolves to `GTS Portal <portal@gts.ai>`, and the From address matches the authenticated mailbox —
which matters, because most relays reject a From that is not the SMTP account, and the lenient ones file it
as spam.

Remaining:

- [ ] Deploy the `sendEmail.js` change (currently local only).
- [ ] Send a test — a leave request is the easiest path with a visible link — and confirm it reaches an
      **inbox, not spam**. A brand-new sending address has no reputation.
- [ ] Confirm `gts.ai` SPF/DKIM/DMARC cover the new mailbox.
- [ ] Retire `hrm@gts.ai` only after the above is clean.

### Prerequisite code fix

`SMTP_FROM` is set in `.env` and documented in the README, **but no code ever reads it.**
`server/utils/sendEmail.js:21` hardcodes the From header:

```js
from: `"GTS HRMS" <${process.env.SMTP_USER}>`,
```

- [ ] Change that line to read `process.env.SMTP_FROM` (keeping the current literal as a fallback). After
      this, the mailbox switch is a pure `.env` change with no code deploy.

### The switch

- [ ] Create `portal@gts.ai` on the cPanel mail host (`sys19.prosuperservers.com`).
- [ ] Update `server/.env`:
      ```
      SMTP_USER=portal@gts.ai
      SMTP_PASS=<new>
      SMTP_FROM="GTS Portal <portal@gts.ai>"
      ```
      Note `SMTP_USER` is both the SMTP login **and** the From address, which is why this needs a real mailbox
      rather than just an alias.
- [ ] `pm2 restart <name>`
- [ ] Send a test — a password reset is the easiest path — and confirm it lands in an **inbox, not spam**. A
      brand-new sending address has no reputation; watch deliverability for the first few days.
- [ ] Only once that is clean: retire `hrm@gts.ai`.

> **Consequence of retiring rather than aliasing:** anyone who hits *reply* on an older notification email will
> bounce. In practice `replyTo` is already `HR_EMAIL` (`server/utils/sendEmail.js:22`, currently
> `me.harshitt@gmail.com`), so most replies go elsewhere anyway — the exposure is small but not zero. Keeping
> `hrm@gts.ai` as a receive-only alias for 90 days, in step with the domain redirect, would remove it entirely
> and costs nothing.

**Unrelated to this migration, leave alone:** the `process.env.HR_EMAIL || 'hr@gts.ai'` CC fallbacks at
`server/routes/leaves.js:211,290,407` and `server/routes/wfh.js:101,162,221`. `HR_EMAIL` is set, so the
fallback never fires.

---

## Stage 6 — S3 urls and the database rename

Originally one maintenance window. **Split into two on 2026-09-03**, because the url rewrite turned out to be
safe to run live and there is no reason to hold it inside a window with the rename.

Why it is safe live: `gts-hrm/HRMS/x` and `gts-portal/GTSPortal/x` are byte-identical copies, so at every
instant during the rewrite both urls resolve. A request that reads a row mid-run gets whichever url that row
currently holds, and it works either way. Verified 2026-09-03 by sampling 13 urls across seven collections —
all returned 200 at **both** locations.

Doing 6a first also means `gts-hrm` is provably unreferenced before it is deleted, rather than assumed to be.

---

### 6a — Rewrite stored urls (live, no downtime)

Dry run measured 2026-09-03: **1,701 documents, 2,126 urls**.

| Collection.field | docs | urls |
|---|---|---|
| `users.profilePic` | 30 | 30 |
| `documents.fileUrl` | 4 | 4 |
| `conversations.avatar` | 2 | 2 |
| `wallettransactions.attachmentUrl` | 0 | 0 |
| `expenses.paymentScreenshotUrls` | 775 | 851 |
| `expenses.expenseMediaUrls` | 422 | 494 |
| `inventories.mediaUrls` | 269 | 393 |
| `tasks.attachments` | 18 | 27 |
| `tasks.completionProof` | 149 | 279 |
| `taskcomments.attachments` | 31 | 45 |
| `messages.attachments` | 1 | 1 |
| `recurringtasks.attachments` | 0 | 0 |

`wallettransactions` reads 0 — empirical confirmation of the reimbursement bug above: the field was never
persisted, so there is nothing to rewrite. It stays in the target list so the migration is correct once that
bug is fixed.

**Order matters.** The code deploy must come first, or new `HRMS/` urls keep appearing behind the rewrite.

- [ ] **Deploy the code changes** — `s3Service.js` (prefix `GTSPortal/` + bucket-from-url delete),
      `sendEmail.js` (`SMTP_FROM`), `WalletTransaction.js` (the two dropped fields). From here new uploads
      land at `gts-portal/GTSPortal/`.
- [ ] **Close the gap** — copy anything that landed in the interim window, then re-catch the old bucket:
      ```bash
      aws s3 sync s3://gts-portal/HRMS/  s3://gts-portal/GTSPortal/
      aws s3 sync s3://gts-hrm/HRMS/     s3://gts-portal/GTSPortal/
      ```
- [ ] **Back up** — `mongodump --uri="<MONGO_URI>" --out=backup-preRewrite-$(date +%F)`
- [ ] **Dry run, then apply:**
      ```bash
      cd /var/www/mern-hrms/server
      node scripts/rewriteS3Urls.js            # counts only, no writes
      node scripts/rewriteS3Urls.js --apply
      ```
      Idempotent — a second run finds nothing, because rewritten urls no longer match the source prefixes.
- [ ] **Verify:** re-run the dry run (expect all zeros); open a profile picture, an expense receipt, an
      inventory photo, a task completion proof and a group chat icon in the UI; confirm a **new** upload lands
      under `s3://gts-portal/GTSPortal/`.

Rollback: restore from the pre-rewrite dump, or invert the two rules in the script and re-run. `gts-hrm` is
untouched throughout — it is only ever read.

---

### 6b — Rename the database (maintenance window)

With 6a done this is just a rename: no url work, no S3 involvement, a much shorter window.

- [ ] `pm2 stop hrms-backend`
- [ ] ```bash
      mongodump    --uri="mongodb+srv://<user>:<pass>@clusterhrms.zonrtdk.mongodb.net/hrms_db" --out=/tmp/dump
      mongorestore --uri="mongodb+srv://<user>:<pass>@clusterhrms.zonrtdk.mongodb.net/" \
                   --nsFrom='hrms_db.*' --nsTo='gtsportal_db.*' /tmp/dump
      ```
- [ ] `server/.env` → `MONGO_URI=mongodb+srv://…/gtsportal_db?retryWrites=true&w=majority`
- [ ] `pm2 restart hrms-backend --update-env`
- [ ] Verify per-collection counts match the dump, then spot-check the same media as in 6a.

Rollback: point `MONGO_URI` back at `hrms_db` and restart. The old database is never mutated.

---

### The rewrite script

**Two rules are needed**, because the bucket env var was switched ahead of the prefix change, so live data
now contains both shapes:

| # | From | To |
|---|---|---|
| 1 | `https://gts-hrm.s3.ap-south-1.amazonaws.com/HRMS/` | `https://gts-portal.s3.ap-south-1.amazonaws.com/GTSPortal/` |
| 2 | `https://gts-portal.s3.ap-south-1.amazonaws.com/HRMS/` | `https://gts-portal.s3.ap-south-1.amazonaws.com/GTSPortal/` |

Rule 1 covers everything uploaded before 2026-09-03; rule 2 covers the interim window. Apply both
across **exactly these fields**. This is the complete set of S3-URL-bearing paths across the 28 models — miss
one and that feature's media silently 404s:

| Model | Field | Shape |
|---|---|---|
| `User` | `profilePic` | string |
| `Document` | `fileUrl` | string |
| `Conversation` | `avatar` | string — group chat icons |
| `Expense` | `paymentScreenshotUrls[]` | string array |
| `Expense` | `expenseMediaUrls[]` | string array |
| `Inventory` | `mediaUrls[]` | string array |
| `Task` | `attachments[].url` | `mediaSchema` subdocs |
| `Task` | `completionProof[].url` | `mediaSchema` subdocs |
| `TaskComment` | `attachments[].url` | `mediaSchema` subdocs |
| `Message` | `attachments[].url` | `mediaSchema` subdocs |
| `RecurringTask` | `attachments[].url` | `mediaSchema` subdocs |

> **Not in the list, deliberately:** `WalletTransaction` has no `attachmentUrl` to rewrite. See the
> reimbursement-receipt bug recorded under Stage 2 — the field is never persisted, so there is nothing
> stored to rewrite. Fix that bug and this table gains a row.

Plus, if the queue was not drained in Stage 0:

| `VideoCompressionQueue` | `localPath` | `/var/www/mern-hrms/` → `/var/www/gts-portal/` |
|---|---|---|

Requirements:
- **Dry-run mode by default**, printing a per-collection count of documents it would touch. Only writes when
  passed an explicit flag.
- **Leaves alone any `url` starting with `/uploads/`.** Those are locally-staged videos on relative,
  same-origin paths (`server/models/Task.js:9-11`) and are already correct.
- Idempotent — safe to run twice.

**Verify before reopening to users:**
- [ ] Per-collection document counts in `gtsportal_db` match the source dump.
- [ ] The dry-run counts match what the real run reported.
- [ ] `curl -I` a rewritten `profilePic` and a rewritten `Task.attachments[0].url` → both `200`.
- [ ] Zero hits: search `gtsportal_db` for any surviving `gts-hrm.s3` string.
- [ ] Open in the UI: a task with a video attachment, an expense with a receipt, a policy document, a chat
      thread with an image, an employee profile picture. All render.
- [ ] Upload something **new** and confirm it lands at `s3://gts-portal/GTSPortal/…` and displays.

**Rollback:** put `hrms_db` and `gts-hrm` back in `.env`, revert the `s3Service.js` prefix, `pm2 restart`.
Both originals are untouched and still current.

---

## Stage 7 — Code, branding and repo rename

Safe to do on its own branch and deploy independently — except the `s3Service.js` prefix change, which belongs
to Stage 6.

Branch: `rename/gts-portal`

### Branding — `GTS HRMS` → `GTS Portal`

- [ ] `client/public/index.html` — `<title>` (L17, currently `HRMS GTS`), `description` (L15),
      `og:site_name` / `og:title` / `og:image:alt` / `twitter:title` (L35, 36, 43, 46), and the three
      `hrm.gts.ai` URLs in `og:url` / `og:image` / `twitter:image` (L38, 39, 48).
- [ ] `client/public/manifest.json` — `short_name`, `name`.
- [ ] `client/src/pages/Home.js:21` — `<h1>GTS HR Management System</h1>`.
      **Spelled out, so a grep for "HRMS" misses it.**
- [ ] `client/src/components/chat/GroupInfoPanel.js:435` — "…the HRMS with this link can join…"
- [ ] `server/index.js:92` — the public `/` health response `"GTS HRMS API is running..."`
- [ ] Comments: `client/src/App.js:182`, `client/src/styles/messenger.css:9`,
      `server/cron/attendanceCron.js:28`

### Email copy

- [ ] `server/routes/auth.js:291,301` — reset-code body and subject
- [ ] `server/routes/leaves.js:275,391` and `server/routes/wfh.js:147,205` — subjects `… - GTS HRMS`
- [ ] `server/routes/leaves.js:313` and `server/routes/wfh.js:184` — expired-link HTML page copy
- [ ] `server/cron/whatsappHealthCron.js:68` — subject `'HRMS: WhatsApp notifications are down'`
- [ ] `server/routes/whatsapp.js:213` — WhatsApp test message body

### Domain fallback

- [ ] `server/cron/whatsappHealthCron.js:76` — `process.env.APP_BASE_URL || 'https://hrm.gts.ai'`.
      The only hardcoded domain fallback in runtime code.

**The client needs no domain change.** `client/src/utils/api.js:5-7` uses same-origin (`''`) in production, and
`portalApi.js`, `socket.js` and `taskHelpers.js` all derive from that one constant. CORS is wide open
(`server/index.js:50`, `server/utils/realtime.js:18`), so there is no allowlist to update either — though that
is worth tightening as separate work.

### Docs

- [ ] `README.md` — title (L1), clone URL (L157), `cd mern-hrms` (L158), tree root (L215)
- [ ] `Whatsapp.md` — 22 hits, including every `/var/www/mern-hrms` path
- [ ] `Module-8-Voice-Video-Meetings-Plan.md`, `Project-Collaboration-Platform-Feature-Draft.md`
- [ ] Refresh the README `.env` block — it is missing `APP_BASE_URL`, `API_BASE_URL`, `CRON` and all four
      `OPENWA_*` vars

### Gitignored, so `sed` skips them without `--no-ignore`

- [ ] `server/scripts/*.js` — ~30 hits, including 14 throwaway test DBs
      (`mongodb://127.0.0.1:27017/hrms_*_test`), `testExternal.js:30,176` (`https://hrms.test`),
      `exportInventoryXlsx.js:125` (`wb.creator`), and `timeWhatsApp.js:56,61` (hardcoded VPS paths)
- [ ] `client/build/` — regenerates on `npm run build`, no manual edit needed

### Repo and directories

- [ ] Rename on GitHub: `mern-hrms` → `GTS-Portal` in repo settings. GitHub keeps a **permanent redirect**
      for the old URL, git fetch/push included, so nothing breaks even if a stale clone exists.
- [ ] Local: close the editor, then
      ```
      mv C:\mern-hrms C:\GTS-Portal
      git remote set-url origin https://github.com/me-harshit/GTS-Portal.git
      git remote set-url production root@163.245.209.108:/var/repo/gts-portal.git
      ```
- [ ] VPS:
      ```bash
      pm2 stop <name>
      mv /var/www/mern-hrms /var/www/gts-portal      # carries server/uploads/ and client/build/ with it
      mv /var/repo/hrms.git /var/repo/gts-portal.git
      nano /var/repo/gts-portal.git/hooks/post-receive   # point at the new work tree
      nano /etc/nginx/sites-available/<vhost>            # root → /var/www/gts-portal/client/build
      nginx -t && systemctl reload nginx
      pm2 delete <name> && cd /var/www/gts-portal/server && pm2 start index.js --name gts-portal
      pm2 save
      ```
- [ ] Note `production/main` is the deployed branch while active work is on `chatModule`. Merge as usual.

**Verify:**
- [ ] `cd client && npm run build` succeeds
- [ ] Log in, browse the app — no "HRMS" visible anywhere, tab title reads "GTS Portal"
- [ ] `grep -rniE "hrms" --exclude-dir=node_modules --exclude-dir=build client/src server` returns only
      deliberate leftovers
- [ ] **The external participant portal still works end to end** — invite an external user, open
      `/portal/:token`, confirm `x-portal-token` auth is intact. This is the regression the name collision
      would cause.

---

## Stage 8 — Final verification and teardown

### Full pass, after everything is live

- [ ] `https://portal.gts.ai` loads with a valid cert, no mixed content
- [ ] `curl -I https://hrm.gts.ai/login` → `301` to `portal.gts.ai`
- [ ] Log in; Socket.IO connects (two sessions, live chat message arrives)
- [ ] Upload a new image and a new large video — both land under `s3://gts-portal/GTSPortal/` and play
- [ ] Existing media all still render (profile pics, task attachments, receipts, documents)
- [ ] Password-reset email: From reads `GTS Portal <portal@gts.ai>`, links point at `portal.gts.ai`, lands in
      inbox not spam
- [ ] Submit a leave request, then click the approve link **from the email**
- [ ] External participant portal authenticates
- [ ] WhatsApp notifications still send (the OpenWA session was deliberately not renamed)
- [ ] `pm2 logs` clean; overnight, confirm the video compression cron ran and the attendance crons fired

### Teardown — diarise these

- [ ] **After 30 clean days:** drop `hrms_db`; delete the `gts-hrm` bucket; delete the now-redundant
      `s3://gts-portal/HRMS/` prefix (the interim-window uploads, already copied into `GTSPortal/`)
- [ ] **Reconcile orphans** left by the `deleteFromS3` bug (Stage 2): list both buckets, cross-reference
      against every S3 URL still referenced in `gtsportal_db`, and remove objects nothing points at.
      Do this *before* deleting `gts-hrm`, while both sides are still inspectable.
- [ ] **After 90 days:** remove the `hrm.gts.ai` vhost, drop it from the certificate
      (`certbot --nginx -d portal.gts.ai` to reissue), delete the DNS record, and — if you kept it — the
      `hrm@gts.ai` alias
