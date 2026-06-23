import { pool } from '../config/database';
import type {
  NotificationDeliveryWithMessage,
  NotificationMessageRecord,
  NotificationDeliveryRecord,
  NotificationFilters,
  NotificationPaginationOptions,
} from '../types/notification';

/**
 * Find notifications for a user (delivery joined with message), paginated.
 */
export async function findForUser(
  userId: string,
  options: NotificationPaginationOptions,
  filters: NotificationFilters
): Promise<NotificationDeliveryWithMessage[]> {
  const clauses: string[] = ['d.fk_notification_delivery_user_account = $1'];
  const params: unknown[] = [userId];
  let paramIndex = 2;

  if (filters.filter === 'unread') {
    clauses.push('d.is_read = false');
  } else if (filters.filter === 'read') {
    clauses.push('d.is_read = true');
  }

  const offset = (options.page - 1) * options.limit;

  const query = `
    SELECT
      d.pk_notification_delivery,
      d.is_read,
      d.read_at,
      d.delivered_at,
      m.message_title,
      m.message_body,
      m.message_type,
      m.message_region_filter,
      m.fk_notification_message_resource_item,
      m.created_at AS message_created_at
    FROM notification_delivery d
    JOIN notification_message m ON d.fk_notification_delivery_notification_message = m.pk_notification_message
    WHERE ${clauses.join(' AND ')}
    ORDER BY d.delivered_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  params.push(options.limit, offset);

  const result = await pool.query<NotificationDeliveryWithMessage>(query, params);
  return result.rows;
}

/**
 * Count notifications for a user with optional filter.
 */
export async function countForUser(
  userId: string,
  filters: NotificationFilters
): Promise<number> {
  const clauses: string[] = ['fk_notification_delivery_user_account = $1'];
  const params: unknown[] = [userId];

  if (filters.filter === 'unread') {
    clauses.push('is_read = false');
  } else if (filters.filter === 'read') {
    clauses.push('is_read = true');
  }

  const query = `
    SELECT COUNT(*) as count
    FROM notification_delivery
    WHERE ${clauses.join(' AND ')}
  `;

  const result = await pool.query<{ count: string }>(query, params);
  return parseInt(result.rows[0].count, 10);
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM notification_delivery
     WHERE fk_notification_delivery_user_account = $1 AND is_read = false`,
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Find a delivery record by ID.
 */
export async function findDeliveryById(
  deliveryId: string
): Promise<NotificationDeliveryRecord | null> {
  const result = await pool.query<NotificationDeliveryRecord>(
    'SELECT * FROM notification_delivery WHERE pk_notification_delivery = $1',
    [deliveryId]
  );
  return result.rows[0] || null;
}

/**
 * Mark a notification delivery as read.
 */
export async function markAsRead(deliveryId: string): Promise<NotificationDeliveryRecord | null> {
  const result = await pool.query<NotificationDeliveryRecord>(
    `UPDATE notification_delivery
     SET is_read = true, read_at = NOW()
     WHERE pk_notification_delivery = $1
     RETURNING *`,
    [deliveryId]
  );
  return result.rows[0] || null;
}

/**
 * Create a notification message.
 */
export async function createMessage(
  title: string,
  body: string,
  type: string,
  regionFilter: string | null,
  targetId: string | null,
  createdBy: string | null
): Promise<NotificationMessageRecord> {
  const result = await pool.query<NotificationMessageRecord>(
    `INSERT INTO notification_message
      (message_title, message_body, message_type, message_region_filter, fk_notification_message_resource_item, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING *`,
    [title, body, type, regionFilter, targetId, createdBy]
  );
  return result.rows[0];
}

/**
 * Create delivery records for a list of user IDs.
 */
export async function createDeliveries(
  messageId: string,
  userIds: string[]
): Promise<NotificationDeliveryRecord[]> {
  if (userIds.length === 0) return [];

  // Build bulk insert
  const values: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  for (const userId of userIds) {
    values.push(`($${paramIndex++}, $${paramIndex++})`);
    params.push(messageId, userId);
  }

  const result = await pool.query<NotificationDeliveryRecord>(
    `INSERT INTO notification_delivery
      (fk_notification_delivery_notification_message, fk_notification_delivery_user_account)
     VALUES ${values.join(', ')}
     ON CONFLICT (fk_notification_delivery_notification_message, fk_notification_delivery_user_account) DO NOTHING
     RETURNING *`,
    params
  );
  return result.rows;
}

/**
 * Find user IDs subscribed to a specific resource.
 */
export async function findResourceSubscribers(resourceId: string): Promise<string[]> {
  const result = await pool.query<{ fk_notification_subscription_user_account: string }>(
    `SELECT DISTINCT fk_notification_subscription_user_account
     FROM notification_subscription
     WHERE subscription_type = 'resource' AND subscription_target_id = $1`,
    [resourceId]
  );
  return result.rows.map((r) => r.fk_notification_subscription_user_account);
}

/**
 * Find user IDs subscribed to a region.
 */
export async function findRegionSubscribers(regionName: string): Promise<string[]> {
  const result = await pool.query<{ fk_notification_subscription_user_account: string }>(
    `SELECT DISTINCT fk_notification_subscription_user_account
     FROM notification_subscription
     WHERE subscription_type = 'region' AND subscription_region_name = $1`,
    [regionName]
  );
  return result.rows.map((r) => r.fk_notification_subscription_user_account);
}

/**
 * Find all active user IDs for system-wide broadcast delivery.
 * Admin broadcasts reach ALL users, not just subscribers.
 */
export async function findAllActiveUserIds(): Promise<string[]> {
  const result = await pool.query<{ pk_user_account: string }>(
    'SELECT pk_user_account FROM user_account WHERE is_active = true AND is_deleted = false'
  );
  return result.rows.map((r) => r.pk_user_account);
}

/**
 * Find user IDs subscribed to broadcasts, optionally filtered by region.
 */
export async function findBroadcastSubscribers(regionFilter?: string): Promise<string[]> {
  let query = `
    SELECT DISTINCT fk_notification_subscription_user_account
    FROM notification_subscription
    WHERE subscription_type = 'broadcast'
  `;
  const params: unknown[] = [];

  if (regionFilter) {
    // Also include region subscribers for the specific region
    query = `
      SELECT DISTINCT fk_notification_subscription_user_account
      FROM notification_subscription
      WHERE subscription_type = 'broadcast'
         OR (subscription_type = 'region' AND subscription_region_name = $1)
    `;
    params.push(regionFilter);
  }

  const result = await pool.query<{ fk_notification_subscription_user_account: string }>(
    query,
    params
  );
  return result.rows.map((r) => r.fk_notification_subscription_user_account);
}
