import { useState, useCallback } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Logo from "@/components/Logo";
import SearchBar from "@/components/SearchBar";
import Dashboard from "./pages/Dashboard";
import News from "./pages/News";
import FairValue from "./pages/FairValue";
import StockExplorer from "./pages/StockExplorer";
import Settings from "./pages/Settings";
import BubbleAnalysis from "./pages/BubbleAnalysis";
import IPOListings from "./pages/IPOListings";
import { SettingsProvider } from "./lib/settings";
import { TrendingUp, Scale, Globe, List, Settings2, Activity, Building2 } from "lucide-react";

const TABS = [
  { id: "dashboard", label: "Dashboard",    icon: TrendingUp },
  { id: "fairvalue", label: "Fair Value",   icon: Scale },
  { id: "explorer",  label: "Stocks",       icon: List },
  { id: "ipos",      label: "IPOs",         icon: Building2 },
  { id: "bubble",    label: "Bubble",       icon: Activity },
  { id: "news",      label: "News & Events",icon: Globe },
  { id: "settings",  label: "My Portfolio", icon: Settings2 },
];

type TabId = "dashboard" | "fairvalue" | "explorer" | "ipos" | "bubble" | "news" | "settings";

function AppInner() {
  const [tab, setTab]       = useState<TabId>("dashboard");
  const [ticker, setTicker] = useState("AAPL");

  const handleSelect = useCallback((t: string) => {
    setTicker(t.toUpperCase());
  }, []);

  return (
    <>
      {/* Sticky top nav */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3 shrink-0">
            <Logo />
            <span className="hidden lg:block text-xs text-muted-foreground font-medium tracking-widest uppercase">
              Investment Research
            </span>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-sm">
            <SearchBar onSelect={handleSelect} currentTicker={ticker} />
          </div>

          {/* Tab switcher */}
          <nav className="flex items-center gap-0.5 bg-muted rounded-lg p-1 shrink-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                data-testid={`tab-${id}`}
                onClick={() => setTab(id as TabId)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                  tab === id
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {tab === "dashboard" && <Dashboard ticker={ticker} onTickerChange={setTicker} />}
        {tab === "fairvalue" && <FairValue ticker={ticker} />}
        {tab === "explorer"  && (
          <StockExplorer onSelectTicker={t => { setTicker(t); setTab("dashboard"); }} />
        )}
        {tab === "ipos"      && <IPOListings />}
        {tab === "bubble"    && <BubbleAnalysis />}
        {tab === "news"      && <News />}
        {tab === "settings"  && <Settings />}
      </main>

      <footer className="border-t border-border/30 mt-12 py-6 px-6 text-center text-xs text-muted-foreground">
        <p className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>Veridian</p>
        <p className="mt-0.5 opacity-70">Investment Research Platform · For informational purposes only · Not financial advice</p>
        <p className="mt-1 opacity-40">Data sourced from Yahoo Finance. Valuations are models, not guarantees.</p>
      </footer>

      <Toaster />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <AppInner />
      </SettingsProvider>
    </QueryClientProvider>
  );
}
