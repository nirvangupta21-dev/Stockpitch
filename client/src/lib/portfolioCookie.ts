/**
 * portfolioCookie.ts
 *
 * Saves and restores portfolio positions using browser cookies.
 * Cookies persist across Render cold starts and reloads — they live
 * in the browser on the site's domain, completely independent of the server.
 *
 * Cookie name: vrd_portfolio
 * Max size: ~4KB per cookie → enough for ~25 positions
 * Expiry: 365 days (rolling — refreshed on every save)
 */

const COOKIE_NAME = "vrd_portfolio";
const EXPIRY_DAYS = 365;

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
export function savePortfolioToCookie(positions: CookiePosition[]): void {
  try {
    const json = JSON.stringify(positions);
    // Warn if approaching cookie size limit
    if (json.length > 3800) {
      console.warn("[portfolio cookie] Approaching 4KB limit — some positions may not save");
    }
    const expires = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(json)}; expires=${expires}; path=/; SameSite=Lax`;
    console.log(`[portfolio cookie] Saved ${positions.length} positions`);
  } catch (e) {
    console.warn("[portfolio cookie] Save failed:", e);
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────
export function loadPortfolioFromCookie(): CookiePosition[] | null {
  try {
    const match = document.cookie
      .split("; ")
      .find(c => c.startsWith(COOKIE_NAME + "="));
    if (!match) return null;
    const raw = decodeURIComponent(match.split("=").slice(1).join("="));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    console.log(`[portfolio cookie] Found ${parsed.length} saved positions`);
    return parsed;
  } catch (e) {
    console.warn("[portfolio cookie] Load failed:", e);
    return null;
  }
}

// ── Clear ────────────────────────────────────────────────────────────────────
export function clearPortfolioCookie(): void {
  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  console.log("[portfolio cookie] Cleared");
}

// ── Check if cookie has data the server doesn't ──────────────────────────────
export function cookieHasPositions(): boolean {
  const positions = loadPortfolioFromCookie();
  return positions !== null && positions.length > 0;
}
