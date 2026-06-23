import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middleware/authenticate';
import { csrf } from '../middleware/csrf';
import * as fileController from '../controllers/file.controller';

// Configure multer for memory storage (buffer)
// Max file size: 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
});

const router = Router();

/**
 * POST /api/files/upload
 * Authenticated + CSRF — upload a file.
 * Accepts multipart/form-data.
 */
router.post(
  '/upload',
  authenticate,
  csrf,
  upload.single('file'),
  asyncHandler(fileController.uploadFile)
);

/**
 * GET /api/files
 * Authenticated — list the current user's uploaded files (paginated).
 */
router.get(
  '/',
  authenticate,
  asyncHandler(fileController.listMyFiles)
);

/**
 * GET /api/files/:id
 * Authenticated — download a file. Authorization checked in the service:
 * uploader can fetch their own files, admins can fetch anyone's.
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(fileController.downloadFile)
);

export default router;
