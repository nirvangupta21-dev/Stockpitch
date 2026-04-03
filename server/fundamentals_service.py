#!/usr/bin/env python3
"""Lightweight fundamentals microservice using yfinance."""
import json
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import yfinance as yf

KEYS = [
    "trailingPE", "forwardPE", "priceToBook", "bookValue",
    "profitMargins", "grossMargins", "operatingMargins",
    "returnOnEquity", "returnOnAssets",
    "freeCashflow", "operatingCashflow",
    "totalRevenue", "ebitda", "netIncomeToCommon",
    "revenueGrowth", "earningsGrowth",
    "enterpriseValue", "enterpriseToEbitda", "enterpriseToRevenue",
    "beta", "sharesOutstanding", "floatShares",
    "dividendYield", "trailingAnnualDividendYield",
    "targetMeanPrice", "targetMedianPrice", "targetHighPrice", "targetLowPrice",
    "recommendationMean",
    "revenuePerShare", "forwardEps", "trailingEps",
    "pegRatio", "priceToSalesTrailing12Months",
]

class Handler(BaseHTTPRequestHandler):
    _cache: dict = {}  # class-level cache persists across requests
    _cache_ts: dict = {}
    CACHE_TTL = 4 * 3600  # 4 hours

    def log_message(self, *args): pass  # suppress logs

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        ticker = params.get("ticker", [None])[0]
        if not ticker:
            self._respond(400, {"error": "ticker param required"})
            return
        try:
            import time as _time
            # Serve from cache if fresh
            if ticker in Handler._cache and _time.time() - Handler._cache_ts.get(ticker, 0) < Handler.CACHE_TTL:
                self._respond(200, Handler._cache[ticker])
                return
            info = yf.Ticker(ticker.upper()).info
            result = {k: info.get(k) for k in KEYS}
            # rename to match frontend expectations
            result["netMargin"] = result.pop("profitMargins")
            result["grossMargin"] = result.pop("grossMargins")
            result["operatingMargin"] = result.pop("operatingMargins")
            result["freeCashFlow"] = result.pop("freeCashflow")
            result["operatingCashFlow"] = result.pop("operatingCashflow")
            result["revenue"] = result.pop("totalRevenue")
            result["netIncome"] = result.pop("netIncomeToCommon")
            result["revenueGrowthTTM"] = result.pop("revenueGrowth")
            result["earningsGrowthTTM"] = result.pop("earningsGrowth")
            result["evToEbitda"] = result.pop("enterpriseToEbitda")
            result["evToRevenue"] = result.pop("enterpriseToRevenue")
            result["bookValuePerShare"] = result.pop("bookValue")
            result["revenueGrowthForward"] = None
            result["earningsGrowthForward"] = None
            # Store in cache
            import time as _time
            Handler._cache[ticker] = result
            Handler._cache_ts[ticker] = _time.time()
            self._respond(200, result)
        except Exception as e:
            self._respond(500, {"error": str(e)})

    def _respond(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

# Pre-warm cache with most common tickers on startup
PREWARM_TICKERS = ["AAPL", "NVDA", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "PYPL", "PLTR", "AMD"]

def prewarm():
    import time
    for ticker in PREWARM_TICKERS:
        try:
            info = yf.Ticker(ticker).info
            result = {k: info.get(k) for k in KEYS}
            result["netMargin"] = result.pop("profitMargins")
            result["grossMargin"] = result.pop("grossMargins")
            result["operatingMargin"] = result.pop("operatingMargins")
            result["freeCashFlow"] = result.pop("freeCashflow")
            result["operatingCashFlow"] = result.pop("operatingCashflow")
            result["revenue"] = result.pop("totalRevenue")
            result["netIncome"] = result.pop("netIncomeToCommon")
            result["revenueGrowthTTM"] = result.pop("revenueGrowth")
            result["earningsGrowthTTM"] = result.pop("earningsGrowth")
            result["evToEbitda"] = result.pop("enterpriseToEbitda")
            result["evToRevenue"] = result.pop("enterpriseToRevenue")
            result["bookValuePerShare"] = result.pop("bookValue")
            result["revenueGrowthForward"] = None
            result["earningsGrowthForward"] = None
            Handler._cache[ticker] = result
            print(f"Pre-warmed: {ticker}", flush=True)
        except Exception as e:
            print(f"Pre-warm failed for {ticker}: {e}", flush=True)
        time.sleep(0.5)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    # Pre-warm in background thread
    import threading
    threading.Thread(target=prewarm, daemon=True).start()
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"Fundamentals service running on port {port}", flush=True)
    server.serve_forever()
