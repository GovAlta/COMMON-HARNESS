import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../middleware/validate';
import { listPublicSchema, slugParamSchema } from '../validators/blog.validator';
import * as blogController from '../controllers/blog.controller';

const router = Router();

/**
 * GET /api/blog
 * Public — paginated list of published posts.
 */
router.get(
  '/',
  validate(listPublicSchema),
  asyncHandler(blogController.listPublic)
);

/**
 * GET /api/blog/:slug
 * Public — fetch a single published post by slug.
 */
router.get(
  '/:slug',
  validate(slugParamSchema),
  asyncHandler(blogController.getPublicBySlug)
);

export default router;
