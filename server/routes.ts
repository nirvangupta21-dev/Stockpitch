import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertWatchlistSchema } from "@shared/schema";
import { getNews } from "./news";

// Yahoo Finance API proxy
async function fetchYahooQuote(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);
  return res.json();
}

async function fetchYahooV10Quote(ticker: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=summaryDetail,price`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.quoteSummary?.result?.[0]?.price;
    const summary = data?.quoteSummary?.result?.[0]?.summaryDetail;
    return { marketCap: price?.marketCap?.raw || summary?.marketCap?.raw || null };
  } catch { return null; }
}

async function fetchYahooFundamentals(ticker: string) {
  // Use Yahoo Finance v8 chart + v7 quote for combined fundamentals
  try {
    // Fetch a longer history to derive revenue-like proxy and volatility
    const [quoteRes, longHistRes] = await Promise.allSettled([
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`, { headers: { "User-Agent": "Mozilla/5.0" } }),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=3mo&range=5y`, { headers: { "User-Agent": "Mozilla/5.0" } }),
    ]);

    const quoteData = quoteRes.status === "fulfilled" && quoteRes.value.ok ? await quoteRes.value.json() : null;
    const longHistData = longHistRes.status === "fulfilled" && longHistRes.value.ok ? await longHistRes.value.json() : null;

    const meta = quoteData?.chart?.result?.[0]?.meta || {};

    // Quarterly closes for growth estimation
    const qCloses: number[] = longHistData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean) || [];
    const priceGrowth1Y = qCloses.length >= 4
      ? (qCloses[qCloses.length - 1] - qCloses[qCloses.length - 5]) / qCloses[qCloses.length - 5]
      : null;

    // Derive EPS from price/pe if available
    // We return a fundamentals object structured for the fair value page
    // Some fields will be null when not derivable from public chart data
    return {
      revenueGrowthForward: null,
      earningsGrowthForward: null,
      revenueGrowthTTM: priceGrowth1Y,
      earningsGrowthTTM: null,
      grossMargin: null,
      operatingMargin: null,
      netMargin: null,
      returnOnEquity: null,
      freeCashFlow: null,
      operatingCashFlow: null,
      revenue: null,
      ebitda: null,
      netIncome: null,
      forwardPE: null,
      trailingPE: null,
      priceToBook: null,
      enterpriseValue: null,
      evToEbitda: null,
      evToRevenue: null,
      beta: null,
      sharesOutstanding: null,
      bookValuePerShare: null,
      dividendYield: null,
      targetMeanPrice: null,
      targetMedianPrice: null,
      targetHighPrice: null,
      targetLowPrice: null,
      recommendationMean: null,
      // raw chart meta for use in route
      _meta: meta,
    };
  } catch { return null; }
}

// Better: fetch fundamentals from Yahoo Finance v7 quote which is more accessible
async function fetchYahooV7Quote(ticker: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}&fields=trailingPE,forwardPE,priceToBook,bookValue,trailingEps,forwardEps,epsTrailingTwelveMonths,epsForward,marketCap,sharesOutstanding,enterpriseValue,enterpriseToEbitda,enterpriseToRevenue,profitMargins,grossMargins,operatingMargins,returnOnEquity,returnOnAssets,freeCashflow,operatingCashflow,totalRevenue,ebitda,netIncomeToCommon,revenueGrowth,earningsGrowth,revenuePerShare,dividendYield,trailingAnnualDividendYield,beta,targetMeanPrice,targetMedianPrice,targetHighPrice,targetLowPrice,recommendationMean,52WeekChange,floatShares,heldPercentInsiders`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const q = data?.quoteResponse?.result?.[0];
    if (!q) return null;

    return {
      revenueGrowthForward: null,
      earningsGrowthForward: null,
      revenueGrowthTTM: q.revenueGrowth ?? null,
      earningsGrowthTTM: q.earningsGrowth ?? null,
      grossMargin: q.grossMargins ?? null,
      operatingMargin: q.operatingMargins ?? null,
      netMargin: q.profitMargins ?? null,
      returnOnEquity: q.returnOnEquity ?? null,
      freeCashFlow: q.freeCashflow ?? null,
      operatingCashFlow: q.operatingCashflow ?? null,
      revenue: q.totalRevenue ?? null,
      ebitda: q.ebitda ?? null,
      netIncome: q.netIncomeToCommon ?? null,
      forwardPE: q.forwardPE ?? null,
      trailingPE: q.trailingPE ?? null,
      priceToBook: q.priceToBook ?? null,
      enterpriseValue: q.enterpriseValue ?? null,
      evToEbitda: q.enterpriseToEbitda ?? null,
      evToRevenue: q.enterpriseToRevenue ?? null,
      beta: q.beta ?? null,
      sharesOutstanding: q.sharesOutstanding ?? q.floatShares ?? null,
      bookValuePerShare: q.bookValue ?? null,
      dividendYield: q.dividendYield ?? q.trailingAnnualDividendYield ?? null,
      targetMeanPrice: q.targetMeanPrice ?? null,
      targetMedianPrice: q.targetMedianPrice ?? null,
      targetHighPrice: q.targetHighPrice ?? null,
      targetLowPrice: q.targetLowPrice ?? null,
      recommendationMean: q.recommendationMean ?? null,
    };
  } catch { return null; }
}

