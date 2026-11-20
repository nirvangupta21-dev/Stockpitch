import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layers, AlertTriangle } from "lucide-react";
import SectionHeader from "./SectionHeader";

interface Holding {
  symbol: string;
  name: string;
  weight: number; // percent
}

interface HoldingsData {
  ticker: string;
  holdings: Holding[];
  positions: { stocks: number | null; bonds: number | null; cash: number | null };
}

/**
 * EtfHoldings — shown on the stock view when the ticker is an ETF.
 * Lists the fund's top holdings with weights, plus its asset breakdown.
 */
export default function EtfHoldings({
  ticker,
  onSelectTicker,
}: {
  ticker: string;
  onSelectTicker: (t: string) => void;
}) {
  const { data, isLoading, error } = useQuery<HoldingsData>({
    queryKey: ["/api/etf/holdings", ticker],
    queryFn: () => apiRequest("GET", `/api/etf/holdings/${ticker}`).then(r => r.json()),
    staleTime: 6 * 60 * 60 * 1000, // holdings change infrequently
    retry: 1,
  });

  return (
    <section className="space-y-4" data-testid="etf-holdings">
      <SectionHeader
        icon={Layers}
        title={`What's inside ${ticker}`}
        meta={<span>Top holdings by weight</span>}
      />

      {isLoading ? (
        <div className="rounded-2xl bg-card border border-border/50 p-5 space-y-3">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="skeleton h-9 rounded-lg" />)}
        </div>
      ) : error || !data?.holdings?.length ? (
        <div className="rounded-2xl bg-card border border-border/50 p-8 text-center">
          <AlertTriangle className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Holdings data isn't available for this fund right now.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-card border border-border/50 p-5">
          {/* Holdings rows */}
          <div className="space-y-2.5">
            {data.holdings.map((h, i) => {
              const max = data.holdings[0].weight || 1;
              const pctOfMax = Math.max((h.weight / max) * 100, 6);
              return (
                <button
                  key={h.symbol}
                  onClick={() => onSelectTicker(h.symbol)}
                  data-testid={`holding-${h.symbol}`}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-secondary/40 transition-colors text-left group"
                  title={`Open ${h.symbol}`}
                >
                  <span className="w-5 text-xs text-muted-foreground/60 tabular-nums shrink-0">
                    {i + 1}
                  </span>
                  <span className="font-mono font-bold text-sm text-primary w-14 shrink-0">
                    {h.symbol}
                  </span>
                  <span className="text-sm text-muted-foreground truncate min-w-0 flex-1">
                    {h.name}
                  </span>
                  {/* weight bar */}
                  <span className="hidden sm:flex items-center w-28 shrink-0">
                    <span
                      className="h-1.5 rounded-full accent-gradient opacity-80 group-hover:opacity-100 transition-opacity"
                      style={{ width: `${pctOfMax}%` }}
                    />
                  </span>
                  <span className="text-sm font-bold tabular-nums text-foreground w-14 text-right shrink-0">
                    {h.weight.toFixed(2)}%
                  </span>
                </button>
              );
            })}
          </div>

          {/* Asset breakdown */}
          <div className="mt-5 pt-4 border-t border-border/30 grid grid-cols-3 gap-3">
            {[
              { label: "Stocks", value: data.positions.stocks },
              { label: "Bonds", value: data.positions.bonds },
              { label: "Cash", value: data.positions.cash },
            ].map(p => (
              <div key={p.label} className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{p.label}</p>
                <p className="text-sm font-bold tabular-nums mt-0.5">
                  {p.value === null ? "—" : `${p.value.toFixed(1)}%`}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-[10px] text-muted-foreground/50 text-center">
            Top holdings as reported by the fund. Holdings change daily — full portfolios are published monthly.
          </p>
        </div>
      )}
    </section>
  );
}
