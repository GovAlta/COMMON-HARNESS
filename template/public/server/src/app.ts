import express from 'express';
import path from 'path';
import fs from 'fs';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { env } from './config/environment';
import logger from './utils/logger';
import { correlationId } from './middleware/correlation-id';
import { errorHandler } from './middleware/error-handler';
import { apiRateLimiter } from './middleware/rate-limit';
import { csrfOrSkip } from './middleware/csrf';
import { configurePassport } from './config/auth';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import resourceRoutes from './routes/resource.routes';
import serviceLocationRoutes from './routes/service-location.routes';
import serviceRoutes from './routes/service.routes';
import formRoutes from './routes/form.routes';
import submissionRoutes from './routes/submission.routes';
import fileRoutes from './routes/file.routes';
import notificationRoutes from './routes/notification.routes';
import subscriptionRoutes from './routes/subscription.routes';
import aiRoutes from './routes/ai.routes';
import adminRoutes from './routes/admin.routes';
import landingRoutes from './routes/landing.routes';
import contactRoutes from './routes/contact.routes';
import blogRoutes from './routes/blog.routes';

const app = express();

// ─── Trust Proxy ───────────────────────────────────────────
// Required for Render.com, Azure App Service, or any reverse proxy deployment.
// Enables correct req.ip, req.protocol, and secure cookie behavior behind a load balancer.
// Always enabled — safe even without a proxy (just uses direct connection info).
//
// Load balancer / horizontal scaling compatibility:
// - Cookies use sameSite: 'lax' which works correctly behind load balancers
// - CSRF double-submit pattern is stateless — no shared state needed between instances
// - JWT auth is stateless — no session store required
// - trust proxy ensures req.ip and req.protocol reflect the real client, not the LB
app.set('trust proxy', 1);

// ─── Security Headers (Helmet) ─────────────────────────────
// CSP allowances below cover Google Fonts (fonts.googleapis.com, fonts.gstatic.com)
// and Adobe Typekit (use.typekit.net, p.typekit.net) for typography. Some standard
// Vue / PrimeVue components and theme tooling use inline styles and inline event
// handlers, so 'unsafe-inline' is permitted on style-src and script-src-attr.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-eval' is intentionally NOT included; the component libraries used
      // by the template do not require it.
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcElem: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://p.typekit.net", "https://use.typekit.net"],
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://p.typekit.net", "https://use.typekit.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://use.typekit.net", "data:"],
      imgSrc: ["'self'", "data:", "https:", "blob:", "https://*.tile.openstreetmap.org"],
      connectSrc: ["'self'", "ws:", "wss:", "https://p.typekit.net", "https://*.tile.openstreetmap.org"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  // HSTS: 1 year with preload — tells browsers to always use HTTPS
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // COEP: 'credentialless' permits cross-origin assets (Typekit fonts, OSM tiles)
  // to load without requiring them to set CORP, while still gaining Spectre-class
  // process isolation when paired with COOP. Helmet sets COOP/CORP by default;
  // this completes the triad.
  crossOriginEmbedderPolicy: { policy: 'credentialless' },
}));

// ─── Permissions-Policy Header ──────────────────────────────
// Restricts browser features not needed by this application.
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );
  next();
});

