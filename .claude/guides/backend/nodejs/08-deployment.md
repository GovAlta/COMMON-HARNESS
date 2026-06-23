# Skill 08: Deployment and Production Operations

> Build/deploy/operate a Node.js application with health probes, structured logging, graceful shutdown, and security hardening.

## Build Pipeline

```bash
# Install all dependencies (root, server, client workspaces)
npm run install:all

# Build client and server
npm run build
# 1. Client: vue-tsc + Vite build -> client/dist/
# 2. Server: tsc -> server/dist/

# Start in production mode
npm run start
# Equivalent to: cross-env NODE_ENV=production node dist/server.js
```

## Production Integration: Frontend + Backend

In production, the Express server serves both the API and the Vue client from a single process on a single port. This is the default architecture; no separate web server or reverse proxy is needed for the frontend.

### How it works

1. **Client builds to `client/dist/`**: `npm run build` runs `vue-tsc && vite build`, producing static HTML/JS/CSS with content-hashed filenames.
2. **Server serves `client/dist/` as static files**: when `NODE_ENV=production` (or `SERVE_CLIENT=true`), Express mounts `client/dist/` and serves it with immutable cache headers.
3. **API routes take priority**: Express handles `/api/*`, `/health`, and `/socket.io/*` before the SPA fallback.
4. **SPA fallback**: all other GET requests serve `index.html`, letting Vue Router handle client-side routing.
5. **Same origin**: since client and server are on the same domain and port, CORS is not needed for the client. `CORS_ORIGIN` is only relevant for external consumers or the Vite dev server.

### Frontend API configuration

The Vue client's Axios instance uses a **relative base URL** (`/api`), which works in both dev and production:

- **Dev:** Vite proxies `/api/*` requests to `http://localhost:3000` (the Express dev server). See `vite.config.ts` proxy configuration.
- **Production:** `/api` resolves to the same origin; no proxy, no CORS, no configuration change needed.

The client `.env.example` sets `VITE_API_BASE_URL=/api`. This is the correct default and should not be changed to an absolute URL (e.g., `http://localhost:3000`); absolute URLs break production.

### Environment variables for production

| Variable | Dev value | Production value |
|----------|-----------|-----------------|
| `NODE_ENV` | `development` | `production` |
| `SERVE_CLIENT` | `false` (Vite serves) | `true` (or omit; `NODE_ENV=production` enables it) |
| `CORS_ORIGIN` | `http://localhost:5173` | `https://your-app.example.com` |
| `API_BASE_URL` | `http://localhost:3000` | `https://your-app.example.com` |
| `VITE_API_BASE_URL` | `/api` (default) | `/api` (no change needed) |

## Production Server Behavior

When `NODE_ENV=production` (or `SERVE_CLIENT=true`), the server enables production-specific behavior:

```typescript
import express from 'express';
import compression from 'compression';
import path from 'path';

const app = express();

if (env.NODE_ENV === 'production' || env.SERVE_CLIENT === 'true') {
  // 1. gzip compression on all responses
  app.use(compression());

  // 2. Static assets with long cache (Vite content-hashes filenames)
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(
    '/assets',
    express.static(path.join(clientDist, 'assets'), {
      maxAge: '1y',
      immutable: true,
    })
  );
  app.use(express.static(clientDist));

  // 3. SPA fallback: non-API GET requests serve index.html
  app.get(/^(?!\/api|\/health).*$/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// 4. Secure cookies in production
// sameSite must be 'lax' (not 'strict') to allow OAuth redirect callbacks to carry cookies
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

// 5. Generic error messages (no stack traces leaked)
app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message = env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: { code: err.code || 'INTERNAL_ERROR', message },
  });
});
```

#### SPA Fallback Route

The SPA fallback must exclude **all** server-handled paths:

```typescript
// Express 4 compatible, Express 5 forward-compatible
const spaFallback = (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
};

// Exclude API/health/Socket.io paths
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/socket.io')) {
    return next();
  }
  spaFallback(req, res);
});
```

Failing to exclude `/socket.io` causes WebSocket upgrade requests to return the SPA HTML instead of upgrading the connection.

## Graceful Shutdown

Handle process signals to close connections in the correct order:

```typescript
import { createServer } from 'http';
import { createSocketServer, closeSocketServer } from './websocket';
import { testConnection, closePool } from './config/database';
import { logger } from './utils/logger';

const httpServer = createServer(app);
const io = createSocketServer(httpServer);

await testConnection(); // Verify database connectivity at startup
httpServer.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
});

// Graceful shutdown sequence
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  // 1. Disconnect WebSocket clients
  await closeSocketServer();

  // 2. Stop accepting new HTTP connections
  httpServer.close(async () => {
    // 3. Close database connection pool
    await closePool();
    logger.info('Shutdown complete');
    process.exit(0);
  });

  // 4. Force exit after timeout if graceful shutdown stalls
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch unhandled errors
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { error: reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});
```

