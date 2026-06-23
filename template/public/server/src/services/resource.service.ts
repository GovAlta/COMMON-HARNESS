import * as resourceModel from '../models/resource.model';
import { AppError } from '../utils/app-error';
import type {
  ResourceItemRecord,
  ResourceUpdateRecord,
  ResourceFilters,
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
 * List resources with filtering, sorting, and pagination.
 */
export async function list(
  filters: ResourceFilters,
  options: PaginationOptions
): Promise<PaginatedResult<ResourceItemRecord>> {
  const [data, total] = await Promise.all([
    resourceModel.findAll(filters, options),
    resourceModel.countAll(filters),
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
 * Get a single resource by ID, including related updates.
 */
export async function getById(
  id: string
): Promise<ResourceItemRecord & { recentUpdates: ResourceUpdateRecord[] }> {
  const resource = await resourceModel.findById(id);

  if (!resource) {
    throw AppError.notFound('Resource not found');
  }

  const recentUpdates = await resourceModel.findUpdates(id, 1, 5);

  return {
    ...resource,
    recentUpdates,
  };
}

/**
 * Get paginated updates for a resource.
 */
export async function getUpdates(
  resourceId: string,
  page: number,
  limit: number
): Promise<PaginatedResult<ResourceUpdateRecord>> {
  // Verify resource exists
  const resource = await resourceModel.findById(resourceId);
  if (!resource) {
    throw AppError.notFound('Resource not found');
  }

  const [data, total] = await Promise.all([
    resourceModel.findUpdates(resourceId, page, limit),
    resourceModel.countUpdates(resourceId),
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
