# Veridian — Investor Intelligence Platform

A full-stack stock analysis platform for building and pitching investment theses.
NYSE & NASDAQ equities · $1B+ market cap · Live data via Yahoo Finance.

---

## Features

| Tab | Description |
|---|---|
| **Dashboard** | Live price, AI price forecast, investment simulator, market overview |
| **Fair Value** | 5-model valuation (DCF, P/E, EV/EBITDA, P/S, Analyst consensus) |
| **Stocks** | Browse & sort all NYSE/NASDAQ equities by market cap, volatility, volume |
| **News & Events** | Geopolitical & economic feed with trading bloc / FTA impact analysis |
| **My Portfolio** | Track positions, live P&L, allocation chart, Excel export |

---

## Deploy in 3 minutes

### Option 1 — Render (recommended, free tier)

1. Fork or push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo → Select **Docker** runtime
4. Set environment variable: `PORT=5000`
5. Click **Deploy**

Render auto-detects `render.yaml`. Your app will be live at `https://your-app.onrender.com`.

### Option 2 — Railway

1. Push repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Railway reads `railway.toml` automatically
4. Click **Deploy** — done

### Option 3 — Docker (self-hosted / VPS)

```bash
# Clone the repo
git clone https://github.com/your-username/pitchstock.git
cd pitchstock

# Build the image
docker build -t pitchstock .

# Run it
docker run -p 5000:5000 pitchstock
```

Open `http://localhost:5000` in your browser.

### Option 4 — Run locally (development)

**Requirements:** Node.js 20+, Python 3.9+

```bash
# 1. Install Node dependencies
npm install

# 2. Install Python dependency (for fair value fundamentals)
pip install yfinance

# 3. Start the Python microservice (in a separate terminal)
python3 server/fundamentals_service.py 5001

# 4. Start the dev server
npm run dev
```

Open `http://localhost:5000`.

---

## Architecture

```
Browser
  └── React (Vite) frontend
        └── Express backend (Node.js, port 5000)
              ├── Yahoo Finance v8 API  ← quotes, history, screener
              ├── Yahoo Finance RSS     ← news feeds
              └── Python microservice (port 5001)
                    └── yfinance        ← fundamentals for Fair Value
```

The Express server serves both the API (`/api/*`) and the static frontend from a single port — no CORS configuration needed.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Port the server listens on |
| `NODE_ENV` | `development` | Set to `production` for optimized serving |

---

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, shadcn/ui, Recharts, TanStack Query
- **Backend:** Express.js (Node.js), better-sqlite3 / Drizzle ORM
- **Data:** Yahoo Finance (public API), yfinance (Python)
- **Charts:** Recharts (AreaChart, BarChart, RadarChart, PieChart)
- **Export:** SheetJS (xlsx)

---

## Data Sources

All market data is fetched from Yahoo Finance's public APIs. This app is for **informational and educational purposes only** — not financial advice.
