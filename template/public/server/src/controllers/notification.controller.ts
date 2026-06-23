import { Request, Response } from 'express';
import * as notificationService from '../services/notification.service';
import { sendSuccess, sendPaginated } from '../utils/response';
import { notificationStreamManager } from '../sse/notification-stream';
import type { NotificationFilters, NotificationPaginationOptions } from '../types/notification';

/**
 * GET /api/notifications
 * List current user's notifications with pagination and filtering.
 */
export async function listNotifications(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { page, limit, filter } = req.query as Record<string, any>;

  const options: NotificationPaginationOptions = {
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  };

  const filters: NotificationFilters = {
    filter: (filter as 'all' | 'unread' | 'read') || 'all',
  };

  const result = await notificationService.listForUser(userId, options, filters);

  sendPaginated(res, result.data, result.pagination);
}

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for current user (for header badge).
 */
export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const count = await notificationService.getUnreadCount(userId);
  sendSuccess(res, { count });
}

/**
 * PUT /api/notifications/:id/read
 * Mark a notification delivery as read for current user.
 */
export async function markAsRead(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const deliveryId = req.params.id as string;

  await notificationService.markAsRead(deliveryId, userId);

  sendSuccess(res, { message: 'Notification marked as read' });
}

/**
 * GET /api/subscriptions
 * List current user's notification subscriptions, paginated.
 */
export async function listSubscriptions(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { page, limit } = req.query as Record<string, any>;

  const result = await notificationService.listSubscriptions(
    userId,
    Number(page) || 1,
    Number(limit) || 20
  );

  sendPaginated(res, result.data, result.pagination);
}

/**
 * POST /api/subscriptions
 * Create a new notification subscription.
 */
export async function createSubscription(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { type, targetId, regionName, filterCriteria } = req.body;

  const subscription = await notificationService.createSubscription(
    userId,
    type,
    targetId || null,
    regionName || null,
    filterCriteria || {}
  );

  sendSuccess(res, subscription, 201);
}

/**
 * DELETE /api/subscriptions/:id
 * Delete a subscription (must belong to current user).
 */
export async function deleteSubscription(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const subscriptionId = req.params.id as string;

  await notificationService.deleteSubscription(subscriptionId, userId);

  sendSuccess(res, { message: 'Subscription deleted' });
}

/**
 * POST /api/notifications/broadcast
 * Admin broadcast to all subscribers or filtered by region.
 */
export async function broadcastNotification(req: Request, res: Response): Promise<void> {
  const adminId = req.user!.id;
  const { title, body, type, regionFilter, resourceId } = req.body;

  const result = await notificationService.broadcast(
    title,
    body,
    type || 'general',
    regionFilter || null,
    resourceId || null,
    adminId
  );

  sendSuccess(res, result, 201);
}

/**
 * GET /api/notifications/stream
 * SSE endpoint for real-time notification delivery to authenticated users.
 */
export async function streamNotifications(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;

  // Set SSE response headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Flush headers immediately
  res.flushHeaders();

  // Send initial connection event with unread count
  try {
    const count = await notificationService.getUnreadCount(userId);
    res.write(`event: connected\ndata: ${JSON.stringify({ unreadCount: count })}\n\n`);
  } catch {
    res.write(`event: connected\ndata: ${JSON.stringify({ unreadCount: 0 })}\n\n`);
  }

  // Register this client with the notification stream manager
  notificationStreamManager.addClient(userId, res);

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`:heartbeat\n\n`);
    } catch {
      clearInterval(heartbeatInterval);
    }
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    notificationStreamManager.removeClient(userId, res);
  });
}
