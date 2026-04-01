import { useState, useMemo } from "react";
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
import { DollarSign, TrendingUp, TrendingDown, Calendar, BarChart2, Info } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface Props {
  ticker: string;
  currentPrice?: number;
  history: HistoryPoint[];
  companyName?: string;
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrency(n: number) {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${fmt(n)}`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-2xl text-xs min-w-[180px]">
      <p className="text-muted-foreground mb-2 font-medium">{label}</p>
      <p className="tabular-nums text-foreground">
        Portfolio: <span className={d.value >= d.invested ? "text-green-400" : "text-red-400"}>
          {fmtCurrency(d.value)}
        </span>
      </p>
      <p className="tabular-nums text-muted-foreground">
        Invested: <span className="text-foreground">{fmtCurrency(d.invested)}</span>
      </p>
      <p className={`tabular-nums font-semibold ${d.gain >= 0 ? "text-green-400" : "text-red-400"}`}>
        {d.gain >= 0 ? "Gain" : "Loss"}: {d.gain >= 0 ? "+" : ""}{fmtCurrency(d.gain)} ({d.returnPct >= 0 ? "+" : ""}{d.returnPct.toFixed(2)}%)
      </p>
    </div>
  );
}

export default function InvestmentCalculator({ ticker, currentPrice, history, companyName }: Props) {
  const [investment, setInvestment] = useState(10000);
  const [investmentInput, setInvestmentInput] = useState("10000");
  const [horizon, setHorizon] = useState(365); // days into history to "start" investment

  const maxHorizon = Math.min(history.length - 1, 1825); // max 5 years back

  // Build portfolio value over time starting from 'horizon' days ago
  const portfolioData = useMemo(() => {
    if (!history.length || !investment) return [];
    const startIdx = Math.max(0, history.length - 1 - horizon);
    const entryPrice = history[startIdx]?.close;
    if (!entryPrice || entryPrice <= 0) return [];

    const shares = investment / entryPrice;

    return history.slice(startIdx).map((h) => {
      const value = shares * h.close;
      const gain = value - investment;
      const returnPct = ((h.close - entryPrice) / entryPrice) * 100;
      return {
        date: new Date(h.date).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        value: parseFloat(value.toFixed(2)),
        invested: investment,
        gain: parseFloat(gain.toFixed(2)),
        returnPct: parseFloat(returnPct.toFixed(2)),
        price: h.close,
      };
    });
  }, [history, investment, horizon]);

  const entryPrice = history[Math.max(0, history.length - 1 - horizon)]?.close;
  const currentVal = portfolioData[portfolioData.length - 1]?.value ?? 0;
  const gain = currentVal - investment;
  const gainPct = investment > 0 ? (gain / investment) * 100 : 0;
  const isProfit = gain >= 0;
  const shares = entryPrice ? investment / entryPrice : 0;

  // Annualized return
  const years = horizon / 365;
  const annualizedReturn = years > 0.1 && investment > 0
    ? (Math.pow(currentVal / investment, 1 / years) - 1) * 100
    : 0;

  // Max drawdown
  const maxDrawdown = useMemo(() => {
    if (!portfolioData.length) return 0;
    let peak = portfolioData[0].value;
    let maxDD = 0;
    for (const d of portfolioData) {
      if (d.value > peak) peak = d.value;
      const dd = (d.value - peak) / peak * 100;
      if (dd < maxDD) maxDD = dd;
    }
    return maxDD;
  }, [portfolioData]);

  const horizonLabel = horizon >= 365
    ? `${Math.round(horizon / 365 * 10) / 10}Y ago`
    : `${horizon}D ago`;

  function handleInvestmentChange(val: string) {
    setInvestmentInput(val);
    const n = parseFloat(val.replace(/,/g, ""));
    if (!isNaN(n) && n > 0) setInvestment(n);
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <BarChart2 className="w-5 h-5 text-primary" />
        <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Investment Simulator
        </h2>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5" />
          <span>Historical simulation • Not financial advice</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Controls panel */}
        <div className="rounded-xl bg-card border border-border/50 p-5 space-y-6">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-2">
              Initial Investment
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                data-testid="input-investment"
                type="text"
                value={investmentInput}
                onChange={e => handleInvestmentChange(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-secondary border border-border rounded-lg text-foreground text-sm font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
                placeholder="10000"
              />
            </div>
            <div className="flex gap-2 mt-2">
              {[1000, 5000, 10000, 50000].map(v => (
                <button
                  key={v}
                  data-testid={`button-preset-${v}`}
                  onClick={() => { setInvestment(v); setInvestmentInput(v.toString()); }}
                  className={`flex-1 py-1 text-xs rounded border transition-all font-medium ${
                    investment === v
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  ${v >= 1000 ? `${v/1000}K` : v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Start Date
              </label>
              <span className="text-xs text-primary font-mono font-semibold">{horizonLabel}</span>
            </div>
            <Slider
              data-testid="slider-horizon"
              min={30}
              max={maxHorizon || 365}
              step={30}
              value={[horizon]}
              onValueChange={([v]) => setHorizon(v)}
              className="mt-3"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>1M</span>
              <span>Today</span>
            </div>
            {entryPrice && (
              <p className="text-xs text-muted-foreground mt-2">
                Entry price: <span className="text-foreground font-mono">${fmt(entryPrice)}</span>
                {" · "}
                <span className="text-foreground font-mono">{shares.toFixed(4)} shares</span>
              </p>
            )}
          </div>

          {/* Summary stats */}
          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Annualized Return</span>
              <span className={`font-mono font-semibold tabular-nums ${annualizedReturn >= 0 ? "text-green-400" : "text-red-400"}`}>
                {annualizedReturn >= 0 ? "+" : ""}{annualizedReturn.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Max Drawdown</span>
              <span className="font-mono font-semibold tabular-nums text-red-400">
                {maxDrawdown.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Holding Period</span>
              <span className="font-mono text-foreground">
                {Math.round(horizon / 30)}mo
              </span>
            </div>
          </div>
        </div>

        {/* Chart + KPIs */}
        <div className="lg:col-span-2 space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-card border border-border/50 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Invested</p>
              <p className="text-lg font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                {fmtCurrency(investment)}
              </p>
            </div>
            <div className={`rounded-lg border p-4 ${isProfit ? "bg-green-500/8 border-green-500/20 glow-green" : "bg-red-500/8 border-red-500/20 glow-red"}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Current Value</p>
              <p className={`text-lg font-bold tabular-nums ${isProfit ? "text-green-400" : "text-red-400"}`} style={{ fontFamily: "var(--font-display)" }}>
                {fmtCurrency(currentVal)}
              </p>
            </div>
            <div className={`rounded-lg border p-4 ${isProfit ? "bg-green-500/8 border-green-500/20" : "bg-red-500/8 border-red-500/20"}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                {isProfit ? "Capital Gained" : "Capital Lost"}
              </p>
              <div className="flex items-baseline gap-1">
                <p className={`text-lg font-bold tabular-nums ${isProfit ? "text-green-400" : "text-red-400"}`} style={{ fontFamily: "var(--font-display)" }}>
                  {isProfit ? "+" : ""}{fmtCurrency(gain)}
                </p>
                <span className={`text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded ${isProfit ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                  {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Portfolio chart */}
          <div className="rounded-xl bg-card border border-border/50 p-4" style={{ height: 260 }}>
            {portfolioData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Enter an investment amount to see simulation
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={portfolioData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                  <defs>
                    <linearGradient id="gainGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142,71%,45%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(142,71%,45%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(0,72%,51%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(0,72%,51%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,18%)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(210,10%,50%)", fontFamily: "var(--font-mono)" }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={v => fmtCurrency(v)}
                    tick={{ fontSize: 10, fill: "hsl(210,10%,50%)", fontFamily: "var(--font-mono)" }}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine
                    y={investment}
                    stroke="hsl(210,15%,40%)"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{ value: "Cost Basis", position: "right", fontSize: 10, fill: "hsl(210,10%,50%)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={isProfit ? "hsl(142,71%,45%)" : "hsl(0,72%,51%)"}
                    strokeWidth={2}
                    fill={isProfit ? "url(#gainGrad)" : "url(#lossGrad)"}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
