import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ComposedChart,
  Line,
} from "recharts";
import type { HistoryPoint } from "@/pages/Dashboard";
import { TrendingUp, TrendingDown, Brain } from "lucide-react";

interface Props {
  ticker: string;
  history: HistoryPoint[];
  loading: boolean;
  range: string;
  onRangeChange: (r: string) => void;
  currentPrice?: number;
}

const RANGES = [
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y" },
  { label: "2Y", value: "2y" },
  { label: "5Y", value: "5y" },
];

// Simple linear regression prediction
function linearRegression(data: { x: number; y: number }[]) {
  const n = data.length;
  const sumX = data.reduce((s, d) => s + d.x, 0);
  const sumY = data.reduce((s, d) => s + d.y, 0);
  const sumXY = data.reduce((s, d) => s + d.x * d.y, 0);
  const sumXX = data.reduce((s, d) => s + d.x * d.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// Build 30-day prediction from last N historical points
function buildPrediction(history: HistoryPoint[], daysAhead = 30) {
  if (history.length < 20) return [];
  const recent = history.slice(-90);
  const points = recent.map((h, i) => ({ x: i, y: h.close }));
  const { slope, intercept } = linearRegression(points);

  // Add trend momentum + mean reversion
  const lastClose = history[history.length - 1].close;
  const lastDate = new Date(history[history.length - 1].date);

  // Volatility from recent 30 days
  const recentPrices = history.slice(-30).map(h => h.close);
  const returns = recentPrices.slice(1).map((p, i) => Math.log(p / recentPrices[i]));
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const stdDev = Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length);

  const predictions = [];
  for (let d = 1; d <= daysAhead; d++) {
    const date = new Date(lastDate);
    date.setDate(date.getDate() + d);
    // Skip weekends
    if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    if (date.getDay() === 6) date.setDate(date.getDate() + 2);

    const trendComponent = slope * (recent.length + d) + intercept;
    const predicted = lastClose * (1 + avgReturn * d + 0.3 * (trendComponent / lastClose - 1));
    const upper = predicted * (1 + stdDev * Math.sqrt(d) * 1.5);
    const lower = predicted * (1 - stdDev * Math.sqrt(d) * 1.5);

    predictions.push({
      date: date.toISOString().split("T")[0],
      predicted: parseFloat(predicted.toFixed(2)),
      upper: parseFloat(upper.toFixed(2)),
      lower: parseFloat(lower.toFixed(2)),
    });
  }
  return predictions;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const isPrediction = d?.predicted !== undefined && d?.close === undefined;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-2xl text-xs min-w-[160px]">
      <p className="text-muted-foreground mb-2 font-medium">{label}</p>
      {d?.close && (
        <p className="text-foreground font-semibold tabular-nums">
          Close: <span className="text-primary">${d.close.toFixed(2)}</span>
        </p>
      )}
      {isPrediction && (
        <>
          <p className="text-yellow-400 font-semibold tabular-nums">
            Predicted: ${d.predicted?.toFixed(2)}
          </p>
          <p className="text-muted-foreground tabular-nums">
            Range: ${d.lower?.toFixed(2)} – ${d.upper?.toFixed(2)}
          </p>
        </>
      )}
    </div>
  );
}

