# Skill: API Client & Security Interceptors

This skill defines the standard pattern for building a secure Axios-based API client for Vue/TypeScript frontends. It covers CSRF protection, automatic token refresh, rate-limit handling, error sanitization, security event reporting, and HTML sanitization via DOMPurify.

All code below is taken directly from the reference template and should be implemented as-is unless project requirements dictate otherwise.

---

## 1. Axios Instance Setup

Create a single shared Axios instance at `src/lib/api.ts`. All API calls throughout the app use this instance so that interceptors apply globally.

```typescript
import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15_000,
  withCredentials: true,      // Required: sends cookies (session, CSRF) with every request
  headers: {
    'Content-Type': 'application/json',
  },
})
```

Key points:
- `withCredentials: true` makes the browser attach cookies on cross-origin requests. This is mandatory for cookie-based session auth and CSRF.
- `baseURL` uses `VITE_API_BASE_URL` env var with `/api` fallback. Set the env var when the backend is on a different host during development.
- `timeout: 15_000` (15 seconds) prevents hung requests from blocking the UI.

---

## 2. CSRF Token Interceptor

The backend provides a `GET /auth/csrf-token` endpoint that returns the CSRF token in the response body and sets an httpOnly cookie. The frontend stores the body token in memory and attaches it as the `X-CSRF-Token` header on every mutating request (non-GET). The backend validates the header against the httpOnly cookie.

```typescript
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
  // Attach unique request ID for distributed tracing
  config.headers['X-Request-ID'] = crypto.randomUUID()

  // Attach CSRF token on mutating requests
  if (csrfToken && config.method !== 'get') {
    config.headers.set('X-CSRF-Token', csrfToken)
  }
  return config
})
```

Why this pattern:
- The CSRF cookie is **httpOnly**: JavaScript cannot read it. This is more secure than a non-httpOnly cookie.
- The token is fetched once via `fetchCsrfToken()` (called during app init or after login) and held in memory.
- The backend validates by comparing the `X-CSRF-Token` header against the httpOnly cookie value.
- GET requests are excluded because they must be side-effect-free (safe methods).

