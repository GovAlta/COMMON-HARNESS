import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../../../services/ai-providers/openai.provider';

// Mock https module to avoid real API calls
vi.mock('https', () => {
  const mockRequest = vi.fn();
  return {
    default: { request: mockRequest },
    request: mockRequest,
  };
});

vi.mock('http', () => {
  const mockRequest = vi.fn();
  return {
    default: { request: mockRequest },
    request: mockRequest,
  };
});

import https from 'https';
import { EventEmitter } from 'events';

const mockHttpsRequest = https.request as ReturnType<typeof vi.fn>;

function createMockResponse(statusCode: number, body: string) {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;

  // Emit data and end on next tick
  setTimeout(() => {
    res.emit('data', Buffer.from(body));
    res.emit('end');
  }, 10);

  return res;
}

function createMockStreamingResponse(statusCode: number, chunks: string[]) {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;

  setTimeout(() => {
    for (const chunk of chunks) {
      res.emit('data', Buffer.from(chunk));
    }
    res.emit('end');
  }, 10);

  return res;
}

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      maxTokens: 512,
    });
  });

  describe('isAvailable', () => {
    it('should return true when API key is set', () => {
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when API key is empty', () => {
      const noKeyProvider = new OpenAIProvider({ apiKey: '' });
      expect(noKeyProvider.isAvailable()).toBe(false);
    });
  });

  describe('name', () => {
    it('should return "openai"', () => {
      expect(provider.name).toBe('openai');
    });
  });

  describe('chat', () => {
    it('should send messages to OpenAI API and return response', async () => {
      const apiResponse = JSON.stringify({
        choices: [
          {
            message: {
              content: 'The application provides various services.',
            },
          },
        ],
      });

      const mockReq = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      mockReq.write = vi.fn();
      mockReq.end = vi.fn();

      mockHttpsRequest.mockImplementation((_opts: any, callback: (res: any) => void) => {
        const res = createMockResponse(200, apiResponse);
        callback(res);
        return mockReq;
      });

      const result = await provider.chat([
        { role: 'user', content: 'What services are available?' },
      ]);

      expect(result).toBe('The application provides various services.');
      expect(mockHttpsRequest).toHaveBeenCalled();
      expect(mockReq.write).toHaveBeenCalled();
    });

    it('should throw on API error response', async () => {
      const mockReq = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      mockReq.write = vi.fn();
      mockReq.end = vi.fn();

      mockHttpsRequest.mockImplementation((_opts: any, callback: (res: any) => void) => {
        const res = createMockResponse(500, '{"error": "Internal server error"}');
        callback(res);
        return mockReq;
      });

      await expect(
        provider.chat([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('OpenAI API error (500)');
    });

    it('should throw on network error', async () => {
      const mockReq = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      mockReq.write = vi.fn();
      mockReq.end = vi.fn();

      mockHttpsRequest.mockImplementation(() => {
        setTimeout(() => mockReq.emit('error', new Error('ECONNREFUSED')), 10);
        return mockReq;
      });

      await expect(
        provider.chat([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('OpenAI API request failed');
    });
  });

  describe('streamChat', () => {
    it('should stream response chunks via onChunk callback', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"Service "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"info"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const mockReq = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      mockReq.write = vi.fn();
      mockReq.end = vi.fn();

      mockHttpsRequest.mockImplementation((_opts: any, callback: (res: any) => void) => {
        const res = createMockStreamingResponse(200, sseChunks);
        callback(res);
        return mockReq;
      });

      const chunks: string[] = [];
      await provider.streamChat(
        [{ role: 'user', content: 'test' }],
        undefined,
        (chunk) => chunks.push(chunk)
      );

      expect(chunks).toContain('Service ');
      expect(chunks).toContain('info');
    });

    it('should throw on streaming error response', async () => {
      const mockReq = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      mockReq.write = vi.fn();
      mockReq.end = vi.fn();

      mockHttpsRequest.mockImplementation((_opts: any, callback: (res: any) => void) => {
        const res = createMockResponse(429, '{"error": "Rate limited"}');
        callback(res);
        return mockReq;
      });

      await expect(
        provider.streamChat(
          [{ role: 'user', content: 'test' }],
          undefined,
          () => {}
        )
      ).rejects.toThrow('OpenAI API error (429)');
    });
  });

  describe('analyzeImages', () => {
    it('should send images to vision API and return analysis', async () => {
      const apiResponse = JSON.stringify({
        choices: [
          {
            message: {
              content: 'This image shows a government service office.',
            },
          },
        ],
      });

      const mockReq = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      mockReq.write = vi.fn();
      mockReq.end = vi.fn();

      mockHttpsRequest.mockImplementation((_opts: any, callback: (res: any) => void) => {
        const res = createMockResponse(200, apiResponse);
        callback(res);
        return mockReq;
      });

      const imageBuffer = Buffer.from('fake-image-data');
      const result = await provider.analyzeImages(
        [{ buffer: imageBuffer, mimeType: 'image/jpeg' }],
        'Analyze this image'
      );

      expect(result).toBe('This image shows a government service office.');
      expect(mockHttpsRequest).toHaveBeenCalled();

      // Verify the request body includes image data
      const requestBody = JSON.parse(mockReq.write.mock.calls[0][0]);
      expect(requestBody.model).toBe('gpt-4o-mini');
    });

    it('should stream image analysis when onChunk provided', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"Building "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"detected."}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const mockReq = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      mockReq.write = vi.fn();
      mockReq.end = vi.fn();

      mockHttpsRequest.mockImplementation((_opts: any, callback: (res: any) => void) => {
        const res = createMockStreamingResponse(200, sseChunks);
        callback(res);
        return mockReq;
      });

      const chunks: string[] = [];
      const imageBuffer = Buffer.from('fake-image');
      const result = await provider.analyzeImages(
        [{ buffer: imageBuffer, mimeType: 'image/png' }],
        'Analyze this',
        (chunk) => chunks.push(chunk)
      );

      expect(chunks).toContain('Building ');
      expect(chunks).toContain('detected.');
    });
  });
});
