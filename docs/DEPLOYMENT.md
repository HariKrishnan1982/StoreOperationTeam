# Production Deployment Guide

This guide covers deploying **Store Ops Console** to a single-instance container host with a persistent volume for SQLite (such as **Fly.io** or **Render**).

## 1. Persistent Storage Requirement
Because the application uses embedded SQLite (`node:sqlite` in WAL mode), you **must** mount a persistent disk at `/app/data` (and optionally `/app/backups`) and run a **single instance** (1 machine/replica).

- **Fly.io:** `fly volumes create ops_data --size 1 --region iad` and mount `destination = "/app/data"` in `fly.toml`.
- **Render:** Attach a Persistent Disk with mount path `/app/data`.

## 2. Required Environment Variables
Set these on your hosting platform:

```env
NODE_ENV=production
PORT=3001
DB_PATH=/app/data/store_ops.db
SESSION_SECRET=<generate-at-least-32-random-bytes>
CORS_ORIGINS=https://your-domain.example.com
TRUST_PROXY=1
COOKIE_SECURE=true
ALLOW_DEMO_USERS=false
STORE_TIMEZONE=America/New_York
LOG_LEVEL=info
BACKUP_RETENTION=7
```

- `TRUST_PROXY=1`: Required behind Fly.io / Render / Nginx reverse proxies so rate limiting keys on the real client IP (`X-Forwarded-For`).
- `COOKIE_SECURE=true`: Enforces HTTPS-only `store_ops_sid` session cookies.
- `ALLOW_DEMO_USERS=false`: The server refuses to start in `production` if seeded demo passwords are still active.

## 3. Creating a Production Admin User
Before starting in production (or via a one-off release/SSH command against the mounted volume):

```bash
npm run db:migrate
npm run db:create-admin -- --username opsadmin --password "<strong-12+-char-password>" --name "Operations Lead"
```

If demo users were previously seeded, remove or rotate their passwords before setting `ALLOW_DEMO_USERS=false`.

## 4. Healthcheck & Backups
- Configure your platform healthcheck to poll `GET /api/health` (returns `200 { status: "ok", uptimeSeconds, timestamp }`).
- Schedule `npm run db:backup` (creates timestamped `VACUUM INTO` snapshots in `/app/backups` and prunes beyond `BACKUP_RETENTION`).
