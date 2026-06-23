import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock modules before imports
vi.mock('../../config/database', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  },
}));

vi.mock('../../config/auth', () => ({
  configurePassport: vi.fn(),
  isGoogleConfigured: vi.fn().mockReturnValue(false),
  isMicrosoftConfigured: vi.fn().mockReturnValue(false),
  getMicrosoftConfig: vi.fn().mockReturnValue({ enabled: false }),
}));

vi.mock('passport', () => {
  const mockPassport = {
    initialize: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
    authenticate: vi.fn(),
    use: vi.fn(),
    serializeUser: vi.fn(),
    deserializeUser: vi.fn(),
  };
  return { default: mockPassport };
});

vi.mock('../../sse/notification-stream', () => ({
  notificationStreamManager: {
    addClient: vi.fn(),
    removeClient: vi.fn(),
    sendToUser: vi.fn(),
    sendToUsers: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
    getClientCount: vi.fn().mockReturnValue(0),
    disconnectAll: vi.fn(),
  },
}));

vi.mock('../../services/ai.service', () => ({
  chat: vi.fn(),
  analyzeImage: vi.fn(),
  getUserConversations: vi.fn(),
  getConversationMessages: vi.fn(),
}));

import * as aiService from '../../services/ai.service';
import * as aiController from '../../controllers/ai.controller';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { chatMessageSchema, conversationIdSchema } from '../../validators/ai.validator';
import { errorHandler } from '../../middleware/error-handler';

const mockAiService = aiService as unknown as {
  chat: ReturnType<typeof vi.fn>;
  analyzeImage: ReturnType<typeof vi.fn>;
  getUserConversations: ReturnType<typeof vi.fn>;
  getConversationMessages: ReturnType<typeof vi.fn>;
};

const mockUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'test@example.com',
  role: 'user',
  displayName: 'Test User',
};

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Inject mock user
  app.use((req, _res, next) => {
    req.user = mockUser as any;
    next();
  });

  app.post(
    '/api/ai/chat',
    validate({ body: chatMessageSchema }),
    asyncHandler(aiController.chat)
  );

  app.post(
    '/api/ai/analyze-image',
    asyncHandler(aiController.analyzeImage)
  );

  app.get(
    '/api/ai/conversations',
    asyncHandler(aiController.listConversations)
  );

  app.get(
    '/api/ai/conversations/:conversationId/messages',
    validate({ params: conversationIdSchema }),
    asyncHandler(aiController.getConversationMessages)
  );

  app.use(errorHandler);
  return app;
}

describe('AI Controller', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('POST /api/ai/chat', () => {
    it('should return AI response for valid chat message', async () => {
      mockAiService.chat.mockResolvedValue({
        conversation: { pk_ai_conversation: 'conv-1', conversation_title: 'Test' },
        userMessage: {
          pk_ai_message: 'msg-1',
          message_role: 'user',
          message_content: 'Hello',
          created_at: '2024-01-15T10:00:00Z',
        },
        assistantMessage: {
          pk_ai_message: 'msg-2',
          message_role: 'assistant',
          message_content: 'Hello! How can I help?',
          message_model_name: 'gpt-4o-mini',
          created_at: '2024-01-15T10:00:01Z',
        },
        rateLimitRemaining: 19,
      });

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ content: 'Hello' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.conversationId).toBe('conv-1');
      expect(res.body.data.assistantMessage.content).toBe('Hello! How can I help?');
      expect(res.body.data.rateLimitRemaining).toBe(19);
      expect(mockAiService.chat).toHaveBeenCalledWith(
        mockUser.id,
        undefined,
        'Hello'
      );
    });

    it('should accept conversationId in request body', async () => {
      mockAiService.chat.mockResolvedValue({
        conversation: { pk_ai_conversation: 'conv-1', conversation_title: 'Test' },
        userMessage: { pk_ai_message: 'msg-1', message_role: 'user', message_content: 'Hi', created_at: '2024-01-15T10:00:00Z' },
        assistantMessage: { pk_ai_message: 'msg-2', message_role: 'assistant', message_content: 'Hi!', message_model_name: 'gpt-4o-mini', created_at: '2024-01-15T10:00:01Z' },
        rateLimitRemaining: 18,
      });

      const convId = '22222222-2222-2222-2222-222222222222';
      await request(app)
        .post('/api/ai/chat')
        .send({ conversationId: convId, content: 'Hi' })
        .expect(200);

      expect(mockAiService.chat).toHaveBeenCalledWith(mockUser.id, convId, 'Hi');
    });

    it('should reject empty content with 422', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({ content: '' })
        .expect(422);

      expect(res.body.success).toBe(false);
    });

    it('should reject missing content with 422', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({})
        .expect(422);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/ai/conversations', () => {
    it('should list user conversations', async () => {
      mockAiService.getUserConversations.mockResolvedValue([
        {
          pk_ai_conversation: 'conv-1',
          conversation_title: 'Service Inquiry',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:05:00Z',
        },
      ]);

      const res = await request(app)
        .get('/api/ai/conversations')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('conv-1');
      expect(res.body.data[0].title).toBe('Service Inquiry');
    });
  });

  describe('GET /api/ai/conversations/:conversationId/messages', () => {
    it('should return messages for a conversation', async () => {
      const convId = '22222222-2222-2222-2222-222222222222';

      mockAiService.getConversationMessages.mockResolvedValue([
        {
          pk_ai_message: 'msg-1',
          fk_ai_message_ai_conversation: convId,
          message_role: 'user',
          message_content: 'Hello',
          message_model_name: null,
          message_token_count: 0,
          message_image_url: null,
          created_at: '2024-01-15T10:00:00Z',
        },
      ]);

      const res = await request(app)
        .get(`/api/ai/conversations/${convId}/messages`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].role).toBe('user');
    });

    it('should reject invalid conversation ID with 422', async () => {
      const res = await request(app)
        .get('/api/ai/conversations/not-a-uuid/messages')
        .expect(422);

      expect(res.body.success).toBe(false);
    });
  });
});
