# Skill 02: Security Middleware

> Configure the Express middleware chain in the correct order with Helmet, CORS, compression, correlation IDs, and a global error handler.

## Middleware Order (Critical)

The order of middleware in `app.ts` is security-critical. Reordering can break functionality or open vulnerabilities.

```
 1. Trust proxy
 2. Helmet (security headers + CSP)
 3. Permissions-Policy (custom header)
 4. Compression (gzip/brotli)
 5. Static file serving (BEFORE CORS)
 6. CORS (multi-origin)
 6a. Content-Type validation (reject unsupported types before body parsing)
 7. Body parsing (JSON + URL-encoded with configurable limits)
 8. Cookie parser
 9. Correlation ID
10. Request logging
11. Passport initialization
12. API routes
13. SPA fallback (serves index.html for client-side routing)
14. Global error handler (MUST be last)
```

## Full Implementation: app.ts

```typescript
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import path from 'path';
import { env } from './config/environment';
import { correlationId } from './middleware/correlation-id';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import { configurePassport } from './config/auth';
import { apiRouter } from './routes';

export function createApp(): express.Application {
  const app = express();

  // ── 1. Trust Proxy ──────────────────────────────────────────────
  // Required behind load balancers / reverse proxies (AWS ALB, Azure App Service, nginx).
  // Makes req.ip and req.protocol reflect the real client.
  app.set('trust proxy', 1);

  // ── 2. Helmet (Security Headers + CSP) ──────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        scriptSrcElem: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,         // 1 year
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  // ── 3. Permissions-Policy ───────────────────────────────────────
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
    );
    next();
  });

  // ── 4. Compression ─────────────────────────────────────────────
  app.use(compression());

  // ── 5. Static File Serving (Before CORS) ────────────────────────
  // MUST come before CORS. <script type="module"> tags send Origin headers
  // even for same-origin requests. If CORS runs first, it rejects static
  // asset requests with "Not allowed by CORS".
  const clientDistPath = path.resolve(__dirname, '..', '..', 'client', 'dist');
  const clientIndexPath = path.join(clientDistPath, 'index.html');
  const shouldServeClient = env.NODE_ENV === 'production' || env.SERVE_CLIENT === 'true';

  if (shouldServeClient) {
    app.use(express.static(clientDistPath, {
      maxAge: env.NODE_ENV === 'production' ? '1y' : '0',
      immutable: env.NODE_ENV === 'production',
      index: false,   // Don't auto-serve index.html; SPA fallback handles it
    }));
  }

  // ── 6a. Content-Type Validation ────────────────────────────────
  // Reject unsupported content types before body parsing
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const ct = req.headers['content-type'] || '';
      const allowed = ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'];
      if (ct && !allowed.some(type => ct.startsWith(type))) {
        return res.status(415).json({
          success: false,
          error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type not supported' },
        });
      }
    }
    next();
  });

  // ── 6b. CORS (Multi-Origin) ─────────────────────────────────────
  const allowedOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, mobile apps)
      if (!origin) { callback(null, true); return; }
      // Allow configured origins
      if (allowedOrigins.includes(origin)) { callback(null, true); return; }
      // In development, allow any localhost port
      if (env.NODE_ENV === 'development' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        callback(null, true); return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Correlation-ID', 'X-Requested-With'],
    exposedHeaders: ['X-Correlation-ID', 'X-CSRF-Token'],
  };
  app.use(cors(corsOptions));

  // ── 7. Body Parsing ────────────────────────────────────────────
  app.use(express.json({ limit: env.BODY_LIMIT_JSON }));
  app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT_URLENCODED }));
  // File uploads are handled separately by multer (not affected by body limits).

  // ── 8. Cookie Parser ───────────────────────────────────────────
  app.use(cookieParser());

  // ── 9. Correlation ID ──────────────────────────────────────────
  app.use(correlationId);

  // ── 10. Request Logging ────────────────────────────────────────
  app.use(requestLogger);

  // ── 11. Passport Initialization ────────────────────────────────
  configurePassport();
  app.use(passport.initialize());

  // ── Health Check (before auth-protected routes) ─────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── 12. API Routes ─────────────────────────────────────────────
  app.use('/api', apiRouter);

  // ── 13. SPA Fallback (After API Routes) ─────────────────────────
  if (shouldServeClient) {
    app.get('*', (req, res, next) => {
      // Don't intercept API, health, or WebSocket paths
      if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(clientIndexPath);
    });
  }

  // ── 14. Global Error Handler (MUST be last) ────────────────────
  app.use(errorHandler);

  return app;
}
```

