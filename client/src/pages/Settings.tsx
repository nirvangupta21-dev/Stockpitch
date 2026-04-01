import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import * as XLSX from "xlsx";
import {
  Settings2, Plus, Trash2, Download, RefreshCw,
  TrendingUp, TrendingDown, DollarSign, PieChart,
  RotateCcw, Save, Check, Edit2, X,
  BarChart2, Zap, Clock, Sliders,
  Scale, List, Globe, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart as RPieChart, Pie, Cell, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { useSettings } from "@/lib/settings";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Position {
  id: string;
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;       // per share cost basis
  purchaseDate: string;
  notes: string;
}

interface LiveQuote {
  ticker: string;
  price: number;
  changePct: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtCurrency(n: number, compact = false) {
  if (compact) {
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  }
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

const SECTOR_COLORS = [
  "hsl(185,80%,50%)", "hsl(265,70%,60%)", "hsl(45,90%,55%)",
  "hsl(142,71%,45%)", "hsl(200,80%,55%)", "hsl(0,72%,51%)",
  "hsl(320,70%,55%)", "hsl(30,90%,55%)", "hsl(160,65%,45%)",
];

const INITIAL_POSITIONS: Position[] = [
  { id: "1", ticker: "AAPL", name: "Apple Inc.", shares: 10, avgCost: 175.00, purchaseDate: "2024-01-15", notes: "Long-term hold" },
  { id: "2", ticker: "NVDA", name: "NVIDIA Corporation", shares: 5, avgCost: 480.00, purchaseDate: "2024-03-01", notes: "" },
  { id: "3", ticker: "MSFT", name: "Microsoft Corporation", shares: 8, avgCost: 370.00, purchaseDate: "2024-02-10", notes: "Core position" },
];

// ─── Section wrappers ─────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/30 flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors ${value ? "bg-primary" : "bg-muted"}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/20 last:border-0">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="ml-4 shrink-0">{children}</div>
    </div>
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-1.5 bg-secondary border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function NumberInput({ value, onChange, min, max, step, suffix }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step || 1}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-20 px-2 py-1.5 bg-secondary border border-border rounded-lg text-xs text-right text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

// ─── Portfolio Position Row ───────────────────────────────────────────────────
function PositionRow({
  pos, livePrice, onEdit, onDelete,
}: {
  pos: Position;
  livePrice: number | null;
  onEdit: (p: Position) => void;
  onDelete: (id: string) => void;
}) {
  const price = livePrice ?? pos.avgCost;
  const currentValue = price * pos.shares;
  const costBasis = pos.avgCost * pos.shares;
  const gain = currentValue - costBasis;
  const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
  const isGain = gain >= 0;

  return (
    <div className="grid items-center gap-3 px-4 py-3 border-b border-border/20 last:border-0 hover:bg-secondary/20 transition-colors"
      style={{ gridTemplateColumns: "1fr 5rem 5rem 5rem 6rem 6rem 6rem 5.5rem" }}>
      {/* Name */}
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm text-primary">{pos.ticker}</span>
          {pos.notes && <span className="text-xs text-muted-foreground/60 hidden md:block truncate max-w-[120px]">{pos.notes}</span>}
        </div>
        <p className="text-xs text-muted-foreground truncate">{pos.name}</p>
      </div>
      {/* Shares */}
      <p className="text-sm tabular-nums text-right font-mono">{pos.shares.toLocaleString()}</p>
      {/* Avg cost */}
      <p className="text-sm tabular-nums text-right font-mono text-muted-foreground">${pos.avgCost.toFixed(2)}</p>
      {/* Live price */}
      <p className="text-sm tabular-nums text-right font-mono">${price.toFixed(2)}</p>
      {/* Current value */}
      <p className="text-sm tabular-nums text-right font-mono">{fmtCurrency(currentValue)}</p>
      {/* Gain/Loss $ */}
      <p className={`text-sm tabular-nums text-right font-mono font-semibold ${isGain ? "text-green-400" : "text-red-400"}`}>
        {isGain ? "+" : "-"}{fmtCurrency(gain)}
      </p>
      {/* Gain/Loss % */}
      <p className={`text-sm tabular-nums text-right font-mono font-bold ${isGain ? "text-green-400" : "text-red-400"}`}>
        {fmtPct(gainPct)}
      </p>
      {/* Actions */}
      <div className="flex items-center gap-1 justify-end">
        <button onClick={() => onEdit(pos)} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(pos.id)} className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Add/Edit Position Modal ──────────────────────────────────────────────────
function PositionModal({ position, onSave, onClose }: { position?: Position; onSave: (p: Omit<Position, "id">) => void; onClose: () => void }) {
  const [ticker, setTicker] = useState(position?.ticker || "");
  const [name, setName]     = useState(position?.name || "");
  const [shares, setShares] = useState(position?.shares || 1);
  const [avgCost, setAvgCost] = useState(position?.avgCost || 0);
  const [date, setDate]     = useState(position?.purchaseDate || new Date().toISOString().split("T")[0]);
  const [notes, setNotes]   = useState(position?.notes || "");

  const field = "w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <h3 className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {position ? "Edit Position" : "Add Position"}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Ticker *</label>
              <input type="text" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="e.g. AAPL" className={field} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Company Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Apple Inc." className={field} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Shares *</label>
              <input type="number" value={shares} onChange={e => setShares(parseFloat(e.target.value) || 0)} min={0} step={0.001} className={field} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Avg Cost / Share *</label>
              <input type="number" value={avgCost} onChange={e => setAvgCost(parseFloat(e.target.value) || 0)} min={0} step={0.01} className={field} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Purchase Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" className={field} />
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button
            onClick={() => { if (ticker && shares > 0 && avgCost > 0) onSave({ ticker, name: name || ticker, shares, avgCost, purchaseDate: date, notes }); }}
            disabled={!ticker || shares <= 0 || avgCost <= 0}
            className="flex-1 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {position ? "Save Changes" : "Add Position"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Controls Guide ─────────────────────────────────────────────────────────
const TABS_GUIDE = [
  {
    icon: TrendingUp,
    label: "Dashboard",
    color: "text-primary",
    bg: "bg-primary/10 border-primary/20",
    summary: "Your stock spotlight — real-time price, price history, investment simulator, and the live market overview.",
    steps: [
      { action: "Search any stock", detail: "Type a ticker or company name in the top search bar. Only NYSE & NASDAQ stocks with $1B+ market cap are supported." },
      { action: "Price History chart", detail: "Switch time ranges (1M → 5Y) with the range buttons. Toggle the AI Forecast on/off to show or hide the 30-day prediction overlay and confidence band." },
      { action: "Investment Simulator", detail: "Enter a dollar amount and drag the Start Date slider to simulate how an investment would have grown (or declined) over any historical window." },
      { action: "Market Overview", detail: "Scroll down to see live S&P 500, NASDAQ, and Dow Jones cards, the sector performance bar chart, and today's top gainers & losers across NYSE & NASDAQ." },
      { action: "Click a mover", detail: "In the Stocks Explorer tab, clicking any stock row will load it into the Dashboard automatically." },
    ],
  },
  {
    icon: Scale,
    label: "Fair Value",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
    summary: "Five-model valuation engine that calculates whether a stock is undervalued, fairly valued, or overvalued.",
    steps: [
      { action: "Load any stock", detail: "Search and select a stock in the top bar. The page auto-populates with live fundamentals from Yahoo Finance." },
      { action: "Verdict banner", detail: "The top banner immediately shows the mispricing verdict (Significantly Undervalued → Significantly Overvalued), the composite fair value, and a visual gauge." },
      { action: "Adjust DCF assumptions", detail: "Use the three sliders (Revenue Growth, Terminal Growth, WACC) to stress-test the DCF model. The fair value updates instantly as you move them." },
      { action: "Switch sector", detail: "Click a sector button (Tech, Fintech, Healthcare, Consumer) to change the peer median multiples used in the P/E, EV/EBITDA, and P/S comparable models." },
      { action: "Toggle chart views", detail: "The bar chart shows current price vs. each model's output. Hover bars to see implied upside/downside vs. current price." },
      { action: "Fundamentals strip", detail: "The bottom row shows live margins, ROE, growth, beta, and multiples all in one view for quick fundamental screening." },
    ],
  },
  {
    icon: List,
    label: "Stocks",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    summary: "Browse, sort and filter all active NYSE & NASDAQ public equities by market cap, popularity, volatility, and daily move.",
    steps: [
      { action: "Switch market", detail: "Click NASDAQ, NYSE, Most Active, Top Gainers, or Top Losers tabs to change the universe of stocks shown." },
      { action: "Sort", detail: "Click any sort button — Market Cap, Popularity (volume), Volatility, Daily Move, or Price — to rerank the list instantly." },
      { action: "Filter", detail: "Type in the search box to filter by ticker symbol or company name in real time." },
      { action: "Volatility badge", detail: "Each row shows a High / Medium / Low volatility badge calculated from the 52-week price range as a percentage of the current price." },
      { action: "Volume spike", detail: "When a stock is trading more than 1.5x its 3-month average volume, a '1.5x avg' tag appears under the volume number — a useful signal for unusual activity." },
      { action: "Open in Dashboard", detail: "Click any stock row to load it directly into the Dashboard tab for full analysis, price history, and investment simulation." },
    ],
  },
  {
    icon: Globe,
    label: "News & Events",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    summary: "Live geopolitical and economic event feed from 8 global news sources, with automated market impact analysis on every story.",
    steps: [
      { action: "Category filter", detail: "Use the All / Geopolitical / Economic / Supply Chain buttons to narrow by event type." },
      { action: "Sentiment filter", detail: "Filter by Bearish, Bullish, or Neutral to focus on stories likely to move markets in a specific direction." },
      { action: "Expand a card", detail: "Click any news card to expand the full dropdown. You'll see the article summary, affected sectors, supply chains, trading blocs, and relevant FTAs." },
      { action: "Sector Exposure chart", detail: "The radar chart shows which sectors are most exposed to the event. Toggle to Market Impact to see estimated % impact on specific indices." },
      { action: "Trading Blocs & FTAs", detail: "Each expanded card lists the relevant trading blocs (WTO, ASEAN, NATO, OPEC+, etc.) with their role (Driver / Affected / Beneficiary) and a description of how they connect to the story." },
      { action: "FTA status", detail: "Free trade agreements are tagged as At Risk, Strengthened, or Relevant — color-coded in red, green, and blue respectively." },
      { action: "Refresh", detail: "News auto-refreshes every 2 hours. Click 'Refresh now' at the top right to force an immediate update." },
    ],
  },
  {
    icon: Settings2,
    label: "My Portfolio",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
    summary: "Track your investments with live P&L, portfolio allocation, and one-click Excel export. Also contains all platform settings.",
    steps: [
      { action: "Add a position", detail: "Click 'Add Position', enter the ticker, number of shares, average cost per share, purchase date, and optional notes. Click 'Add Position' to confirm." },
      { action: "Live P&L", detail: "Each row shows your avg cost vs. the current live price, current value, gain/loss in dollars and percentage — all updating every 30 seconds." },
      { action: "Edit a position", detail: "Click the pencil icon on any row to update shares, cost basis, or notes after averaging down/up." },
      { action: "Remove a position", detail: "Click the trash icon on any row to remove it. This is immediate — no undo, so double-check before deleting." },
      { action: "Allocation chart", detail: "The donut chart updates in real time as prices move, showing each position's weight as a % of total portfolio value." },
      { action: "Export to Excel", detail: "Click the green 'Export to Excel (.xlsx)' button to download a formatted spreadsheet with a Portfolio sheet (all positions + TOTAL row) and a Summary sheet (metadata and totals)." },
      { action: "Refresh Prices", detail: "Click 'Refresh Prices' to manually pull the latest quotes for all your holdings outside of the automatic 30-second cycle." },
    ],
  },
];

function ControlsGuide() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/30 flex items-center gap-2">
        <Zap className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Controls & How-To Guide</h2>
        <span className="text-xs text-muted-foreground ml-1">— click any tab to expand</span>
      </div>

      <div className="p-5 space-y-3">
        {TABS_GUIDE.map(tab => {
          const Icon = tab.icon;
          const isOpen = open === tab.label;
          return (
            <div key={tab.label} className={`rounded-xl border overflow-hidden transition-all ${isOpen ? "border-primary/30" : "border-border/40"}`}>
              {/* Tab header */}
              <button
                onClick={() => setOpen(isOpen ? null : tab.label)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/30 transition-colors text-left"
              >
                <div className={`p-2 rounded-lg border shrink-0 ${tab.bg}`}>
                  <Icon className={`w-4 h-4 ${tab.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${tab.color}`}>{tab.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5 line-clamp-1">{tab.summary}</p>
                </div>
                {isOpen
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>

              {/* Expanded steps */}
              {isOpen && (
                <div className="border-t border-border/30 px-4 py-4 space-y-3 bg-secondary/10">
                  <p className="text-xs text-muted-foreground leading-relaxed">{tab.summary}</p>
                  <div className="space-y-2.5">
                    {tab.steps.map((step, i) => (
                      <div key={i} className="flex gap-3">
                        <div className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${tab.bg} ${tab.color}`}>
                          {i + 1}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{step.action}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{step.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Portfolio special section */}
                  {tab.label === "My Portfolio" && (
                    <div className="mt-4 rounded-lg border border-green-500/20 bg-green-500/5 p-4 space-y-2">
                      <p className="text-xs font-bold text-green-400 uppercase tracking-wider">Portfolio Management Tips</p>
                      <ul className="space-y-1.5 text-xs text-muted-foreground">
                        <li className="flex gap-2"><span className="text-green-400 shrink-0">→</span>Track cost basis carefully — enter your true average cost per share including any fees for accurate P&L.</li>
                        <li className="flex gap-2"><span className="text-green-400 shrink-0">→</span>Use notes to log your investment thesis (e.g. "Long-term hold", "Earnings play") so you remember why you entered.</li>
                        <li className="flex gap-2"><span className="text-green-400 shrink-0">→</span>The Excel export includes a TOTAL row — use it to paste directly into an existing spreadsheet or send to an advisor.</li>
                        <li className="flex gap-2"><span className="text-green-400 shrink-0">→</span>Cross-reference the Fair Value tab to see whether your current holdings are trading above or below their intrinsic value.</li>
                        <li className="flex gap-2"><span className="text-green-400 shrink-0">→</span>The allocation donut updates live — use it to spot when a position has grown too large relative to your target weighting.</li>
                        <li className="flex gap-2"><span className="text-green-400 shrink-0">→</span>Note: portfolio data is stored in memory only and resets on page reload. Export to Excel regularly to preserve your records.</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function Settings() {
  const { settings, update, reset } = useSettings();
  const [positions, setPositions] = useState<Position[]>(INITIAL_POSITIONS);
  const [modal, setModal] = useState<{ open: boolean; editing?: Position }>({ open: false });
  const [saved, setSaved] = useState(false);

  // Fetch live prices for all portfolio tickers
  const tickers = [...new Set(positions.map(p => p.ticker))];
  const { data: livePrices, refetch: refetchPrices } = useQuery<Record<string, number>>({
    queryKey: ["/api/portfolio/prices", tickers.join(",")],
    queryFn: async () => {
      const results: Record<string, number> = {};
      await Promise.allSettled(
        tickers.map(async t => {
          try {
            const r = await apiRequest("GET", `/api/quote/${t}`).then(res => res.json());
            if (r.price) results[t] = r.price;
          } catch {}
        })
      );
      return results;
    },
    enabled: tickers.length > 0,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  // Portfolio calculations
  const enriched = positions.map(pos => {
    const price = livePrices?.[pos.ticker] ?? pos.avgCost;
    const currentValue = price * pos.shares;
    const costBasis = pos.avgCost * pos.shares;
    return { ...pos, price, currentValue, costBasis, gain: currentValue - costBasis };
  });

  const totalValue    = enriched.reduce((s, p) => s + p.currentValue, 0);
  const totalCost     = enriched.reduce((s, p) => s + p.costBasis, 0);
  const totalGain     = totalValue - totalCost;
  const totalGainPct  = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const isOverallGain = totalGain >= 0;

  // Allocation pie data
  const pieData = enriched.map((p, i) => ({
    name: p.ticker,
    value: parseFloat(p.currentValue.toFixed(2)),
    pct: totalValue > 0 ? (p.currentValue / totalValue) * 100 : 0,
    color: SECTOR_COLORS[i % SECTOR_COLORS.length],
  }));

  // Handlers
  const addPosition = useCallback((data: Omit<Position, "id">) => {
    setPositions(prev => [...prev, { ...data, id: Date.now().toString() }]);
    setModal({ open: false });
  }, []);

  const editPosition = useCallback((data: Omit<Position, "id">) => {
    setPositions(prev => prev.map(p => p.id === modal.editing?.id ? { ...data, id: p.id } : p));
    setModal({ open: false });
  }, [modal.editing]);

  const deletePosition = useCallback((id: string) => {
    setPositions(prev => prev.filter(p => p.id !== id));
  }, []);

  // ─── Excel export ──────────────────────────────────────────────────────────
  function exportToExcel() {
    const rows = enriched.map(p => ({
      "Ticker": p.ticker,
      "Company": p.name,
      "Shares": p.shares,
      "Avg Cost ($/share)": p.avgCost,
      "Current Price ($)": parseFloat(p.price.toFixed(2)),
      "Cost Basis ($)": parseFloat(p.costBasis.toFixed(2)),
      "Current Value ($)": parseFloat(p.currentValue.toFixed(2)),
      "Gain/Loss ($)": parseFloat(p.gain.toFixed(2)),
      "Gain/Loss (%)": parseFloat(((p.gain / p.costBasis) * 100).toFixed(2)),
      "Purchase Date": p.purchaseDate,
      "Notes": p.notes,
      "Allocation (%)": parseFloat(((p.currentValue / totalValue) * 100).toFixed(2)),
    }));

    // Summary row
    rows.push({
      "Ticker": "TOTAL",
      "Company": "",
      "Shares": 0,
      "Avg Cost ($/share)": 0,
      "Current Price ($)": 0,
      "Cost Basis ($)": parseFloat(totalCost.toFixed(2)),
      "Current Value ($)": parseFloat(totalValue.toFixed(2)),
      "Gain/Loss ($)": parseFloat(totalGain.toFixed(2)),
      "Gain/Loss (%)": parseFloat(totalGainPct.toFixed(2)),
      "Purchase Date": "",
      "Notes": `Exported ${new Date().toLocaleDateString()}`,
      "Allocation (%)": 100,
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws["!cols"] = [
      { wch: 8 }, { wch: 28 }, { wch: 10 }, { wch: 18 }, { wch: 18 },
      { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 },
      { wch: 14 }, { wch: 24 }, { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Portfolio");

    // Metadata sheet
    const meta = XLSX.utils.json_to_sheet([
      { "Field": "Export Date", "Value": new Date().toLocaleString() },
      { "Field": "Total Positions", "Value": positions.length },
      { "Field": "Total Value", "Value": `$${totalValue.toFixed(2)}` },
      { "Field": "Total Cost Basis", "Value": `$${totalCost.toFixed(2)}` },
      { "Field": "Total Gain/Loss", "Value": `${totalGain >= 0 ? "+" : ""}$${totalGain.toFixed(2)}` },
      { "Field": "Return %", "Value": `${fmtPct(totalGainPct)}` },
      { "Field": "Data Source", "Value": "PitchStock / Yahoo Finance" },
    ]);
    XLSX.utils.book_append_sheet(wb, meta, "Summary");

    XLSX.writeFile(wb, `PitchStock_Portfolio_${new Date().toISOString().split("T")[0]}.xlsx`);
  }

  function handleSaveSettings() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>My Portfolio</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset defaults
          </button>
          <button
            onClick={handleSaveSettings}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-semibold transition-all ${saved ? "bg-green-500/20 border border-green-500/30 text-green-400" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          >
            {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      </div>

      {/* ─── PORTFOLIO SECTION ─────────────────────────────────────────────── */}
      <Section title="My Portfolio" icon={PieChart}>
        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Value", value: fmtCurrency(totalValue, true), color: "text-primary" },
            { label: "Cost Basis", value: fmtCurrency(totalCost, true), color: "text-foreground" },
            { label: isOverallGain ? "Total Gain" : "Total Loss", value: `${isOverallGain ? "+" : ""}${fmtCurrency(totalGain, true)}`, color: isOverallGain ? "text-green-400" : "text-red-400" },
            { label: "Return", value: fmtPct(totalGainPct), color: isOverallGain ? "text-green-400" : "text-red-400" },
          ].map(k => (
            <div key={k.label} className="rounded-lg bg-secondary/50 border border-border/30 px-3 py-2.5">
              <p className="text-xs text-muted-foreground mb-0.5">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`} style={{ fontFamily: "var(--font-display)" }}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Chart + table layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-4">
          {/* Allocation pie */}
          {pieData.length > 0 && (
            <div className="rounded-xl bg-secondary/30 border border-border/30 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">Allocation</p>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RPieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
                          <p className="font-bold text-foreground">{d.name}</p>
                          <p className="text-primary tabular-nums">{fmtCurrency(d.value)}</p>
                          <p className="text-muted-foreground">{d.pct.toFixed(1)}% of portfolio</p>
                        </div>
                      );
                    }} />
                  </RPieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="font-mono font-bold text-foreground">{d.name}</span>
                    <span className="text-muted-foreground ml-auto">{d.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Position table */}
          <div className="lg:col-span-2 rounded-xl bg-secondary/30 border border-border/30 overflow-hidden">
            {/* Table header */}
            <div
              className="grid items-center gap-3 px-4 py-2.5 border-b border-border/30 bg-muted/30"
              style={{ gridTemplateColumns: "1fr 5rem 5rem 5rem 6rem 6rem 6rem 5.5rem" }}
            >
              {["Position", "Shares", "Avg Cost", "Price", "Value", "Gain $", "Gain %", ""].map((h, i) => (
                <p key={i} className={`text-xs text-muted-foreground font-semibold uppercase tracking-wider ${i >= 1 ? "text-right" : ""} ${i === 7 ? "text-center" : ""}`}>{h}</p>
              ))}
            </div>
            {positions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No positions yet. Add your first holding below.
              </div>
            ) : (
              enriched.map(pos => (
                <PositionRow
                  key={pos.id}
                  pos={pos}
                  livePrice={livePrices?.[pos.ticker] ?? null}
                  onEdit={p => setModal({ open: true, editing: p })}
                  onDelete={deletePosition}
                />
              ))
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setModal({ open: true })}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Position
          </button>
          <button
            onClick={() => refetchPrices()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Prices
          </button>
          <button
            onClick={exportToExcel}
            disabled={positions.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-green-500/30 bg-green-500/10 text-green-400 rounded-lg font-semibold hover:bg-green-500/20 transition-colors disabled:opacity-40 ml-auto"
          >
            <Download className="w-4 h-4" />
            Export to Excel (.xlsx)
          </button>
        </div>
      </Section>

      {/* ─── PLATFORM SETTINGS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Dashboard settings */}
        <Section title="Dashboard" icon={BarChart2}>
          <SettingRow label="Default Ticker" description="Stock shown on launch">
            <input
              type="text"
              value={settings.defaultTicker}
              onChange={e => update({ defaultTicker: e.target.value.toUpperCase() })}
              className="w-20 px-2 py-1.5 bg-secondary border border-border rounded-lg text-xs text-center font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </SettingRow>
          <SettingRow label="Default Chart Range">
            <SelectInput
              value={settings.defaultChartRange}
              onChange={v => update({ defaultChartRange: v as any })}
              options={[
                { value: "1mo", label: "1 Month" }, { value: "3mo", label: "3 Months" },
                { value: "6mo", label: "6 Months" }, { value: "1y", label: "1 Year" },
                { value: "2y", label: "2 Years" }, { value: "5y", label: "5 Years" },
              ]}
            />
          </SettingRow>
          <SettingRow label="Show AI Forecast" description="30-day prediction overlay on price chart">
            <ToggleSwitch value={settings.showAIForecast} onChange={v => update({ showAIForecast: v })} />
          </SettingRow>
          <SettingRow label="Default Investment" description="Starting amount in simulator">
            <NumberInput value={settings.defaultInvestment} onChange={v => update({ defaultInvestment: v })} min={100} step={1000} suffix="$" />
          </SettingRow>
          <SettingRow label="Compact Numbers" description="Show $1.2M instead of $1,234,567">
            <ToggleSwitch value={settings.compactNumbers} onChange={v => update({ compactNumbers: v })} />
          </SettingRow>
        </Section>

        {/* Fair Value defaults */}
        <Section title="Fair Value Model" icon={Sliders}>
          <SettingRow label="Default Sector" description="Peer comparison benchmarks">
            <SelectInput
              value={settings.defaultSector}
              onChange={v => update({ defaultSector: v })}
              options={[
                { value: "default", label: "Default" }, { value: "tech", label: "Technology" },
                { value: "fintech", label: "Fintech" }, { value: "healthcare", label: "Healthcare" },
                { value: "consumer", label: "Consumer" },
              ]}
            />
          </SettingRow>
          <SettingRow label="DCF Growth Rate (Yr 1–5)">
            <NumberInput value={settings.dcfGrowthRate} onChange={v => update({ dcfGrowthRate: v })} min={-20} max={100} step={1} suffix="%" />
          </SettingRow>
          <SettingRow label="Terminal Growth Rate">
            <NumberInput value={settings.dcfTerminalGrowth} onChange={v => update({ dcfTerminalGrowth: v })} min={0} max={10} step={0.5} suffix="%" />
          </SettingRow>
          <SettingRow label="Discount Rate (WACC)">
            <NumberInput value={settings.dcfDiscountRate} onChange={v => update({ dcfDiscountRate: v })} min={4} max={30} step={0.5} suffix="%" />
          </SettingRow>
        </Section>

        {/* Stock Explorer */}
        <Section title="Stock Explorer" icon={BarChart2}>
          <SettingRow label="Default Market">
            <SelectInput
              value={settings.defaultMarket}
              onChange={v => update({ defaultMarket: v as any })}
              options={[
                { value: "nasdaq", label: "NASDAQ" }, { value: "nyse", label: "NYSE" },
                { value: "most_active", label: "Most Active" },
                { value: "gainers", label: "Top Gainers" }, { value: "losers", label: "Top Losers" },
              ]}
            />
          </SettingRow>
          <SettingRow label="Default Sort">
            <SelectInput
              value={settings.defaultSort}
              onChange={v => update({ defaultSort: v as any })}
              options={[
                { value: "marketCap", label: "Market Cap" }, { value: "popularity", label: "Popularity" },
                { value: "volatility", label: "Volatility" }, { value: "change", label: "Daily Move" },
                { value: "price", label: "Price" },
              ]}
            />
          </SettingRow>
          <SettingRow label="Stocks Per Page">
            <SelectInput
              value={String(settings.stocksPerPage)}
              onChange={v => update({ stocksPerPage: parseInt(v) })}
              options={[
                { value: "25", label: "25" }, { value: "50", label: "50" }, { value: "100", label: "100" },
              ]}
            />
          </SettingRow>
        </Section>

        {/* Refresh intervals */}
        <Section title="Data Refresh Intervals" icon={Clock}>
          <SettingRow label="Quote Refresh" description="How often live prices update">
            <SelectInput
              value={String(settings.quoteRefreshInterval)}
              onChange={v => update({ quoteRefreshInterval: parseInt(v) })}
              options={[
                { value: "10000", label: "10 seconds" }, { value: "30000", label: "30 seconds" },
                { value: "60000", label: "1 minute" }, { value: "300000", label: "5 minutes" },
              ]}
            />
          </SettingRow>
          <SettingRow label="Market Overview" description="Index & sector data refresh">
            <SelectInput
              value={String(settings.marketRefreshInterval)}
              onChange={v => update({ marketRefreshInterval: parseInt(v) })}
              options={[
                { value: "30000", label: "30 seconds" }, { value: "60000", label: "1 minute" },
                { value: "300000", label: "5 minutes" }, { value: "600000", label: "10 minutes" },
              ]}
            />
          </SettingRow>
          <SettingRow label="News & Events" description="RSS feed refresh frequency">
            <SelectInput
              value={String(settings.newsRefreshInterval)}
              onChange={v => update({ newsRefreshInterval: parseInt(v) })}
              options={[
                { value: "3600000", label: "1 hour" }, { value: "7200000", label: "2 hours" },
                { value: "14400000", label: "4 hours" }, { value: "28800000", label: "8 hours" },
              ]}
            />
          </SettingRow>
        </Section>
      </div>

      {/* ─── CONTROLS GUIDE ────────────────────────────────────────── */}
      <ControlsGuide />

      {/* Platform info */}
      <div className="rounded-xl bg-card border border-border/50 p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-muted-foreground">
          {[
            { label: "Platform", value: "PitchStock v1.0" },
            { label: "Data Source", value: "Yahoo Finance" },
            { label: "Market Coverage", value: "NYSE & NASDAQ" },
            { label: "Min Market Cap", value: "$1B+" },
          ].map(m => (
            <div key={m.label}>
              <p className="uppercase tracking-wider font-semibold mb-0.5">{m.label}</p>
              <p className="text-foreground font-medium">{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit modal */}
      {modal.open && (
        <PositionModal
          position={modal.editing}
          onSave={modal.editing ? editPosition : addPosition}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  );
}
