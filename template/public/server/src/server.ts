import { createServer } from 'http';
import { app } from './app';
import { env, validateStartupKeys } from './config/environment';
import { createSocketServer, closeSocketServer } from './websocket';
import { testConnection, closePool } from './config/database';
import logger from './utils/logger';

validateStartupKeys();

const PORT = env.PORT;

// Create HTTP server wrapping Express app (needed for Socket.io)
const httpServer = createServer(app);

// Attach Socket.io to HTTP server
createSocketServer(httpServer);

// Test database connection on startup
testConnection().then((ok) => {
  if (ok) {
    logger.info('Database connection verified');
  } else {
    logger.warn('Database connection failed — API queries will fail');
  }
});

const server = httpServer.listen(PORT, () => {
  logger.info(`Application server`);
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Listening on port ${PORT}`);
  logger.info(`API:          http://localhost:${PORT}/api`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`WebSocket:    ws://localhost:${PORT}/ai`);
  if (env.NODE_ENV === 'production' || env.SERVE_CLIENT === 'true') {
    logger.info(`Client:       http://localhost:${PORT}/`);
  } else {
    logger.info(`Client:       http://localhost:5173/ (Vite dev server)`);
  }
});

// Graceful shutdown — close WebSocket, HTTP server, then DB pool
const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  try {
    // 1. Disconnect all WebSocket clients first (prevents them from keeping server alive)
    await closeSocketServer();
    logger.info('WebSocket connections closed.');
  } catch (err) {
    logger.error('Error closing WebSocket:', { error: (err as Error).message });
  }

  // 2. Close HTTP server (stops accepting new connections)
  server.close(async () => {
    logger.info('HTTP server closed.');
    try {
      await closePool();
      logger.info('Database pool closed.');
    } catch (err) {
      logger.error('Error closing database pool:', { error: (err as Error).message });
    }
    process.exit(0);
  });

  // Force shutdown after configurable timeout (default 30s)
  const shutdownTimeout = env.SHUTDOWN_TIMEOUT_MS;
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.');
    process.exit(1);
  }, shutdownTimeout);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Process-level error handlers — prevent silent crashes
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection — initiating graceful shutdown', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception — initiating graceful shutdown', {
    error: error.message,
    stack: error.stack,
  });
  // Uncaught exceptions leave the process in an undefined state — graceful shutdown
  shutdown('uncaughtException');
});

export default server;