### Content-Type Validation

Reject unsupported content types before body parsing to prevent content-type confusion attacks:

```typescript
// src/middleware/content-type.ts
app.use((req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const ct = req.headers['content-type'] || '';
    const allowed = ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'];
    if (ct && !allowed.some(type => ct.startsWith(type))) {
      return res.status(415).json({
        success: false,
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type not supported' },
      });
    }
  }
  next();
});
```

Exclude SSE streams (`Accept: text/event-stream`) and WebSocket upgrades from this check.

### Configurable Request Size Limits

Set explicit body size limits via environment variables. Never rely on Express defaults:

```typescript
app.use(express.json({ limit: env.BODY_LIMIT_JSON }));       // Default: '1mb'
app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT_URLENCODED }));
```

Add to the Zod env schema:
```typescript
BODY_LIMIT_JSON: z.string().default('1mb'),
BODY_LIMIT_URLENCODED: z.string().default('1mb'),
```

## Correlation ID Middleware

`server/src/middleware/correlation-id.ts`

Generates a unique ID for every request, propagating any existing ID from upstream services or load balancers.

```typescript
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  req.headers['x-correlation-id'] = id;
  res.setHeader('X-Correlation-ID', id);
  next();
}
```

## Request Logger Middleware

`server/src/middleware/request-logger.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const correlationId = req.headers['x-correlation-id'] as string;

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      correlationId,
      ip: req.ip,
    });
  });

  next();
}
```

## Global Error Handler

`server/src/middleware/error-handler.ts`

The error handler is a 4-parameter Express middleware. It **must** be registered last. It sanitizes errors to prevent leaking stack traces or internal details to clients.

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// ── Application Error Class ──────────────────────────────────────
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message = 'Bad request') { return new AppError(message, 400, 'BAD_REQUEST'); }
  static unauthorized(message = 'Unauthorized') { return new AppError(message, 401, 'UNAUTHORIZED'); }
  static forbidden(message = 'Forbidden') { return new AppError(message, 403, 'FORBIDDEN'); }
  static notFound(message = 'Not found') { return new AppError(message, 404, 'NOT_FOUND'); }
  static conflict(message = 'Conflict') { return new AppError(message, 409, 'CONFLICT'); }
}

// ── PostgreSQL Error Code Mappings ───────────────────────────────
const DB_ERROR_MESSAGES: Record<string, string> = {
  '23505': 'A record with that value already exists',          // unique_violation
  '23503': 'Referenced record does not exist',                 // foreign_key_violation
  '23502': 'A required field is missing',                      // not_null_violation
  '23514': 'Value does not meet validation requirements',      // check_violation
  '22P02': 'Invalid input format',                             // invalid_text_representation
  '22003': 'Numeric value out of range',                       // numeric_value_out_of_range
  '42P01': 'Internal configuration error',                     // undefined_table
  '42703': 'Internal configuration error',                     // undefined_column
  '40P01': 'Please retry your request',                        // deadlock_detected
  '57014': 'Request timed out',                                // query_canceled
};

