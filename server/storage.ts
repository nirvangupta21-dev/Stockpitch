import { db, users, watchlist, portfolio } from "./db";
import type { InsertWatchlist, InsertPortfolio, PortfolioPosition, Watchlist } from "@shared/schema";
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

export async function restoreBackupIfNeeded(): Promise<void> {
  try {
    // Re-seed each account's positions from its own backup file, but only
    // when that account still exists and currently has no positions. This
    // avoids seeding orphaned rows for accounts that no longer exist.
    const allUsers = await db.select({ id: users.id }).from(users);
    const existingUserIds = new Set(allUsers.map(u => u.id));
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
          const current = await db.select().from(portfolio).where(eq(portfolio.userId, parsed.userId));
          if (current.length > 0) continue;
          if (parsed.positions.length === 0) continue;
          for (const pos of parsed.positions) {
            await db.insert(portfolio).values({ ...pos, userId: parsed.userId }).onConflictDoUpdate({
              target: portfolio.id,
              set: { ticker: pos.ticker, name: pos.name, shares: pos.shares, avgCost: pos.avgCost, purchaseDate: pos.purchaseDate, notes: pos.notes },
            });
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
  getWatchlist(userId: string): Promise<Watchlist[]>;
  addToWatchlist(userId: string, entry: InsertWatchlist): Promise<Watchlist>;
  removeFromWatchlist(userId: string, id: number): Promise<void>;

  // Portfolio
  getPortfolio(userId: string): Promise<PortfolioPosition[]>;
  upsertPosition(userId: string, pos: InsertPortfolio): Promise<PortfolioPosition>;
  deletePosition(userId: string, id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // ── Watchlist ──────────────────────────────────────────────────────────────
  async getWatchlist(userId: string): Promise<Watchlist[]> {
    return db.select().from(watchlist).where(eq(watchlist.userId, userId));
  }
  async addToWatchlist(userId: string, entry: InsertWatchlist): Promise<Watchlist> {
    const [row] = await db.insert(watchlist).values({ ...entry, userId }).returning();
    return row;
  }
  async removeFromWatchlist(userId: string, id: number): Promise<void> {
    await db.delete(watchlist).where(and(eq(watchlist.id, id), eq(watchlist.userId, userId)));
  }

  // ── Portfolio ──────────────────────────────────────────────────────────────
  async getPortfolio(userId: string): Promise<PortfolioPosition[]> {
    return db.select().from(portfolio).where(eq(portfolio.userId, userId));
  }

  async upsertPosition(userId: string, pos: InsertPortfolio): Promise<PortfolioPosition> {
    // Ownership check: a client-supplied id that already belongs to a different
    // account must never overwrite or reassign that row.
    const [existing] = await db.select().from(portfolio).where(eq(portfolio.id, pos.id));
    if (existing && existing.userId !== userId) {
      const err = new Error("That position belongs to another account.") as Error & { status?: number };
      err.status = 403;
      throw err;
    }
    const [result] = await db
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
      .returning();
    // Write backup after every change
    writeBackup(await this.getPortfolio(userId), userId);
    return result;
  }

  async deletePosition(userId: string, id: string): Promise<void> {
    await db.delete(portfolio).where(and(eq(portfolio.id, id), eq(portfolio.userId, userId)));
    // Write backup after every change
    writeBackup(await this.getPortfolio(userId), userId);
  }
}

export const storage = new DatabaseStorage();
