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
    def log_message(self, *args): pass  # suppress logs

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        ticker = params.get("ticker", [None])[0]
        if not ticker:
            self._respond(400, {"error": "ticker param required"})
            return
        try:
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

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"Fundamentals service running on port {port}", flush=True)
    server.serve_forever()
