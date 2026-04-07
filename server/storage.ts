import { db } from "./db";
import {
  watchlist, type InsertWatchlist, type Watchlist,
  portfolio, type InsertPortfolio, type PortfolioPosition,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

const BACKUP_PATH = path.resolve("portfolio_backup.json");
const RENDER_API_KEY  = process.env.RENDER_API_KEY ?? "";
const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID_SELF ?? "";

// ── Backup helpers ─────────────────────────────────────────────────────────
function writeBackup(positions: PortfolioPosition[]): void {
  try {
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(positions, null, 2), "utf-8");
  } catch (e) {
    console.warn("[portfolio] backup write failed:", e);
  }
  // Also push to Render env var asynchronously (best-effort)
  if (RENDER_API_KEY && RENDER_SERVICE_ID) {
    const payload = JSON.stringify(positions);
    fetch(`https://api.render.com/v1/services/${RENDER_SERVICE_ID}/env-vars`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RENDER_API_KEY}`,
      },
      body: JSON.stringify([{ key: "PORTFOLIO_BACKUP", value: payload }]),
    }).catch(e => console.warn("[portfolio] Render env var sync failed:", e));
  }
}

export function restoreBackupIfNeeded(): void {
  try {
    // Check if SQLite already has data
    const existing = db.select().from(portfolio).all();
    if (existing.length > 0) return; // already seeded

    // Try local backup file first
    let positions: PortfolioPosition[] | null = null;
    if (fs.existsSync(BACKUP_PATH)) {
      try {
        positions = JSON.parse(fs.readFileSync(BACKUP_PATH, "utf-8"));
        console.log(`[portfolio] Restored ${positions?.length ?? 0} positions from local backup file`);
      } catch {}
    }

    // Fall back to env var
    if (!positions && process.env.PORTFOLIO_BACKUP) {
      try {
        positions = JSON.parse(process.env.PORTFOLIO_BACKUP);
        console.log(`[portfolio] Restored ${positions?.length ?? 0} positions from env var backup`);
      } catch {}
    }

    if (!positions || positions.length === 0) return;

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