async function fetchYahooFundamentalsV2(ticker: string) {
  try {
    const r = await fetchYahooFundamentals(ticker);
    return r;
  } catch { return null; }
}
// We replace the internal call below with V7
async function _fetchYahooFundamentals_unused(ticker: string) {
  try {
    const modules = [""].join(",");
    const r = null;
    if (!r) return null;

    const fd = r.financialData || {};
    const ks = r.defaultKeyStatistics || {};
    const sd = r.summaryDetail || {};
    const et = r.earningsTrend?.trend || [];
    const is = r.incomeStatementHistory?.incomeStatementHistory || [];
    const cf = r.cashflowStatementHistory?.cashflowStatements || [];

    // Revenue growth estimate from analyst trends
    const nextYearRevGrowth = et.find((t: any) => t.period === "+1y")?.revenueEstimate?.growth?.raw || null;
    const currentRevGrowth = et.find((t: any) => t.period === "0y")?.revenueEstimate?.growth?.raw || null;

    // Historical income statements for margin calc
    const latestIS = is[0] || {};
    const revenue = latestIS.totalRevenue?.raw || fd.totalRevenue?.raw || null;
    const netIncome = latestIS.netIncome?.raw || null;
    const ebitda = fd.ebitda?.raw || null;

    // Free cash flow
    const latestCF = cf[0] || {};
    const operatingCF = latestCF.totalCashFromOperatingActivities?.raw || fd.operatingCashflow?.raw || null;
    const capex = latestCF.capitalExpenditures?.raw || null;
    const freeCashFlow = operatingCF && capex ? operatingCF + capex : fd.freeCashflow?.raw || null; // capex is negative

    return {
      // Growth
      revenueGrowthForward: nextYearRevGrowth || currentRevGrowth,
      earningsGrowthForward: et.find((t: any) => t.period === "+1y")?.epsEstimate?.growth?.raw || null,
      revenueGrowthTTM: fd.revenueGrowth?.raw || null,
      earningsGrowthTTM: fd.earningsGrowth?.raw || null,

      // Profitability
      grossMargin: fd.grossMargins?.raw || null,
      operatingMargin: fd.operatingMargins?.raw || null,
      netMargin: fd.profitMargins?.raw || null,
      returnOnEquity: fd.returnOnEquity?.raw || null,
      returnOnAssets: fd.returnOnAssets?.raw || null,

      // Cash flow
      freeCashFlow,
      operatingCashFlow: operatingCF,
      revenue,
      ebitda,
      netIncome,

      // Valuation multiples (current)
      forwardPE: ks.forwardPE?.raw || null,
      trailingPE: ks.trailingPE?.raw || sd.trailingPE?.raw || null,
      priceToBook: ks.priceToBook?.raw || null,
      enterpriseValue: ks.enterpriseValue?.raw || null,
      evToEbitda: ks.enterpriseToEbitda?.raw || null,
      evToRevenue: ks.enterpriseToRevenue?.raw || null,
      beta: ks.beta?.raw || sd.beta?.raw || null,
      sharesOutstanding: ks.sharesOutstanding?.raw || null,
      bookValuePerShare: ks.bookValue?.raw || null,

      // Dividend
      dividendYield: sd.dividendYield?.raw || null,

      // Analyst targets
      targetMeanPrice: fd.targetMeanPrice?.raw || null,
      targetMedianPrice: fd.targetMedianPrice?.raw || null,
      targetHighPrice: fd.targetHighPrice?.raw || null,
      targetLowPrice: fd.targetLowPrice?.raw || null,
      recommendationMean: fd.recommendationMean?.raw || null,
    };
  } catch { return null; }
}

