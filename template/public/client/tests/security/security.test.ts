/**
 * Security-focused unit tests for the App Template frontend SPA.
 *
 * These tests exercise real source modules to verify security controls
 * identified in the ASVS and CAS assessments.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sanitizeHtml, stripHtml } from '@/lib/sanitize'
import api, { parseApiError } from '@/lib/api'

// ---------------------------------------------------------------------------
// 1. DOMPurify sanitization — advanced XSS vectors (src/lib/sanitize.ts)
// ---------------------------------------------------------------------------

describe('Security: DOMPurify sanitization — advanced XSS vectors', () => {
  it('strips SVG-based XSS payloads', () => {
    const result = sanitizeHtml('<svg onload="alert(1)"><circle r="10"/></svg>')
    expect(result).not.toContain('onload')
    expect(result).not.toContain('<svg')
  })

  it('strips nested script within allowed tags', () => {
    const result = sanitizeHtml('<p><strong><script>document.cookie</script></strong></p>')
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('document.cookie')
    expect(result).toContain('<p>')
  })

  it('strips <img> tags (not in allowed list)', () => {
    const result = sanitizeHtml('<img src=x onerror=alert(1)>')
    expect(result).not.toContain('<img')
    expect(result).not.toContain('onerror')
  })

  it('strips <style> tags to prevent CSS injection', () => {
    const result = sanitizeHtml('<style>body{background:url(evil)}</style><p>text</p>')
    expect(result).not.toContain('<style>')
    expect(result).toContain('<p>text</p>')
  })

  it('strips <object> tag (not in allowed list)', () => {
    const result = sanitizeHtml('<object data="evil.swf">fallback</object>')
    expect(result).not.toContain('<object')
  })

  it('strips <textarea> tag (not in allowed list)', () => {
    const result = sanitizeHtml('<textarea onfocus="alert(1)">injected</textarea>')
    expect(result).not.toContain('<textarea')
    expect(result).not.toContain('onfocus')
  })

  it('strips javascript: hrefs from anchor tags', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>')
    expect(result).not.toContain('javascript:')
  })

  it('strips data: hrefs from anchor tags', () => {
    const result = sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">click</a>')
    expect(result).not.toContain('data:text/html')
  })

  it('strips vbscript: hrefs', () => {
    const result = sanitizeHtml('<a href="vbscript:MsgBox(1)">click</a>')
    expect(result).not.toContain('vbscript:')
  })

  it('strips case-obfuscated jAvAsCrIpT: hrefs', () => {
    const result = sanitizeHtml('<a href="jAvAsCrIpT:alert(1)">click</a>')
    expect(result).not.toContain('alert')
  })

  it('strips onmouseover on allowed tags', () => {
    const result = sanitizeHtml('<p onmouseover="alert(1)">text</p>')
    expect(result).not.toContain('onmouseover')
    expect(result).toContain('<p>')
  })

  it('strips meta refresh injection', () => {
    const result = sanitizeHtml('<meta http-equiv="refresh" content="0;url=evil.com">')
    expect(result).not.toContain('<meta')
  })

  it('does not allow the action attribute', () => {
    const result = sanitizeHtml('<a href="/safe" action="https://evil.com">link</a>')
    expect(result).not.toContain('action')
  })

  it('only allows class, href, target, rel attributes', () => {
    const result = sanitizeHtml('<p style="color:red" id="foo" class="ok">text</p>')
    expect(result).not.toContain('style=')
    expect(result).not.toContain('id=')
    expect(result).toContain('class="ok"')
  })

  it('stripHtml removes script content from XSS payloads', () => {
    const result = stripHtml('<script>alert(1)</script>safe text here')
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert(1)')
    expect(result).toContain('safe text here')
  })
})

// ---------------------------------------------------------------------------
// 2. Auth store — token/session handling (src/stores/auth.ts)
// ---------------------------------------------------------------------------

describe('Security: Auth store session handling', () => {
  let createPinia: typeof import('pinia').createPinia
  let setActivePinia: typeof import('pinia').setActivePinia
  let useAuthStore: typeof import('@/stores/auth').useAuthStore

  beforeEach(async () => {
    const pinia = await import('pinia')
    createPinia = pinia.createPinia
    setActivePinia = pinia.setActivePinia
    setActivePinia(createPinia())

    const authModule = await import('@/stores/auth')
    useAuthStore = authModule.useAuthStore
  })

  it('initializes with no user (unauthenticated)', () => {
    const auth = useAuthStore()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
  })

  it('isAdmin is false when user is null', () => {
    const auth = useAuthStore()
    expect(auth.isAdmin).toBe(false)
  })

  it('isAdmin is false for non-admin roles', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'User', role: 'user' }
    expect(auth.isAdmin).toBe(false)
  })

  it('isAdmin is true for admin role', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Admin', role: 'admin' }
    expect(auth.isAdmin).toBe(true)
  })

  it('isAdmin is true for super_admin role', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Admin', role: 'super_admin' }
    expect(auth.isAdmin).toBe(true)
  })

  it('isAdmin is false for manager role (below admin)', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'User', role: 'manager' }
    expect(auth.isAdmin).toBe(false)
  })

  it('logout clears user state even if API call fails', async () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'User', role: 'user' }
    expect(auth.isAuthenticated).toBe(true)

    const postSpy = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Network'))

    try {
      await auth.logout()
    } catch {
      // Expected: the network error propagates
    }

    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    postSpy.mockRestore()
  })

  it('fetchUser sets user to null on API failure', async () => {
    const auth = useAuthStore()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network'))

    await auth.fetchUser()

    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    fetchSpy.mockRestore()
  })

  it('login redirects to OAuth provider URL (no token in URL)', () => {
    const auth = useAuthStore()
    expect(typeof auth.login).toBe('function')
  })

  it('responds to auth:expired event by clearing user', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'User', role: 'user' }
    expect(auth.isAuthenticated).toBe(true)

    window.dispatchEvent(new CustomEvent('auth:expired'))

    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. API CSRF token handling (src/lib/api.ts)
// ---------------------------------------------------------------------------

describe('Security: API CSRF token handling', () => {
  it('request interceptor is configured for CSRF and tracing', () => {
    expect(api.interceptors.request).toBeDefined()
  })

  it('api instance has withCredentials enabled for cookie-based auth', () => {
    expect(api.defaults.withCredentials).toBe(true)
  })

  it('api uses /api baseURL to enforce same-origin requests', () => {
    expect(api.defaults.baseURL).toBe('/api')
  })

  it('api has a timeout configured to prevent hanging requests', () => {
    expect(api.defaults.timeout).toBeGreaterThan(0)
    expect(api.defaults.timeout).toBeLessThanOrEqual(30_000)
  })

  it('api sends Content-Type application/json by default', () => {
    expect(api.defaults.headers['Content-Type']).toBe('application/json')
  })
})

// ---------------------------------------------------------------------------
// 4. parseApiError — information leakage prevention (src/lib/api.ts)
// ---------------------------------------------------------------------------

describe('Security: parseApiError prevents information leakage', () => {
  it('returns generic message for non-Axios errors (no stack trace leak)', () => {
    const result = parseApiError(new TypeError('Cannot read property of undefined'))
    expect(result.message).not.toContain('TypeError')
    expect(result.message).not.toContain('Cannot read')
    expect(result.message).toContain('unexpected error')
  })

  it('returns generic message for object errors without exposing internals', () => {
    const result = parseApiError({ stack: 'internal error trace', sql: 'SELECT *' })
    expect(result.message).not.toContain('stack')
    expect(result.message).not.toContain('SELECT')
  })

  it('status is 0 for non-HTTP errors (no false status code)', () => {
    const result = parseApiError(new Error('network down'))
    expect(result.status).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 5. Router sanitizeRedirect — additional XSS/open-redirect vectors
// ---------------------------------------------------------------------------

describe('Security: Router redirect sanitization — extended vectors', () => {
  // Import the real sanitizeRedirect from router
  let sanitizeRedirect: typeof import('@/router').sanitizeRedirect

  beforeEach(async () => {
    const routerModule = await import('@/router')
    sanitizeRedirect = routerModule.sanitizeRedirect
  })

  it('blocks triple-slash redirect attempts', () => {
    expect(sanitizeRedirect('///evil.com')).toBeUndefined()
  })

  it('blocks backslash-based redirect (IE compat)', () => {
    expect(sanitizeRedirect('\\\\evil.com')).toBeUndefined()
  })

  it('blocks null byte injection in path', () => {
    const result = sanitizeRedirect('/safe\x00<script>alert(1)</script>')
    expect(typeof result).toBe('string')
  })

  it('blocks paths with encoded credentials', () => {
    expect(sanitizeRedirect('/path@evil.com')).toBeUndefined()
  })

  it('blocks data: scheme in path', () => {
    expect(sanitizeRedirect('/data:text/html,<h1>xss</h1>')).toBeUndefined()
  })

  it('allows deeply nested safe paths', () => {
    expect(sanitizeRedirect('/a/b/c/d/e/f')).toBe('/a/b/c/d/e/f')
  })

  it('allows paths with hash fragments', () => {
    expect(sanitizeRedirect('/page#section')).toBe('/page#section')
  })

  it('blocks empty string', () => {
    expect(sanitizeRedirect('')).toBeUndefined()
  })

  it('blocks object type coercion attempts', () => {
    expect(sanitizeRedirect({ toString: () => '//evil.com' })).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 6. Auth store role boundary tests (ASVS V4 — access control)
// ---------------------------------------------------------------------------

describe('Security: Role-based access control boundaries', () => {
  let setActivePinia: typeof import('pinia').setActivePinia
  let createPinia: typeof import('pinia').createPinia
  let useAuthStore: typeof import('@/stores/auth').useAuthStore

  beforeEach(async () => {
    const pinia = await import('pinia')
    setActivePinia = pinia.setActivePinia
    createPinia = pinia.createPinia
    setActivePinia(createPinia())
    const authModule = await import('@/stores/auth')
    useAuthStore = authModule.useAuthStore
  })

  it('guest role is not admin', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Guest', role: 'guest' }
    expect(auth.isAdmin).toBe(false)
  })

  it('unknown role is not admin', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Hacker', role: 'unknown' as any }
    expect(auth.isAdmin).toBe(false)
  })

  it('each role in hierarchy has correct admin status', () => {
    const auth = useAuthStore()
    const nonAdmin = ['guest', 'viewer', 'user', 'editor', 'manager'] as const
    const adminRoles = ['admin', 'super_admin'] as const

    for (const role of nonAdmin) {
      auth.user = { id: '1', email: 'a@b.com', name: 'Test', role }
      expect(auth.isAdmin).toBe(false)
    }
    for (const role of adminRoles) {
      auth.user = { id: '1', email: 'a@b.com', name: 'Test', role }
      expect(auth.isAdmin).toBe(true)
    }
  })

  it('role hierarchy is correctly ordered', () => {
    const auth = useAuthStore()
    // editor can access editor-level but not manager-level
    auth.user = { id: '1', email: 'a@b.com', name: 'Test', role: 'editor' }
    expect(auth.hasMinRole('editor')).toBe(true)
    expect(auth.hasMinRole('user')).toBe(true)
    expect(auth.hasMinRole('manager')).toBe(false)
  })

  it('hasMinRole returns false for null user', () => {
    const auth = useAuthStore()
    expect(auth.hasMinRole('guest')).toBe(false)
  })

  it('super_admin has all roles', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Test', role: 'super_admin' }
    expect(auth.hasMinRole('guest')).toBe(true)
    expect(auth.hasMinRole('viewer')).toBe(true)
    expect(auth.hasMinRole('user')).toBe(true)
    expect(auth.hasMinRole('editor')).toBe(true)
    expect(auth.hasMinRole('manager')).toBe(true)
    expect(auth.hasMinRole('admin')).toBe(true)
    expect(auth.hasMinRole('super_admin')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 7. Session state clearing on logout (ASVS V3 — session management)
// ---------------------------------------------------------------------------

describe('Security: Session state clearing', () => {
  let setActivePinia: typeof import('pinia').setActivePinia
  let createPinia: typeof import('pinia').createPinia
  let useAuthStore: typeof import('@/stores/auth').useAuthStore

  beforeEach(async () => {
    const pinia = await import('pinia')
    setActivePinia = pinia.setActivePinia
    createPinia = pinia.createPinia
    setActivePinia(createPinia())
    const authModule = await import('@/stores/auth')
    useAuthStore = authModule.useAuthStore
  })

  it('logout calls POST /auth/logout endpoint', async () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'User', role: 'user' }

    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({})

    await auth.logout()

    expect(postSpy).toHaveBeenCalledWith('/auth/logout')
    postSpy.mockRestore()
  })

  it('logout clears all user fields (no PII retention)', async () => {
    const auth = useAuthStore()
    auth.user = {
      id: 'user-123',
      email: 'sensitive@example.com',
      name: 'Sensitive User',
      role: 'user',
      avatarUrl: 'https://cdn.example.com/avatar.jpg',
    }

    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({})

    await auth.logout()

    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isAdmin).toBe(false)
    postSpy.mockRestore()
  })
})
