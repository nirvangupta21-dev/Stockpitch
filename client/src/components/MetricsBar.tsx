import type { QuoteData } from "@/pages/Dashboard";

interface Props {
  quote?: QuoteData;
  loading: boolean;
}

function fmt(n: number | undefined, decimals = 2) {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtVolume(n: number | undefined) {
  if (!n) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

function fmtMarketCap(n: number | undefined) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

interface MetricProps {
  label: string;
  value: string;
  highlight?: boolean;
  loading?: boolean;
}

function Metric({ label, value, highlight, loading }: MetricProps) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 rounded-lg bg-card border border-border/50 min-w-[120px]">
      <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</span>
      {loading ? (
        <div className="skeleton h-5 w-20" />
      ) : (
        <span
          className={`text-sm font-semibold tabular-nums ${highlight ? "text-primary" : "text-foreground"}`}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

export default function MetricsBar({ quote, loading }: Props) {
  const rangePercent = quote?.fiftyTwoWeekHigh && quote?.fiftyTwoWeekLow && quote?.price
    ? ((quote.price - quote.fiftyTwoWeekLow) / (quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow)) * 100
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3" data-testid="metrics-bar">
        <Metric label="52W High" value={quote?.fiftyTwoWeekHigh ? `$${fmt(quote.fiftyTwoWeekHigh)}` : "—"} loading={loading} />
        <Metric label="52W Low" value={quote?.fiftyTwoWeekLow ? `$${fmt(quote.fiftyTwoWeekLow)}` : "—"} loading={loading} />
        <Metric label="Volume" value={fmtVolume(quote?.volume)} loading={loading} />
        <Metric label="Market Cap" value={fmtMarketCap(quote?.marketCap)} highlight loading={loading} />
      </div>

      {/* 52-week price range bar */}
      {!loading && rangePercent !== null && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground tabular-nums w-14 text-right">${fmt(quote?.fiftyTwoWeekLow)}</span>
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden relative">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 via-yellow-400 to-green-400 rounded-full"
              style={{ width: "100%" }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-primary shadow-lg shadow-primary/40"
              style={{ left: `calc(${Math.min(100, Math.max(0, rangePercent))}% - 6px)` }}
              title={`Current: $${fmt(quote?.price)}`}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums w-14">${fmt(quote?.fiftyTwoWeekHigh)}</span>
          <span className="text-xs text-muted-foreground">52W Range</span>
        </div>
      )}
    </div>
  );
}
