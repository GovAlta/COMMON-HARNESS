import { pool } from '../config/database';
import type {
  NotificationSubscriptionRecord,
  NotificationSubscriptionWithTarget,
  SubscriptionType,
} from '../types/notification';

/**
 * Find all subscriptions for a user, with resolved target names, paginated.
 * Mirrors the resource model pagination contract — `LIMIT/OFFSET` is
 * parameterised so callers must pass `page` (1-indexed) and `limit`.
 */
export async function findByUser(
  userId: string,
  page: number,
  limit: number
): Promise<NotificationSubscriptionWithTarget[]> {
  const offset = (page - 1) * limit;
  const result = await pool.query<NotificationSubscriptionWithTarget>(
    `SELECT
      s.*,
      ri.resource_title AS target_name
     FROM notification_subscription s
     LEFT JOIN resource_item ri ON s.subscription_target_id = ri.pk_resource_item
     WHERE s.fk_notification_subscription_user_account = $1
     ORDER BY s.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
}

/**
 * Count subscriptions for a user (for pagination metadata).
 */
export async function countByUser(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM notification_subscription
     WHERE fk_notification_subscription_user_account = $1`,
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Find a subscription by ID.
 */
export async function findById(
  subscriptionId: string
): Promise<NotificationSubscriptionRecord | null> {
  const result = await pool.query<NotificationSubscriptionRecord>(
    'SELECT * FROM notification_subscription WHERE pk_notification_subscription = $1',
    [subscriptionId]
  );
  return result.rows[0] || null;
}

/**
 * Find a specific subscription by user, type, and target.
 */
export async function findByUserTypeTarget(
  userId: string,
  type: SubscriptionType,
  targetId: string | null
): Promise<NotificationSubscriptionRecord | null> {
  let query: string;
  let params: unknown[];

  if (targetId) {
    query = `SELECT * FROM notification_subscription
             WHERE fk_notification_subscription_user_account = $1
               AND subscription_type = $2
               AND subscription_target_id = $3`;
    params = [userId, type, targetId];
  } else {
    query = `SELECT * FROM notification_subscription
             WHERE fk_notification_subscription_user_account = $1
               AND subscription_type = $2
               AND subscription_target_id IS NULL`;
    params = [userId, type];
  }

  const result = await pool.query<NotificationSubscriptionRecord>(query, params);
  return result.rows[0] || null;
}

/**
 * Create a new subscription.
 */
export async function create(
  userId: string,
  type: SubscriptionType,
  targetId: string | null,
  regionName: string | null,
  filterCriteria: Record<string, unknown>
): Promise<NotificationSubscriptionRecord> {
  const result = await pool.query<NotificationSubscriptionRecord>(
    `INSERT INTO notification_subscription
      (fk_notification_subscription_user_account, subscription_type, subscription_target_id, subscription_region_name, filter_criteria, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $1, $1)
     RETURNING *`,
    [userId, type, targetId, regionName, JSON.stringify(filterCriteria)]
  );
  return result.rows[0];
}

/**
 * Delete a subscription by ID.
 */
export async function deleteById(subscriptionId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM notification_subscription WHERE pk_notification_subscription = $1',
    [subscriptionId]
  );
  return (result.rowCount ?? 0) > 0;
}
