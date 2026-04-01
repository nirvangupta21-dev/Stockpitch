import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import StockHeader from "@/components/StockHeader";
import PriceChart from "@/components/PriceChart";
import InvestmentCalculator from "@/components/InvestmentCalculator";
import MetricsBar from "@/components/MetricsBar";
import MarketOverview from "@/components/MarketOverview";

export interface QuoteData {
  ticker: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  marketCap?: number;
  currency: string;
  exchange: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  volume?: number;
}

export interface HistoryPoint {
  date: string;
  close: number;
  volume: number;
}

interface Props {
  ticker: string;
  onTickerChange: (t: string) => void;
}

export default function Dashboard({ ticker }: Props) {
  const [range, setRange] = useState("1y");

  const { data: quote, isLoading: quoteLoading, error: quoteError } = useQuery<QuoteData>({
    queryKey: ["/api/quote", ticker],
    queryFn: () => apiRequest("GET", `/api/quote/${ticker}`).then(r => r.json()),
    refetchInterval: 30000,
    retry: 2,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ history: HistoryPoint[] }>({
    queryKey: ["/api/history", ticker, range],
    queryFn: () => apiRequest("GET", `/api/history/${ticker}?range=${range}`).then(r => r.json()),
    retry: 2,
  });

  return (
    <div className="space-y-6">
      {/* Stock spotlight */}
      <StockHeader quote={quote} loading={quoteLoading} error={quoteError as Error} />
      <MetricsBar quote={quote} loading={quoteLoading} />
      <PriceChart
        ticker={ticker}
        history={historyData?.history ?? []}
        loading={historyLoading}
        range={range}
        onRangeChange={setRange}
        currentPrice={quote?.price}
      />
      <InvestmentCalculator
        ticker={ticker}
        currentPrice={quote?.price}
        history={historyData?.history ?? []}
        companyName={quote?.name}
      />

      {/* Divider */}
      <div className="border-t border-border/30 pt-2" />

      {/* Market-wide section */}
      <MarketOverview />
    </div>
  );
}
