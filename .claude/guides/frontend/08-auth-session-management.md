# Skill: Authentication & Session Management

This skill defines the standard pattern for authentication state management (Pinia), role-based access control with string-based role hierarchy, idle session timeouts, SSO plus credential-based login, and the `auth:expired` event bridge between the API client and the store.

> **Router guards and redirect sanitization** are covered in skill 03 (Routing & Navigation Guards).
> **API client / CSRF / token-refresh interceptors** are covered in skill 07 (API Client & Security Interceptors).

All code below is taken directly from the reference template and should be implemented as-is unless project requirements dictate otherwise.

---

## 1. Role Hierarchy

Roles use a string-based hierarchy defined as an ordered array. Position in the array determines privilege level; higher index means more privilege. These constants are defined and exported from the auth store so they can be used by guards plus components plus backend alignment.

```typescript
export const ROLE_HIERARCHY = ['guest', 'viewer', 'user', 'editor', 'manager', 'admin', 'super_admin'] as const
export type Role = typeof ROLE_HIERARCHY[number]
```

Why string roles with hierarchy:
- **Readable**: `user.role === 'admin'` is self-documenting.
- **Type-safe**: The `Role` union type prevents typos at compile time.
- **Backend-aligned**: Both Go and Node.js backend skills use string roles (`authorize('admin')`).
- **Hierarchical**: `hasMinRole('editor')` checks position in the array, so `admin` implicitly satisfies `editor`.

---

## 2. Auth Store: Pinia Setup Syntax

Located at `src/stores/auth.ts`. Uses Pinia's `setup` syntax (composition API style) for full TypeScript inference and flexibility.

```typescript
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import api from '@/lib/api'

export const ROLE_HIERARCHY = ['guest', 'viewer', 'user', 'editor', 'manager', 'admin', 'super_admin'] as const
export type Role = typeof ROLE_HIERARCHY[number]

export interface User {
  id: string
  email: string
  name: string
  role: Role
  avatarUrl?: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(false)
  const initialized = ref(false)

  // ---- Computed: auth status ----
  const isAuthenticated = computed(() => !!user.value)

  // ---- Computed: role checks ----
  function hasMinRole(minRole: Role): boolean {
    if (!user.value) return false
    return ROLE_HIERARCHY.indexOf(user.value.role) >= ROLE_HIERARCHY.indexOf(minRole)
  }

  const isAdmin = computed(() => hasMinRole('admin'))
  const isManager = computed(() => hasMinRole('manager'))
  const isEditor = computed(() => hasMinRole('editor'))

  // ---- Actions ----

  async function fetchUser(): Promise<void> {
    loading.value = true
    try {
      const { data } = await api.get<User>('/auth/me')
      user.value = data
    } catch {
      user.value = null       // Any error means "not authenticated"
    } finally {
      loading.value = false
      initialized.value = true  // Mark as initialized even on failure
    }
  }

  /**
   * Initiate OAuth SSO login. Redirects the browser to the backend's OAuth endpoint.
   */
  async function login(provider: 'google' | 'microsoft'): Promise<void> {
    window.location.href = `/api/auth/${provider}`
  }

  /**
   * Log in with email and password. On success, sets user state and returns.
   * On failure, the error propagates to the caller for display.
   */
  async function loginWithCredentials(email: string, password: string): Promise<void> {
    loading.value = true
    try {
      const { data } = await api.post<User>('/auth/login', { email, password })
      user.value = data
      initialized.value = true
    } finally {
      loading.value = false
    }
  }

  /**
   * Register a new account with email and password.
   * On success, sets user state (auto-login after registration).
   */
  async function register(name: string, email: string, password: string): Promise<void> {
    loading.value = true
    try {
      const { data } = await api.post<User>('/auth/register', { name, email, password })
      user.value = data
      initialized.value = true
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } finally {
      user.value = null   // Always clear local state, even if the server call fails
    }
  }

  // ... idle tracking and event listeners (see below)

  return {
    user, loading, initialized,
    isAuthenticated, isAdmin, isManager, isEditor,
    hasMinRole,
    fetchUser, login, loginWithCredentials, register, logout, resetIdleTimer,
  }
})
```

