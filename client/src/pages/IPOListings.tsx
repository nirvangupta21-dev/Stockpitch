import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, TrendingUp, TrendingDown, RefreshCw, Clock, Building2 } from "lucide-react";

interface IPO {
  ticker: string;
  name: string;
  exchange: string;
  price: number | null;
  marketCap: number | null;
  change: number | null;
  ipoDate: string | null;
  sector: string;
  industry: string;
  type: "upcoming" | "recent";
}

interface IPOData {
  exchange: string;
  label: string;
  flag: string;
  upcoming: IPO[];
  recent: IPO[];
  lastUpdated: string;
  note?: string;
}

// ── Exchange tabs config ────────────────────────────────────────────────────
const EXCHANGES = [
  { id: "all",      label: "All Markets",      flag: "🌐" },
  { id: "nasdaq",   label: "NASDAQ",            flag: "🇺🇸" },
  { id: "nyse",     label: "NYSE",              flag: "🇺🇸" },
  { id: "lse",      label: "LSE",               flag: "🇬🇧" },
  { id: "tsx",      label: "TSX",               flag: "🇨🇦" },
  { id: "asx",      label: "ASX",               flag: "🇦🇺" },
  { id: "nse",      label: "NSE India",         flag: "🇮🇳" },
  { id: "tse",      label: "TSE Japan",         flag: "🇯🇵" },
  { id: "sse",      label: "SSE China",         flag: "🇨🇳" },
  { id: "euronext", label: "Euronext",          flag: "🇪🇺" },
];

// ── Formatters ──────────────────────────────────────────────────────────────
function fmtCap(n: number | null) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return "—";
}

