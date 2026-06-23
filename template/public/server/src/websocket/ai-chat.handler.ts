import type { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/token';
import { COOKIE_NAMES } from '../utils/cookie-config';
import { env } from '../config/environment';
import * as aiService from '../services/ai.service';
import { chatMessageSchema } from '../validators/ai.validator';
import logger from '../utils/logger';

/** Maximum base64-encoded image size (approx 10MB decoded, with ~37% base64 overhead) */
const MAX_BASE64_IMAGE_SIZE = 14 * 1024 * 1024; // ~14MB base64 = ~10MB decoded

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

/**
 * Parse cookies from a cookie header string.
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name.trim()] = rest.join('=').trim();
    }
  });

  return cookies;
}

/** Parse CORS_ORIGIN into an array of allowed origins (supports comma-separated values). */
function getAllowedOrigins(): string[] {
  return env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
}

/**
 * Register the /ai namespace Socket.io handler.
 * Handles authentication, chat messages, and image analysis via WebSocket.
 */
export function registerAiChatHandler(io: SocketIOServer): void {
  const aiNamespace = io.of('/ai');

  // Authentication middleware for WebSocket connections
  aiNamespace.use((socket: AuthenticatedSocket, next) => {
    try {
      // Validate Origin header to prevent Cross-Site WebSocket Hijacking.
      // In development, allow any localhost so Vite (5173/5174) + alt-port runs
      // and Storybook all work without re-editing CORS_ORIGIN. The localhost
      // allowance is GATED ON NODE_ENV === 'development' — production deploys
      // never hit this branch, so DNS-rebinding risk is dev-only.
      const origin = socket.handshake.headers.origin;
      if (origin && !getAllowedOrigins().includes(origin)) {
        const isDev = env.NODE_ENV === 'development' && /^https?:\/\/localhost(:\d+)?$/.test(origin);
        if (!isDev) {
          logger.warn('WebSocket origin rejected', { origin, allowed: getAllowedOrigins() });
          return next(new Error('Origin not allowed'));
        }
      }

      const cookieHeader = socket.handshake.headers.cookie || '';
      const cookies = parseCookies(cookieHeader);
      const token = cookies[COOKIE_NAMES.ACCESS_TOKEN];

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = verifyAccessToken(token);
      socket.userId = decoded.sub;
      socket.userEmail = decoded.email;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  aiNamespace.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    logger.info(`WebSocket user connected`, { userId, namespace: '/ai' });

    // Handle chat:message event
    socket.on('chat:message', async (payload: unknown) => {
      try {
        // Validate payload
        const parsed = chatMessageSchema.safeParse(payload);
        if (!parsed.success) {
          socket.emit('chat:error', {
            conversationId: (payload as any)?.conversationId || null,
            error: 'Invalid message format',
          });
          return;
        }

        const { conversationId, content } = parsed.data;

        // Use a mutable variable to hold the resolved conversation ID
        let resolvedConversationId = conversationId || '';

        // Stream response
        const result = await aiService.streamChat(
          userId,
          conversationId,
          content,
          (chunk) => {
            socket.emit('chat:response', {
              conversationId: resolvedConversationId,
              content: chunk,
              done: false,
            });
          }
        );

        // Update resolved ID from result
        resolvedConversationId = result.conversationId;

        // Send completion event
        socket.emit('chat:response', {
          conversationId: result.conversationId,
          content: '',
          done: true,
          rateLimitRemaining: result.rateLimitRemaining,
        });
      } catch (error: any) {
        const errorMessage = error.statusCode === 429
          ? error.message
          : 'An error occurred processing your message';

        socket.emit('chat:error', {
          conversationId: (payload as any)?.conversationId || null,
          error: errorMessage,
        });
      }
    });

    // Handle image:analyze event (multi-image format only)
    socket.on('image:analyze', async (payload: unknown) => {
      try {
        const data = payload as {
          conversationId?: string;
          images?: Array<{ imageData: string; mimeType: string }>;
          prompt?: string;
        };

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

        if (!data.images || data.images.length === 0) {
          socket.emit('chat:error', {
            conversationId: data.conversationId || null,
            error: 'Image data is required',
          });
          return;
        }

        const images: Array<{ buffer: Buffer; mimeType: string }> = [];

        for (const img of data.images) {
          const mimeType = img.mimeType || 'image/jpeg';
          if (!allowedTypes.includes(mimeType)) {
            socket.emit('chat:error', {
              conversationId: data.conversationId || null,
              error: 'Only JPEG, PNG, and WEBP images are allowed',
            });
            return;
          }
          // Validate base64 string size before decoding to prevent memory exhaustion
          if (!img.imageData || img.imageData.length > MAX_BASE64_IMAGE_SIZE) {
            socket.emit('chat:error', {
              conversationId: data.conversationId || null,
              error: 'Image too large. Maximum size is 10MB.',
            });
            return;
          }
          images.push({
            buffer: Buffer.from(img.imageData, 'base64'),
            mimeType,
          });
        }

        // Use a mutable variable to hold the resolved conversation ID
        let resolvedConvId = data.conversationId || '';

        // Stream image analysis
        const result = await aiService.streamImagesAnalysis(
          userId,
          data.conversationId,
          images,
          data.prompt,
          (chunk) => {
            socket.emit('image:result', {
              conversationId: resolvedConvId,
              analysis: chunk,
              done: false,
            });
          }
        );

        // Update resolved ID from result
        resolvedConvId = result.conversationId;

        // Send completion event
        socket.emit('image:result', {
          conversationId: result.conversationId,
          analysis: '',
          done: true,
          rateLimitRemaining: result.rateLimitRemaining,
        });
      } catch (error: any) {
        const errorMessage = error.statusCode === 429
          ? error.message
          : 'An error occurred analyzing the image';

        socket.emit('chat:error', {
          conversationId: (payload as any)?.conversationId || null,
          error: errorMessage,
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket user disconnected`, { userId, namespace: '/ai', reason });
    });
  });
}
