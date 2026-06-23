import { z } from 'zod';

/**
 * Zod schemas for service location request validation.
 */

/**
 * Query parameter validation for GET /api/service-locations
 */
export const listServiceLocationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Map view needs all visible markers in a single request; 500 covers a
  // city's worth of locations. Paginate via ?page when scrolling beyond.
  limit: z.coerce.number().int().min(1).max(500).default(20),
  sort: z
    .enum([
      'location_name',
      'location_city',
      'location_region',
      'location_status',
      'updated_at',
      'created_at',
    ])
    .default('location_name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  status: z.enum(['open', 'closed', 'limited']).optional(),
  region: z.string().optional(),
  category: z.string().uuid().optional(),
  search: z.string().optional(),
});

/**
 * UUID parameter validation for :id params
 */
export const serviceLocationIdSchema = z.object({
  id: z.string().uuid('Invalid service location ID format'),
});
