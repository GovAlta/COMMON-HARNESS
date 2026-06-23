import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from '../config/environment';
import { registerAiChatHandler } from './ai-chat.handler';
import logger from '../utils/logger';

let io: SocketIOServer | null = null;

/**
 * Create and configure Socket.io server attached to the HTTP server.
 * Registers all WebSocket namespace handlers.
 */
export function createSocketServer(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN.split(',').map((o: string) => o.trim()).filter(Boolean),
      credentials: true,
      methods: ['GET', 'POST'],
    },
    // Allow cookies to be sent with WebSocket handshake
    cookie: true,
    // Connection settings
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Register namespace handlers
  registerAiChatHandler(io);

  logger.info('Socket.io server initialized');

  return io;
}

/**
 * Get the Socket.io server instance.
 */
export function getSocketServer(): SocketIOServer | null {
  return io;
}

/**
 * Close all Socket.io connections (used during graceful shutdown).
 */
export async function closeSocketServer(): Promise<void> {
  if (io) {
    io.disconnectSockets(true);
    await new Promise<void>((resolve) => io!.close(() => resolve()));
    io = null;
  }
}
