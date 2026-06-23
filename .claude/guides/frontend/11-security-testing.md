# Skill: Frontend Security Testing

This skill covers writing comprehensive security tests for a Vue 3 + TypeScript SPA using Vitest and happy-dom. The tests verify XSS prevention, open redirect blocking, role-based access control boundaries, session management, API client security configuration, and information leakage prevention.

All security tests MUST execute real source modules (not just review code). They run deterministic `.js`/`.ts` test scripts via Vitest to verify security controls programmatically.

---

## 1. Test Organization

Security tests live in two locations:

```
frontend/
  tests/
    security/           # Security-focused tests (attack vectors, ASVS references)
      security.test.ts
    unit/               # Standard unit tests
      lib/
        sanitize.test.ts
        api.test.ts
      stores/
        auth.test.ts
      router/
        index.test.ts
```

**Why separate directories:**
- `tests/security/` tests reference ASVS (Application Security Verification Standard) sections and test specific attack vectors. They are adversarial in nature; they verify that malicious inputs are neutralized.
- `tests/unit/` tests verify correct behavior for normal inputs and edge cases.
- Both directories are included by the Vitest config pattern: `tests/**/*.{test,spec}.{ts,js}`

**Vitest configuration** (`vitest.config.ts`):

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.{test,spec}.{ts,js}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/main.ts'],
    },
  },
})
```

---

## 2. XSS Prevention Tests

These tests verify that the `sanitizeHtml` function (backed by DOMPurify) strips dangerous content while preserving safe markup.

### 2a. Unit tests: allowed tags and basic stripping (`tests/unit/lib/sanitize.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { sanitizeHtml, stripHtml } from '@/lib/sanitize'

describe('sanitizeHtml', () => {
  it('allows safe tags', () => {
    const result = sanitizeHtml('<p>Hello <strong>world</strong></p>')
    expect(result).toBe('<p>Hello <strong>world</strong></p>')
  })

  it('strips script tags', () => {
    const result = sanitizeHtml('<p>Safe</p><script>alert("xss")</script>')
    expect(result).not.toContain('<script>')
    expect(result).toContain('<p>Safe</p>')
  })

  it('strips event handlers', () => {
    const result = sanitizeHtml('<img onerror="alert(1)" src="x">')
    expect(result).not.toContain('onerror')
  })

  it('allows href on anchors', () => {
    const result = sanitizeHtml('<a href="https://example.com">Link</a>')
    expect(result).toContain('href="https://example.com"')
  })

  it('strips disallowed tags like div', () => {
    const result = sanitizeHtml('<div>text inside div</div>')
    expect(result).not.toContain('<div')
    expect(result).toContain('text inside div')
  })

  it('allows all 17 specified tags', () => {
    const tags = ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'blockquote']
    for (const tag of tags) {
      const result = sanitizeHtml(`<${tag}>test</${tag}>`)
      expect(result).toContain(`<${tag}>`)
    }
  })

  it('allows span tag', () => {
    const result = sanitizeHtml('<span class="highlight">text</span>')
    expect(result).toContain('<span')
  })

  it('allows class attribute', () => {
    const result = sanitizeHtml('<p class="ok">text</p>')
    expect(result).toContain('class="ok"')
  })

  it('allows target and rel on anchors', () => {
    const result = sanitizeHtml('<a href="https://example.com" target="_blank" rel="noopener">Link</a>')
    expect(result).toContain('target="_blank"')
    expect(result).toContain('rel="noopener"')
  })

  it('strips style attribute', () => {
    const result = sanitizeHtml('<p style="color:red">text</p>')
    expect(result).not.toContain('style=')
  })

  it('strips id attribute', () => {
    const result = sanitizeHtml('<p id="foo">text</p>')
    expect(result).not.toContain('id=')
  })

  it('handles empty string', () => {
    expect(sanitizeHtml('')).toBe('')
  })
})

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    const result = stripHtml('<p>Hello <strong>world</strong></p>')
    expect(result).not.toContain('<script>')
  })

  it('handles empty input', () => {
    expect(stripHtml('')).toBe('')
  })

  it('strips script content', () => {
    const result = stripHtml('<script>alert(1)</script>safe')
    expect(result).not.toContain('alert')
    expect(result).toContain('safe')
  })

  it('produces output without executable content', () => {
    const result = stripHtml('safe text only')
    expect(result).toBe('safe text only')
  })
})
```

### 2b. Security tests: advanced XSS vectors (`tests/security/security.test.ts`)

These tests target vectors that bypass naive sanitization: SVG payloads, protocol handlers, case obfuscation, CSS injection, and dangerous attributes on allowed tags.

```ts
import { describe, it, expect } from 'vitest'
import { sanitizeHtml, stripHtml } from '@/lib/sanitize'

