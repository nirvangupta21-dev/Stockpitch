import { db } from "./db";
import {
  watchlist, type InsertWatchlist, type Watchlist,
  portfolio, type InsertPortfolio, type PortfolioPosition,
  users,
} from "@shared/schema";
import { and, eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

// Backups are written per account so two users can never overwrite each
// other's data. On hosts with ephemeral filesystems these files are best-effort
// only — a durable database is the real fix.
const BACKUP_DIRS = [
  "/opt/render/project/portfolio_backups", // Render build dir (may persist longer)
  path.resolve("portfolio_backups"),       // local fallback
];

type BackupFile = { userId: string; positions: PortfolioPosition[] };

// ── Backup helpers ─────────────────────────────────────────────────────────
function writeBackup(positions: PortfolioPosition[], userId: string): void {
  const payload = JSON.stringify({ userId, positions }, null, 2);
  let wrote = false;
  for (const dir of BACKUP_DIRS) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
      fs.writeFileSync(file, payload, "utf-8");
      wrote = true;
      break; // write to first writable dir
    } catch {
      // try next dir
    }
  }
  if (!wrote) console.warn("[portfolio] Could not write backup to any path");
}

export function restoreBackupIfNeeded(): void {
  try {
    // Re-seed each account's positions from its own backup file, but only
    // when that account still exists and currently has no positions. This
    // avoids seeding orphaned rows for accounts that no longer exist.
    const existingUserIds = new Set(db.select({ id: users.id }).from(users).all().map(u => u.id));
    for (const dir of BACKUP_DIRS) {
      let files: string[] = [];
      try {
        files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
      } catch {
        continue;
      }
      for (const file of files) {
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as BackupFile;
          if (!parsed?.userId || !Array.isArray(parsed.positions)) continue;
          if (!existingUserIds.has(parsed.userId)) continue;
          const current = db.select().from(portfolio).where(eq(portfolio.userId, parsed.userId)).all();
          if (current.length > 0) continue;
          if (parsed.positions.length === 0) continue;
          for (const pos of parsed.positions) {
            db.insert(portfolio).values({ ...pos, userId: parsed.userId }).onConflictDoUpdate({
              target: portfolio.id,
              set: { ticker: pos.ticker, name: pos.name, shares: pos.shares, avgCost: pos.avgCost, purchaseDate: pos.purchaseDate, notes: pos.notes },
            }).run();
          }
          console.log(`[portfolio] Restored ${parsed.positions.length} positions for ${parsed.userId} from ${file}`);
        } catch {}
      }
    }
  } catch (e) {
    console.warn("[portfolio] restore failed:", e);
  }
}

export interface IStorage {
  // Watchlist
  getWatchlist(userId: string): Watchlist[];
  addToWatchlist(userId: string, entry: InsertWatchlist): Watchlist;
  removeFromWatchlist(userId: string, id: number): void;

  // Portfolio
  getPortfolio(userId: string): PortfolioPosition[];
  upsertPosition(userId: string, pos: InsertPortfolio): PortfolioPosition;
  deletePosition(userId: string, id: string): void;
}

export class DatabaseStorage implements IStorage {
  // ── Watchlist ──────────────────────────────────────────────────────────────
  getWatchlist(userId: string): Watchlist[] {
    return db.select().from(watchlist).where(eq(watchlist.userId, userId)).all();
  }
  addToWatchlist(userId: string, entry: InsertWatchlist): Watchlist {
    return db.insert(watchlist).values({ ...entry, userId }).returning().get();
  }
  removeFromWatchlist(userId: string, id: number): void {
    db.delete(watchlist).where(and(eq(watchlist.id, id), eq(watchlist.userId, userId))).run();
  }

  // ── Portfolio ──────────────────────────────────────────────────────────────
  getPortfolio(userId: string): PortfolioPosition[] {
    return db.select().from(portfolio).where(eq(portfolio.userId, userId)).all();
  }

  upsertPosition(userId: string, pos: InsertPortfolio): PortfolioPosition {
    // Ownership check: a client-supplied id that already belongs to a different
    // account must never overwrite or reassign that row.
    const existing = db.select().from(portfolio).where(eq(portfolio.id, pos.id)).get();
    if (existing && existing.userId !== userId) {
      const err = new Error("That position belongs to another account.") as Error & { status?: number };
      err.status = 403;
      throw err;
    }
    const result = db
      .insert(portfolio)
      .values({ ...pos, userId })
      .onConflictDoUpdate({
        target: portfolio.id,
        set: {
          userId,
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
    writeBackup(this.getPortfolio(userId), userId);
    return result;
  }

  deletePosition(userId: string, id: string): void {
    db.delete(portfolio).where(and(eq(portfolio.id, id), eq(portfolio.userId, userId))).run();
    // Write backup after every change
    writeBackup(this.getPortfolio(userId), userId);
  }
}

export const storage = new DatabaseStorage();
