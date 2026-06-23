import { z } from 'zod';

/**
 * Zod schemas for service catalogue request validation.
 */

/**
 * Query parameter validation for GET /api/services
 * NOTE: page and limit arrive as strings from Express query params.
 * Using .coerce.number() to parse them to integers.
 */
export const listServicesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().optional(),
  search: z.string().optional(),
});

/**
 * UUID parameter validation for :id params
 */
export const serviceIdSchema = z.object({
  id: z.string().uuid('Invalid service ID format'),
});