Key design decisions:
- **`initialized` flag**: Distinguishes "haven't checked yet" from "checked and not authenticated." The router guard uses this to decide whether to call `fetchUser`.
- **`role` as a string**: Roles use a string-based hierarchy where position in the `ROLE_HIERARCHY` array determines privilege level. The `hasMinRole` function compares array indices, so `admin` implicitly satisfies `editor`. The `Role` type provides compile-time safety against typos.
- **`login` does a full redirect**: OAuth flows require a full page navigation to the backend's auth endpoint, not an API call.
- **`loginWithCredentials` for email/password**: Posts to `/auth/login` and sets user state on success. Errors propagate to the calling component for display via `parseApiError`.
- **`register` for account creation**: Posts to `/auth/register`, auto-logs in on success.
- **`finally` block in `logout`**: Always clears `user.value` even if `POST /auth/logout` fails. The user must never remain in an authenticated-looking state after clicking logout.

---

## 3. `auth:expired` Custom Event

The API interceptor (skill 07) dispatches `auth:expired` when a 401 refresh fails. The auth store listens for this event to clear user state without creating a circular dependency between the API module and the store.

```typescript
// Inside the store setup function:
if (typeof window !== 'undefined') {
  window.addEventListener('auth:expired', () => {
    user.value = null
  })
}
```

This pattern allows any part of the app to react to session expiry:
- The auth store clears user state.
- Components can listen and show a re-login modal.
- The router guard will redirect to the auth page on the next navigation.

The `typeof window !== 'undefined'` guard keeps SSR compatible if the app is ever server-rendered.

---

## 4. Idle Session Timeout (ASVS V3.3.1 Compliance)

OWASP ASVS V3.3.1 requires idle session timeouts. The store implements a 30-minute idle timer that logs the user out and redirects to the auth page with a `reason=timeout` query parameter.

```typescript
// Idle session timeout (ASVS V3.3.1)
const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
let idleTimer: ReturnType<typeof setTimeout> | null = null

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer)
  if (!user.value) return       // Don't start timer for unauthenticated users
  idleTimer = setTimeout(() => {
    logout()
    window.location.href = '/auth?reason=timeout'
  }, IDLE_TIMEOUT_MS)
}

function startIdleTracking(): void {
  const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
  events.forEach((evt) => window.addEventListener(evt, resetIdleTimer, { passive: true }))
  resetIdleTimer()
}

function stopIdleTracking(): void {
  const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
  events.forEach((evt) => window.removeEventListener(evt, resetIdleTimer))
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

// Start/stop tracking based on auth state
if (typeof window !== 'undefined') {
  watch(isAuthenticated, (authed) => {
    if (authed) startIdleTracking()
    else stopIdleTracking()
  })
}
```

Key points:
- **Event listeners use `{ passive: true }`** to avoid blocking scroll/touch performance.
- **Events tracked**: `mousedown`, `keydown`, `touchstart`, `scroll`. These cover the mouse / keyboard / touch / scroll surfaces. `mousemove` is intentionally excluded to avoid excessive timer resets from idle cursor drift.
- **`watch(isAuthenticated, ...)`** automatically starts tracking on login and stops on logout. Timer leaks are avoided as a result.
- **`resetIdleTimer` is exported** from the store so that special interactions (e.g., video playback, long form editing) can call it explicitly.
- On timeout, the user is logged out server-side AND redirected. The `reason=timeout` param allows the auth page to display a "session timed out" message.

---

## 5. Complete File: `src/stores/auth.ts`

For reference, here is the complete auth store:

