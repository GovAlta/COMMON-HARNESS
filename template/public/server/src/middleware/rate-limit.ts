import rateLimit, { type Store } from 'express-rate-limit';
import { AppError } from '../utils/app-error';
import { env } from '../config/environment';
import logger from '../utils/logger';

/**
 * Build the rate-limit store. When REDIS_URL is set AND the optional
 * `rate-limit-redis` + `ioredis` packages are installed, we use Redis so
 * limits hold across horizontally-scaled instances. Otherwise we fall back to
 * express-rate-limit's in-memory MemoryStore — correct for single-instance
 * deploys (RA-RL-001).
 *
 * To enable Redis-backed rate limits:
 *   1. cd server && npm install rate-limit-redis ioredis
 *   2. Set REDIS_URL in your deploy env (e.g. redis://...)
 *
 * Constructed once at module load and shared across all limiters; this avoids
 * opening a new Redis connection per limiter and keeps a single pool.
 */
function buildSharedStore(): Store | undefined {
  if (!env.REDIS_URL) return undefined;

  // Lazy-loaded so this module compiles and runs without the optional packages
  // when REDIS_URL is unset. If REDIS_URL is set but the packages weren't
  // installed, warn and fall back to memory instead of crashing the boot.
  let RedisStore: any;
  let Redis: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    RedisStore = require('rate-limit-redis').default ?? require('rate-limit-redis');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Redis = require('ioredis').default ?? require('ioredis');
  } catch {
    logger.warn(
      'REDIS_URL is set but optional packages are missing — falling back to memory store. ' +
      'Run `npm install rate-limit-redis ioredis` in server/ to enable Redis-backed limits.'
    );
    return undefined;
  }

  const client = new Redis(env.REDIS_URL, {
    // Fail fast at startup if Redis is unreachable rather than silently
    // queueing commands. The server will crash and the orchestrator will
    // restart it with the misconfiguration surfaced in the log.
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

  client.on('error', (err: Error) => {
    logger.error('Redis rate-limit store error', { error: err.message });
  });

  logger.info('Rate-limit backing store: redis', { url: env.REDIS_URL.replace(/:[^:@/]+@/, ':***@') });

  return new RedisStore({
    sendCommand: (...args: string[]) => client.call(args[0], ...args.slice(1)),
  });
}

const sharedStore = buildSharedStore();
if (!sharedStore) {
  logger.info('Rate-limit backing store: memory (single-instance only — RA-RL-001)');
}

/**
 * Create a rate limiter middleware.
 * All rate limits are configurable via environment variables — no hardcoded values.
 *
 * Store: shared across limiters. Redis when REDIS_URL is set; otherwise the
 * default in-memory store. Set REDIS_URL in any horizontally-scaled deploy.
 */
export function createRateLimiter(maxRequests: number, windowMs: number) {
  return rateLimit({
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    store: sharedStore,
    handler: (req, res, next) => {
      const retryAfterSeconds = Math.ceil(windowMs / 1000);
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        userId: (req as any).user?.id,
        userAgent: req.headers['user-agent'],
        retryAfter: retryAfterSeconds,
      });
      res.setHeader('Retry-After', String(retryAfterSeconds));
      const error = AppError.tooManyRequests('Too many requests, please try again later');
      error.details.push({ message: `Retry after ${retryAfterSeconds} seconds`, field: 'retryAfter' });
      next(error);
    },
  });
}

/**
 * General API rate limiter.
 * Default: 200 requests per 15 minutes per IP.
 * Env: RATE_LIMIT_API_MAX, RATE_LIMIT_API_WINDOW_MS
 */
export const apiRateLimiter = createRateLimiter(
  env.RATE_LIMIT_API_MAX,
  env.RATE_LIMIT_API_WINDOW_MS
);

/**
 * Auth endpoint rate limiter (login, SSO callbacks).
 * Default: 30 requests per 15 minutes per IP.
 * Env: RATE_LIMIT_AUTH_MAX, RATE_LIMIT_AUTH_WINDOW_MS
 *
 * NOTE: Only apply to actual login/SSO endpoints, NOT to /csrf or /me
 * which are called frequently during normal app usage.
 */
export const authRateLimiter = createRateLimiter(
  env.RATE_LIMIT_AUTH_MAX,
  env.RATE_LIMIT_AUTH_WINDOW_MS
);

/**
 * AI endpoint rate limiter.
 * Default: 60 requests per hour per IP.
 * Env: RATE_LIMIT_AI_MAX, RATE_LIMIT_AI_WINDOW_MS
 */
export const aiRateLimiter = createRateLimiter(
  env.RATE_LIMIT_AI_MAX,
  env.RATE_LIMIT_AI_WINDOW_MS
);

/**
 * Broadcast rate limiter — much tighter than the general API bucket because
 * each broadcast fans out to every active user (N INSERTs + N SSE writes).
 * Default: 60 broadcasts per hour per IP. A compromised admin token can't
 * weaponise the broadcast endpoint into a DB/SSE flood without tripping this
 * cap first.
 * Env: RATE_LIMIT_BROADCAST_MAX, RATE_LIMIT_BROADCAST_WINDOW_MS
 */
export const broadcastRateLimiter = createRateLimiter(
  env.RATE_LIMIT_BROADCAST_MAX,
  env.RATE_LIMIT_BROADCAST_WINDOW_MS
);
