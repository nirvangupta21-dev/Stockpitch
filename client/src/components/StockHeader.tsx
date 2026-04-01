import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { QuoteData } from "@/pages/Dashboard";

interface Props {
  quote?: QuoteData;
  loading: boolean;
  error?: Error;
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMarketCap(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export default function StockHeader({ quote, loading, error }: Props) {
  if (loading) {
    return (
      <div className="flex items-start gap-6">
        <div>
          <div className="skeleton h-8 w-32 mb-2" />
          <div className="skeleton h-5 w-48" />
        </div>
        <div className="ml-auto">
          <div className="skeleton h-12 w-36 mb-2" />
          <div className="skeleton h-5 w-24" />
        </div>
      </div>
    );
  }

  if (error || !quote) {
    const msg = error?.message || "Failed to load stock data. Try a different ticker.";
    const isCap = msg.includes("market cap below") || msg.includes("$1B");
    const isExchange = msg.includes("NYSE or NASDAQ") || msg.includes("not NYSE");
    const isRestricted = isCap || isExchange;
    return (
      <div className={`p-4 rounded-lg border text-sm flex items-start gap-3 ${
        isRestricted
          ? "bg-yellow-500/10 border-yellow-500/25 text-yellow-300"
          : "bg-destructive/10 border-destructive/20 text-destructive"
      }`}>
        {isRestricted && <span className="text-lg leading-none mt-0.5">⚠️</span>}
        <div>
          {isCap && <><strong>Market cap too small.</strong> This platform only supports NYSE &amp; NASDAQ stocks with a market cap above $1B.</>}
          {isExchange && <><strong>Exchange not supported.</strong> This platform only supports stocks listed on NYSE or NASDAQ.</>}
          {!isRestricted && msg}
        </div>
      </div>
    );
  }

  const up = quote.change >= 0;
  const Icon = up ? TrendingUp : TrendingDown;

  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
      {/* Left — name and ticker */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span
            data-testid="text-ticker"
            className="text-2xl font-bold font-mono tracking-tight text-primary"
          >
            {quote.ticker}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase font-medium">
            {quote.exchange}
          </span>
        </div>
        <h1
          data-testid="text-company-name"
          className="text-foreground/80 text-base font-medium leading-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {quote.name}
        </h1>
      </div>

      {/* Right — price and change */}
      <div className="text-right">
        <div
          data-testid="text-price"
          className="text-4xl font-bold tabular-nums"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}
        >
          {quote.currency === "USD" ? "$" : quote.currency + " "}
          {fmt(quote.price)}
        </div>
        <div
          data-testid="text-change"
          className={`flex items-center justify-end gap-1.5 mt-1 text-sm font-semibold tabular-nums ${
            up ? "text-green-400" : "text-red-400"
          }`}
        >
          <Icon className="w-4 h-4" />
          <span>{up ? "+" : ""}{fmt(quote.change)}</span>
          <span className={`px-2 py-0.5 rounded text-xs ${up ? "bg-green-500/15" : "bg-red-500/15"}`}>
            {up ? "+" : ""}{fmt(quote.changePercent)}%
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          vs prev. close {quote.currency === "USD" ? "$" : ""}{fmt(quote.previousClose)}
        </p>
      </div>
    </div>
  );
}
