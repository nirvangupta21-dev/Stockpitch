import { createContext, useContext, useState, useCallback, ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AppSettings {
  // General
  defaultTicker: string;
  currency: "USD" | "EUR" | "GBP";
  compactNumbers: boolean;

  // Dashboard
  defaultChartRange: "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";
  showAIForecast: boolean;
  defaultInvestment: number;

  // Fair Value defaults
  dcfGrowthRate: number;        // %
  dcfTerminalGrowth: number;    // %
  dcfDiscountRate: number;      // %
  defaultSector: string;

  // Stock Explorer
  defaultMarket: "nasdaq" | "nyse" | "most_active" | "gainers" | "losers";
  defaultSort: "marketCap" | "popularity" | "volatility" | "change" | "price";
  stocksPerPage: number;

  // Refresh intervals (ms)
  quoteRefreshInterval: number;
  marketRefreshInterval: number;
  newsRefreshInterval: number;

  // Watchlist
  watchlist: string[];

  // Appearance
  theme: "dark" | "light";
  accentColor: "teal" | "blue" | "green" | "purple" | "orange";
  fontSize: "compact" | "normal" | "comfortable";
  compactMode: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultTicker: "AAPL",
  currency: "USD",
  compactNumbers: true,

  defaultChartRange: "1y",
  showAIForecast: true,
  defaultInvestment: 10000,

  dcfGrowthRate: 12,
  dcfTerminalGrowth: 3,
  dcfDiscountRate: 10,
  defaultSector: "default",

  defaultMarket: "nasdaq",
  defaultSort: "marketCap",
  stocksPerPage: 50,

  quoteRefreshInterval: 30000,
  marketRefreshInterval: 60000,
  newsRefreshInterval: 7200000,

  watchlist: ["AAPL", "NVDA", "MSFT", "GOOGL", "AMZN"],

  theme: "dark",
  accentColor: "teal",
  fontSize: "normal",
  compactMode: false,
};

// ─── Context ──────────────────────────────────────────────────────────────────
interface SettingsContextType {
  settings: AppSettings;
  update: (partial: Partial<AppSettings>) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  reset: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const update = useCallback((partial: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

export { DEFAULT_SETTINGS };