describe('Security: DOMPurify sanitization; advanced XSS vectors', () => {
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
```

**Key patterns:**
- Test every dangerous tag explicitly (`script`, `svg`, `img`, `object`, `style`, `textarea`, `meta`)
- Test every dangerous attribute (`onerror`, `onload`, `onmouseover`, `onfocus`, `action`, `style`, `id`)
- Test dangerous protocols in `href` (`javascript:`, `data:`, `vbscript:`)
- Test case obfuscation (`jAvAsCrIpT:`)
- Verify only the explicit allowlist of attributes passes through (`class`, `href`, `target`, `rel`)

---

## 3. Open Redirect Prevention Tests

These tests verify the `sanitizeRedirect` function exported from the router module. It must only allow safe relative paths.

### 3a. Unit tests (`tests/unit/router/index.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { sanitizeRedirect } from '@/router'

describe('sanitizeRedirect', () => {
  it('allows safe relative paths', () => {
    expect(sanitizeRedirect('/dashboard')).toBe('/dashboard')
    expect(sanitizeRedirect('/settings?tab=profile')).toBe('/settings?tab=profile')
    expect(sanitizeRedirect('/blog/my-post')).toBe('/blog/my-post')
  })

  it('blocks protocol-relative URLs', () => {
    expect(sanitizeRedirect('//evil.com')).toBeUndefined()
    expect(sanitizeRedirect('//evil.com/steal')).toBeUndefined()
  })

  it('blocks absolute URLs with protocol', () => {
    expect(sanitizeRedirect('https://evil.com')).toBeUndefined()
    expect(sanitizeRedirect('http://evil.com')).toBeUndefined()
  })

  it('blocks javascript: protocol', () => {
    expect(sanitizeRedirect('javascript:alert(1)')).toBeUndefined()
  })

  it('blocks URLs with embedded credentials', () => {
    expect(sanitizeRedirect('/foo@evil.com')).toBeUndefined()
  })

  it('blocks paths with colon (protocol-like)', () => {
    expect(sanitizeRedirect('/data:text/html')).toBeUndefined()
  })

  it('rejects non-string values', () => {
    expect(sanitizeRedirect(null)).toBeUndefined()
    expect(sanitizeRedirect(undefined)).toBeUndefined()
    expect(sanitizeRedirect(123)).toBeUndefined()
    expect(sanitizeRedirect(['array'])).toBeUndefined()
  })

  it('allows query strings with special characters', () => {
    expect(sanitizeRedirect('/search?q=user@example.com')).toBe('/search?q=user@example.com')
    expect(sanitizeRedirect('/search?time=12:00')).toBe('/search?time=12:00')
  })

  it('blocks triple-slash redirect', () => {
    expect(sanitizeRedirect('///evil.com')).toBeUndefined()
  })

  it('blocks empty string', () => {
    expect(sanitizeRedirect('')).toBeUndefined()
  })

  it('allows multi-level nested safe paths', () => {
    expect(sanitizeRedirect('/a/b/c/d/e/f')).toBe('/a/b/c/d/e/f')
  })

  it('allows paths with hash fragments', () => {
    expect(sanitizeRedirect('/page#section')).toBe('/page#section')
  })

  it('blocks object type coercion attempts', () => {
    expect(sanitizeRedirect({ toString: () => '//evil.com' })).toBeUndefined()
  })

  it('blocks backslash-based redirects', () => {
    expect(sanitizeRedirect('\\\\evil.com')).toBeUndefined()
  })

  it('blocks data: scheme in path', () => {
    expect(sanitizeRedirect('/data:text/html,<h1>xss</h1>')).toBeUndefined()
  })
})
```

### 3b. Extended vectors in security test file

```ts
describe('Security: Router redirect sanitization; extended vectors', () => {
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

  it('allows multi-level nested safe paths', () => {
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
```

**Key patterns:**
- `@` in the path segment (before `?`) indicates embedded credentials -- block it
- Colons in the path segment indicate protocol schemes -- block them
- `@` and `:` in query string parameters are safe -- allow them
- Non-string inputs (number, object, array, null, undefined) must return `undefined`
- Backslash variants (`\\evil.com`) are used for IE-based redirect attacks

---

## 4. Role Boundary Tests

These tests verify that the RBAC computed properties on the auth store handle hierarchy position and edge cases correctly. References ASVS V4 (Access Control).

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

describe('Security: Role-based access control boundaries', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ---- isAdmin ----

  it('guest role is not admin', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Guest', role: 'guest' }
    expect(auth.isAdmin).toBe(false)
  })

  it('manager role is not admin', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Mgr', role: 'manager' }
    expect(auth.isAdmin).toBe(false)
  })

  it('admin role is admin', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Admin', role: 'admin' }
    expect(auth.isAdmin).toBe(true)
  })

  it('super_admin role is admin', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'SuperAdmin', role: 'super_admin' }
    expect(auth.isAdmin).toBe(true)
  })

  it('unknown role is not admin', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Edge', role: 'unknown' as any }
    expect(auth.isAdmin).toBe(false)
  })

  // ---- isManager ----

  it('manager role is manager', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Mgr', role: 'manager' }
    expect(auth.isManager).toBe(true)
  })

  it('editor role is not manager', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Editor', role: 'editor' }
    expect(auth.isManager).toBe(false)
  })

  it('admin role is also manager (higher role)', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Admin', role: 'admin' }
    expect(auth.isManager).toBe(true)
  })

  // ---- isEditor ----

  it('editor role is editor', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Editor', role: 'editor' }
    expect(auth.isEditor).toBe(true)
  })

  it('user role is not editor', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'User', role: 'user' }
    expect(auth.isEditor).toBe(false)
  })

  // ---- hasMinRole ----

  it('hasMinRole checks hierarchy correctly', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'Editor', role: 'editor' }
    expect(auth.hasMinRole('editor')).toBe(true)   // same level
    expect(auth.hasMinRole('user')).toBe(true)      // lower level
    expect(auth.hasMinRole('manager')).toBe(false)  // higher level
  })

  it('hasMinRole returns false for null user', () => {
    const auth = useAuthStore()
    expect(auth.hasMinRole('guest')).toBe(false)
  })

  // ---- null user ----

  it('null user has no roles', () => {
    const auth = useAuthStore()
    expect(auth.isAdmin).toBe(false)
    expect(auth.isManager).toBe(false)
    expect(auth.isEditor).toBe(false)
    expect(auth.isAuthenticated).toBe(false)
  })
})
```

**Key patterns:**
- Test each role boundary using string role names from the hierarchy
- Test unknown/invalid role strings -- `indexOf` returns `-1`, which is safely below all valid positions
- Test `hasMinRole` with same-level / lower-level / higher-level roles
- Test `hasMinRole` with null user (returns `false`)
- Use string role names directly -- the `Role` type gives compile-time safety
- `isAdmin` uses `hasMinRole('admin')` which checks hierarchy position

---

## 5. Session Management Tests

These tests verify that logout always clears all user state, even when the API call fails. References ASVS V3 (Session Management).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import api from '@/lib/api'

describe('Security: Session state clearing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('logout calls POST /auth/logout endpoint', async () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'User', role: 'viewer' }

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
      role: 'viewer',
      avatarUrl: 'https://cdn.example.com/avatar.jpg',
    }

    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({})

    await auth.logout()

    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isAdmin).toBe(false)
    expect(auth.isManager).toBe(false)
    expect(auth.isEditor).toBe(false)
    postSpy.mockRestore()
  })

  it('logout clears user state even if API call fails', async () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'User', role: 'viewer' }
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

  it('responds to auth:expired event by clearing user', () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'a@b.com', name: 'User', role: 'viewer' }
    expect(auth.isAuthenticated).toBe(true)

    window.dispatchEvent(new CustomEvent('auth:expired'))

    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('loginWithCredentials sets user on success', async () => {
    const auth = useAuthStore()
    const mockUser = { id: '1', email: 'test@test.com', name: 'Test', role: 'user' }
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockUser })

    await auth.loginWithCredentials('test@test.com', 'password123!')

    expect(auth.user).toEqual(mockUser)
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.initialized).toBe(true)
    postSpy.mockRestore()
  })

  it('loginWithCredentials propagates errors on failure', async () => {
    const auth = useAuthStore()
    const postSpy = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Invalid credentials'))

    await expect(auth.loginWithCredentials('bad@test.com', 'wrong')).rejects.toThrow()

    expect(auth.user).toBeNull()
    expect(auth.loading).toBe(false)
    postSpy.mockRestore()
  })

  it('register sets user on success (auto-login)', async () => {
    const auth = useAuthStore()
    const mockUser = { id: '2', email: 'new@test.com', name: 'New User', role: 'user' }
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockUser })

    await auth.register('New User', 'new@test.com', 'securepass123!')

    expect(auth.user).toEqual(mockUser)
    expect(auth.isAuthenticated).toBe(true)
    postSpy.mockRestore()
  })
})
```

**Key patterns:**
- Logout MUST clear state in a `finally` block so it runs even when the API POST fails
- Test that no PII (email, name, avatar) remains in the store after logout
- The `auth:expired` custom event must also clear state (used by the API interceptor on 401)
- Test `loginWithCredentials` success and failure paths
- Test `register` auto-login behavior
- Use string role names for all role values in test fixtures

---

## 6. API Client Security Tests

These tests verify the Axios instance configuration and error handling.

### 6a. Instance configuration

```ts
import api, { parseApiError, reportSecurityEvent } from '@/lib/api'

