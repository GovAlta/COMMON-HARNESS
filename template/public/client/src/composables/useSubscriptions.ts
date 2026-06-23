import { ref, type Ref } from 'vue'
import api, { parseApiError } from '@/lib/api'
import type { ApiPaginationInfo } from '@/types/api'
import type {
  NotificationSubscription,
  CreateSubscriptionPayload,
} from '@/types/subscription'

export interface SubscriptionsListParams {
  page?: number
  limit?: number
}

export interface UseSubscriptionsReturn {
  items: Ref<NotificationSubscription[]>
  pagination: Ref<ApiPaginationInfo | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  refresh: (params?: SubscriptionsListParams) => Promise<void>
  subscribe: (
    payload: CreateSubscriptionPayload,
  ) => Promise<NotificationSubscription | null>
  unsubscribe: (id: string) => Promise<boolean>
}

/**
 * Composable wrapping the authenticated subscriptions API. The list
 * endpoint is paginated — `refresh(params)` populates `items` +
 * `pagination` (same shape as `useResources`).
 */
export function useSubscriptions(): UseSubscriptionsReturn {
  const items = ref<NotificationSubscription[]>([]) as Ref<NotificationSubscription[]>
  const pagination = ref<ApiPaginationInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh(params: SubscriptionsListParams = {}): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{
        data: NotificationSubscription[]
        pagination: ApiPaginationInfo
      }>('/v1/subscriptions', { params })
      items.value = res.data.data
      pagination.value = res.data.pagination
    } catch (err) {
      error.value = parseApiError(err).message
      items.value = []
      pagination.value = null
    } finally {
      loading.value = false
    }
  }

  async function subscribe(
    payload: CreateSubscriptionPayload,
  ): Promise<NotificationSubscription | null> {
    loading.value = true
    error.value = null
    try {
      const res = await api.post<{ data: NotificationSubscription }>(
        '/v1/subscriptions',
        payload,
      )
      items.value = [res.data.data, ...items.value]
      return res.data.data
    } catch (err) {
      error.value = parseApiError(err).message
      return null
    } finally {
      loading.value = false
    }
  }

  async function unsubscribe(id: string): Promise<boolean> {
    error.value = null
    try {
      await api.delete(`/v1/subscriptions/${id}`)
      items.value = items.value.filter((s) => s.pk_notification_subscription !== id)
      return true
    } catch (err) {
      error.value = parseApiError(err).message
      return false
    }
  }

  return { items, pagination, loading, error, refresh, subscribe, unsubscribe }
}
