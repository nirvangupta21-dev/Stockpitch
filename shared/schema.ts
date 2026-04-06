import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Saved watchlist entries
export const watchlist = sqliteTable("watchlist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
