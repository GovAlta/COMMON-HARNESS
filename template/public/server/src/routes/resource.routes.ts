import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate';
import {
  listResourcesSchema,
  resourceIdSchema,
  resourceUpdatesQuerySchema,
} from '../validators/resource.validator';
import * as resourceController from '../controllers/resource.controller';

const router = Router();

/**
 * GET /api/resources
 * Public — list resources with pagination, filtering, sorting.
 */
router.get(
  '/',
  validate({ query: listResourcesSchema }),
  asyncHandler(resourceController.listResources)
);

/**
 * GET /api/resources/:id
 * Public — get resource detail by ID.
 */
router.get(
  '/:id',
  validate({ params: resourceIdSchema }),
  asyncHandler(resourceController.getResource)
);

/**
 * GET /api/resources/:id/updates
 * Public — get paginated updates for a resource.
 */
router.get(
  '/:id/updates',
  validate({ params: resourceIdSchema, query: resourceUpdatesQuerySchema }),
  asyncHandler(resourceController.getResourceUpdates)
);

export default router;
