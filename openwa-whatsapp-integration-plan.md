# OpenWA WhatsApp Integration Plan for HRMS

## 1. Objective

Set up a self-hosted WhatsApp API service using the open-source **OpenWA** project and integrate it with the existing MERN HRMS.

### Existing HRMS

```text
hrm.gts.ai
        ↓
Nginx :443
        ↓
localhost:5000
        ↓
/var/www/mern-hrms
        ↓
MERN HRMS
```

### New WhatsApp Service

```text
whatsapp.gts.ai
        ↓
Nginx :443
        ↓
localhost:2785
        ↓
OpenWA
        ↓
WhatsApp
```

The WhatsApp service will be kept completely separate from the existing HRMS application.

---

## 2. Current VPS Status

### Server

* VPS: InterServer
* RAM: 2 GB
* Available RAM currently: ~1.4 GB
* Swap: 1 GB
* Available swap: ~959 MB
* OS: Ubuntu
* Nginx: `1.24.0`
* Node.js: `20.20.1`
* npm: `10.8.2`
* Docker: Not installed
* Git: To be checked

### Existing Ports

| Port   | Usage                               |
| ------ | ----------------------------------- |
| `80`   | Nginx                               |
| `443`  | Nginx / HTTPS                       |
| `5000` | HRMS Node.js backend                |
| `2785` | Currently free — planned for OpenWA |

---

# 3. Target Folder Structure

Do not place OpenWA inside the HRMS project.

Current:

```text
/var/www/
└── mern-hrms/
    ├── client/
    ├── server/
    ├── docs/
    └── ...
```

Target:

```text
/var/www/
├── mern-hrms/
│   ├── client/
│   ├── server/
│   └── ...
│
└── Whatsapp/
    └── OpenWA/
        ├── ...
        └── data/
```

This keeps both applications isolated.

---

# 4. Domain Setup

Create a DNS record for:

```text
whatsapp.gts.ai
```

Point it to the same VPS IP:

```text
whatsapp.gts.ai → 163.245.209.108
```

If Cloudflare is being used:

```text
Type: A
Name: whatsapp
Content: 163.245.209.108
```

The existing domain remains unchanged:

```text
hrm.gts.ai
```

---

# 5. Nginx Architecture

The existing HRMS configuration will remain intact.

Current:

```nginx
server {
    server_name hrm.gts.ai 163.245.209.108;

    ...

    location /api/ {
        proxy_pass http://localhost:5000;
        ...
    }

    location /socket.io/ {
        proxy_pass http://localhost:5000;
        ...
    }

    location /uploads/ {
        proxy_pass http://localhost:5000;
        ...
    }

    location / {
        try_files $uri /index.html;
    }

    listen 443 ssl;
    ...
}
```

A **separate Nginx server block** will be created for OpenWA.

Target:

```nginx
server {
    server_name whatsapp.gts.ai;

    location / {
        proxy_pass http://127.0.0.1:2785;
        ...
    }

    listen 443 ssl;
    ...
}
```

This means:

```text
hrm.gts.ai
    ↓
localhost:5000


whatsapp.gts.ai
    ↓
localhost:2785
```

---

# 6. OpenWA Installation

## Step 1 — Verify server

Before installation, check:

```bash
lsb_release -a
df -h
ps aux --sort=-%mem | head -15
git --version
```

Also confirm that port `2785` is free:

```bash
sudo ss -lntp | grep -E ':2785'
```

---

## Step 2 — Create WhatsApp directory

```bash
mkdir -p /var/www/Whatsapp
cd /var/www/Whatsapp
```

OpenWA will be installed separately from:

```text
/var/www/mern-hrms
```

---

## Step 3 — Download OpenWA

Clone the official OpenWA repository:

```bash
cd /var/www/Whatsapp
git clone https://github.com/rmyndharis/OpenWA.git
cd OpenWA
```

Check the project:

```bash
ls -la
```

---

# 7. Node.js / OpenWA Dependencies

OpenWA will be installed according to its current project documentation.

Before installing, check the required Node.js version:

```bash
cat package.json
```

Then install dependencies:

```bash
npm install
```

If the project provides a production build command, build it according to the repository instructions.

---

# 8. Database / Storage

For this small HRMS deployment, start with the lightweight option.

Preferred initial setup:

```text
OpenWA
  ↓
SQLite / local storage
```

Avoid adding unnecessary infrastructure initially:

* PostgreSQL — not required initially
* Redis — not required initially
* Separate database server — not required

This reduces RAM usage on the 2 GB VPS.

---

# 9. OpenWA Port

OpenWA should listen internally on:

```text
127.0.0.1:2785
```

or equivalent localhost binding.

Verify:

```bash
sudo ss -lntp | grep 2785
```

Expected:

```text
127.0.0.1:2785
```

