/**
 * Client-side notification subscription types.
 */

export type SubscriptionType = 'resource' | 'region' | 'broadcast'

export interface NotificationSubscription {
  pk_notification_subscription: string
  fk_notification_subscription_user_account: string
  subscription_type: SubscriptionType
  subscription_target_id: string | null
  subscription_region_name: string | null
  filter_criteria: Record<string, unknown>
  target_name?: string
  created_at: string
  updated_at: string
}

export interface CreateSubscriptionPayload {
  type: SubscriptionType
  targetId?: string | null
  regionName?: string | null
  filterCriteria?: Record<string, unknown>
}
