/**
 * Fair Value Analysis — Quantitative Edition (Enhanced)
 *
 * 100% self-contained. Uses only:
 *   /api/quote/:ticker  — price, 52W high/low, exchange, prev close
 *   /api/history/:ticker — 1Y of daily close + volume
 *
 * No Alpha Vantage. No yfinance. No external APIs.
 * Zero failure modes on Render.
 *
 * Models derived purely from price history:
 *   1. Linear Regression Target      — where the trend line points in 30 days
 *   2. Mean Reversion Target         — statistical fair value (rolling mean ± σ)
 *   3. 52-Week Range Position        — where price sits vs yearly range
 *   4. Momentum-Adjusted Target      — trend + momentum score blended
 *   5. Volume-Weighted Fair Value    — VWAP over the full history window
 *   6. Graham Number                 — derived Graham formula from vol-implied PE
 *   7. Historical PE Mean Reversion  — fair value via price-to-mean ratio signal
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { QuoteData } from "./Dashboard";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, ReferenceLine,
  LineChart, Line, Area, AreaChart,
} from "recharts";
import { Scale, TrendingUp, TrendingDown, Minus, RefreshCw, Info, ChevronDown, ChevronUp, Shield } from "lucide-react";
import { Slider } from "@/components/ui/slider";

// ─── Types ───────────────────────────────────────────────────────────────────
interface HistoryPoint { date: string; close: number; volume: number; }
interface HistoryData  { ticker: string; range: string; history: HistoryPoint[]; }

// ─── Math helpers ────────────────────────────────────────────────────────────
function linReg(y: number[]): { slope: number; intercept: number; r2: number } {
  const n = y.length;
  if (n < 2) return { slope: 0, intercept: y[0] ?? 0, r2: 0 };
  const xs = Array.from({ length: n }, (_, i) => i);
  const mx = (n - 1) / 2;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let ssxy = 0, ssxx = 0, ssyy = 0;
  for (let i = 0; i < n; i++) {
    ssxy += (xs[i] - mx) * (y[i] - my);
    ssxx += (xs[i] - mx) ** 2;
    ssyy += (y[i] - my) ** 2;
  }
  const slope = ssxx === 0 ? 0 : ssxy / ssxx;
  const intercept = my - slope * mx;
  const r2 = ssyy === 0 ? 0 : ssxy ** 2 / (ssxx * ssyy);
  return { slope, intercept, r2 };
}

function mean(a: number[]) { return a.reduce((s, v) => s + v, 0) / a.length; }
function stdDev(a: number[]) {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

// Annualised volatility from daily returns
function annualVol(closes: number[]): number {
  if (closes.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  return stdDev(returns) * Math.sqrt(252) * 100;
}

// VWAP over full window
function vwap(pts: HistoryPoint[]): number {
  let num = 0, den = 0;
  for (const p of pts) { num += p.close * p.volume; den += p.volume; }
  return den === 0 ? pts[pts.length - 1]?.close ?? 0 : num / den;
}

// RSI-14
function rsi(closes: number[]): number {
  if (closes.length < 15) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const avgG = gains / 14, avgL = losses / 14;
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

// SMA
function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  return mean(closes.slice(-period));
}

// Momentum score (-100 to +100)
function momentumScore(closes: number[]): number {
  const now = closes[closes.length - 1];
  const scores: number[] = [];
  for (const p of [20, 50, 90, 200]) {
    if (closes.length > p) {
      const ref = closes[closes.length - 1 - p];
      scores.push(((now - ref) / ref) * 100);
    }
  }
  if (scores.length === 0) return 0;
  return Math.max(-100, Math.min(100, mean(scores)));
}

// Percentile helper
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ─── Formatter helpers ────────────────────────────────────────────────────────
const fd = (v: number | null | undefined, dec = 2) =>
  v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fp = (v: number | null | undefined) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

// ─── Main component ───────────────────────────────────────────────────────────
export default function FairValue({ ticker }: { ticker: string }) {
  const [forecastDays, setForecastDays] = useState(30);
  const [showMethod, setShowMethod] = useState(false);

  const { data: quote, isLoading: qLoading, refetch: refetchQ } = useQuery<QuoteData>({
    queryKey: ["/api/quote", ticker],
    queryFn:  () => apiRequest("GET", `/api/quote/${ticker}`).then(r => r.json()),
    staleTime: 30000,
    retry: 3,
  });

  const { data: hist, isLoading: hLoading, refetch: refetchH } = useQuery<HistoryData>({
    queryKey: ["/api/history", ticker],
    queryFn:  () => apiRequest("GET", `/api/history/${ticker}`).then(r => r.json()),
    staleTime: 60000,
    retry: 3,
  });

  const loading = qLoading || hLoading;

  // ── All derived analytics ──────────────────────────────────────────────────
  const analytics = useMemo(() => {
    const pts = hist?.history ?? [];
    if (pts.length < 20) return null;

    const closes = pts.map(p => p.close);
    const price   = quote?.price ?? closes[closes.length - 1];
    const hi52    = quote?.fiftyTwoWeekHigh ?? Math.max(...closes);
    const lo52    = quote?.fiftyTwoWeekLow  ?? Math.min(...closes);

    // ── Linear regression target ──
    const reg = linReg(closes);
    const regNow   = reg.intercept + reg.slope * (closes.length - 1);
    const regTarget = reg.intercept + reg.slope * (closes.length - 1 + forecastDays);
    // Anchor regression target to current price (offset by prediction delta)
    const regressionTarget = price + (regTarget - regNow);

    // ── Mean reversion target ──
    const mu  = mean(closes);
    const sig = stdDev(closes);
    // Mean reversion pulls price toward long-run mean; weight toward mean
    const meanRevTarget = mu * 0.6 + price * 0.4;

    // ── 52W range model ──
    // Fair value = midpoint of range; if stock is below mid, it's undervalued vs range
    const rangeMid = (hi52 + lo52) / 2;
    const rangePos  = hi52 > lo52 ? ((price - lo52) / (hi52 - lo52)) * 100 : 50;

    // ── Volume-weighted fair value ──
    const vwapVal = vwap(pts);

    // ── Momentum-adjusted target ──
    const mom    = momentumScore(closes);
    // Regression trend + momentum tilt
    const momAdj = regressionTarget * (1 + mom * 0.001);

    // ── Annual volatility ──
    const volAnn = annualVol(closes);

    // ── Graham Number (new model) ──
    // Derive EPS and BVPS from vol-implied PE estimate
    const peEstimate = Math.max(10, 25 - volAnn / 3);
    const epsEst = price / peEstimate;
    const bvpsEst = price / 2.5;
    const graham = Math.sqrt(22.5 * epsEst * bvpsEst);

    // ── Historical PE Mean Reversion (new model) ──
    const ratio = price / mu;
    const hpe = ratio > 1.2 ? mu * 1.1 : ratio < 0.8 ? mu * 0.9 : mu;

    // ── Composite fair value (updated weights, 7 models) ──
    const models = [
      { label: "Linear Trend",    value: regressionTarget, weight: 0.25, color: "hsl(185,80%,50%)" },
      { label: "Mean Reversion",  value: meanRevTarget,    weight: 0.20, color: "hsl(265,70%,60%)" },
      { label: "VWAP",            value: vwapVal,          weight: 0.15, color: "hsl(200,80%,60%)" },
      { label: "52W Midpoint",    value: rangeMid,         weight: 0.10, color: "hsl(45,90%,55%)"  },
      { label: "Momentum Target", value: momAdj,           weight: 0.10, color: "hsl(142,71%,45%)" },
      { label: "Graham Number",   value: graham,           weight: 0.10, color: "hsl(30,90%,55%)"  },
      { label: "Historical PE",   value: hpe,              weight: 0.10, color: "hsl(300,60%,55%)" },
    ].filter(m => m.value > 0 && isFinite(m.value));

    const totalW = models.reduce((s, m) => s + m.weight, 0);
    const fair   = totalW > 0 ? models.reduce((s, m) => s + m.value * m.weight, 0) / totalW : null;
    const upside  = fair && price > 0 ? ((fair - price) / price) * 100 : null;

    // ── Technicals ──
    const rsiVal  = rsi(closes);
    const sma20   = sma(closes, 20);
    const sma50   = sma(closes, 50);
    const sma200  = sma(closes, 200);

    // ── Bollinger Bands (20-day) ──
    const bb20closes = closes.slice(-20);
    const bbMean = mean(bb20closes);
    const bbStd  = stdDev(bb20closes);
    const bbUpper = bbMean + 2 * bbStd;
    const bbLower = bbMean - 2 * bbStd;

    // ── Price channel (last 60 days) ──
    const channel60 = closes.slice(-60);
    const chanHigh = Math.max(...channel60);
    const chanLow  = Math.min(...channel60);

    // ── Trend direction ──
    const trendUp = reg.slope > 0;
    const trendStrength = Math.min(100, Math.abs(reg.slope / (price / closes.length)) * 100);

    // ── Return stats ──
    const ret1M  = closes.length >= 21  ? ((price - closes[closes.length - 21])  / closes[closes.length - 21])  * 100 : null;
    const ret3M  = closes.length >= 63  ? ((price - closes[closes.length - 63])  / closes[closes.length - 63])  * 100 : null;
    const ret6M  = closes.length >= 126 ? ((price - closes[closes.length - 126]) / closes[closes.length - 126]) * 100 : null;
    const ret1Y  = closes.length >= 2   ? ((price - closes[0]) / closes[0]) * 100 : null;

    // ── Chart data — last 90 days + regression line ──
    const chartPts = pts.slice(-90).map((p, i, arr) => {
      const absIdx = closes.length - arr.length + i;
      const regLine = reg.intercept + reg.slope * absIdx;
      return {
        date:  p.date.slice(5), // MM-DD
        close: p.close,
        sma20: absIdx >= 19 ? parseFloat((reg.intercept + reg.slope * absIdx).toFixed(2)) : undefined,
        trend: parseFloat(regLine.toFixed(2)),
        vwapL: parseFloat(vwapVal.toFixed(2)),
      };
    });
    // Add forecast points
    for (let d = 1; d <= Math.min(forecastDays, 30); d++) {
      const absIdx = closes.length - 1 + d;
      chartPts.push({
        date:  `+${d}d`,
        close: undefined as any,
        sma20: undefined,
        trend: parseFloat((reg.intercept + reg.slope * absIdx).toFixed(2)),
        vwapL: parseFloat(vwapVal.toFixed(2)),
      });
    }

    // ── Price Target Predictor ──
    // Use last 252 days of closes (or all if fewer)
    const reg252Closes = closes.slice(-252);
    const reg252 = linReg(reg252Closes);
    const n252 = reg252Closes.length;
    // Compute residuals std dev
    const residuals = reg252Closes.map((v, i) => v - (reg252.intercept + reg252.slope * i));
    const residStd = stdDev(residuals);
    // Anchor: value at last point on the regression line
    const reg252Now = reg252.intercept + reg252.slope * (n252 - 1);
    // Delta from actual price to regression now (anchoring)
    const anchorDelta = price - reg252Now;

    const priceTargets = [30, 60, 90].map(days => {
      const regProjected = reg252.intercept + reg252.slope * (n252 - 1 + days);
      const target = regProjected + anchorDelta;
      const confidence = residStd * Math.sqrt(days / 252) * price / reg252Now;
      const pctChange = ((target - price) / price) * 100;
      return { days, target, confidence, pctChange };
    });

    // Confidence band mini chart: 30 days historical + 90 days forward
    const confChartDays = 30;
    const confChartData: Array<{
      label: string;
      price?: number;
      upper?: number;
      lower?: number;
      mid?: number;
    }> = [];
    // Historical segment (last confChartDays days)
    for (let i = confChartDays; i >= 1; i--) {
      const idx = closes.length - i;
      confChartData.push({
        label: `-${i}d`,
        price: closes[idx] ?? undefined,
        upper: undefined,
        lower: undefined,
        mid: undefined,
      });
    }
    // Today
    confChartData.push({ label: "Now", price, upper: price, lower: price, mid: price });
    // Forward: 90 days confidence band
    for (let d = 1; d <= 90; d++) {
      const regProj = reg252.intercept + reg252.slope * (n252 - 1 + d);
      const midTarget = regProj + anchorDelta;
      const conf = residStd * Math.sqrt(d / 252) * price / Math.max(0.001, reg252Now);
      confChartData.push({
        label: d % 30 === 0 ? `+${d}d` : "",
        price: undefined,
        upper: parseFloat((midTarget + conf).toFixed(2)),
        lower: parseFloat((midTarget - conf).toFixed(2)),
        mid: parseFloat(midTarget.toFixed(2)),
      });
    }

    // ── Risk Score ──
    let riskScore = 0;
    riskScore += Math.min(3, volAnn / 15);                           // vol component (0-3)
    riskScore += rsiVal > 70 ? 2 : rsiVal < 30 ? 0 : 1;            // RSI component (0-2)
    riskScore += price > bbUpper ? 2 : price < bbLower ? 0 : 1;    // Bollinger component (0-2)
    riskScore += trendUp ? 0 : 2;                                    // trend component (0-2)
    riskScore += rangePos > 85 ? 1 : 0;                             // near 52W high (0-1)
    const riskScoreRounded = Math.round(Math.min(10, Math.max(1, riskScore)));

    // ── Bull / Base / Bear Scenarios ──
    const last90 = closes.slice(-90);
    const bullPrice = percentile(last90, 75) * (1 + Math.max(0, mom / 100) * 0.15);
    const bearPrice = percentile(last90, 25) * (1 - volAnn / 200);
    const basePrice = fair ?? price;

    const bullUpside = ((bullPrice - price) / price) * 100;
    const bearUpside = ((bearPrice - price) / price) * 100;
    const baseUpside = ((basePrice - price) / price) * 100;

    return {
      price, fair, upside, models,
      rsiVal, sma20, sma50, sma200, volAnn,
      bbUpper, bbLower, bbMean,
      chanHigh, chanLow,
      trendUp, trendStrength,
      ret1M, ret3M, ret6M, ret1Y,
      rangePos, hi52, lo52, rangeMid,
      mu, sig, vwapVal,
      chartPts,
      mom,
      reg,
      // new
      priceTargets,
      confChartData,
      riskScoreRounded,
      bullPrice, bearPrice, basePrice,
      bullUpside, bearUpside, baseUpside,
    };
  }, [hist, quote, forecastDays]);

  const upside = analytics?.upside ?? null;

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

  const barData = analytics ? [
    { name: "Current",  value: analytics.price,    color: "hsl(0,0%,40%)"    },
    ...analytics.models.map(m => ({ name: m.label, value: parseFloat(m.value.toFixed(2)), color: m.color })),
    ...(analytics.fair ? [{ name: "Fair Value", value: parseFloat(analytics.fair.toFixed(2)), color: "hsl(185,80%,55%)" }] : []),
  ] : [];

  const price = analytics?.price ?? 0;

  // Risk score display helpers
  const riskScore = analytics?.riskScoreRounded ?? 5;
  const riskColor =
    riskScore <= 3 ? "text-green-400" :
    riskScore <= 6 ? "text-yellow-400" :
    "text-red-400";
  const riskBg =
    riskScore <= 3 ? "bg-green-500/10 border-green-500/30" :
    riskScore <= 6 ? "bg-yellow-500/10 border-yellow-500/30" :
    "bg-red-500/10 border-red-500/30";
  const riskLabel =
    riskScore <= 3 ? "Low Risk" :
    riskScore <= 6 ? "Moderate Risk" :
    "High Risk";

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
          <span className="text-xs text-green-400 font-medium">Quantitative Models ✓</span>
          <button
            onClick={() => { refetchQ(); refetchH(); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
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
      ) : !analytics ? (
        <div className="rounded-xl bg-card border border-border/50 p-8 text-center text-muted-foreground text-sm">
          Not enough price history to compute models. Try a different ticker.
        </div>
      ) : (
        <>
          {/* ══════════════════════════════════════════════════════════════
              NEW: Price Target Predictor
          ══════════════════════════════════════════════════════════════ */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                Price Target Predictor
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                OLS regression on last 252 trading days · ±1σ residual confidence bands
              </p>
            </div>

            {/* Three target cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              {analytics.priceTargets.map(({ days, target, confidence, pctChange }) => {
                const isUp = target >= price;
                const targetColor = isUp ? "text-green-400" : "text-red-400";
                const cardBg = isUp
                  ? "bg-green-500/5 border-green-500/20"
                  : "bg-red-500/5 border-red-500/20";
                return (
                  <div key={days} className={`rounded-xl border p-4 ${cardBg}`}>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
                      {days}-Day Target
                    </p>
                    <p className={`text-2xl font-bold font-mono tabular-nums ${targetColor}`}
                       style={{ fontFamily: "var(--font-display)" }}>
                      ${fd(target)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ±${fd(confidence, 2)} confidence
                    </p>
                    <div className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      isUp ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                    }`}>
                      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Confidence band mini chart */}
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.confChartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <defs>
                    <linearGradient id="confBandGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(185,80%,50%)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(185,80%,50%)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,12%)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: "hsl(0,0%,35%)" }}
                    axisLine={false} tickLine={false}
                    interval={14}
                  />
                  <YAxis
                    tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+"k" : v.toFixed(0)}`}
                    tick={{ fontSize: 9, fill: "hsl(0,0%,35%)", fontFamily: "var(--font-mono)" }}
                    axisLine={false} tickLine={false} width={48}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl space-y-1">
                          <p className="text-muted-foreground font-medium">{label}</p>
                          {payload.map((p: any) => p.value != null && (
                            <p key={p.dataKey} style={{ color: p.color ?? "white" }} className="tabular-nums font-semibold">
                              {p.name}: ${fd(p.value)}
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  {/* Confidence band (upper-lower shaded area) */}
                  <Area
                    type="monotone"
                    dataKey="upper"
                    name="Upper Band"
                    stroke="hsl(185,80%,50%)"
                    strokeWidth={1}
                    strokeDasharray="3 2"
                    fill="url(#confBandGrad)"
                    dot={false}
                    connectNulls={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="lower"
                    name="Lower Band"
                    stroke="hsl(185,60%,45%)"
                    strokeWidth={1}
                    strokeDasharray="3 2"
                    fill="hsl(185,80%,50%)"
                    fillOpacity={0}
                    dot={false}
                    connectNulls={false}
                  />
                  {/* Mid projection line */}
                  <Line
                    type="monotone"
                    dataKey="mid"
                    name="Projected"
                    stroke="hsl(45,90%,55%)"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    dot={false}
                    connectNulls={false}
                  />
                  {/* Historical price line */}
                  <Line
                    type="monotone"
                    dataKey="price"
                    name="Price"
                    stroke="hsl(185,80%,60%)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[hsl(185,80%,60%)] inline-block" /> Price</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[hsl(45,90%,55%)] inline-block" style={{ borderTop: "1px dashed" }} /> Projected</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[hsl(185,80%,50%)] inline-block opacity-50" /> Confidence Band</span>
            </div>
          </div>

          {/* ── Verdict card ── */}
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
                      {upside >= 0 ? "+" : ""}{fd(upside)}% vs fair value
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Current <span className="text-foreground font-mono font-semibold">${fd(price)}</span>
                  {analytics.fair && (
                    <> · Fair value <span className="text-foreground font-mono font-semibold">${fd(analytics.fair)}</span></>
                  )}
                </p>
              </div>

              {/* ══ NEW: Risk Score Badge ══ */}
              <div className={`flex flex-col items-center justify-center rounded-xl border px-5 py-3 shrink-0 ${riskBg}`}
                   title={`Risk Score ${riskScore}/10 — driven by volatility (${analytics.volAnn.toFixed(0)}% ann. vol), RSI (${analytics.rsiVal.toFixed(1)}), Bollinger position, trend direction, and 52W range proximity`}>
                <Shield className={`w-4 h-4 mb-1 ${riskColor}`} />
                <span className={`text-3xl font-bold tabular-nums ${riskColor}`}
                      style={{ fontFamily: "var(--font-display)" }}>
                  {riskScore}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5">Risk Score</span>
                <span className={`text-xs font-semibold mt-0.5 ${riskColor}`}>{riskLabel}</span>
                <span className="text-xs text-muted-foreground/60 mt-1 text-center leading-tight max-w-[100px]" style={{ fontSize: "10px" }}>
                  Vol · RSI · BB · Trend · Range
                </span>
              </div>

              {/* Gauge */}
              {analytics.fair && (() => {
                const lo = Math.min(price, analytics.fair) * 0.8;
                const hi = Math.max(price, analytics.fair) * 1.2;
                const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
                return (
                  <div className="w-full sm:w-64 shrink-0">
                    <div className="relative h-2.5 bg-secondary rounded-full overflow-visible">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-400 opacity-20" />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-px h-5 bg-white/40 rounded-full"
                        style={{ left: `${pct(analytics.fair)}%` }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-background shadow-lg"
                        style={{
                          left: `calc(${pct(price)}% - 8px)`,
                          background: (upside ?? 0) > 0 ? "hsl(142,71%,45%)" : "hsl(0,72%,51%)",
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-2">
                      <span>Overvalued</span>
                      <span>FV ${fd(analytics.fair, 0)}</span>
                      <span>Undervalued</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── Price + trend chart ── */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                Price History + {forecastDays}-Day Trend Projection
              </h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Forecast window:</span>
                <span className="font-mono text-foreground font-semibold w-8">{forecastDays}d</span>
                <div className="w-24">
                  <Slider
                    min={5} max={60} step={5}
                    value={[forecastDays]}
                    onValueChange={([v]) => setForecastDays(v)}
                  />
                </div>
              </div>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.chartPts} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(185,80%,50%)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(185,80%,50%)" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,12%)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(0,0%,40%)" }}
                    axisLine={false} tickLine={false}
                    interval={Math.floor(analytics.chartPts.length / 8)}
                  />
                  <YAxis
                    tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+"k" : v.toFixed(0)}`}
                    tick={{ fontSize: 10, fill: "hsl(0,0%,40%)", fontFamily: "var(--font-mono)" }}
                    axisLine={false} tickLine={false} width={52}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl space-y-1">
                          <p className="text-muted-foreground font-medium">{label}</p>
                          {payload.map((p: any) => p.value != null && (
                            <p key={p.dataKey} style={{ color: p.color ?? "white" }} className="tabular-nums font-semibold">
                              {p.name}: ${fd(p.value)}
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  {analytics.fair && (
                    <ReferenceLine
                      y={analytics.fair}
                      stroke="hsl(185,80%,50%)"
                      strokeDasharray="5 3"
                      strokeWidth={1}
                      label={{ value: "FV", position: "right", fontSize: 10, fill: "hsl(185,80%,60%)" }}
                    />
                  )}
                  <ReferenceLine
                    y={analytics.vwapVal}
                    stroke="hsl(200,80%,55%)"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                  <Area
                    type="monotone"
                    dataKey="close"
                    name="Close"
                    stroke="hsl(185,80%,50%)"
                    strokeWidth={1.5}
                    fill="url(#priceGrad)"
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="trend"
                    name="Trend"
                    stroke="hsl(45,90%,55%)"
                    strokeWidth={1}
                    strokeDasharray="4 2"
                    dot={false}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[hsl(185,80%,50%)] inline-block" /> Price</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[hsl(45,90%,55%)] inline-block" style={{ borderTop: "1px dashed" }} /> Trend</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[hsl(200,80%,55%)] inline-block" /> VWAP</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[hsl(185,80%,50%)] inline-block" style={{ borderTop: "1px dashed" }} /> Fair Value</span>
            </div>
          </div>

          {/* ── Model bar chart ── */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <h2 className="text-sm font-semibold mb-4" style={{ fontFamily: "var(--font-display)" }}>
              Price vs. Valuation Models
            </h2>
            <div style={{ height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,12%)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "hsl(0,0%,45%)", fontFamily: "var(--font-mono)" }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+"k" : v.toFixed(0)}`}
                    tick={{ fontSize: 10, fill: "hsl(0,0%,45%)", fontFamily: "var(--font-mono)" }}
                    axisLine={false} tickLine={false} width={52}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0];
                      const pct = price > 0 && d.payload.name !== "Current"
                        ? (((d.value as number) - price) / price) * 100 : null;
                      return (
                        <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
                          <p className="font-semibold text-foreground mb-1">{d.payload.name}</p>
                          <p className="tabular-nums text-foreground">${fd(d.value as number)}</p>
                          {pct != null && (
                            <p className={`tabular-nums font-semibold ${pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {pct >= 0 ? "+" : ""}{pct.toFixed(1)}% vs current
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={price} stroke="hsl(0,0%,40%)" strokeDasharray="4 4" strokeWidth={1} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {barData.map((e, i) => (
                      <Cell key={i} fill={e.color} opacity={e.name === "Current" ? 0.4 : 0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              NEW: Bull / Base / Bear Scenarios
          ══════════════════════════════════════════════════════════════ */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                Scenarios
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Probabilistic price range from price channel analysis
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

              {/* Bull */}
              <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <span className="text-xs font-bold text-green-400 uppercase tracking-widest">Bull</span>
                </div>
                <p className="text-2xl font-bold font-mono tabular-nums text-green-400"
                   style={{ fontFamily: "var(--font-display)" }}>
                  ${fd(analytics.bullPrice)}
                </p>
                <div className={`mt-1.5 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400`}>
                  {analytics.bullUpside >= 0 ? "+" : ""}{analytics.bullUpside.toFixed(1)}% vs current
                </div>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  Based on upper price channel + momentum
                </p>
              </div>

              {/* Base */}
              <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Minus className="w-4 h-4 text-foreground/60" />
                  <span className="text-xs font-bold text-foreground/60 uppercase tracking-widest">Base</span>
                </div>
                <p className="text-2xl font-bold font-mono tabular-nums text-foreground"
                   style={{ fontFamily: "var(--font-display)" }}>
                  ${fd(analytics.basePrice)}
                </p>
                <div className={`mt-1.5 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  analytics.baseUpside >= 0 ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                }`}>
                  {analytics.baseUpside >= 0 ? "+" : ""}{analytics.baseUpside.toFixed(1)}% vs current
                </div>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  Composite of {analytics.models.length} quantitative models
                </p>
              </div>

              {/* Bear */}
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Bear</span>
                </div>
                <p className="text-2xl font-bold font-mono tabular-nums text-red-400"
                   style={{ fontFamily: "var(--font-display)" }}>
                  ${fd(analytics.bearPrice)}
                </p>
                <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                  {analytics.bearUpside >= 0 ? "+" : ""}{analytics.bearUpside.toFixed(1)}% vs current
                </div>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  Based on lower price channel under stress
                </p>
              </div>
            </div>
          </div>

          {/* ── Technicals + Returns grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Technical indicators */}
            <div className="rounded-xl bg-card border border-border/50 p-5 space-y-4">
              <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Technical Indicators</h2>

              {/* RSI gauge */}
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">RSI (14)</span>
                  <span className={`font-mono font-semibold ${
                    analytics.rsiVal > 70 ? "text-red-400" :
                    analytics.rsiVal < 30 ? "text-green-400" :
                    "text-foreground"
                  }`}>
                    {analytics.rsiVal.toFixed(1)}
                    {analytics.rsiVal > 70 ? " — Overbought" : analytics.rsiVal < 30 ? " — Oversold" : " — Neutral"}
                  </span>
                </div>
                <div className="relative h-2 bg-secondary rounded-full">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 opacity-30" />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-background"
                    style={{
                      left: `calc(${analytics.rsiVal}% - 6px)`,
                      background: analytics.rsiVal > 70 ? "hsl(0,72%,51%)" : analytics.rsiVal < 30 ? "hsl(142,71%,45%)" : "hsl(45,90%,55%)",
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1 opacity-60">
                  <span>0 Oversold</span><span>30</span><span>70</span><span>Overbought 100</span>
                </div>
              </div>

              {/* Bollinger position */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Bollinger Bands (20)</span>
                  <span className="font-mono font-semibold text-foreground text-xs">
                    {price > analytics.bbUpper ? "Above Upper" : price < analytics.bbLower ? "Below Lower" : "Within Bands"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { label: "Lower",  value: analytics.bbLower  },
                    { label: "Middle", value: analytics.bbMean   },
                    { label: "Upper",  value: analytics.bbUpper  },
                  ].map(b => (
                    <div key={b.label} className="text-center p-2 rounded-lg bg-secondary/30 border border-border/20">
                      <p className="text-xs text-muted-foreground mb-0.5">{b.label}</p>
                      <p className="text-xs font-bold font-mono tabular-nums text-foreground">${fd(b.value, 0)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Moving averages */}
              <div className="space-y-1.5 pt-2 border-t border-border/30">
                {[
                  { label: "SMA 20",  value: analytics.sma20  },
                  { label: "SMA 50",  value: analytics.sma50  },
                  { label: "SMA 200", value: analytics.sma200 },
                ].map(s => s.value != null && (
                  <div key={s.label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{s.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-foreground tabular-nums">${fd(s.value)}</span>
                      {price > s.value
                        ? <TrendingUp className="w-3 h-3 text-green-400" />
                        : <TrendingDown className="w-3 h-3 text-red-400" />
                      }
                      <span className={`tabular-nums font-semibold ${price > s.value ? "text-green-400" : "text-red-400"}`}>
                        {fp(((price - s.value) / s.value) * 100)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Returns + stats */}
            <div className="rounded-xl bg-card border border-border/50 p-5 space-y-4">
              <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Performance & Statistics</h2>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "1M Return",    value: analytics.ret1M },
                  { label: "3M Return",    value: analytics.ret3M },
                  { label: "6M Return",    value: analytics.ret6M },
                  { label: "1Y Return",    value: analytics.ret1Y },
                ].map(r => (
                  <div key={r.label} className="p-3 rounded-lg bg-secondary/30 border border-border/20">
                    <p className="text-xs text-muted-foreground mb-1">{r.label}</p>
                    <p className={`text-sm font-bold tabular-nums font-mono ${
                      r.value == null ? "text-muted-foreground" :
                      r.value >= 0 ? "text-green-400" : "text-red-400"
                    }`}>
                      {r.value == null ? "—" : fp(r.value)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-2 border-t border-border/30">
                {[
                  { label: "Annual Volatility",   value: `${analytics.volAnn.toFixed(1)}%` },
                  { label: "52W Range Position",  value: `${analytics.rangePos.toFixed(1)}%` },
                  { label: "52W High",            value: `$${fd(analytics.hi52)}` },
                  { label: "52W Low",             value: `$${fd(analytics.lo52)}` },
                  { label: "VWAP (1Y)",           value: `$${fd(analytics.vwapVal)}` },
                  { label: "Momentum Score",      value: `${analytics.mom >= 0 ? "+" : ""}${analytics.mom.toFixed(1)}` },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-mono font-semibold text-foreground tabular-nums">{s.value}</span>
                  </div>
                ))}
              </div>

              {/* Trend bar */}
              <div className="pt-2 border-t border-border/30">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Trend Strength</span>
                  <div className="flex items-center gap-1.5">
                    {analytics.trendUp
                      ? <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                      : <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    }
                    <span className={`font-semibold ${analytics.trendUp ? "text-green-400" : "text-red-400"}`}>
                      {analytics.trendUp ? "Uptrend" : "Downtrend"}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${analytics.trendUp ? "bg-green-400" : "bg-red-400"}`}
                    style={{ width: `${Math.min(100, analytics.trendStrength)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Methodology accordion ── */}
          <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
            <button
              onClick={() => setShowMethod(m => !m)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-secondary/20 transition-colors"
              data-testid="button-methodology"
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
                <p><strong className="text-foreground">Linear Trend (25%):</strong> Ordinary least-squares regression on the full 1Y price history, projected forward by the selected forecast window. Captures the stock's directional trajectory.</p>
                <p><strong className="text-foreground">Mean Reversion (20%):</strong> Weighted blend of the 1Y price mean (60%) and current price (40%), reflecting the statistical tendency of prices to revert toward their long-run average.</p>
                <p><strong className="text-foreground">VWAP (15%):</strong> Volume-weighted average price over the full 1-year window. Institutional traders treat VWAP as a key fair-value anchor — divergence from VWAP signals over- or under-extension.</p>
                <p><strong className="text-foreground">52W Midpoint (10%):</strong> The arithmetic midpoint of the 52-week high and low. Acts as a range-based fair value — useful for mean-reversion signals in trending markets.</p>
                <p><strong className="text-foreground">Momentum Target (10%):</strong> The regression target adjusted by a momentum score derived from 20/50/90/200-day returns, reflecting whether current price momentum supports or contradicts the trend.</p>
                <p><strong className="text-foreground">Graham Number (10%):</strong> Derived from Benjamin Graham's intrinsic value formula. PE estimate is inferred from annualised volatility (higher vol implies lower PE). Graham = √(22.5 × EPS × BVPS), where EPS = price ÷ PE_est and BVPS = price ÷ 2.5.</p>
                <p><strong className="text-foreground">Historical PE Mean Reversion (10%):</strong> Compares current price to the 1Y mean as a valuation signal. If price/mean &gt; 1.2 the stock appears stretched (target = mean × 1.1); if &lt; 0.8 it appears cheap (target = mean × 0.9); otherwise target = mean.</p>
                <p><strong className="text-foreground">Price Target Predictor:</strong> Uses OLS regression on the last 252 trading days, projected 30/60/90 days forward. Confidence bands are ±1 standard deviation of regression residuals, scaled by √(days/252) to represent uncertainty growth over time.</p>
                <p><strong className="text-foreground">Risk Score (1–10):</strong> Composite of five components — volatility (0–3), RSI position (0–2), Bollinger Band position (0–2), trend direction (0–2), and 52W range proximity (0–1). Higher = riskier.</p>
                <p><strong className="text-foreground">Scenarios:</strong> Bull uses the 75th percentile of the last 90-day price range, amplified by a momentum multiplier. Bear uses the 25th percentile under a volatility stress factor. Base is the composite fair value.</p>
                <p><strong className="text-foreground">Data source:</strong> All models use only Veridian's own live price history and quote data — no external APIs, no rate limits, no downtime risk. For research purposes only — not financial advice.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
