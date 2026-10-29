import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import SectionHeader from "./SectionHeader";
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

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtPrice(n: number) {
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
type RegionGroup = "US" | "Americas" | "Europe" | "AsiaPacific";

const INDEX_LABELS: Record<string, { label: string; ticker: string; flag: string; group: RegionGroup }> = {
  // US
  "^GSPC":    { label: "S&P 500",          ticker: "^GSPC",    flag: "🇺🇸", group: "US" },
  "^IXIC":    { label: "NASDAQ",           ticker: "^IXIC",    flag: "🇺🇸", group: "US" },
  "^DJI":     { label: "Dow Jones",        ticker: "^DJI",     flag: "🇺🇸", group: "US" },
  "^NYC":     { label: "NYSE Comp.",       ticker: "^NYC",     flag: "🇺🇸", group: "US" },
  "^RUT":     { label: "Russell 2000",     ticker: "^RUT",     flag: "🇺🇸", group: "US" },
  // Americas
  "^GSPTSE":  { label: "TSX Composite",    ticker: "^GSPTSE",  flag: "🇨🇦", group: "Americas" },
  "^BVSP":    { label: "Bovespa",          ticker: "^BVSP",    flag: "🇧🇷", group: "Americas" },
  "^MXX":     { label: "IPC Mexico",       ticker: "^MXX",     flag: "🇲🇽", group: "Americas" },
  // Europe
  "^GDAXI":   { label: "DAX",              ticker: "^GDAXI",   flag: "🇩🇪", group: "Europe" },
  "^FTSE":    { label: "FTSE 100",         ticker: "^FTSE",    flag: "🇬🇧", group: "Europe" },
  "^FCHI":    { label: "CAC 40",           ticker: "^FCHI",    flag: "🇫🇷", group: "Europe" },
  "^STOXX":   { label: "STOXX Europe 600", ticker: "^STOXX",   flag: "🇪🇺", group: "Europe" },
  "^STOXX50E":{ label: "Euro STOXX 50",    ticker: "^STOXX50E",flag: "🇪🇺", group: "Europe" },
  "^IBEX":    { label: "IBEX 35",          ticker: "^IBEX",    flag: "🇪🇸", group: "Europe" },
  "FTSEMIB.MI":{ label: "FTSE MIB",       ticker: "FTSEMIB",  flag: "🇮🇹", group: "Europe" },
  "^AEX":     { label: "AEX",             ticker: "^AEX",     flag: "🇳🇱", group: "Europe" },
  "^SSMI":    { label: "SMI",             ticker: "^SSMI",    flag: "🇨🇭", group: "Europe" },
  // Asia Pacific
  "^N225":    { label: "Nikkei 225",      ticker: "^N225",    flag: "🇯🇵", group: "AsiaPacific" },
  "^NSEI":    { label: "NIFTY 50",        ticker: "^NSEI",    flag: "🇮🇳", group: "AsiaPacific" },
  "^BSESN":   { label: "BSE SENSEX",      ticker: "^BSESN",   flag: "🇮🇳", group: "AsiaPacific" },
  "000001.SS":{ label: "Shanghai Composite",  ticker: "000001.SS",flag: "🇨🇳", group: "AsiaPacific" },
  "^HSI":     { label: "Hang Seng",       ticker: "^HSI",     flag: "🇭🇰", group: "AsiaPacific" },
  "^KS11":    { label: "KOSPI",           ticker: "^KS11",    flag: "🇰🇷", group: "AsiaPacific" },
  "^TWII":    { label: "TAIEX",           ticker: "^TWII",    flag: "🇹🇼", group: "AsiaPacific" },
  "^AXJO":    { label: "ASX 200",         ticker: "^AXJO",    flag: "🇦🇺", group: "AsiaPacific" },
  "^STI":     { label: "Straits Times",   ticker: "^STI",     flag: "🇸🇬", group: "AsiaPacific" },
};

const GROUP_LABELS: Record<RegionGroup, string> = {
  US:          "🇺🇸 US Markets",
  Americas:    "🇺🇸 Americas",
  Europe:      "🇪🇺 Europe",
  AsiaPacific: "🌏 Asia Pacific",
};

const FLAG: Record<string, string> = {}; // kept for tape fallback

// Yahoo sends index symbols URL-encoded (^IXIC → %5EIXIC); decode once for label lookups
function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

// Index card — region micro-label keeps one uniform grid sortable at a glance
function IndexCard({ item }: { item: MarketItem }) {
  const up = item.changePct >= 0;
  const meta = INDEX_LABELS[item.symbol] ?? { label: item.symbol, ticker: item.symbol, flag: "🌐", group: "US" as RegionGroup };
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 transition-all hover:scale-[1.02] duration-200 ${
      up ? "bg-green-500/5 border-green-500/20 hover:border-green-500/35" : "bg-red-500/5 border-red-500/20 hover:border-red-500/35"
    }`}>
      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{GROUP_LABELS[meta.group]}</p>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm">{meta.flag}</span>
            <p className="text-xs text-muted-foreground font-semibold leading-tight">{meta.label}</p>
          </div>
          <p className="text-xl font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
            {fmtPrice(item.price)}
          </p>
          <p className="text-xs font-mono text-muted-foreground/50 mt-0.5">{meta.ticker}</p>
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
          const meta = INDEX_LABELS[item.symbol] ?? { label: item.symbol, ticker: item.symbol, flag: "🌐", group: "US" as RegionGroup };
          return (
            <span key={i} className="flex items-center gap-2 text-xs shrink-0">
              <span>{meta.flag}</span>
              <span className="font-mono font-bold text-foreground">{meta.label}</span>
              <span className="font-mono text-muted-foreground/70 text-xs">{meta.ticker}</span>
              <span className="font-mono tabular-nums text-foreground/80">{fmtPrice(item.price)}</span>
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

  const loading = oLoading;

  const indices = useMemo(() => {
    const seen = new Set<string>();
    return (overview?.indices ?? [])
      .map(i => ({ ...i, symbol: safeDecode(i.symbol) }))
      .filter(i => (seen.has(i.symbol) ? false : (seen.add(i.symbol), true)));
  }, [overview?.indices]);

  return (
    <div className="space-y-5" data-testid="market-overview">
      {/* Section header */}
      <SectionHeader
        icon={BarChart2}
        title="World Indexes"
        meta={
          <button
            onClick={() => refetchOverview()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-refresh-market"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        }
      />

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
          {indices.length > 0 && (
            <TickerTape indices={indices} />
          )}

          {/* Index cards — one uniform grid, ordered US → Americas → Europe → Asia Pacific.
              Region shows as a micro-label on each card so columns always align. */}
          {indices.length > 0 && (() => {
            const ORDER: RegionGroup[] = ["US", "Americas", "Europe", "AsiaPacific"];
            const sorted = [...indices].sort((a, b) => {
              const ga = INDEX_LABELS[a.symbol]?.group ?? "US";
              const gb = INDEX_LABELS[b.symbol]?.group ?? "US";
              return ORDER.indexOf(ga) - ORDER.indexOf(gb);
            });
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {sorted.map(item => <IndexCard key={item.symbol} item={item} />)}
              </div>
            );
          })()}

          {/* Sector performance bar chart */}
          {overview?.sectors && overview.sectors.length > 0 && (
            <div className="rounded-xl bg-card border border-border/50 p-5">
              <div className="mb-4">
                <SectionHeader icon={BarChart2} title="Sector Performance" meta={<span>S&P 500 · today</span>} />
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
                      tick={{ fontSize: 10, fill: "hsl(200,8%,58%)", fontFamily: "var(--font-mono)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "hsl(200,8%,58%)", fontFamily: "var(--font-body)" }}
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

        </>
      )}
    </div>
  );
}
