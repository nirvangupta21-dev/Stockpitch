import type { Express, Request, Response, NextFunction } from "express";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import session from "express-session";
import { z } from "zod";
import { db } from "./db";
import { users, type User } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: string;
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

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function getUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, normalizeEmail(email))).get();
}

function getUserById(id: string) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

function sendUser(req: Request, res: Response, user: User) {
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
}

export function setupAuth(app: Express) {
  app.use(session({
    name: "stockpitch.sid",
    secret: process.env.SESSION_SECRET || "stockpitch-dev-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  }));

  app.use((req: AuthenticatedRequest, _res, next) => {
    if (!req.session.userId) return next();
    const user = getUserById(req.session.userId);
    if (user) req.user = publicUser(user);
    else delete req.session.userId;
    next();
  });

  app.get("/api/auth/me", (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user ?? null });
  });

  app.post("/api/auth/signup", (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Enter a name, valid email, and password with at least 8 characters." });
    }

    const email = normalizeEmail(parsed.data.email);
    if (getUserByEmail(email)) {
      return res.status(409).json({ message: "An account with that email already exists." });
    }

    const user = db.insert(users).values({
      id: randomUUID(),
      name: parsed.data.name.trim(),
      email,
      passwordHash: hashPassword(parsed.data.password),
      createdAt: new Date().toISOString(),
    }).returning().get();

    sendUser(req, res, user);
  });

  app.post("/api/auth/login", (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Enter your email and password." });
    }

    const user = getUserByEmail(parsed.data.email);
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return res.status(401).json({ message: "Email or password is incorrect." });
    }

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

export function accountId(req: AuthenticatedRequest) {
  return req.user?.id ?? "guest";
}
