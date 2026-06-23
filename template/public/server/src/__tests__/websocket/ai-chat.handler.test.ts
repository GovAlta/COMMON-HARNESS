import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock token verification
vi.mock('../../utils/token', () => ({
  verifyAccessToken: vi.fn(),
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  hashToken: vi.fn(),
  generateRandomToken: vi.fn(),
  generateCsrfToken: vi.fn(),
}));

vi.mock('../../config/database', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  },
}));

vi.mock('../../services/ai.service', () => ({
  streamChat: vi.fn(),
  streamImagesAnalysis: vi.fn(),
  checkRateLimit: vi.fn(),
}));

import { verifyAccessToken } from '../../utils/token';
import * as aiService from '../../services/ai.service';
import { registerAiChatHandler } from '../../websocket/ai-chat.handler';
import { env } from '../../config/environment';

const mockVerifyToken = verifyAccessToken as ReturnType<typeof vi.fn>;
const mockStreamChat = aiService.streamChat as ReturnType<typeof vi.fn>;
const mockStreamImage = aiService.streamImagesAnalysis as ReturnType<typeof vi.fn>;

const userId = '11111111-1111-1111-1111-111111111111';
const convId = '22222222-2222-2222-2222-222222222222';

// Simple mock for Socket.io server namespace
class MockNamespace extends EventEmitter {
  middlewares: Array<(socket: any, next: (err?: Error) => void) => void> = [];

  use(fn: (socket: any, next: (err?: Error) => void) => void): void {
    this.middlewares.push(fn);
  }

