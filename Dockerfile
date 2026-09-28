# ── Dockerfile for Trading MiniApp & Internal Backend ──
FROM node:22-bookworm-slim AS base

# Install curl for healthcheck & build tools for native bindings
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build frontend production bundle (into dist/)
RUN npm run build

# Expose backend & frontend unified port
EXPOSE 3001

# Define volume for persistent SQLite database
VOLUME ["/app/data"]

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Start unified server
CMD ["npm", "start"]