```typescript
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import api from '@/lib/api'

export const ROLE_HIERARCHY = ['guest', 'viewer', 'user', 'editor', 'manager', 'admin', 'super_admin'] as const
export type Role = typeof ROLE_HIERARCHY[number]

export interface User {
  id: string
  email: string
  name: string
  role: Role
  avatarUrl?: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(false)
  const initialized = ref(false)

  const isAuthenticated = computed(() => !!user.value)

  function hasMinRole(minRole: Role): boolean {
    if (!user.value) return false
    return ROLE_HIERARCHY.indexOf(user.value.role) >= ROLE_HIERARCHY.indexOf(minRole)
  }

  const isAdmin = computed(() => hasMinRole('admin'))
  const isManager = computed(() => hasMinRole('manager'))
  const isEditor = computed(() => hasMinRole('editor'))

  async function fetchUser(): Promise<void> {
    loading.value = true
    try {
      const { data } = await api.get<User>('/auth/me')
      user.value = data
    } catch {
      user.value = null
    } finally {
      loading.value = false
      initialized.value = true
    }
  }

  async function login(provider: 'google' | 'microsoft'): Promise<void> {
    window.location.href = `/api/auth/${provider}`
  }

  async function loginWithCredentials(email: string, password: string): Promise<void> {
    loading.value = true
    try {
      const { data } = await api.post<User>('/auth/login', { email, password })
      user.value = data
      initialized.value = true
    } finally {
      loading.value = false
    }
  }

  async function register(name: string, email: string, password: string): Promise<void> {
    loading.value = true
    try {
      const { data } = await api.post<User>('/auth/register', { name, email, password })
      user.value = data
      initialized.value = true
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } finally {
      user.value = null
    }
  }

  // Listen for token expiry events from API interceptor
  if (typeof window !== 'undefined') {
    window.addEventListener('auth:expired', () => {
      user.value = null
    })
  }

  // Idle session timeout (ASVS V3.3.1)
  const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  function resetIdleTimer(): void {
    if (idleTimer) clearTimeout(idleTimer)
    if (!user.value) return
    idleTimer = setTimeout(() => {
      logout()
      window.location.href = '/auth?reason=timeout'
    }, IDLE_TIMEOUT_MS)
  }

  function startIdleTracking(): void {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach((evt) => window.addEventListener(evt, resetIdleTimer, { passive: true }))
    resetIdleTimer()
  }

  function stopIdleTracking(): void {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach((evt) => window.removeEventListener(evt, resetIdleTimer))
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  if (typeof window !== 'undefined') {
    watch(isAuthenticated, (authed) => {
      if (authed) startIdleTracking()
      else stopIdleTracking()
    })
  }

  return {
    user, loading, initialized,
    isAuthenticated, isAdmin, isManager, isEditor,
    hasMinRole,
    fetchUser, login, loginWithCredentials, register, logout, resetIdleTimer,
  }
})
```

---

## Checklist for Implementation

- [ ] Install dependencies: `pinia`, `vue-router`
- [ ] Create `src/stores/auth.ts` with the full auth store (including `ROLE_HIERARCHY`, `loginWithCredentials`, `register`)
- [ ] Export `ROLE_HIERARCHY` and `Role` type; use `hasMinRole('admin')` in guards, never raw string comparisons
- [ ] Confirm backend provides `GET /auth/me` (returns user or 401), `POST /auth/logout`, `POST /auth/login`, `POST /auth/register`, and OAuth redirect endpoints
- [ ] Confirm `auth:expired` event is dispatched by the API interceptor (skill 07)
- [ ] Set idle timeout to comply with your security policy (30 min is ASVS V3.3.1 default)
- [ ] Add `guestOnly` meta to auth/login routes (skill 03)
- [ ] Use `sanitizeRedirect` for all redirect query params (skill 03)
- [ ] Use `isAdmin`, `isManager`, `isEditor`, or `hasMinRole()` for role checks; never compare against raw strings directly
- [ ] Test: expired session clears user state and redirects
- [ ] Test: idle timeout fires after 30 minutes of inactivity
- [ ] Test: `loginWithCredentials` sets user on success and propagates errors on failure
- [ ] Test: `register` sets user on success (auto-login)
- [ ] Test: role boundary (manager is not admin, admin is admin)
