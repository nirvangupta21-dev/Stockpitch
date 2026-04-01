import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  TrendingUp, TrendingDown, BarChart2, Zap, Activity,
  DollarSign, ArrowUpDown, Search, ChevronRight,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Stock {
  ticker: string;
  name: string;
  exchange: string;
  exchangeCode: string;
  price: number;
  changePct: number;
  marketCap: number;
  volume: number;
  avgVolume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  volatility: number;
  volatilityLabel: "High" | "Medium" | "Low";
  sector: string | null;
  pe: number | null;
}

interface ExplorerData {
  stocks: Stock[];
  total: number;
  market: string;
  sort: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────
const MARKETS = [
  { id: "nasdaq",      label: "NASDAQ",       description: "NASDAQ-listed equities" },
  { id: "nyse",        label: "NYSE",          description: "NYSE-listed equities" },
  { id: "most_active", label: "Most Active",   description: "Highest trading volume today" },
  { id: "gainers",     label: "Top Gainers",   description: "Biggest price increases today" },
  { id: "losers",      label: "Top Losers",    description: "Biggest price declines today" },
];

const SORTS = [
  { id: "marketCap",  label: "Market Cap",   icon: DollarSign },
  { id: "popularity", label: "Popularity",   icon: Activity },
  { id: "volatility", label: "Volatility",   icon: Zap },
  { id: "change",     label: "Daily Move",   icon: TrendingUp },
  { id: "price",      label: "Price",        icon: ArrowUpDown },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtCap(n: number) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}
function fmtVol(n: number) {
  if (!n) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}
function fmtPrice(n: number) {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toFixed(2);
}

// Inline SVG sparkline
function Spark({ data, up }: { data: number[]; up: boolean }) {
  if (!data || data.length < 2) {
    return <div className="w-16 h-6 bg-muted/30 rounded" />;
  }
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 64, H = 24;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const color = up ? "hsl(142,71%,45%)" : "hsl(0,72%,51%)";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Volatility badge
function VolBadge({ label, value }: { label: string; value: number }) {
  const cfg = {
    High:   { bg: "bg-red-500/15 border-red-500/25 text-red-400", dot: "bg-red-500" },
    Medium: { bg: "bg-yellow-500/15 border-yellow-500/25 text-yellow-400", dot: "bg-yellow-400" },
    Low:    { bg: "bg-green-500/15 border-green-500/25 text-green-400", dot: "bg-green-500" },
  }[label] || { bg: "bg-muted border-border text-muted-foreground", dot: "bg-muted-foreground" };
  return (
    <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium ${cfg.bg}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {label} <span className="opacity-70 text-xs">({value.toFixed(0)}%)</span>
    </div>
  );
}

// Rank badge
function Rank({ n }: { n: number }) {
  return (
    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-muted-foreground shrink-0">
      {n}
    </div>
  );
}

// ─── Stock Row ───────────────────────────────────────────────────────────────
function StockRow({
  stock, rank, spark, onSelect,
}: {
  stock: Stock;
  rank: number;
  spark: number[];
  onSelect: (ticker: string) => void;
}) {
  const up = stock.changePct >= 0;
  const volRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1;

  return (
    <div
      className="grid items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer border-b border-border/20 last:border-0"
      style={{ gridTemplateColumns: "2rem 1fr 5rem 5rem 6rem 5rem 8rem 7rem 2rem" }}
      onClick={() => onSelect(stock.ticker)}
      data-testid={`row-${stock.ticker}`}
    >
      {/* Rank */}
      <Rank n={rank} />

      {/* Name + ticker */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm text-foreground">{stock.ticker}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{stock.exchange}</span>
          {stock.sector && (
            <span className="text-xs text-muted-foreground/60 hidden lg:block truncate max-w-[100px]">{stock.sector}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate max-w-[200px] mt-0.5">{stock.name}</p>
      </div>

      {/* Price */}
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums font-mono">${fmtPrice(stock.price)}</p>
      </div>

      {/* Change */}
      <div className="text-right">
        <span className={`text-sm font-bold tabular-nums font-mono ${up ? "text-green-400" : "text-red-400"}`}>
          {up ? "+" : ""}{stock.changePct.toFixed(2)}%
        </span>
      </div>

      {/* Market cap */}
      <div className="text-right">
        <p className="text-sm tabular-nums font-mono text-foreground">{fmtCap(stock.marketCap)}</p>
      </div>

      {/* Volume vs avg */}
      <div className="text-right">
        <p className="text-sm tabular-nums font-mono text-foreground">{fmtVol(stock.volume)}</p>
        {volRatio > 1.5 && (
          <p className="text-xs text-primary tabular-nums">{volRatio.toFixed(1)}x avg</p>
        )}
      </div>

      {/* Volatility */}
      <div>
        <VolBadge label={stock.volatilityLabel} value={stock.volatility} />
      </div>

      {/* Sparkline */}
      <div className="flex items-center justify-center">
        <Spark data={spark} up={up} />
      </div>

      {/* Arrow */}
      <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function StockExplorer({ onSelectTicker }: { onSelectTicker: (t: string) => void }) {
  const [market, setMarket] = useState("nasdaq");
  const [sort, setSort] = useState("marketCap");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<ExplorerData>({
    queryKey: ["/api/explorer", market, sort],
    queryFn: () => apiRequest("GET", `/api/explorer?market=${market}&sort=${sort}&limit=50`).then(r => r.json()),
    staleTime: 60000,
    refetchInterval: 120000,
  });

  // Batch-fetch sparklines for visible stocks
  const tickers = (data?.stocks ?? []).map(s => s.ticker);
  const { data: sparksData } = useQuery<Record<string, number[]>>({
    queryKey: ["/api/explorer/sparks", tickers.slice(0, 20).join(",")],
    queryFn: async () => {
      const results: Record<string, number[]> = {};
      // Fetch in parallel batches of 5
      const batch = tickers.slice(0, 20);
      await Promise.allSettled(
        batch.map(async t => {
          try {
            const r = await apiRequest("GET", `/api/explorer/spark/${t}`).then(res => res.json());
            results[t] = r.spark || [];
          } catch { results[t] = []; }
        })
      );
      return results;
    },
    enabled: tickers.length > 0,
    staleTime: 300000,
  });

  const filtered = (data?.stocks ?? []).filter(s =>
    !search || s.ticker.toLowerCase().includes(search.toLowerCase()) ||
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  // Summary stats
  const stocks = data?.stocks ?? [];
  const gainers = stocks.filter(s => s.changePct > 0).length;
  const losers  = stocks.filter(s => s.changePct < 0).length;
  const highVol = stocks.filter(s => s.volatilityLabel === "High").length;
  const avgCap  = stocks.length ? stocks.reduce((s, x) => s + x.marketCap, 0) / stocks.length : 0;

  const handleSelect = useCallback((ticker: string) => {
    onSelectTicker(ticker);
  }, [onSelectTicker]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart2 className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Stock Explorer
        </h1>
        <span className="text-xs text-muted-foreground">NYSE &amp; NASDAQ · Public Equities</span>
      </div>

      {/* Market tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit flex-wrap">
        {MARKETS.map(m => (
          <button
            key={m.id}
            data-testid={`market-${m.id}`}
            onClick={() => setMarket(m.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              market === m.id
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Summary stats */}
      {!isLoading && stocks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Stocks Listed", value: stocks.length, color: "text-primary" },
            { label: "Advancing", value: gainers, color: "text-green-400" },
            { label: "Declining", value: losers, color: "text-red-400" },
            { label: "High Volatility", value: highVol, color: "text-yellow-400" },
          ].map(s => (
            <div key={s.label} className="rounded-xl bg-card border border-border/50 px-4 py-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-0.5 ${s.color}`} style={{ fontFamily: "var(--font-display)" }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Controls row */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Sort */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">Sort by</span>
          <div className="flex gap-1 bg-muted rounded-lg p-1 flex-wrap">
            {SORTS.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  data-testid={`sort-${s.id}`}
                  onClick={() => setSort(s.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    sort === s.id
                      ? "bg-card text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            data-testid="input-stock-search"
            type="text"
            placeholder="Filter by ticker or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-4 py-2 bg-secondary border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-56"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
        {/* Column headers */}
        <div
          className="grid items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-secondary/30"
          style={{ gridTemplateColumns: "2rem 1fr 5rem 5rem 6rem 5rem 8rem 7rem 2rem" }}
        >
          {["#", "Stock", "Price", "Change", "Mkt Cap", "Volume", "Volatility", "14D Chart", ""].map((h, i) => (
            <p key={i} className={`text-xs text-muted-foreground font-semibold uppercase tracking-wider ${i >= 2 ? "text-right" : ""} ${i === 6 ? "text-left" : ""} ${i === 7 ? "text-center" : ""}`}>
              {h}
            </p>
          ))}
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-lg" style={{ opacity: 1 - i * 0.06 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No stocks match your search.
          </div>
        ) : (
          <div>
            {filtered.map((stock, i) => (
              <StockRow
                key={stock.ticker}
                stock={stock}
                rank={i + 1}
                spark={sparksData?.[stock.ticker] ?? []}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border/30 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length} stocks · Click any row to analyze in Dashboard
            </p>
            <p className="text-xs text-muted-foreground">
              Avg market cap: {fmtCap(avgCap)} · Updates every 2 min
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
