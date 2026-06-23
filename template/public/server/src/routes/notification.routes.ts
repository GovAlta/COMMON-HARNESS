import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { csrf } from '../middleware/csrf';
import { validate } from '../middleware/validate';
import { broadcastRateLimiter } from '../middleware/rate-limit';
import {
  notificationQuerySchema,
  notificationIdSchema,
  broadcastSchema,
} from '../validators/notification.validator';
import * as notificationController from '../controllers/notification.controller';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

/**
 * GET /api/notifications/stream
 * SSE endpoint for real-time notification delivery.
 * Must be before /:id to avoid route conflict.
 */
router.get(
  '/stream',
  asyncHandler(notificationController.streamNotifications)
);

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for header badge.
 */
router.get(
  '/unread-count',
  asyncHandler(notificationController.getUnreadCount)
);

/**
 * GET /api/notifications
 * List current user's notifications with pagination.
 */
router.get(
  '/',
  validate({ query: notificationQuerySchema }),
  asyncHandler(notificationController.listNotifications)
);

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read.
 */
router.put(
  '/:id/read',
  csrf,
  validate({ params: notificationIdSchema }),
  asyncHandler(notificationController.markAsRead)
);

/**
 * POST /api/notifications/broadcast
 * Admin broadcast to all subscribers.
 */
router.post(
  '/broadcast',
  broadcastRateLimiter,
  csrf,
  authorize('admin'),
  validate({ body: broadcastSchema }),
  asyncHandler(notificationController.broadcastNotification)
);

export default router;
