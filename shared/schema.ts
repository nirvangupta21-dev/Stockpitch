import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User accounts
export const users = sqliteTable("users", {
  id:           text("id").primaryKey(),
  name:         text("name").notNull(),
  email:        text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt:    text("created_at").notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, passwordHash: true, createdAt: true }).extend({
  email: z.string().email(),
  password: z.string().min(8),
});
export type User = typeof users.$inferSelect;

// Saved watchlist entries
export const watchlist = sqliteTable("watchlist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().default("guest"),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  addedAt: text("added_at").notNull(),
});

export const insertWatchlistSchema = createInsertSchema(watchlist).omit({ id: true });
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type Watchlist = typeof watchlist.$inferSelect;

// Portfolio positions
export const portfolio = sqliteTable("portfolio", {
  id:           text("id").primaryKey(),          // client-generated UUID
  userId:       text("user_id").notNull().default("guest"),
  ticker:       text("ticker").notNull(),
  name:         text("name").notNull(),
  shares:       real("shares").notNull(),
  avgCost:      real("avg_cost").notNull(),
  purchaseDate: text("purchase_date").notNull(),
  notes:        text("notes").notNull().default(""),
});

export const insertPortfolioSchema = createInsertSchema(portfolio);
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;
export type PortfolioPosition = typeof portfolio.$inferSelect;
