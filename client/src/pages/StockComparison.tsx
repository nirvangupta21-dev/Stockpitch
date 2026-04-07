import {
  useState,
  useMemo,
  useRef,
  useCallback,
  createContext,
  useContext,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { X, Plus, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Constants ────────────────────────────────────────────────────────────────

const PALETTE = [
  "hsl(185,80%,50%)",
  "hsl(45,90%,55%)",
  "hsl(265,70%,60%)",
  "hsl(142,71%,45%)",
  "hsl(0,72%,51%)",
  "hsl(200,80%,60%)",
  "hsl(30,90%,55%)",
];

const DEFAULT_TICKERS = ["AAPL", "NVDA"];

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuoteData {
  ticker: string;
  name?: string;
  price: number;
  changePercent: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  volume?: number;
  exchange?: string;
}

interface HistoryPoint {
  date: string;
  close: number;
  volume: number;
}

interface HistoryData {
  history: HistoryPoint[];
}

interface ComputedMetrics {
  vwap: number | null;
  annualReturn: number | null;
  annualVol: number | null;
  rsi: number | null;
  trend: "Uptrend" | "Downtrend" | null;
}

interface TickerState {
  ticker: string;
  quote: QuoteData | undefined;
  quoteLoading: boolean;
  quoteError: Error | null;
  history: HistoryPoint[];
  historyLoading: boolean;
  computed: ComputedMetrics;
}

// ─── Registry context — lets child TickerLoader push data up ─────────────────

interface RegistryContextValue {
  register: (ticker: string, state: TickerState) => void;
}

const RegistryContext = createContext<RegistryContextValue | null>(null);

// ─── Math Helpers ─────────────────────────────────────────────────────────────

function calcVwap(pts: { close: number; volume: number }[]): number {
  if (!pts.length) return 0;
  let pvSum = 0;
  let vSum = 0;
  for (const p of pts) {
    pvSum += p.close * p.volume;
    vSum += p.volume;
  }
  return vSum === 0 ? 0 : pvSum / vSum;
}

function calcAnnualVol(closes: number[]): number {
  if (closes.length < 2) return 0;
  const logRets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      logRets.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  if (logRets.length < 2) return 0;
  const mean = logRets.reduce((a, b) => a + b, 0) / logRets.length;
  const variance =
    logRets.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (logRets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function calcRsi14(closes: number[]): number {
  if (closes.length < 15) return 50;
  const period = 14;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcOlsSlope(y: number[]): number {
  const n = y.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (y[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// ─── Format Helpers ───────────────────────────────────────────────────────────

function fmtPrice(n: number | undefined): string {
  if (n === undefined || n === null || isNaN(n)) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${n.toFixed(2)}`;
}

function fmtCap(n: number | undefined): string {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtVol(n: number | undefined): string {
  if (!n) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtNum(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toFixed(decimals);
}

// ─── TickerLoader — renders nothing, just loads data and registers it ─────────

function TickerLoader({ ticker }: { ticker: string }) {
  const ctx = useContext(RegistryContext);

  const {
    data: quote,
    isLoading: quoteLoading,
    error: quoteError,
  } = useQuery<QuoteData>({
    queryKey: ["/api/quote", ticker],
    queryFn: () => apiRequest("GET", `/api/quote/${ticker}`).then((r) => r.json()),
    staleTime: 60_000,
    retry: 1,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<HistoryData>({
    queryKey: ["/api/history", ticker],
    queryFn: () => apiRequest("GET", `/api/history/${ticker}`).then((r) => r.json()),
    staleTime: 300_000,
    retry: 1,
  });

  const history = historyData?.history ?? [];

  const computed = useMemo<ComputedMetrics>(() => {
    if (history.length === 0) {
      return { vwap: null, annualReturn: null, annualVol: null, rsi: null, trend: null };
    }
    const closes = history.map((p) => p.close);
    const first = closes[0];
    const last = closes[closes.length - 1];
    return {
      vwap: calcVwap(history),
      annualReturn: first > 0 ? ((last - first) / first) * 100 : null,
      annualVol: calcAnnualVol(closes),
      rsi: calcRsi14(closes),
      trend: calcOlsSlope(closes) >= 0 ? "Uptrend" : "Downtrend",
    };
  }, [history]);

  // Register data into parent context on every render
  if (ctx) {
    ctx.register(ticker, {
      ticker,
      quote,
      quoteLoading,
      quoteError: quoteError as Error | null,
      history,
      historyLoading,
      computed,
    });
  }

  return null;
}

// ─── 52W Range Position Bar ──────────────────────────────────────────────────

function RangeBar({ pos }: { pos: number }) {
  const clamped = Math.max(0, Math.min(100, pos));
  const color =
    clamped < 33
      ? "hsl(0,72%,51%)"
      : clamped < 66
      ? "hsl(45,90%,55%)"
      : "hsl(142,71%,45%)";
  return (
    <div className="flex items-center gap-1.5 justify-center">
      <div className="relative h-1.5 w-20 rounded-full bg-white/10 overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] text-muted-foreground">{clamped.toFixed(0)}%</span>
    </div>
  );
}

// ─── Cell Skeleton ─────────────────────────────────────────────────────────────

function CellSkeleton() {
  return (
    <div className="flex justify-center">
      <Skeleton className="h-4 w-16 rounded" />
    </div>
  );
}

// ─── Metric Row Config ─────────────────────────────────────────────────────────

interface MetricCellProps {
  state: TickerState;
}

interface MetricRowDef {
  label: string;
  render: (props: MetricCellProps) => React.ReactNode;
}

const METRIC_ROWS: MetricRowDef[] = [
  {
    label: "Current Price",
    render: ({ state }) => {
      if (state.quoteLoading) return <CellSkeleton />;
      return (
        <span className="text-foreground font-semibold">{fmtPrice(state.quote?.price)}</span>
      );
    },
  },
  {
    label: "Change % (Today)",
    render: ({ state }) => {
      if (state.quoteLoading) return <CellSkeleton />;
      const v = state.quote?.changePercent;
      if (v === undefined || v === null)
        return <span className="text-muted-foreground">—</span>;
      return (
        <span className={v >= 0 ? "text-green-400" : "text-red-400"}>{fmtPct(v)}</span>
      );
    },
  },
  {
    label: "Market Cap",
    render: ({ state }) => {
      if (state.quoteLoading) return <CellSkeleton />;
      return <span className="text-foreground">{fmtCap(state.quote?.marketCap)}</span>;
    },
  },
  {
    label: "52W High",
    render: ({ state }) => {
      if (state.quoteLoading) return <CellSkeleton />;
      return (
        <span className="text-foreground">{fmtPrice(state.quote?.fiftyTwoWeekHigh)}</span>
      );
    },
  },
  {
    label: "52W Low",
    render: ({ state }) => {
      if (state.quoteLoading) return <CellSkeleton />;
      return (
        <span className="text-foreground">{fmtPrice(state.quote?.fiftyTwoWeekLow)}</span>
      );
    },
  },
  {
    label: "52W Range Position",
    render: ({ state }) => {
      if (state.quoteLoading) return <CellSkeleton />;
      const lo = state.quote?.fiftyTwoWeekLow;
      const hi = state.quote?.fiftyTwoWeekHigh;
      const cur = state.quote?.price;
      if (!lo || !hi || !cur || hi === lo)
        return <span className="text-muted-foreground">—</span>;
      return <RangeBar pos={((cur - lo) / (hi - lo)) * 100} />;
    },
  },
  {
    label: "Volume",
    render: ({ state }) => {
      if (state.quoteLoading) return <CellSkeleton />;
      return <span className="text-foreground">{fmtVol(state.quote?.volume)}</span>;
    },
  },
  {
    label: "VWAP (1Y)",
    render: ({ state }) => {
      if (state.historyLoading) return <CellSkeleton />;
      return (
        <span className="text-foreground">
          {state.computed.vwap !== null ? fmtPrice(state.computed.vwap) : "—"}
        </span>
      );
    },
  },
  {
    label: "Annual Return (1Y)",
    render: ({ state }) => {
      if (state.historyLoading) return <CellSkeleton />;
      const v = state.computed.annualReturn;
      if (v === null) return <span className="text-muted-foreground">—</span>;
      return (
        <span className={v >= 0 ? "text-green-400" : "text-red-400"}>{fmtPct(v)}</span>
      );
    },
  },
  {
    label: "Ann. Volatility",
    render: ({ state }) => {
      if (state.historyLoading) return <CellSkeleton />;
      const v = state.computed.annualVol;
      return (
        <span className="text-foreground">{v !== null ? `${fmtNum(v)}%` : "—"}</span>
      );
    },
  },
  {
    label: "RSI-14",
    render: ({ state }) => {
      if (state.historyLoading) return <CellSkeleton />;
      const v = state.computed.rsi;
      if (v === null) return <span className="text-muted-foreground">—</span>;
      const color =
        v < 30 ? "text-green-400" : v > 70 ? "text-red-400" : "text-yellow-400";
      const label = v < 30 ? "Oversold" : v > 70 ? "Overbought" : "Neutral";
      return (
        <span className={color}>
          {fmtNum(v, 1)}{" "}
          <span className="text-[10px] opacity-70">({label})</span>
        </span>
      );
    },
  },
  {
    label: "Trend",
    render: ({ state }) => {
      if (state.historyLoading) return <CellSkeleton />;
      if (!state.computed.trend)
        return <span className="text-muted-foreground">—</span>;
      const up = state.computed.trend === "Uptrend";
      return (
        <span
          className={`inline-flex items-center gap-1 text-sm font-medium ${
            up ? "text-green-400" : "text-red-400"
          }`}
        >
          {up ? (
            <TrendingUp className="w-3.5 h-3.5" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5" />
          )}
          {state.computed.trend}
        </span>
      );
    },
  },
];

// ─── Overlay Chart ─────────────────────────────────────────────────────────────

interface OverlayChartProps {
  tickers: string[];
  historyMap: Record<string, HistoryPoint[]>;
}

function OverlayChart({ tickers, historyMap }: OverlayChartProps) {
  const chartData = useMemo(() => {
    const allDates = new Set<string>();
    for (const ticker of tickers) {
      const hist = historyMap[ticker] ?? [];
      const slice = hist.slice(-90);
      for (const p of slice) allDates.add(p.date);
    }
    const sortedDates = Array.from(allDates).sort();

    const priceMaps: Record<string, Record<string, number>> = {};
    for (const ticker of tickers) {
      priceMaps[ticker] = {};
      for (const p of historyMap[ticker] ?? []) {
        priceMaps[ticker][p.date] = p.close;
      }
    }

    const startPrices: Record<string, number> = {};
    for (const ticker of tickers) {
      for (const date of sortedDates) {
        const p = priceMaps[ticker][date];
        if (p !== undefined) {
          startPrices[ticker] = p;
          break;
        }
      }
    }

    return sortedDates.map((date) => {
      const row: Record<string, number | string> = { date };
      for (const ticker of tickers) {
        const price = priceMaps[ticker][date];
        const start = startPrices[ticker];
        if (price !== undefined && start !== undefined && start > 0) {
          row[ticker] = parseFloat((((price - start) / start) * 100).toFixed(2));
        }
      }
      return row;
    });
  }, [tickers, historyMap]);

  const totalReturns = useMemo<Record<string, number | null>>(() => {
    const result: Record<string, number | null> = {};
    for (const ticker of tickers) {
      const hist = historyMap[ticker] ?? [];
      const slice = hist.slice(-90);
      if (slice.length < 2) { result[ticker] = null; continue; }
      const first = slice[0].close;
      const last = slice[slice.length - 1].close;
      result[ticker] = first > 0 ? ((last - first) / first) * 100 : null;
    }
    return result;
  }, [tickers, historyMap]);

  const formatXAxis = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Loading chart data…
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.06)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            tick={{ fill: "hsl(0,0%,45%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`}
            tick={{ fill: "hsl(0,0%,45%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`,
              name,
            ]}
            labelFormatter={(label: string) => formatXAxis(label)}
            contentStyle={{
              backgroundColor: "hsl(0,0%,7%)",
              border: "1px solid hsl(0,0%,15%)",
              borderRadius: "6px",
              fontSize: "12px",
              color: "hsl(0,0%,95%)",
            }}
          />
          {tickers.map((ticker, i) => (
            <Line
              key={ticker}
              type="monotone"
              dataKey={ticker}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 justify-center mt-3">
        {tickers.map((ticker, i) => {
          const ret = totalReturns[ticker];
          return (
            <div key={ticker} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block w-3 h-[2px] rounded"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              />
              <span className="text-foreground font-semibold">{ticker}</span>
              {ret !== null && (
                <span className={ret >= 0 ? "text-green-400" : "text-red-400"}>
                  {fmtPct(ret)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StockComparison() {
  const [tickers, setTickers] = useState<string[]>(DEFAULT_TICKERS);
  const [inputVal, setInputVal] = useState("");
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Registry: child TickerLoaders push their data here each render
  const registryRef = useRef<Record<string, TickerState>>({});
  // We use a version counter to force re-renders when data updates
  const [, forceUpdate] = useState(0);

  const registryContext = useMemo<RegistryContextValue>(
    () => ({
      register: (ticker: string, state: TickerState) => {
        const prev = registryRef.current[ticker];
        const changed =
          !prev ||
          prev.quote !== state.quote ||
          prev.quoteLoading !== state.quoteLoading ||
          prev.history !== state.history ||
          prev.historyLoading !== state.historyLoading ||
          prev.computed !== state.computed;
        if (changed) {
          registryRef.current = { ...registryRef.current, [ticker]: state };
          // Defer update to avoid setState during render
          setTimeout(() => forceUpdate((n) => n + 1), 0);
        }
      },
    }),
    []
  );

  const getState = (ticker: string): TickerState => {
    return (
      registryRef.current[ticker] ?? {
        ticker,
        quote: undefined,
        quoteLoading: true,
        quoteError: null,
        history: [],
        historyLoading: true,
        computed: {
          vwap: null,
          annualReturn: null,
          annualVol: null,
          rsi: null,
          trend: null,
        },
      }
    );
  };

  const historyMap = useMemo<Record<string, HistoryPoint[]>>(() => {
    const map: Record<string, HistoryPoint[]> = {};
    for (const ticker of tickers) {
      map[ticker] = registryRef.current[ticker]?.history ?? [];
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers, registryRef.current]);

  const showFlash = useCallback((msg: string) => {
    setFlashMsg(msg);
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => setFlashMsg(null), 2000);
  }, []);

  const handleAdd = useCallback(() => {
    const t = inputVal.trim().toUpperCase();
    if (!t) return;
    if (tickers.includes(t)) {
      showFlash(`${t} already added`);
      return;
    }
    setTickers((prev) => [...prev, t]);
    setInputVal("");
  }, [inputVal, tickers, showFlash]);

  const handleRemove = useCallback(
    (ticker: string) => {
      if (tickers.length <= 1) return;
      setTickers((prev) => prev.filter((t) => t !== ticker));
    },
    [tickers]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleAdd();
    },
    [handleAdd]
  );

  return (
    <RegistryContext.Provider value={registryContext}>
      {/* Hidden data loaders — render one per ticker */}
      {tickers.map((ticker) => (
        <TickerLoader key={ticker} ticker={ticker} />
      ))}

      <div className="space-y-6">
        {/* ── Header ── */}
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display, sans-serif)" }}
          >
            Stock Comparison
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Compare metrics and performance across multiple stocks side-by-side.
          </p>
        </div>

        {/* ── Add Stock Bar ── */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-xs">
              <input
                type="text"
                value={inputVal}
                onChange={(e) =>
                  setInputVal(e.target.value.toUpperCase().slice(0, 6))
                }
                onKeyDown={handleKeyDown}
                placeholder="Ticker symbol…"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20 uppercase tracking-widest"
                spellCheck={false}
                autoCapitalize="characters"
              />
            </div>
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>

          {flashMsg && (
            <p className="text-xs text-yellow-400 animate-pulse">{flashMsg}</p>
          )}

          {/* Ticker chips */}
          <div className="flex flex-wrap gap-2">
            {tickers.map((ticker, i) => (
              <div
                key={ticker}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold"
                style={{
                  borderColor: PALETTE[i % PALETTE.length] + "55",
                  color: PALETTE[i % PALETTE.length],
                  backgroundColor: PALETTE[i % PALETTE.length] + "15",
                }}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                />
                {ticker}
                <button
                  onClick={() => handleRemove(ticker)}
                  disabled={tickers.length <= 1}
                  className="ml-0.5 opacity-60 hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed transition-opacity"
                  aria-label={`Remove ${ticker}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Comparison Table ── */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-44 bg-card sticky left-0 z-10">
                    Metric
                  </th>
                  {tickers.map((ticker, i) => {
                    const s = getState(ticker);
                    return (
                      <th key={ticker} className="px-4 py-3 text-center min-w-[150px]">
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: PALETTE[i % PALETTE.length],
                              }}
                            />
                            <span
                              className="font-bold text-sm"
                              style={{ color: PALETTE[i % PALETTE.length] }}
                            >
                              {ticker}
                            </span>
                          </div>
                          {s.quoteLoading ? (
                            <Skeleton className="h-3 w-20 rounded" />
                          ) : s.quote?.name ? (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                              {s.quote.name}
                            </span>
                          ) : null}
                          {s.quoteError && (
                            <span className="text-[10px] text-red-400">
                              Error loading
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((row, rowIdx) => (
                  <tr
                    key={row.label}
                    className={`border-b border-border/50 ${
                      rowIdx % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"
                    } hover:bg-white/[0.03] transition-colors`}
                  >
                    <td className="px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-inherit z-10">
                      {row.label}
                    </td>
                    {tickers.map((ticker) => (
                      <td key={ticker} className="px-4 py-3 text-center">
                        {row.render({ state: getState(ticker) })}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Overlaid Price Chart ── */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">
              Performance Comparison
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              % return from 90-day window start — all stocks normalized to 0%.
            </p>
          </div>
          <OverlayChart tickers={tickers} historyMap={historyMap} />
        </div>
      </div>
    </RegistryContext.Provider>
  );
}
