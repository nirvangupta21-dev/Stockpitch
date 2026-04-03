import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { fetchFundamentals, type Fundamentals } from "@/lib/fundamentals";
import type { QuoteData } from "./Dashboard";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine,
} from "recharts";
import { Scale, Info, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface _Fundamentals {
  revenueGrowthForward: number | null;
  earningsGrowthForward: number | null;
  revenueGrowthTTM: number | null;
  earningsGrowthTTM: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  returnOnEquity: number | null;
  freeCashFlow: number | null;
  operatingCashFlow: number | null;
  revenue: number | null;
  ebitda: number | null;
  netIncome: number | null;
  forwardPE: number | null;
  trailingPE: number | null;
  priceToBook: number | null;
  enterpriseValue: number | null;
  evToEbitda: number | null;
  evToRevenue: number | null;
  beta: number | null;
  sharesOutstanding: number | null;
  bookValuePerShare: number | null;
  dividendYield: number | null;
  targetMeanPrice: number | null;
  targetMedianPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  recommendationMean: number | null;
}

// ---------- helpers ----------
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

// ---------- DCF model ----------
function dcfFairValue(params: {
  freeCashFlow: number;
  growthRate: number;   // year 1-5 growth %
  terminalGrowth: number;
  discountRate: number;
  sharesOutstanding: number;
  netDebt: number;
}): number {
  const { freeCashFlow, growthRate, terminalGrowth, discountRate, sharesOutstanding, netDebt } = params;
  let pv = 0;
  let fcf = freeCashFlow;
  for (let y = 1; y <= 10; y++) {
    const rate = y <= 5 ? growthRate : ((growthRate + terminalGrowth) / 2);
    fcf = fcf * (1 + rate);
    pv += fcf / Math.pow(1 + discountRate, y);
  }
  // Terminal value
  const terminalFCF = fcf * (1 + terminalGrowth);
  const terminalValue = terminalFCF / (discountRate - terminalGrowth);
  const pvTerminal = terminalValue / Math.pow(1 + discountRate, 10);
  const intrinsicEV = pv + pvTerminal;
  const equity = intrinsicEV - netDebt;
  return Math.max(0, equity / sharesOutstanding);
}

// Sector-median multiples (conservative estimates)
const SECTOR_MEDIANS: Record<string, { pe: number; evEbitda: number; ps: number }> = {
  tech: { pe: 28, evEbitda: 22, ps: 6 },
  fintech: { pe: 22, evEbitda: 16, ps: 3 },
  healthcare: { pe: 20, evEbitda: 14, ps: 2.5 },
  consumer: { pe: 18, evEbitda: 12, ps: 1.8 },
  default: { pe: 20, evEbitda: 14, ps: 2.5 },
};

interface Props { ticker: string; }

export default function FairValue({ ticker }: Props) {
  // Controls for DCF
  const [growthRate, setGrowthRate] = useState(12);       // %
  const [terminalGrowth, setTerminalGrowth] = useState(3); // %
  const [discountRate, setDiscountRate] = useState(10);    // % (WACC)
  const [sectorKey, setSectorKey] = useState<keyof typeof SECTOR_MEDIANS>("default");
  const [showMethodology, setShowMethodology] = useState(false);

  const { data: quote, isLoading: qLoading, error: qError } = useQuery<QuoteData>({
    queryKey: ["/api/quote", ticker],
    queryFn: () => apiRequest("GET", `/api/quote/${ticker}`).then(r => r.json()),
    retry: 2,
  });

  // Fundamentals — fetched directly from Alpha Vantage in browser with memory cache
  const [fund, setFund] = useState<Fundamentals | null>(null);
  const [fLoading, setFLoading] = useState(false);
  const [fError, setFError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setFLoading(true);
    setFError(null);
    fetchFundamentals(ticker)
      .then(data => { setFund(data); setFLoading(false); })
      .catch(err => { setFError(err); setFLoading(false); });
  }, [ticker, retryCount]);

  const loading = qLoading || fLoading;
  const currentPrice = quote?.price ?? 0;

  // ---- DCF fair value ----
  const dcfValue = useMemo(() => {
    if (!fund?.freeCashFlow || !fund?.sharesOutstanding || fund.sharesOutstanding === 0) return null;
    const netDebt = (fund.enterpriseValue ?? 0) - (quote?.marketCap ?? 0);
    return dcfFairValue({
      freeCashFlow: fund.freeCashFlow,
      growthRate: growthRate / 100,
      terminalGrowth: terminalGrowth / 100,
      discountRate: discountRate / 100,
      sharesOutstanding: fund.sharesOutstanding,
      netDebt,
    });
  }, [fund, quote, growthRate, terminalGrowth, discountRate]);

  // ---- Comparables / multiples-based ----
  const medians = SECTOR_MEDIANS[sectorKey];

  // P/E based: sector median PE × EPS
  const eps = fund?.netIncome && fund?.sharesOutstanding ? fund.netIncome / fund.sharesOutstanding : null;
  const peValue = eps && eps > 0 ? medians.pe * eps : null;

  // EV/EBITDA based: (median × EBITDA - netDebt) / shares
  const netDebt = fund && quote ? (fund.enterpriseValue ?? 0) - (quote.marketCap ?? 0) : 0;
  const evEbitdaValue = fund?.ebitda && fund?.sharesOutstanding
    ? Math.max(0, (medians.evEbitda * fund.ebitda - netDebt) / fund.sharesOutstanding)
    : null;

  // P/S based
  const psValue = fund?.revenue && fund?.sharesOutstanding
    ? (medians.ps * fund.revenue) / fund.sharesOutstanding
    : null;

  // Analyst consensus
  const analystValue = fund?.targetMeanPrice ?? null;

  // Weighted composite fair value
  const models = [
    { label: "DCF", value: dcfValue, weight: 0.35, color: "hsl(185,80%,50%)" },
    { label: "P/E Comps", value: peValue, weight: 0.20, color: "hsl(265,70%,60%)" },
    { label: "EV/EBITDA", value: evEbitdaValue, weight: 0.20, color: "hsl(45,90%,55%)" },
    { label: "P/S Comps", value: psValue, weight: 0.10, color: "hsl(200,80%,60%)" },
    { label: "Analyst Target", value: analystValue, weight: 0.15, color: "hsl(142,71%,45%)" },
  ].filter(m => m.value !== null && m.value > 0);

  const totalWeight = models.reduce((s, m) => s + m.weight, 0);
  const compositeFairValue = totalWeight > 0
    ? models.reduce((s, m) => s + (m.value! * m.weight), 0) / totalWeight
    : null;

  // Mispricing
  const upside = compositeFairValue && currentPrice > 0
    ? ((compositeFairValue - currentPrice) / currentPrice) * 100
    : null;

  const mispricingLabel = upside === null ? "—"
    : upside > 25 ? "Significantly Undervalued"
    : upside > 10 ? "Moderately Undervalued"
    : upside > -10 ? "Fairly Valued"
    : upside > -25 ? "Moderately Overvalued"
    : "Significantly Overvalued";

  const mispricingColor = upside === null ? "text-muted-foreground"
    : upside > 10 ? "text-green-400"
    : upside > -10 ? "text-yellow-400"
    : "text-red-400";

  const mispricingBg = upside === null ? "bg-muted border-border"
    : upside > 10 ? "bg-green-500/10 border-green-500/25"
    : upside > -10 ? "bg-yellow-500/10 border-yellow-500/25"
    : "bg-red-500/10 border-red-500/25";

  // Chart data
  const barData = [
    { name: "Current", value: currentPrice, color: "hsl(210,10%,55%)" },
    ...models.map(m => ({ name: m.label, value: parseFloat((m.value!).toFixed(2)), color: m.color })),
    ...(compositeFairValue ? [{ name: "Fair Value", value: parseFloat(compositeFairValue.toFixed(2)), color: "hsl(185,80%,55%)" }] : []),
  ];

  // Gauge: position of current price relative to fair value range
  const gaugeMin = compositeFairValue ? Math.min(currentPrice, compositeFairValue) * 0.7 : 0;
  const gaugeMax = compositeFairValue ? Math.max(currentPrice, compositeFairValue) * 1.3 : 100;
  const gaugeCurrentPct = compositeFairValue ? Math.min(100, Math.max(0, ((currentPrice - gaugeMin) / (gaugeMax - gaugeMin)) * 100)) : 50;
  const gaugeFairPct = compositeFairValue ? Math.min(100, Math.max(0, ((compositeFairValue - gaugeMin) / (gaugeMax - gaugeMin)) * 100)) : 50;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Fair Value Analysis
          </h1>
          {quote && (
            <span className="text-sm font-mono font-bold text-primary">{quote.ticker}</span>
          )}
          {quote && (
            <span className="text-sm text-muted-foreground">{quote.name}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5" />
            <span>Multi-model valuation · Adjust assumptions below</span>
          </div>
          <button
            onClick={() => setRetryCount(c => c + 1)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="skeleton h-32 w-full rounded-xl" />)}
        </div>
      ) : qError ? (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          Could not load quote data. Try searching a different ticker.
        </div>
      ) : (
        <>
          {/* Mispricing verdict */}
          <div className={`rounded-xl border p-5 ${mispricingBg}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Verdict</p>
                <div className="flex items-baseline gap-3">
                  <span className={`text-2xl font-bold ${mispricingColor}`} style={{ fontFamily: "var(--font-display)" }}>
                    {mispricingLabel}
                  </span>
                  {upside !== null && (
                    <span className={`text-sm font-semibold tabular-nums ${mispricingColor}`}>
                      {upside >= 0 ? "+" : ""}{fmt(upside)}% vs fair value
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Current price <span className="text-foreground font-mono font-semibold">${fmt(currentPrice)}</span>
                  {compositeFairValue && (
                    <> · Composite fair value <span className="text-foreground font-mono font-semibold">${fmt(compositeFairValue)}</span></>
                  )}
                </p>
              </div>

              {/* Mispricing gauge */}
              {compositeFairValue && (
                <div className="w-full sm:w-72">
                  <div className="relative h-3 bg-secondary rounded-full overflow-visible">
                    {/* gradient track */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-400 opacity-30" />
                    {/* Fair value marker */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white/60 rounded-full"
                      style={{ left: `${gaugeFairPct}%` }}
                      title={`Fair Value: $${fmt(compositeFairValue)}`}
                    />
                    {/* Current price dot */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg"
                      style={{ left: `calc(${gaugeCurrentPct}% - 8px)`, background: upside! > 0 ? "hsl(142,71%,45%)" : "hsl(0,72%,51%)" }}
                      title={`Current: $${fmt(currentPrice)}`}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                    <span>Overvalued</span>
                    <span className="text-white/50">Fair Value ${fmt(compositeFairValue, 0)}</span>
                    <span>Undervalued</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Model comparison bar chart */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <h2 className="text-sm font-semibold mb-4" style={{ fontFamily: "var(--font-display)" }}>
              Price vs. Valuation Models
            </h2>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,18%)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(210,10%,50%)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+"k" : v.toFixed(0)}`} tick={{ fontSize: 11, fill: "hsl(210,10%,50%)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0];
                      return (
                        <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
                          <p className="font-semibold text-foreground">{d.name}</p>
                          <p className="tabular-nums text-primary">${fmt(d.value as number)}</p>
                          {currentPrice > 0 && d.name !== "Current" && (
                            <p className={`tabular-nums font-semibold ${(d.value as number) > currentPrice ? "text-green-400" : "text-red-400"}`}>
                              {(d.value as number) > currentPrice ? "+" : ""}{(((d.value as number) - currentPrice) / currentPrice * 100).toFixed(1)}% vs current
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={currentPrice} stroke="hsl(210,15%,45%)" strokeDasharray="4 4" strokeWidth={1} label={{ value: "Current", position: "right", fontSize: 10, fill: "hsl(210,10%,50%)" }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} opacity={entry.name === "Current" ? 0.5 : 0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Model detail cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* DCF assumptions */}
            <div className="rounded-xl bg-card border border-border/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  DCF Model
                </h2>
                {dcfValue && (
                  <span className="text-sm font-mono font-bold text-primary tabular-nums">${fmt(dcfValue)}</span>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Revenue Growth (Yr 1–5)</span>
                    <span className="font-mono text-foreground font-semibold">{growthRate}%</span>
                  </div>
                  <Slider min={-10} max={60} step={1} value={[growthRate]} onValueChange={([v]) => setGrowthRate(v)} />
                  {fund?.revenueGrowthForward != null && (
                    <p className="text-xs text-muted-foreground mt-1">Analyst estimate: {fmtPct(fund.revenueGrowthForward)}</p>
                  )}
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Terminal Growth Rate</span>
                    <span className="font-mono text-foreground font-semibold">{terminalGrowth}%</span>
                  </div>
                  <Slider min={0} max={6} step={0.5} value={[terminalGrowth]} onValueChange={([v]) => setTerminalGrowth(v)} />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Discount Rate (WACC)</span>
                    <span className="font-mono text-foreground font-semibold">{discountRate}%</span>
                  </div>
                  <Slider min={6} max={20} step={0.5} value={[discountRate]} onValueChange={([v]) => setDiscountRate(v)} />
                  {fund?.beta != null && (
                    <p className="text-xs text-muted-foreground mt-1">Beta: {fmt(fund.beta)} — higher beta warrants higher WACC</p>
                  )}
                </div>
              </div>

              {/* Key DCF inputs */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
                {[
                  { label: "Free Cash Flow", value: fmtB(fund?.freeCashFlow) },
                  { label: "Revenue", value: fmtB(fund?.revenue) },
                  { label: "EBITDA", value: fmtB(fund?.ebitda) },
                  { label: "Shares Out.", value: fund?.sharesOutstanding ? `${(fund.sharesOutstanding / 1e9).toFixed(2)}B` : "—" },
                ].map(m => (
                  <div key={m.label} className="text-xs">
                    <p className="text-muted-foreground">{m.label}</p>
                    <p className="font-mono font-semibold text-foreground tabular-nums">{m.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Comparables */}
            <div className="rounded-xl bg-card border border-border/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  Comparables Model
                </h2>
              </div>

              {/* Sector selector */}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Sector Peer Medians</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(SECTOR_MEDIANS) as (keyof typeof SECTOR_MEDIANS)[]).map(s => (
                    <button
                      key={s}
                      data-testid={`button-sector-${s}`}
                      onClick={() => setSectorKey(s)}
                      className={`px-2.5 py-1 text-xs rounded-lg border font-medium capitalize transition-all ${
                        sectorKey === s
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Per-model values */}
              <div className="space-y-3">
                {[
                  {
                    label: "P/E Based",
                    value: peValue,
                    multiple: `${medians.pe}x PE`,
                    input: eps ? `EPS $${fmt(eps)}` : null,
                    color: "hsl(265,70%,60%)",
                  },
                  {
                    label: "EV/EBITDA Based",
                    value: evEbitdaValue,
                    multiple: `${medians.evEbitda}x EV/EBITDA`,
                    input: fund?.ebitda ? `EBITDA ${fmtB(fund.ebitda)}` : null,
                    color: "hsl(45,90%,55%)",
                  },
                  {
                    label: "Price/Sales Based",
                    value: psValue,
                    multiple: `${medians.ps}x P/S`,
                    input: fund?.revenue ? `Revenue ${fmtB(fund.revenue)}` : null,
                    color: "hsl(200,80%,60%)",
                  },
                ].map(m => (
                  <div key={m.label} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div>
                      <p className="text-xs font-semibold text-foreground">{m.label}</p>
                      <p className="text-xs text-muted-foreground">{m.multiple}{m.input ? ` · ${m.input}` : ""}</p>
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

              {/* Analyst consensus */}
              {fund?.targetMeanPrice && (
                <div className="pt-3 border-t border-border/40">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Analyst Consensus</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Low", value: fund.targetLowPrice },
                      { label: "Mean", value: fund.targetMeanPrice },
                      { label: "High", value: fund.targetHighPrice },
                    ].map(t => (
                      <div key={t.label} className="text-center p-2 rounded-lg bg-secondary/50">
                        <p className="text-xs text-muted-foreground">{t.label}</p>
                        <p className="text-sm font-bold font-mono tabular-nums text-green-400">{t.value ? `$${fmt(t.value)}` : "—"}</p>
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
                { label: "Gross Margin", value: fmtPct(fund?.grossMargin) },
                { label: "Operating Margin", value: fmtPct(fund?.operatingMargin) },
                { label: "Net Margin", value: fmtPct(fund?.netMargin) },
                { label: "ROE", value: fmtPct(fund?.returnOnEquity) },
                { label: "Forward P/E", value: fund?.forwardPE ? `${fmt(fund.forwardPE)}x` : "—" },
                { label: "EV/EBITDA", value: fund?.evToEbitda ? `${fmt(fund.evToEbitda)}x` : "—" },
                { label: "EV/Revenue", value: fund?.evToRevenue ? `${fmt(fund.evToRevenue)}x` : "—" },
                { label: "P/Book", value: fund?.priceToBook ? `${fmt(fund.priceToBook)}x` : "—" },
                { label: "Beta", value: fund?.beta ? fmt(fund.beta) : "—" },
                { label: "Rev. Growth", value: fmtPct(fund?.revenueGrowthTTM) },
                { label: "Div. Yield", value: fmtPct(fund?.dividendYield) },
                { label: "Free Cash Flow", value: fmtB(fund?.freeCashFlow) },
              ].map(m => (
                <div key={m.label}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{m.label}</p>
                  <p className="text-sm font-semibold font-mono tabular-nums text-foreground">{m.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Methodology toggle */}
          <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
            <button
              onClick={() => setShowMethodology(m => !m)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-secondary/40 transition-colors"
            >
              <span className="text-xs text-muted-foreground font-medium">How are these valuations calculated?</span>
              {showMethodology ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showMethodology && (
              <div className="px-5 pb-5 border-t border-border/30 pt-4 text-xs text-muted-foreground space-y-2 leading-relaxed">
                <p><strong className="text-foreground">DCF (35% weight):</strong> Projects free cash flow forward 10 years using your growth and WACC assumptions. Terminal value uses the Gordon Growth Model. Intrinsic equity value is divided by shares outstanding.</p>
                <p><strong className="text-foreground">P/E Comps (20%):</strong> Applies the sector-median P/E multiple to the company's trailing EPS to derive a peer-relative fair price.</p>
                <p><strong className="text-foreground">EV/EBITDA (20%):</strong> Applies the sector-median EV/EBITDA multiple to EBITDA, subtracts net debt, and divides by shares to get an implied per-share value.</p>
                <p><strong className="text-foreground">P/S Comps (10%):</strong> Applies the sector-median Price/Sales multiple to revenue per share — useful when earnings are negative or lumpy.</p>
                <p><strong className="text-foreground">Analyst Target (15%):</strong> The sell-side consensus mean price target from recent analyst ratings.</p>
                <p><strong className="text-foreground">Composite:</strong> Weighted average of all available models. Not financial advice — models are only as good as their assumptions.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
