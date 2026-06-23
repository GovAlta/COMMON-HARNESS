import { pool } from '../config/database';
import type { AiConversationRecord, AiMessageRecord } from '../types/ai';

/**
 * Create a new AI conversation.
 */
export async function createConversation(
  userId: string,
  title: string = 'New Conversation'
): Promise<AiConversationRecord> {
  const result = await pool.query(
    `INSERT INTO ai_conversation (fk_ai_conversation_user_account, conversation_title, created_by)
     VALUES ($1, $2, $1)
     RETURNING *`,
    [userId, title]
  );
  return result.rows[0];
}

/**
 * Find a conversation by ID and user ID (ensures ownership).
 */
export async function findConversation(
  conversationId: string,
  userId: string
): Promise<AiConversationRecord | null> {
  const result = await pool.query(
    `SELECT * FROM ai_conversation
     WHERE pk_ai_conversation = $1 AND fk_ai_conversation_user_account = $2`,
    [conversationId, userId]
  );
  return result.rows[0] || null;
}

/**
 * Find all conversations for a user, most recent first.
 */
export async function findUserConversations(
  userId: string
): Promise<AiConversationRecord[]> {
  const result = await pool.query(
    `SELECT * FROM ai_conversation
     WHERE fk_ai_conversation_user_account = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Create a new message in a conversation.
 */
export async function createMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  options?: {
    modelName?: string;
    tokenCount?: number;
    imageUrl?: string;
  }
): Promise<AiMessageRecord> {
  const result = await pool.query(
    `INSERT INTO ai_message (
      fk_ai_message_ai_conversation,
      message_role,
      message_content,
      message_model_name,
      message_token_count,
      message_image_url
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      conversationId,
      role,
      content,
      options?.modelName || null,
      options?.tokenCount || 0,
      options?.imageUrl || null,
    ]
  );
  return result.rows[0];
}

/**
 * Find all messages for a conversation, ordered by creation time.
 */
export async function findMessages(
  conversationId: string
): Promise<AiMessageRecord[]> {
  const result = await pool.query(
    `SELECT * FROM ai_message
     WHERE fk_ai_message_ai_conversation = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );
  return result.rows;
}

/**
 * Count user messages sent in the last hour (for rate limiting).
 */
export async function countUserMessagesInLastHour(
  userId: string
): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM ai_message m
     JOIN ai_conversation c ON c.pk_ai_conversation = m.fk_ai_message_ai_conversation
     WHERE c.fk_ai_conversation_user_account = $1
       AND m.message_role = 'user'
       AND m.created_at > NOW() - INTERVAL '1 hour'`,
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Delete a conversation and all its messages.
 * Verifies ownership before deleting.
 */
export async function deleteConversation(
  conversationId: string,
  userId: string
): Promise<boolean> {
  // First verify ownership
  const conversation = await findConversation(conversationId, userId);
  if (!conversation) {
    return false;
  }

  // Delete messages first (foreign key constraint)
  await pool.query(
    `DELETE FROM ai_message WHERE fk_ai_message_ai_conversation = $1`,
    [conversationId]
  );

  // Delete conversation
  await pool.query(
    `DELETE FROM ai_conversation WHERE pk_ai_conversation = $1`,
    [conversationId]
  );

  return true;
}

/**
 * Update conversation title.
 */
export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  await pool.query(
    `UPDATE ai_conversation SET conversation_title = $2, updated_by = fk_ai_conversation_user_account
     WHERE pk_ai_conversation = $1`,
    [conversationId, title]
  );
}
