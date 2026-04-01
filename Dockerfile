# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install Node deps
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app

# Install Python + pip for yfinance microservice
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Create venv and install yfinance
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
RUN pip install --no-cache-dir yfinance

# Copy built artifacts and server
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
