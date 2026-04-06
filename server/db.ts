import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";

const sqlite = new Database("stockpitch.db");
export const db = drizzle(sqlite, { schema });

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    company_name TEXT NOT NULL,
    added_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio (
    id           TEXT PRIMARY KEY,
    ticker       TEXT NOT NULL,
    name         TEXT NOT NULL,
    shares       REAL NOT NULL,
    avg_cost     REAL NOT NULL,
    purchase_date TEXT NOT NULL,
    notes        TEXT NOT NULL DEFAULT ''
  );
`);
