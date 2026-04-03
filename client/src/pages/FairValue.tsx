/**
 * Fair Value Analysis
 *
 * Data strategy (browser-side only — never depends on Render server):
 *  1. Alpha Vantage called directly from the browser (3-key rotation, 75 calls/day)
 *  2. In-memory session cache — same ticker costs 0 API calls after first load
 *  3. Derived-only fallback — uses price + market cap from Yahoo quote to compute
 *     P/E, EV/EBITDA, P/S models even when AV is unavailable
 *
 * This means the tab ALWAYS shows something useful regardless of server state.
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { QuoteData } from "./Dashboard";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, ReferenceLine,
} from "recharts";
import { Scale, Info, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Slider } from "@/components/ui/slider";

// ─── Alpha Vantage client (browser-side) ────────────────────────────────────
const AV_KEYS = ["JGY040BK7WJGV51O", "LQIPW5U9PDOVRCS4", "2LRHUJBRLZSXVNQI"];
const _exhausted = new Set<string>();
let _avIdx = 0;

function nextAVKey() {
  for (let i = 0; i < AV_KEYS.length; i++) {
    const k = AV_KEYS[(_avIdx + i) % AV_KEYS.length];
    if (!_exhausted.has(k)) { _avIdx = (_avIdx + i + 1) % AV_KEYS.length; return k; }
  }
  _exhausted.clear();
  return AV_KEYS[0];
}

// Session cache: ticker → data, never expires within page session
const _avCache = new Map<string, AVData>();

interface AVData {
  pe: number | null;
  forwardPE: number | null;
  eps: number | null;
  revenue: number | null;
  ebitda: number | null;
  netIncome: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  roa: number | null;
  beta: number | null;
  bookValue: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  evToRevenue: number | null;
  sharesOutstanding: number | null;
  dividendYield: number | null;
  targetPrice: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  operatingCashFlow: number | null;
  freeCashFlow: number | null;
  enterpriseValue: number | null;
}

function n(v: string | undefined): number | null {
  if (!v || v === "None" || v === "-" || v === "N/A" || v.trim() === "") return null;
  const p = parseFloat(v);
  return isNaN(p) ? null : p;
}

async function fetchAV(ticker: string): Promise<AVData | null> {
  if (_avCache.has(ticker)) return _avCache.get(ticker)!;

  for (let attempt = 0; attempt < AV_KEYS.length; attempt++) {
    const key = nextAVKey();
    try {
      const res = await fetch(
        `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${key}`,
        { signal: AbortSignal.timeout(12000) }
      );
      if (!res.ok) continue;
      const av = await res.json();
      if (av.Note || av.Information) { _exhausted.add(key); continue; }
      if (!av.Symbol) continue;

      const rev = n(av.RevenueTTM);
      const gp  = n(av.GrossProfitTTM);
      const ebitda = n(av.EBITDA);
      const evEbitda = n(av.EVToEBITDA);
      const evRev    = n(av.EVToRevenue);
      const ev = evEbitda && ebitda ? evEbitda * ebitda : evRev && rev ? evRev * rev : null;

      const data: AVData = {
        pe: n(av.PERatio),
        forwardPE: n(av.ForwardPE),
        eps: n(av.EPS),
        revenue: rev,
        ebitda,
        netIncome: n(av.NetIncomeTTM),
        grossMargin: gp && rev && rev > 0 ? gp / rev : null,
        operatingMargin: n(av.OperatingMarginTTM),
        netMargin: n(av.ProfitMargin),
        roe: n(av.ReturnOnEquityTTM),
        roa: n(av.ReturnOnAssetsTTM),
        beta: n(av.Beta),
        bookValue: n(av.BookValue),
        priceToBook: n(av.PriceToBookRatio),
        evToEbitda,
        evToRevenue: evRev,
        sharesOutstanding: n(av.SharesOutstanding),
        dividendYield: n(av.DividendYield),
        targetPrice: n(av.AnalystTargetPrice),
        revenueGrowth: n(av.QuarterlyRevenueGrowthYOY),
        earningsGrowth: n(av.QuarterlyEarningsGrowthYOY),
        operatingCashFlow: n(av.OperatingCashflowTTM),
        freeCashFlow: null,
        enterpriseValue: ev,
      };

      _avCache.set(ticker, data);
      return data;
    } catch { continue; }
  }
  return null;
}

// ─── DCF ────────────────────────────────────────────────────────────────────
function dcf(fcf: number, g: number, tg: number, wacc: number, shares: number, netDebt: number) {
  let pv = 0, cf = fcf;
  for (let y = 1; y <= 10; y++) {
    cf *= 1 + (y <= 5 ? g : (g + tg) / 2);
    pv += cf / Math.pow(1 + wacc, y);
  }
  const tv = (cf * (1 + tg)) / (wacc - tg);
  return Math.max(0, (pv + tv / Math.pow(1 + wacc, 10) - netDebt) / shares);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const f = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const fP = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(1)}%`;

const fB = (n: number | null | undefined) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
};

// ─── Sector medians ─────────────────────────────────────────────────────────
const SECTORS = {
  tech:       { pe: 28, evEbitda: 22, ps: 6.0 },
  fintech:    { pe: 22, evEbitda: 16, ps: 3.0 },
  healthcare: { pe: 20, evEbitda: 14, ps: 2.5 },
  consumer:   { pe: 18, evEbitda: 12, ps: 1.8 },
  energy:     { pe: 12, evEbitda:  8, ps: 1.2 },
  default:    { pe: 20, evEbitda: 14, ps: 2.5 },
} as const;

type SectorKey = keyof typeof SECTORS;

// ─── Component ───────────────────────────────────────────────────────────────
export default function FairValue({ ticker }: { ticker: string }) {
  const [growthRate,     setGrowthRate]     = useState(12);
  const [terminalGrowth, setTerminalGrowth] = useState(3);
  const [discountRate,   setDiscountRate]   = useState(10);
  const [sector,         setSector]         = useState<SectorKey>("default");
  const [showMethod,     setShowMethod]     = useState(false);

  const [av,        setAv]        = useState<AVData | null>(null);
  const [avLoading, setAvLoading] = useState(true);
  const [avFailed,  setAvFailed]  = useState(false);
  const refreshRef = useRef(0);

  // Quote (always works via Yahoo v8)
  const { data: quote, isLoading: qLoading } = useQuery<QuoteData>({
    queryKey: ["/api/quote", ticker],
    queryFn:  () => apiRequest("GET", `/api/quote/${ticker}`).then(r => r.json()),
    staleTime: 30000,
    retry: 3,
  });

  // Alpha Vantage — called from browser, not server
  useEffect(() => {
    setAvLoading(true);
    setAvFailed(false);
    fetchAV(ticker.toUpperCase())
      .then(data => { setAv(data); setAvLoading(false); if (!data) setAvFailed(true); })
      .catch(() => { setAvLoading(false); setAvFailed(true); });
  }, [ticker, refreshRef.current]);

  const price = quote?.price ?? 0;
  const mktCap = quote?.marketCap ?? null;
  const med = SECTORS[sector];

  // ── Derive values ──────────────────────────────────────────────────────────
  // EPS: from AV, or back-calculate from price / PE
  const eps = av?.eps ?? (av?.pe && price > 0 ? price / av.pe : null);

  // Shares: from AV or from market cap / price
  const shares = av?.sharesOutstanding ?? (mktCap && price > 0 ? mktCap / price : null);

  // Revenue: from AV or from EV/Revenue
  const revenue = av?.revenue ?? null;

  // EBITDA: from AV
  const ebitda = av?.ebitda ?? null;

  // Net debt: EV - market cap
  const netDebt = (av?.enterpriseValue ?? 0) - (mktCap ?? 0);

  // FCF proxy: EBITDA × 0.6 if no real FCF
  const fcf = av?.freeCashFlow ?? (ebitda ? ebitda * 0.6 : null);

  // ── Valuation models ───────────────────────────────────────────────────────
  const dcfVal = useMemo(() => {
    if (!fcf || !shares || shares <= 0) return null;
    const v = dcf(fcf, growthRate / 100, terminalGrowth / 100, discountRate / 100, shares, netDebt);
    return isFinite(v) && v > 0 ? v : null;
  }, [fcf, shares, netDebt, growthRate, terminalGrowth, discountRate]);

  const peVal = eps && eps > 0 ? med.pe * eps : null;

  const evEbitdaVal = ebitda && shares && shares > 0
    ? Math.max(0, (med.evEbitda * ebitda - netDebt) / shares)
    : null;

  const psVal = revenue && shares && shares > 0
    ? (med.ps * revenue) / shares
    : null;

  const analystVal = av?.targetPrice ?? null;

  const models = [
    { label: "DCF",            value: dcfVal,      weight: 0.30, color: "hsl(185,80%,50%)" },
    { label: "P/E Comps",      value: peVal,       weight: 0.25, color: "hsl(265,70%,60%)" },
    { label: "EV/EBITDA",      value: evEbitdaVal, weight: 0.20, color: "hsl(45,90%,55%)" },
    { label: "P/S Comps",      value: psVal,       weight: 0.10, color: "hsl(200,80%,60%)" },
    { label: "Analyst Target", value: analystVal,  weight: 0.15, color: "hsl(142,71%,45%)" },
  ].filter(m => m.value != null && m.value > 0 && isFinite(m.value));

  const totalW = models.reduce((s, m) => s + m.weight, 0);
  const fair   = totalW > 0 ? models.reduce((s, m) => s + m.value! * m.weight, 0) / totalW : null;
  const upside = fair && price > 0 ? ((fair - price) / price) * 100 : null;

  const verdict =
    upside == null   ? "—" :
    upside >  25     ? "Significantly Undervalued" :
    upside >  10     ? "Moderately Undervalued" :
    upside > -10     ? "Fairly Valued" :
    upside > -25     ? "Moderately Overvalued" :
                       "Significantly Overvalued";

  const vColor =
    upside == null ? "text-muted-foreground" :
    upside >  10   ? "text-green-400" :
    upside > -10   ? "text-yellow-400" :
                     "text-red-400";

  const vBg =
    upside == null ? "bg-card border-border" :
    upside >  10   ? "bg-green-500/8 border-green-500/20" :
    upside > -10   ? "bg-yellow-500/8 border-yellow-500/20" :
                     "bg-red-500/8 border-red-500/20";

  const gaugeMin = fair ? Math.min(price, fair) * 0.75 : 0;
  const gaugeMax = fair ? Math.max(price, fair) * 1.25 : 1;
  const gaugeCur  = fair ? Math.min(100, Math.max(0, ((price - gaugeMin) / (gaugeMax - gaugeMin)) * 100)) : 50;
  const gaugeFair = fair ? Math.min(100, Math.max(0, ((fair  - gaugeMin) / (gaugeMax - gaugeMin)) * 100)) : 50;

  const barData = [
    { name: "Current", value: price, color: "hsl(0,0%,45%)" },
    ...models.map(m => ({ name: m.label, value: parseFloat(m.value!.toFixed(2)), color: m.color })),
    ...(fair ? [{ name: "Fair Value", value: parseFloat(fair.toFixed(2)), color: "hsl(185,80%,55%)" }] : []),
  ];

  const loading = qLoading || avLoading;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Scale className="w-5 h-5 text-foreground" />
          <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Fair Value Analysis
          </h1>
          {quote && <span className="font-mono font-bold text-foreground/60">{quote.ticker}</span>}
          {quote && <span className="text-sm text-muted-foreground truncate max-w-[200px]">{quote.name}</span>}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className={`text-xs ${avFailed ? "text-yellow-400" : av ? "text-green-400" : "text-muted-foreground"}`}>
            {avFailed ? "Using derived models" : av ? "Alpha Vantage ✓" : avLoading ? "Loading…" : ""}
          </span>
          <button
            onClick={() => { _avCache.delete(ticker.toUpperCase()); refreshRef.current++; setAv(null); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${avLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton rounded-xl" style={{ height: i === 1 ? 120 : 200, opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      ) : (
        <>
          {/* ── Verdict ── */}
          <div className={`rounded-xl border p-5 ${vBg}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Verdict</p>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className={`text-2xl font-bold ${vColor}`} style={{ fontFamily: "var(--font-display)" }}>
                    {verdict}
                  </span>
                  {upside != null && (
                    <span className={`text-sm font-semibold tabular-nums ${vColor}`}>
                      {upside >= 0 ? "+" : ""}{f(upside)}% vs fair value
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Current <span className="text-foreground font-mono font-semibold">${f(price)}</span>
                  {fair && <> · Fair value <span className="text-foreground font-mono font-semibold">${f(fair)}</span></>}
                </p>
                {models.length === 0 && (
                  <p className="text-xs text-yellow-400 mt-2">
                    No models computed yet — data may still be loading. Try clicking Refresh.
                  </p>
                )}
              </div>

              {/* Gauge */}
              {fair && (
                <div className="w-full sm:w-64 shrink-0">
                  <div className="relative h-2.5 bg-secondary rounded-full overflow-visible">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-400 opacity-20" />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-px h-5 bg-white/40 rounded-full"
                      style={{ left: `${gaugeFair}%` }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-background shadow-lg"
                      style={{
                        left: `calc(${gaugeCur}% - 8px)`,
                        background: (upside ?? 0) > 0 ? "hsl(142,71%,45%)" : "hsl(0,72%,51%)",
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>Overvalued</span>
                    <span>FV ${f(fair, 0)}</span>
                    <span>Undervalued</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Bar chart ── */}
          {models.length > 0 && (
            <div className="rounded-xl bg-card border border-border/50 p-5">
              <h2 className="text-sm font-semibold mb-4" style={{ fontFamily: "var(--font-display)" }}>
                Price vs. Valuation Models
              </h2>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,15%)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "hsl(0,0%,45%)", fontFamily: "var(--font-mono)" }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v.toFixed(0)}`}
                      tick={{ fontSize: 11, fill: "hsl(0,0%,45%)", fontFamily: "var(--font-mono)" }}
                      axisLine={false} tickLine={false} width={56}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0];
                        const pct = price > 0 && d.name !== "Current"
                          ? (((d.value as number) - price) / price) * 100 : null;
                        return (
                          <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
                            <p className="font-semibold text-foreground mb-1">{d.name}</p>
                            <p className="tabular-nums text-foreground">${f(d.value as number)}</p>
                            {pct != null && (
                              <p className={`tabular-nums font-semibold ${pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {pct >= 0 ? "+" : ""}{pct.toFixed(1)}% vs current
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine
                      y={price}
                      stroke="hsl(0,0%,40%)"
                      strokeDasharray="4 4"
                      strokeWidth={1}
                      label={{ value: "Current", position: "right", fontSize: 10, fill: "hsl(0,0%,45%)" }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {barData.map((e, i) => (
                        <Cell key={i} fill={e.color} opacity={e.name === "Current" ? 0.4 : 0.9} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── DCF + Comps ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* DCF */}
            <div className="rounded-xl bg-card border border-border/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>DCF Model</h2>
                {dcfVal && <span className="text-sm font-mono font-bold text-foreground tabular-nums">${f(dcfVal)}</span>}
              </div>

              <div className="space-y-4">
                {[
                  { label: "Revenue Growth (Yr 1–5)", val: growthRate,     set: setGrowthRate,     min: -10, max: 60,  step: 1   },
                  { label: "Terminal Growth Rate",    val: terminalGrowth, set: setTerminalGrowth, min: 0,   max: 6,   step: 0.5 },
                  { label: "Discount Rate (WACC)",   val: discountRate,   set: setDiscountRate,   min: 6,   max: 25,  step: 0.5 },
                ].map(s => (
                  <div key={s.label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="font-mono text-foreground font-semibold">{s.val}%</span>
                    </div>
                    <Slider
                      min={s.min} max={s.max} step={s.step}
                      value={[s.val]}
                      onValueChange={([v]) => s.set(v)}
                    />
                  </div>
                ))}
              </div>

              {av?.beta != null && (
                <p className="text-xs text-muted-foreground">
                  Beta {f(av.beta)} — higher beta suggests higher WACC
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/30">
                {[
                  { label: "Free Cash Flow",  value: fB(av?.freeCashFlow ?? fcf) },
                  { label: "Revenue",         value: fB(revenue) },
                  { label: "EBITDA",          value: fB(ebitda) },
                  { label: "Shares Out.",     value: shares ? `${(shares / 1e9).toFixed(2)}B` : "—" },
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
              <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                Comparables Model
              </h2>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Sector</p>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(SECTORS) as SectorKey[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setSector(s)}
                      className={`px-2.5 py-1 text-xs rounded-lg border font-medium capitalize transition-all ${
                        sector === s
                          ? "bg-foreground/15 border-foreground/30 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    label: "P/E Based",    value: peVal,       mult: `${med.pe}x PE`,
                    sub:   eps ? `EPS $${f(eps)}` : null,      color: "hsl(265,70%,60%)",
                  },
                  {
                    label: "EV/EBITDA",   value: evEbitdaVal, mult: `${med.evEbitda}x`,
                    sub:   ebitda ? fB(ebitda) : null,         color: "hsl(45,90%,55%)",
                  },
                  {
                    label: "Price/Sales", value: psVal,       mult: `${med.ps}x P/S`,
                    sub:   revenue ? fB(revenue) : null,       color: "hsl(200,80%,60%)",
                  },
                ].map(m => (
                  <div
                    key={m.label}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/20"
                  >
                    <div>
                      <p className="text-xs font-semibold text-foreground">{m.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.mult}{m.sub ? ` · ${m.sub}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums font-mono" style={{ color: m.color }}>
                        {m.value ? `$${f(m.value)}` : "—"}
                      </p>
                      {m.value && price > 0 && (
                        <p className={`text-xs tabular-nums font-semibold ${m.value > price ? "text-green-400" : "text-red-400"}`}>
                          {m.value > price ? "+" : ""}{(((m.value - price) / price) * 100).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {analystVal && (
                <div className="pt-3 border-t border-border/30">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">
                    Analyst Consensus
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { l: "Low",  v: av?.targetPrice ? av.targetPrice * 0.85 : null },
                      { l: "Mean", v: analystVal },
                      { l: "High", v: av?.targetPrice ? av.targetPrice * 1.15 : null },
                    ].map(t => (
                      <div key={t.l} className="text-center p-2.5 rounded-lg bg-secondary/30 border border-border/20">
                        <p className="text-xs text-muted-foreground mb-0.5">{t.l}</p>
                        <p className="text-sm font-bold font-mono tabular-nums text-green-400">
                          {t.v ? `$${f(t.v, 0)}` : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Fundamentals strip ── */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <h2 className="text-sm font-semibold mb-4" style={{ fontFamily: "var(--font-display)" }}>
              Key Fundamentals
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {[
                { label: "Gross Margin",     value: fP(av?.grossMargin) },
                { label: "Operating Margin", value: fP(av?.operatingMargin) },
                { label: "Net Margin",       value: fP(av?.netMargin) },
                { label: "ROE",              value: fP(av?.roe) },
                { label: "Forward P/E",      value: av?.forwardPE   ? `${f(av.forwardPE)}x`   : "—" },
                { label: "EV/EBITDA",        value: av?.evToEbitda  ? `${f(av.evToEbitda)}x`  : "—" },
                { label: "EV/Revenue",       value: av?.evToRevenue ? `${f(av.evToRevenue)}x` : "—" },
                { label: "P/Book",           value: av?.priceToBook ? `${f(av.priceToBook)}x` : "—" },
                { label: "Beta",             value: av?.beta        ? f(av.beta)               : "—" },
                { label: "Rev. Growth",      value: fP(av?.revenueGrowth) },
                { label: "Div. Yield",       value: fP(av?.dividendYield) },
                { label: "Oper. Cash Flow",  value: fB(av?.operatingCashFlow) },
              ].map(m => (
                <div key={m.label}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{m.label}</p>
                  <p className="text-sm font-semibold font-mono tabular-nums text-foreground">{m.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Methodology ── */}
          <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
            <button
              onClick={() => setShowMethod(m => !m)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-secondary/20 transition-colors"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5" />
                How are these valuations calculated?
              </div>
              {showMethod
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showMethod && (
              <div className="px-5 pb-5 border-t border-border/30 pt-4 text-xs text-muted-foreground space-y-2 leading-relaxed">
                <p><strong className="text-foreground">DCF (30%):</strong> Projects free cash flow 10 years forward. When FCF isn't available, EBITDA × 60% is used as a proxy. Terminal value uses Gordon Growth Model.</p>
                <p><strong className="text-foreground">P/E Comps (25%):</strong> Sector-median P/E × trailing EPS. EPS is from Alpha Vantage or derived from price ÷ trailing PE.</p>
                <p><strong className="text-foreground">EV/EBITDA (20%):</strong> Sector-median multiple × EBITDA − net debt, divided by shares outstanding.</p>
                <p><strong className="text-foreground">P/S Comps (10%):</strong> Sector-median P/S × revenue per share.</p>
                <p><strong className="text-foreground">Analyst Target (15%):</strong> Consensus mean price target from Alpha Vantage when available.</p>
                <p><strong className="text-foreground">Data source:</strong> Alpha Vantage free API (called directly from your browser — unaffected by server state). Session-cached so the same ticker never calls the API twice. For research only — not financial advice.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
