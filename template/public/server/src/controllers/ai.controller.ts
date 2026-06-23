import { Request, Response } from 'express';
import * as aiService from '../services/ai.service';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/app-error';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * POST /api/ai/chat — REST fallback for AI chat.
 * Accepts { conversationId?, content } in body.
 * Returns complete (non-streaming) response.
 */
export async function chat(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { conversationId, content } = req.body;

  const result = await aiService.chat(userId, conversationId, content);

  sendSuccess(res, {
    conversationId: result.conversation.pk_ai_conversation,
    conversationTitle: result.conversation.conversation_title,
    userMessage: {
      id: result.userMessage.pk_ai_message,
      role: result.userMessage.message_role,
      content: result.userMessage.message_content,
      createdAt: result.userMessage.created_at,
    },
    assistantMessage: {
      id: result.assistantMessage.pk_ai_message,
      role: result.assistantMessage.message_role,
      content: result.assistantMessage.message_content,
      modelName: result.assistantMessage.message_model_name,
      createdAt: result.assistantMessage.created_at,
    },
    rateLimitRemaining: result.rateLimitRemaining,
  });
}

/**
 * POST /api/ai/analyze-image — REST fallback for image analysis.
 * Accepts multipart/form-data with image file + optional conversationId.
 */
export async function analyzeImage(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const file = req.file;

  if (!file) {
    throw AppError.validation([{ field: 'image', message: 'Image file is required' }]);
  }

  // Validate image type
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    throw AppError.validation([
      { field: 'image', message: 'Only JPEG, PNG, and WEBP images are allowed' },
    ]);
  }

  // Validate file size (10MB max)
  if (file.size > 10 * 1024 * 1024) {
    throw AppError.validation([
      { field: 'image', message: 'Image file must be 10MB or smaller' },
    ]);
  }

  const conversationId = req.body.conversationId || undefined;

  const result = await aiService.analyzeImages(
    userId,
    conversationId,
    [{ buffer: file.buffer, mimeType: file.mimetype }]
  );

  sendSuccess(res, {
    conversationId: result.conversation.pk_ai_conversation,
    userMessage: {
      id: result.userMessage.pk_ai_message,
      role: result.userMessage.message_role,
      content: result.userMessage.message_content,
      imageUrl: result.userMessage.message_image_url,
      createdAt: result.userMessage.created_at,
    },
    assistantMessage: {
      id: result.assistantMessage.pk_ai_message,
      role: result.assistantMessage.message_role,
      content: result.assistantMessage.message_content,
      modelName: result.assistantMessage.message_model_name,
      createdAt: result.assistantMessage.created_at,
    },
    rateLimitRemaining: result.rateLimitRemaining,
  });
}

/**
 * DELETE /api/ai/conversations/:conversationId — delete a conversation.
 */
export async function deleteConversation(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { conversationId } = req.params;

  const deleted = await aiService.deleteConversation(conversationId as string, userId);

  if (!deleted) {
    throw AppError.notFound('Conversation not found');
  }

  sendSuccess(res, { deleted: true });
}

/**
 * POST /api/ai/conversations/:conversationId/generate-title
 * Uses the AI to generate a short title from the conversation messages.
 */
export async function generateTitle(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { conversationId } = req.params;

  const title = await aiService.generateConversationTitle(conversationId as string, userId);
  sendSuccess(res, { title });
}

/**
 * GET /api/ai/conversations — list user's conversations.
 */
export async function listConversations(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const conversations = await aiService.getUserConversations(userId);

  sendSuccess(res, conversations.map((c) => ({
    id: c.pk_ai_conversation,
    title: c.conversation_title,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  })));
}

/**
 * GET /api/ai/conversations/:conversationId/messages — get messages for a conversation.
 */
export async function getConversationMessages(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { conversationId } = req.params;

  const messages = await aiService.getConversationMessages(conversationId as string, userId);

  sendSuccess(res, messages.map((m) => ({
    id: m.pk_ai_message,
    conversationId: m.fk_ai_message_ai_conversation,
    role: m.message_role,
    content: m.message_content,
    modelName: m.message_model_name,
    tokenCount: m.message_token_count,
    imageUrl: m.message_image_url,
    createdAt: m.created_at,
  })));
}
