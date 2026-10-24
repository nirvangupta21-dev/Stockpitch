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

# Built artifacts + compiled native modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 5000
ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "dist/index.cjs"]