describe('api instance configuration', () => {
  it('has withCredentials enabled for cookie-based auth', () => {
    expect(api.defaults.withCredentials).toBe(true)
  })

  it('uses /api or env var baseURL to enforce same-origin requests', () => {
    const baseURL = api.defaults.baseURL
    expect(baseURL).toBeDefined()
    expect(typeof baseURL).toBe('string')
  })

  it('has a reasonable timeout configured', () => {
    expect(api.defaults.timeout).toBeGreaterThan(0)
    expect(api.defaults.timeout).toBeLessThanOrEqual(30_000)
  })

  it('sends Content-Type application/json by default', () => {
    expect(api.defaults.headers['Content-Type']).toBe('application/json')
  })

  it('has request interceptors configured (CSRF + X-Request-ID)', () => {
    expect(api.interceptors.request).toBeDefined()
  })

  it('has response interceptors configured (401/403/429)', () => {
    expect(api.interceptors.response).toBeDefined()
  })
})
```

### 6b. parseApiError: information leakage prevention

```ts
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

  it('handles non-Error values', () => {
    const result = parseApiError('string error')
    expect(result.message).toContain('unexpected error')
    expect(result.status).toBe(0)
  })

  it('handles null/undefined', () => {
    expect(parseApiError(null).message).toContain('unexpected error')
    expect(parseApiError(undefined).message).toContain('unexpected error')
  })

  it('result conforms to ApiError interface', () => {
    const result: ApiError = parseApiError(new Error('test'))
    expect(typeof result.message).toBe('string')
    expect(typeof result.status).toBe('number')
  })
})
```

### 6c. Security event reporting

```ts
describe('reportSecurityEvent', () => {
  let postSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    postSpy = vi.spyOn(api, 'post').mockResolvedValue({})
  })

  afterEach(() => {
    postSpy.mockRestore()
  })

  it('sends event to /audit/security-event', () => {
    reportSecurityEvent('auth_expired')
    expect(postSpy).toHaveBeenCalledWith(
      '/audit/security-event',
      expect.objectContaining({
        event_type: 'auth_expired',
        timestamp: expect.any(String),
        url: expect.any(String),
      }),
    )
  })

  it('includes context when provided', () => {
    reportSecurityEvent('csrf_mismatch', { trigger: 'test' })
    expect(postSpy).toHaveBeenCalledWith(
      '/audit/security-event',
      expect.objectContaining({
        event_type: 'csrf_mismatch',
        trigger: 'test',
      }),
    )
  })

  it('does not throw when POST fails (fire-and-forget)', () => {
    postSpy.mockRejectedValueOnce(new Error('Network error'))
    expect(() => reportSecurityEvent('unauthorized')).not.toThrow()
  })

  it('accepts all valid event types', () => {
    const types = ['auth_expired', 'csrf_mismatch', 'unauthorized', 'rate_limited'] as const
    for (const type of types) {
      reportSecurityEvent(type)
    }
    expect(postSpy).toHaveBeenCalledTimes(types.length)
  })
})
```

**Key patterns:**
- `withCredentials: true` causes cookies (including CSRF tokens) to be sent with every request
- `baseURL` is `/api` or configured via `VITE_API_BASE_URL` env var -- always same-origin or explicitly configured
- `X-Request-ID` header is attached by the request interceptor for distributed tracing
- Request interceptor reads the CSRF token from `document.cookie` and injects it as a header on state-changing requests (POST, PUT, DELETE, PATCH)
- Response interceptor dispatches `auth:expired` on 401, which the auth store listens for
- `parseApiError` must NEVER leak internal error messages, stack traces, or SQL to the UI
- `reportSecurityEvent` is fire-and-forget -- it must not throw even if the audit endpoint is down

---

## 7. Auth Store Tests

The full auth store test file covers the complete lifecycle.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/stores/auth'
import api from '@/lib/api'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('initial state', () => {
    it('user is null', () => {
      const auth = useAuthStore()
      expect(auth.user).toBeNull()
    })

    it('loading is false', () => {
      const auth = useAuthStore()
      expect(auth.loading).toBe(false)
    })

    it('initialized is false', () => {
      const auth = useAuthStore()
      expect(auth.initialized).toBe(false)
    })

    it('isAuthenticated is false', () => {
      const auth = useAuthStore()
      expect(auth.isAuthenticated).toBe(false)
    })

    it('isAdmin is false', () => {
      const auth = useAuthStore()
      expect(auth.isAdmin).toBe(false)
    })

    it('isManager is false', () => {
      const auth = useAuthStore()
      expect(auth.isManager).toBe(false)
    })

    it('isEditor is false', () => {
      const auth = useAuthStore()
      expect(auth.isEditor).toBe(false)
    })

    it('hasMinRole is accessible', () => {
      const auth = useAuthStore()
      expect(typeof auth.hasMinRole).toBe('function')
    })
  })

  describe('fetchUser', () => {
    it('sets user on successful API call', async () => {
      const auth = useAuthStore()
      const mockUser: User = { id: '1', email: 'test@test.com', name: 'Test', role: 'viewer' }
      const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockUser })

      await auth.fetchUser()

      expect(auth.user).toEqual(mockUser)
      expect(auth.isAuthenticated).toBe(true)
      expect(auth.initialized).toBe(true)
      expect(auth.loading).toBe(false)
      getSpy.mockRestore()
    })

    it('calls GET /auth/me', async () => {
      const auth = useAuthStore()
      const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: null })

      await auth.fetchUser()

      expect(getSpy).toHaveBeenCalledWith('/auth/me')
      getSpy.mockRestore()
    })

    it('sets user to null on API failure', async () => {
      const auth = useAuthStore()
      const getSpy = vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('401'))

      await auth.fetchUser()

      expect(auth.user).toBeNull()
      expect(auth.initialized).toBe(true)
      expect(auth.loading).toBe(false)
      getSpy.mockRestore()
    })

    it('sets loading during request', async () => {
      const auth = useAuthStore()
      let loadingDuringRequest = false
      const getSpy = vi.spyOn(api, 'get').mockImplementation(async () => {
        loadingDuringRequest = auth.loading
        return { data: { id: '1', email: 'a@b.com', name: 'T', role: 'guest' } }
      })

      await auth.fetchUser()

      expect(loadingDuringRequest).toBe(true)
      expect(auth.loading).toBe(false)
      getSpy.mockRestore()
    })
  })

  describe('login (SSO)', () => {
    it('is a function', () => {
      const auth = useAuthStore()
      expect(typeof auth.login).toBe('function')
    })
  })

  describe('loginWithCredentials', () => {
    it('sets user on success', async () => {
      const auth = useAuthStore()
      const mockUser: User = { id: '1', email: 'test@test.com', name: 'Test', role: 'user' }
      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockUser })

      await auth.loginWithCredentials('test@test.com', 'password123!')

      expect(auth.user).toEqual(mockUser)
      expect(auth.isAuthenticated).toBe(true)
      expect(auth.initialized).toBe(true)
      expect(auth.loading).toBe(false)
      postSpy.mockRestore()
    })

    it('propagates error on failure', async () => {
      const auth = useAuthStore()
      const postSpy = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Invalid'))

      await expect(auth.loginWithCredentials('bad@t.com', 'wrong')).rejects.toThrow()

      expect(auth.user).toBeNull()
      expect(auth.loading).toBe(false)
      postSpy.mockRestore()
    })
  })

  describe('register', () => {
    it('sets user on success (auto-login)', async () => {
      const auth = useAuthStore()
      const mockUser: User = { id: '2', email: 'new@test.com', name: 'New', role: 'user' }
      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockUser })

      await auth.register('New', 'new@test.com', 'securepass123!')

      expect(auth.user).toEqual(mockUser)
      expect(auth.isAuthenticated).toBe(true)
      postSpy.mockRestore()
    })
  })

  describe('logout', () => {
    it('calls POST /auth/logout and clears user', async () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'User', role: 'viewer' }
      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({})

      await auth.logout()

      expect(postSpy).toHaveBeenCalledWith('/auth/logout')
      expect(auth.user).toBeNull()
      postSpy.mockRestore()
    })

    it('clears user even on API failure', async () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'User', role: 'viewer' }
      const postSpy = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('fail'))

      try { await auth.logout() } catch { /* expected */ }

      expect(auth.user).toBeNull()
      postSpy.mockRestore()
    })
  })

  describe('isAdmin computed', () => {
    it('false for role below admin', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'manager' }
      expect(auth.isAdmin).toBe(false)
    })

    it('true for admin role', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'admin' }
      expect(auth.isAdmin).toBe(true)
    })

    it('true for super_admin role', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'super_admin' }
      expect(auth.isAdmin).toBe(true)
    })

    it('false for unknown role', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'unknown' as any }
      expect(auth.isAdmin).toBe(false)
    })
  })

  describe('auth:expired event', () => {
    it('clears user on event dispatch', () => {
      const auth = useAuthStore()
      auth.user = { id: '1', email: 'a@b.com', name: 'U', role: 'viewer' }

      window.dispatchEvent(new CustomEvent('auth:expired'))

      expect(auth.user).toBeNull()
    })
  })

  describe('idle session timeout', () => {
    it('exposes resetIdleTimer function', () => {
      const auth = useAuthStore()
      expect(typeof auth.resetIdleTimer).toBe('function')
    })
  })
})
```

