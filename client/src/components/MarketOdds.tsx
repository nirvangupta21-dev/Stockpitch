import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Scale, ExternalLink, Clock } from "lucide-react";

interface OddsOutcome {
  name: string;
  prob: number; // percent
}

interface OddsItem {
  category: string;
  question: string;
  outcomes: OddsOutcome[];
  volume24hr: number;
  endDate: string | null;
  link: string;
}

interface OddsData {
  asOf: string;
  items: OddsItem[];
}

const CATEGORY_COLOR: Record<string, string> = {
  "Fed policy": "from-violet-500 to-indigo-500",
  Economy: "from-rose-500 to-orange-500",
  Equities: "from-emerald-500 to-teal-500",
  Crypto: "from-amber-500 to-yellow-500",
  "US politics": "from-sky-500 to-blue-500",
};

function barColor(outcome: OddsOutcome, idx: number): string {
  // Yes-style outcomes lean positive (emerald), No lean neutral (slate);
  // everything else falls back to the accent ramp.
  if (outcome.name === "Yes") return "from-emerald-400 to-emerald-500";
  if (outcome.name === "No") return "from-slate-400 to-slate-500";
  return ["from-iris-400 to-iris-500", "from-cyan-400 to-sky-500", "from-violet-400 to-purple-500", "from-amber-400 to-orange-500"][idx % 4];
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}

function formatEnd(endDate: string | null): string | null {
  if (!endDate) return null;
  try {
    return new Date(endDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

export default function MarketOdds() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/market/odds"],
    queryFn: () => apiRequest("GET", "/api/market/odds").then((r) => r.json()) as Promise<OddsData>,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  const items = data?.items ?? [];
  const asOf = data?.asOf ? new Date(data.asOf).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl shadow-[0_8px_32px_-8px_rgba(15,23,42,0.45)] p-5"
      data-testid="section-market-odds"
    >
      {/* ambient sheen */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/8 to-transparent" />

      <header className="relative flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/25 to-indigo-500/25 border border-white/15 shadow-inner">
            <Scale className="h-4.5 w-4.5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Market Odds
            </h3>
            <p className="text-xs text-muted-foreground">
              What prediction markets are pricing for macro events
            </p>
          </div>
        </div>
        {asOf && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {asOf}
          </span>
        )}
      </header>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Prediction-market odds are unavailable right now.
        </p>
      ) : (
        <div className="relative grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const end = formatEnd(item.endDate);
            const barGrad = CATEGORY_COLOR[item.category] ?? "from-iris-500 to-violet-500";
            return (
              <article
                key={item.question}
                className="group rounded-xl border border-white/10 bg-background/40 p-4 transition-all hover:border-white/25 hover:bg-background/60"
                data-testid="odds-card"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className={`inline-flex rounded-full bg-gradient-to-r ${barGrad} bg-clip-text px-0 text-[10px] font-semibold uppercase tracking-wider text-transparent`}>
                    {item.category}
                  </span>
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    aria-label={`Open ${item.question} on Polymarket`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>

                <h4 className="text-sm font-medium leading-snug mb-3">{item.question}</h4>

                <div className="space-y-2">
                  {item.outcomes.slice(0, 3).map((o, idx) => (
                    <div key={o.name} className="flex items-center gap-2">
                      <span className="w-9 shrink-0 text-[11px] text-muted-foreground truncate">{o.name}</span>
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${barColor(o, idx)}`}
                          style={{ width: `${Math.min(100, Math.max(1.5, o.prob))}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums">
                        {o.prob.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="tabular-nums">{formatVolume(item.volume24hr)} 24h</span>
                  {end && <span className="tabular-nums">Ends {end}</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <footer className="relative mt-4 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground/70">
          Market-implied probabilities from Polymarket — not financial advice.
        </p>
        <a
          href="https://polymarket.com"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-medium text-violet-400 hover:text-violet-300 transition-colors"
        >
          Polymarket
        </a>
      </footer>
    </section>
  );
}
