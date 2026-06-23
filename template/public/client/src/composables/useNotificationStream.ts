import { onMounted, onUnmounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

/**
 * SSE consumer for `GET /api/v1/notifications/stream`.
 *
 * The server pushes a JSON event per new notification (admin broadcast,
 * resource update, etc.) to every connected user. This composable opens an
 * EventSource on mount when the user is signed in, parses each `data:`
 * payload, and invokes a caller-supplied handler so views/stores can update
 * counts and lists in real time without a refetch.
 *
 * IMPORTANT — the server emits NAMED events:
 *   event: notification
 *   data: { …payload… }
 *
 * `EventSource.onmessage` fires ONLY for the default unnamed event. Named
 * events require an explicit `addEventListener('notification', …)` — that
 * was the bug behind "broadcast doesn't show up in the other tab".
 *
 * Reconnection: EventSource auto-reconnects on transient network drops.
 * On a hard close we retry once after 3 s, then give up — the SSE stream
 * is best-effort UX, not a correctness layer (source of truth is the
 * `/notifications` list endpoint).
 */
export interface NotificationStreamPayload {
  id: string
  title: string
  body: string
  type: string
  createdAt: string
}

export function useNotificationStream(onEvent: (payload: NotificationStreamPayload) => void) {
  const auth = useAuthStore()
  const connected = ref(false)
  let source: EventSource | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  function close(): void {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (source) {
      source.close()
      source = null
    }
    connected.value = false
  }

  function handleFrame(raw: string): void {
    try {
      const parsed = JSON.parse(raw) as NotificationStreamPayload
      onEvent(parsed)
    } catch {
      // Server should always send valid JSON; ignore corrupt frames rather
      // than blow up the stream.
    }
  }

  function open(): void {
    if (!auth.isAuthenticated || source) return
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
    // `withCredentials: true` ships the access_token cookie set by the
    // server during SSO. Without it the SSE endpoint sees an unauthenticated
    // request and 401s.
    source = new EventSource(`${baseUrl}/v1/notifications/stream`, {
      withCredentials: true,
    })

    source.onopen = () => {
      connected.value = true
    }

    // Server sends `event: notification\ndata: …\n\n`. Register the named
    // listener AND keep onmessage as a fallback for any future unnamed
    // payload (e.g. a heartbeat ping).
    source.addEventListener('notification', (e) => {
      handleFrame((e as MessageEvent).data)
    })
    source.onmessage = (e) => handleFrame(e.data)

    source.onerror = () => {
      // EventSource fires `error` both on disconnect AND while auto-reconnecting.
      // If readyState is CLOSED we won't recover automatically — try once more
      // after a short back-off, then stop.
      if (source && source.readyState === EventSource.CLOSED) {
        close()
        if (!retryTimer) {
          retryTimer = setTimeout(() => {
            retryTimer = null
            open()
          }, 3000)
        }
      } else {
        connected.value = false
      }
    }
  }

  // bfcache eligibility: an open EventSource keeps a long-lived network
  // connection and disqualifies the page from the back/forward cache.
  // Close the stream on `pagehide` and re-open on `pageshow` so the page
  // is restorable from bfcache without losing real-time notifications.
  // (`pagehide` fires for both normal unload and bfcache eviction; we
  // close in both cases because the connection cannot survive either.)
  function handlePageHide(): void {
    close()
  }
  function handlePageShow(event: PageTransitionEvent): void {
    if (event.persisted) {
      // Restored from bfcache — re-open the stream
      open()
    }
  }

  onMounted(() => {
    open()
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
  })
  onUnmounted(() => {
    window.removeEventListener('pagehide', handlePageHide)
    window.removeEventListener('pageshow', handlePageShow)
    close()
  })

  return { connected }
}