async function fetchYahooHistory(ticker: string, range: string = "1y") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);
  return res.json();
}

async function fetchYahooSearch(query: string) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=6&newsCount=0`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Yahoo Finance search error: ${res.status}`);
  return res.json();
}

export async function registerRoutes(httpServer: Server, app: Express) {
  // Search for ticker symbols
  app.get("/api/search", async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== "string") {
        return res.status(400).json({ message: "Query required" });
      }
      const data = await fetchYahooSearch(q);
      const ALLOWED = ["NASDAQ", "NYSE", "NMS", "NYQ", "NGM", "NCM"];
      const quotes = (data.quotes || [])
        .filter((q: any) =>
          q.quoteType === "EQUITY" &&
          ALLOWED.some(e => (q.exchange || "").toUpperCase().includes(e) || (q.exchDisp || "").toUpperCase().includes(e))
        )
        .slice(0, 6)
        .map((q: any) => ({
          ticker: q.symbol,
          name: q.longname || q.shortname || q.symbol,
          exchange: q.exchDisp || q.exchange,
          type: q.quoteType,
        }));
      res.json(quotes);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Get quote for a ticker
  app.get("/api/quote/:ticker", async (req, res) => {
    try {
      const { ticker } = req.params;
      const data = await fetchYahooQuote(ticker.toUpperCase());
      const meta = data.chart?.result?.[0]?.meta;
      if (!meta) return res.status(404).json({ message: "Ticker not found" });

      // Fetch market cap from v10 in parallel
      const [extraData] = await Promise.allSettled([fetchYahooV10Quote(ticker.toUpperCase())]);
      const extra = extraData.status === "fulfilled" ? extraData.value : null;
      const prevClose = meta.previousClose || meta.chartPreviousClose || meta.regularMarketPreviousClose;
      const price = meta.regularMarketPrice;
      const marketCap = meta.marketCap || extra?.marketCap || null;

      // Enforce NYSE / NASDAQ only
      const exchange = (meta.fullExchangeName || meta.exchangeName || "").toLowerCase();
      const allowedExchanges = ["nasdaq", "nyse", "nasdaqgs", "nasdaqgm", "nasdaqcm", "nms", "nyq"];
      const isAllowedExchange = allowedExchanges.some(e => exchange.includes(e));
      if (!isAllowedExchange) {
        return res.status(403).json({
          message: `${meta.symbol} is listed on ${meta.fullExchangeName || meta.exchangeName}, not NYSE or NASDAQ. This platform only supports NYSE and NASDAQ listed stocks.`,
        });
      }

      // Enforce minimum $1B market cap threshold
      const MIN_MARKET_CAP = 1_000_000_000;
      if (marketCap !== null && marketCap < MIN_MARKET_CAP) {
        return res.status(403).json({
          message: `${meta.symbol} has a market cap below $1B and does not meet the minimum threshold for this platform.`,
          marketCap,
        });
      }

      const quote = {
        ticker: meta.symbol,
        name: meta.longName || meta.shortName || meta.symbol,
        price,
        previousClose: prevClose,
        change: price - prevClose,
        changePercent: ((price - prevClose) / prevClose) * 100,
        marketCap,
        currency: meta.currency,
        exchange: meta.fullExchangeName || meta.exchangeName,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
        volume: meta.regularMarketVolume,
      };
      res.json(quote);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Get price history
  app.get("/api/history/:ticker", async (req, res) => {
    try {
      const { ticker } = req.params;
      const range = (req.query.range as string) || "1y";
      const data = await fetchYahooHistory(ticker.toUpperCase(), range);
      const result = data.chart?.result?.[0];
      if (!result) return res.status(404).json({ message: "No data" });

      const timestamps: number[] = result.timestamp || [];
      const closes: number[] = result.indicators?.quote?.[0]?.close || [];
      const volumes: number[] = result.indicators?.quote?.[0]?.volume || [];

      const history = timestamps
        .map((ts: number, i: number) => ({
          date: new Date(ts * 1000).toISOString().split("T")[0],
          close: closes[i] ? parseFloat(closes[i].toFixed(2)) : null,
          volume: volumes[i] || 0,
        }))
        .filter((d: any) => d.close !== null);

      res.json({ ticker: ticker.toUpperCase(), range, history });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Market overview — indices, sectors, movers
  app.get("/api/market/overview", async (req, res) => {
    try {
      // Major indices + sector ETFs in one shot via v8 chart API
      const INDICES = ["%5EGSPC", "%5EIXIC", "%5EDJI", "%5ENYC"]; // S&P, NASDAQ, DOW, NYSE Composite
      const SECTOR_ETFS = ["XLK","XLF","XLV","XLE","XLI","XLC","XLY","XLP","XLB","XLRE","XLU"];
      const SECTOR_NAMES: Record<string, string> = {
        XLK: "Technology", XLF: "Financials", XLV: "Health Care",
        XLE: "Energy", XLI: "Industrials", XLC: "Comm. Services",
        XLY: "Cons. Discretionary", XLP: "Cons. Staples", XLB: "Materials",
        XLRE: "Real Estate", XLU: "Utilities",
      };
      const INDEX_NAMES: Record<string, string> = {
        "%5EGSPC": "S&P 500", "%5EIXIC": "NASDAQ", "%5EDJI": "Dow Jones", "%5ENYC": "NYSE Composite",
      };

      const allSymbols = [...INDICES, ...SECTOR_ETFS];

      const fetches = allSymbols.map(sym =>
        fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`, {
          headers: { "User-Agent": "Mozilla/5.0" },
        })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      );

      const results = await Promise.all(fetches);

      const parse = (data: any, sym: string, isIndex: boolean) => {
        const meta = data?.chart?.result?.[0]?.meta;
        const closes: number[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean) || [];
        if (!meta || closes.length < 2) return null;
        const prev = closes[closes.length - 2];
        const curr = meta.regularMarketPrice ?? closes[closes.length - 1];
        const chg = curr - prev;
        const chgPct = (chg / prev) * 100;
        // 5-day sparkline
        const spark = closes.slice(-5).map(c => parseFloat((c ?? 0).toFixed(2)));
        return {
          symbol: isIndex ? (INDEX_NAMES[sym] || sym) : sym,
          name: isIndex ? (INDEX_NAMES[sym] || meta.longName || sym) : (SECTOR_NAMES[sym] || meta.shortName || sym),
          price: parseFloat(curr.toFixed(2)),
          change: parseFloat(chg.toFixed(2)),
          changePct: parseFloat(chgPct.toFixed(2)),
          spark,
          isIndex,
        };
      };

      const indices = results.slice(0, INDICES.length)
        .map((d, i) => parse(d, INDICES[i], true))
        .filter(Boolean);

      const sectors = results.slice(INDICES.length)
        .map((d, i) => parse(d, SECTOR_ETFS[i], false))
        .filter(Boolean)
        .sort((a: any, b: any) => b.changePct - a.changePct);

      res.json({ indices, sectors });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Top gainers and losers from Yahoo Finance
  app.get("/api/market/movers", async (req, res) => {
    try {
      const [gainersRes, losersRes] = await Promise.all([
        fetch("https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=8", {
          headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
        }),
        fetch("https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_losers&count=8", {
          headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
        }),
      ]);

      const parse = (data: any) => {
        const quotes = data?.finance?.result?.[0]?.quotes || [];
        return quotes
          .filter((q: any) => q.exchange === "NMS" || q.exchange === "NYQ" || q.exchange === "NGM" || q.exchange === "NCM")
          .slice(0, 6)
          .map((q: any) => ({
            ticker: q.symbol,
            name: q.shortName || q.longName || q.symbol,
            price: parseFloat((q.regularMarketPrice || 0).toFixed(2)),
            changePct: parseFloat((q.regularMarketChangePercent || 0).toFixed(2)),
            marketCap: q.marketCap || null,
          }));
      };

      const gainersData = gainersRes.ok ? await gainersRes.json() : null;
      const losersData = losersRes.ok ? await losersRes.json() : null;

      res.json({
        gainers: gainersData ? parse(gainersData) : [],
        losers: losersData ? parse(losersData) : [],
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Fundamentals for fair value — proxies to Python yfinance microservice on port 5001
  app.get("/api/fundamentals/:ticker", async (req, res) => {
    try {
      const { ticker } = req.params;
      const pyRes = await fetch(`http://127.0.0.1:5001/?ticker=${ticker.toUpperCase()}`);
      if (!pyRes.ok) return res.status(404).json({ message: "Fundamentals not available" });
      const data = await pyRes.json();
      if (data.error) return res.status(404).json({ message: data.error });
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Daily IPO Listings
  app.get("/api/ipos", async (req, res) => {
    try {
      // Strategy: fetch holdings from IPO ETFs (Renaissance IPO ETF = "IPO", FPX)
      // These ETFs track recent listings and give us real tickers with live prices
      const ETF_TICKERS = ["RDDT", "ARM", "ASTERA", "ASTS", "RKLB", "IONQ", "JOBY", "ACHR",
                           "BFLY", "PAYO", "TPVG", "SOUN", "NAUT", "HIMS", "CLOV", "OPEN",
                           "RIVN", "CART", "KVYO", "BIRK", "KSPI", "LNTH", "LMND", "SOFI"];

      // Also fetch small cap gainers as a proxy for recently listed high-momentum stocks
      const [gainersRes, ...etfRes] = await Promise.all([
        fetch("https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=small_cap_gainers&count=30", {
          headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        }),
        ...ETF_TICKERS.slice(0, 12).map(t =>
          fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1d&range=1d`, {
            headers: { "User-Agent": "Mozilla/5.0" },
          }).catch(() => null)
        ),
      ]);

      // Parse ETF ticker data as "recent IPOs"
      const recentIPOs: any[] = [];
      const etfJsons = await Promise.all(
        etfRes.map(r => r && (r as Response).ok ? (r as Response).json().catch(() => null) : Promise.resolve(null))
      );

      etfJsons.forEach((data: any, i: number) => {
        if (!data) return;
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta || !meta.regularMarketPrice) return;
        const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
        recentIPOs.push({
          ticker: meta.symbol,
          name: meta.longName || meta.shortName || meta.symbol,
          exchange: meta.fullExchangeName || meta.exchangeName,
          price: parseFloat(meta.regularMarketPrice.toFixed(2)),
          marketCap: meta.marketCap || null,
          change: parseFloat((((meta.regularMarketPrice - prev) / prev) * 100).toFixed(2)),
          ipoDate: null,
          sector: "Technology",
          industry: "N/A",
          type: "recent",
        });
      });

      // Parse small cap gainers as upcoming/watchlist
      const gainersData = gainersRes.ok ? await gainersRes.json() : null;
      const upcoming: any[] = (gainersData?.finance?.result?.[0]?.quotes || [])
        .filter((q: any) => q.exchange === "NMS" || q.exchange === "NYQ" || q.exchange === "NGM")
        .slice(0, 10)
        .map((q: any) => ({
          ticker: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          exchange: q.fullExchangeName || q.exchange,
          price: q.regularMarketPrice || null,
          marketCap: q.marketCap || null,
          change: q.regularMarketChangePercent || null,
          ipoDate: null,
          sector: q.sector || "N/A",
          industry: q.industry || "N/A",
          type: "upcoming",
        }));

      res.json({
        upcoming,
        recent: recentIPOs.filter(r => r.price > 0),
        lastUpdated: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Stock Explorer ───────────────────────────────────────────────────────
  app.get("/api/explorer", async (req, res) => {
    try {
      const market = (req.query.market as string) || "nasdaq";
      const sort = (req.query.sort as string) || "marketCap";
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      // Yahoo Finance predefined screeners
      const SCREENER_MAP: Record<string, string> = {
        nasdaq: "most_actives",       // We filter by exchange after
        nyse: "most_actives",
        "large_cap": "large_cap_gainers",
        "most_active": "most_actives",
        "gainers": "day_gainers",
        "losers": "day_losers",
      };

      // Fetch from Yahoo screener
      const screener = SCREENER_MAP[market] || "most_actives";
      const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${screener}&count=100`;
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
      if (!r.ok) return res.status(502).json({ message: "Screener unavailable" });
      const data = await r.json();
      const quotes: any[] = data?.finance?.result?.[0]?.quotes || [];

      // Exchange filter
      const NASDAQ_EXCHANGES = new Set(["NMS", "NGM", "NCM", "NasdaqGS", "NasdaqGM", "NasdaqCM"]);
      const NYSE_EXCHANGES = new Set(["NYQ", "NYSE", "NYSEArca"]);

      let filtered = quotes;
      if (market === "nasdaq") filtered = quotes.filter(q => NASDAQ_EXCHANGES.has(q.exchange) || (q.fullExchangeName || "").toLowerCase().includes("nasdaq"));
      else if (market === "nyse") filtered = quotes.filter(q => NYSE_EXCHANGES.has(q.exchange) || (q.fullExchangeName || "").toLowerCase().includes("nyse"));

      // Build response
      const stocks = filtered.map((q: any) => {
        const price = q.regularMarketPrice || 0;
        const prev = q.regularMarketPreviousClose || price;
        const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
        // Volatility proxy: 52-week range as % of current price
        const hi = q.fiftyTwoWeekHigh || price;
        const lo = q.fiftyTwoWeekLow || price;
        const volatility = price > 0 ? ((hi - lo) / price) * 100 : 0;
        const volatilityLabel = volatility > 80 ? "High" : volatility > 40 ? "Medium" : "Low";

        return {
          ticker: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          exchange: q.fullExchangeName || q.exchange,
          exchangeCode: q.exchange,
          price: parseFloat(price.toFixed(2)),
          changePct: parseFloat(changePct.toFixed(2)),
          marketCap: q.marketCap || 0,
          volume: q.regularMarketVolume || 0,
          avgVolume: q.averageDailyVolume3Month || 0,
          fiftyTwoWeekHigh: parseFloat((hi).toFixed(2)),
          fiftyTwoWeekLow: parseFloat((lo).toFixed(2)),
          volatility: parseFloat(volatility.toFixed(1)),
          volatilityLabel,
          sector: q.sector || null,
          pe: q.trailingPE || null,
        };
      });

      // Sort
      const sorted = stocks.sort((a: any, b: any) => {
        if (sort === "marketCap") return b.marketCap - a.marketCap;
        if (sort === "popularity") return b.volume - a.volume;
        if (sort === "volatility") return b.volatility - a.volatility;
        if (sort === "change") return Math.abs(b.changePct) - Math.abs(a.changePct);
        if (sort === "price") return b.price - a.price;
        return b.marketCap - a.marketCap;
      });

      res.json({ stocks: sorted.slice(0, limit), total: sorted.length, market, sort });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Stock detail sparkline (7d)
  app.get("/api/explorer/spark/:ticker", async (req, res) => {
    try {
      const { ticker } = req.params;
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1mo`, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) return res.json({ spark: [] });
      const data = await r.json();
      const closes: number[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean) || [];
      res.json({ spark: closes.slice(-14).map((c: number) => parseFloat(c.toFixed(2))) });
    } catch {
      res.json({ spark: [] });
    }
  });

  // News & geopolitical events
  app.get("/api/news", async (req, res) => {
    try {
      const force = req.query.force === "true";
      const data = await getNews(force);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── AI Assistant ──────────────────────────────────────────────────────────
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { messages, ticker, context: stockContext } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ message: "messages array required" });
      }

      const SYSTEM_PROMPT = `You are an expert investment research assistant embedded in Veridian, a stock analysis platform for NYSE and NASDAQ equities.

Your role is to:
- Help users understand stocks, financial metrics, valuation models, and market dynamics
- Explain concepts like P/E ratios, DCF models, EV/EBITDA, beta, volatility, free cash flow, and more
- Help users think through investment theses — both long and short
- Analyze trading blocs, FTAs, geopolitical risks, and macroeconomic trends as they relate to markets
- Discuss sector trends, competitive positioning, and company fundamentals
- Help structure pitch presentations for investors

Critical rules you MUST follow:
1. ALWAYS end every single response with this exact disclaimer on its own line: "⚠️ This is for research and informational purposes only. This does not constitute financial advice. Please conduct your own due diligence and consult a licensed financial advisor before making any investment decisions."
2. Never tell a user to buy or sell a specific stock directly
3. Never promise returns or guarantee outcomes
4. If asked for direct investment advice, redirect to analysis and frameworks instead
5. Be factual, balanced, and present both bull and bear cases when discussing specific stocks
6. Keep responses concise and structured — use bullet points and headers where helpful

${stockContext ? `Current stock context from the platform:
${stockContext}` : ""}`;

      // Try OpenAI first, fall back to a simple response if no API key
      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        // Fallback: rule-based responses when no API key configured
        const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || "";
        let reply = "I can help you analyze stocks, explain financial metrics, discuss investment theses, and explore market dynamics. What would you like to explore?";

        if (lastMsg.includes("p/e") || lastMsg.includes("price to earnings")) {
          reply = "**Price-to-Earnings (P/E) Ratio**\n\nThe P/E ratio measures how much investors pay per dollar of earnings. A high P/E suggests growth expectations; a low P/E may indicate undervaluation or slow growth.\n\n- **Trailing P/E**: Based on past 12 months of earnings\n- **Forward P/E**: Based on estimated future earnings\n- **Sector context matters**: Tech trades at 25-35x, utilities at 15-18x\n\nAlways compare P/E to sector peers, not the market broadly.";
        } else if (lastMsg.includes("dcf") || lastMsg.includes("discounted cash flow")) {
          reply = "**DCF (Discounted Cash Flow) Valuation**\n\nDCF estimates intrinsic value by projecting future free cash flows and discounting them to present value using a discount rate (WACC).\n\nKey inputs:\n- **Free Cash Flow growth rate** (years 1-5)\n- **Terminal growth rate** (long-run, typically 2-3%)\n- **WACC** (cost of capital, typically 8-12%)\n\nThe Fair Value tab in Veridian runs a live DCF — try adjusting the sliders to stress-test assumptions.";
        } else if (lastMsg.includes("short") || lastMsg.includes("shorting")) {
          reply = "**Short Selling Basics**\n\nShorting involves borrowing shares, selling them, and buying back at a lower price to profit from a decline.\n\nKey short thesis elements:\n- Deteriorating fundamentals (declining margins, revenue miss)\n- Overvaluation vs. peers (high P/S, P/E relative to growth)\n- Competitive moat erosion\n- Regulatory or legal overhang\n- Insider selling or high short interest already\n\nRisks: Unlimited downside if wrong, short squeeze potential.";
        } else if (lastMsg.includes("volatility") || lastMsg.includes("beta")) {
          reply = "**Volatility & Beta**\n\n**Beta** measures a stock's sensitivity to market moves:\n- Beta > 1: More volatile than the market\n- Beta < 1: Less volatile\n- Beta = 1: Moves with the market\n\n**Volatility** in Veridian is calculated as the 52-week high-low range as a % of current price — useful for identifying high-risk/high-reward setups.";
        }

        return res.json({
          role: "assistant",
          content: reply + "\n\n⚠️ This is for research and informational purposes only. This does not constitute financial advice. Please conduct your own due diligence and consult a licensed financial advisor before making any investment decisions.",
          model: "rule-based",
        });
      }

      // OpenAI API call
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages.slice(-12), // keep last 12 messages for context
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "OpenAI API error");
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || "I couldn't generate a response. Please try again.";

      // Ensure disclaimer is always present
      const disclaimer = "\n\n⚠️ This is for research and informational purposes only. This does not constitute financial advice. Please conduct your own due diligence and consult a licensed financial advisor before making any investment decisions.";
      const finalReply = reply.includes("research and informational purposes") ? reply : reply + disclaimer;

      res.json({
        role: "assistant",
        content: finalReply,
        model: data.model,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Watchlist routes
  app.get("/api/watchlist", (_req, res) => {
    res.json(storage.getWatchlist());
  });

  app.post("/api/watchlist", (req, res) => {
    const parsed = insertWatchlistSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data" });
    const entry = storage.addToWatchlist(parsed.data);
    res.json(entry);
  });

  app.delete("/api/watchlist/:id", (req, res) => {
    storage.removeFromWatchlist(parseInt(req.params.id));
    res.json({ success: true });
  });
}
