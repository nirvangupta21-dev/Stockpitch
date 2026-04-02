import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ScatterChart, Scatter, ZAxis,
} from "recharts";
import { Activity, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Info } from "lucide-react";

// ─── Bubble risk scoring engine ───────────────────────────────────────────────
// Pulls market overview data and scores each sector for bubble risk

interface SectorRisk {
  sector: string;
  etf: string;
  valuationRisk: number;    // 0-100
  momentumRisk: number;     // 0-100
  concentrationRisk: number;// 0-100
  liquidityRisk: number;    // 0-100
  sentimentRisk: number;    // 0-100
  overallRisk: number;      // 0-100
  changePct: number;
  price: number;
  verdict: "Bubble" | "Elevated" | "Neutral" | "Undervalued";
  color: string;
}

interface MarketOverviewData {
  sectors: {
    name: string;
    symbol: string;
    changePct: number;
    price: number;
    spark: number[];
  }[];
}

// Known valuation reference data (sector historical P/E medians vs current estimates)
const SECTOR_FUNDAMENTALS: Record<string, {
  histPE: number; estPE: number; ytdReturn: number;
  concentration: number; description: string;
}> = {
  "Technology":           { histPE: 22, estPE: 31, ytdReturn: 8.2,  concentration: 88, description: "AI capex cycle and mega-cap concentration driving elevated multiples." },
  "Financials":           { histPE: 13, estPE: 15, ytdReturn: 3.1,  concentration: 42, description: "Rate sensitivity and credit cycle concerns — moderately priced." },
  "Health Care":          { histPE: 17, estPE: 19, ytdReturn: -1.2, concentration: 38, description: "Drug pricing headwinds offset by GLP-1 tailwinds. Selective value." },
  "Energy":               { histPE: 11, estPE: 13, ytdReturn: 5.8,  concentration: 35, description: "Geopolitical premium baked in. Supply discipline supporting prices." },
  "Industrials":          { histPE: 18, estPE: 21, ytdReturn: 4.6,  concentration: 29, description: "Reshoring and infrastructure spending driving re-rating." },
  "Comm. Services":       { histPE: 19, estPE: 24, ytdReturn: 6.1,  concentration: 72, description: "Digital advertising recovery + streaming profitability driving growth." },
  "Cons. Discretionary":  { histPE: 22, estPE: 26, ytdReturn: 2.3,  concentration: 55, description: "Consumer resilience fading. Student loans and credit stress building." },
  "Cons. Staples":        { histPE: 19, estPE: 20, ytdReturn: 1.4,  concentration: 31, description: "Defensive positioning near fair value. Volume recovery slow." },
  "Materials":            { histPE: 14, estPE: 16, ytdReturn: 3.7,  concentration: 22, description: "Commodity supercycle narrative moderated. China demand uncertain." },
  "Real Estate":          { histPE: 36, estPE: 38, ytdReturn: -3.1, concentration: 24, description: "Rate sensitivity weighing heavily. Office exposure a drag." },
  "Utilities":            { histPE: 17, estPE: 20, ytdReturn: 3.9,  concentration: 18, description: "AI power demand narrative boosting valuations vs historical norms." },
};

function scoreSector(name: string, changePct: number, price: number, spark: number[]): SectorRisk {
  const fund = SECTOR_FUNDAMENTALS[name] || { histPE: 18, estPE: 20, ytdReturn: 0, concentration: 30, description: "" };

  // Valuation risk: how stretched vs historical P/E
  const peStretch = ((fund.estPE - fund.histPE) / fund.histPE) * 100;
  const valuationRisk = Math.min(100, Math.max(0, 30 + peStretch * 1.8));

  // Momentum risk: how fast it's been running
  const momentum = spark.length >= 2
    ? ((spark[spark.length - 1] - spark[0]) / spark[0]) * 100
    : fund.ytdReturn;
  const momentumRisk = Math.min(100, Math.max(0, 40 + momentum * 3));

  // Concentration risk: top holdings domination
  const concentrationRisk = Math.min(100, fund.concentration);

  // Liquidity risk: inverse of sector size proxy
  const liquidityRisk = Math.min(100, Math.max(10, 60 - fund.concentration * 0.3));

  // Sentiment risk: based on recent daily move
  const sentimentRisk = Math.min(100, Math.max(0, 50 + changePct * 8));

  const overallRisk = Math.round(
    valuationRisk * 0.30 +
    momentumRisk  * 0.25 +
    concentrationRisk * 0.20 +
    liquidityRisk * 0.10 +
    sentimentRisk * 0.15
  );

  const verdict: SectorRisk["verdict"] =
    overallRisk >= 72 ? "Bubble" :
    overallRisk >= 55 ? "Elevated" :
    overallRisk >= 35 ? "Neutral" : "Undervalued";

  const color =
    verdict === "Bubble"     ? "hsl(0,72%,51%)" :
    verdict === "Elevated"   ? "hsl(45,90%,55%)" :
    verdict === "Neutral"    ? "hsl(210,70%,60%)" :
                               "hsl(142,71%,45%)";

  return {
    sector: name, etf: "", changePct, price,
    valuationRisk: Math.round(valuationRisk),
    momentumRisk: Math.round(momentumRisk),
    concentrationRisk: Math.round(concentrationRisk),
    liquidityRisk: Math.round(liquidityRisk),
    sentimentRisk: Math.round(sentimentRisk),
    overallRisk, verdict, color,
  };
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function CustomRadarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="font-bold text-foreground">{payload[0]?.payload?.sector}</p>
      <p className="text-muted-foreground">Risk Score: <span className="text-foreground font-semibold">{payload[0]?.value}</span></p>
    </div>
  );
}

