import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import * as schemaSqlite from "@shared/schema";
import * as schemaPg from "./schema-pg";

// The postgres driver is ESM-only; depending on how it is loaded (native ESM
// during development, an interop wrapper inside the production CJS bundle)
// the factory function sits at a different key, so resolve it defensively.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PostgresFactory = (url: string, opts?: Record<string, unknown>) => any;
async function loadPostgres(): Promise<PostgresFactory> {
  const mod: any = await import("postgres");
  for (const candidate of [mod, mod?.default, mod?.default?.default]) {
    if (typeof candidate === "function") return candidate;
  }
  throw new Error("Could not load the postgres driver");
}

/**
 * Dual-mode database.
 *
 * - No DATABASE_URL  -> better-sqlite3 file (local development, zero config).
 * - DATABASE_URL set -> Postgres (durable hosting such as Neon or Render
 *   Postgres). SQLite files on ephemeral hosting disks are wiped on every
 *   restart, which silently destroyed every user account; a real database
 *   is required for accounts to survive.
 *
 * Both schemas are column-for-column identical, and everything downstream is
 * typed against the SQLite schema so consumers keep full type safety in
 * either mode. All queries use `await`, which works on both drivers.
 */
export const usingPostgres = Boolean(process.env.DATABASE_URL);

// Re-exported so auth.ts / storage.ts can import everything from one place.
// `let` with assignment inside dbReady; queries only run after
// server/index.ts awaits dbReady, so these are always initialized in practice.
export let db: SqliteDb;
export let users: typeof schemaSqlite.users;
export let watchlist: typeof schemaSqlite.watchlist;
export let portfolio: typeof schemaSqlite.portfolio;
export let sessions: typeof schemaSqlite.sessions;

// ── SQLite mode ─────────────────────────────────────────────────────────────
function makeSqliteDb() {
  const sqlite = new Database(process.env.SQLITE_FILE || "stockpitch.db");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'guest',
      ticker TEXT NOT NULL,
      company_name TEXT NOT NULL,
      added_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolio (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL DEFAULT 'guest',
      ticker       TEXT NOT NULL,
      name         TEXT NOT NULL,
      shares       REAL NOT NULL,
      avg_cost     REAL NOT NULL,
      purchase_date TEXT NOT NULL,
      notes        TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid     TEXT PRIMARY KEY,
      sess    TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
  `);

  function ensureColumn(table: string, column: string, definition: string) {
    const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some(c => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  ensureColumn("watchlist", "user_id", "TEXT NOT NULL DEFAULT 'guest'");
  ensureColumn("portfolio", "user_id", "TEXT NOT NULL DEFAULT 'guest'");

  return drizzleSqlite(sqlite, { schema: schemaSqlite });
}

type SqliteDb = ReturnType<typeof makeSqliteDb>;

const PG_DDL = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'guest',
    ticker TEXT NOT NULL,
    company_name TEXT NOT NULL,
    added_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL DEFAULT 'guest',
    ticker       TEXT NOT NULL,
    name         TEXT NOT NULL,
    shares       DOUBLE PRECISION NOT NULL,
    avg_cost     DOUBLE PRECISION NOT NULL,
    purchase_date TEXT NOT NULL,
    notes        TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid     TEXT PRIMARY KEY,
    sess    TEXT NOT NULL,
    expires BIGINT NOT NULL
  );
`;

/** Resolves once tables exist. Awaited by server/index.ts before listening. */
export const dbReady: Promise<void> = (async () => {
  if (usingPostgres) {
    const url = process.env.DATABASE_URL!;
    // Respect sslmode in the URL; default to TLS for non-local hosts
    // (Neon, Render Postgres external URLs and most managed providers).
    const sslmodeMatch = /sslmode=([^&]+)/.exec(url);
    const isLocal = /(localhost|127\.0\.0\.1)/.test(url);
    const needsSsl = sslmodeMatch ? sslmodeMatch[1] !== "disable" : !isLocal;
    const postgres = await loadPostgres();
    const client = postgres(url, {
      max: 5,
      idle_timeout: 30,
      connect_timeout: 10,
      ssl: needsSsl ? "require" : undefined,
    });
    // Ensure tables exist (idempotent) and verify connectivity up front.
    await client.unsafe(PG_DDL);
    db = drizzlePg(client, { schema: schemaPg }) as unknown as SqliteDb;
    users = schemaPg.users as unknown as typeof schemaSqlite.users;
    watchlist = schemaPg.watchlist as unknown as typeof schemaSqlite.watchlist;
    portfolio = schemaPg.portfolio as unknown as typeof schemaSqlite.portfolio;
    sessions = schemaPg.sessions as unknown as typeof schemaSqlite.sessions;
    console.log("[db] using Postgres (durable mode)");
  } else {
    db = makeSqliteDb();
    users = schemaSqlite.users;
    watchlist = schemaSqlite.watchlist;
    portfolio = schemaSqlite.portfolio;
    sessions = schemaSqlite.sessions;
    await Promise.resolve();
  }
})();
