import * as serviceLocationModel from '../models/service-location.model';
import { AppError } from '../utils/app-error';
import type {
  ServiceLocationRecord,
  ServiceLocationFilters,
  PaginationOptions,
} from '../types/resource';

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
 * List service locations with filtering, sorting, and pagination.
 */
export async function list(
  filters: ServiceLocationFilters,
  options: PaginationOptions
): Promise<PaginatedResult<ServiceLocationRecord>> {
  const [data, total] = await Promise.all([
    serviceLocationModel.findAll(filters, options),
    serviceLocationModel.countAll(filters),
  ]);

  const totalPages = Math.ceil(total / options.limit) || 1;

  return {
    data,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages,
    },
  };
}

/**
 * Get a single service location by ID.
 */
export async function getById(id: string): Promise<ServiceLocationRecord> {
  const location = await serviceLocationModel.findById(id);

  if (!location) {
    throw AppError.notFound('Service location not found');
  }

  return location;
}
