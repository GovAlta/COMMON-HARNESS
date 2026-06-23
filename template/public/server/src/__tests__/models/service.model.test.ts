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
import * as serviceModel from '../../models/service.model';

const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

describe('Service Model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('should build parameterized query without filters', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await serviceModel.findAll({}, 1, 20);

      expect(mockPool.query).toHaveBeenCalledOnce();
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('SELECT');
      expect(sql).toContain('service_catalogue sc');
      expect(sql).toContain('JOIN service_category cat');
      expect(sql).toContain('is_published = true');
      expect(sql).toContain('is_deleted = false');
      expect(sql).toContain('LIMIT');
      expect(sql).toContain('OFFSET');
      expect(params).toContain(20);  // limit
      expect(params).toContain(0);   // offset
    });

    it('should add category filter by UUID', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
      const uuid = '11111111-1111-1111-1111-111111111111';

      await serviceModel.findAll({ category: uuid }, 1, 20);

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('fk_service_catalogue_service_category = $1');
      expect(params).toContain(uuid);
    });

    it('should add category filter by name (ILIKE)', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await serviceModel.findAll({ category: 'Emergency Services' }, 1, 20);

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('category_name ILIKE');
      expect(params).toContain('Emergency Services');
    });

    it('should add search filter with ILIKE on title and brief', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await serviceModel.findAll({ search: 'permit' }, 1, 20);

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('service_title ILIKE');
      expect(sql).toContain('service_description_brief ILIKE');
      expect(params).toContain('%permit%');
    });

    it('should calculate correct offset for pagination', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await serviceModel.findAll({}, 3, 10);

      const [, params] = mockPool.query.mock.calls[0];
      // offset = (3-1) * 10 = 20
      expect(params).toContain(10); // limit
      expect(params).toContain(20); // offset
    });

    it('should order by category sort order then title', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await serviceModel.findAll({}, 1, 20);

      const [sql] = mockPool.query.mock.calls[0];
      expect(sql).toContain('ORDER BY cat.category_sort_order ASC, sc.service_title ASC');
    });
  });

  describe('countAll', () => {
    it('should return count from database', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ count: '15' }], rowCount: 1 });

      const count = await serviceModel.countAll({});

      expect(count).toBe(15);
    });

    it('should apply filters to count query', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ count: '3' }], rowCount: 1 });

      const count = await serviceModel.countAll({ search: 'health' });

      expect(count).toBe(3);
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('COUNT(*)');
      expect(params).toContain('%health%');
    });
  });

  describe('findById', () => {
    it('should query by primary key with parameterized query', async () => {
      const mockService = {
        pk_service_catalogue: '11111111-1111-1111-1111-111111111111',
        service_title: 'Test Service',
      };
      mockPool.query.mockResolvedValue({ rows: [mockService], rowCount: 1 });

      const result = await serviceModel.findById('11111111-1111-1111-1111-111111111111');

      expect(result).toEqual(mockService);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('pk_service_catalogue = $1'),
        ['11111111-1111-1111-1111-111111111111']
      );
    });

    it('should return null when not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await serviceModel.findById('99999999-9999-9999-9999-999999999999');

      expect(result).toBeNull();
    });

    it('should filter by published and not deleted', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await serviceModel.findById('11111111-1111-1111-1111-111111111111');

      const [sql] = mockPool.query.mock.calls[0];
      expect(sql).toContain('is_published = true');
      expect(sql).toContain('is_deleted = false');
    });

    it('should join with category table', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await serviceModel.findById('11111111-1111-1111-1111-111111111111');

      const [sql] = mockPool.query.mock.calls[0];
      expect(sql).toContain('JOIN service_category cat');
      expect(sql).toContain('category_name');
      expect(sql).toContain('category_icon_name');
    });
  });

  describe('findCategories', () => {
    it('should return all categories ordered by sort order', async () => {
      const mockCategories = [
        { pk_service_category: '1', category_name: 'Emergency', category_sort_order: 1 },
        { pk_service_category: '2', category_name: 'Financial', category_sort_order: 2 },
      ];
      mockPool.query.mockResolvedValue({ rows: mockCategories, rowCount: 2 });

      const result = await serviceModel.findCategories();

      expect(result).toHaveLength(2);
      expect(result[0].category_name).toBe('Emergency');
      const [sql] = mockPool.query.mock.calls[0];
      expect(sql).toContain('ORDER BY category_sort_order ASC');
    });
  });
});
