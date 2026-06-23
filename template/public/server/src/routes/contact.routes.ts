import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate';
import { submitContactSchema } from '../validators/contact.validator';
import * as contactController from '../controllers/contact.controller';

const router = Router();

/**
 * POST /api/contact
 * Public — submit a contact inquiry. Protected by the global CSRF middleware
 * mounted on /api in app.ts, plus the global API rate limiter. Validation
 * runs before the controller via the Zod schema.
 */
router.post(
  '/',
  validate(submitContactSchema),
  asyncHandler(contactController.submit)
);

export default router;