export default function PriceChart({ ticker, history, loading, range, onRangeChange, currentPrice }: Props) {
  const [showPrediction, setShowPrediction] = useState(true);

  const predictions = useMemo(() => buildPrediction(history), [history]);

  const chartData = useMemo(() => {
    const hist = history.map(h => ({ date: h.date, close: h.close }));
    if (!showPrediction || predictions.length === 0) return hist;
    // Bridge: last historical point also has prediction data
    const bridge = { ...hist[hist.length - 1], predicted: hist[hist.length - 1]?.close };
    const pred = predictions.map(p => ({ date: p.date, predicted: p.predicted, upper: p.upper, lower: p.lower }));
    return [...hist, bridge, ...pred];
  }, [history, predictions, showPrediction]);

  const firstClose = history[0]?.close;
  const lastClose = history[history.length - 1]?.close;
  const periodReturn = firstClose && lastClose ? ((lastClose - firstClose) / firstClose) * 100 : null;
  const isUp = (periodReturn ?? 0) >= 0;

  // Y axis domain with padding
  const allPrices = [
    ...history.map(h => h.close),
    ...(showPrediction ? predictions.flatMap(p => [p.lower, p.upper]) : []),
  ].filter(Boolean);
  const minP = Math.min(...allPrices) * 0.97;
  const maxP = Math.max(...allPrices) * 1.03;

  // Format date labels based on range
  function fmtDate(str: string) {
    const d = new Date(str + "T12:00:00"); // noon to avoid DST issues
    if (range === "1mo" || range === "3mo") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (range === "6mo" || range === "1y") {
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    }
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  const predTarget = predictions[predictions.length - 1]?.predicted;
  const predChange = predTarget && currentPrice ? ((predTarget - currentPrice) / currentPrice) * 100 : null;

  return (
    <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
      {/* Chart header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 pb-0 border-b border-border/30">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              Price History
            </h2>
            {periodReturn !== null && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded tabular-nums ${
                isUp ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
              }`}>
                {isUp ? "+" : ""}{periodReturn.toFixed(2)}% this period
              </span>
            )}
          </div>
          {showPrediction && predChange !== null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="text-yellow-400">30-day prediction: </span>
              ${predTarget?.toFixed(2)} ({predChange >= 0 ? "+" : ""}{predChange.toFixed(2)}%)
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap pb-4 sm:pb-0">
          {/* Prediction toggle */}
          <button
            data-testid="button-toggle-prediction"
            onClick={() => setShowPrediction(p => !p)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${
              showPrediction
                ? "bg-yellow-500/15 border-yellow-500/30 text-yellow-400"
                : "bg-transparent border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            AI Forecast
          </button>

          {/* Range buttons */}
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {RANGES.map(r => (
              <button
                key={r.value}
                data-testid={`button-range-${r.value}`}
                onClick={() => onRangeChange(r.value)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                  range === r.value
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart body */}
      <div className="p-4 pt-6" style={{ height: 360 }}>
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="skeleton h-full w-full rounded-lg" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(185,80%,50%)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(185,80%,50%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(45,90%,55%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(45,90%,55%)" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,18%)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fontSize: 11, fill: "hsl(210,10%,50%)", fontFamily: "var(--font-mono)" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[minP, maxP]}
                tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+"k" : v.toFixed(0)}`}
                tick={{ fontSize: 11, fill: "hsl(210,10%,50%)", fontFamily: "var(--font-mono)" }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip content={<CustomTooltip />} />

              {currentPrice && (
                <ReferenceLine
                  y={currentPrice}
                  stroke="hsl(210,15%,45%)"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              )}

              {/* Historical area */}
              <Area
                type="monotone"
                dataKey="close"
                stroke="hsl(185,80%,50%)"
                strokeWidth={2}
                fill="url(#histGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "hsl(185,80%,50%)", stroke: "hsl(220,18%,10%)", strokeWidth: 2 }}
                connectNulls
              />

              {/* Confidence band upper */}
              {showPrediction && (
                <Area
                  type="monotone"
                  dataKey="upper"
                  stroke="transparent"
                  fill="url(#predGrad)"
                  dot={false}
                  connectNulls
                />
              )}

              {/* Prediction line */}
              {showPrediction && (
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="hsl(45,90%,55%)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  activeDot={{ r: 4, fill: "hsl(45,90%,55%)", stroke: "hsl(220,18%,10%)", strokeWidth: 2 }}
                  connectNulls
                />
              )}

              {/* Confidence band lower */}
              {showPrediction && (
                <Area
                  type="monotone"
                  dataKey="lower"
                  stroke="transparent"
                  fill="transparent"
                  dot={false}
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      <div className="px-4 pb-4 flex items-center gap-5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-primary rounded" />
          <span>Historical Price</span>
        </div>
        {showPrediction && (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 rounded" style={{ background: "hsl(45,90%,55%)", borderTop: "2px dashed hsl(45,90%,55%)" }} />
              <span>30-Day Forecast</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-3 rounded opacity-40" style={{ background: "hsl(45,90%,55%)" }} />
              <span>Confidence Band</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