The port should **not be publicly exposed** if Nginx is being used as the reverse proxy.

---

# 10. OpenWA API Security

OpenWA API authentication should be enabled.

Generate/use a strong API key.

Example environment variable:

```env
OPENWA_API_KEY=your-long-random-secret
```

The API key should never be placed in:

```text
React frontend
```

It should only exist on the server.

HRMS should communicate with OpenWA from the backend.

---

# 11. Nginx Reverse Proxy

Once OpenWA is working locally:

```text
http://127.0.0.1:2785
```

configure:

```text
whatsapp.gts.ai
```

through Nginx.

Target architecture:

```text
Internet
   │
   ▼
https://whatsapp.gts.ai
   │
   ▼
Nginx :443
   │
   ▼
127.0.0.1:2785
   │
   ▼
OpenWA
```

Test Nginx configuration:

```bash
sudo nginx -t
```

Reload:

```bash
sudo systemctl reload nginx
```

---

# 12. SSL Certificate

Create an SSL certificate for:

```text
whatsapp.gts.ai
```

using the existing Certbot/Nginx setup.

Check:

```bash
sudo certbot certificates
```

Then obtain the certificate if required.

Final URL:

```text
https://whatsapp.gts.ai
```

---

# 13. WhatsApp Connection

Open the OpenWA dashboard/API through:

```text
https://whatsapp.gts.ai
```

Connect the dedicated WhatsApp account using the method supported by the selected OpenWA engine.

Recommended:

```text
Dedicated HRMS WhatsApp number
```

Do not use a personal WhatsApp account for the automation service.

---

# 14. HRMS Integration Architecture

Do not put WhatsApp API calls directly throughout the HRMS controllers.

Create a dedicated service.

Recommended structure:

```text
/var/www/mern-hrms/server/
├── controllers/
├── models/
├── routes/
├── services/
│   ├── whatsapp.service.js
│   ├── notification.service.js
│   └── ...
└── ...
```

The architecture becomes:

```text
HRMS
 │
 ├── Task Service
 ├── Attendance Service
 ├── Leave Service
 └── Notification Service
              │
              ▼
       whatsapp.service.js
              │
              ▼
       OpenWA API
              │
              ▼
          WhatsApp
```

---

# 15. HRMS Environment Variables

Add OpenWA configuration to the HRMS backend `.env`.

Example:

```env
OPENWA_BASE_URL=http://127.0.0.1:2785
OPENWA_API_KEY=your-secret-api-key
OPENWA_SESSION_ID=your-session-id
```

Do not expose these variables to the React application.

---

# 16. WhatsApp Service

Create:

```text
server/services/whatsapp.service.js
```

Responsibilities:

* Send text messages
* Check WhatsApp connection/session
* Handle API authentication
* Handle API errors
* Return success/failure to notification system

Conceptually:

```text
sendWhatsAppMessage(phone, message)
```

The rest of the HRMS should not need to know how OpenWA works.

---

# 17. Notification Queue

For reliability, eventually use:

```text
HRMS Event
    ↓
Notification Queue
    ↓
WhatsApp Worker
    ↓
OpenWA API
    ↓
WhatsApp
```

Instead of:

```text
Task Created
    ↓
Direct WhatsApp API call
```

This prevents WhatsApp failures from breaking normal HRMS operations.

For the first implementation, a simple database-backed notification queue can be used.

Redis is not necessary initially.

---

# 18. Initial WhatsApp Features

Start with simple text notifications.

### Task Assigned

```text
New task assigned to you.

Task: Prepare monthly report
Due: 26 Aug 2026, 5:00 PM
```

### Task Reminder

```text
Reminder

Your task "Prepare monthly report" is due at 5:00 PM.
```

### Task Overdue

```text
Your task "Prepare monthly report" is now overdue.
```

### Leave Approval

```text
Your leave request for 28 Aug 2026 has been approved.
```

### Attendance

```text
Reminder: Please mark your attendance for today.
```

---

# 19. Employee WhatsApp Numbers

The HRMS employee model should contain a WhatsApp-compatible phone number.

Recommended:

```text
phone
whatsappNumber
whatsappNotificationsEnabled
```

Example:

```text
Employee
├── name
├── email
├── phone
├── whatsappNumber
└── whatsappNotificationsEnabled
```

This allows employees to opt out of WhatsApp notifications.

---

# 20. Logging

Every automated WhatsApp notification should eventually be logged.

Example:

```text
WhatsAppNotification
├── employeeId
├── phone
├── message
├── type
├── status
├── error
├── sentAt
└── createdAt
```

Possible statuses:

```text
pending
sent
failed
retrying
```

This will make troubleshooting much easier.

---

# 21. Retry Handling

If OpenWA temporarily disconnects:

```text
Notification
     ↓
failed
     ↓
retry
     ↓
OpenWA reconnects
     ↓
message sent
```

