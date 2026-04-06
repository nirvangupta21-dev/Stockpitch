/**
 * TopMoversLanding — shown on Dashboard before any stock is searched.
 * Fetches today's top 10 gainers and renders them as clickable cards
 * with a mini sparkline, price, and gain%.
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { TrendingUp, ArrowUpRight, Search } from "lucide-react";
import { ResponsiveContainer, LineChart, Line } from "recharts";

interface Mover {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  marketCap?: number;
}

interface SparkData { spark: number[] }

// ── Individual card ──────────────────────────────────────────────────────────
function MoverCard({ mover, onSelect }: { mover: Mover; onSelect: () => void }) {
  const { data: sparkData } = useQuery<SparkData>({
    queryKey: ["/api/explorer/spark", mover.ticker],
    queryFn: () => apiRequest("GET", `/api/explorer/spark/${mover.ticker}`).then(r => r.json()),
    staleTime: 300000,
  });

  const spark = (sparkData?.spark ?? []).map((v, i) => ({ i, v }));
  const isGain = mover.changePct >= 0;

  const fmtMktCap = (v?: number) => {
    if (!v) return "";
    if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
    return "";
  };

  return (
    <button
      onClick={onSelect}
      className="group relative rounded-xl bg-card border border-border/50 p-4 text-left hover:border-primary/40 hover:bg-card/80 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 overflow-hidden"
      data-testid={`mover-card-${mover.ticker}`}
    >
      {/* Subtle top accent line on hover */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm text-primary">{mover.ticker}</span>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
              isGain ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
            }`}>
              {isGain ? "+" : ""}{mover.changePct.toFixed(2)}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-[140px]">{mover.name}</p>
        </div>
        <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 mt-0.5" />
      </div>

      {/* Sparkline */}
      {spark.length > 2 && (
        <div style={{ height: 40 }} className="mb-3 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={isGain ? "hsl(142,71%,45%)" : "hsl(0,72%,51%)"}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Price + market cap */}
      <div className="flex items-end justify-between">
        <p className="text-lg font-bold font-mono tabular-nums text-foreground">
          ${mover.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        {mover.marketCap && (
          <p className="text-xs text-muted-foreground/60">{fmtMktCap(mover.marketCap)}</p>
        )}
      </div>
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
interface Props { onSelectTicker: (ticker: string) => void; }

export default function TopMoversLanding({ onSelectTicker }: Props) {
  const { data, isLoading } = useQuery<{ gainers: Mover[] }>({
    queryKey: ["/api/market/movers"],
    queryFn: () => apiRequest("GET", "/api/market/movers").then(r => r.json()),
    staleTime: 120000,
    retry: 2,
  });

  const gainers = (data?.gainers ?? []).slice(0, 14);

  return (
    <div className="space-y-6">

      {/* Hero header */}
      <div className="rounded-xl bg-card border border-border/50 px-6 py-8 text-center relative overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative">
          <div className="flex items-center justify-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Today's Top Movers</span>
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
            Markets at a Glance
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Click any stock to open a full analysis — price history, investment simulator, and fair value models.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground/60">
            <Search className="w-3.5 h-3.5" />
            <span>Or search any NYSE / NASDAQ stock in the top bar</span>
          </div>
        </div>
      </div>

      {/* Grid of mover cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-card border border-border/50 p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-secondary rounded w-16" />
              <div className="h-10 bg-secondary rounded" />
              <div className="h-5 bg-secondary rounded w-24" />
            </div>
          ))}
        </div>
      ) : gainers.length === 0 ? (
        <div className="rounded-xl bg-card border border-border/50 p-10 text-center text-muted-foreground text-sm">
          Market data unavailable — try searching a specific ticker above.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {gainers.map(m => (
            <MoverCard
              key={m.ticker}
              mover={m}
              onSelect={() => onSelectTicker(m.ticker)}
            />
          ))}
        </div>
      )}

      {/* Market overview still shown below */}
      <div className="border-t border-border/30 pt-2" />
    </div>
  );
}
