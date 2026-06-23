/**
 * Notification subscription record from database.
 */
export interface NotificationSubscriptionRecord {
  pk_notification_subscription: string;
  fk_notification_subscription_user_account: string;
  subscription_type: SubscriptionType;
  subscription_target_id: string | null;
  subscription_region_name: string | null;
  filter_criteria: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/**
 * Subscription with resolved target name (e.g., resource title).
 */
export interface NotificationSubscriptionWithTarget extends NotificationSubscriptionRecord {
  target_name?: string;
}

/**
 * Notification message record from database.
 */
export interface NotificationMessageRecord {
  pk_notification_message: string;
  message_title: string;
  message_body: string;
  message_type: NotificationMessageType;
  message_region_filter: string | null;
  fk_notification_message_resource_item: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/**
 * Notification delivery record from database.
 */
export interface NotificationDeliveryRecord {
  pk_notification_delivery: string;
  fk_notification_delivery_notification_message: string;
  fk_notification_delivery_user_account: string;
  is_read: boolean;
  read_at: string | null;
  delivered_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Notification delivery joined with message data.
 */
export interface NotificationDeliveryWithMessage {
  pk_notification_delivery: string;
  is_read: boolean;
  read_at: string | null;
  delivered_at: string;
  message_title: string;
  message_body: string;
  message_type: NotificationMessageType;
  message_region_filter: string | null;
  fk_notification_message_resource_item: string | null;
  message_created_at: string;
}

/**
 * Subscription type values.
 */
export type SubscriptionType = 'resource' | 'region' | 'broadcast';

/**
 * Notification message type values.
 */
export type NotificationMessageType = 'service_update' | 'announcement' | 'emergency_broadcast' | 'general';

/**
 * Pagination and filter options for notification listing.
 */
export interface NotificationFilters {
  filter?: 'all' | 'unread' | 'read';
}

export interface NotificationPaginationOptions {
  page: number;
  limit: number;
}
