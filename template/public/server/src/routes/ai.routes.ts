import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../utils/async-handler';
import { authenticate } from '../middleware/authenticate';
import { csrf } from '../middleware/csrf';
import { validate } from '../middleware/validate';
import { aiRateLimiter } from '../middleware/rate-limit';
import { chatMessageSchema, conversationIdSchema } from '../validators/ai.validator';
import * as aiController from '../controllers/ai.controller';

// Configure multer for image uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
});

const router = Router();

/**
 * POST /api/ai/chat — REST fallback for AI chat.
 * Requires authentication + CSRF + rate limit.
 */
router.post(
  '/chat',
  authenticate,
  csrf,
  aiRateLimiter,
  validate({ body: chatMessageSchema }),
  asyncHandler(aiController.chat)
);

/**
 * POST /api/ai/analyze-image — Image analysis.
 * Requires authentication + CSRF + rate limit + multer.
 */
router.post(
  '/analyze-image',
  authenticate,
  csrf,
  aiRateLimiter,
  upload.single('image'),
  asyncHandler(aiController.analyzeImage)
);

/**
 * GET /api/ai/conversations — List user's conversations.
 * Requires authentication.
 */
router.get(
  '/conversations',
  authenticate,
  asyncHandler(aiController.listConversations)
);

/**
 * DELETE /api/ai/conversations/:conversationId — Delete a conversation.
 * Requires authentication.
 */
router.delete(
  '/conversations/:conversationId',
  authenticate,
  csrf,
  validate({ params: conversationIdSchema }),
  asyncHandler(aiController.deleteConversation)
);

/**
 * POST /api/ai/conversations/:conversationId/generate-title — Generate AI title.
 * Requires authentication + rate limit. Each call triggers a full LLM round-trip;
 * without aiRateLimiter the only protection was the global apiRateLimiter
 * (200 / 15 min), which translates to ~800 LLM calls/hour per authenticated
 * user — direct cost-abuse vector. Redteam finding RT-AI-001.
 */
router.post(
  '/conversations/:conversationId/generate-title',
  authenticate,
  aiRateLimiter,
  csrf,
  validate({ params: conversationIdSchema }),
  asyncHandler(aiController.generateTitle)
);

/**
 * GET /api/ai/conversations/:conversationId/messages — Get conversation messages.
 * Requires authentication.
 */
router.get(
  '/conversations/:conversationId/messages',
  authenticate,
  validate({ params: conversationIdSchema }),
  asyncHandler(aiController.getConversationMessages)
);

export default router;