// ── Error Sanitization ───────────────────────────────────────────
function sanitizeError(err: any): AppError {
  // Known application errors pass through
  if (err instanceof AppError) return err;

  // Map PostgreSQL errors to user-friendly messages
  if (err.code && DB_ERROR_MESSAGES[err.code]) {
    return new AppError(DB_ERROR_MESSAGES[err.code], 422);
  }

  // In development, expose the actual message for debugging
  if (env.NODE_ENV === 'development') {
    return new AppError(err.message || 'Internal server error', 500);
  }

  // In production, never leak internal error details
  return new AppError('An unexpected error occurred', 500);
}

// ── Error Handler Middleware ─────────────────────────────────────
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = req.headers['x-correlation-id'] as string;

  logger.error(err.message || 'Unhandled error', {
    correlationId,
    code: err.code,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: (req as any).user?.id,
    stack: err.stack,
  });

  const safeError = sanitizeError(err);

  res.status(safeError.statusCode).json({
    success: false,
    error: {
      message: safeError.message,
      code: safeError.code,
      correlationId,
    },
  });
}
```

## Winston Logger

`server/src/utils/logger.ts`

```typescript
import winston from 'winston';

import { env } from '../config/environment';

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple()),
  ),
  transports: [new winston.transports.Console()],
});
```

### SSE Stream Exclusion

Compression buffers response chunks, which breaks real-time SSE delivery. Apply a filter:

```typescript
app.use(compression({
  filter: (req, res) => {
    if (req.headers.accept === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
}));
```

Without this filter, SSE notifications arrive in delayed batches instead of real-time.

### Rate Limit Event Logging

Log all rate limit hits for security monitoring:

```typescript
handler: (req, res) => {
  logger.warn('Rate limit exceeded', {
    ip: req.ip,
    path: req.path,
    userId: req.user?.id,
    userAgent: req.headers['user-agent'],
  });
  res.status(429).json({ ... });
},
```

Set `Retry-After` as an HTTP header (RFC 6585) in addition to the response body. Bootstrap endpoints (`/auth/csrf-token`, `/auth/me`) should use the general API rate limit, not the stricter auth rate limit.

## Helmet CSP Customization Notes

The CSP directives above are a secure baseline. Adjust for your application:

- **Web fonts**: Add font CDN domains to `styleSrc`, `styleSrcElem`, and `fontSrc` (e.g., `https://fonts.googleapis.com`, `https://fonts.gstatic.com`).
- **Maps**: Add tile server domains to `imgSrc` and `connectSrc` (e.g., `https://*.tile.openstreetmap.org`).
- **Third-party scripts**: Add CDN domains to `scriptSrc` and `scriptSrcElem`. Prefer `nonce`-based CSP over `'unsafe-inline'` when possible.
- **WebSocket**: `connectSrc` includes `ws:` and `wss:` for Socket.IO support.
- **Images**: `blob:` and `data:` in `imgSrc` support dynamically generated images and inline SVGs.

#### Design System CSP Customization

When integrating a design system that loads external resources (fonts, stylesheets) or uses inline event handlers (e.g., Svelte-based web components), document each CSP directive relaxation with a justification comment:

```typescript
contentSecurityPolicy: {
  directives: {
    'script-src': ["'self'"],
    'script-src-attr': ["'unsafe-inline'"], // Required: some design-system web components use inline handlers
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], // Required: web font loading
    'font-src': ["'self'", 'https://fonts.gstatic.com'], // Required: typography
  },
},
```

Never add `'unsafe-eval'` without verified necessity. Always annotate the reason for each relaxation.

## Response Helpers

`server/src/utils/response.ts`

Standardize all API responses:

```typescript
import { Response } from 'express';

export function sendSuccess(res: Response, data: any, statusCode = 200): void {
  res.status(statusCode).json({ data });
}

export function sendCreated(res: Response, data: any): void {
  res.status(201).json({ data });
}

export function sendNoContent(res: Response): void {
  res.status(204).end();
}

export function sendPaginated(
  res: Response,
  data: any[],
  total: number,
  page: number,
  limit: number,
): void {
  res.json({
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}
```
