/**
 * portfolioCookie.ts
 *
 * Saves and restores portfolio positions using browser cookies.
 * Cookies persist across server cold starts and reloads — they live
 * in the browser on the site's domain, completely independent of the server.
 *
 * Each account gets its OWN cookie, keyed by the signed-in user's id (or the
 * per-browser guest id), so one account's saved positions can never be offered
 * to a different account on the same computer.
 *
 * Cookie name: vrd_portfolio_<accountKey>
 * Max size: ~4KB per cookie → enough for ~25 positions
 * Expiry: 365 days (rolling — refreshed on every save)
 */

const COOKIE_PREFIX = "vrd_portfolio_";
const LEGACY_COOKIE_NAME = "vrd_portfolio"; // pre-accounts cookie, no longer read
const EXPIRY_DAYS = 365;

function cookieNameFor(accountKey: string): string {
  return `${COOKIE_PREFIX}${accountKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export interface CookiePosition {
  id: string;
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  purchaseDate: string;
  notes: string;
}

// ── Write ────────────────────────────────────────────────────────────────────
export function savePortfolioToCookie(positions: CookiePosition[], accountKey: string): void {
  try {
    const json = JSON.stringify(positions);
    // Warn if approaching cookie size limit
    if (json.length > 3800) {
      console.warn("[portfolio cookie] Approaching 4KB limit — some positions may not save");
    }
    const expires = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${cookieNameFor(accountKey)}=${encodeURIComponent(json)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch (e) {
    console.warn("[portfolio cookie] Save failed:", e);
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────
export function loadPortfolioFromCookie(accountKey: string): CookiePosition[] | null {
  try {
    const match = document.cookie
      .split("; ")
      .find(c => c.startsWith(cookieNameFor(accountKey) + "="));
    if (!match) return null;
    const raw = decodeURIComponent(match.split("=").slice(1).join("="));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch (e) {
    console.warn("[portfolio cookie] Load failed:", e);
    return null;
  }
}

// ── Clear ────────────────────────────────────────────────────────────────────
export function clearPortfolioCookie(accountKey: string): void {
  document.cookie = `${cookieNameFor(accountKey)}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

/** Remove the pre-accounts cookie (data cannot be attributed to one account). */
export function clearLegacyPortfolioCookie(): void {
  document.cookie = `${LEGACY_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

// ── Check if cookie has data the server doesn't ─────────────────────────────
export function cookieHasPositions(accountKey: string): boolean {
  const positions = loadPortfolioFromCookie(accountKey);
  return positions !== null && positions.length > 0;
}