Call `fetchCsrfToken()` during app bootstrap (e.g., in `main.ts` after the auth store's `fetchUser()`).

---

## 3. 401 Refresh Queue Pattern

When a 401 is received, the interceptor tries to refresh the session via `POST /auth/refresh`. If multiple requests 401 simultaneously, only one refresh is attempted; the others are queued and replayed after success.

```typescript
// Token refresh queue: prevent concurrent refresh attempts
let isRefreshing = false
let pendingRequests: Array<() => void> = []

function processQueue(): void {
  pendingRequests.forEach((cb) => cb())
  pendingRequests = []
}
```

Inside the response error interceptor:

```typescript
// 401 → attempt token refresh
if (status === 401 && !retryable._retried) {
  if (isRefreshing) {
    // Another request is already refreshing: queue this one
    return new Promise((resolve) => {
      pendingRequests.push(() => resolve(api(original)))
    })
  }

  isRefreshing = true
  retryable._retried = true

  try {
    await api.post('/auth/refresh')
    processQueue()          // Replay all queued requests with the fresh session
    return api(original)    // Retry the original request
  } catch {
    processQueue()          // Flush the queue (all will fail)
    window.dispatchEvent(new CustomEvent('auth:expired'))
    reportSecurityEvent('auth_expired', { trigger: '401_refresh_failed' })
    return Promise.reject(error)
  } finally {
    isRefreshing = false
  }
}
```

Key points:
- `_retried` flag on the config object prevents infinite retry loops.
- `auth:expired` custom event allows other parts of the app (e.g., the auth store) to react without circular imports.
- The `finally` block always resets `isRefreshing`, even on failure.

---

## 4. 403 CSRF Retry

If the server responds with 403 and a `CSRF_MISSING` or `CSRF_MISMATCH` error code, the interceptor re-fetches the CSRF token from the backend and retries once.

```typescript
// 403 with CSRF mismatch → re-fetch token and retry once
if (status === 403 && !retryable._csrfRetried) {
  const body = error.response.data as Record<string, unknown> | undefined
  const errorCode = (body?.error as Record<string, unknown>)?.code || body?.code
  if (errorCode === 'CSRF_MISSING' || errorCode === 'CSRF_MISMATCH') {
    retryable._csrfRetried = true
    await fetchCsrfToken()
    if (csrfToken) {
      retryable.headers.set('X-CSRF-Token', csrfToken)
    }
    return api(retryable)
  }
}
```

Why this matters:
- CSRF tokens rotate. If the in-memory token is stale, this retry fetches a fresh one from the backend.
- Uses a separate `_csrfRetried` flag so it doesn't interfere with the 401 retry logic.
- Only retries when the response body explicitly says `CSRF_MISSING` or `CSRF_MISMATCH`.
- The `errorCode` extraction handles both response formats: `{ error: { code } }` (standard error envelope) and `{ code }` (flat).

**Concurrent request queuing:** When multiple requests fire simultaneously (e.g., file upload queue, drag-and-drop), they may all fail with 403 at the same time. Use the same queuing pattern as the 401 refresh; track `isRefreshingCsrf` and push concurrent failures into a `csrfQueue` that drains after the single refresh completes. Without this, each request independently calls `fetchCsrfToken()`, causing a thundering herd of redundant CSRF endpoint calls.

### CSRF Token Auto-Refresh

Handle CSRF token expiration transparently in the response interceptor:

```typescript
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const errorCode = error.response?.data?.error?.code || error.response?.data?.code;

    // CSRF token expired or missing: refresh and retry once
    if (error.response?.status === 403
        && (errorCode === 'CSRF_MISSING' || errorCode === 'CSRF_MISMATCH')
        && !originalRequest._csrfRetry) {
      originalRequest._csrfRetry = true;
      await fetchCsrfToken();
      originalRequest.headers['X-CSRF-Token'] = csrfToken;
      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);
```

CSRF tokens become stale after server restarts or deployments. Without auto-retry, users see mysterious 403 errors. The `_csrfRetry` flag prevents infinite retry loops. The backend returns two distinct error codes: `CSRF_MISSING` (header or cookie absent) and `CSRF_MISMATCH` (tokens don't match); both trigger the same retry.

---

## 5. 429 Rate Limit Retry with `Retry-After`

When the server responds with 429, the interceptor respects the `Retry-After` header (in seconds), caps the delay at 10 seconds, and retries once.

```typescript
// 429 → back off and retry once
if (status === 429 && !retryable._retried) {
  retryable._retried = true
  const retryAfter = Number(error.response.headers['retry-after']) || 2
  const delayMs = Math.min(retryAfter * 1000, 10_000)   // Cap at 10s
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  return api(retryable)
}
```

Key points:
- Falls back to 2 seconds if `Retry-After` is missing or unparseable.
- 10-second cap prevents the UI from appearing frozen if the server sends a large value.
- Only retries once (same `_retried` flag as 401).

---

## 6. Full Response Interceptor

For reference, here is the complete response interceptor combining sections 3-5:

```typescript
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

    // 403 with CSRF mismatch → re-fetch token and retry once
    if (status === 403 && !retryable._csrfRetried) {
      const body = error.response.data as Record<string, unknown> | undefined
      const errorCode = (body?.error as Record<string, unknown>)?.code || body?.code
      if (errorCode === 'CSRF_MISSING' || errorCode === 'CSRF_MISMATCH') {
        retryable._csrfRetried = true
        await fetchCsrfToken()
        if (csrfToken) {
          retryable.headers.set('X-CSRF-Token', csrfToken)
        }
        return api(retryable)
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
```

---

## 7. `parseApiError`: Safe Error Parsing

Converts Axios errors into a user-friendly format. In production mode, raw server messages are hidden to prevent information leakage.

```typescript
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
```

Usage in components:

```typescript
import { parseApiError } from '@/lib/api'

try {
  await api.post('/some/endpoint', payload)
} catch (err) {
  const { message } = parseApiError(err)
  toast.error(message)   // Always safe for display to end users
}
```

---

## 8. `reportSecurityEvent`: Fire-and-Forget Audit Logging

Reports security-relevant events to the backend. Failures are silently ignored to prevent recursive error loops (the audit endpoint itself might 401).

```typescript
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
    // Silently ignore: audit logging must not break the user flow
  })
}
```

Key points:
- The event type is a union type so callers cannot pass arbitrary strings.
- `.catch(() => {})` swallows promise rejection so unhandled-rejection warnings do not fire.
- The interceptors will still run for this request (e.g., CSRF header), but any failure is swallowed.

---

## 9. DOMPurify Configuration: HTML Sanitization

Located at `src/lib/sanitize.ts`. Two functions cover the two common use cases:

```typescript
import DOMPurify from 'dompurify'

/**
 * Sanitize HTML with an explicit allowlist of safe tags and attributes.
 * Use when rendering user-provided rich text (e.g., blog content, comments).
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  })
}

/**
 * Strip all HTML and return plain text.
 * Use for preview snippets, search results, or anywhere markup is not expected.
 */
export function stripHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [] })
}
```

Key points:
- `sanitizeHtml` uses an explicit allowlist rather than a denylist. This is the safe default: new tags are blocked unless intentionally added.
- `ALLOWED_ATTR` is minimal: `href`, `target`, `rel`, `class`. No `style`, `onclick`, or other dangerous attributes.
- `stripHtml` with `ALLOWED_TAGS: []` removes all HTML, returning only text content. Use this instead of regex-based stripping.
- Always use `sanitizeHtml` before `v-html` in Vue templates. Never pass unsanitized user input to `v-html`.

---

## 10. Frontend API Retry with Exponential Backoff (5xx Errors)

For calls where you want automatic retry on transient server errors (beyond the single-retry 429 handling in the interceptor), implement exponential backoff at the call site:

```typescript
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (
        axios.isAxiosError(err) &&
        err.response &&
        err.response.status >= 500 &&
        attempt < maxRetries
      ) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('Unreachable')
}

// Usage:
const data = await fetchWithRetry(() => api.get('/reports/heavy-query'))
```

This complements the interceptor-level retries: the interceptor handles 401/403/429 transparently, while `fetchWithRetry` is opt-in for specific calls where 5xx transient failures are expected (e.g., heavy queries, external data sources).

---

## Checklist for Implementation

- [ ] Install dependencies: `axios`, `dompurify`, `@types/dompurify`
- [ ] Create `src/lib/api.ts` with the Axios instance (including `X-Request-ID`), interceptors, `parseApiError`, and `reportSecurityEvent`
- [ ] Create `src/lib/sanitize.ts` with `sanitizeHtml` and `stripHtml`
- [ ] Confirm the backend's `GET /auth/csrf-token` endpoint returns the token in the response body and sets an httpOnly cookie
- [ ] Confirm the backend returns `{ code: "CSRF_MISSING" }` or `{ code: "CSRF_MISMATCH" }` on CSRF failures (403)
- [ ] Confirm the backend returns `Retry-After` header on 429 responses
- [ ] Confirm `POST /auth/refresh` endpoint exists for session renewal
- [ ] Confirm `POST /audit/security-event` endpoint exists (or stub it)
- [ ] Use `parseApiError` in all user-facing error handlers
- [ ] Use `sanitizeHtml` before any `v-html` binding
- [ ] Never use `stripHtml` or regex to "sanitize" HTML for rendering; use `sanitizeHtml`