## Health Probes

Two endpoints for container orchestrators and load balancers:

```typescript
import { Router, Request, Response } from 'express';
import pool from '../config/database';

const router = Router();

// Liveness: is the process running?
router.get('/live', (_req: Request, res: Response) => {
  res.json({ status: 'alive' });
});

// Readiness: can the process serve traffic?
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'not ready', database: 'disconnected' });
  }
});

export default router;
```

Register before any auth middleware:

```typescript
import healthRoutes from './routes/health.routes';
app.use('/health', healthRoutes);
```

Configure in your orchestrator:
- **Liveness probe**: `GET /health/live`, interval 30s, failure threshold 3
- **Readiness probe**: `GET /health/ready`, interval 10s, failure threshold 3

## Winston Structured JSON Logging

Log structured JSON to stdout for collection by your log aggregation platform:

```typescript
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'app-server',
  },
  transports: [new winston.transports.Console()],
});
```

### Request Logging Middleware

```typescript
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const correlationId = req.headers['x-correlation-id'] as string || uuidv4();

  res.setHeader('x-correlation-id', correlationId);

  res.on('finish', () => {
    logger.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`, {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
      ip: req.ip,
      correlationId,
    });
  });

  next();
}
```

Sample JSON log output:

```json
{
  "level": "info",
  "message": "GET /api/items 200 45ms",
  "service": "app-server",
  "timestamp": "2026-03-22T12:00:00.000Z",
  "method": "GET",
  "path": "/api/items",
  "status": 200,
  "duration": 45,
  "ip": "10.0.0.1",
  "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

## GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm run install:all

      - name: Build
        run: npm run build

      - name: Run tests
        run: npm test

      - name: Deploy
        # Replace with your deployment target (e.g., cloud provider action, SSH, Docker push)
        run: echo "Deploy to your hosting platform here"
        # Examples:
        # - Azure: azure/webapps-deploy@v3
        # - AWS: aws-actions/amazon-ecs-deploy-task-definition@v1
        # - GCP: google-github-actions/deploy-appengine@v2
        # - Self-hosted: rsync, Docker push, etc.
```

## Docker Multi-Stage Build (Optional)

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm run install:all

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Copy only production dependencies and built artifacts
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

RUN cd server && npm ci --omit=dev

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health/live || exit 1

CMD ["node", "server/dist/server.js"]
```

Build and run:

```bash
docker build -t myapp .
docker run -p 3000:3000 --env-file .env.production myapp
```

## Security Deployment Checklist

### Secrets Management
- [ ] RSA-2048 PEM key pairs generated (`npm run generate-keys`) and stored in a secrets manager (Key Vault)
- [ ] All four JWT PEM keys injected as env vars: `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_REFRESH_PRIVATE_KEY`, `JWT_REFRESH_PUBLIC_KEY`
- [ ] `CSRF_SECRET` generated with at least 32 random characters and stored in a secrets manager
- [ ] All secrets injected via secrets manager references, not hardcoded or stored in plain text
- [ ] Placeholder values rejected at startup (fail fast in production)

### Application Configuration
- [ ] `NODE_ENV=production` set in the runtime environment
- [ ] `CORS_ORIGIN` set to the production domain(s) only
- [ ] `API_BASE_URL` set to the production URL (for OAuth callback URLs)
- [ ] OAuth redirect URIs registered with identity providers for the production domain

### Infrastructure
- [ ] Health probes configured in the orchestrator/load balancer
- [ ] Web Application Firewall (WAF) enabled
- [ ] DDoS protection enabled
- [ ] SSL/TLS termination configured (either at the load balancer or in the application)

### Database
- [ ] Database connection uses SSL (`sslmode=verify-full` or equivalent)
- [ ] Database credentials stored in secrets manager
- [ ] Connection pooling configured with appropriate limits

### Monitoring and Logging
- [ ] Structured JSON logging to stdout configured
- [ ] Log aggregation platform configured to collect stdout
- [ ] Error alerting set up for 5xx responses and uncaught exceptions
- [ ] Request duration monitoring for performance regression detection

### Dependency Security
- [ ] `npm audit` runs in the CI pipeline with zero critical/high vulnerabilities
- [ ] Dependabot or similar automated dependency updates enabled
- [ ] Lock file (`package-lock.json`) committed and used for deterministic installs (`npm ci`)
