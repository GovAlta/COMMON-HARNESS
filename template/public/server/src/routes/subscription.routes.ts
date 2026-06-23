import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middleware/authenticate';
import { csrf } from '../middleware/csrf';
import { validate } from '../middleware/validate';
import {
  createSubscriptionSchema,
  subscriptionIdSchema,
  listSubscriptionsSchema,
} from '../validators/notification.validator';
import * as notificationController from '../controllers/notification.controller';

const router = Router();

// All subscription routes require authentication
router.use(authenticate);

/**
 * GET /api/subscriptions
 * List current user's subscriptions, paginated.
 */
router.get(
  '/',
  validate({ query: listSubscriptionsSchema }),
  asyncHandler(notificationController.listSubscriptions)
);

/**
 * POST /api/subscriptions
 * Create a new subscription.
 */
router.post(
  '/',
  csrf,
  validate({ body: createSubscriptionSchema }),
  asyncHandler(notificationController.createSubscription)
);

/**
 * DELETE /api/subscriptions/:id
 * Delete a subscription.
 */
router.delete(
  '/:id',
  csrf,
  validate({ params: subscriptionIdSchema }),
  asyncHandler(notificationController.deleteSubscription)
);

export default router;
