/**
 * AI conversation record from the database.
 */
export interface AiConversationRecord {
  pk_ai_conversation: string;
  fk_ai_conversation_user_account: string;
  conversation_title: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/**
 * AI message record from the database.
 */
export interface AiMessageRecord {
  pk_ai_message: string;
  fk_ai_message_ai_conversation: string;
  message_role: 'user' | 'assistant' | 'system';
  message_content: string;
  message_model_name: string | null;
  message_token_count: number;
  message_image_url: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * AI chat message for provider calls.
 */
export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUrl?: string;
}

/**
 * Options for AI provider calls.
 */
export interface AiProviderOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Callback for streaming chunks.
 */
export type OnChunkCallback = (chunk: string) => void;