Do not endlessly retry the same message.

Suggested initial limit:

```text
Maximum retries: 3
```

---

# 22. Server Resource Monitoring

Because the VPS has only 2 GB RAM, monitor resources after OpenWA is running.

Check:

```bash
free -h
```

```bash
top
```

or:

```bash
htop
```

Check disk:

```bash
df -h
```

Check processes:

```bash
ps aux --sort=-%mem | head -15
```

The existing 1 GB swap should remain available as a safety buffer.

---

# 23. Process Management

OpenWA must automatically restart if it crashes.

Depending on the final installation method, use an appropriate process manager such as:

```text
systemd
```

or:

```text
PM2
```

For a production VPS, systemd is a good lightweight option.

Target:

```text
OpenWA
   ↓
systemd
   ↓
Automatic restart
   ↓
Server reboot → OpenWA starts automatically
```

---

# 24. Security

Important security rules:

### Do not expose

```text
2785
```

directly to the internet.

Only expose:

```text
80
443
```

through Nginx.

### API key

Keep it server-side.

### WhatsApp session

Protect OpenWA's session/authentication data.

### Firewall

Check:

```bash
sudo ufw status
```

Only required ports should be publicly accessible.

---

# 25. Backup

Back up:

```text
OpenWA session/authentication data
```

and:

```text
HRMS database
```

Do not assume that reconnecting WhatsApp after every server restart will always be convenient.

A periodic VPS/database backup should already be part of the HRMS deployment.

---

# 26. Testing Plan

### Test 1 — OpenWA locally

```bash
curl http://127.0.0.1:2785
```

### Test 2 — OpenWA through domain

```text
https://whatsapp.gts.ai
```

### Test 3 — Connect WhatsApp

Verify the WhatsApp account connects successfully.

### Test 4 — API authentication

Verify an authenticated API request works.

### Test 5 — Send test message

Send:

```text
HRMS WhatsApp integration test.
```

### Test 6 — HRMS integration

Trigger a test notification from the HRMS backend.

### Test 7 — Real task notification

Create a task and verify:

```text
Task created
    ↓
Notification generated
    ↓
WhatsApp sent
```

### Test 8 — Failure handling

Disconnect OpenWA/WhatsApp and verify HRMS does not crash.

---

# 27. Final Architecture

```text
                         INTERNET
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
          hrm.gts.ai              whatsapp.gts.ai
                │                       │
                │                       │
                └──────────┐ ┌──────────┘
                           ▼ ▼
                        NGINX
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
        localhost:5000            localhost:2785
              │                         │
              ▼                         ▼
          HRMS API                   OpenWA
              │                         │
              │                         ▼
              │                      WhatsApp
              │
              ▼
       Notification Service
              │
              ▼
       WhatsApp Service
              │
              └──────────────► OpenWA API
```

---

# 28. Implementation Order

Follow these steps in order:

* [ ] Check Ubuntu version
* [ ] Check disk space
* [ ] Check Git
* [ ] Check current memory usage
* [ ] Create `/var/www/Whatsapp`
* [ ] Clone OpenWA
* [ ] Check OpenWA requirements
* [ ] Install dependencies
* [ ] Configure OpenWA
* [ ] Start OpenWA on localhost
* [ ] Verify port `2785`
* [ ] Configure `whatsapp.gts.ai` DNS
* [ ] Create separate Nginx server block
* [ ] Configure SSL with Certbot
* [ ] Test `https://whatsapp.gts.ai`
* [ ] Connect dedicated WhatsApp account
* [ ] Configure OpenWA API key
* [ ] Create `whatsapp.service.js` in HRMS
* [ ] Add OpenWA environment variables
* [ ] Send HRMS → OpenWA test message
* [ ] Implement notification logging
* [ ] Implement notification queue
* [ ] Implement retry handling
* [ ] Add task notifications
* [ ] Add leave notifications
* [ ] Add attendance notifications
* [ ] Configure automatic OpenWA restart
* [ ] Test server reboot
* [ ] Monitor RAM/CPU
* [ ] Configure backups

---

# 29. Important Constraint

The VPS currently has approximately **1.4 GB available RAM**, so we should avoid installing unnecessary services.

Initial deployment should therefore be kept simple:

```text
Nginx
   +
Existing Node.js HRMS
   +
OpenWA
   +
SQLite/local storage
   +
Existing 1 GB swap
```

Avoid initially adding:

```text
PostgreSQL
Redis
RabbitMQ
Kubernetes
Additional VPS
```

These can be introduced later only if the workload requires them.

---

# 30. First Next Step

Before installing anything, run:

```bash
lsb_release -a
```

```bash
df -h
```

```bash
ps aux --sort=-%mem | head -15
```

```bash
git --version
```

Then continue with the OpenWA installation based on the actual VPS environment.
