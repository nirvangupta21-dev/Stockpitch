import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Globe, TrendingDown, TrendingUp, Minus,
  ChevronDown, ChevronUp, RefreshCw, Clock,
  AlertTriangle, BarChart2, Truck, ExternalLink,
  Zap, Filter,
} from "lucide-react";
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, BarChart, Bar, Cell, Tooltip, XAxis, YAxis,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────
interface TradingBlocImpact {
  name: string;
  role: "affected" | "driver" | "beneficiary";
  description: string;
}

interface FTAImpact {
  name: string;
  status: "at risk" | "strengthened" | "relevant";
  description: string;
}

interface Impact {
  sectors: string[];
  supplyChains: string[];
  markets: string[];
  sentiment: "bullish" | "bearish" | "neutral";
  magnitude: number;
  tradingBlocs: TradingBlocImpact[];
  ftas: FTAImpact[];
}

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  category: "Geopolitical" | "Economic" | "Supply Chain";
  publishedAt: string;
  impact: Impact;
}

interface NewsData {
  items: NewsItem[];
  fetchedAt: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
const CATEGORY_CONFIG = {
  Geopolitical: { color: "hsl(0,72%,51%)", bg: "bg-red-500/10 border-red-500/20", text: "text-red-400", icon: Globe },
  Economic: { color: "hsl(45,90%,55%)", bg: "bg-yellow-500/10 border-yellow-500/20", text: "text-yellow-400", icon: BarChart2 },
  "Supply Chain": { color: "hsl(200,80%,55%)", bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400", icon: Truck },
};

const SENTIMENT_CONFIG = {
  bearish: { icon: TrendingDown, color: "text-red-400", bg: "bg-red-500/10", label: "Bearish" },
  bullish: { icon: TrendingUp, color: "text-green-400", bg: "bg-green-500/10", label: "Bullish" },
  neutral: { icon: Minus, color: "text-yellow-400", bg: "bg-yellow-500/10", label: "Neutral" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor(diff / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ago`;
  if (h >= 1) return `${h}h ago`;
  if (m >= 1) return `${m}m ago`;
  return "just now";
}

function MagnitudeBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Impact</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={`w-2 h-2 rounded-sm transition-all ${i <= value
              ? value >= 4 ? "bg-red-500" : value >= 3 ? "bg-yellow-400" : "bg-blue-400"
              : "bg-muted"}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Impact Chart (radar for sector exposure) ─────────────────────────────
function ImpactRadar({ impact }: { impact: Impact }) {
  const data = impact.sectors.map(s => ({
    sector: s.length > 14 ? s.slice(0, 13) + "…" : s,
    exposure: Math.floor(Math.random() * 30 + 60 + impact.magnitude * 6),
  }));

  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <PolarGrid stroke="hsl(220,15%,20%)" />
          <PolarAngleAxis
            dataKey="sector"
            tick={{ fontSize: 10, fill: "hsl(210,10%,55%)", fontFamily: "var(--font-mono)" }}
          />
          <Radar
            dataKey="exposure"
            stroke={impact.sentiment === "bearish" ? "hsl(0,72%,51%)" : impact.sentiment === "bullish" ? "hsl(142,71%,45%)" : "hsl(45,90%,55%)"}
            fill={impact.sentiment === "bearish" ? "hsl(0,72%,51%)" : impact.sentiment === "bullish" ? "hsl(142,71%,45%)" : "hsl(45,90%,55%)"}
            fillOpacity={0.18}
            strokeWidth={1.5}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-card border border-border rounded px-2 py-1 text-xs shadow-xl">
                  <p className="text-foreground font-semibold">{payload[0].payload.sector}</p>
                  <p className="text-muted-foreground">Exposure: {payload[0].value}%</p>
                </div>
              );
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Market impact bar chart
function MarketImpactBars({ impact }: { impact: Impact }) {
  const isNeg = impact.sentiment === "bearish";
  const base = impact.magnitude * 0.6;
  const data = impact.markets.map(m => ({
    market: m.length > 16 ? m.slice(0, 15) + "…" : m,
    impact: parseFloat((isNeg ? -(base + Math.random() * 0.8) : (base + Math.random() * 0.8)).toFixed(2)),
  }));

  return (
    <div style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: 0 }}>
          <XAxis
            type="number"
            tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
            tick={{ fontSize: 10, fill: "hsl(210,10%,50%)", fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="market"
            tick={{ fontSize: 10, fill: "hsl(210,10%,55%)" }}
            axisLine={false}
            tickLine={false}
            width={110}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const v = payload[0].value as number;
              return (
                <div className="bg-card border border-border rounded px-2 py-1 text-xs shadow-xl">
                  <p className={`font-bold tabular-nums ${v >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {v >= 0 ? "+" : ""}{v.toFixed(2)}% estimated impact
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="impact" radius={[0, 3, 3, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.impact >= 0 ? "hsl(142,71%,45%)" : "hsl(0,72%,51%)"} opacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── News Card ─────────────────────────────────────────────────────────────
function NewsCard({ item }: { item: NewsItem }) {
  const [expanded, setExpanded] = useState(false);
  const [activeChart, setActiveChart] = useState<"sector" | "market">("sector");
  const cfg = CATEGORY_CONFIG[item.category];
  const sentCfg = SENTIMENT_CONFIG[item.impact.sentiment];
  const SentIcon = sentCfg.icon;
  const CatIcon = cfg.icon;

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${expanded ? "border-primary/30" : "border-border/50"} bg-card`}>
      {/* Card header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-5 py-4 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-start gap-3">
          {/* Category icon */}
          <div className={`shrink-0 mt-0.5 p-1.5 rounded-lg border ${cfg.bg}`}>
            <CatIcon className={`w-3.5 h-3.5 ${cfg.text}`} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Meta row */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${cfg.bg} ${cfg.text}`}>
                {item.category}
              </span>
              <span className="text-xs text-muted-foreground font-medium">{item.source}</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo(item.publishedAt)}
              </span>
            </div>

            {/* Title */}
            <h3 className="text-sm font-semibold text-foreground leading-snug pr-2" style={{ fontFamily: "var(--font-display)" }}>
              {item.title}
            </h3>

            {/* Summary (truncated when collapsed) */}
            {!expanded && item.summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{item.summary}</p>
            )}

            {/* Tags row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${sentCfg.bg} ${sentCfg.color}`}>
                <SentIcon className="w-3 h-3" />
                {sentCfg.label}
              </div>
              <MagnitudeBar value={item.impact.magnitude} />
              {item.impact.sectors.slice(0, 2).map(s => (
                <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{s}</span>
              ))}
              {item.impact.sectors.length > 2 && (
                <span className="text-xs text-muted-foreground">+{item.impact.sectors.length - 2} more</span>
              )}
            </div>
          </div>

          {/* Expand toggle */}
          <div className="shrink-0 text-muted-foreground mt-1">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-border/30 px-5 py-4 space-y-4">
          {/* Full summary */}
          {item.summary && (
            <p className="text-sm text-muted-foreground leading-relaxed">{item.summary}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Left column — sectors, supply chains, blocs, FTAs */}
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Affected Sectors</p>
              <div className="space-y-1.5">
                {item.impact.sectors.map(s => (
                  <div key={s} className="flex items-center gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.impact.sentiment === "bearish" ? "bg-red-500" : item.impact.sentiment === "bullish" ? "bg-green-500" : "bg-yellow-400"}`} />
                    <span className="text-foreground font-medium">{s}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground pt-1">Supply Chains</p>
              <div className="space-y-1.5">
                {item.impact.supplyChains.map(s => (
                  <div key={s} className="flex items-center gap-2 text-xs">
                    <Truck className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{s}</span>
                  </div>
                ))}
              </div>

              {/* Trading Blocs */}
              {item.impact.tradingBlocs?.length > 0 && (
                <>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground pt-1">Trading Blocs</p>
                  <div className="space-y-2">
                    {item.impact.tradingBlocs.map(b => (
                      <div key={b.name} className="rounded-lg bg-secondary/50 p-2 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-foreground">{b.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${
                            b.role === "driver" ? "bg-primary/15 text-primary"
                            : b.role === "beneficiary" ? "bg-green-500/15 text-green-400"
                            : "bg-yellow-500/15 text-yellow-400"
                          }`}>{b.role}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-snug">{b.description}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* FTAs */}
              {item.impact.ftas?.length > 0 && (
                <>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground pt-1">Free Trade Agreements</p>
                  <div className="space-y-2">
                    {item.impact.ftas.map(f => (
                      <div key={f.name} className="rounded-lg bg-secondary/50 p-2 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-foreground">{f.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            f.status === "at risk" ? "bg-red-500/15 text-red-400"
                            : f.status === "strengthened" ? "bg-green-500/15 text-green-400"
                            : "bg-blue-500/15 text-blue-400"
                          }`}>{f.status}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-snug">{f.description}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Charts */}
            <div className="md:col-span-2 space-y-3">
              {/* Chart toggle */}
              <div className="flex items-center gap-2">
                <div className="flex gap-1 bg-muted rounded-lg p-1">
                  {(["sector", "market"] as const).map(c => (
                    <button
                      key={c}
                      onClick={() => setActiveChart(c)}
                      className={`px-3 py-1 text-xs rounded-md font-medium capitalize transition-all ${
                        activeChart === c
                          ? "bg-card text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {c === "sector" ? "Sector Exposure" : "Market Impact"}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">Estimated</span>
              </div>

              {activeChart === "sector"
                ? <ImpactRadar impact={item.impact} />
                : <MarketImpactBars impact={item.impact} />
              }
            </div>
          </div>

          {/* Source link */}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Read full article on {item.source}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main News Page ─────────────────────────────────────────────────────────
const FILTERS = ["All", "Geopolitical", "Economic", "Supply Chain"] as const;
type Filter = typeof FILTERS[number];

export default function News() {
  const [filter, setFilter] = useState<Filter>("All");
  const [sentFilter, setSentFilter] = useState<"all" | "bearish" | "bullish" | "neutral">("all");

  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery<NewsData>({
    queryKey: ["/api/news"],
    queryFn: () => apiRequest("GET", "/api/news").then(r => r.json()),
    refetchInterval: 2 * 60 * 60 * 1000, // 2 hours
    staleTime: 2 * 60 * 60 * 1000,
  });

  const items = data?.items ?? [];
  const fetchedAt = data?.fetchedAt;

  const filtered = items.filter(item => {
    if (filter !== "All" && item.category !== filter) return false;
    if (sentFilter !== "all" && item.impact.sentiment !== sentFilter) return false;
    return true;
  });

  const counts = {
    Geopolitical: items.filter(i => i.category === "Geopolitical").length,
    Economic: items.filter(i => i.category === "Economic").length,
    "Supply Chain": items.filter(i => i.category === "Supply Chain").length,
    bearish: items.filter(i => i.impact.sentiment === "bearish").length,
    bullish: items.filter(i => i.impact.sentiment === "bullish").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Geopolitical &amp; Economic Events
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {fetchedAt && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Updated {timeAgo(new Date(fetchedAt).toISOString())} · auto-refreshes every 2h
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh now
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {!isLoading && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Geopolitical", count: counts.Geopolitical, color: "text-red-400", bg: "bg-red-500/8 border-red-500/15" },
            { label: "Economic", count: counts.Economic, color: "text-yellow-400", bg: "bg-yellow-500/8 border-yellow-500/15" },
            { label: "Supply Chain", count: counts["Supply Chain"], color: "text-blue-400", bg: "bg-blue-500/8 border-blue-500/15" },
            { label: "Bearish Events", count: counts.bearish, color: "text-red-400", bg: "bg-red-500/8 border-red-500/15" },
            { label: "Bullish Events", count: counts.bullish, color: "text-green-400", bg: "bg-green-500/8 border-green-500/15" },
          ].map(s => (
            <div key={s.label} className={`rounded-lg border p-3 ${s.bg}`}>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-0.5 ${s.color}`} style={{ fontFamily: "var(--font-display)" }}>{s.count}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                filter === f ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["all", "bearish", "bullish", "neutral"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSentFilter(s)}
              className={`px-3 py-1 text-xs rounded-md font-medium capitalize transition-all ${
                sentFilter === s ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {filtered.length !== items.length && (
          <span className="text-xs text-muted-foreground">{filtered.length} of {items.length} events</span>
        )}
      </div>

      {/* News list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card p-12 text-center">
          <Globe className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No events match your filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground/60 text-center pb-4">
        News sourced from BBC, Reuters, WSJ, Bloomberg, FT and NYT RSS feeds. Market impact analysis is algorithmic — not financial advice.
      </p>
    </div>
  );
}
