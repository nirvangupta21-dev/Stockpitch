import { pgTable, text, bigserial, bigint, doublePrecision } from "drizzle-orm/pg-core";

// Postgres mirror of shared/schema.ts (SQLite). The two schemas are
// column-for-column identical; this file exists so the app can run on a
// durable hosted database when DATABASE_URL is set, while local development
// keeps using the zero-config SQLite file.
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
});

export const watchlist = pgTable("watchlist", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull().default("guest"),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  addedAt: text("added_at").notNull(),
});

export const portfolio = pgTable("portfolio", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default("guest"),
  ticker: text("ticker").notNull(),
  name: text("name").notNull(),
  shares: doublePrecision("shares").notNull(),
  avgCost: doublePrecision("avg_cost").notNull(),
  purchaseDate: text("purchase_date").notNull(),
  notes: text("notes").notNull().default(""),
});

export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: text("sess").notNull(),
  expires: bigint("expires", { mode: "number" }).notNull(),
});