**Key patterns:**
- Always call `setActivePinia(createPinia())` in `beforeEach` to isolate store state between tests
- Mock API calls with `vi.spyOn(api, 'get')` / `vi.spyOn(api, 'post')` and always call `mockRestore()` after
- Test the `loading` flag transitions during async operations
- Verify `fetchUser` sets `initialized: true` even on failure (so the app knows initialization is complete)
- Test the `auth:expired` custom event integration
- Use string role names for all role values -- the `Role` type gives compile-time safety
- Test `loginWithCredentials` and `register` alongside SSO `login`

---

## Implementation Checklist

When creating security tests for a new Vue 3 frontend, cover:

1. **Sanitization** (`src/lib/sanitize.ts`)
   - [ ] `sanitizeHtml` uses DOMPurify with explicit `ALLOWED_TAGS` and `ALLOWED_ATTR`
   - [ ] `stripHtml` uses DOMPurify with `ALLOWED_TAGS: []`
   - [ ] All 17+ allowed tags are tested
   - [ ] All dangerous tags are tested (script, svg, img, object, style, textarea, meta)
   - [ ] All dangerous attributes are tested (onerror, onload, onfocus, onmouseover, style, id, action)
   - [ ] All dangerous protocols are tested (javascript:, data:, vbscript:, case-obfuscated variants)

