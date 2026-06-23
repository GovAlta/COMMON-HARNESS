import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before imports
vi.mock('../../config/database', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  },
}));

vi.mock('../../services/ai-providers/provider-factory', () => ({
  getAiProvider: vi.fn(),
}));

import { pool } from '../../config/database';
import { getAiProvider } from '../../services/ai-providers/provider-factory';
import * as aiService from '../../services/ai.service';

const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn> };
const mockGetProvider = getAiProvider as ReturnType<typeof vi.fn>;

const userId = '11111111-1111-1111-1111-111111111111';
const convId = '22222222-2222-2222-2222-222222222222';

const mockConversation = {
  pk_ai_conversation: convId,
  fk_ai_conversation_user_account: userId,
  conversation_title: 'New Conversation',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
};

const mockUserMessage = {
  pk_ai_message: '33333333-3333-3333-3333-333333333333',
  fk_ai_message_ai_conversation: convId,
  message_role: 'user',
  message_content: 'What services are available?',
  message_model_name: null,
  message_token_count: 0,
  created_at: '2024-01-15T10:00:00Z',
};

const mockAssistantMessage = {
  pk_ai_message: '44444444-4444-4444-4444-444444444444',
  fk_ai_message_ai_conversation: convId,
  message_role: 'assistant',
  message_content: 'The application offers many services...',
  message_model_name: 'openai',
  message_token_count: 0,
  created_at: '2024-01-15T10:00:01Z',
};

function createMockProvider(options?: { available?: boolean; response?: string }) {
  return {
    name: 'openai',
    isAvailable: vi.fn().mockReturnValue(options?.available ?? true),
    chat: vi.fn().mockResolvedValue(options?.response ?? 'The application offers many services...'),
    streamChat: vi.fn().mockImplementation(async (_msgs: any, _opts: any, onChunk: (chunk: string) => void) => {
      onChunk('Service ');
      onChunk('info ');
      onChunk('info.');
    }),
    analyzeImages: vi.fn().mockResolvedValue('This image shows a government building.'),
  };
}

