import * as notificationModel from '../models/notification.model';
import * as subscriptionModel from '../models/subscription.model';
import { notificationStreamManager } from '../sse/notification-stream';
import { AppError } from '../utils/app-error';
import type {
  NotificationDeliveryWithMessage,
  NotificationSubscriptionWithTarget,
  NotificationSubscriptionRecord,
  NotificationFilters,
  NotificationPaginationOptions,
  SubscriptionType,
  NotificationMessageType,
} from '../types/notification';

interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * List notifications for a user with pagination and filtering.
 */
export async function listForUser(
  userId: string,
  options: NotificationPaginationOptions,
  filters: NotificationFilters
): Promise<PaginatedResult<NotificationDeliveryWithMessage>> {
  const [data, total] = await Promise.all([
    notificationModel.findForUser(userId, options, filters),
    notificationModel.countForUser(userId, filters),
  ]);

  const totalPages = Math.ceil(total / options.limit) || 1;

  return {
    data,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages,
    },
  };
}

/**
 * Mark a notification delivery as read.
 */
export async function markAsRead(
  deliveryId: string,
  userId: string
): Promise<void> {
  const delivery = await notificationModel.findDeliveryById(deliveryId);

  if (!delivery) {
    throw AppError.notFound('Notification not found');
  }

  if (delivery.fk_notification_delivery_user_account !== userId) {
    throw AppError.forbidden('Cannot mark another user\'s notification as read');
  }

  await notificationModel.markAsRead(deliveryId);
}

/**
 * Get the unread notification count for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return notificationModel.getUnreadCount(userId);
}

/**
 * List subscriptions for a user, paginated.
 */
export async function listSubscriptions(
  userId: string,
  page: number,
  limit: number
): Promise<PaginatedResult<NotificationSubscriptionWithTarget>> {
  const [data, total] = await Promise.all([
    subscriptionModel.findByUser(userId, page, limit),
    subscriptionModel.countByUser(userId),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data,
    pagination: { page, limit, total, totalPages },
  };
}

/**
 * Create a new subscription.
 */
export async function createSubscription(
  userId: string,
  type: SubscriptionType,
  targetId: string | null,
  regionName: string | null,
  criteria: Record<string, unknown>
): Promise<NotificationSubscriptionRecord> {
  // Check for duplicate
  const existing = await subscriptionModel.findByUserTypeTarget(userId, type, targetId || null);
  if (existing) {
    throw new AppError('Subscription already exists', 409, 'DUPLICATE_SUBSCRIPTION');
  }

  // For resource subscriptions, verify the resource exists
  if (type === 'resource' && targetId) {
    const { pool } = await import('../config/database');
    const result = await pool.query(
      'SELECT pk_resource_item FROM resource_item WHERE pk_resource_item = $1 AND is_deleted = false',
      [targetId]
    );
    if (result.rows.length === 0) {
      throw AppError.notFound('Resource not found');
    }
  }

  return subscriptionModel.create(userId, type, targetId || null, regionName || null, criteria);
}

/**
 * Delete a subscription (with ownership check).
 */
export async function deleteSubscription(
  subscriptionId: string,
  userId: string
): Promise<void> {
  const subscription = await subscriptionModel.findById(subscriptionId);

  if (!subscription) {
    throw AppError.notFound('Subscription not found');
  }

  if (subscription.fk_notification_subscription_user_account !== userId) {
    throw AppError.forbidden('Cannot delete another user\'s subscription');
  }

  await subscriptionModel.deleteById(subscriptionId);
}

/**
 * Broadcast a notification to matching subscribers.
 * Creates the message and delivery records, then pushes via SSE.
 */
export async function broadcast(
  title: string,
  body: string,
  type: NotificationMessageType,
  regionFilter: string | null,
  targetId: string | null,
  createdBy: string | null
): Promise<{ messageId: string; deliveryCount: number }> {
  // Create the notification message
  const message = await notificationModel.createMessage(
    title,
    body,
    type,
    regionFilter,
    targetId,
    createdBy
  );

  // Deliver to ALL active users (admin broadcasts are system-wide)
  // Route is protected by authenticate + authorize('admin') middleware
  const subscriberIds = await notificationModel.findAllActiveUserIds();

  if (subscriberIds.length === 0) {
    return { messageId: message.pk_notification_message, deliveryCount: 0 };
  }

  // Create delivery records
  const deliveries = await notificationModel.createDeliveries(
    message.pk_notification_message,
    subscriberIds
  );

  // Push via SSE to connected users
  const ssePayload = {
    id: message.pk_notification_message,
    title: message.message_title,
    body: message.message_body,
    type: message.message_type,
    createdAt: message.created_at,
  };

  notificationStreamManager.sendToUsers(subscriberIds, ssePayload);

  return {
    messageId: message.pk_notification_message,
    deliveryCount: deliveries.length,
  };
}

/**
 * Notify subscribers of a specific resource.
 */
export async function notifyResourceSubscribers(
  resourceId: string,
  title: string,
  body: string
): Promise<{ messageId: string; deliveryCount: number }> {
  // Create notification message
  const message = await notificationModel.createMessage(
    title,
    body,
    'general',
    null,
    resourceId,
    null
  );

  // Find resource subscribers
  const subscriberIds = await notificationModel.findResourceSubscribers(resourceId);

  if (subscriberIds.length === 0) {
    return { messageId: message.pk_notification_message, deliveryCount: 0 };
  }

  // Create deliveries
  const deliveries = await notificationModel.createDeliveries(
    message.pk_notification_message,
    subscriberIds
  );

  // Push via SSE
  const ssePayload = {
    id: message.pk_notification_message,
    title: message.message_title,
    body: message.message_body,
    type: message.message_type,
    resourceId,
    createdAt: message.created_at,
  };

  notificationStreamManager.sendToUsers(subscriberIds, ssePayload);

  return {
    messageId: message.pk_notification_message,
    deliveryCount: deliveries.length,
  };
}

/**
 * Notify subscribers of a region.
 */
export async function notifyRegionSubscribers(
  regionName: string,
  title: string,
  body: string
): Promise<{ messageId: string; deliveryCount: number }> {
  // Create notification message
  const message = await notificationModel.createMessage(
    title,
    body,
    'general',
    regionName,
    null,
    null
  );

  // Find region subscribers
  const subscriberIds = await notificationModel.findRegionSubscribers(regionName);

  if (subscriberIds.length === 0) {
    return { messageId: message.pk_notification_message, deliveryCount: 0 };
  }

  // Create deliveries
  const deliveries = await notificationModel.createDeliveries(
    message.pk_notification_message,
    subscriberIds
  );

  // Push via SSE
  const ssePayload = {
    id: message.pk_notification_message,
    title: message.message_title,
    body: message.message_body,
    type: message.message_type,
    regionName,
    createdAt: message.created_at,
  };

  notificationStreamManager.sendToUsers(subscriberIds, ssePayload);

  return {
    messageId: message.pk_notification_message,
    deliveryCount: deliveries.length,
  };
}