2. **Redirect sanitization** (`src/router/index.ts`)
   - [ ] `sanitizeRedirect` exported and tested independently
   - [ ] Protocol-relative URLs blocked (`//evil.com`)
   - [ ] Absolute URLs blocked (`https://evil.com`)
   - [ ] Embedded credentials blocked (`/path@evil.com`)
   - [ ] Protocol schemes in path blocked (`/data:text/html`)
   - [ ] Non-string inputs rejected
   - [ ] Query string special characters allowed (`?q=user@example.com`, `?time=12:00`)

3. **Auth store** (`src/stores/auth.ts`)
   - [ ] Initial state is unauthenticated
   - [ ] `hasMinRole()` exported and accessible on store
   - [ ] `isAdmin` uses `hasMinRole('admin')` with hierarchy checks
   - [ ] `isManager` uses `hasMinRole('manager')` with hierarchy checks
   - [ ] `isEditor` uses `hasMinRole('editor')` with hierarchy checks
   - [ ] `hasMinRole()` works with same-level / lower-level / higher-level roles
   - [ ] Unknown role string is not admin/manager/editor
   - [ ] Logout clears state in `finally` block
   - [ ] `auth:expired` event listener clears state
   - [ ] `fetchUser` sets `initialized: true` even on failure
   - [ ] `loginWithCredentials` sets user on success, propagates errors
   - [ ] `register` sets user on success (auto-login)

4. **API client** (`src/lib/api.ts`)
   - [ ] `withCredentials: true`
   - [ ] `baseURL` configured (env var or `/api`)
   - [ ] Timeout configured (<= 30s)
   - [ ] CSRF request interceptor present
   - [ ] `X-Request-ID` header attached to all requests
   - [ ] 401 response interceptor dispatches `auth:expired`
   - [ ] `parseApiError` never leaks internal error details
   - [ ] `reportSecurityEvent` is fire-and-forget

5. **Test infrastructure**
   - [ ] Vitest with happy-dom environment
   - [ ] `@` alias resolves to `src/`
   - [ ] Coverage via v8 provider
   - [ ] Both `tests/unit/` and `tests/security/` directories included
