import { Request, Response } from 'express';
import * as serviceService from '../services/service.service';
import { sendSuccess, sendPaginated } from '../utils/response';
import type { ServiceFilters } from '../types/service';

/**
 * GET /api/services
 * List published services with category filtering, search, and pagination.
 */
export async function listServices(req: Request, res: Response): Promise<void> {
  // Query params are validated and coerced by the validate middleware
  const { page, limit, category, search } = req.query as Record<string, any>;

  const filters: ServiceFilters = {};

  if (category) {
    filters.category = category as string;
  }
  if (search) {
    filters.search = search as string;
  }

  const result = await serviceService.list(filters, Number(page), Number(limit));

  sendPaginated(res, result.data, result.pagination);
}

/**
 * GET /api/services/:id
 * Get full service detail including category info.
 */
export async function getService(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const service = await serviceService.getById(id);
  sendSuccess(res, service);
}

/**
 * GET /api/services/categories
 * Get all service categories for filter tabs.
 */
export async function getCategories(_req: Request, res: Response): Promise<void> {
  const categories = await serviceService.getCategories();
  sendSuccess(res, categories);
}
