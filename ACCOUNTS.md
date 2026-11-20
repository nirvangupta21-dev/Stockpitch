# Accounts that actually stick

## The problem this fixes

Veridian used to store user accounts in a SQLite file on Render's ephemeral
disk. On Render's free plan the service restarts (and the filesystem resets)
whenever it redeploys or spins down after inactivity — every account, session,
and portfolio was wiped. Signups "worked" but the accounts vanished.

## The fix

The server now supports two database modes:

- **No `DATABASE_URL` set** — SQLite file (local development, zero config).
- **`DATABASE_URL` set** — Postgres. Accounts, sessions, and portfolios
  persist across restarts and redeploys. Tables are created automatically on
  boot; there is no migration step.

## Setup (one-time, about 5 minutes)

1. **Create a free Postgres database.** [Neon](https://neon.tech) is
   recommended (free tier never expires). Create a project and copy the
   connection string — it looks like
   `postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require`.
   Render's own Postgres also works (free instances expire after 30 days).
2. **Set it on your Render service.** In the Render dashboard:
   - If your service already exists: Veridian service > Environment >
     add `DATABASE_URL` with the connection string, and add `SESSION_SECRET`
     with any long random string (e.g. output of
     `openssl rand -hex 32`). Deploy.
   - Or set up the Blueprint: New > Blueprint > select this repo. `render.yaml`
     generates `SESSION_SECRET` automatically and prompts you to paste
     `DATABASE_URL`.
3. That's it. On the next deploy, signups go to Postgres and survive.

## What's already secure

- Passwords hashed with scrypt (random per-user salt, timing-safe compare)
- Session IDs rotated on every login; sessions stored in the database, not memory
- Login/signup rate limiting per IP
- Per-browser guest data isolation (no shared guest portfolio)
- Ownership checks so one account can never read or overwrite another's data
- `httpOnly` + `sameSite=lax` + `secure` session cookies
- Security headers (HSTS, nosniff, frame denial, referrer policy)
- Cross-origin state-changing requests blocked (CSRF defense)
- Generic login errors that don't reveal whether an email exists
