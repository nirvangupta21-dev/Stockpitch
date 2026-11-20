import type { Express, Request, Response, NextFunction } from "express";
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { and, eq, gt } from "drizzle-orm";
import session from "express-session";
import Database from "better-sqlite3";
import { z } from "zod";
import { db, users, sessions } from "./db";
import type { User } from "@shared/schema";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

declare module "express-session" {
  interface SessionData {
    userId?: string;
    /** Stable per-browser ID for logged-out visitors so they don't share one bucket. */
    guestId?: string;
  }
}

const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
});

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type AuthenticatedRequest = Request & {
  user?: PublicUser;
};

function publicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  return `${salt}:${hash}`;
}

async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await scrypt(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function getUserByEmail(email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, normalizeEmail(email)));
  return row;
}

async function getUserById(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

/** Start a fresh session (rotates the session ID) and sign the user in. */
function sendUser(req: Request, res: Response, user: User) {
  req.session.regenerate(err => {
    if (err) {
      console.error("[auth] session regenerate failed:", err);
      return res.status(500).json({ message: "Could not start a session. Please try again." });
    }
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  });
}

// ── Simple in-memory rate limiter (no external deps) ─────────────────────────
// Counts attempts per IP. Good enough for a single-process deployment; a
// distributed store would be needed if the app ever runs multiple instances.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = parseInt(process.env.AUTH_RATE_LIMIT || "10", 10);
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimitCheck(ip: string | undefined, key: string): boolean {
  const bucketKey = `${key}:${ip ?? "unknown"}`;
  const now = Date.now();
  const bucket = rateBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT_MAX;
}

function rateLimitReset(ip: string | undefined, key: string): void {
  rateBuckets.delete(`${key}:${ip ?? "unknown"}`);
}

// Periodically drop expired buckets so the map does not grow forever.
const rateSweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
}, RATE_LIMIT_WINDOW_MS);
rateSweeper.unref();

// ── Database-backed session store (survives process restarts) ────────────────
// express-session's default MemoryStore loses every session on restart and is
// not production-safe. This store keeps sessions in the main database
// (SQLite locally, Postgres when DATABASE_URL is set), so logins survive
// restarts — and with a durable Postgres they survive redeploys too.
class DbSessionStore extends session.Store {
  get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void) {
    db.select().from(sessions)
      .where(and(eq(sessions.sid, sid), gt(sessions.expires, Date.now())))
      .then(rows => {
        const row = rows[0] as { sess: string } | undefined;
        callback(null, row ? JSON.parse(row.sess) : null);
      })
      .catch(err => callback(err));
  }

  set(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void) {
    (async () => {
      const expires = typeof sess.cookie?.expires === "number"
        ? sess.cookie.expires
        : sess.cookie?.expires
          ? new Date(sess.cookie.expires).getTime()
          : Date.now() + 1000 * 60 * 60 * 24 * 30;
      await db.insert(sessions)
        .values({ sid, sess: JSON.stringify(sess), expires })
        .onConflictDoUpdate({
          target: sessions.sid,
          set: { sess: JSON.stringify(sess), expires },
        });
    })().then(() => callback?.(), err => callback?.(err));
  }

  destroy(sid: string, callback?: (err?: unknown) => void) {
    db.delete(sessions).where(eq(sessions.sid, sid))
      .then(() => callback?.())
      .catch(err => callback?.(err));
  }

  touch(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void) {
    this.set(sid, sess, callback);
  }
}

export function setupAuth(app: Express) {
  // The deployment runs behind a TLS-terminating proxy (Render). Without this,
  // Express treats the connection as plain HTTP, the Secure session cookie is
  // never sent, and every signup/login silently fails.
  app.set("trust proxy", 1);

  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[auth] SESSION_SECRET is not set. Falling back to a random per-boot secret — " +
        "all logins will be invalidated whenever the server restarts. Set SESSION_SECRET " +
        "in your hosting dashboard to keep sessions stable."
      );
      secret = randomBytes(32).toString("hex");
    } else {
      secret = "stockpitch-dev-session-secret";
    }
  }

  app.use(session({
    name: "stockpitch.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    store: new DbSessionStore(),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  }));

  app.use((req: AuthenticatedRequest, _res, next) => {
    (async () => {
      if (req.session.userId) {
        const user = await getUserById(req.session.userId);
        if (user) req.user = publicUser(user);
        else delete req.session.userId;
      } else if (!req.session.guestId) {
        // Give each anonymous browser its own bucket instead of a shared
        // "guest" portfolio that anyone can read and modify.
        req.session.guestId = `guest-${randomUUID()}`;
      }
    })().then(() => next(), next);
  });

  app.get("/api/auth/me", (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user ?? null, guestId: req.session?.guestId ?? null });
  });

  app.post("/api/auth/signup", async (req, res) => {
    if (!rateLimitCheck(req.ip, "signup")) {
      return res.status(429).json({ message: "Too many attempts. Please try again in a few minutes." });
    }
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Enter a name, valid email, and password with at least 8 characters." });
    }

    const email = normalizeEmail(parsed.data.email);
    if (await getUserByEmail(email)) {
      return res.status(409).json({ message: "An account with that email already exists." });
    }

    try {
      const [user] = await db.insert(users).values({
        id: randomUUID(),
        name: parsed.data.name.trim(),
        email,
        passwordHash: await hashPassword(parsed.data.password),
        createdAt: new Date().toISOString(),
      }).returning();

      rateLimitReset(req.ip, "signup");
      sendUser(req, res, user);
    } catch (err) {
      console.error("[auth] signup failed:", err);
      res.status(500).json({ message: "Could not create the account. Please try again." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    if (!rateLimitCheck(req.ip, "login")) {
      return res.status(429).json({ message: "Too many attempts. Please try again in a few minutes." });
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Enter your email and password." });
    }

    const user = await getUserByEmail(parsed.data.email);
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      // Deliberately generic — do not reveal whether the email exists.
      return res.status(401).json({ message: "Email or password is incorrect." });
    }

    rateLimitReset(req.ip, "login");
    sendUser(req, res, user);
  });

  app.post("/api/auth/logout", (req, res, next: NextFunction) => {
    req.session.destroy(err => {
      if (err) return next(err);
      res.clearCookie("stockpitch.sid");
      res.json({ success: true });
    });
  });
}

/**
 * The bucket that owns this request's data: the signed-in user's id, or the
 * per-browser guest id. Never a shared constant.
 */
export function accountId(req: AuthenticatedRequest) {
  return req.user?.id ?? req.session?.guestId ?? "guest";
}