  async simulateConnection(socket: MockSocket): Promise<void> {
    // Run middleware chain
    for (const middleware of this.middlewares) {
      await new Promise<void>((resolve, reject) => {
        middleware(socket, (err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    this.emit('connection', socket);
  }
}

class MockSocket extends EventEmitter {
  userId?: string;
  userEmail?: string;
  handshake: any;
  emitted: Array<{ event: string; data: any }> = [];

  constructor(cookies: string = '', origin?: string) {
    super();
    this.handshake = {
      headers: { cookie: cookies, ...(origin !== undefined ? { origin } : {}) },
    };
  }

  emit(event: string, ...args: any[]): boolean {
    if (event !== 'newListener' && event !== 'removeListener') {
      this.emitted.push({ event, data: args[0] });
    }
    return super.emit(event, ...args);
  }
}

class MockIO {
  namespaces: Record<string, MockNamespace> = {};

  of(namespace: string): MockNamespace {
    if (!this.namespaces[namespace]) {
      this.namespaces[namespace] = new MockNamespace();
    }
    return this.namespaces[namespace];
  }
}

describe('AI Chat WebSocket Handler', () => {
  let io: MockIO;
  let aiNamespace: MockNamespace;

  beforeEach(() => {
    vi.clearAllMocks();
    io = new MockIO();
    registerAiChatHandler(io as any);
    aiNamespace = io.namespaces['/ai'];
  });

  describe('authentication middleware', () => {
    it('should authenticate user with valid JWT cookie', async () => {
      mockVerifyToken.mockReturnValue({ sub: userId, email: 'test@example.com', role: 'user' });
      const socket = new MockSocket(`access_token=valid-jwt-token`);

      await aiNamespace.simulateConnection(socket);

      expect(socket.userId).toBe(userId);
      expect(socket.userEmail).toBe('test@example.com');
    });

    it('should reject connection without cookie', async () => {
      const socket = new MockSocket('');

      await expect(aiNamespace.simulateConnection(socket)).rejects.toThrow('Authentication required');
    });

    it('should reject connection with invalid JWT', async () => {
      mockVerifyToken.mockImplementation(() => { throw new Error('Invalid token'); });
      const socket = new MockSocket('access_token=invalid-token');

      await expect(aiNamespace.simulateConnection(socket)).rejects.toThrow('Invalid token');
    });

    it('should reject connection from disallowed origin', async () => {
      mockVerifyToken.mockReturnValue({ sub: userId, email: 'test@example.com', role: 'user' });
      const socket = new MockSocket('access_token=valid-jwt', 'https://evil.com');

      await expect(aiNamespace.simulateConnection(socket)).rejects.toThrow('Origin not allowed');
    });

    it('should allow connection from the configured CORS_ORIGIN', async () => {
      mockVerifyToken.mockReturnValue({ sub: userId, email: 'test@example.com', role: 'user' });
      // CORS_ORIGIN in test-setup.ts is 'http://localhost:5173'
      const socket = new MockSocket('access_token=valid-jwt', 'http://localhost:5173');

      await aiNamespace.simulateConnection(socket);
      expect(socket.userId).toBe(userId);
    });

    it('should allow connection when no origin header is present (server-to-server)', async () => {
      mockVerifyToken.mockReturnValue({ sub: userId, email: 'test@example.com', role: 'user' });
      const socket = new MockSocket('access_token=valid-jwt');
      // handshake.headers.origin is undefined

      await aiNamespace.simulateConnection(socket);
      expect(socket.userId).toBe(userId);
    });

    it('should allow any origin in a comma-separated CORS_ORIGIN list', async () => {
      const originalCorsOrigin = env.CORS_ORIGIN;
      try {
        (env as any).CORS_ORIGIN = 'https://app.gov.ab.ca, https://admin.gov.ab.ca';
        // Re-register handler with updated env
        const multiIo = new MockIO();
        registerAiChatHandler(multiIo as any);
        const multiNs = multiIo.namespaces['/ai'];

        mockVerifyToken.mockReturnValue({ sub: userId, email: 'test@example.com', role: 'user' });

        // Second origin in the list should be accepted
        const socket = new MockSocket('access_token=valid-jwt', 'https://admin.gov.ab.ca');
        await multiNs.simulateConnection(socket);
        expect(socket.userId).toBe(userId);

        // First origin in the list should also be accepted
        const socket2 = new MockSocket('access_token=valid-jwt', 'https://app.gov.ab.ca');
        await multiNs.simulateConnection(socket2);
        expect(socket2.userId).toBe(userId);

        // Unlisted origin should be rejected
        const socket3 = new MockSocket('access_token=valid-jwt', 'https://evil.com');
        await expect(multiNs.simulateConnection(socket3)).rejects.toThrow('Origin not allowed');
      } finally {
        (env as any).CORS_ORIGIN = originalCorsOrigin;
      }
    });
  });

  describe('chat:message event', () => {
    let socket: MockSocket;

    beforeEach(async () => {
      mockVerifyToken.mockReturnValue({ sub: userId, email: 'test@example.com', role: 'user' });
      socket = new MockSocket('access_token=valid-jwt');
      await aiNamespace.simulateConnection(socket);
    });

    it('should stream chat response chunks', async () => {
      mockStreamChat.mockImplementation(async (_userId: string, _convId: string, _content: string, onChunk: (chunk: string) => void) => {
        onChunk('Hello ');
        onChunk('there!');
        return { conversationId: convId, rateLimitRemaining: 18 };
      });

      // Emit the chat:message event
      socket.emit('chat:message', { content: 'Hi' });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Check emitted events
      const chatResponses = socket.emitted.filter(e => e.event === 'chat:response');
      expect(chatResponses.length).toBeGreaterThanOrEqual(1);

      // Should have a done:true final event
      const doneEvent = chatResponses.find(e => e.data.done === true);
      expect(doneEvent).toBeDefined();
      expect(doneEvent!.data.rateLimitRemaining).toBe(18);
    });

    it('should emit chat:error for invalid payload', async () => {
      socket.emit('chat:message', { content: '' });

      await new Promise(resolve => setTimeout(resolve, 50));

      const errors = socket.emitted.filter(e => e.event === 'chat:error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0].data.error).toBe('Invalid message format');
    });

    it('should emit chat:error on rate limit exceeded', async () => {
      mockStreamChat.mockRejectedValue(
        Object.assign(new Error('Rate limit exceeded'), { statusCode: 429 })
      );

      socket.emit('chat:message', { content: 'Hello' });

      await new Promise(resolve => setTimeout(resolve, 50));

      const errors = socket.emitted.filter(e => e.event === 'chat:error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0].data.error).toContain('Rate limit');
    });
  });

  describe('image:analyze event', () => {
    let socket: MockSocket;

    beforeEach(async () => {
      mockVerifyToken.mockReturnValue({ sub: userId, email: 'test@example.com', role: 'user' });
      socket = new MockSocket('access_token=valid-jwt');
      await aiNamespace.simulateConnection(socket);
    });

    it('should stream image analysis results', async () => {
      mockStreamImage.mockImplementation(async (_userId: string, _convId: string, _images: any, _prompt: any, onChunk: (chunk: string) => void) => {
        onChunk('Document detected');
        return { conversationId: convId, rateLimitRemaining: 17 };
      });

      socket.emit('image:analyze', {
        images: [{ imageData: Buffer.from('fake-image').toString('base64'), mimeType: 'image/jpeg' }],
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const results = socket.emitted.filter(e => e.event === 'image:result');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit chat:error for missing image data', async () => {
      socket.emit('image:analyze', { conversationId: convId });

      await new Promise(resolve => setTimeout(resolve, 50));

      const errors = socket.emitted.filter(e => e.event === 'chat:error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0].data.error).toBe('Image data is required');
    });

    it('should reject unsupported image types', async () => {
      socket.emit('image:analyze', {
        images: [{ imageData: 'base64data', mimeType: 'image/gif' }],
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const errors = socket.emitted.filter(e => e.event === 'chat:error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0].data.error).toContain('Only JPEG, PNG, and WEBP');
    });
  });

  describe('disconnect', () => {
    it('should handle disconnect event', async () => {
      mockVerifyToken.mockReturnValue({ sub: userId, email: 'test@example.com', role: 'user' });
      const socket = new MockSocket('access_token=valid-jwt');
      await aiNamespace.simulateConnection(socket);

      // Should not throw
      socket.emit('disconnect', 'client disconnect');
    });
  });
});
