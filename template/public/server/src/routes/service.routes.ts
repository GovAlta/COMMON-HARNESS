import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate';
import {
  listServicesSchema,
  serviceIdSchema,
} from '../validators/service.validator';
import * as serviceController from '../controllers/service.controller';

const router = Router();

/**
 * GET /api/services
 * Public — list services with pagination, category filtering, search.
 */
router.get(
  '/',
  validate({ query: listServicesSchema }),
  asyncHandler(serviceController.listServices)
);

/**
 * GET /api/services/categories
 * Public — list all service categories (for filter tabs).
 * MUST be registered BEFORE /:id to avoid route parameter conflict.
 */
router.get(
  '/categories',
  asyncHandler(serviceController.getCategories)
);

/**
 * GET /api/services/:id
 * Public — get service detail by ID.
 */
router.get(
  '/:id',
  validate({ params: serviceIdSchema }),
  asyncHandler(serviceController.getService)
);

export default router;
