import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import api from '@/lib/api'

/**
 * Role hierarchy — least-to-most privileged. MUST stay aligned with the
 * server's ROLE_HIERARCHY in server/src/middleware/authorize.ts AND the
 * DB CHECK constraint in migrations/019_expand_role_check.sql.
 *
 * Legacy 'user' values surviving from the original (user | admin) schema are
 * normalised to 'viewer' by the server before they reach the client, so the
 * client never has to handle the legacy alias.
 */
export const ROLE_HIERARCHY = ['viewer', 'submitter', 'editor', 'manager', 'admin', 'super_admin'] as const
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
      // Use fetch() instead of axios to avoid browser console errors
      // when the backend is unavailable (XHR logs all non-2xx as errors)
      const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
      const res = await fetch(`${baseUrl}/auth/me`, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Server wraps responses in { success, data } — unwrap to the User shape.
      const body = await res.json()
      user.value = (body?.data ?? body) as User
    } catch {
      user.value = null
    } finally {
      loading.value = false
      initialized.value = true
    }
  }

  /**
   * Redirect the browser to the chosen SSO provider's authorize endpoint.
   * The backend handles the OAuth dance and lands the user back on a
   * redirect path captured before the round-trip.
   *
   * This template is SSO-only — there is no /auth/login or /auth/register.
   */
  async function login(provider: 'google' | 'microsoft'): Promise<void> {
    window.location.href = `/api/auth/${provider}`
  }

  /**
   * True when Microsoft SSO is not configured on the backend. Surfaced so
   * the AuthPage can disable the Microsoft button rather than dead-link it.
   * The check is best-effort — backend returns a 503 on /auth/microsoft when
   * credentials are missing; we trip this flag after one failed attempt.
   */
  const microsoftDisabled = ref(false)

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
    user, loading, initialized, microsoftDisabled,
    isAuthenticated, isAdmin, isManager, isEditor,
    hasMinRole,
    fetchUser, login, logout, resetIdleTimer,
  }
})