function RiskBadge({ verdict }: { verdict: SectorRisk["verdict"] }) {
  const cfg = {
    Bubble:     "bg-red-500/15 border-red-500/25 text-red-400",
    Elevated:   "bg-yellow-500/15 border-yellow-500/25 text-yellow-400",
    Neutral:    "bg-blue-500/15 border-blue-500/25 text-blue-400",
    Undervalued:"bg-green-500/15 border-green-500/25 text-green-400",
  }[verdict];
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${cfg}`}>{verdict}</span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BubbleAnalysis() {
  const [selected, setSelected] = useState<string | null>(null);

  const { data: overview, isLoading, refetch } = useQuery<MarketOverviewData>({
    queryKey: ["/api/market/overview"],
    queryFn: () => apiRequest("GET", "/api/market/overview").then(r => r.json()),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const sectors: SectorRisk[] = (overview?.sectors ?? []).map(s =>
    scoreSector(s.name, s.changePct, s.price, s.spark)
  );

  // Sort by risk descending
  const ranked = [...sectors].sort((a, b) => b.overallRisk - a.overallRisk);
  const selectedSector = selected ? sectors.find(s => s.sector === selected) : ranked[0];

  // Kiviat (radar) data — all sectors
  const kiviatData = sectors.map(s => ({
    sector: s.sector.length > 14 ? s.sector.slice(0, 13) + "…" : s.sector,
    fullName: s.sector,
    risk: s.overallRisk,
    fill: s.color,
  }));

  // Multi-axis radar for selected sector
  const selectedRadarData = selectedSector ? [
    { axis: "Valuation",     value: selectedSector.valuationRisk },
    { axis: "Momentum",      value: selectedSector.momentumRisk },
    { axis: "Concentration", value: selectedSector.concentrationRisk },
    { axis: "Liquidity",     value: selectedSector.liquidityRisk },
    { axis: "Sentiment",     value: selectedSector.sentimentRisk },
  ] : [];

  // Market breadth stats
  const bubbleCount    = sectors.filter(s => s.verdict === "Bubble").length;
  const elevatedCount  = sectors.filter(s => s.verdict === "Elevated").length;
  const neutralCount   = sectors.filter(s => s.verdict === "Neutral").length;
  const avgRisk        = sectors.length ? Math.round(sectors.reduce((s, x) => s + x.overallRisk, 0) / sectors.length) : 0;
  const marketVerdict  = avgRisk >= 65 ? "High Risk" : avgRisk >= 50 ? "Elevated Risk" : avgRisk >= 35 ? "Moderate Risk" : "Low Risk";
  const marketVerdictColor = avgRisk >= 65 ? "text-red-400" : avgRisk >= 50 ? "text-yellow-400" : avgRisk >= 35 ? "text-blue-400" : "text-green-400";

  const fund = selectedSector ? SECTOR_FUNDAMENTALS[selectedSector.sector] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-foreground" />
          <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>Bubble Analysis</h1>
          <span className="text-xs text-muted-foreground">Market risk scoring across all S&P 500 sectors</span>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />Refresh
        </button>
      </div>

      {/* Market summary KPIs */}
      {!isLoading && sectors.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Market Risk", value: marketVerdict, color: marketVerdictColor },
            { label: "Avg Risk Score", value: `${avgRisk}/100`, color: marketVerdictColor },
            { label: "Bubble Zones", value: bubbleCount, color: "text-red-400" },
            { label: "Elevated Zones", value: elevatedCount, color: "text-yellow-400" },
            { label: "Neutral / Safe", value: neutralCount, color: "text-blue-400" },
          ].map(k => (
            <div key={k.label} className="rounded-xl bg-card border border-border/50 px-4 py-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums mt-0.5 ${k.color}`} style={{ fontFamily: "var(--font-display)" }}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="skeleton h-48 rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* ── Main Kiviat Diagram ─────────────────────────────────────── */}
          <div className="rounded-xl bg-card border border-border/50 p-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  Market Bubble Risk — Sector Kiviat
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Composite risk score 0–100 per sector · Click a sector below to drill down
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {[
                  { label: "Bubble", color: "bg-red-500" },
                  { label: "Elevated", color: "bg-yellow-400" },
                  { label: "Neutral", color: "bg-blue-500" },
                  { label: "Undervalued", color: "bg-green-500" },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={kiviatData} margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
                  <PolarGrid stroke="hsl(0 0% 18%)" />
                  <PolarAngleAxis
                    dataKey="sector"
                    tick={{ fontSize: 11, fill: "hsl(0 0% 55%)", fontFamily: "var(--font-mono)" }}
                    tickLine={false}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fontSize: 9, fill: "hsl(0 0% 35%)" }}
                    tickCount={5}
                    stroke="hsl(0 0% 18%)"
                  />
                  <Radar
                    dataKey="risk"
                    stroke="hsl(0 0% 80%)"
                    fill="hsl(0 0% 80%)"
                    fillOpacity={0.08}
                    strokeWidth={1.5}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      const s = sectors.find(x => x.sector === payload.fullName);
                      return (
                        <circle
                          key={payload.sector}
                          cx={cx} cy={cy} r={6}
                          fill={s?.color || "white"}
                          stroke="hsl(0 0% 10%)"
                          strokeWidth={1.5}
                          style={{ cursor: "pointer" }}
                          onClick={() => setSelected(payload.fullName)}
                        />
                      );
                    }}
                  />
                  <Tooltip content={<CustomRadarTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Sector dot selector */}
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {ranked.map(s => (
                <button
                  key={s.sector}
                  onClick={() => setSelected(s.sector === selected ? null : s.sector)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                    selected === s.sector || (!selected && s.sector === ranked[0].sector)
                      ? "border-white/30 bg-white/8"
                      : "border-border/40 hover:border-border/70"
                  }`}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-muted-foreground">{s.sector}</span>
                  <span className="font-mono text-foreground">{s.overallRisk}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Drill-down for selected sector ─────────────────────────── */}
          {selectedSector && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* 5-axis breakdown radar */}
              <div className="rounded-xl bg-card border border-border/50 p-5">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                      {selectedSector.sector} — Risk Breakdown
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <RiskBadge verdict={selectedSector.verdict} />
                      <span className="text-xs text-muted-foreground">Overall: <span className="font-mono text-foreground font-bold">{selectedSector.overallRisk}/100</span></span>
                    </div>
                  </div>
                </div>
                {fund && (
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2 mb-3 border-l-2 border-border pl-3">{fund.description}</p>
                )}
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={selectedRadarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                      <PolarGrid stroke="hsl(0 0% 18%)" />
                      <PolarAngleAxis
                        dataKey="axis"
                        tick={{ fontSize: 11, fill: "hsl(0 0% 55%)" }}
                        tickLine={false}
                      />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} stroke="transparent" />
                      <Radar
                        dataKey="value"
                        stroke={selectedSector.color}
                        fill={selectedSector.color}
                        fillOpacity={0.2}
                        strokeWidth={2}
                        dot={{ r: 4, fill: selectedSector.color, stroke: "hsl(0 0% 7%)", strokeWidth: 1.5 }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-card border border-border rounded px-2 py-1 text-xs shadow-xl">
                              <p className="font-semibold">{payload[0]?.payload?.axis}</p>
                              <p style={{ color: selectedSector.color }}>{payload[0]?.value}/100</p>
                            </div>
                          );
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* 5 metric bars */}
                <div className="space-y-2 mt-1">
                  {[
                    { label: "Valuation Risk",     value: selectedSector.valuationRisk,     desc: "PE stretch vs historical median" },
                    { label: "Momentum Risk",       value: selectedSector.momentumRisk,       desc: "Recent price acceleration" },
                    { label: "Concentration Risk",  value: selectedSector.concentrationRisk,  desc: "Top holdings dominance" },
                    { label: "Liquidity Risk",      value: selectedSector.liquidityRisk,      desc: "Exit risk in stress scenario" },
                    { label: "Sentiment Risk",      value: selectedSector.sentimentRisk,      desc: "Crowd positioning & daily flows" },
                  ].map(m => (
                    <div key={m.label}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-muted-foreground">{m.label}</span>
                        <span className="font-mono font-semibold text-foreground">{m.value}</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${m.value}%`,
                            background: m.value >= 70 ? "hsl(0,72%,51%)" : m.value >= 50 ? "hsl(45,90%,55%)" : "hsl(210,70%,60%)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* All sectors ranked bar chart */}
              <div className="rounded-xl bg-card border border-border/50 p-5">
                <h3 className="text-sm font-semibold mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  All Sectors — Risk Ranking
                </h3>
                <p className="text-xs text-muted-foreground mb-4">Composite bubble risk score · Highest = most at risk</p>
                <div style={{ height: 340 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ranked} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 15%)" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(0 0% 40%)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="sector" tick={{ fontSize: 10, fill: "hsl(0 0% 55%)" }} axisLine={false} tickLine={false} width={120} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as SectorRisk;
                          return (
                            <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
                              <p className="font-bold text-foreground">{d.sector}</p>
                              <p style={{ color: d.color }}>Risk: {d.overallRisk}/100</p>
                              <p className="text-muted-foreground">{d.verdict}</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="overallRisk" radius={[0, 3, 3, 0]} onClick={(d: any) => setSelected(d.sector)}>
                        {ranked.map((s, i) => (
                          <Cell key={i} fill={s.color} opacity={selected === s.sector || (!selected && i === 0) ? 1 : 0.6} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ── Statistics table ────────────────────────────────────────── */}
          <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border/30">
              <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Sector Statistics</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Valuation, risk score, and market indicators across all sectors</p>
            </div>

            {/* Table header */}
            <div className="grid gap-3 px-4 py-2 bg-secondary/20 border-b border-border/20 text-xs text-muted-foreground font-semibold uppercase tracking-wider"
              style={{ gridTemplateColumns: "1.5fr 5rem 5rem 5rem 5rem 5rem 7rem" }}>
              <span>Sector</span>
              <span className="text-right">Today</span>
              <span className="text-right">Hist P/E</span>
              <span className="text-right">Est P/E</span>
              <span className="text-right">Stretch</span>
              <span className="text-right">Risk</span>
              <span>Verdict</span>
            </div>

            {ranked.map((s, i) => {
              const fund = SECTOR_FUNDAMENTALS[s.sector];
              const stretch = fund ? (((fund.estPE - fund.histPE) / fund.histPE) * 100).toFixed(0) : "—";
              return (
                <div
                  key={s.sector}
                  className={`grid gap-3 px-4 py-3 items-center border-b border-border/15 last:border-0 cursor-pointer transition-colors hover:bg-secondary/20 ${selected === s.sector ? "bg-white/4" : ""}`}
                  style={{ gridTemplateColumns: "1.5fr 5rem 5rem 5rem 5rem 5rem 7rem" }}
                  onClick={() => setSelected(s.sector === selected ? null : s.sector)}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-sm font-medium text-foreground">{s.sector}</span>
                  </div>
                  <span className={`text-sm tabular-nums font-mono text-right ${s.changePct >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                  </span>
                  <span className="text-sm tabular-nums font-mono text-right text-muted-foreground">{fund?.histPE ?? "—"}x</span>
                  <span className="text-sm tabular-nums font-mono text-right text-foreground">{fund?.estPE ?? "—"}x</span>
                  <span className={`text-sm tabular-nums font-mono text-right ${parseInt(stretch as string) > 15 ? "text-red-400" : parseInt(stretch as string) > 5 ? "text-yellow-400" : "text-green-400"}`}>
                    {stretch !== "—" ? `+${stretch}%` : "—"}
                  </span>
                  <span className="text-sm tabular-nums font-mono text-right font-bold" style={{ color: s.color }}>{s.overallRisk}</span>
                  <RiskBadge verdict={s.verdict} />
                </div>
              );
            })}
          </div>

          {/* Disclaimer */}
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-border/30 bg-secondary/20">
            <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Risk scores are algorithmic estimates based on valuation stretch, price momentum, sector concentration, and sentiment data. This is for research purposes only and does not constitute financial advice. Past market conditions do not guarantee future outcomes.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