// ─── Compression ────────────────────────────────────────────
// gzip/brotli compression for all responses (HTML, JS, CSS, JSON).
// SSE streams are excluded — compression buffers chunks which breaks real-time delivery.
app.use(compression({
  filter: (req, res) => {
    if (req.headers.accept === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
}));

// ─── Static File Serving (before CORS) ──────────────────────
// Static assets are served BEFORE CORS middleware because <script type="module">
// and CSS @import send Origin headers even for same-origin requests.
// These are first-party assets — they don't need CORS headers.
const clientDistPath = path.resolve(__dirname, '..', '..', 'client', 'dist');
const clientIndexPath = path.join(clientDistPath, 'index.html');
const shouldServeClient =
  env.NODE_ENV === 'production' ||
  env.SERVE_CLIENT === 'true';

if (shouldServeClient) {
  app.use(express.static(clientDistPath, {
    maxAge: env.NODE_ENV === 'production' ? '1y' : '0',
    immutable: env.NODE_ENV === 'production',
    index: false,
  }));
}

// ─── CORS ──────────────────────────────────────────────────
// Supports multiple origins via comma-separated CORS_ORIGIN env var.
// Example: CORS_ORIGIN=https://app.example.com,https://staging.example.com
const allowedOrigins: string[] = env.CORS_ORIGIN
  .split(',')
  .map((o: string) => o.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (server-to-server, Postman, health checks)
    if (!origin) {
      callback(null, true);
      return;
    }
    // Allow any configured origin
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    // In development, allow any localhost origin regardless of port
    if (env.NODE_ENV === 'development' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Correlation-ID', 'X-Requested-With'],
  exposedHeaders: ['X-Correlation-ID', 'X-CSRF-Token'],
};
app.use(cors(corsOptions));

// ─── Global API Rate Limiting ──────────────────────────────
// Applied to all /api routes as a baseline. Route-specific rate limiters
// (auth, AI) may apply stricter limits on top of this.
app.use('/api', apiRateLimiter);

// ─── Content-Type Validation ────────────────────────────────
// Reject requests with unexpected Content-Type on state-changing methods (415 Unsupported Media Type).
// File uploads (multipart/form-data) and SSE streams are excluded.
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const ct = req.headers['content-type'] || '';
    if (ct && !ct.includes('application/json') && !ct.includes('application/x-www-form-urlencoded') && !ct.includes('multipart/form-data')) {
      res.status(415).json({ success: false, error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json, application/x-www-form-urlencoded, or multipart/form-data' } });
      return;
    }
  }
  next();
});

// ─── Body Parsing ──────────────────────────────────────────
app.use(express.json({ limit: env.BODY_LIMIT_JSON }));
app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT_URLENCODED }));

// ─── Cookie Parser ─────────────────────────────────────────
app.use(cookieParser());

// ─── Correlation ID ────────────────────────────────────────
app.use(correlationId);

// ─── Request Logging ───────────────────────────────────────
// Structured request logger using Winston
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const meta = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      correlationId: req.headers['x-correlation-id'] || undefined,
    };

    if (duration > 1000) {
      logger.warn(`Slow request: ${req.method} ${req.path} ${res.statusCode} ${duration}ms`, meta);
    } else {
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, meta);
    }
  });
  next();
});

// ─── Passport (JWT-based, no sessions) ─────────────────────
configurePassport();
app.use(passport.initialize());

// ─── Global CSRF (with documented opt-out allow-list) ───────
// CSRF protection is mounted globally on the API mount points so that any
// new state-changing route is safe by default. The explicit allow-list of
// exempt paths lives in middleware/csrf.ts CSRF_EXEMPT_PATHS — adding to it
// is a security-relevant change reviewable in PR. The per-route `csrf`
// middleware that exists in individual routers stays for now as belt-and-
// braces (running CSRF twice is harmless — the second run sees the same
// header/cookie and passes).
app.use('/api/v1', csrfOrSkip);
app.use('/api', csrfOrSkip);

// ─── API Routes ────────────────────────────────────────────
// All API routes are mounted under /api/v1/ (versioned) and /api/ (backward-compatible alias).
// When a v2 is needed, add new routes under /api/v2/ without breaking existing clients.

// Health check (no auth, no versioning)
app.use('/', healthRoutes);

// Version 1 API routes
const v1Routes = express.Router();
v1Routes.use('/auth', authRoutes);
v1Routes.use('/resources', resourceRoutes);
v1Routes.use('/service-locations', serviceLocationRoutes);
v1Routes.use('/services', serviceRoutes);
v1Routes.use('/landing', landingRoutes);
v1Routes.use('/forms', formRoutes);
v1Routes.use('/submissions', submissionRoutes);
v1Routes.use('/files', fileRoutes);
v1Routes.use('/notifications', notificationRoutes);
v1Routes.use('/subscriptions', subscriptionRoutes);
v1Routes.use('/ai', aiRoutes);
v1Routes.use('/admin', adminRoutes);
v1Routes.use('/contact', contactRoutes);
v1Routes.use('/blog', blogRoutes);

// Mount versioned routes
app.use('/api/v1', v1Routes);

// Backward-compatible alias: /api/* maps to /api/v1/*
app.use('/api', v1Routes);

// ─── SPA Fallback ─────────────────────────────────────────
// Non-API GET routes serve index.html for Vue Router (client-side routing).
// Must be after API routes so /api/* is handled by Express, not the SPA.
if (shouldServeClient) {
  const spaFallback: express.RequestHandler = (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(clientIndexPath);
  };

  const expressMajor = parseInt((express as any).version?.split('.')[0] || '4', 10);
  if (expressMajor >= 5) {
    app.get('/{*splat}', spaFallback);
  } else {
    app.get('*', spaFallback);
  }
}

// ─── Global Error Handler (must be last) ───────────────────
app.use(errorHandler);

export { app };
