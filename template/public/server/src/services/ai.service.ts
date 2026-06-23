import * as aiModel from '../models/ai.model';
import { getAiProvider } from './ai-providers/provider-factory';
import { AppError } from '../utils/app-error';
import type { AiChatMessage, OnChunkCallback, AiConversationRecord, AiMessageRecord } from '../types/ai';
import logger from '../utils/logger';
import { logAuditEvent } from '../utils/audit-logger';
import { redactConversation } from './redactor';

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = '1 hour';

/**
 * Check rate limit for a user (20 requests per hour).
 * Throws 429 if limit exceeded.
 */
export async function checkRateLimit(userId: string): Promise<{ remaining: number }> {
  const count = await aiModel.countUserMessagesInLastHour(userId);
  const remaining = Math.max(0, RATE_LIMIT_MAX - count);

  if (count >= RATE_LIMIT_MAX) {
    throw AppError.tooManyRequests(
      `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW}. Try again later.`
    );
  }

  return { remaining };
}

/**
 * Get or create a conversation for a user.
 */
export async function getOrCreateConversation(
  userId: string,
  conversationId?: string
): Promise<AiConversationRecord> {
  if (conversationId) {
    const conversation = await aiModel.findConversation(conversationId, userId);
    if (!conversation) {
      throw AppError.notFound('Conversation not found');
    }
    return conversation;
  }

  return await aiModel.createConversation(userId);
}

/**
 * Get conversation history as chat messages (for providing context to AI).
 */
export async function getConversationHistory(
  conversationId: string,
  userId: string
): Promise<AiChatMessage[]> {
  // Verify ownership
  const conversation = await aiModel.findConversation(conversationId, userId);
  if (!conversation) {
    throw AppError.notFound('Conversation not found');
  }

  const messages = await aiModel.findMessages(conversationId);

  return messages.map((m) => ({
    role: m.message_role,
    content: m.message_content,
    imageUrl: m.message_image_url || undefined,
  }));
}

/**
 * Non-streaming chat: sends message, gets complete response.
 */
export async function chat(
  userId: string,
  conversationId: string | undefined,
  content: string
): Promise<{
  conversation: AiConversationRecord;
  userMessage: AiMessageRecord;
  assistantMessage: AiMessageRecord;
  rateLimitRemaining: number;
}> {
  // Check rate limit
  const { remaining } = await checkRateLimit(userId);

  // Get or create conversation
  const conversation = await getOrCreateConversation(userId, conversationId);

  // Store user message
  const userMessage = await aiModel.createMessage(
    conversation.pk_ai_conversation,
    'user',
    content
  );

  // Build conversation context
  const history = await aiModel.findMessages(conversation.pk_ai_conversation);
  const contextMessages: AiChatMessage[] = history.map((m) => ({
    role: m.message_role,
    content: m.message_content,
  }));

  // Call AI provider
  const provider = getAiProvider();

  if (!provider.isAvailable()) {
    // Store fallback message
    const fallbackMessage = await aiModel.createMessage(
      conversation.pk_ai_conversation,
      'assistant',
      'I apologize, but the AI assistant is temporarily unavailable. Please try again later or call 911 for emergencies.',
      { modelName: 'fallback' }
    );

    return {
      conversation,
      userMessage,
      assistantMessage: fallbackMessage,
      rateLimitRemaining: remaining - 1,
    };
  }

  try {
    const response = await provider.chat(redactConversation(contextMessages));

    // Store assistant message
    const assistantMessage = await aiModel.createMessage(
      conversation.pk_ai_conversation,
      'assistant',
      response,
      { modelName: provider.name }
    );

    await logAuditEvent({
      action: 'AI_CHAT',
      tableName: 'ai_conversation',
      recordId: conversation.pk_ai_conversation,
      userId,
      metadata: { model: provider.name, messageLength: content.length },
    });

    return {
      conversation,
      userMessage,
      assistantMessage,
      rateLimitRemaining: remaining - 1,
    };
  } catch (error) {
    // Log the actual error so we can diagnose provider issues
    logger.error('AI chat error', { error: error instanceof Error ? error.message : error });

    const errorMessage = await aiModel.createMessage(
      conversation.pk_ai_conversation,
      'assistant',
      'I encountered an error processing your request. Please try again later.',
      { modelName: 'error' }
    );

    return {
      conversation,
      userMessage,
      assistantMessage: errorMessage,
      rateLimitRemaining: remaining - 1,
    };
  }
}

/**
 * Streaming chat: sends message, streams response token by token.
 */
