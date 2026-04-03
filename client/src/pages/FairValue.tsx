import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { QuoteData } from "./Dashboard";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, ReferenceLine,
} from "recharts";
import {
  Scale, Info, ChevronDown, ChevronUp, RefreshCw, CheckCircle2, AlertCircle,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Fundamentals {
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
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  revenueGrowthForward: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, d = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function fmtB(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

// ─── Sector medians ───────────────────────────────────────────────────────────
const SECTOR_MEDIANS: Record<string, { pe: number; evEbitda: number; ps: number }> = {
  tech:       { pe: 28, evEbitda: 22, ps: 6 },
  fintech:    { pe: 22, evEbitda: 16, ps: 3 },
  healthcare: { pe: 20, evEbitda: 14, ps: 2.5 },
  consumer:   { pe: 18, evEbitda: 12, ps: 1.8 },
  energy:     { pe: 12, evEbitda: 8,  ps: 1.2 },
  default:    { pe: 20, evEbitda: 14, ps: 2.5 },
};

// ─── DCF ─────────────────────────────────────────────────────────────────────
function dcfFairValue(fcf: number, growth: number, terminal: number, wacc: number, shares: number, netDebt: number): number {
  let pv = 0, cf = fcf;
  for (let y = 1; y <= 10; y++) {
    const r = y <= 5 ? growth : (growth + terminal) / 2;
    cf *= (1 + r);
    pv += cf / Math.pow(1 + wacc, y);
  }
  const tv = cf * (1 + terminal) / (wacc - terminal);
  const pvTv = tv / Math.pow(1 + wacc, 10);
  return Math.max(0, (pv + pvTv - netDebt) / shares);
}

// ─── Fetch fundamentals — backend first, Alpha Vantage backup ─────────────────
const AV_KEYS = ["JGY040BK7WJGV51O", "LQIPW5U9PDOVRCS4", "2LRHUJBRLZSXVNQI"];
const avExhausted = new Set<string>();
let avIdx = 0;
const fundCache = new Map<string, { data: Fundamentals; ts: number }>();
const CACHE_TTL = 4 * 3600 * 1000;

function getAVKey() {
  for (let i = 0; i < AV_KEYS.length; i++) {
    const k = AV_KEYS[(avIdx + i) % AV_KEYS.length];
    if (!avExhausted.has(k)) { avIdx = (avIdx + i + 1) % AV_KEYS.length; return k; }
  }
  avExhausted.clear(); return AV_KEYS[0];
}

function parseAV(av: Record<string, string>): Fundamentals {
  const n = (v: string) => v && v !== "None" && v !== "-" && v !== "N/A" ? parseFloat(v) || null : null;
  const rev = n(av.RevenueTTM);
  const gp  = n(av.GrossProfitTTM);
  const ev  = n(av.EVToEBITDA) && n(av.EBITDA) ? n(av.EVToEBITDA)! * n(av.EBITDA)! : null;
  return {
    trailingPE: n(av.PERatio), forwardPE: n(av.ForwardPE),
    priceToBook: n(av.PriceToBookRatio), bookValuePerShare: n(av.BookValue),
    netMargin: n(av.ProfitMargin), grossMargin: gp && rev ? gp / rev : null,
    operatingMargin: n(av.OperatingMarginTTM),
    returnOnEquity: n(av.ReturnOnEquityTTM), returnOnAssets: n(av.ReturnOnAssetsTTM),
    freeCashFlow: null, operatingCashFlow: n(av.OperatingCashflowTTM),
    revenue: rev, ebitda: n(av.EBITDA), netIncome: n(av.NetIncomeTTM),
    revenueGrowthTTM: n(av.QuarterlyRevenueGrowthYOY),
    earningsGrowthTTM: n(av.QuarterlyEarningsGrowthYOY),
    enterpriseValue: ev, evToEbitda: n(av.EVToEBITDA), evToRevenue: n(av.EVToRevenue),
    beta: n(av.Beta), sharesOutstanding: n(av.SharesOutstanding),
    dividendYield: n(av.DividendYield),
    targetMeanPrice: n(av.AnalystTargetPrice), targetHighPrice: n(av["52WeekHigh"]),
    targetLowPrice: n(av["52WeekLow"]), revenueGrowthForward: null,
  };
}

async function getFundamentals(ticker: string): Promise<{ data: Fundamentals; source: string }> {
  const key = ticker.toUpperCase();
  const cached = fundCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return { data: cached.data, source: "cache" };

  // 1. Backend (yfinance — pre-warmed on startup)
  try {
    const r = await fetch(`/api/fundamentals/${key}`, { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const d = await r.json();
      if (d && !d.message && d.revenue !== undefined) {
        fundCache.set(key, { data: d, ts: Date.now() });
        return { data: d, source: "yfinance" };
      }
    }
  } catch {}

  // 2. Alpha Vantage direct (3-key rotation)
  for (let i = 0; i < AV_KEYS.length; i++) {
    const avKey = getAVKey();
    try {
      const r = await fetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${key}&apikey=${avKey}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const av = await r.json();
        if (av.Note || av.Information) { avExhausted.add(avKey); continue; }
        if (av.Symbol) {
          const data = parseAV(av);
          fundCache.set(key, { data, ts: Date.now() });
          return { data, source: "alphavantage" };
        }
      }
    } catch {}
  }

  // 3. Stale cache fallback
  if (cached) return { data: cached.data, source: "stale-cache" };

  // 4. Empty — return nulls, page will show derived models only
  const empty: Fundamentals = {
    trailingPE: null, forwardPE: null, priceToBook: null, bookValuePerShare: null,
    netMargin: null, grossMargin: null, operatingMargin: null, returnOnEquity: null,
    returnOnAssets: null, freeCashFlow: null, operatingCashFlow: null, revenue: null,
    ebitda: null, netIncome: null, revenueGrowthTTM: null, earningsGrowthTTM: null,
    enterpriseValue: null, evToEbitda: null, evToRevenue: null, beta: null,
    sharesOutstanding: null, dividendYield: null, targetMeanPrice: null,
    targetHighPrice: null, targetLowPrice: null, revenueGrowthForward: null,
  };
  return { data: empty, source: "none" };
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { ticker: string; }

export default function FairValue({ ticker }: Props) {
  const [growthRate, setGrowthRate]       = useState(12);
  const [terminalGrowth, setTerminalGrowth] = useState(3);
  const [discountRate, setDiscountRate]   = useState(10);
  const [sectorKey, setSectorKey]         = useState<keyof typeof SECTOR_MEDIANS>("default");
  const [showMethodology, setShowMethodology] = useState(false);

  const [fund, setFund]       = useState<Fundamentals | null>(null);
  const [source, setSource]   = useState<string>("");
  const [fLoading, setFLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: quote, isLoading: qLoading, error: qError } = useQuery<QuoteData>({
    queryKey: ["/api/quote", ticker],
    queryFn: () => apiRequest("GET", `/api/quote/${ticker}`).then(r => r.json()),
    retry: 2,
    staleTime: 30000,
  });

  const loadFund = useCallback(() => {
    setFLoading(true);
    getFundamentals(ticker)
      .then(({ data, source }) => { setFund(data); setSource(source); setFLoading(false); })
      .catch(() => setFLoading(false));
  }, [ticker, refreshKey]);

  useEffect(() => { loadFund(); }, [loadFund]);

  const currentPrice = quote?.price ?? 0;
  const medians = SECTOR_MEDIANS[sectorKey];

  // --- Derive what we can from quote + fund ---
  const eps = fund?.netIncome && fund?.sharesOutstanding
    ? fund.netIncome / fund.sharesOutstanding
    : (fund?.trailingPE && currentPrice ? currentPrice / fund.trailingPE : null);

  const impliedShares = quote?.marketCap && currentPrice > 0
    ? quote.marketCap / currentPrice : fund?.sharesOutstanding ?? null;

  const impliedRev = fund?.revenue ?? (fund?.evToRevenue && fund?.enterpriseValue
    ? fund.enterpriseValue / fund.evToRevenue : null);

  const impliedEbitda = fund?.ebitda ?? (fund?.evToEbitda && fund?.enterpriseValue
    ? fund.enterpriseValue / fund.evToEbitda : null);

  const netDebt = fund?.enterpriseValue && quote?.marketCap
    ? fund.enterpriseValue - quote.marketCap : 0;

  // --- Valuation models ---
  const dcfValue = useMemo(() => {
    const fcf = fund?.freeCashFlow ?? (impliedEbitda ? impliedEbitda * 0.65 : null);
    if (!fcf || !impliedShares || impliedShares === 0) return null;
    return dcfFairValue(fcf, growthRate / 100, terminalGrowth / 100, discountRate / 100, impliedShares, netDebt);
  }, [fund, quote, growthRate, terminalGrowth, discountRate, impliedShares, impliedEbitda, netDebt]);

  const peValue = eps && eps > 0 ? medians.pe * eps : null;

  const evEbitdaValue = impliedEbitda && impliedShares
    ? Math.max(0, (medians.evEbitda * impliedEbitda - netDebt) / impliedShares)
    : null;

  const psValue = impliedRev && impliedShares
    ? (medians.ps * impliedRev) / impliedShares : null;

  const analystValue = fund?.targetMeanPrice ?? null;

  const models = [
    { label: "DCF",           value: dcfValue,      weight: 0.30, color: "hsl(185,80%,50%)" },
    { label: "P/E Comps",     value: peValue,       weight: 0.25, color: "hsl(265,70%,60%)" },
    { label: "EV/EBITDA",     value: evEbitdaValue, weight: 0.20, color: "hsl(45,90%,55%)" },
    { label: "P/S Comps",     value: psValue,       weight: 0.10, color: "hsl(200,80%,60%)" },
    { label: "Analyst Target",value: analystValue,  weight: 0.15, color: "hsl(142,71%,45%)" },
  ].filter(m => m.value !== null && m.value > 0 && isFinite(m.value));

  const totalWeight = models.reduce((s, m) => s + m.weight, 0);
  const fair = totalWeight > 0
    ? models.reduce((s, m) => s + m.value! * m.weight, 0) / totalWeight
    : null;

  const upside = fair && currentPrice > 0 ? ((fair - currentPrice) / currentPrice) * 100 : null;

  const verdict = upside === null ? "—"
    : upside > 25  ? "Significantly Undervalued"
    : upside > 10  ? "Moderately Undervalued"
    : upside > -10 ? "Fairly Valued"
    : upside > -25 ? "Moderately Overvalued"
    : "Significantly Overvalued";

  const verdictColor = upside === null ? "text-muted-foreground"
    : upside > 10  ? "text-green-400"
    : upside > -10 ? "text-yellow-400"
    : "text-red-400";

  const verdictBg = upside === null ? "bg-card border-border"
    : upside > 10  ? "bg-green-500/8 border-green-500/20"
    : upside > -10 ? "bg-yellow-500/8 border-yellow-500/20"
    : "bg-red-500/8 border-red-500/20";

  const gaugeMin = fair ? Math.min(currentPrice, fair) * 0.75 : 0;
  const gaugeMax = fair ? Math.max(currentPrice, fair) * 1.25 : 100;
  const gaugeCur  = fair ? Math.min(100, Math.max(0, ((currentPrice - gaugeMin) / (gaugeMax - gaugeMin)) * 100)) : 50;
  const gaugeFair = fair ? Math.min(100, Math.max(0, ((fair - gaugeMin) / (gaugeMax - gaugeMin)) * 100)) : 50;

  const barData = [
    { name: "Current", value: currentPrice, color: "hsl(0,0%,50%)" },
    ...models.map(m => ({ name: m.label, value: parseFloat(m.value!.toFixed(2)), color: m.color })),
    ...(fair ? [{ name: "Fair Value", value: parseFloat(fair.toFixed(2)), color: "hsl(185,80%,55%)" }] : []),
  ];

  const loading = qLoading || fLoading;
  const hasData = models.length > 0;

  const sourceLabel = source === "yfinance" ? "yfinance (full data)"
    : source === "alphavantage" ? "Alpha Vantage"
    : source === "cache" ? "cached"
    : source === "stale-cache" ? "stale cache"
    : source === "none" ? "derived only"
    : source;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-foreground" />
          <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>Fair Value Analysis</h1>
          {quote && <span className="font-mono font-bold text-sm text-foreground/60">{quote.ticker}</span>}
          {quote && <span className="text-sm text-muted-foreground truncate max-w-[200px]">{quote.name}</span>}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {source && !fLoading && (
            <div className={`flex items-center gap-1 text-xs ${source === "none" ? "text-yellow-400" : "text-green-400"}`}>
              {source === "none" ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
              <span>{sourceLabel}</span>
            </div>
          )}
          <button
            onClick={() => { fundCache.delete(ticker.toUpperCase()); setRefreshKey(k => k + 1); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-32 rounded-xl" style={{ opacity: 1 - i * 0.2 }} />)}
        </div>
      ) : qError ? (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          Could not load quote. Try a different ticker.
        </div>
      ) : (
        <>
          {/* Verdict */}
          <div className={`rounded-xl border p-5 ${verdictBg}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Verdict</p>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className={`text-2xl font-bold ${verdictColor}`} style={{ fontFamily: "var(--font-display)" }}>
                    {verdict}
                  </span>
                  {upside !== null && (
                    <span className={`text-sm font-semibold tabular-nums ${verdictColor}`}>
                      {upside >= 0 ? "+" : ""}{fmt(upside)}% vs fair value
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Current price <span className="text-foreground font-mono font-semibold">${fmt(currentPrice)}</span>
                  {fair && <> · Composite fair value <span className="text-foreground font-mono font-semibold">${fmt(fair)}</span></>}
                </p>
                {!hasData && (
                  <p className="text-xs text-yellow-400 mt-1.5">Data loading — click Refresh if this persists.</p>
                )}
              </div>

              {/* Gauge */}
              {fair && (
                <div className="w-full sm:w-64 shrink-0">
                  <div className="relative h-2.5 bg-secondary rounded-full">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-400 opacity-25" />
                    <div className="absolute top-1/2 -translate-y-1/2 w-px h-5 bg-white/50 rounded-full" style={{ left: `${gaugeFair}%` }} />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-background shadow-lg transition-all"
                      style={{ left: `calc(${gaugeCur}% - 8px)`, background: (upside ?? 0) > 0 ? "hsl(142,71%,45%)" : "hsl(0,72%,51%)" }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                    <span>Overvalued</span>
                    <span className="text-foreground/50">FV ${fmt(fair, 0)}</span>
                    <span>Undervalued</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bar chart */}
          {hasData && (
            <div className="rounded-xl bg-card border border-border/50 p-5">
              <h2 className="text-sm font-semibold mb-4" style={{ fontFamily: "var(--font-display)" }}>Price vs. Valuation Models</h2>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,15%)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(0,0%,45%)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+"k" : v.toFixed(0)}`} tick={{ fontSize: 11, fill: "hsl(0,0%,45%)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0];
                      const pct = currentPrice > 0 && d.name !== "Current"
                        ? (((d.value as number) - currentPrice) / currentPrice * 100) : null;
                      return (
                        <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
                          <p className="font-semibold text-foreground">{d.name}</p>
                          <p className="tabular-nums text-foreground">${fmt(d.value as number)}</p>
                          {pct !== null && (
                            <p className={`tabular-nums font-semibold ${pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {pct >= 0 ? "+" : ""}{pct.toFixed(1)}% vs current
                            </p>
                          )}
                        </div>
                      );
                    }} />
                    <ReferenceLine y={currentPrice} stroke="hsl(0,0%,40%)" strokeDasharray="4 4" strokeWidth={1} label={{ value: "Current", position: "right", fontSize: 10, fill: "hsl(0,0%,45%)" }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {barData.map((e, i) => <Cell key={i} fill={e.color} opacity={e.name === "Current" ? 0.4 : 0.85} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* DCF + Comps side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* DCF */}
            <div className="rounded-xl bg-card border border-border/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>DCF Model</h2>
                {dcfValue && <span className="text-sm font-mono font-bold text-foreground tabular-nums">${fmt(dcfValue)}</span>}
              </div>
              <div className="space-y-4">
                {[
                  { label: "Revenue Growth (Yr 1–5)", value: growthRate, unit: "%", min: -10, max: 60, step: 1, set: setGrowthRate },
                  { label: "Terminal Growth Rate",    value: terminalGrowth, unit: "%", min: 0, max: 6, step: 0.5, set: setTerminalGrowth },
                  { label: "Discount Rate (WACC)",   value: discountRate, unit: "%", min: 6, max: 25, step: 0.5, set: setDiscountRate },
                ].map(s => (
                  <div key={s.label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="font-mono text-foreground font-semibold">{s.value}{s.unit}</span>
                    </div>
                    <Slider min={s.min} max={s.max} step={s.step} value={[s.value]} onValueChange={([v]) => s.set(v)} />
                  </div>
                ))}
              </div>
              {fund?.beta != null && (
                <p className="text-xs text-muted-foreground">Beta {fmt(fund.beta)} — higher beta suggests higher WACC</p>
              )}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/30">
                {[
                  { label: "Free Cash Flow", value: fmtB(fund?.freeCashFlow) },
                  { label: "Revenue", value: fmtB(impliedRev) },
                  { label: "EBITDA", value: fmtB(impliedEbitda) },
                  { label: "Shares Out.", value: impliedShares ? `${(impliedShares / 1e9).toFixed(2)}B` : "—" },
                ].map(m => (
                  <div key={m.label} className="text-xs">
                    <p className="text-muted-foreground mb-0.5">{m.label}</p>
                    <p className="font-mono font-semibold text-foreground tabular-nums">{m.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Comparables */}
            <div className="rounded-xl bg-card border border-border/50 p-5 space-y-4">
              <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Comparables Model</h2>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Sector</p>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(SECTOR_MEDIANS) as (keyof typeof SECTOR_MEDIANS)[]).map(s => (
                    <button key={s} onClick={() => setSectorKey(s)}
                      className={`px-2.5 py-1 text-xs rounded-lg border font-medium capitalize transition-all ${
                        sectorKey === s
                          ? "bg-foreground/15 border-foreground/30 text-foreground"
                          : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >{s}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: "P/E Based",      value: peValue,       mult: `${medians.pe}x PE`,         sub: eps ? `EPS $${fmt(eps)}` : null,              color: "hsl(265,70%,60%)" },
                  { label: "EV/EBITDA",      value: evEbitdaValue, mult: `${medians.evEbitda}x`,       sub: impliedEbitda ? fmtB(impliedEbitda) : null,   color: "hsl(45,90%,55%)" },
                  { label: "Price/Sales",    value: psValue,       mult: `${medians.ps}x P/S`,         sub: impliedRev ? fmtB(impliedRev) : null,         color: "hsl(200,80%,60%)" },
                ].map(m => (
                  <div key={m.label} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/20">
                    <div>
                      <p className="text-xs font-semibold text-foreground">{m.label}</p>
                      <p className="text-xs text-muted-foreground">{m.mult}{m.sub ? ` · ${m.sub}` : ""}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums font-mono" style={{ color: m.color }}>
                        {m.value ? `$${fmt(m.value)}` : "—"}
                      </p>
                      {m.value && currentPrice > 0 && (
                        <p className={`text-xs tabular-nums font-semibold ${m.value > currentPrice ? "text-green-400" : "text-red-400"}`}>
                          {m.value > currentPrice ? "+" : ""}{(((m.value - currentPrice) / currentPrice) * 100).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {analystValue && (
                <div className="pt-3 border-t border-border/30">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Analyst Consensus</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ l: "Low", v: fund?.targetLowPrice }, { l: "Mean", v: analystValue }, { l: "High", v: fund?.targetHighPrice }].map(t => (
                      <div key={t.l} className="text-center p-2 rounded-lg bg-secondary/30 border border-border/20">
                        <p className="text-xs text-muted-foreground">{t.l}</p>
                        <p className="text-sm font-bold font-mono tabular-nums text-green-400">{t.v ? `$${fmt(t.v)}` : "—"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Fundamentals strip */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <h2 className="text-sm font-semibold mb-4" style={{ fontFamily: "var(--font-display)" }}>Key Fundamentals</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {[
                { label: "Gross Margin",     value: fmtPct(fund?.grossMargin) },
                { label: "Operating Margin", value: fmtPct(fund?.operatingMargin) },
                { label: "Net Margin",       value: fmtPct(fund?.netMargin) },
                { label: "ROE",              value: fmtPct(fund?.returnOnEquity) },
                { label: "Forward P/E",      value: fund?.forwardPE ? `${fmt(fund.forwardPE)}x` : "—" },
                { label: "EV/EBITDA",        value: fund?.evToEbitda ? `${fmt(fund.evToEbitda)}x` : "—" },
                { label: "EV/Revenue",       value: fund?.evToRevenue ? `${fmt(fund.evToRevenue)}x` : "—" },
                { label: "P/Book",           value: fund?.priceToBook ? `${fmt(fund.priceToBook)}x` : "—" },
                { label: "Beta",             value: fund?.beta ? fmt(fund.beta) : "—" },
                { label: "Rev. Growth",      value: fmtPct(fund?.revenueGrowthTTM) },
                { label: "Div. Yield",       value: fmtPct(fund?.dividendYield) },
                { label: "Free Cash Flow",   value: fmtB(fund?.freeCashFlow) },
              ].map(m => (
                <div key={m.label}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{m.label}</p>
                  <p className="text-sm font-semibold font-mono tabular-nums text-foreground">{m.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Methodology */}
          <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
            <button
              onClick={() => setShowMethodology(m => !m)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5" />
                How are these valuations calculated?
              </div>
              {showMethodology ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showMethodology && (
              <div className="px-5 pb-5 border-t border-border/30 pt-4 text-xs text-muted-foreground space-y-2 leading-relaxed">
                <p><strong className="text-foreground">DCF (30%):</strong> Projects free cash flow 10 years forward using your growth/WACC inputs. When FCF isn't available, EBITDA × 65% is used as a proxy.</p>
                <p><strong className="text-foreground">P/E Comps (25%):</strong> Applies sector-median P/E to trailing EPS (derived from net income ÷ shares, or price ÷ trailing PE).</p>
                <p><strong className="text-foreground">EV/EBITDA (20%):</strong> Applies sector-median EV/EBITDA to EBITDA, subtracts net debt, divides by shares.</p>
                <p><strong className="text-foreground">P/S Comps (10%):</strong> Applies sector-median P/S to revenue per share.</p>
                <p><strong className="text-foreground">Analyst Target (15%):</strong> Sell-side consensus mean price target when available.</p>
                <p><strong className="text-foreground">Data sources:</strong> yfinance (primary, pre-warmed on server start) → Alpha Vantage (3-key backup) → derived from Yahoo Finance quote data. For research only — not financial advice.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
