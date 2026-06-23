import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middleware/authenticate';
import { csrf } from '../middleware/csrf';
import { validate } from '../middleware/validate';
import {
  submissionQuerySchema,
  submissionIdSchema,
} from '../validators/form.validator';
import * as formController from '../controllers/form.controller';

const router = Router();

/**
 * GET /api/submissions
 * Authenticated — list current user's submissions (paginated).
 */
router.get(
  '/',
  authenticate,
  validate({ query: submissionQuerySchema }),
  asyncHandler(formController.listSubmissions)
);

/**
 * GET /api/submissions/:id
 * Authenticated — get submission detail (own submissions only).
 */
router.get(
  '/:id',
  authenticate,
  validate({ params: submissionIdSchema }),
  asyncHandler(formController.getSubmission)
);

/**
 * PUT /api/submissions/:id/draft
 * Authenticated + CSRF — update an existing draft.
 */
router.put(
  '/:id/draft',
  authenticate,
  csrf,
  validate({ params: submissionIdSchema }),
  asyncHandler(formController.updateDraft)
);

/**
 * POST /api/submissions/:id/submit
 * Authenticated + CSRF — submit a previously saved draft.
 */
router.post(
  '/:id/submit',
  authenticate,
  csrf,
  validate({ params: submissionIdSchema }),
  asyncHandler(formController.submitDraft)
);

/**
 * POST /api/submissions/:id/retract
 * Authenticated + CSRF — retract a submitted submission.
 */
router.post(
  '/:id/retract',
  authenticate,
  csrf,
  validate({ params: submissionIdSchema }),
  asyncHandler(formController.retractSubmission)
);

export default router;
