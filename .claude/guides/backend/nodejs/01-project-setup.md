# Skill 01: Project Setup

> Set up a Node.js monorepo with Express + TypeScript server, shared root scripts, and validated environment configuration.

## Monorepo Structure

```
project-root/
  package.json          # Workspace scripts (install, dev, build, test, db)
  .env                  # Environment variables (git-ignored)
  .gitignore
  client/               # Frontend app (e.g., React, Vue, Angular)
    package.json
    src/
  server/               # Express + TypeScript API
    package.json
    tsconfig.json
    src/
      server.ts         # Entry point; starts HTTP server
      app.ts            # Express app configuration
      config/
        environment.ts  # Zod-validated env config
        database.ts     # PostgreSQL pool
        auth.ts         # Passport strategies
      controllers/
      middleware/
      models/
      routes/
      services/
      utils/
    migrations/         # Sequential SQL migration files
    scripts/
      migrate.ts        # Migration runner
      seed.ts           # Seed data for development
```

## Root package.json

```json
{
  "name": "my-app",
  "private": true,
  "scripts": {
    "install:all": "npm install && cd server && npm install && cd ../client && npm install",
    "dev:all": "concurrently -n server,client -c blue,green \"cd server && npm run dev\" \"cd client && npm run dev\"",
    "build": "cd client && npm run build && cd ../server && npm run build",
    "start": "cd server && npm run start",
    "test": "cd server && npm test && cd ../client && npm test",
    "db:migrate": "cd server && npm run db:migrate",
    "db:seed": "cd server && npm run db:seed"
  },
  "devDependencies": {
    "concurrently": "^9.1.0"
  }
}
```

## Server Setup

### Install Dependencies

```bash
mkdir server && cd server
npm init -y

# Runtime dependencies
npm install express cors helmet compression cookie-parser \
  passport passport-google-oauth20 openid-client \
  jsonwebtoken pg socket.io winston zod multer dotenv uuid cross-env

# Dev dependencies
npm install -D typescript tsx vitest supertest \
  @types/express @types/cors @types/cookie-parser @types/jsonwebtoken \
  @types/passport @types/passport-google-oauth20 @types/pg \
  @types/multer @types/compression @types/node @types/supertest @types/uuid
```

### Server package.json Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "cross-env NODE_ENV=production node dist/server.js",
    "test": "vitest run",
    "db:migrate": "tsx scripts/migrate.ts",
    "db:seed": "tsx scripts/seed.ts"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

## Environment Configuration

Create `server/src/config/environment.ts` using Zod to validate all environment variables at startup. This prevents the application from running with missing or invalid configuration.

```typescript
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

// Load .env: try the server directory first, then the parent (app root).
// Works whether started via "cd server && npm run dev" or "cd app && npm run start".
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DB_POOL_MAX: z.coerce.number().default(20),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().default(30000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().default(5000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().default(30000),

  // Authentication (RS256 asymmetric keys)
  // Dev: optional; generate PEM files with npm run generate-keys
  // Prod: required; provide via env vars from Key Vault / secrets manager
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_REFRESH_PRIVATE_KEY: z.string().optional(),
  JWT_REFRESH_PUBLIC_KEY: z.string().optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // CSRF: minimum 32 characters, used for HMAC token signing
  CSRF_SECRET: z.string().min(32).default('dev-csrf-secret-change-in-production-00'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Microsoft OAuth
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),

  // CORS: allowed origins (comma-separated for multiple)
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // API_BASE_URL: public-facing server URL, used for OAuth callback URLs
  API_BASE_URL: z.string().optional(),

  // AI / LLM: optional, only needed if using AI features (Skill 06)
  OPENAI_API_KEY: z.string().optional(),
  AI_PROVIDER: z.string().default('openai'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  AI_MAX_TOKENS: z.coerce.number().default(1024),

  // Static file serving: set to "true" or set NODE_ENV=production
  SERVE_CLIENT: z.string().default('false'),

  // Rate limiting: all configurable via .env
  RATE_LIMIT_API_MAX: z.coerce.number().default(200),
  RATE_LIMIT_API_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_AUTH_MAX: z.coerce.number().default(30),
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_AI_MAX: z.coerce.number().default(60),
  RATE_LIMIT_AI_WINDOW_MS: z.coerce.number().default(60 * 60 * 1000), // 1 hour

  // Request body size limits
  BODY_LIMIT_JSON: z.string().default('1mb'),
  BODY_LIMIT_URLENCODED: z.string().default('1mb'),

  // Graceful shutdown timeout (ms)
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(30000),
}).refine((data) => {
  if (data.NODE_ENV === 'production') {
    // Accept PEM keys via env vars (production deployment with Key Vault / secrets manager)
    const envKeys = [data.JWT_PRIVATE_KEY, data.JWT_PUBLIC_KEY, data.JWT_REFRESH_PRIVATE_KEY, data.JWT_REFRESH_PUBLIC_KEY];
    if (envKeys.every((k) => k && k.startsWith('-----BEGIN'))) return true;

    // Also accept PEM files in server/keys/ (local production testing after npm run generate-keys)
    const keysDir = path.resolve(__dirname, '..', '..', 'keys');
    const keyFiles = ['jwt-private.pem', 'jwt-public.pem', 'jwt-refresh-private.pem', 'jwt-refresh-public.pem'];
    return keyFiles.every((f) => fs.existsSync(path.join(keysDir, f)));
  }
  return true;
}, {
  message: 'JWT PEM keys are required in production. Provide them as env vars (JWT_PRIVATE_KEY, etc.) or generate key files: npm run generate-keys',
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten();
    const fieldMessages = Object.entries(errors.fieldErrors)
      .map(([field, msgs]) => `  ${field}: ${(msgs || []).join(', ')}`)
      .join('\n');
    const formMessages = errors.formErrors.length > 0
      ? '\n  ' + errors.formErrors.join('\n  ')
      : '';
    throw new Error(`Environment validation failed:\n${fieldMessages}${formMessages}`);
  }

  const env = result.data;

  // Reject placeholder values in production
  if (env.NODE_ENV === 'production') {
    const placeholders = ['CHANGE_ME', 'your-secret-here', 'replace-this'];
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && placeholders.some(p => value.includes(p))) {
        throw new Error(`Placeholder value detected for ${key} in production`);
      }
    }
  }

  return env;
}

export const env = validateEnv();
export type Env = z.infer<typeof envSchema>;
```

