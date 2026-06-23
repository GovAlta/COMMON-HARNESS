import { Request, Response } from 'express';
import * as serviceLocationService from '../services/service-location.service';
import { sendSuccess, sendPaginated } from '../utils/response';
import type { ServiceLocationFilters, PaginationOptions } from '../types/resource';

/**
 * GET /api/service-locations
 * List service locations with server-side pagination and filtering.
 */
export async function listServiceLocations(req: Request, res: Response): Promise<void> {
  const {
    page,
    limit,
    sort,
    order,
    status,
    region,
    category,
    search,
  } = req.query as Record<string, any>;

  const filters: ServiceLocationFilters = {};

  if (status) {
    filters.status = status as string;
  }
  if (region) {
    filters.region = region as string;
  }
  if (category) {
    filters.category = category as string;
  }
  if (search) {
    filters.search = search as string;
  }

  const options: PaginationOptions = {
    sort: (sort as string) || 'location_name',
    order: (order as 'asc' | 'desc') || 'asc',
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  };

  const result = await serviceLocationService.list(filters, options);

  sendPaginated(res, result.data, result.pagination);
}

/**
 * GET /api/service-locations/:id
 * Get a single service location by ID.
 */
export async function getServiceLocation(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const location = await serviceLocationService.getById(id);
  sendSuccess(res, location);
}
