import { db } from "./db";
import {
  watchlist, type InsertWatchlist, type Watchlist,
  portfolio, type InsertPortfolio, type PortfolioPosition,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

// Try multiple paths — Render's /opt/render/project persists across restarts
// even on the free tier (it's the build cache directory)
const BACKUP_PATHS = [
  "/opt/render/project/portfolio_backup.json", // Render persistent build dir
  path.resolve("portfolio_backup.json"),         // local fallback
];

// ── Backup helpers ─────────────────────────────────────────────────────────
function writeBackup(positions: PortfolioPosition[]): void {
  const payload = JSON.stringify(positions, null, 2);
  let wrote = false;
  for (const p of BACKUP_PATHS) {
    try {
      // Ensure directory exists
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, payload, "utf-8");
      wrote = true;
      console.log(`[portfolio] Backup written to ${p} (${positions.length} positions)`);
      break; // write to first writable path
    } catch (e) {
      // try next path
    }
  }
  if (!wrote) console.warn("[portfolio] Could not write backup to any path");
}

export function restoreBackupIfNeeded(): void {
  try {
    // Check if SQLite already has data
    const existing = db.select().from(portfolio).all();
    if (existing.length > 0) {
      console.log(`[portfolio] SQLite has ${existing.length} positions — no restore needed`);
      return;
    }

    // Try each backup path in order
    let positions: PortfolioPosition[] | null = null;
    for (const p of BACKUP_PATHS) {
      if (fs.existsSync(p)) {
        try {
          positions = JSON.parse(fs.readFileSync(p, "utf-8"));
          console.log(`[portfolio] Found backup at ${p} with ${positions?.length ?? 0} positions`);
          break;
        } catch {}
      }
    }

    // Fall back to PORTFOLIO_BACKUP env var (set manually on Render if needed)
    if (!positions && process.env.PORTFOLIO_BACKUP) {
      try {
        positions = JSON.parse(process.env.PORTFOLIO_BACKUP);
        console.log(`[portfolio] Restored ${positions?.length ?? 0} positions from PORTFOLIO_BACKUP env var`);
      } catch {}
    }

    if (!positions || positions.length === 0) {
      console.log("[portfolio] No backup found — starting with empty portfolio");
      return;
    }

    // Re-seed SQLite
    for (const pos of positions) {
      db.insert(portfolio).values(pos).onConflictDoUpdate({
        target: portfolio.id,
        set: { ticker: pos.ticker, name: pos.name, shares: pos.shares, avgCost: pos.avgCost, purchaseDate: pos.purchaseDate, notes: pos.notes },
      }).run();
    }
    console.log(`[portfolio] SQLite re-seeded with ${positions.length} positions`);
  } catch (e) {
    console.warn("[portfolio] restore failed:", e);
  }
}

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
    const result = db
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
    // Write backup after every change
    writeBackup(this.getPortfolio());
    return result;
  }

  deletePosition(id: string): void {
    db.delete(portfolio).where(eq(portfolio.id, id)).run();
    // Write backup after every change
    writeBackup(this.getPortfolio());
  }
}

export const storage = new DatabaseStorage();