**Key design decisions:**

- **RS256 asymmetric JWT signing** is the default. The template ships with a `generate-keys` script that creates RSA-2048 PEM files in `server/keys/` (gitignored). In production, inject PEM keys as env vars from a secrets manager. See Skill 03 for the full token implementation.
- **`API_BASE_URL`** is used by `auth.ts` to build OAuth callback URLs. The auth module imports and uses the validated `env` object; never raw `process.env`.
- **`CORS_ORIGIN`** is also used to derive the frontend redirect URL for OAuth callbacks (first origin in the comma-separated list). There is no separate `FRONTEND_URL` env var; it would duplicate `CORS_ORIGIN`.
- **Production JWT validation** accepts either PEM env vars *or* PEM files on disk, so `npm run generate-keys && npm run start` works for local production testing without setting env vars.

## .env Template

Place this in the `server/` directory as `server/.env`:

```bash
# --- Core ---
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/myapp_dev

# --- Client serving ---
# When true (or NODE_ENV=production), Express serves client/dist/ as static files.
# In dev, leave false and run the Vite dev server separately (npm run dev:all).
SERVE_CLIENT=false

# --- URLs ---
# CORS_ORIGIN: allowed origins for CORS and OAuth redirects.
#   Dev:  http://localhost:5173 (Vite dev server)
#   Prod: https://your-app.example.com (same URL the app is served from)
CORS_ORIGIN=http://localhost:5173

# API_BASE_URL: public-facing URL of this server, used to build OAuth callback URLs.
#   Dev:  http://localhost:3000
#   Prod: https://your-app.example.com
API_BASE_URL=http://localhost:3000

# --- JWT (RS256 asymmetric keys) ---
# Dev: generate PEM files with: npm run generate-keys (stored in server/keys/)
# Prod: provide PEM keys via env vars from Key Vault / secrets manager.
JWT_PRIVATE_KEY=
JWT_PUBLIC_KEY=
JWT_REFRESH_PRIVATE_KEY=
JWT_REFRESH_PUBLIC_KEY=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# --- CSRF ---
CSRF_SECRET=  # set to a 32+ char random string

# --- OAuth SSO ---
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=

# --- AI / LLM (optional: only needed for Skill 06 features) ---
AI_PROVIDER=openai
AI_API_KEY=
AI_MODEL=gpt-4o-mini
AI_MAX_TOKENS=1024

# --- Database pool ---
DB_POOL_MAX=20
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=5000
DB_STATEMENT_TIMEOUT_MS=30000

# --- Rate limiting ---
RATE_LIMIT_API_MAX=200
RATE_LIMIT_API_WINDOW_MS=900000
RATE_LIMIT_AUTH_MAX=30
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_AI_MAX=60
RATE_LIMIT_AI_WINDOW_MS=3600000

# --- Request body size limits ---
BODY_LIMIT_JSON=1mb
BODY_LIMIT_URLENCODED=1mb

# --- Graceful shutdown ---
SHUTDOWN_TIMEOUT_MS=30000
```

## Entry Point: server.ts

```typescript
import { env } from './config/environment';
import { createApp } from './app';
import { testConnection } from './config/database';
import { logger } from './utils/logger';
import http from 'http';

async function start(): Promise<void> {
  // Verify database connectivity before accepting requests
  const dbConnected = await testConnection();
  if (!dbConnected) {
    logger.error('Failed to connect to database');
    process.exit(1);
  }
  logger.info('Database connected');

  const app = createApp();
  const server = http.createServer(app);

  // Optional: attach Socket.IO here
  // const io = new Server(server, { cors: { origin: env.CORS_ORIGIN } });

  server.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      const { closePool } = await import('./config/database');
      await closePool();
      logger.info('Server shut down');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

## App Setup: app.ts

```typescript
import express from 'express';
import { env } from './config/environment';

export function createApp(): express.Application {
  const app = express();

  // Middleware chain is configured here in strict order.
  // See Skill 02 (Security Middleware) for the full 14-step sequence.

  // Health check (before auth middleware)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount API routes
  // app.use('/api', routes);

  return app;
}
```

## .gitignore

```
node_modules/
dist/
build/
coverage/
.env
.env.local
.env.*.local
.vscode/
.idea/
*.log
*.tsbuildinfo
```
