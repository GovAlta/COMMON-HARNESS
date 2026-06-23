import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database before importing model
vi.mock('../../config/database', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  },
}));

import { pool } from '../../config/database';
import * as resourceModel from '../../models/resource.model';

const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

describe('Resource Model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findById — published-only filter (redteam RT-RES-001)', () => {
    it('SQL includes resource_status = \'published\' filter', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await resourceModel.findById('11111111-1111-1111-1111-111111111111');

      expect(mockPool.query).toHaveBeenCalledOnce();
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('FROM resource_item');
      expect(sql).toContain('pk_resource_item = $1');
      expect(sql).toContain('is_deleted = false');
      expect(sql).toMatch(/resource_status\s*=\s*'published'/);
      expect(params).toEqual(['11111111-1111-1111-1111-111111111111']);
    });

    it('returns null when the row exists but is filtered out (draft / archived / soft-deleted)', async () => {
      // The DB applied the WHERE clause and returned no rows. The model must
      // surface this as null rather than throwing — the route handler is
      // responsible for the 404 response.
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await resourceModel.findById('22222222-2222-2222-2222-222222222222');

      expect(result).toBeNull();
    });

    it('returns the row when DB confirms it is published', async () => {
      const publishedRow = {
        pk_resource_item: '33333333-3333-3333-3333-333333333333',
        resource_status: 'published',
        is_deleted: false,
      };
      mockPool.query.mockResolvedValue({ rows: [publishedRow], rowCount: 1 });

      const result = await resourceModel.findById('33333333-3333-3333-3333-333333333333');

      expect(result).toEqual(publishedRow);
    });
  });
});