export async function streamChat(
  userId: string,
  conversationId: string | undefined,
  content: string,
  onChunk: OnChunkCallback
): Promise<{
  conversationId: string;
  rateLimitRemaining: number;
}> {
  const { remaining } = await checkRateLimit(userId);
  const conversation = await getOrCreateConversation(userId, conversationId);

  // Store user message
  await aiModel.createMessage(conversation.pk_ai_conversation, 'user', content);

  // Build context
  const history = await aiModel.findMessages(conversation.pk_ai_conversation);
  const contextMessages: AiChatMessage[] = history.map((m) => ({
    role: m.message_role,
    content: m.message_content,
  }));

  const provider = getAiProvider();

  if (!provider.isAvailable()) {
    const fallback = 'I apologize, but the AI assistant is temporarily unavailable. Please try again later or call 911 for emergencies.';
    onChunk(fallback);
    await aiModel.createMessage(
      conversation.pk_ai_conversation,
      'assistant',
      fallback,
      { modelName: 'fallback' }
    );
    return { conversationId: conversation.pk_ai_conversation, rateLimitRemaining: remaining - 1 };
  }

  let fullResponse = '';

  try {
    await provider.streamChat(redactConversation(contextMessages), undefined, (chunk) => {
      fullResponse += chunk;
      onChunk(chunk);
    });

    // Store complete response
    await aiModel.createMessage(
      conversation.pk_ai_conversation,
      'assistant',
      fullResponse,
      { modelName: provider.name }
    );

    await logAuditEvent({
      action: 'AI_CHAT',
      tableName: 'ai_conversation',
      recordId: conversation.pk_ai_conversation,
      userId,
      metadata: { model: provider.name, messageLength: content.length },
    });

    // Title generation is handled by the client calling /generate-title in the background
  } catch (error) {
    logger.error('AI stream chat error', { error: error instanceof Error ? error.message : error });

    const errMsg = 'I encountered an error processing your request. Please try again later.';
    onChunk(errMsg);
    await aiModel.createMessage(
      conversation.pk_ai_conversation,
      'assistant',
      fullResponse || errMsg,
      { modelName: 'error' }
    );
  }

  return { conversationId: conversation.pk_ai_conversation, rateLimitRemaining: remaining - 1 };
}

/**
 * Non-streaming multi-image analysis.
 */
export async function analyzeImages(
  userId: string,
  conversationId: string | undefined,
  images: Array<{ buffer: Buffer; mimeType: string }>,
  prompt?: string
): Promise<{
  conversation: AiConversationRecord;
  userMessage: AiMessageRecord;
  assistantMessage: AiMessageRecord;
  rateLimitRemaining: number;
}> {
  const { remaining } = await checkRateLimit(userId);
  const conversation = await getOrCreateConversation(userId, conversationId);

  // Store user image message (use first image as representative URL)
  const base64Url = `data:${images[0].mimeType};base64,${images[0].buffer.toString('base64')}`;
  const contentText = prompt
    ? `Image${images.length > 1 ? 's' : ''} uploaded for analysis: ${prompt}`
    : `${images.length} image${images.length > 1 ? 's' : ''} uploaded for analysis`;

  const userMessage = await aiModel.createMessage(
    conversation.pk_ai_conversation,
    'user',
    contentText,
    { imageUrl: base64Url }
  );

  const provider = getAiProvider();

  if (!provider.isAvailable()) {
    const fallbackMessage = await aiModel.createMessage(
      conversation.pk_ai_conversation,
      'assistant',
      'I apologize, but image analysis is temporarily unavailable. Please try again later.',
      { modelName: 'fallback' }
    );
    return { conversation, userMessage, assistantMessage: fallbackMessage, rateLimitRemaining: remaining - 1 };
  }

  const defaultPrompt = prompt || 'Analyze these images and provide helpful information about what you see.';

  try {
    const analysis = await provider.analyzeImages(images, defaultPrompt);

    const assistantMessage = await aiModel.createMessage(
      conversation.pk_ai_conversation,
      'assistant',
      analysis,
      { modelName: provider.name }
    );

    await logAuditEvent({
      action: 'AI_IMAGE',
      tableName: 'ai_conversation',
      recordId: conversation.pk_ai_conversation,
      userId,
      metadata: { model: provider.name, imageCount: images.length },
    });

    return { conversation, userMessage, assistantMessage, rateLimitRemaining: remaining - 1 };
  } catch (error) {
    const errorMessage = await aiModel.createMessage(
      conversation.pk_ai_conversation,
      'assistant',
      'I encountered an error analyzing the image. Please try again later.',
      { modelName: 'error' }
    );

    return { conversation, userMessage, assistantMessage: errorMessage, rateLimitRemaining: remaining - 1 };
  }
}

/**
 * Streaming multi-image analysis.
 */
