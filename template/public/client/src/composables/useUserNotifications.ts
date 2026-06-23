import { ref, type Ref } from 'vue'
import api, { parseApiError } from '@/lib/api'
import type { ApiPaginationInfo } from '@/types/api'
import type {
  UserNotification,
  NotificationListParams,
} from '@/types/notification'

// ─── Singleton state ────────────────────────────────────────────────────
// These refs live at module scope so every component that imports the
// composable shares the same reactive references. Without this, the
// NotificationsPage and the AppNavbar badge would maintain independent
// counts and could silently disagree.
const items = ref<UserNotification[]>([]) as Ref<UserNotification[]>
const pagination = ref<ApiPaginationInfo | null>(null)
const unreadCount = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)

export interface UseUserNotificationsReturn {
  items: Ref<UserNotification[]>
  pagination: Ref<ApiPaginationInfo | null>
  unreadCount: Ref<number>
  loading: Ref<boolean>
  error: Ref<string | null>
  refresh: (params?: NotificationListParams) => Promise<void>
  fetchUnreadCount: () => Promise<void>
  markRead: (id: string) => Promise<void>
  /**
   * Best-effort client-side mark-all: iterates current unread items and
   * marks each via PUT /:id/read (the backend has no batch endpoint).
   */
  markAllRead: () => Promise<void>
  /**
   * Optimistic bump for the unread counter — invoked by the SSE consumer in
   * App.vue when a real-time notification arrives. Components that mount
   * later will still see the bumped value because the state is shared.
   */
  incrementUnread: () => void
}

/**
 * Composable wrapping the authenticated per-user notifications feed.
 * Distinct from useToast which manages ephemeral PrimeVue toasts.
 *
 * State is module-scoped (singleton) so the navbar badge, the
 * /notifications page, and the SSE listener in App.vue all read and
 * mutate the same source of truth.
 */
export function useUserNotifications(): UseUserNotificationsReturn {
  async function refresh(params: NotificationListParams = {}): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<{
        data: UserNotification[]
        pagination: ApiPaginationInfo
      }>('/v1/notifications', { params })
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

  async function fetchUnreadCount(): Promise<void> {
    try {
      const res = await api.get<{ data: { count: number } }>(
        '/v1/notifications/unread-count',
      )
      unreadCount.value = res.data.data.count
    } catch (err) {
      error.value = parseApiError(err).message
    }
  }

  async function markRead(id: string): Promise<void> {
    try {
      await api.put(`/v1/notifications/${id}/read`)
      const target = items.value.find((n) => n.pk_notification_delivery === id)
      if (target && !target.is_read) {
        target.is_read = true
        target.read_at = new Date().toISOString()
        if (unreadCount.value > 0) unreadCount.value -= 1
      }
    } catch (err) {
      error.value = parseApiError(err).message
    }
  }

  async function markAllRead(): Promise<void> {
    const unread = items.value.filter((n) => !n.is_read)
    if (unread.length === 0) return
    error.value = null
    // Sequentially mark each so a single failure surfaces a clear error
    // and the cookie/CSRF flow is not bombarded with parallel writes.
    for (const n of unread) {
      await markRead(n.pk_notification_delivery)
    }
  }

  function incrementUnread(): void {
    unreadCount.value += 1
  }

  return {
    items,
    pagination,
    unreadCount,
    loading,
    error,
    refresh,
    fetchUnreadCount,
    markRead,
    markAllRead,
    incrementUnread,
  }
}
