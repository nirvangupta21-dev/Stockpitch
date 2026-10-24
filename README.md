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

**Requirements:** Node.js 20+

```bash
# 1. Install Node dependencies
npm install

# 2. Start the dev server
npm run dev
```

Open `http://localhost:5000`.

---

## Architecture

```
Browser
  └── React (Vite) frontend
        └── Express backend (Node.js, port 5000)
              ├── SQLite (better-sqlite3 / Drizzle) ← users, sessions, portfolio, watchlist
              ├── Yahoo Finance v8 API  ← quotes, history, screener
              └── Yahoo Finance RSS     ← news feeds
```

The Express server serves both the API (`/api/*`) and the static frontend from a single port — no CORS configuration needed.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Port the server listens on |
| `NODE_ENV` | `development` | Set to `production` for optimized serving |
| `SESSION_SECRET` | random per-boot (prod) | Secret for signing session cookies. **Set this in your host's dashboard** so logins survive restarts. |
| `AUTH_RATE_LIMIT` | `10` | Signup/login attempts per 15 minutes per IP |
| `LOG_API_BODIES` | `0` | Set to `1` to include API response bodies in logs (debugging only — may contain user data) |

---

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, shadcn/ui, Recharts, TanStack Query
- **Backend:** Express.js (Node.js), better-sqlite3 / Drizzle ORM, express-session
- **Data:** Yahoo Finance (public API)
- **Charts:** Recharts (AreaChart, BarChart, RadarChart, PieChart)
- **Export:** SheetJS (xlsx)

---

## Data Sources

All market data is fetched from Yahoo Finance's public APIs. This app is for **informational and educational purposes only** — not financial advice.
