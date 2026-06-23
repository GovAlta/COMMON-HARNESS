import * as serviceModel from '../models/service.model';
import { AppError } from '../utils/app-error';
import type {
  ServiceCategoryRecord,
  ServiceWithCategory,
  ServiceFilters,
} from '../types/service';

interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * List published services with filtering and pagination.
 */
export async function list(
  filters: ServiceFilters,
  page: number,
  limit: number
): Promise<PaginatedResult<ServiceWithCategory>> {
  const [data, total] = await Promise.all([
    serviceModel.findAll(filters, page, limit),
    serviceModel.countAll(filters),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

/**
 * Get a single service by ID with full detail and category info.
 * Throws 404 if not found, unpublished, or soft-deleted.
 */
export async function getById(id: string): Promise<ServiceWithCategory> {
  const service = await serviceModel.findById(id);

  if (!service) {
    throw AppError.notFound('Service not found');
  }

  return service;
}

/**
 * Get all service categories.
 */
export async function getCategories(): Promise<ServiceCategoryRecord[]> {
  return serviceModel.findCategories();
}
