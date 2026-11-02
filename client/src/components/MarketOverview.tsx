import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import SectionHeader from "./SectionHeader";
import { Globe, RefreshCw } from "lucide-react";

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  spark: number[];
  isIndex: boolean;
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
  "^AEX":     { label: "AEX",              ticker: "^AEX",     flag: "🇳🇱", group: "Europe" },
  "^SSMI":    { label: "SMI",              ticker: "^SSMI",   flag: "🇨🇭", group: "Europe" },
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
  US:          "US Markets",
  Americas:    "Americas",
  Europe:      "Europe",
  AsiaPacific: "Asia Pacific",
};

// The four headline indexes shown as large hero cards
const US_HERO = ["^GSPC", "^IXIC", "^DJI", "^RUT"];

// Yahoo sends index symbols URL-encoded (^IXIC → %5EIXIC); decode once for label lookups
function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

// Inline sparkline using SVG polyline
function Spark({ data, up, width = 64 }: { data: number[]; up: boolean; width?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = width, h = 24;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  const color = up ? "hsl(152 60% 45%)" : "hsl(352 82% 60%)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Hero card for the four headline US indexes ───────────────────────────────
function HeroIndexCard({ item }: { item: MarketItem }) {
  const up = item.changePct >= 0;
  const meta = INDEX_LABELS[item.symbol] ?? { label: item.name, ticker: item.symbol, flag: "🌐", group: "US" as RegionGroup };
  return (
    <div
      className={`rounded-2xl border p-5 bg-card card-lift flex flex-col gap-3 ${
        up ? "border-up/25" : "border-down/25"
      }`}
      data-testid={`hero-index-${item.symbol}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">{meta.flag}</span>
          <p className="text-sm font-semibold truncate min-w-0" style={{ fontFamily: "var(--font-display)" }}>{meta.label}</p>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          up ? "bg-up/15 text-up" : "bg-down/15 text-down"
        }`}>
          {fmtPct(item.changePct)}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-2xl font-bold tabular-nums tracking-tight min-w-0 truncate" style={{ fontFamily: "var(--font-display)" }}>
          {fmtPrice(item.price)}
        </p>
        <div className="shrink-0"><Spark data={item.spark} up={up} width={72} /></div>
      </div>
    </div>
  );
}

// Index card — region micro-label keeps one uniform grid sortable at a glance
function IndexCard({ item }: { item: MarketItem }) {
  const up = item.changePct >= 0;
  const meta = INDEX_LABELS[item.symbol] ?? { label: item.name, ticker: item.symbol, flag: "🌐", group: "US" as RegionGroup };
  return (
    <div className={`rounded-2xl border p-4 bg-card card-lift flex flex-col gap-2 ${
      up ? "border-up/20 hover:border-up/40" : "border-down/20 hover:border-down/40"
    }`}>
      <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">{GROUP_LABELS[meta.group]}</p>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm">{meta.flag}</span>
            <p className="text-xs text-muted-foreground font-semibold leading-tight">{meta.label}</p>
          </div>
          <p className="text-lg font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
            {fmtPrice(item.price)}
          </p>
          <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">{meta.ticker}</p>
        </div>
        <Spark data={item.spark} up={up} />
      </div>
      <p className={`text-xs font-bold tabular-nums ${up ? "text-up" : "text-down"}`}>
        {fmtPct(item.changePct)}
      </p>
    </div>
  );
}

// Scrolling ticker tape
function TickerTape({ indices }: { indices: MarketItem[] }) {
  if (!indices.length) return null;
  const items = [...indices, ...indices]; // double for seamless loop
  return (
    <div className="overflow-hidden rounded-full bg-card border border-border/40 py-2.5 px-0 relative" style={{ maskImage: "linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)" }}>
      <div className="flex items-center gap-8 ticker-tape whitespace-nowrap">
        {items.map((item, i) => {
          const up = item.changePct >= 0;
          const meta = INDEX_LABELS[item.symbol] ?? { label: item.name, ticker: item.symbol, flag: "🌐", group: "US" as RegionGroup };
          return (
            <span key={i} className="flex items-center gap-2 text-xs shrink-0">
              <span>{meta.flag}</span>
              <span className="font-semibold text-foreground">{meta.label}</span>
              <span className="font-mono text-muted-foreground/70 text-xs">{meta.ticker}</span>
              <span className="font-mono tabular-nums text-foreground/80">{fmtPrice(item.price)}</span>
              <span className={`font-mono font-bold tabular-nums ${up ? "text-up" : "text-down"}`}>
                {fmtPct(item.changePct)}
              </span>
              <span className="text-border/60 mx-2">·</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function MarketOverview() {
  const { data: overview, isLoading, refetch: refetchOverview } = useQuery<OverviewData>({
    queryKey: ["/api/market/overview"],
    queryFn: () => apiRequest("GET", "/api/market/overview").then(r => r.json()),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const indices = useMemo(() => {
    const seen = new Set<string>();
    return (overview?.indices ?? [])
      .map(i => ({ ...i, symbol: safeDecode(i.symbol) }))
      .filter(i => (seen.has(i.symbol) ? false : (seen.add(i.symbol), true)));
  }, [overview?.indices]);

  const hero = US_HERO.map(sym => indices.find(i => i.symbol === sym)).filter(Boolean) as MarketItem[];
  const heroSyms = new Set(US_HERO);
  const others = indices.filter(i => !heroSyms.has(i.symbol));

  return (
    <section className="space-y-5" data-testid="market-overview">
      <SectionHeader
        icon={Globe}
        title="World Markets"
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

      {isLoading ? (
        <div className="space-y-3">
          <div className="skeleton h-10 rounded-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="skeleton h-32 rounded-2xl" />)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton h-36 rounded-2xl" />)}
          </div>
        </div>
      ) : (
        <>
          {/* Scrolling ticker tape */}
          <TickerTape indices={indices} />

          {/* Headline US indexes — hero cards */}
          {hero.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {hero.map(item => <HeroIndexCard key={item.symbol} item={item} />)}
            </div>
          )}

          {/* Every other world index — one uniform grid */}
          {others.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {others.map(item => <IndexCard key={item.symbol} item={item} />)}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Sector performance as extruded 3D bars ───────────────────────────────────
// A real dimensional graphic: each sector's daily return is an extruded bar
// (front + top + side faces) on an accurate magnitude scale, value labeled.
export function SectorPerformance3D() {
  const { data: overview, isLoading } = useQuery<OverviewData>({
    queryKey: ["/api/market/overview"],
    queryFn: () => apiRequest("GET", "/api/market/overview").then(r => r.json()),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-card border border-border/50 p-5 space-y-3">
        <div className="skeleton h-5 w-40 rounded" />
        {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="skeleton h-6 rounded" />)}
      </div>
    );
  }

  const sectors = (overview?.sectors ?? []).slice().sort((a, b) => b.changePct - a.changePct);
  if (!sectors.length) return null;

  const max = Math.max(...sectors.map(s => Math.abs(s.changePct)), 0.25);

  return (
    <div className="rounded-2xl bg-card border border-border/50 p-5" data-testid="sector-3d">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Sector Performance
        </h3>
        <span className="text-xs text-muted-foreground">S&P 500 · today</span>
      </div>
      <div className="space-y-2.5">
        {sectors.map(s => {
          const up = s.changePct >= 0;
          const pct = Math.max((Math.abs(s.changePct) / max) * 100, 5);
          const d = 6;   // extrusion depth, px
          const h = 18;  // front face height, px
          const dPct = 2.4; // depth as % of track width
                    const front = up ? "hsl(152 58% 46%)" : "hsl(352 78% 58%)";
          const top = up ? "hsl(152 58% 60%)" : "hsl(352 78% 70%)";
          const side = up ? "hsl(152 52% 33%)" : "hsl(352 70% 42%)";
          return (
            <div key={s.name} className="flex items-center gap-3 group">
              <span className="w-24 shrink-0 text-xs text-muted-foreground truncate" title={s.name}>
                {s.name}
              </span>
              <div className="flex-1 min-w-0">
                <svg
                  viewBox={`0 0 100 ${h + d}`}
                  preserveAspectRatio="none"
                  className="w-full block overflow-visible"
                  style={{ height: h + d }}
                >
                  {/* top face */}
                  <polygon points={`0,${d} ${dPct},0 ${pct + dPct},0 ${pct},${d}`} fill={top} />
                  {/* side face */}
                  <polygon points={`${pct},${d} ${pct + dPct},0 ${pct + dPct},${h} ${pct},${h + d}`} fill={side} />
                  {/* front face */}
                  <rect x="0" y={d} width={pct} height={h} fill={front} rx="1.5" />
                </svg>
              </div>
              <span className={`w-14 shrink-0 text-right text-xs font-bold tabular-nums ${up ? "text-up" : "text-down"}`}>
                {fmtPct(s.changePct)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
