import { z } from 'zod';

/**
 * Schema for chat message requests (REST fallback).
 */
export const chatMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  content: z
    .string()
    .min(1, 'Message content is required')
    .max(4000, 'Message content must be 4000 characters or less'),
});

/**
 * Schema for image analysis requests.
 */
export const analyzeImageSchema = z.object({
  conversationId: z.string().uuid().optional(),
});

/**
 * Schema for conversation ID parameter.
 */
export const conversationIdSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID'),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type AnalyzeImageInput = z.infer<typeof analyzeImageSchema>;
