import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../config/database';
import * as adminModel from '../../models/admin.model';

const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

describe('AdminModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getResourceCount', () => {
    it('should return count for given status', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });
      const count = await adminModel.getResourceCount('published');
      expect(count).toBe(5);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('resource_status'),
        ['published']
      );
    });
  });

  describe('getPublishedResourceCount', () => {
    it('should return count of published resources', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '7' }] });
      const count = await adminModel.getPublishedResourceCount();
      expect(count).toBe(7);
    });
  });

  describe('getServiceLocationCount', () => {
    it('should return count of service locations', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '12' }] });
      const count = await adminModel.getServiceLocationCount();
      expect(count).toBe(12);
    });
  });

  describe('getOpenAssistanceCount', () => {
    it('should return count of open assistance requests', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '10' }] });
      const count = await adminModel.getOpenAssistanceCount();
      expect(count).toBe(10);
    });
  });

  describe('getPendingSubmissionCount', () => {
    it('should return count of pending submissions', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      const count = await adminModel.getPendingSubmissionCount();
      expect(count).toBe(3);
    });
  });

  describe('getResourcesOverTime', () => {
    it('should return time series data', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { date: '2024-01-01', value: '2' },
          { date: '2024-01-02', value: '0' },
        ],
      });

      const data = await adminModel.getResourcesOverTime(30);
      expect(data).toEqual([
        { date: '2024-01-01', value: 2 },
        { date: '2024-01-02', value: 0 },
      ]);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('generate_series'),
        [30]
      );
    });
  });

  describe('getSubmissionsOverTime', () => {
    it('should return time series data for submissions', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ date: '2024-01-01', value: '5' }],
      });

      const data = await adminModel.getSubmissionsOverTime(7);
      expect(data).toEqual([{ date: '2024-01-01', value: 5 }]);
      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [7]);
    });
  });

  describe('createResource', () => {
    it('should insert and return a new resource record', async () => {
      const mockResource = {
        pk_resource_item: '11111111-1111-1111-1111-111111111111',
        resource_title: 'Test Resource',
        resource_status: 'published',
      };
      mockPool.query.mockResolvedValueOnce({ rows: [mockResource] });

      const result = await adminModel.createResource({
        resource_title: 'Test Resource',
        resource_status: 'published',
        resource_region: 'Edmonton',
        resource_category: 'General',
      });

      expect(result).toEqual(mockResource);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO resource_item'),
        expect.arrayContaining(['Test Resource', 'published'])
      );
    });
  });

  describe('updateResource', () => {
    it('should update resource fields dynamically', async () => {
      const mockUpdated = {
        pk_resource_item: '11111111-1111-1111-1111-111111111111',
        resource_status: 'draft',
      };
      mockPool.query.mockResolvedValueOnce({ rows: [mockUpdated] });

      const result = await adminModel.updateResource('11111111-1111-1111-1111-111111111111', {
        resource_status: 'draft',
        updated_by: '22222222-2222-2222-2222-222222222222',
      });

      expect(result).toEqual(mockUpdated);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE resource_item'),
        expect.any(Array)
      );
    });
  });

  describe('findAllSubmissions', () => {
    it('should return submissions with filters', async () => {
      const mockSubs = [{ pk_form_submission: 'abc', form_name: 'Test Form' }];
      mockPool.query.mockResolvedValueOnce({ rows: mockSubs });

      const result = await adminModel.findAllSubmissions(
        { status: 'submitted' },
        1,
        20
      );

      expect(result).toEqual(mockSubs);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('submission_status'),
        expect.arrayContaining(['submitted', 20, 0])
      );
    });

    it('should handle no filters', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await adminModel.findAllSubmissions({}, 1, 10);
      expect(result).toEqual([]);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY fs.created_at'),
        expect.arrayContaining([10, 0])
      );
    });
  });

  describe('updateSubmissionStatus', () => {
    it('should update status and return record', async () => {
      const mockSub = {
        pk_form_submission: '11111111-1111-1111-1111-111111111111',
        submission_status: 'in-review',
      };
      mockPool.query.mockResolvedValueOnce({ rows: [mockSub] });

      const result = await adminModel.updateSubmissionStatus(
        '11111111-1111-1111-1111-111111111111',
        'in-review',
        '22222222-2222-2222-2222-222222222222'
      );

      expect(result?.submission_status).toBe('in-review');
    });
  });

  describe('createFormDefinition', () => {
    it('should insert and return a form definition', async () => {
      const mockForm = {
        pk_form_definition: '11111111-1111-1111-1111-111111111111',
        form_name: 'Test Form',
        is_published: true,
      };
      mockPool.query.mockResolvedValueOnce({ rows: [mockForm] });

      const result = await adminModel.createFormDefinition({
        form_name: 'Test Form',
        form_schema: { title: 'Test', fields: [] },
        is_published: true,
      });

      expect(result.form_name).toBe('Test Form');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO form_definition'),
        expect.any(Array)
      );
    });
  });
});
