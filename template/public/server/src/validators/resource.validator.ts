import { z } from 'zod';

/**
 * Zod schemas for resource-related request validation.
 */

/**
 * Query parameter validation for GET /api/resources
 */
export const listResourcesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .enum([
      'resource_title',
      'resource_status',
      'resource_category',
      'resource_region',
      'resource_published_at',
      'updated_at',
      'created_at',
    ])
    .default('updated_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  status: z.string().optional(), // comma-separated: "published,draft"
  category: z.string().optional(), // comma-separated: "guide,announcement"
  region: z.string().optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * UUID parameter validation for :id params
 */
export const resourceIdSchema = z.object({
  id: z.string().uuid('Invalid resource ID format'),
});

/**
 * Query parameter validation for paginated sub-resources (updates)
 */
export const resourceUpdatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
