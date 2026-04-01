import { XMLParser } from "fast-xml-parser";

// ─── RSS Sources ───────────────────────────────────────────────────────────
const RSS_FEEDS = [
  // Geopolitical
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "Geopolitical", source: "BBC World" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", category: "Geopolitical", source: "NYT World" },
  { url: "https://www.ft.com/rss/home/international", category: "Geopolitical", source: "Financial Times" },
  // Economic / Markets
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", category: "Economic", source: "WSJ Markets" },
  { url: "https://feeds.bloomberg.com/markets/news.rss", category: "Economic", source: "Bloomberg Markets" },
  { url: "https://feeds.reuters.com/reuters/businessNews", category: "Economic", source: "Reuters Business" },
  // Supply Chain / Trade
  { url: "https://feeds.reuters.com/reuters/technologyNews", category: "Supply Chain", source: "Reuters Tech" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", category: "Economic", source: "BBC Business" },
];

// ─── Impact mapping ────────────────────────────────────────────────────────
interface Impact {
  sectors: string[];
  supplyChains: string[];
  markets: string[];
  sentiment: "bullish" | "bearish" | "neutral";
  magnitude: number; // 1-5
  tradingBlocs: TradingBlocImpact[];
  ftas: FTAImpact[];
}

interface TradingBlocImpact {
  name: string;              // e.g. "EU", "ASEAN"
  role: "affected" | "driver" | "beneficiary";
  description: string;
}

interface FTAImpact {
  name: string;              // e.g. "USMCA", "CPTPP"
  status: "at risk" | "strengthened" | "relevant";
  description: string;
}

const KEYWORD_MAP: Array<{
  keywords: string[];
  sectors: string[];
  supplyChains: string[];
  markets: string[];
  sentiment: "bullish" | "bearish" | "neutral";
  magnitude: number;
  tradingBlocs?: TradingBlocImpact[];
  ftas?: FTAImpact[];
}> = [
  {
    keywords: ["tariff", "trade war", "import duty", "trade restriction", "sanctions", "trade barrier"],
    sectors: ["Industrials", "Consumer Discretionary", "Technology", "Materials"],
    supplyChains: ["Global Manufacturing", "Electronics", "Automotive", "Semiconductors"],
    markets: ["S&P 500", "NASDAQ", "Emerging Markets"],
    sentiment: "bearish", magnitude: 4,
    tradingBlocs: [
      { name: "WTO", role: "affected", description: "Tariff escalation may trigger WTO dispute mechanisms and retaliatory measures among member states." },
      { name: "EU", role: "affected", description: "EU exporters face reduced competitiveness; potential counter-tariffs on US goods." },
      { name: "G7", role: "driver", description: "G7 coordination on trade policy shapes the scope and duration of restrictions." },
    ],
    ftas: [
      { name: "USMCA", status: "at risk", description: "Tariff actions may conflict with USMCA Chapter 32 obligations on cross-border goods." },
      { name: "US-EU Trade Framework", status: "at risk", description: "Bilateral trade tensions risk stalling ongoing US-EU trade normalization talks." },
    ],
  },
  {
    keywords: ["oil", "opec", "crude", "energy crisis", "petroleum", "natural gas", "lng"],
    sectors: ["Energy", "Utilities", "Airlines", "Consumer Staples"],
    supplyChains: ["Oil & Gas", "Petrochemicals", "Transportation"],
    markets: ["NYSE", "Energy ETF (XLE)", "S&P 500"],
    sentiment: "bearish", magnitude: 4,
    tradingBlocs: [
      { name: "OPEC+", role: "driver", description: "OPEC+ production decisions directly set global crude benchmarks, affecting NYSE-listed energy stocks." },
      { name: "Gulf Cooperation Council (GCC)", role: "driver", description: "GCC members coordinate on energy pricing and infrastructure investment." },
    ],
    ftas: [
      { name: "US-Gulf Energy Agreements", status: "relevant", description: "Bilateral energy export frameworks between the US and Gulf states affect LNG pricing and volumes." },
    ],
  },
  {
    keywords: ["china", "beijing", "taiwan", "hong kong", "sino", "prc", "ccp"],
    sectors: ["Technology", "Semiconductors", "Consumer Discretionary"],
    supplyChains: ["Electronics Manufacturing", "Rare Earths", "Semiconductors"],
    markets: ["NASDAQ", "S&P 500", "Emerging Markets"],
    sentiment: "bearish", magnitude: 3,
    tradingBlocs: [
      { name: "RCEP", role: "driver", description: "China anchors RCEP — Asia-Pacific supply chain disruptions ripple through RCEP member economies." },
      { name: "ASEAN", role: "affected", description: "ASEAN manufacturers face supply disruption and potential beneficiary effects from China diversification." },
      { name: "WTO", role: "affected", description: "China-US trade tensions strain WTO dispute resolution processes." },
    ],
    ftas: [
      { name: "CPTPP", status: "relevant", description: "China's bid to join CPTPP is sensitive to geopolitical conditions; US exclusion shapes dynamics." },
      { name: "USMCA", status: "at risk", description: "USMCA Article 32.10 (non-market economy clause) may be invoked against Chinese FDI routing through Mexico." },
    ],
  },
  {
    keywords: ["interest rate", "federal reserve", "fed rate", "inflation", "cpi", "monetary policy", "fomc"],
    sectors: ["Financials", "Real Estate", "Utilities", "Technology"],
    supplyChains: ["Credit Markets", "Mortgage Markets"],
    markets: ["S&P 500", "NASDAQ", "Bonds", "NYSE"],
    sentiment: "bearish", magnitude: 5,
    tradingBlocs: [
      { name: "G20", role: "affected", description: "Fed rate decisions trigger capital flow realignment across G20 economies and emerging markets." },
      { name: "IMF", role: "affected", description: "IMF monitors spillover effects of US monetary tightening on developing-nation debt sustainability." },
    ],
    ftas: [
      { name: "Dollar-Denominated Trade Agreements", status: "relevant", description: "Rate changes affect USD cost of cross-border invoicing under trade agreements settled in US dollars." },
    ],
  },
  {
    keywords: ["recession", "gdp decline", "economic contraction", "unemployment surge", "stagflation"],
    sectors: ["Consumer Discretionary", "Financials", "Industrials"],
    supplyChains: ["Retail", "Manufacturing", "Credit"],
    markets: ["S&P 500", "NYSE", "NASDAQ"],
    sentiment: "bearish", magnitude: 5,
    tradingBlocs: [
      { name: "G7", role: "affected", description: "Synchronized slowdown risk across G7 economies amplifies recession probability." },
      { name: "EU", role: "affected", description: "Euro area GDP contraction weighs on transatlantic trade volumes." },
    ],
    ftas: [
      { name: "USMCA", status: "relevant", description: "North American demand contraction reduces intra-bloc trade flows under USMCA." },
    ],
  },
  {
    keywords: ["semiconductor", "chip", "nvidia", "intel", "tsmc", "wafer", "foundry"],
    sectors: ["Technology", "Semiconductors", "AI Infrastructure"],
    supplyChains: ["Chip Manufacturing", "Electronics", "Data Centers"],
    markets: ["NASDAQ", "SOX Index", "S&P 500"],
    sentiment: "neutral", magnitude: 3,
    tradingBlocs: [
      { name: "Chip 4 Alliance", role: "driver", description: "US-Japan-South Korea-Taiwan coordination on semiconductor supply chains reshapes global chip flows." },
      { name: "EU Chips Act Bloc", role: "affected", description: "EU semiconductor sovereignty push competes with and complements US CHIPS Act subsidies." },
    ],
    ftas: [
      { name: "US-Japan Technology Agreement", status: "strengthened", description: "Bilateral tech frameworks accelerate joint chip R&D and export control alignment." },
      { name: "IPEF (Indo-Pacific Economic Framework)", status: "relevant", description: "IPEF supply chain pillar specifically targets semiconductor and critical minerals resilience." },
    ],
  },
  {
    keywords: ["ai", "artificial intelligence", "machine learning", "llm", "openai", "large language model"],
    sectors: ["Technology", "Cloud Computing", "Semiconductors"],
    supplyChains: ["Data Centers", "Power Grid", "Chip Supply"],
    markets: ["NASDAQ", "S&P 500"],
    sentiment: "bullish", magnitude: 3,
    tradingBlocs: [
      { name: "G7 AI Governance Framework", role: "driver", description: "G7 Hiroshima AI Process sets interoperability and safety standards affecting cross-border AI deployment." },
      { name: "EU AI Act Bloc", role: "affected", description: "EU AI Act creates regulatory divergence that US tech firms must navigate for European market access." },
    ],
    ftas: [
      { name: "US-UK Digital Trade Agreement", status: "strengthened", description: "Data flow and AI governance provisions in US-UK digital trade framework facilitate joint AI commercialization." },
      { name: "IPEF Digital Pillar", status: "relevant", description: "IPEF digital economy pillar covers cross-border data flows and AI standards across Indo-Pacific." },
    ],
  },
  {
    keywords: ["ukraine", "russia", "war", "conflict", "military", "nato", "missile", "zelensky", "kremlin"],
    sectors: ["Defense", "Energy", "Agriculture", "Chemicals"],
    supplyChains: ["Wheat & Grains", "Fertilizers", "Natural Gas Pipeline"],
    markets: ["NYSE", "European Markets", "Commodity Futures"],
    sentiment: "bearish", magnitude: 4,
    tradingBlocs: [
      { name: "NATO", role: "driver", description: "NATO defense commitments drive member-state defense spending, benefiting US defense contractors." },
      { name: "EU", role: "affected", description: "EU energy transition accelerated by Russian gas cutoffs; trade rerouting through EU members ongoing." },
      { name: "G7", role: "driver", description: "G7 sanctions architecture and financial exclusion of Russia coordinated through bloc mechanisms." },
    ],
    ftas: [
      { name: "EU-Ukraine Association Agreement", status: "strengthened", description: "Wartime trade liberalization with Ukraine deepened; Ukrainian agricultural exports enter EU tariff-free." },
      { name: "SWIFT Exclusion / Sanctions Regime", status: "relevant", description: "Not an FTA, but sanctions architecture functionally overrides pre-existing bilateral trade agreements with Russia." },
    ],
  },
  {
    keywords: ["middle east", "iran", "israel", "saudi", "yemen", "gulf", "strait of hormuz", "red sea"],
    sectors: ["Energy", "Defense", "Airlines"],
    supplyChains: ["Oil Supply", "Shipping Routes", "Defense Contracts"],
    markets: ["NYSE", "Energy ETF (XLE)", "S&P 500"],
    sentiment: "bearish", magnitude: 4,
    tradingBlocs: [
      { name: "Arab League", role: "driver", description: "Arab League diplomatic posturing shapes regional trade normalization and energy deal timelines." },
      { name: "GCC", role: "affected", description: "Gulf Cooperation Council energy exports face transit risk through contested maritime routes." },
      { name: "OPEC+", role: "driver", description: "Conflict escalation triggers emergency OPEC+ meetings on production adjustments." },
    ],
    ftas: [
      { name: "Abraham Accords Trade Framework", status: "at risk", description: "Israel-Gulf normalization trade provisions jeopardized by ongoing regional conflict." },
      { name: "US-Israel FTA", status: "relevant", description: "Long-standing US-Israel FTA underpins defense co-production and technology transfer arrangements." },
    ],
  },
  {
    keywords: ["supply chain", "shipping", "port", "freight", "logistics", "container", "suez", "panama canal"],
    sectors: ["Industrials", "Consumer Staples", "Retail"],
    supplyChains: ["Global Shipping", "Last-Mile Delivery", "Warehousing"],
    markets: ["NYSE", "S&P 500"],
    sentiment: "bearish", magnitude: 3,
    tradingBlocs: [
      { name: "ASEAN", role: "affected", description: "ASEAN hub-port economies (Singapore, Malaysia) directly impacted by regional shipping disruptions." },
      { name: "WTO", role: "affected", description: "Trade facilitation agreement commitments challenged when port bottlenecks disrupt goods flow." },
    ],
    ftas: [
      { name: "CPTPP", status: "relevant", description: "CPTPP customs facilitation and origin rules affect rerouting options during supply disruptions." },
      { name: "USMCA Rules of Origin", status: "relevant", description: "Logistics disruptions complicate compliance with USMCA regional value content requirements." },
    ],
  },
  {
    keywords: ["jobs report", "employment", "payroll", "labor market", "wage growth", "nonfarm"],
    sectors: ["Consumer Discretionary", "Financials", "Retail"],
    supplyChains: ["Labor Markets", "Consumer Spending"],
    markets: ["S&P 500", "NYSE", "NASDAQ"],
    sentiment: "bullish", magnitude: 3,
    tradingBlocs: [
      { name: "ILO (International Labour Organization)", role: "affected", description: "US labor market trends influence ILO policy discussions on global wage standards and worker mobility." },
    ],
    ftas: [
      { name: "USMCA Labor Chapter", status: "relevant", description: "USMCA labor provisions mandate minimum wage floors for automotive workers, affecting US-Mexico wage dynamics." },
    ],
  },
  {
    keywords: ["climate", "green energy", "solar", "wind", "carbon", "emission", "renewable", "paris agreement", "cop"],
    sectors: ["Utilities", "Energy", "Industrials", "Materials"],
    supplyChains: ["Rare Earth Metals", "Battery Supply", "Solar Panel Manufacturing"],
    markets: ["NYSE", "Clean Energy ETF", "S&P 500"],
    sentiment: "bullish", magnitude: 2,
    tradingBlocs: [
      { name: "EU Green Deal Bloc", role: "driver", description: "EU Carbon Border Adjustment Mechanism (CBAM) reshapes trade economics for carbon-intensive US exporters." },
      { name: "G20", role: "driver", description: "G20 climate finance commitments direct capital flows toward clean energy transition sectors." },
    ],
    ftas: [
      { name: "IPEF Clean Economy Pillar", status: "strengthened", description: "IPEF clean economy agreements facilitate green technology trade and investment across Indo-Pacific." },
      { name: "US-EU Critical Minerals Agreement", status: "relevant", description: "IRA-linked critical minerals sourcing agreements with EU affect battery supply chain eligibility." },
    ],
  },
  {
    keywords: ["bank", "credit crunch", "financial crisis", "liquidity", "debt ceiling", "bond yield", "yield curve"],
    sectors: ["Financials", "Real Estate", "Technology"],
    supplyChains: ["Credit Markets", "Venture Capital", "Startup Funding"],
    markets: ["NYSE", "S&P 500", "Financial ETF (XLF)"],
    sentiment: "bearish", magnitude: 5,
    tradingBlocs: [
      { name: "BIS (Bank for International Settlements)", role: "affected", description: "BIS coordinates central bank swap lines and macro-prudential responses to systemic financial stress." },
      { name: "G7 Finance Ministers", role: "driver", description: "G7 coordinated liquidity support mechanisms activated during financial crises." },
    ],
    ftas: [
      { name: "Bilateral Investment Treaties (BITs)", status: "relevant", description: "Financial stress may trigger investor-state dispute provisions under BITs if capital controls are imposed." },
    ],
  },
  // ─── New: direct FTA / trading bloc events ───
  {
    keywords: ["usmca", "nafta", "trade deal", "free trade agreement", "fta", "trade pact"],
    sectors: ["Industrials", "Automotive", "Agriculture", "Consumer Discretionary"],
    supplyChains: ["Automotive Parts", "Agricultural Exports", "Cross-Border Manufacturing"],
    markets: ["NYSE", "S&P 500", "Emerging Markets"],
    sentiment: "bullish", magnitude: 3,
    tradingBlocs: [
      { name: "USMCA Bloc (US-Mexico-Canada)", role: "driver", description: "USMCA governs $1.3T+ in annual trilateral trade — FTA developments directly reprice supply chain efficiency." },
      { name: "WTO", role: "affected", description: "Regional FTA terms must remain WTO-compatible under GATT Article XXIV." },
    ],
    ftas: [
      { name: "USMCA", status: "relevant", description: "2026 USMCA joint review process could trigger renegotiation of autos rules of origin and digital trade chapters." },
      { name: "US-Kenya FTA (in progress)", status: "relevant", description: "Stalled US-Kenya FTA negotiations affect sub-Saharan market access for US goods." },
    ],
  },
  {
    keywords: ["brexit", "uk trade", "britain trade", "us-uk deal", "trade reset"],
    sectors: ["Financials", "Pharmaceuticals", "Consumer Staples", "Technology"],
    supplyChains: ["Financial Services", "Pharmaceutical Supply", "Food & Beverage"],
    markets: ["NYSE", "S&P 500", "FTSE"],
    sentiment: "neutral", magnitude: 2,
    tradingBlocs: [
      { name: "EU Single Market", role: "affected", description: "UK's exit from EU single market reshapes transatlantic supply chains that previously used UK as EU gateway." },
      { name: "Commonwealth Trade Network", role: "beneficiary", description: "UK's post-Brexit bilateral push with Commonwealth partners creates alternative trade routes." },
    ],
    ftas: [
      { name: "UK-US FTA (in negotiation)", status: "relevant", description: "Negotiations cover pharmaceuticals, financial services, and digital trade — high stakes for NYSE-listed multinationals." },
      { name: "UK-CPTPP", status: "strengthened", description: "UK's accession to CPTPP creates new market access routes that partially offset EU trade friction." },
    ],
  },
  {
    keywords: ["asean", "rcep", "indo-pacific", "ipef", "quad", "aukus", "asia trade"],
    sectors: ["Technology", "Industrials", "Consumer Discretionary", "Materials"],
    supplyChains: ["Electronics Assembly", "Rare Earth Metals", "Textiles"],
    markets: ["NASDAQ", "S&P 500", "Emerging Markets"],
    sentiment: "bullish", magnitude: 3,
    tradingBlocs: [
      { name: "ASEAN", role: "driver", description: "ASEAN's $3.6T economy increasingly absorbs supply chains diversifying away from China." },
      { name: "RCEP", role: "driver", description: "RCEP creates the world's largest trading bloc — shapes Asia-Pacific goods flow and rules of origin." },
      { name: "Quad", role: "driver", description: "Quad technology supply chain initiatives (semiconductors, clean energy) redirect investment flows across Indo-Pacific." },
    ],
    ftas: [
      { name: "CPTPP", status: "relevant", description: "CPTPP's high-standard IP and labor provisions shape competitive dynamics for US exporters in the Asia-Pacific." },
      { name: "IPEF", status: "strengthened", description: "IPEF supply chain, clean economy, and digital pillars create structured US engagement across 14 Indo-Pacific economies." },
    ],
  },
  {
    keywords: ["wto", "world trade organization", "trade dispute", "trade ruling", "dumping", "countervailing duty"],
    sectors: ["Industrials", "Steel", "Agriculture", "Technology"],
    supplyChains: ["Steel & Aluminum", "Agricultural Commodities", "Electronics"],
    markets: ["NYSE", "S&P 500", "Commodity Futures"],
    sentiment: "neutral", magnitude: 3,
    tradingBlocs: [
      { name: "WTO", role: "driver", description: "WTO dispute settlement rulings create binding obligations that can override domestic trade protection measures." },
      { name: "EU", role: "affected", description: "EU frequently litigates and is litigated against in WTO panels on steel, agricultural subsidies, and digital services." },
    ],
    ftas: [
      { name: "Plurilateral WTO Agreements (JSI)", status: "relevant", description: "Joint Statement Initiatives on e-commerce and investment facilitation operate outside MFN framework." },
    ],
  },
];

function analyzeImpact(title: string, summary: string): Impact {
  const text = `${title} ${summary}`.toLowerCase();
  const matched = KEYWORD_MAP.filter(rule =>
    rule.keywords.some(kw => text.includes(kw))
  );

  if (matched.length === 0) {
    return {
      sectors: ["General Markets"],
      supplyChains: ["Broad Economy"],
      markets: ["S&P 500", "NASDAQ", "NYSE"],
      sentiment: "neutral",
      magnitude: 1,
      tradingBlocs: [],
      ftas: [],
    };
  }

  // Merge and deduplicate
  const sectors = [...new Set(matched.flatMap(m => m.sectors))].slice(0, 5);
  const supplyChains = [...new Set(matched.flatMap(m => m.supplyChains))].slice(0, 4);
  const markets = [...new Set(matched.flatMap(m => m.markets))].slice(0, 4);
  const magnitude = Math.min(5, Math.round(matched.reduce((s, m) => s + m.magnitude, 0) / matched.length));

  // Deduplicate trading blocs by name (keep first occurrence)
  const blocsSeen = new Set<string>();
  const tradingBlocs: TradingBlocImpact[] = matched
    .flatMap(m => m.tradingBlocs || [])
    .filter(b => { if (blocsSeen.has(b.name)) return false; blocsSeen.add(b.name); return true; })
    .slice(0, 5);

  // Deduplicate FTAs by name
  const ftaSeen = new Set<string>();
  const ftas: FTAImpact[] = matched
    .flatMap(m => m.ftas || [])
    .filter(f => { if (ftaSeen.has(f.name)) return false; ftaSeen.add(f.name); return true; })
    .slice(0, 5);

  // Determine sentiment: bearish wins ties
  const bearish = matched.filter(m => m.sentiment === "bearish").length;
  const bullish = matched.filter(m => m.sentiment === "bullish").length;
  const sentiment = bearish > bullish ? "bearish" : bullish > bearish ? "bullish" : "neutral";

  return { sectors, supplyChains, markets, sentiment, magnitude, tradingBlocs, ftas };
}

// ─── RSS Fetcher ───────────────────────────────────────────────────────────
export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  category: "Geopolitical" | "Economic" | "Supply Chain";
  publishedAt: string;
  impact: Impact;
}

