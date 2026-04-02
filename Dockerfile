# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# Install build tools needed for native modules like better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Node deps (compiles native modules for linux/amd64)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app

# Install Python + build tools + curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Create venv and install yfinance
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
RUN pip install --no-cache-dir yfinance

# Copy built artifacts, node_modules (with compiled natives), and server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server/fundamentals_service.py ./server/fundamentals_service.py

# Startup script — launches Python microservice then Node
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

EXPOSE 5000
ENV NODE_ENV=production
ENV PORT=5000

CMD ["./start.sh"]
