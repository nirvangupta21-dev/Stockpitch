// ─── Alpha Vantage direct client ─────────────────────────────────────────────
// Calls Alpha Vantage from the browser — no backend needed.
// Free key: 25 requests/day, resets midnight UTC.
// Results cached in memory so repeated lookups within a session are instant.

// Key rotation — 3 free keys = 75 calls/day total
const AV_KEYS = [
  "JGY040BK7WJGV51O",
  "LQIPW5U9PDOVRCS4",
  "2LRHUJBRLZSXVNQI",
];
let keyIndex = 0;
const exhaustedKeys = new Set<string>();

function getNextKey(): string {
  // Find a non-exhausted key
  for (let i = 0; i < AV_KEYS.length; i++) {
    const k = AV_KEYS[(keyIndex + i) % AV_KEYS.length];
    if (!exhaustedKeys.has(k)) {
      keyIndex = (keyIndex + i + 1) % AV_KEYS.length;
      return k;
    }
  }
  // All exhausted — reset and try again
  exhaustedKeys.clear();
  return AV_KEYS[0];
}

const AV_BASE = "https://www.alphavantage.co/query";

export interface Fundamentals {
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  bookValuePerShare: number | null;
  netMargin: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  freeCashFlow: number | null;
  operatingCashFlow: number | null;
  revenue: number | null;
  ebitda: number | null;
  netIncome: number | null;
  revenueGrowthTTM: number | null;
  earningsGrowthTTM: number | null;
  enterpriseValue: number | null;
  evToEbitda: number | null;
  evToRevenue: number | null;
  beta: number | null;
  sharesOutstanding: number | null;
  dividendYield: number | null;
  targetMeanPrice: number | null;
  targetMedianPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  recommendationMean: number | null;
  revenueGrowthForward: number | null;
  earningsGrowthForward: number | null;
}

// In-memory cache (survives within a session, resets on hard refresh)
const memCache = new Map<string, { data: Fundamentals; ts: number }>();
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

function n(v: string | undefined): number | null {
  if (!v || v === "None" || v === "-" || v === "N/A" || v.trim() === "") return null;
  const parsed = parseFloat(v);
  return isNaN(parsed) ? null : parsed;
}

function parseAV(av: Record<string, string>): Fundamentals {
  const grossProfit = n(av.GrossProfitTTM);
  const revenue = n(av.RevenueTTM);
  const ev = n(av.EVToEBITDA) !== null && n(av.EBITDA) !== null
    ? n(av.EVToEBITDA)! * n(av.EBITDA)!
    : null;

  return {
    trailingPE: n(av.PERatio),
    forwardPE: n(av.ForwardPE),
    priceToBook: n(av.PriceToBookRatio),
    bookValuePerShare: n(av.BookValue),
    netMargin: n(av.ProfitMargin),
    grossMargin: grossProfit && revenue && revenue > 0 ? grossProfit / revenue : null,
    operatingMargin: n(av.OperatingMarginTTM),
    returnOnEquity: n(av.ReturnOnEquityTTM),
    returnOnAssets: n(av.ReturnOnAssetsTTM),
    freeCashFlow: null,
    operatingCashFlow: n(av.OperatingCashflowTTM),
    revenue,
    ebitda: n(av.EBITDA),
    netIncome: n(av.NetIncomeTTM),
    revenueGrowthTTM: n(av.QuarterlyRevenueGrowthYOY),
    earningsGrowthTTM: n(av.QuarterlyEarningsGrowthYOY),
    enterpriseValue: ev,
    evToEbitda: n(av.EVToEBITDA),
    evToRevenue: n(av.EVToRevenue),
    beta: n(av.Beta),
    sharesOutstanding: n(av.SharesOutstanding),
    dividendYield: n(av.DividendYield),
    targetMeanPrice: n(av.AnalystTargetPrice),
    targetMedianPrice: n(av.AnalystTargetPrice),
    targetHighPrice: n(av["52WeekHigh"]),
    targetLowPrice: n(av["52WeekLow"]),
    recommendationMean: null,
    revenueGrowthForward: null,
    earningsGrowthForward: null,
  };
}

export async function fetchFundamentals(ticker: string): Promise<Fundamentals> {
  const key = ticker.toUpperCase();

  // 1. Check memory cache
  const cached = memCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  // 2. Try backend first (has yfinance — richest data)
  try {
    const res = await fetch(`/api/fundamentals/${key}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && !data.message && data.trailingPE !== undefined) {
        memCache.set(key, { data, ts: Date.now() });
        return data;
      }
    }
  } catch { /* fall through */ }

  // 3. Call Alpha Vantage directly from browser — try all keys until one works
  for (let attempt = 0; attempt < AV_KEYS.length; attempt++) {
    const avKey = getNextKey();
    try {
      const url = `${AV_BASE}?function=OVERVIEW&symbol=${key}&apikey=${avKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const av = await res.json();
        if (av.Symbol) {
          const data = parseAV(av);
          memCache.set(key, { data, ts: Date.now() });
          return data;
        }
        // Rate limit hit — mark this key as exhausted and try next
        if (av.Note || av.Information) {
          exhaustedKeys.add(avKey);
          continue;
        }
      }
    } catch { /* try next key */ }
  }

  // 4. Return stale cache if all else fails
  if (cached) return cached.data;

  // 5. Return empty fundamentals — Fair Value will show "—" for missing fields
  return {
    trailingPE: null, forwardPE: null, priceToBook: null, bookValuePerShare: null,
    netMargin: null, grossMargin: null, operatingMargin: null, returnOnEquity: null,
    returnOnAssets: null, freeCashFlow: null, operatingCashFlow: null, revenue: null,
    ebitda: null, netIncome: null, revenueGrowthTTM: null, earningsGrowthTTM: null,
    enterpriseValue: null, evToEbitda: null, evToRevenue: null, beta: null,
    sharesOutstanding: null, dividendYield: null, targetMeanPrice: null,
    targetMedianPrice: null, targetHighPrice: null, targetLowPrice: null,
    recommendationMean: null, revenueGrowthForward: null, earningsGrowthForward: null,
  };
}
