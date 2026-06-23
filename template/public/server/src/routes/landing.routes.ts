import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import * as landingController from '../controllers/landing.controller';

const router = Router();

/**
 * GET /api/landing
 * Public — aggregated landing page data (stats, resources, services, etc.)
 */
router.get(
  '/',
  asyncHandler(landingController.getLandingPageData)
);

export default router;
