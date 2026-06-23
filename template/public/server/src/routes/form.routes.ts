import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middleware/authenticate';
import { csrf } from '../middleware/csrf';
import { validate } from '../middleware/validate';
import { formIdSchema, listFormsSchema } from '../validators/form.validator';
import * as formController from '../controllers/form.controller';

const router = Router();

/**
 * GET /api/forms/published
 * Public — list published form definitions (metadata only), paginated.
 */
router.get(
  '/published',
  validate({ query: listFormsSchema }),
  asyncHandler(formController.listPublishedForms)
);

/**
 * GET /api/forms/:id/schema
 * Authenticated — get full JSON Schema for form rendering.
 */
router.get(
  '/:id/schema',
  authenticate,
  validate({ params: formIdSchema }),
  asyncHandler(formController.getFormSchema)
);

/**
 * POST /api/forms/:id/submissions
 * Authenticated + CSRF — submit a form.
 */
router.post(
  '/:id/submissions',
  authenticate,
  csrf,
  validate({ params: formIdSchema }),
  asyncHandler(formController.submitForm)
);

/**
 * POST /api/forms/:id/drafts
 * Authenticated + CSRF — save form data as a draft.
 */
router.post(
  '/:id/drafts',
  authenticate,
  csrf,
  validate({ params: formIdSchema }),
  asyncHandler(formController.saveDraft)
);

export default router;
