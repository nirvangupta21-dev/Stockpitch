import { Layers } from "lucide-react";

interface Fund { ticker: string; name: string; tracks: string; }

const GROUPS: { label: string; funds: Fund[] }[] = [
  {
    label: "US broad market",
    funds: [
      { ticker: "VOO", name: "Vanguard S&P 500", tracks: "500 large US companies" },
      { ticker: "SPY", name: "SPDR S&P 500", tracks: "500 large US companies" },
      { ticker: "IVV", name: "iShares Core S&P 500", tracks: "500 large US companies" },
      { ticker: "VTI", name: "Vanguard Total Market", tracks: "Whole US stock market" },
    ],
  },
  {
    label: "Growth and size",
    funds: [
      { ticker: "QQQ", name: "Invesco QQQ", tracks: "Nasdaq-100" },
      { ticker: "DIA", name: "SPDR Dow Jones", tracks: "30 Dow components" },
      { ticker: "IWM", name: "iShares Russell 2000", tracks: "US small caps" },
      { ticker: "SCHD", name: "Schwab US Dividend", tracks: "Dividend payers" },
    ],
  },
  {
    label: "Sectors",
    funds: [
      { ticker: "XLK", name: "Technology Select", tracks: "US technology" },
      { ticker: "XLF", name: "Financial Select", tracks: "US financials" },
      { ticker: "XLE", name: "Energy Select", tracks: "US energy" },
      { ticker: "XLV", name: "Health Care Select", tracks: "US health care" },
    ],
  },
];

export default function PopularFunds({ onSelectTicker }: { onSelectTicker: (t: string) => void }) {
  return (
    <section className="space-y-3" data-testid="popular-funds">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">ETFs and index funds</h2>
        <span className="text-xs text-muted-foreground">Click one to see every company inside</span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {GROUPS.map(g => (
          <div key={g.label} className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{g.label}</p>
            <div className="grid grid-cols-2 gap-2">
              {g.funds.map(f => (
                <button
                  key={f.ticker}
                  onClick={() => onSelectTicker(f.ticker)}
                  className="rounded-xl border bg-card p-3 text-left"
                  data-testid={`fund-${f.ticker}`}
                >
                  <span className="block text-sm font-bold tabular-nums">{f.ticker}</span>
                  <span className="block truncate text-[11px] font-medium">{f.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{f.tracks}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
