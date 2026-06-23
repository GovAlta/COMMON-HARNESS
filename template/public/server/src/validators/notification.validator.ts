import { z } from 'zod';

/**
 * Query parameter validation for GET /api/notifications
 */
export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  filter: z.enum(['all', 'unread', 'read']).default('all'),
});

/**
 * UUID parameter validation for notification delivery :id
 */
export const notificationIdSchema = z.object({
  id: z.string().uuid('Invalid notification ID format'),
});

/**
 * Body validation for POST /api/subscriptions
 */
export const createSubscriptionSchema = z.object({
  type: z.enum(['resource', 'region', 'broadcast']),
  targetId: z.string().uuid('Invalid target ID format').optional().nullable(),
  regionName: z.string().min(1).max(100).optional().nullable(),
  filterCriteria: z.record(z.unknown()).optional().default({}),
}).refine(
  (data) => {
    // resource subscriptions must have a targetId
    if (data.type === 'resource' && !data.targetId) {
      return false;
    }
    // region subscriptions must have a regionName
    if (data.type === 'region' && !data.regionName) {
      return false;
    }
    return true;
  },
  {
    message: 'Resource subscriptions require targetId; region subscriptions require regionName',
    path: ['type'],
  }
);

/**
 * UUID parameter validation for subscription :id
 */
export const subscriptionIdSchema = z.object({
  id: z.string().uuid('Invalid subscription ID format'),
});

/**
 * Query parameter validation for GET /api/subscriptions.
 */
export const listSubscriptionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Body validation for POST /api/notifications/broadcast (admin)
 */
export const broadcastSchema = z.object({
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(5000),
  type: z.enum(['service_update', 'announcement', 'emergency_broadcast', 'general']).default('general'),
  regionFilter: z.string().max(100).optional().nullable(),
  resourceId: z.string().uuid().optional().nullable(),
});
