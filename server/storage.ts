import { db } from "./db";
import { watchlist, type InsertWatchlist, type Watchlist } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getWatchlist(): Watchlist[];
  addToWatchlist(entry: InsertWatchlist): Watchlist;
  removeFromWatchlist(id: number): void;
}

export class DatabaseStorage implements IStorage {
  getWatchlist(): Watchlist[] {
    return db.select().from(watchlist).all();
  }

  addToWatchlist(entry: InsertWatchlist): Watchlist {
    return db.insert(watchlist).values(entry).returning().get();
  }

  removeFromWatchlist(id: number): void {
    db.delete(watchlist).where(eq(watchlist.id, id)).run();
  }
}

export const storage = new DatabaseStorage();
