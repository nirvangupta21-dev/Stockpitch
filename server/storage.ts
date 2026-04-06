import { db } from "./db";
import {
  watchlist, type InsertWatchlist, type Watchlist,
  portfolio, type InsertPortfolio, type PortfolioPosition,
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Watchlist
  getWatchlist(): Watchlist[];
  addToWatchlist(entry: InsertWatchlist): Watchlist;
  removeFromWatchlist(id: number): void;

  // Portfolio
  getPortfolio(): PortfolioPosition[];
  upsertPosition(pos: InsertPortfolio): PortfolioPosition;
  deletePosition(id: string): void;
}

export class DatabaseStorage implements IStorage {
  // ── Watchlist ──────────────────────────────────────────────────────────────
  getWatchlist(): Watchlist[] {
    return db.select().from(watchlist).all();
  }
  addToWatchlist(entry: InsertWatchlist): Watchlist {
    return db.insert(watchlist).values(entry).returning().get();
  }
  removeFromWatchlist(id: number): void {
    db.delete(watchlist).where(eq(watchlist.id, id)).run();
  }

  // ── Portfolio ──────────────────────────────────────────────────────────────
  getPortfolio(): PortfolioPosition[] {
    return db.select().from(portfolio).all();
  }

  upsertPosition(pos: InsertPortfolio): PortfolioPosition {
    // Insert or replace (SQLite upsert on primary key)
    return db
      .insert(portfolio)
      .values(pos)
      .onConflictDoUpdate({
        target: portfolio.id,
        set: {
          ticker:       pos.ticker,
          name:         pos.name,
          shares:       pos.shares,
          avgCost:      pos.avgCost,
          purchaseDate: pos.purchaseDate,
          notes:        pos.notes,
        },
      })
      .returning()
      .get();
  }

  deletePosition(id: string): void {
    db.delete(portfolio).where(eq(portfolio.id, id)).run();
  }
}

export const storage = new DatabaseStorage();
