import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'

// 30s default — anything legitimately longer (file uploads, AI streaming) should
// supply its own timeout per request. A long blanket timeout encourages slowloris-
// style holds on the browser socket pool.
const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30_000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// CSRF: token fetched from backend endpoint (httpOnly cookie; JS cannot read it directly)
let csrfToken: string | null = null

export async function fetchCsrfToken(): Promise<void> {
  try {
    // Use fetch() instead of axios to avoid browser console errors
    // when the backend is unavailable (XHR logs all non-2xx as errors)
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
    const res = await fetch(`${baseUrl}/auth/csrf-token`, { credentials: 'include' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    csrfToken = data?.data?.token || data?.token || null
  } catch {
    csrfToken = null
  }
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.headers['X-Request-ID'] = crypto.randomUUID()
  if (csrfToken && config.method !== 'get') {
    config.headers.set('X-CSRF-Token', csrfToken)
  }
  return config
})

// Token refresh queues: prevent concurrent refresh attempts (thundering herd)
let isRefreshing = false
let isRefreshingCsrf = false
const pendingRequests: Array<() => void> = []
const csrfQueue: Array<() => void> = []

function drainQueue(queue: Array<() => void>): void {
  queue.forEach((cb) => cb())
  queue.length = 0
}

// Legacy alias
function processQueue(): void { drainQueue(pendingRequests) }

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const original = error.config
    if (!original || !error.response) return Promise.reject(error)

    const status = error.response.status
    const retryable = original as InternalAxiosRequestConfig & { _retried?: boolean; _csrfRetried?: boolean }

    // 401 → attempt token refresh
    if (status === 401 && !retryable._retried) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          pendingRequests.push(() => resolve(api(original)))
        })
      }

      isRefreshing = true
      retryable._retried = true

      try {
        await api.post('/auth/refresh')
        processQueue()
        return api(original)
      } catch {
        processQueue()
        window.dispatchEvent(new CustomEvent('auth:expired'))
        reportSecurityEvent('auth_expired', { trigger: '401_refresh_failed' })
        return Promise.reject(error)
      } finally {
        isRefreshing = false
      }
    }

    // 403 with CSRF mismatch → re-fetch token and retry (with queuing for concurrent requests)
    if (status === 403 && !retryable._csrfRetried) {
      const body = error.response.data as Record<string, unknown> | undefined
      const errorCode = (body?.error as Record<string, unknown>)?.code || body?.code
      if (errorCode === 'CSRF_MISSING' || errorCode === 'CSRF_MISMATCH') {
        retryable._csrfRetried = true

        if (isRefreshingCsrf) {
          return new Promise((resolve) => {
            csrfQueue.push(() => {
              if (csrfToken) retryable.headers.set('X-CSRF-Token', csrfToken)
              resolve(api(retryable))
            })
          })
        }

        isRefreshingCsrf = true
        try {
          await fetchCsrfToken()
          if (csrfToken) retryable.headers.set('X-CSRF-Token', csrfToken)
          drainQueue(csrfQueue)
          return api(retryable)
        } catch {
          drainQueue(csrfQueue)
          return Promise.reject(error)
        } finally {
          isRefreshingCsrf = false
        }
      }
    }

    // 429 → back off and retry once
    if (status === 429 && !retryable._retried) {
      retryable._retried = true
      const retryAfter = Number(error.response.headers['retry-after']) || 2
      const delayMs = Math.min(retryAfter * 1000, 10_000)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return api(retryable)
    }

    return Promise.reject(error)
  },
)

/**
 * Report security-relevant events to the backend for audit logging.
 * Fire-and-forget; failures are silently ignored to avoid recursive error loops.
 */
export function reportSecurityEvent(
  eventType: 'auth_expired' | 'csrf_mismatch' | 'unauthorized' | 'rate_limited',
  context?: Record<string, unknown>,
): void {
  const payload = {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    url: window.location.pathname,
    ...context,
  }
  api.post('/audit/security-event', payload).catch(() => {
    // Silently ignore — audit logging must not break the user flow
  })
}

export default api

export interface ApiError {
  message: string
  status: number
  code?: string
}

/**
 * Parse API errors into a safe, user-friendly format.
 * In production, raw server messages are replaced with generic text
 * to prevent information leakage.
 */
export function parseApiError(err: unknown): ApiError {
  const isProd = import.meta.env.PROD

  if (axios.isAxiosError(err) && err.response) {
    const status = err.response.status
    const serverMsg = err.response.data?.message as string | undefined

    return {
      message: isProd ? genericMessage(status) : (serverMsg || err.message),
      status,
      code: err.response.data?.code,
    }
  }
  return {
    message: 'An unexpected error occurred. Please try again.',
    status: 0,
  }
}

function genericMessage(status: number): string {
  if (status === 400) return 'The request was invalid. Please check your input.'
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return 'You do not have permission to perform this action.'
  if (status === 404) return 'The requested resource was not found.'
  if (status === 429) return 'Too many requests. Please wait a moment and try again.'
  if (status >= 500) return 'A server error occurred. Please try again later.'
  return 'An unexpected error occurred. Please try again.'
}
