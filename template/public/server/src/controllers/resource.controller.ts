import { Request, Response } from 'express';
import * as resourceService from '../services/resource.service';
import { sendSuccess, sendPaginated } from '../utils/response';
import type { ResourceFilters, PaginationOptions } from '../types/resource';

/**
 * GET /api/resources
 * List resources with server-side pagination, filtering, and sorting.
 */
export async function listResources(req: Request, res: Response): Promise<void> {
  // Query params are validated and coerced by the validate middleware
  const {
    page,
    limit,
    sort,
    order,
    status,
    category,
    region,
    search,
    startDate,
    endDate,
  } = req.query as Record<string, any>;

  // Build filters object using query parameter names (not DB column names).
  // PUBLIC list — drafts and archived rows must never leak. The caller can
  // narrow further by passing ?status= (intersected against the public allow-list
  // below), but they can never widen to include 'draft' / 'archived'.
  // Admin views use a separate /api/v1/admin/resources path that bypasses this.
  const PUBLIC_STATUSES = ['published'];
  const filters: ResourceFilters = { status: [...PUBLIC_STATUSES] };

  if (status) {
    const requested = (status as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    // Intersect requested ∩ public — silently drop disallowed values rather
    // than 422, so a stale client doesn't break.
    const safe = requested.filter((s) => PUBLIC_STATUSES.includes(s));
    filters.status = safe.length > 0 ? safe : [...PUBLIC_STATUSES];
  }
  if (category) {
    filters.category = (category as string).split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  if (region) {
    filters.region = region as string;
  }
  if (search) {
    filters.search = search as string;
  }
  if (startDate) {
    filters.startDate = startDate as string;
  }
  if (endDate) {
    filters.endDate = endDate as string;
  }

  const options: PaginationOptions = {
    sort: sort as string,
    order: order as 'asc' | 'desc',
    page: Number(page),
    limit: Number(limit),
  };

  const result = await resourceService.list(filters, options);

  sendPaginated(res, result.data, result.pagination);
}

/**
 * GET /api/resources/:id
 * Get a single resource with full detail.
 */
export async function getResource(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const resource = await resourceService.getById(id);
  sendSuccess(res, resource);
}

/**
 * GET /api/resources/:id/updates
 * Get paginated updates for a resource.
 */
export async function getResourceUpdates(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { page, limit } = req.query as Record<string, any>;

  const result = await resourceService.getUpdates(id, Number(page) || 1, Number(limit) || 20);

  sendPaginated(res, result.data, result.pagination);
}
