import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Plus, Trash2, FileText, ChevronDown, ChevronUp } from "lucide-react";
import type { QuoteData, HistoryPoint } from "@/pages/Dashboard";

interface Props {
  quote?: QuoteData;
  history: HistoryPoint[];
}

interface ThesisPoint {
  id: number;
  text: string;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtMarketCap(n: number | null | undefined) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

let idCounter = 1;

export default function ThesisBuilder({ quote, history }: Props) {
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [points, setPoints] = useState<ThesisPoint[]>([
    { id: idCounter++, text: "" },
  ]);
  const [targetPrice, setTargetPrice] = useState("");
  const [timeHorizon, setTimeHorizon] = useState("12");
  const [conviction, setConviction] = useState<"high" | "medium" | "low">("medium");
  const [catalysts, setCatalysts] = useState("");
  const [risks, setRisks] = useState("");
  const [expanded, setExpanded] = useState(true);

  // Derive implied upside/downside
  const currentPrice = quote?.price;
  const target = parseFloat(targetPrice);
  const impliedReturn = currentPrice && !isNaN(target) && target > 0
    ? ((target - currentPrice) / currentPrice) * 100
    : null;

  // Period return from history
  const periodReturn = history.length >= 2
    ? ((history[history.length - 1].close - history[0].close) / history[0].close) * 100
    : null;

  function addPoint() {
    setPoints(p => [...p, { id: idCounter++, text: "" }]);
  }

  function removePoint(id: number) {
    setPoints(p => p.filter(pt => pt.id !== id));
  }

  function updatePoint(id: number, text: string) {
    setPoints(p => p.map(pt => pt.id === id ? { ...pt, text } : pt));
  }

  const isLong = direction === "long";
  const accentColor = isLong ? "text-green-400" : "text-red-400";
  const accentBg = isLong ? "bg-green-500/10 border-green-500/25" : "bg-red-500/10 border-red-500/25";
  const accentFill = isLong ? "bg-green-500/20 hover:bg-green-500/30" : "bg-red-500/20 hover:bg-red-500/30";

  const filledPoints = points.filter(p => p.text.trim().length > 0);

  return (
    <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/40 transition-colors"
        data-testid="button-toggle-thesis"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Investment Thesis Builder
          </h2>
          {quote && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${accentBg} ${accentColor}`}>
              {isLong ? "LONG" : "SHORT"} {quote.ticker}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-border/30 pt-5">

          {/* Long / Short Toggle */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Direction</p>
            <div className="flex gap-2">
              <button
                data-testid="button-long"
                onClick={() => setDirection("long")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border font-semibold text-sm transition-all ${
                  isLong
                    ? "bg-green-500/15 border-green-500/40 text-green-400"
                    : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                Long
              </button>
              <button
                data-testid="button-short"
                onClick={() => setDirection("short")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border font-semibold text-sm transition-all ${
                  !isLong
                    ? "bg-red-500/15 border-red-500/40 text-red-400"
                    : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <TrendingDown className="w-4 h-4" />
                Short
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left column */}
            <div className="space-y-4">
              {/* Price target + time horizon */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1.5">
                    Price Target
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <input
                      data-testid="input-price-target"
                      type="number"
                      value={targetPrice}
                      onChange={e => setTargetPrice(e.target.value)}
                      placeholder={currentPrice ? fmt(currentPrice) : "0.00"}
                      className="w-full pl-7 pr-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
                    />
                  </div>
                  {impliedReturn !== null && (
                    <p className={`text-xs mt-1 font-semibold tabular-nums ${impliedReturn >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {impliedReturn >= 0 ? "+" : ""}{fmt(impliedReturn)}% implied {isLong ? "upside" : "downside"}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1.5">
                    Horizon (months)
                  </label>
                  <select
                    data-testid="select-horizon"
                    value={timeHorizon}
                    onChange={e => setTimeHorizon(e.target.value)}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    {["3","6","12","18","24","36"].map(v => (
                      <option key={v} value={v}>{v}mo</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Conviction level */}
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1.5">
                  Conviction
                </label>
                <div className="flex gap-2">
                  {(["high","medium","low"] as const).map(c => (
                    <button
                      key={c}
                      data-testid={`button-conviction-${c}`}
                      onClick={() => setConviction(c)}
                      className={`flex-1 py-1.5 text-xs rounded-lg border font-medium capitalize transition-all ${
                        conviction === c
                          ? c === "high"
                            ? "bg-primary/15 border-primary/40 text-primary"
                            : c === "medium"
                            ? "bg-yellow-500/15 border-yellow-500/40 text-yellow-400"
                            : "bg-muted border-border text-muted-foreground"
                          : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Key catalysts */}
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1.5">
                  Key Catalysts
                </label>
                <textarea
                  data-testid="input-catalysts"
                  value={catalysts}
                  onChange={e => setCatalysts(e.target.value)}
                  placeholder={isLong
                    ? "e.g. upcoming earnings beat, new product launch, margin expansion…"
                    : "e.g. competitive pressure, guidance cut, balance sheet concerns…"
                  }
                  rows={3}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                />
              </div>

              {/* Key risks */}
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1.5">
                  Key Risks
                </label>
                <textarea
                  data-testid="input-risks"
                  value={risks}
                  onChange={e => setRisks(risks => e.target.value)}
                  placeholder={isLong
                    ? "e.g. valuation re-rating, macro headwinds, execution risk…"
                    : "e.g. short squeeze risk, activist investor, surprise beat…"
                  }
                  rows={3}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                />
              </div>
            </div>

            {/* Right column — thesis points */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                  {isLong ? "Bull Case" : "Bear Case"} — Core Arguments
                </label>
                <span className="text-xs text-muted-foreground">{filledPoints.length} point{filledPoints.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="space-y-2">
                {points.map((pt, i) => (
                  <div key={pt.id} className="flex gap-2 items-start">
                    <div className={`mt-2.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${accentBg} ${accentColor}`}>
                      {i + 1}
                    </div>
                    <input
                      data-testid={`input-thesis-point-${i}`}
                      type="text"
                      value={pt.text}
                      onChange={e => updatePoint(pt.id, e.target.value)}
                      placeholder={isLong
                        ? ["Strong revenue growth trajectory", "Undervalued relative to peers", "Expanding TAM & market share gains", "Management execution track record"][i % 4]
                        : ["Deteriorating fundamentals", "Overvalued vs. sector median", "Weakening competitive moat", "Regulatory or legal overhang"][i % 4]
                      }
                      className="flex-1 px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    {points.length > 1 && (
                      <button
                        onClick={() => removePoint(pt.id)}
                        className="mt-2 text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                data-testid="button-add-point"
                onClick={addPoint}
                className="w-full py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add argument
              </button>

              {/* Thesis summary card */}
              {quote && (filledPoints.length > 0 || targetPrice) && (
                <div className={`rounded-lg border p-4 space-y-2 mt-2 ${accentBg}`}>
                  <p className={`text-xs font-bold uppercase tracking-wider ${accentColor}`}>
                    {isLong ? "▲ LONG" : "▼ SHORT"} THESIS SUMMARY
                  </p>
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    <span className="font-semibold text-foreground">{quote.ticker}</span>
                    {" "}({quote.name}) — {isLong ? "BUY" : "SELL SHORT"} with{" "}
                    <span className="font-semibold">{conviction}</span> conviction.
                    {targetPrice && !isNaN(target) && (
                      <> Price target <span className="font-semibold text-foreground">${fmt(target)}</span>
                      {impliedReturn !== null && (
                        <span className={`font-semibold ${accentColor}`}> ({impliedReturn >= 0 ? "+" : ""}{fmt(impliedReturn)}%)</span>
                      )}
                      {" "}over <span className="font-semibold">{timeHorizon} months</span>.</>
                    )}
                  </p>
                  {filledPoints.length > 0 && (
                    <ul className="space-y-0.5">
                      {filledPoints.map((p, i) => (
                        <li key={p.id} className="text-xs text-foreground/70 flex gap-1.5">
                          <span className={accentColor}>{isLong ? "+" : "−"}</span>
                          {p.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Context from stock data */}
          {quote && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border/30">
              {[
                { label: "Market Cap", value: fmtMarketCap(quote.marketCap) },
                { label: "Current Price", value: `$${fmt(quote.price)}` },
                { label: "52W Range", value: `$${fmt(quote.fiftyTwoWeekLow ?? 0)} – $${fmt(quote.fiftyTwoWeekHigh ?? 0)}` },
                { label: "1Y Return", value: periodReturn !== null ? `${periodReturn >= 0 ? "+" : ""}${fmt(periodReturn)}%` : "—" },
              ].map(m => (
                <div key={m.label} className="text-xs">
                  <p className="text-muted-foreground uppercase tracking-wider mb-0.5">{m.label}</p>
                  <p className="font-semibold tabular-nums text-foreground" style={{ fontFamily: "var(--font-mono)" }}>{m.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