function fmtDate(str: string | null) {
  if (!str) return "TBA";
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── IPO row ─────────────────────────────────────────────────────────────────
function IPORow({ ipo }: { ipo: IPO }) {
  const isUpcoming = ipo.type === "upcoming";
  const up = (ipo.change ?? 0) >= 0;

  return (
    <div
      className="grid items-center gap-3 px-5 py-3.5 border-b border-border/20 last:border-0 hover:bg-secondary/20 transition-colors"
      style={{ gridTemplateColumns: "1fr 6rem 7rem 6rem 6rem 7rem" }}
    >
      {/* Name + ticker */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-bold text-sm text-foreground">{ipo.ticker}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{ipo.exchange}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate max-w-[220px] mt-0.5">{ipo.name}</p>
        {ipo.sector !== "N/A" && (
          <p className="text-xs text-muted-foreground/50 mt-0.5">{ipo.sector}</p>
        )}
      </div>

      {/* IPO Date */}
      <div className="text-right">
        <p className="text-xs font-mono text-foreground">{fmtDate(ipo.ipoDate)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{isUpcoming ? "Expected" : "Listed"}</p>
      </div>

      {/* Price */}
      <div className="text-right">
        {ipo.price ? (
          <p className="text-sm font-mono font-semibold tabular-nums">${ipo.price.toFixed(2)}</p>
        ) : (
          <p className="text-sm text-muted-foreground">TBA</p>
        )}
      </div>

      {/* Change */}
      <div className="text-right">
        {ipo.change !== null && !isUpcoming ? (
          <span className={`text-sm font-mono font-bold tabular-nums ${up ? "text-green-400" : "text-red-400"}`}>
            {up ? "+" : ""}{ipo.change.toFixed(2)}%
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Market Cap */}
      <div className="text-right">
        <p className="text-sm font-mono tabular-nums text-foreground">{fmtCap(ipo.marketCap)}</p>
      </div>

      {/* Status badge */}
      <div>
        <span className={`text-xs px-2 py-1 rounded-lg font-semibold border ${
          isUpcoming
            ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
            : up
            ? "bg-green-500/10 border-green-500/20 text-green-400"
            : "bg-red-500/10 border-red-500/20 text-red-400"
        }`}>
          {isUpcoming ? "Upcoming" : up ? "↑ Above IPO" : "↓ Below IPO"}
        </span>
      </div>
    </div>
  );
}

// ── IPO section (upcoming or recent) ───────────────────────────────────────
function IPOSection({ title, icon, ipos, colHeaders }: {
  title: string;
  icon: React.ReactNode;
  ipos: IPO[];
  colHeaders: string[];
}) {
  if (!ipos.length) return null;
  return (
    <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/30 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>{title}</h2>
        <span className="text-xs text-muted-foreground ml-1">{ipos.length} listing{ipos.length !== 1 ? "s" : ""}</span>
      </div>
      <div
        className="grid gap-3 px-5 py-2 bg-secondary/20 text-xs text-muted-foreground font-semibold uppercase tracking-wider"
        style={{ gridTemplateColumns: "1fr 6rem 7rem 6rem 6rem 7rem" }}
      >
        {colHeaders.map(h => (
          <span key={h} className={h !== "Company" ? "text-right" : ""}>{h}</span>
        ))}
      </div>
      {ipos.map(ipo => <IPORow key={ipo.ticker} ipo={ipo} />)}
    </div>
  );
}

// ── Exchange tab panel ──────────────────────────────────────────────────────
function ExchangePanel({ exchangeId }: { exchangeId: string }) {
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery<IPOData>({
    queryKey: ["/api/ipos", exchangeId],
    queryFn: () => apiRequest("GET", `/api/ipos?exchange=${exchangeId}`).then(r => r.json()),
    refetchInterval: 3600000,
    staleTime: 1800000,
  });

  const upcoming = data?.upcoming ?? [];
  const recent   = data?.recent   ?? [];
  const total    = upcoming.length + recent.length;

  const aboveIPO  = recent.filter(i => (i.change ?? 0) > 0).length;
  const avgReturn = recent.length
    ? recent.reduce((s, i) => s + (i.change ?? 0), 0) / recent.length
    : null;

  return (
    <div className="space-y-5">
      {/* Refresh row */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          {dataUpdatedAt > 0 && (
            <>
              <Clock className="w-3 h-3" />
              Updated {new Date(dataUpdatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {!isLoading && total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Upcoming", value: upcoming.length, color: "text-blue-400" },
            { label: "Recent Listings", value: recent.length, color: "text-foreground" },
            { label: "Above IPO Price", value: aboveIPO, color: "text-green-400" },
            {
              label: "Avg Return",
              value: avgReturn !== null ? `${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(1)}%` : "—",
              color: avgReturn !== null ? (avgReturn >= 0 ? "text-green-400" : "text-red-400") : "text-muted-foreground",
            },
          ].map(k => (
            <div key={k.label} className="rounded-xl bg-card border border-border/50 px-4 py-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-0.5 ${k.color}`} style={{ fontFamily: "var(--font-display)" }}>
                {k.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      )}

      {/* No data */}
      {!isLoading && total === 0 && (
        <div className="rounded-xl bg-card border border-border/50 p-12 text-center space-y-3">
          <Building2 className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No listing data available for this exchange right now.</p>
          <p className="text-xs text-muted-foreground/60">Data is sourced from Yahoo Finance. Try refreshing.</p>
        </div>
      )}

      {/* Sections */}
      {!isLoading && total > 0 && (
        <div className="space-y-5">
          <>
          <IPOSection
            title="Upcoming Listings"
            icon={<Calendar className="w-4 h-4 text-blue-400" />}
            ipos={upcoming}
            colHeaders={["Company", "IPO Date", "Price", "Change", "Mkt Cap", "Status"]}
          />
          {upcoming.length > 0 && (
            <p className="text-xs text-muted-foreground/50 -mt-3 px-1">
              IPO dates and pricing shown as TBA until officially priced. Change column reflects post-listing performance only.
            </p>
          )}
          </>
          <IPOSection
            title="Recent Listings"
            icon={<TrendingUp className="w-4 h-4 text-green-400" />}
            ipos={recent}
            colHeaders={["Company", "Listed", "Price", "vs IPO", "Mkt Cap", "Performance"]}
          />
        </div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function IPOListings() {
  const [activeExchange, setActiveExchange] = useState("all");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-foreground" />
        <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>IPO Listings</h1>
        <span className="text-xs text-muted-foreground">Global exchanges · Updated hourly</span>
      </div>

      {/* Exchange tabs — horizontally scrollable */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1.5 min-w-max">
          {EXCHANGES.map(ex => (
            <button
              key={ex.id}
              onClick={() => setActiveExchange(ex.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeExchange === ex.id
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              }`}
              data-testid={`tab-ipo-${ex.id}`}
            >
              <span>{ex.flag}</span>
              <span>{ex.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active exchange panel */}
      <ExchangePanel key={activeExchange} exchangeId={activeExchange} />
    </div>
  );
}
