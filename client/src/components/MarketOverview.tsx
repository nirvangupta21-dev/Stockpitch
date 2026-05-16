import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { BarChart2, TrendingUp, TrendingDown, RefreshCw, Globe } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area,
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  spark: number[];
  isIndex: boolean;
}

interface Mover {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  marketCap: number | null;
}

interface OverviewData {
  indices: MarketItem[];
  sectors: MarketItem[];
}

interface MoversData {
  gainers: Mover[];
  losers: Mover[];
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtPrice(n: number) {
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCap(n: number | null) {
  if (!n) return "";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

// Inline sparkline using SVG polyline
function Spark({ data, up }: { data: number[]; up: boolean }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 64, h = 24;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  const color = up ? "hsl(142,71%,45%)" : "hsl(0,72%,51%)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Pretty names for index symbols
const INDEX_LABELS: Record<string, { label: string; region: string }> = {
  "^GSPC":  { label: "S&P 500",    region: "US" },
  "^IXIC":  { label: "NASDAQ",     region: "US" },
  "^DJI":   { label: "Dow Jones",  region: "US" },
  "^NYC":   { label: "NYSE Comp.", region: "US" },
  "^N225":  { label: "Nikkei 225", region: "JP" },
  "^NSEI":  { label: "NIFTY 50",   region: "IN" },
  "^GDAXI": { label: "DAX",        region: "DE" },
  "^FTSE":  { label: "FTSE 100",   region: "GB" },
};

const FLAG: Record<string, string> = {
  US: "🇺🇸", JP: "🇯🇵", IN: "🇮🇳", DE: "🇩🇪", GB: "🇬🇧",
};

// Index card
function IndexCard({ item }: { item: MarketItem }) {
  const up = item.changePct >= 0;
  const meta = INDEX_LABELS[item.symbol] ?? { label: item.symbol, region: "US" };
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 transition-all hover:scale-[1.02] duration-200 ${
      up ? "bg-green-500/5 border-green-500/20 hover:border-green-500/35" : "bg-red-500/5 border-red-500/20 hover:border-red-500/35"
    }`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm">{FLAG[meta.region] ?? ""}</span>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider truncate">{meta.label}</p>
          </div>
          <p className="text-xl font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
            {fmtPrice(item.price)}
          </p>
        </div>
        <Spark data={item.spark} up={up} />
      </div>
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1 text-sm font-bold tabular-nums ${up ? "text-green-400" : "text-red-400"}`}>
          {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          <span>{fmtPct(item.changePct)}</span>
        </div>
        <span className="text-xs text-muted-foreground/50">today</span>
      </div>
    </div>
  );
}

// Scrolling ticker tape
function TickerTape({ indices }: { indices: MarketItem[] }) {
  if (!indices.length) return null;
  const items = [...indices, ...indices]; // double for seamless loop
  return (
    <div className="overflow-hidden rounded-xl bg-card border border-border/40 py-2.5 px-0 relative" style={{ maskImage: "linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)" }}>
      <div className="flex items-center gap-8 animate-ticker whitespace-nowrap" style={{ animation: "tickerScroll 35s linear infinite" }}>
        {items.map((item, i) => {
          const up = item.changePct >= 0;
          const meta = INDEX_LABELS[item.symbol] ?? { label: item.symbol, region: "US" };
          return (
            <span key={i} className="flex items-center gap-2 text-xs shrink-0">
              <span>{FLAG[meta.region] ?? ""}</span>
              <span className="font-mono font-bold text-foreground">{meta.label}</span>
              <span className="font-mono tabular-nums text-foreground/70">{fmtPrice(item.price)}</span>
              <span className={`font-mono font-bold tabular-nums ${up ? "text-green-400" : "text-red-400"}`}>
                {fmtPct(item.changePct)}
              </span>
              <span className="text-border/60 mx-2">·</span>
            </span>
          );
        })}
      </div>
      <style>{`
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// Sector bar chart tooltip
function SectorTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-foreground">{d.name}</p>
      <p className={`font-bold tabular-nums ${d.changePct >= 0 ? "text-green-400" : "text-red-400"}`}>
        {fmtPct(d.changePct)}
      </p>
      <p className="text-muted-foreground">${fmtPrice(d.price)}</p>
    </div>
  );
}

export default function MarketOverview() {
  const { data: overview, isLoading: oLoading, refetch: refetchOverview } = useQuery<OverviewData>({
    queryKey: ["/api/market/overview"],
    queryFn: () => apiRequest("GET", "/api/market/overview").then(r => r.json()),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: movers, isLoading: mLoading } = useQuery<MoversData>({
    queryKey: ["/api/market/movers"],
    queryFn: () => apiRequest("GET", "/api/market/movers").then(r => r.json()),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const loading = oLoading || mLoading;

  return (
    <div className="space-y-5" data-testid="market-overview">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Market Overview
          </h2>
          <span className="text-xs text-muted-foreground">NYSE &amp; NASDAQ</span>
        </div>
        <button
          onClick={() => refetchOverview()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-refresh-market"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-10 rounded-xl" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="skeleton h-28 rounded-xl" />)}
          </div>
        </div>
      ) : (
        <>
          {/* Scrolling ticker tape */}
          {overview?.indices && overview.indices.length > 0 && (
            <TickerTape indices={overview.indices} />
          )}

          {/* Index cards — US + Global */}
          {overview?.indices && overview.indices.length > 0 && (() => {
            const us     = overview.indices.filter(i => ["^GSPC","^IXIC","^DJI","^NYC"].includes(i.symbol));
            const global = overview.indices.filter(i => !["^GSPC","^IXIC","^DJI","^NYC"].includes(i.symbol));
            return (
              <div className="space-y-3">
                {us.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground/60 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <span>🇺🇸</span> US Markets
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {us.map(item => <IndexCard key={item.symbol} item={item} />)}
                    </div>
                  </div>
                )}
                {global.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground/60 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <Globe className="w-3 h-3" /> Global Markets
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {global.map(item => <IndexCard key={item.symbol} item={item} />)}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Sector performance bar chart */}
          {overview?.sectors && overview.sectors.length > 0 && (
            <div className="rounded-xl bg-card border border-border/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  Sector Performance — S&P 500 (Today)
                </h3>
                <span className="text-xs text-muted-foreground">Ranked by daily return</span>
              </div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={overview.sectors}
                    margin={{ top: 4, right: 4, bottom: 4, left: 0 }}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,18%)" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
                      tick={{ fontSize: 10, fill: "hsl(210,10%,50%)", fontFamily: "var(--font-mono)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "hsl(210,10%,55%)", fontFamily: "var(--font-body)" }}
                      axisLine={false}
                      tickLine={false}
                      width={130}
                    />
                    <Tooltip content={<SectorTooltip />} />
                    <Bar dataKey="changePct" radius={[0, 4, 4, 0]}>
                      {overview.sectors.map((s, i) => (
                        <Cell
                          key={i}
                          fill={s.changePct >= 0 ? "hsl(142,71%,45%)" : "hsl(0,72%,51%)"}
                          opacity={0.85}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top Movers — gainers + losers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gainers */}
            <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Top Gainers</h3>
                <span className="text-xs text-muted-foreground ml-auto">NYSE &amp; NASDAQ</span>
              </div>
              {mLoading ? (
                <div className="p-4 space-y-2">
                  {[1,2,3,4].map(i => <div key={i} className="skeleton h-10 rounded-lg" />)}
                </div>
              ) : (
                <div className="divide-y divide-border/20">
                  {(movers?.gainers ?? []).length === 0 ? (
                    <p className="px-4 py-6 text-xs text-muted-foreground text-center">No data available</p>
                  ) : (movers?.gainers ?? []).map(m => (
                    <div key={m.ticker} className="px-4 py-2.5 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-sm text-foreground w-14 shrink-0">{m.ticker}</span>
                        <div>
                          <p className="text-xs text-muted-foreground truncate max-w-[140px]">{m.name}</p>
                          {m.marketCap && <p className="text-xs text-muted-foreground/60">{fmtCap(m.marketCap)}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-semibold tabular-nums text-foreground">${fmtPrice(m.price)}</p>
                        <p className="text-xs font-bold tabular-nums text-green-400">{fmtPct(m.changePct)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Losers */}
            <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Top Losers</h3>
                <span className="text-xs text-muted-foreground ml-auto">NYSE &amp; NASDAQ</span>
              </div>
              {mLoading ? (
                <div className="p-4 space-y-2">
                  {[1,2,3,4].map(i => <div key={i} className="skeleton h-10 rounded-lg" />)}
                </div>
              ) : (
                <div className="divide-y divide-border/20">
                  {(movers?.losers ?? []).length === 0 ? (
                    <p className="px-4 py-6 text-xs text-muted-foreground text-center">No data available</p>
                  ) : (movers?.losers ?? []).map(m => (
                    <div key={m.ticker} className="px-4 py-2.5 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-sm text-foreground w-14 shrink-0">{m.ticker}</span>
                        <div>
                          <p className="text-xs text-muted-foreground truncate max-w-[140px]">{m.name}</p>
                          {m.marketCap && <p className="text-xs text-muted-foreground/60">{fmtCap(m.marketCap)}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-semibold tabular-nums text-foreground">${fmtPrice(m.price)}</p>
                        <p className="text-xs font-bold tabular-nums text-red-400">{fmtPct(m.changePct)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
