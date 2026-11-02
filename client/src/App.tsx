import { useState, useCallback, useEffect } from "react";

// ── 15-minute intro skip via cookie (cookies work; localStorage is blocked) ──
const COOKIE = "vrd_entered";
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function hasRecentSession(): boolean {
  const match = document.cookie.split("; ").find(c => c.startsWith(COOKIE + "="));
  if (!match) return false;
  const ts = parseInt(match.split("=")[1] ?? "0", 10);
  return Date.now() - ts < WINDOW_MS;
}

function markSession(): void {
  const expires = new Date(Date.now() + WINDOW_MS).toUTCString();
  document.cookie = `${COOKIE}=${Date.now()}; expires=${expires}; path=/; SameSite=Lax`;
}
import IntroScreen from "@/components/IntroScreen";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./lib/auth";
import { Toaster } from "@/components/ui/toaster";
import Logo from "@/components/Logo";
import AccountMenu from "@/components/AccountMenu";
import SearchBar from "@/components/SearchBar";
import Dashboard from "./pages/Dashboard";
import News from "./pages/News";
import FairValue from "./pages/FairValue";
import StockExplorer from "./pages/StockExplorer";
import Settings from "./pages/Settings";
import BubbleAnalysis from "./pages/BubbleAnalysis";
import IPOListings from "./pages/IPOListings";
import StockComparison from "./pages/StockComparison";
import { SettingsProvider, useSettings } from "./lib/settings";
import { TrendingUp, Scale, Globe, List, Settings2, Activity, Building2, BarChart2, Menu, X } from "lucide-react";

type TabId = "dashboard" | "fairvalue" | "compare" | "explorer" | "ipos" | "bubble" | "news" | "settings";

const NAV_GROUPS: { label: string; items: { id: TabId; label: string; icon: any }[] }[] = [
  {
    label: "Markets",
    items: [{ id: "dashboard", label: "Dashboard", icon: TrendingUp }],
  },
  {
    label: "Research",
    items: [
      { id: "explorer", label: "Stock Explorer", icon: List },
      { id: "fairvalue", label: "Fair Value", icon: Scale },
      { id: "compare", label: "Compare", icon: BarChart2 },
      { id: "bubble", label: "Bubble Analysis", icon: Activity },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { id: "news", label: "News & Events", icon: Globe },
      { id: "ipos", label: "IPO Center", icon: Building2 },
    ],
  },
  {
    label: "Personal",
    items: [{ id: "settings", label: "My Portfolio", icon: Settings2 }],
  },
];

function AppInner() {
  const { settings } = useSettings();
  const [entered, setEntered] = useState(() => hasRecentSession());
  const [tab, setTab]       = useState<TabId>("dashboard");
  const [ticker, setTicker] = useState<string | null>(null); // null = landing state
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    // Theme — mutually exclusive, always set one and remove the other
    if (settings.theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }
    // Accent
    root.setAttribute("data-accent", settings.accentColor);
    // Font size
    root.setAttribute("data-fontsize", settings.fontSize);
    // Compact
    root.classList.toggle("compact", settings.compactMode);
  }, [settings.theme, settings.accentColor, settings.fontSize, settings.compactMode]);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const handleSelect = useCallback((t: string) => {
    setTicker(t.toUpperCase());
    setTab("dashboard"); // always jump to dashboard when a stock is searched
  }, []);

  const goHome = useCallback(() => {
    setTicker(null);
    setTab("dashboard");
  }, []);

  const navItems = (onNavigate: () => void) => (
    <>
      {NAV_GROUPS.map(group => (
        <div key={group.label}>
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  data-testid={`tab-${id}`}
                  onClick={() => { setTab(id); onNavigate(); }}
                  aria-current={active ? "page" : undefined}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    active
                      ? "accent-gradient text-white shadow-lg shadow-primary/25"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <>
      {!entered && <IntroScreen onEnter={() => { markSession(); setEntered(true); }} />}

      <div className="min-h-screen">
        {/* ── Desktop sidebar ── */}
        <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col z-40 glass-panel rounded-none border-y-0 border-l-0">
          <div className="p-5 pb-4">
            <button
              className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
              onClick={goHome}
              data-testid="button-logo-home"
            >
              <Logo />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto overscroll-contain px-3 space-y-5" aria-label="Main navigation">
            {navItems(() => {})}
          </nav>
          <div className="p-4 border-t border-border/40 text-[10px] leading-relaxed text-muted-foreground/70">
            Veridian · Investment research platform.
            Data from Yahoo Finance. Not financial advice.
          </div>
        </aside>

        {/* ── Main column ── */}
        <div className="lg:pl-60 flex flex-col min-h-screen">
          {/* Top bar */}
          <header className="sticky top-0 z-40 glass-panel rounded-none border-x-0 border-t-0">
            <div className="px-4 sm:px-6 h-14 flex items-center gap-3">
              {/* Mobile: menu + logo */}
              <button
                className="lg:hidden flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open navigation"
                data-testid="button-menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <button className="lg:hidden shrink-0 hover:opacity-80 transition-opacity" onClick={goHome}>
                <Logo compact />
              </button>

              {/* Search */}
              <div className="flex-1 max-w-md mx-auto lg:mx-0 lg:ml-2">
                <SearchBar onSelect={handleSelect} currentTicker={ticker ?? ""} />
              </div>

              <AccountMenu />
            </div>
          </header>

          {/* ── Mobile drawer ── */}
          {drawerOpen && (
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setDrawerOpen(false)}
              />
              <aside className="absolute inset-y-0 left-0 w-64 flex flex-col glass-panel rounded-none border-y-0 border-l-0 drawer-in">
                <div className="p-5 pb-4 flex items-center justify-between">
                  <button className="hover:opacity-80 transition-opacity" onClick={() => { setDrawerOpen(false); goHome(); }}>
                    <Logo />
                  </button>
                  <button
                    className="flex items-center justify-center w-8 h-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                    onClick={() => setDrawerOpen(false)}
                    aria-label="Close navigation"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <nav className="flex-1 overflow-y-auto overscroll-contain px-3 space-y-5" aria-label="Main navigation">
                  {navItems(() => setDrawerOpen(false))}
                </nav>
              </aside>
            </div>
          )}

          {/* Page content */}
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
            {tab === "dashboard" && <Dashboard ticker={ticker} onTickerChange={t => setTicker(t ?? null)} />}
            {tab === "fairvalue" && <FairValue ticker={ticker ?? "AAPL"} />}
            {tab === "compare"   && <StockComparison />}
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
        </div>
      </div>

      <Toaster />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettingsProvider>
          <AppInner />
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
