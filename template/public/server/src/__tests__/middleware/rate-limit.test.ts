import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createRateLimiter } from '../../middleware/rate-limit';

describe('rate-limit middleware', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();

    // Create a rate limiter with 3 requests per 10 seconds for testing
    const limiter = createRateLimiter(3, 10000);

    app.use('/test', limiter, (_req, res) => {
      res.json({ success: true, data: { message: 'ok' } });
    });

    // Error handler
    app.use((err: Error & { statusCode?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(err.statusCode || 500).json({
        success: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message },
      });
    });
  });

  it('should allow requests under the limit', async () => {
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 429 after exceeding the limit', async () => {
    // Make 3 requests (at the limit)
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
    }

    // 4th request should be rate limited
    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('should include rate limit headers', async () => {
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    // express-rate-limit sets standard headers
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });
});
