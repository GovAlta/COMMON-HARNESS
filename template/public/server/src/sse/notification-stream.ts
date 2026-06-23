import { Response } from 'express';
import logger from '../utils/logger';

/** Maximum number of concurrent SSE connections allowed per user (e.g. multiple browser tabs). */
const MAX_CONNECTIONS_PER_USER = 10;

/**
 * SSE manager for per-user notification delivery.
 * Maintains a map of userId → set of SSE response objects (a user may have multiple tabs open).
 */
class NotificationStreamManager {
  private clients: Map<string, Set<Response>> = new Map();

  /**
   * Register an authenticated SSE client connection.
   * Enforces a per-user connection limit. When the limit is reached the oldest
   * connection is closed to make room for the new one.
   */
  addClient(userId: string, res: Response): void {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    const userClients = this.clients.get(userId)!;

    // Evict oldest connection(s) if at limit
    while (userClients.size >= MAX_CONNECTIONS_PER_USER) {
      const oldest = userClients.values().next().value;
      if (oldest) {
        try {
          oldest.end();
        } catch {
          // Ignore errors during eviction cleanup
        }
        userClients.delete(oldest);
        logger.warn('SSE connection evicted (per-user limit reached)', { userId, limit: MAX_CONNECTIONS_PER_USER });
      }
    }

    userClients.add(res);
  }

  /**
   * Remove an SSE client connection (on disconnect).
   */
  removeClient(userId: string, res: Response): void {
    const userClients = this.clients.get(userId);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) {
        this.clients.delete(userId);
      }
    }
  }

  /**
   * Send an SSE event to a specific user (all their connected clients).
   */
  sendToUser(userId: string, notification: unknown): void {
    const userClients = this.clients.get(userId);
    if (!userClients) return;

    const message = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;

    for (const client of userClients) {
      try {
        client.write(message);
      } catch {
        userClients.delete(client);
      }
    }

    // Clean up empty sets
    if (userClients.size === 0) {
      this.clients.delete(userId);
    }
  }

  /**
   * Send an SSE event to multiple users.
   */
  sendToUsers(userIds: string[], notification: unknown): void {
    for (const userId of userIds) {
      this.sendToUser(userId, notification);
    }
  }

  /**
   * Check if a user has any connected SSE clients.
   */
  isConnected(userId: string): boolean {
    return (this.clients.get(userId)?.size ?? 0) > 0;
  }

  /**
   * Get the total number of connected clients across all users.
   */
  getClientCount(): number {
    let count = 0;
    for (const clients of this.clients.values()) {
      count += clients.size;
    }
    return count;
  }

  /**
   * Disconnect all clients (for graceful shutdown).
   */
  disconnectAll(): void {
    for (const userClients of this.clients.values()) {
      for (const client of userClients) {
        try {
          client.end();
        } catch {
          // Ignore errors during cleanup
        }
      }
    }
    this.clients.clear();
  }
}

/**
 * Singleton instance of the notification SSE stream manager.
 */
export const notificationStreamManager = new NotificationStreamManager();
