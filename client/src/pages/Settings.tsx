import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import * as XLSX from "xlsx";
import {
  Settings2, Plus, Trash2, Download, RefreshCw,
  TrendingUp, TrendingDown, DollarSign, PieChart,
  RotateCcw, Save, Check, Edit2, X,
  BarChart2, Zap, Clock, Sliders,
  Scale, List, Globe, ChevronDown, ChevronUp,
  Building2, Activity, MonitorPlay, Calculator,
  Moon, Sun, Palette,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
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

// ─── ROI Calculator ─────────────────────────────────────────────────────────
function ROICalculator({ currentValue, costBasis }: { currentValue: number; costBasis: number }) {
  const [open, setOpen] = useState(false);

  // Hypothetical inputs
  const [investment, setInvestment] = useState(10000);
  const [annualReturn, setAnnualReturn] = useState(12);
  const [years, setYears] = useState(10);
  const [contributions, setContributions] = useState(0);
  const [inflationAdj, setInflationAdj] = useState(false);
  const INFLATION = 3.0;

  // ── Compound growth calculation ──────────────────────────────────────────
  const r = annualReturn / 100;
  const rAdj = inflationAdj ? (1 + r) / (1 + INFLATION / 100) - 1 : r;

  // Future value of lump sum
  const fvLump = investment * Math.pow(1 + rAdj, years);
  // Future value of annual contributions (end of year)
  const fvContrib = contributions > 0
    ? contributions * ((Math.pow(1 + rAdj, years) - 1) / rAdj)
    : 0;
  const futureValue = fvLump + fvContrib;
  const totalInvested = investment + contributions * years;
  const totalGain = futureValue - totalInvested;
  const roiPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
  const cagr = investment > 0 && years > 0
    ? (Math.pow(futureValue / (investment || 1), 1 / years) - 1) * 100 : 0;

  // Yearly projection table
  const projection = Array.from({ length: Math.min(years, 30) }, (_, i) => {
    const y = i + 1;
    const fv = investment * Math.pow(1 + rAdj, y) +
      (contributions > 0 ? contributions * ((Math.pow(1 + rAdj, y) - 1) / rAdj) : 0);
    return { year: y, value: fv, invested: investment + contributions * y };
  });

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtK = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;

  // Portfolio-level actual ROI
  const actualROI = costBasis > 0 ? ((currentValue - costBasis) / costBasis) * 100 : null;

  return (
    <div className="rounded-xl bg-card border border-border/50 overflow-hidden mb-5">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-secondary/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Calculator className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>ROI Calculator</span>
          {actualROI !== null && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md tabular-nums ${
              actualROI >= 0 ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
            }`}>
              Portfolio: {actualROI >= 0 ? "+" : ""}{actualROI.toFixed(1)}% actual ROI
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/30 px-5 py-5 space-y-6">

          {/* ── Inputs grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">

            {/* Initial investment */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Initial Investment</label>
                <span className="text-sm font-bold font-mono text-foreground">${fmt(investment)}</span>
              </div>
              <Slider min={1000} max={500000} step={1000} value={[investment]} onValueChange={([v]) => setInvestment(v)} />
              <div className="flex justify-between text-xs text-muted-foreground/50 mt-1">
                <span>$1K</span><span>$500K</span>
              </div>
            </div>

            {/* Annual return */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Annual Return</label>
                <span className="text-sm font-bold font-mono text-foreground">{annualReturn}%</span>
              </div>
              <Slider min={1} max={50} step={0.5} value={[annualReturn]} onValueChange={([v]) => setAnnualReturn(v)} />
              <div className="flex justify-between text-xs text-muted-foreground/50 mt-1">
                <span>1%</span><span>50%</span>
              </div>
            </div>

            {/* Time horizon */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Time Horizon</label>
                <span className="text-sm font-bold font-mono text-foreground">{years} yr{years !== 1 ? "s" : ""}</span>
              </div>
              <Slider min={1} max={30} step={1} value={[years]} onValueChange={([v]) => setYears(v)} />
              <div className="flex justify-between text-xs text-muted-foreground/50 mt-1">
                <span>1yr</span><span>30yr</span>
              </div>
            </div>

            {/* Annual contributions */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Annual Additions</label>
                <span className="text-sm font-bold font-mono text-foreground">${fmt(contributions)}</span>
              </div>
              <Slider min={0} max={50000} step={500} value={[contributions]} onValueChange={([v]) => setContributions(v)} />
              <div className="flex justify-between text-xs text-muted-foreground/50 mt-1">
                <span>$0</span><span>$50K</span>
              </div>
            </div>
          </div>

          {/* Inflation toggle */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setInflationAdj(a => !a)}
              className={`w-8 h-4 rounded-full transition-colors relative ${
                inflationAdj ? "bg-primary" : "bg-secondary border border-border"
              }`}
            >
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                inflationAdj ? "translate-x-4" : "translate-x-0.5"
              }`} />
            </button>
            <span className="text-xs text-muted-foreground">
              Inflation-adjusted returns (3% CPI)
              {inflationAdj && <span className="text-yellow-400 ml-1">— real return: {(annualReturn - INFLATION).toFixed(1)}%</span>}
            </span>
          </div>

          {/* ── Results strip ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Future Value",    value: fmtK(futureValue),           color: "text-green-400 text-xl" },
              { label: "Total Invested",  value: fmtK(totalInvested),          color: "text-foreground" },
              { label: "Total Gain",      value: `+${fmtK(totalGain)}`,        color: "text-green-400" },
              { label: "ROI",             value: `+${roiPct.toFixed(0)}%`,     color: "text-green-400" },
            ].map(s => (
              <div key={s.label} className="rounded-xl bg-secondary/40 border border-border/30 px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                <p className={`font-bold font-mono tabular-nums ${s.color}`} style={{ fontFamily: "var(--font-display)" }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* CAGR note */}
          <p className="text-xs text-muted-foreground">
            Effective CAGR: <span className="font-mono font-bold text-foreground">{cagr.toFixed(2)}%</span>
            {inflationAdj && " (inflation-adjusted)"}
            {contributions > 0 && ` · Including $${fmt(contributions)}/yr in additions`}
          </p>

          {/* ── Projection table ── */}
          <div className="rounded-xl bg-secondary/30 border border-border/30 overflow-hidden">
            <div className="grid grid-cols-4 px-4 py-2 border-b border-border/30 bg-secondary/40">
              {["Year", "Amount Invested", "Portfolio Value", "Gain"].map(h => (
                <p key={h} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</p>
              ))}
            </div>
            <div className="max-h-52 overflow-y-auto divide-y divide-border/20">
              {projection.map(row => {
                const g = row.value - row.invested;
                return (
                  <div key={row.year} className="grid grid-cols-4 px-4 py-2.5 hover:bg-secondary/20 transition-colors">
                    <p className="text-xs font-mono text-muted-foreground">Yr {row.year}</p>
                    <p className="text-xs font-mono tabular-nums text-foreground">{fmtK(row.invested)}</p>
                    <p className="text-xs font-mono tabular-nums text-foreground font-semibold">{fmtK(row.value)}</p>
                    <p className={`text-xs font-mono tabular-nums font-semibold ${g >= 0 ? "text-green-400" : "text-red-400"}`}>
                      +{fmtK(g)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Portfolio pre-fill hint */}
          {costBasis > 0 && (
            <button
              onClick={() => { setInvestment(Math.round(costBasis)); }}
              className="text-xs text-primary hover:underline"
            >
              Use my portfolio cost basis (${fmt(costBasis)}) as the starting investment →
            </button>
          )}

        </div>
      )}
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const price = livePrice ?? pos.avgCost;
  const currentValue = price * pos.shares;
  const costBasis = pos.avgCost * pos.shares;
  const gain = currentValue - costBasis;
  const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
  const isGain = gain >= 0;

  return (
    <div className="px-4 py-4 border-b border-border/20 last:border-0 hover:bg-secondary/10 transition-colors">
      {/* Top row: ticker + name + actions */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-base text-primary">{pos.ticker}</span>
            <span className="text-sm text-muted-foreground truncate">{pos.name}</span>
          </div>
          {pos.notes && (
            <p className="text-xs text-muted-foreground/50 mt-0.5 truncate italic">{pos.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {confirmDelete ? (
            <>
              <span className="text-xs text-red-400 mr-1 font-medium">Remove?</span>
              <button
                onClick={() => onDelete(pos.id)}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 font-semibold hover:bg-red-500/25 transition-colors"
              >Yes, remove</button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
              >Keep</button>
            </>
          ) : (
            <>
              <button
                onClick={() => onEdit(pos)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                <Edit2 className="w-3 h-3" /> Edit
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-3">
        {[
          { label: "Shares",     value: pos.shares.toLocaleString(),                              color: "" },
          { label: "Avg Cost",   value: `$${pos.avgCost.toFixed(2)}`,                             color: "text-muted-foreground" },
          { label: "Live Price", value: `$${price.toFixed(2)}`,                                   color: livePrice ? "text-foreground" : "text-muted-foreground" },
          { label: "Value",      value: fmtCurrency(currentValue),                                color: "text-foreground font-bold" },
          { label: "Gain/Loss",  value: `${isGain ? "+" : "-"}${fmtCurrency(Math.abs(gain))}`,   color: isGain ? "text-green-400 font-bold" : "text-red-400 font-bold" },
          { label: "Return",     value: fmtPct(gainPct),                                          color: isGain ? "text-green-400 font-bold" : "text-red-400 font-bold" },
        ].map(s => (
          <div key={s.label} className="rounded-lg bg-secondary/30 px-3 py-2">
            <p className="text-xs text-muted-foreground/60 mb-0.5">{s.label}</p>
            <p className={`text-sm tabular-nums font-mono ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Add/Edit Position Modal ──────────────────────────────────────────────────
function PositionModal({ position, onSave, onClose }: { position?: Position; onSave: (p: Omit<Position, "id">) => void; onClose: () => void }) {
  const [ticker, setTicker]           = useState(position?.ticker || "");
  const [name, setName]               = useState(position?.name || "");
  const [shares, setShares]           = useState<number | "">(position?.shares ?? "");
  const [avgCost, setAvgCost]         = useState<number | "">(position?.avgCost ?? "");
  const [date, setDate]               = useState(position?.purchaseDate || new Date().toISOString().split("T")[0]);
  const [notes, setNotes]             = useState(position?.notes || "");
  const [showDropdown, setShowDropdown] = useState(false);
  const [tickerConfirmed, setTickerConfirmed] = useState(!!position);
  const prevPrice                     = useRef<number | null>(null);

  // Search as user types
  const { data: searchResults = [] } = useQuery<{ ticker: string; name: string; exchange: string }[]>({
    queryKey: ["/api/search", ticker],
    queryFn: () => apiRequest("GET", `/api/search?q=${encodeURIComponent(ticker)}`).then(r => r.json()),
    enabled: ticker.length >= 1 && !tickerConfirmed,
    staleTime: 30000,
  });

  // Fetch live price once ticker is confirmed
  const { data: quoteData, isLoading: quoteLoading } = useQuery<{ price: number; name: string }>({
    queryKey: ["/api/quote", ticker],
    queryFn: () => apiRequest("GET", `/api/quote/${ticker}`).then(r => r.json()),
    enabled: tickerConfirmed && ticker.length > 0,
    staleTime: 30000,
  });

  // Auto-fill avg cost when price loads (only if field is still empty)
  if (quoteData?.price && quoteData.price !== prevPrice.current && avgCost === "") {
    prevPrice.current = quoteData.price;
    setAvgCost(parseFloat(quoteData.price.toFixed(2)));
  }

  const sharesNum  = typeof shares  === "number" ? shares  : 0;
  const costNum    = typeof avgCost === "number" ? avgCost : 0;
  const costBasis  = sharesNum * costNum;
  const canSave    = ticker.trim().length > 0 && sharesNum > 0 && costNum > 0;

  const field = "w-full px-3 py-2.5 bg-secondary/60 border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all";
  const lbl   = "text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block font-semibold";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div>
            <h3 className="font-semibold text-sm" style={{ fontFamily: "var(--font-display)" }}>
              {position ? `Edit ${position.ticker}` : "Add New Position"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Track a new stock in your portfolio</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">

          {/* Row 1: Ticker + Company Name */}
          <div className="grid grid-cols-2 gap-3">
            {/* Ticker with dropdown */}
            <div>
              <label className={lbl}>Ticker <span className="text-red-400">*</span></label>
              <div className="relative">
                <input
                  type="text"
                  value={ticker}
                  onChange={e => {
                    const v = e.target.value.toUpperCase();
                    setTicker(v);
                    setTickerConfirmed(false);
                    setShowDropdown(true);
                    if (!v) { setName(""); setAvgCost(""); prevPrice.current = null; }
                  }}
                  onFocus={() => { if (!tickerConfirmed && ticker) setShowDropdown(true); }}
                  placeholder="AAPL"
                  maxLength={6}
                  autoFocus
                  className={`${field} font-mono font-bold text-primary pr-7`}
                />
                {tickerConfirmed && (
                  <button
                    onClick={() => { setTickerConfirmed(false); setTicker(""); setName(""); setAvgCost(""); prevPrice.current = null; setShowDropdown(false); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Dropdown */}
                {showDropdown && !tickerConfirmed && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border/70 rounded-xl shadow-2xl z-50 overflow-hidden">
                    {searchResults.slice(0, 6).map(r => (
                      <button
                        key={r.ticker}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          setTicker(r.ticker);
                          setName(r.name);
                          setTickerConfirmed(true);
                          setShowDropdown(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/60 transition-colors text-left border-b border-border/20 last:border-0"
                      >
                        <span className="font-mono font-bold text-primary text-xs w-14 shrink-0">{r.ticker}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground truncate">{r.name}</p>
                          <p className="text-xs text-muted-foreground/60">{r.exchange}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Company Name — auto-filled, still editable */}
            <div>
              <label className={lbl}>Company Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Auto-filled"
                className={field}
              />
            </div>
          </div>

          {/* Live price confirmation strip */}
          {tickerConfirmed && (
            <div className="rounded-lg bg-secondary/40 border border-border/30 px-3 py-2 flex items-center justify-between text-xs">
              {quoteLoading ? (
                <span className="text-muted-foreground animate-pulse">Loading price…</span>
              ) : quoteData ? (
                <>
                  <span className="text-muted-foreground">{ticker} · Current market price</span>
                  <span className="font-mono font-bold text-green-400">${quoteData.price.toFixed(2)}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Could not load live price</span>
              )}
            </div>
          )}

          {/* Row 2: Shares + Avg Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Shares <span className="text-red-400">*</span></label>
              <input
                type="number"
                value={shares}
                onChange={e => setShares(e.target.value === "" ? "" : parseFloat(e.target.value))}
                min={0} step={0.001}
                placeholder="100"
                className={`${field} font-mono`}
              />
            </div>
            <div>
              <label className={lbl}>
                Avg Cost / Share <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
                <input
                  type="number"
                  value={avgCost}
                  onChange={e => setAvgCost(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  min={0} step={0.01}
                  placeholder="0.00"
                  className={`${field} pl-6 font-mono`}
                />
              </div>
            </div>
          </div>

          {/* Cost basis preview */}
          <div className={`rounded-lg border px-3 py-2 flex items-center justify-between text-xs transition-all ${costBasis > 0 ? "bg-primary/5 border-primary/20" : "bg-secondary/30 border-border/20"}`}>
            <span className="text-muted-foreground">Total cost basis (shares × avg cost)</span>
            <span className={`font-mono font-bold tabular-nums ${costBasis > 0 ? "text-foreground" : "text-muted-foreground/30"}`}>
              {costBasis > 0 ? fmtCurrency(costBasis) : "$—"}
            </span>
          </div>

          {/* Purchase Date */}
          <div>
            <label className={lbl}>Purchase Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={field}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={lbl}>Notes <span className="text-muted-foreground/40 font-normal normal-case tracking-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Long-term hold, earnings play, sector hedge…"
              rows={2}
              className={`${field} resize-none`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { if (canSave) onSave({ ticker, name: name || ticker, shares: sharesNum, avgCost: costNum, purchaseDate: date, notes }); }}
            disabled={!canSave}
            className="flex-[2] py-2.5 text-sm bg-primary text-primary-foreground rounded-lg font-bold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {position ? "Save Changes" : "Add to Portfolio"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Controls Guide ─────────────────────────────────────────────────────────
const TABS_GUIDE = [
  {
    icon: MonitorPlay,
    label: "Intro Screen",
    color: "text-foreground",
    bg: "bg-secondary/50 border-border/40",
    summary: "Veridian opens with a cinematic entry screen every time the platform loads.",
    steps: [
      { action: "Entry animation", detail: "On every page load you'll see the VERIDIAN wordmark type in letter by letter against a black grid background. This takes about 4 seconds and runs automatically." },
      { action: "Open Research Platform", detail: "Click the white button to dismiss the intro and enter the platform. The screen fades to black, then the full dashboard appears." },
      { action: "Skip if needed", detail: "The intro screen is purely visual — clicking the button at any point during the animation will immediately transition you into the platform." },
    ],
  },
  {
    icon: TrendingUp,
    label: "Dashboard",
    color: "text-primary",
    bg: "bg-primary/10 border-primary/20",
    summary: "Your stock spotlight — real-time price, price history chart, investment simulator, and live market overview.",
    steps: [
      { action: "Search any stock", detail: "Type a ticker or company name in the top search bar and press Enter. Only NYSE & NASDAQ stocks with a $1B+ market cap are supported." },
      { action: "Price History chart", detail: "Switch time ranges (1M → 5Y) using the range buttons above the chart. The chart shows daily closing prices for the selected window." },
      { action: "Investment Simulator", detail: "Enter a dollar amount and drag the Start Date slider to simulate how that investment would have grown (or declined) over any historical period." },
      { action: "Market Overview", detail: "Scroll down to see live S&P 500, NASDAQ, and Dow Jones index cards, a sector performance bar chart, and today's top gainers & losers." },
      { action: "Click a mover", detail: "Clicking any stock in the Top Gainers / Losers section loads it into the Dashboard automatically for a full analysis." },
    ],
  },
  {
    icon: Scale,
    label: "Fair Value",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
    summary: "Proprietary quantitative valuation engine — 5 models built entirely from Veridian's own price data. Zero external API dependency.",
    steps: [
      { action: "Load any stock", detail: "Search and select a stock in the top bar. Fair Value uses the same price history that powers the Dashboard — it loads instantly with no external calls." },
      { action: "Verdict + gauge", detail: "The top card shows the verdict (Significantly Undervalued → Significantly Overvalued), the composite fair value price, and a gauge showing where the current price sits relative to fair value." },
      { action: "Adjust forecast window", detail: "Use the slider in the chart header to set the trend projection horizon from 5 to 60 days. The trend line and Linear Regression target update instantly." },
      { action: "Price + trend chart", detail: "Shows 90 days of price history with the OLS regression trend line projected forward, a dashed fair value reference line, and the 1Y VWAP anchor line." },
      { action: "Model bar chart", detail: "Compares current price against all 5 models: Linear Trend, Mean Reversion, VWAP, 52W Midpoint, and Momentum Target. Hover each bar for implied upside/downside %." },
      { action: "Technical indicators", detail: "The bottom-left panel shows RSI-14 with an overbought/oversold gauge, Bollinger Bands (upper/middle/lower), and SMA 20/50/200 with price-vs-SMA signals." },
      { action: "Performance stats", detail: "The bottom-right panel shows 1M/3M/6M/1Y returns, annualized volatility, 52W range position, VWAP anchor, momentum score, and trend strength bar." },
      { action: "Methodology", detail: "Click 'How are these valuations calculated?' at the bottom to expand a full explanation of each model's formula, weighting, and what it measures." },
    ],
  },
  {
    icon: List,
    label: "Stocks",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    summary: "Browse, sort, and filter all active NYSE & NASDAQ public equities by market cap, popularity, volatility, and daily move.",
    steps: [
      { action: "Switch market", detail: "Click NASDAQ, NYSE, Most Active, Top Gainers, or Top Losers tabs to change the universe of stocks shown." },
      { action: "Sort", detail: "Click any sort button — Market Cap, Popularity (volume), Volatility, Daily Move, or Price — to rerank the list instantly." },
      { action: "Filter by name", detail: "Type in the search box to filter by ticker symbol or company name in real time." },
      { action: "Volatility badge", detail: "Each row shows a High / Medium / Low volatility badge calculated from the 52-week price range as a % of current price." },
      { action: "Volume spike tag", detail: "When a stock is trading more than 1.5x its average volume, a '1.5x avg' tag appears — a signal of unusual activity worth investigating." },
      { action: "Open in Dashboard", detail: "Click any stock row to load it directly into the Dashboard tab for the full price chart, simulator, and market overview." },
    ],
  },
  {
    icon: Building2,
    label: "IPOs",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/20",
    summary: "Daily IPO listings — recent debuts and upcoming offerings across NYSE & NASDAQ.",
    steps: [
      { action: "Recent IPOs", detail: "The top section lists companies that have recently gone public, including their ticker, exchange, offer price, and first-day performance." },
      { action: "Upcoming IPOs", detail: "The bottom section shows announced but not yet priced offerings, with expected pricing date and estimated valuation range where available." },
      { action: "Filter by exchange", detail: "Use the NYSE / NASDAQ toggle to filter listings by exchange." },
      { action: "Data freshness", detail: "IPO data refreshes daily. The last-updated timestamp is shown at the top of the page." },
    ],
  },
  {
    icon: Activity,
    label: "Bubble Analysis",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
    summary: "Kiviat (radar) diagram showing which markets and sectors carry the highest speculative bubble risk, with a statistics breakdown below.",
    steps: [
      { action: "Kiviat diagram", detail: "The large radar chart maps bubble risk scores across major market sectors. The further a point extends from the center, the higher the assessed bubble risk for that sector." },
      { action: "Reading the chart", detail: "A perfectly balanced (circular) shape would mean equal risk across all sectors. Spikes indicate concentrated overvaluation in specific areas." },
      { action: "Statistics table", detail: "Below the diagram, each sector shows its risk score, the key driver of that risk, and the primary indicators used to calculate it." },
      { action: "Refresh", detail: "Click Refresh to recalculate risk scores with the latest market data. The diagram updates in real time." },
    ],
  },
  {
    icon: Globe,
    label: "News & Events",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    summary: "Live geopolitical and economic event feed with automated market impact analysis, trading bloc exposure, and FTA status on every story.",
    steps: [
      { action: "Category filter", detail: "Use the All / Geopolitical / Economic / Supply Chain buttons to narrow stories by event type." },
      { action: "Sentiment filter", detail: "Filter by Bearish, Bullish, or Neutral to focus on stories most likely to move markets in a specific direction." },
      { action: "Expand a card", detail: "Click any news card to expand the full dropdown — article summary, affected sectors, supply chain exposure, trading blocs, and relevant FTAs all appear." },
      { action: "Sector Exposure chart", detail: "The radar chart inside each card shows which sectors are most exposed to the event. Toggle to Market Impact to see estimated % impact on specific indices." },
      { action: "Trading Blocs", detail: "Each expanded card lists relevant blocs (WTO, ASEAN, NATO, OPEC+, EU, etc.) with their role tagged as Driver, Affected, or Beneficiary." },
      { action: "FTA status", detail: "Free trade agreements are color-coded: red = At Risk, green = Strengthened, blue = Relevant." },
      { action: "Auto-refresh", detail: "News refreshes automatically every 2 hours. Click 'Refresh now' at the top right to force an immediate update at any time." },
    ],
  },
  {
    icon: Settings2,
    label: "My Portfolio",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
    summary: "Track all your investments with live P&L, allocation chart, and one-click Excel export.",
    steps: [
      { action: "Add a position", detail: "Click 'Add Position', enter the ticker, number of shares, average cost per share, purchase date, and optional notes. Click 'Add Position' to confirm." },
      { action: "Live P&L", detail: "Each row shows avg cost vs. the current live price, current value, and gain/loss in dollars and % — all updating every 30 seconds automatically." },
      { action: "Edit a position", detail: "Click the pencil icon on any row to update shares, cost basis, or notes — useful after averaging down or up on an existing position." },
      { action: "Remove a position", detail: "Click the trash icon to remove a position. This is immediate with no undo — double-check before deleting." },
      { action: "Allocation chart", detail: "The donut chart updates in real time as prices move, showing each holding's weight as a % of total portfolio value." },
      { action: "Export to Excel", detail: "Click 'Export to Excel (.xlsx)' to download a formatted spreadsheet with a Portfolio sheet (all positions + TOTAL row) and a Summary sheet." },
      { action: "Refresh Prices", detail: "Click 'Refresh Prices' to manually pull the latest quotes outside the automatic 30-second update cycle." },
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
                        <li className="flex gap-2"><span className="text-green-400 shrink-0">→</span>Portfolio data is saved automatically to the server — it persists across reloads and sessions. Export to Excel anytime for an offline backup.</li>
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
  const [modal, setModal] = useState<{ open: boolean; editing?: Position }>({ open: false });
  const [saved, setSaved] = useState(false);

  // ── Load positions from server (persisted in SQLite) ─────────────────────
  const { data: positions = [], isLoading: posLoading } = useQuery<Position[]>({
    queryKey: ["/api/portfolio"],
    queryFn: () => apiRequest("GET", "/api/portfolio").then(r => r.json()),
    staleTime: 10000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const upsertMutation = useMutation({
    mutationFn: (pos: Position) =>
      apiRequest("POST", "/api/portfolio", pos).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/portfolio/${id}`).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] }),
  });

  // Fetch live prices for all portfolio tickers
  const tickers = [...new Set(positions.map(p => p.ticker))];
  const { data: livePrices, refetch: refetchPrices } = useQuery<Record<string, number>>({
    queryKey: ["/api/portfolio/prices", tickers.join(",")],
    queryFn: async () => {
      const results: Record<string, number> = {};
      await Promise.allSettled(
        tickers.map(async t => {
          try {
            const res = await apiRequest("GET", `/api/quote/${t}`);
            const data = await res.json();
            if (data?.price) results[t] = data.price;
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
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    upsertMutation.mutate({ ...data, id });
    setModal({ open: false });
  }, [upsertMutation]);

  const editPosition = useCallback((data: Omit<Position, "id">) => {
    if (!modal.editing) return;
    upsertMutation.mutate({ ...data, id: modal.editing.id });
    setModal({ open: false });
  }, [modal.editing, upsertMutation]);

  const deletePosition = useCallback((id: string) => {
    deleteMutation.mutate(id);
  }, [deleteMutation]);

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
      { "Field": "Data Source", "Value": "Veridian / Yahoo Finance" },
    ]);
    XLSX.utils.book_append_sheet(wb, meta, "Summary");

    XLSX.writeFile(wb, `Veridian_Portfolio_${new Date().toISOString().split("T")[0]}.xlsx`);
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

        {/* ── ROI Calculator ─────────────────────────────────── */}
        <ROICalculator currentValue={totalValue} costBasis={totalCost} />

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
            {/* No fixed header — each row is self-labeled */}
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

      {/* ─── APPEARANCE SETTINGS ───────────────────────────────────────────── */}
      <Section title="Appearance" icon={Palette}>
        {/* Theme */}
        <SettingRow label="Theme" description="Choose light or dark interface">
          <div className="flex gap-2">
            <button
              onClick={() => update({ theme: "dark" })}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                settings.theme === "dark"
                  ? "bg-zinc-900 text-white border-primary"
                  : "bg-zinc-800 text-zinc-400 border-border hover:border-zinc-500"
              }`}
            >
              <Moon className="w-4 h-4" />
              Dark
            </button>
            <button
              onClick={() => update({ theme: "light" })}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                settings.theme === "light"
                  ? "bg-zinc-100 text-zinc-900 border-primary"
                  : "bg-zinc-800 text-zinc-400 border-border hover:border-zinc-500"
              }`}
            >
              <Sun className="w-4 h-4" />
              Light
            </button>
          </div>
        </SettingRow>

        {/* Accent Color */}
        <SettingRow label="Accent Color" description="Primary highlight color throughout the app">
          <div className="flex items-center gap-3">
            {([
              { key: "teal",   color: "hsl(185,80%,50%)"  },
              { key: "blue",   color: "hsl(217,91%,60%)"  },
              { key: "green",  color: "hsl(142,71%,45%)"  },
              { key: "purple", color: "hsl(265,70%,60%)"  },
              { key: "orange", color: "hsl(30,90%,55%)"   },
            ] as const).map(({ key, color }) => (
              <button
                key={key}
                title={key.charAt(0).toUpperCase() + key.slice(1)}
                onClick={() => update({ accentColor: key })}
                className="w-7 h-7 rounded-full transition-all focus:outline-none"
                style={{
                  backgroundColor: color,
                  boxShadow: settings.accentColor === key
                    ? `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${color}`
                    : "none",
                  transform: settings.accentColor === key ? "scale(1.15)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </SettingRow>

        {/* Font Size */}
        <SettingRow label="Font Size" description="Base text size across the platform">
          <div className="flex gap-2">
            {([
              { key: "compact",     label: "Compact",     sample: "text-[11px]" },
              { key: "normal",      label: "Normal",      sample: "text-[13px]" },
              { key: "comfortable", label: "Comfortable", sample: "text-[15px]" },
            ] as const).map(({ key, label, sample }) => (
              <button
                key={key}
                onClick={() => update({ fontSize: key })}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                  settings.fontSize === key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-zinc-500 hover:text-foreground"
                }`}
              >
                <span className={sample}>Aa</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </SettingRow>

        {/* Compact Mode */}
        <SettingRow label="Compact Mode" description="Reduce spacing for more data on screen">
          <button
            onClick={() => update({ compactMode: !settings.compactMode })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border-2 transition-colors focus:outline-none ${
              settings.compactMode
                ? "bg-primary border-primary"
                : "bg-secondary border-border"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                settings.compactMode ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </SettingRow>
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
            { label: "Platform", value: "Veridian v1.0" },
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