describe('AI Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should return remaining count when under limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const result = await aiService.checkRateLimit(userId);
      expect(result.remaining).toBe(15);
    });

    it('should throw 429 when over 20 requests per hour', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '20' }] });

      await expect(aiService.checkRateLimit(userId)).rejects.toThrow('Rate limit exceeded');
    });

    it('should throw 429 when exactly at limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '20' }] });

      await expect(aiService.checkRateLimit(userId)).rejects.toMatchObject({
        statusCode: 429,
      });
    });
  });

  describe('chat', () => {
    it('should create conversation, store messages, and call provider', async () => {
      const provider = createMockProvider();
      mockGetProvider.mockReturnValue(provider);

      // Rate limit check
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      // Create conversation (no conversationId provided)
      mockPool.query.mockResolvedValueOnce({ rows: [mockConversation] });
      // Store user message
      mockPool.query.mockResolvedValueOnce({ rows: [mockUserMessage] });
      // Find messages for context
      mockPool.query.mockResolvedValueOnce({ rows: [mockUserMessage] });
      // Store assistant message
      mockPool.query.mockResolvedValueOnce({ rows: [mockAssistantMessage] });

      const result = await aiService.chat(userId, undefined, 'What services are available?');

      expect(result.conversation.pk_ai_conversation).toBe(convId);
      expect(result.userMessage.message_role).toBe('user');
      expect(result.assistantMessage.message_role).toBe('assistant');
      expect(result.rateLimitRemaining).toBe(17);
      expect(provider.chat).toHaveBeenCalled();
    });

    it('should use existing conversation when conversationId provided', async () => {
      const provider = createMockProvider();
      mockGetProvider.mockReturnValue(provider);

      // Rate limit check
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Find existing conversation
      mockPool.query.mockResolvedValueOnce({ rows: [mockConversation] });
      // Store user message
      mockPool.query.mockResolvedValueOnce({ rows: [mockUserMessage] });
      // Find messages for context
      mockPool.query.mockResolvedValueOnce({ rows: [mockUserMessage, { ...mockUserMessage, pk_ai_message: 'prev' }] });
      // Store assistant message
      mockPool.query.mockResolvedValueOnce({ rows: [mockAssistantMessage] });

      const result = await aiService.chat(userId, convId, 'Follow up question');

      expect(result.conversation.pk_ai_conversation).toBe(convId);
      expect(result.rateLimitRemaining).toBe(19);
    });

    it('should return fallback message when provider unavailable', async () => {
      const provider = createMockProvider({ available: false });
      mockGetProvider.mockReturnValue(provider);

      // Rate limit check
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Create conversation
      mockPool.query.mockResolvedValueOnce({ rows: [mockConversation] });
      // Store user message
      mockPool.query.mockResolvedValueOnce({ rows: [mockUserMessage] });
      // Find messages for context
      mockPool.query.mockResolvedValueOnce({ rows: [mockUserMessage] });
      // Store fallback message
      mockPool.query.mockResolvedValueOnce({
        rows: [{ ...mockAssistantMessage, message_content: 'AI assistant is temporarily unavailable', message_model_name: 'fallback' }],
      });

      const result = await aiService.chat(userId, undefined, 'Hello');

      expect(result.assistantMessage.message_model_name).toBe('fallback');
      expect(provider.chat).not.toHaveBeenCalled();
    });
  });

  describe('streamChat', () => {
    it('should stream chat response via onChunk callback', async () => {
      const provider = createMockProvider();
      mockGetProvider.mockReturnValue(provider);

      // Rate limit check
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Create conversation
      mockPool.query.mockResolvedValueOnce({ rows: [mockConversation] });
      // Store user message
      mockPool.query.mockResolvedValueOnce({ rows: [mockUserMessage] });
      // Find messages for context
      mockPool.query.mockResolvedValueOnce({ rows: [mockUserMessage] });
      // Store assistant response
      mockPool.query.mockResolvedValueOnce({ rows: [mockAssistantMessage] });

      const chunks: string[] = [];
      const result = await aiService.streamChat(userId, undefined, 'Hello', (chunk) => {
        chunks.push(chunk);
      });

      expect(chunks).toEqual(['Service ', 'info ', 'info.']);
      expect(result.conversationId).toBe(convId);
      expect(result.rateLimitRemaining).toBe(19);
    });
  });

  describe('analyzeImages', () => {
    it('should analyze images and store messages', async () => {
      const provider = createMockProvider();
      mockGetProvider.mockReturnValue(provider);

      // Rate limit check
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      // Create conversation
      mockPool.query.mockResolvedValueOnce({ rows: [mockConversation] });
      // Store user image message
      mockPool.query.mockResolvedValueOnce({
        rows: [{ ...mockUserMessage, message_content: 'Image uploaded for analysis', message_image_url: 'data:image/jpeg;base64,...' }],
      });
      // Store assistant analysis message
      mockPool.query.mockResolvedValueOnce({
        rows: [{ ...mockAssistantMessage, message_content: 'This image shows a government building.' }],
      });

      const imageBuffer = Buffer.from('fake-image-data');
      const result = await aiService.analyzeImages(userId, undefined, [{ buffer: imageBuffer, mimeType: 'image/jpeg' }]);

      expect(result.assistantMessage.message_content).toBe('This image shows a government building.');
      expect(provider.analyzeImages).toHaveBeenCalled();
      expect(result.rateLimitRemaining).toBe(16);
    });
  });

  describe('getConversationMessages', () => {
    it('should return messages for owned conversation', async () => {
      // Find conversation (ownership check)
      mockPool.query.mockResolvedValueOnce({ rows: [mockConversation] });
      // Find messages
      mockPool.query.mockResolvedValueOnce({ rows: [mockUserMessage, mockAssistantMessage] });

      const messages = await aiService.getConversationMessages(convId, userId);
      expect(messages).toHaveLength(2);
    });

    it('should throw 404 for non-existent conversation', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        aiService.getConversationMessages('non-existent', userId)
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