let newsCache: { items: NewsItem[]; fetchedAt: number } | null = null;
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

async function fetchFeed(feed: typeof RSS_FEEDS[0]): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const parsed = parser.parse(xml);

    const channel = parsed?.rss?.channel || parsed?.feed;
    if (!channel) return [];

    const rawItems = channel.item || channel.entry || [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    return items.slice(0, 5).map((item: any) => {
      const title = item.title?.["#text"] || item.title || "";
      const summary = item.description?.["#text"] || item.description || item.summary?.["#text"] || item.summary || "";
      const url = item.link?.["#text"] || item.link || item.id || "";
      const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();

      const clean = (s: string) => String(s || "").replace(/<[^>]*>/g, "").trim().slice(0, 300);

      return {
        id: `${feed.source}-${Buffer.from(title).toString("base64").slice(0, 12)}`,
        title: clean(title),
        summary: clean(summary),
        url: typeof url === "string" ? url : "",
        source: feed.source,
        category: feed.category as NewsItem["category"],
        publishedAt: pubDate,
        impact: analyzeImpact(title, summary),
      };
    }).filter((i: NewsItem) => i.title.length > 5);
  } catch {
    return [];
  }
}

export async function getNews(force = false): Promise<{ items: NewsItem[]; fetchedAt: number }> {
  const now = Date.now();
  if (!force && newsCache && now - newsCache.fetchedAt < CACHE_TTL) {
    return newsCache;
  }

  const allResults = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));
  const allItems: NewsItem[] = allResults
    .filter(r => r.status === "fulfilled")
    .flatMap((r: any) => r.value);

  // Deduplicate by title similarity, sort by date
  const seen = new Set<string>();
  const deduped = allItems.filter(item => {
    const key = item.title.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  newsCache = { items: deduped.slice(0, 30), fetchedAt: now };
  return newsCache;
}
