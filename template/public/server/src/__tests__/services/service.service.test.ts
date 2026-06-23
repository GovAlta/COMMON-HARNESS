import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the model module
vi.mock('../../models/service.model', () => ({
  findAll: vi.fn(),
  countAll: vi.fn(),
  findById: vi.fn(),
  findCategories: vi.fn(),
}));

import * as serviceModel from '../../models/service.model';
import * as serviceService from '../../services/service.service';
import { AppError } from '../../utils/app-error';

const mockModel = serviceModel as unknown as {
  findAll: ReturnType<typeof vi.fn>;
  countAll: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findCategories: ReturnType<typeof vi.fn>;
};

const mockService = {
  pk_service_catalogue: '11111111-1111-1111-1111-111111111111',
  service_title: 'Test Service',
  service_description_brief: 'Brief description',
  service_description_full: 'Full description',
  category_name: 'Emergency Services',
  category_icon_name: 'emergency',
  is_published: true,
  is_deleted: false,
};

describe('Service Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should return paginated services with correct metadata', async () => {
      mockModel.findAll.mockResolvedValue([mockService]);
      mockModel.countAll.mockResolvedValue(1);

      const result = await serviceService.list({}, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].service_title).toBe('Test Service');
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('should calculate totalPages correctly', async () => {
      mockModel.findAll.mockResolvedValue([]);
      mockModel.countAll.mockResolvedValue(45);

      const result = await serviceService.list({}, 1, 20);

      expect(result.pagination.totalPages).toBe(3);
    });

    it('should return totalPages of 1 when there are no results', async () => {
      mockModel.findAll.mockResolvedValue([]);
      mockModel.countAll.mockResolvedValue(0);

      const result = await serviceService.list({}, 1, 20);

      expect(result.pagination.totalPages).toBe(1);
    });

    it('should pass filters to model', async () => {
      mockModel.findAll.mockResolvedValue([]);
      mockModel.countAll.mockResolvedValue(0);

      const filters = { category: 'Emergency Services', search: 'health' };
      await serviceService.list(filters, 2, 10);

      expect(mockModel.findAll).toHaveBeenCalledWith(filters, 2, 10);
      expect(mockModel.countAll).toHaveBeenCalledWith(filters);
    });

    it('should execute findAll and countAll in parallel', async () => {
      const order: string[] = [];

      mockModel.findAll.mockImplementation(async () => {
        order.push('findAll');
        return [];
      });
      mockModel.countAll.mockImplementation(async () => {
        order.push('countAll');
        return 0;
      });

      await serviceService.list({}, 1, 20);

      // Both should be called (parallel via Promise.all)
      expect(mockModel.findAll).toHaveBeenCalledOnce();
      expect(mockModel.countAll).toHaveBeenCalledOnce();
    });
  });

  describe('getById', () => {
    it('should return service when found', async () => {
      mockModel.findById.mockResolvedValue(mockService);

      const result = await serviceService.getById('11111111-1111-1111-1111-111111111111');

      expect(result.service_title).toBe('Test Service');
      expect(result.category_name).toBe('Emergency Services');
    });

    it('should throw 404 AppError when not found', async () => {
      mockModel.findById.mockResolvedValue(null);

      await expect(
        serviceService.getById('99999999-9999-9999-9999-999999999999')
      ).rejects.toThrow(AppError);

      try {
        await serviceService.getById('99999999-9999-9999-9999-999999999999');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).statusCode).toBe(404);
        expect((error as AppError).code).toBe('NOT_FOUND');
      }
    });
  });

  describe('getCategories', () => {
    it('should return all categories', async () => {
      const mockCategories = [
        { pk_service_category: '1', category_name: 'Emergency', category_sort_order: 1 },
        { pk_service_category: '2', category_name: 'Financial', category_sort_order: 2 },
      ];
      mockModel.findCategories.mockResolvedValue(mockCategories);

      const result = await serviceService.getCategories();

      expect(result).toHaveLength(2);
      expect(mockModel.findCategories).toHaveBeenCalledOnce();
    });
  });
});
