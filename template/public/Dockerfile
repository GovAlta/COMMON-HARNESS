# Multi-stage Dockerfile for the application template
# Stage 1: Install dependencies and build
# Stage 2: Production runtime (minimal image)
#
# Base-image pinning policy: the FROM lines pin a specific Node + Alpine minor
# version below to limit supply-chain drift between rebuilds. For full
# reproducibility, harden further by pinning to an image digest:
#
#   docker pull node:20.18-alpine3.20
#   docker inspect --format='{{index .RepoDigests 0}}' node:20.18-alpine3.20
#   # then replace the tag with node:20.18-alpine3.20@sha256:<digest>
#
# Recommended automation: Renovate / Dependabot bumps the digest weekly so
# CVEs in the base image surface as PRs rather than silent drift.

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20.18-alpine3.20 AS builder

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy server package files
COPY server/package.json server/package-lock.json ./server/

# Copy client package files
COPY client/package.json client/package-lock.json ./client/

# Install all dependencies
RUN npm run install:all

# Copy source code (server/keys/ and any .env are excluded via .dockerignore).
COPY server/ ./server/
COPY client/ ./client/

# Defensive guard — fail the build if dev JWT keys somehow leaked past
# .dockerignore. Production keys come from a secrets manager / Key Vault
# (see ADR-003); server/keys/*.pem must never be baked into the image.
# Closes blueteam finding CC-003 (T-006 dev-keys-in-image).
RUN test ! -f /app/server/keys/jwt-private.pem \
  || (echo 'FAIL: dev JWT keys leaked into image — check .dockerignore' && exit 1)

# Build client (vue-tsc + vite) and server (tsc)
RUN npm run build

# ── Stage 2: Production Runtime ─────────────────────────────
FROM node:20.18-alpine3.20 AS runtime

WORKDIR /app

# Install production dependencies only
COPY package.json ./
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Non-root user for security
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
USER appuser

# Health check — uses the actual route exposed by routes/health.routes.ts.
# The path is /health/live (not /health/liveness — the latter was a docs/code
# drift that returned 404 and broke container orchestration).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

EXPOSE 3000

ENV NODE_ENV=production
ENV SERVE_CLIENT=true

CMD ["node", "server/dist/server.js"]