export async function streamImagesAnalysis(
  userId: string,
  conversationId: string | undefined,
  images: Array<{ buffer: Buffer; mimeType: string }>,
  prompt: string | undefined,
  onChunk: OnChunkCallback
): Promise<{
  conversationId: string;
  rateLimitRemaining: number;
}> {
  const { remaining } = await checkRateLimit(userId);
  const conversation = await getOrCreateConversation(userId, conversationId);

  const base64Url = `data:${images[0].mimeType};base64,${images[0].buffer.toString('base64')}`;
  const contentText = prompt
    ? `Image${images.length > 1 ? 's' : ''} uploaded for analysis: ${prompt}`
    : `${images.length} image${images.length > 1 ? 's' : ''} uploaded for analysis`;

  await aiModel.createMessage(
    conversation.pk_ai_conversation,
    'user',
    contentText,
    { imageUrl: base64Url }
  );

  const provider = getAiProvider();

  if (!provider.isAvailable()) {
    const fallback = 'Image analysis is temporarily unavailable. Please try again later.';
    onChunk(fallback);
    await aiModel.createMessage(conversation.pk_ai_conversation, 'assistant', fallback, { modelName: 'fallback' });
    return { conversationId: conversation.pk_ai_conversation, rateLimitRemaining: remaining - 1 };
  }

  const defaultPrompt = prompt || 'Analyze these images and provide helpful information about what you see.';
  let fullResponse = '';

  try {
    await provider.analyzeImages(images, defaultPrompt, (chunk) => {
      fullResponse += chunk;
      onChunk(chunk);
    });

    await aiModel.createMessage(
      conversation.pk_ai_conversation,
      'assistant',
      fullResponse,
      { modelName: provider.name }
    );

    await logAuditEvent({
      action: 'AI_IMAGE',
      tableName: 'ai_conversation',
      recordId: conversation.pk_ai_conversation,
      userId,
      metadata: { model: provider.name, imageCount: images.length },
    });
  } catch (error) {
    const errMsg = 'Error analyzing image. Please try again later.';
    onChunk(errMsg);
    await aiModel.createMessage(conversation.pk_ai_conversation, 'assistant', fullResponse || errMsg, { modelName: 'error' });
  }

  return { conversationId: conversation.pk_ai_conversation, rateLimitRemaining: remaining - 1 };
}

/**
 * Generate a short descriptive title for a conversation using the AI.
 * Reads the first few messages and asks the AI to summarize in 5-8 words.
 */
export async function generateConversationTitle(
  conversationId: string,
  userId: string
): Promise<string> {
  // Enforce the same per-user DB-backed quota as every other LLM round-trip
  // (chat / vision / streaming). Without this, /generate-title was the only
  // path that could call the LLM without consuming a token bucket entry.
  // Redteam RT-AI-001 cost-abuse vector.
  await checkRateLimit(userId);

  // Verify ownership
  const conversation = await aiModel.findConversation(conversationId, userId);
  if (!conversation) {
    throw AppError.notFound('Conversation not found');
  }

  // Get the first messages for context
  const allMessages = await aiModel.findMessages(conversationId);
  if (allMessages.length === 0) {
    return 'New Conversation';
  }

  // Take the first few messages (up to 5) to generate a title
  const contextMessages = allMessages.slice(0, 5);
  const summary = contextMessages
    .map((m) => `${m.message_role}: ${m.message_content.slice(0, 200)}`)
    .join('\n');

  const provider = getAiProvider();
  if (!provider.isAvailable()) {
    // Fallback: use first user message truncated
    const firstUserMsg = allMessages.find((m) => m.message_role === 'user');
    const fallback = firstUserMsg?.message_content || 'New Conversation';
    await aiModel.updateConversationTitle(conversationId, fallback);
    return fallback;
  }

  try {
    const titlePrompt: AiChatMessage[] = [
      {
        role: 'user',
        content: `Generate a short title (5-8 words max) for this conversation. Return ONLY the title, nothing else.\n\nConversation:\n${summary}`,
      },
    ];

    const title = (await provider.chat(titlePrompt, { maxTokens: 512 })).trim().replace(/^["']|["']$/g, '');
    const cleanTitle = title;

    await aiModel.updateConversationTitle(conversationId, cleanTitle);
    return cleanTitle;
  } catch (error) {
    logger.error('AI title generation error', { error: error instanceof Error ? error.message : error });
    // Fallback
    const firstUserMsg = allMessages.find((m) => m.message_role === 'user');
    const fallback = firstUserMsg?.message_content || 'New Conversation';
    await aiModel.updateConversationTitle(conversationId, fallback);
    return fallback;
  }
}

/**
 * Delete a conversation (with ownership check).
 */
export async function deleteConversation(
  conversationId: string,
  userId: string
): Promise<boolean> {
  return aiModel.deleteConversation(conversationId, userId);
}

/**
 * Get user's conversations.
 */
export async function getUserConversations(userId: string): Promise<AiConversationRecord[]> {
  return aiModel.findUserConversations(userId);
}

/**
 * Get messages for a conversation (with ownership check).
 */
export async function getConversationMessages(
  conversationId: string,
  userId: string
): Promise<AiMessageRecord[]> {
  const conversation = await aiModel.findConversation(conversationId, userId);
  if (!conversation) {
    throw AppError.notFound('Conversation not found');
  }
  return aiModel.findMessages(conversationId);
}
