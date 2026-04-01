import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { BarChart2, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
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

// Index card
function IndexCard({ item }: { item: MarketItem }) {
  const up = item.changePct >= 0;
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 transition-all ${up ? "bg-green-500/5 border-green-500/15" : "bg-red-500/5 border-red-500/15"}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{item.symbol}</p>
          <p className="text-xl font-bold tabular-nums mt-0.5" style={{ fontFamily: "var(--font-display)" }}>
            {fmtPrice(item.price)}
          </p>
        </div>
        <Spark data={item.spark} up={up} />
      </div>
      <div className={`flex items-center gap-1.5 text-sm font-semibold tabular-nums ${up ? "text-green-400" : "text-red-400"}`}>
        {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        <span>{fmtPct(item.changePct)}</span>
        <span className="text-xs font-normal text-muted-foreground">today</span>
      </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="skeleton h-28 rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* Index cards */}
          {overview?.indices && overview.indices.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {overview.indices.map((item) => (
                <IndexCard key={item.symbol} item={item} />
              ))}
            </div>
          )}

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
