import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getHealth, getLiveness, getReadiness } from '../../controllers/health.controller';

// Mock the database module — must be set up before importing pool.
vi.mock('../../config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../config/database';

function createApp() {
  const app = express();
  // Mount at the canonical paths defined in routes/health.routes.ts so the
  // tests remain accurate if a future drift sneaks back in.
  app.get('/health', getHealth);
  app.get('/health/live', getLiveness);
  app.get('/health/ready', getReadiness);
  return app;
}

describe('Health Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return success with status ok', async () => {
      const response = await request(createApp()).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ok');
    });
  });

  describe('GET /health/live', () => {
    it('should return success with status alive', async () => {
      const response = await request(createApp()).get('/health/live');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('alive');
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready with connected dependency when DB query succeeds', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [{ '?column?': 1 }] });

      const response = await request(createApp()).get('/health/ready');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ready');
      expect(response.body.data.dependencies.database.status).toBe('connected');
      expect(typeof response.body.data.dependencies.database.latencyMs).toBe('number');
      expect(pool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return 503 with disconnected dependency when DB query fails', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection refused'));

      const response = await request(createApp()).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not_ready');
      expect(response.body.dependencies.database.status).toBe('disconnected');
      expect(response.body.dependencies.database.error).toBe('Connection refused');
    });
  });
});
