/**
 * Client-side notification types.
 * Mirrors server/src/types/notification.ts.
 */

export type NotificationMessageType =
  | 'service_update'
  | 'announcement'
  | 'emergency_broadcast'
  | 'general'

/**
 * The shape returned by GET /api/v1/notifications — a delivery row joined
 * with its message metadata (see notificationService.listForUser).
 */
export interface UserNotification {
  pk_notification_delivery: string
  is_read: boolean
  read_at: string | null
  delivered_at: string
  message_title: string
  message_body: string
  message_type: NotificationMessageType
  message_region_filter: string | null
  fk_notification_message_resource_item: string | null
  message_created_at: string
}

export interface NotificationListParams {
  page?: number
  limit?: number
  filter?: 'all' | 'unread' | 'read'
}

export interface UnreadCountPayload {
  count: number
}

export interface BroadcastPayload {
  title: string
  body: string
  type: NotificationMessageType
  regionFilter?: string | null
}
