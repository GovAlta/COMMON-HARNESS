import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

// Mock service module
vi.mock('../../services/service.service', () => ({
  list: vi.fn(),
  getById: vi.fn(),
  getCategories: vi.fn(),
}));

import * as serviceService from '../../services/service.service';
import * as serviceController from '../../controllers/service.controller';

const mockServiceSvc = serviceService as unknown as {
  list: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  getCategories: ReturnType<typeof vi.fn>;
};

function createMockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    query: {},
    params: {},
    ...overrides,
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return { req, res };
}

const mockService = {
  pk_service_catalogue: '11111111-1111-1111-1111-111111111111',
  service_title: 'Test Service',
  service_description_brief: 'Brief description',
  category_name: 'Emergency Services',
  category_icon_name: 'emergency',
};

describe('Service Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listServices', () => {
    it('should return paginated services', async () => {
      const { req, res } = createMockReqRes({
        query: { page: 1, limit: 20 } as any,
      });

      mockServiceSvc.list.mockResolvedValue({
        data: [mockService],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      await serviceController.listServices(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: [mockService],
          pagination: expect.objectContaining({ total: 1 }),
        })
      );
    });

    it('should pass category filter to service', async () => {
      const { req, res } = createMockReqRes({
        query: { page: 1, limit: 20, category: 'Emergency Services' } as any,
      });

      mockServiceSvc.list.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      });

      await serviceController.listServices(req, res);

      expect(mockServiceSvc.list).toHaveBeenCalledWith(
        { category: 'Emergency Services' },
        1,
        20
      );
    });

    it('should pass search filter to service', async () => {
      const { req, res } = createMockReqRes({
        query: { page: 1, limit: 20, search: 'permit' } as any,
      });

      mockServiceSvc.list.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      });

      await serviceController.listServices(req, res);

      expect(mockServiceSvc.list).toHaveBeenCalledWith(
        { search: 'permit' },
        1,
        20
      );
    });

    it('should pass combined filters', async () => {
      const { req, res } = createMockReqRes({
        query: { page: 2, limit: 10, category: 'Financial Assistance', search: 'drp' } as any,
      });

      mockServiceSvc.list.mockResolvedValue({
        data: [],
        pagination: { page: 2, limit: 10, total: 0, totalPages: 1 },
      });

      await serviceController.listServices(req, res);

      expect(mockServiceSvc.list).toHaveBeenCalledWith(
        { category: 'Financial Assistance', search: 'drp' },
        2,
        10
      );
    });
  });

  describe('getService', () => {
    it('should return service detail', async () => {
      const { req, res } = createMockReqRes({
        params: { id: '11111111-1111-1111-1111-111111111111' },
      } as any);

      mockServiceSvc.getById.mockResolvedValue(mockService);

      await serviceController.getService(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockService,
        })
      );
    });

    it('should pass the id parameter to service', async () => {
      const { req, res } = createMockReqRes({
        params: { id: '22222222-2222-2222-2222-222222222222' },
      } as any);

      mockServiceSvc.getById.mockResolvedValue(mockService);

      await serviceController.getService(req, res);

      expect(mockServiceSvc.getById).toHaveBeenCalledWith(
        '22222222-2222-2222-2222-222222222222'
      );
    });
  });

  describe('getCategories', () => {
    it('should return all categories', async () => {
      const { req, res } = createMockReqRes();
      const mockCategories = [
        { pk_service_category: '1', category_name: 'Emergency', category_sort_order: 1 },
        { pk_service_category: '2', category_name: 'Financial', category_sort_order: 2 },
      ];

      mockServiceSvc.getCategories.mockResolvedValue(mockCategories);

      await serviceController.getCategories(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockCategories,
        })
      );
    });
  });
});
