import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate';
import {
  listServiceLocationsSchema,
  serviceLocationIdSchema,
} from '../validators/service-location.validator';
import * as serviceLocationController from '../controllers/service-location.controller';

const router = Router();

/**
 * GET /api/service-locations
 * Public — list service locations with pagination and filtering.
 */
router.get(
  '/',
  validate({ query: listServiceLocationsSchema }),
  asyncHandler(serviceLocationController.listServiceLocations)
);

/**
 * GET /api/service-locations/:id
 * Public — get service location detail by ID.
 */
router.get(
  '/:id',
  validate({ params: serviceLocationIdSchema }),
  asyncHandler(serviceLocationController.getServiceLocation)
);

export default router;
