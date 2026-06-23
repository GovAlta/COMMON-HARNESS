# Skill: Routing & Navigation Guards

This skill covers Vue Router configuration: route definitions with lazy loading, route meta type augmentation, auth/authorization guards, open redirect prevention, scroll behavior, and document title management.

> **Standards:** Cross-reference with [01-architecture](../../standards/01-architecture.md) for route organization and lazy loading, [02-security](../../standards/02-security.md) for auth guards and open redirect prevention, and [03-coding-conventions](../../standards/03-coding-conventions.md) for naming and formatting.

> **API client and interceptors** are covered in skill 07 (API Client & Security Interceptors).
> **Auth store and session management** are covered in skill 08 (Authentication & Session Management).

All code below uses the conventions established by the reference template and should be implemented as-is unless project requirements dictate otherwise.

---

## 1. Route Meta Type Augmentation

Augment Vue Router's `RouteMeta` interface at the top of `src/router/index.ts` so route meta fields are type-safe throughout the application.

```typescript
declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'default' | 'admin' | 'blank'
    requiresAuth?: boolean
    requiresAdmin?: boolean
    guestOnly?: boolean
    title?: string
  }
}
```

This means:
- `to.meta.requiresAuth` is typed as `boolean | undefined` everywhere.
- `to.meta.layout` is constrained to the union `'default' | 'admin' | 'blank'`.
- Adding a route with `meta: { requiresAuth: 'yes' }` is a compile-time error.

Extend this interface when adding new meta fields (e.g., `requiresRole`).

---

## 2. Route Definitions

Routes use lazy loading (`() => import(...)`) and declare their meta inline. All views live in `src/views/`.

```typescript
// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  // Public pages
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: 'Home' },
  },
  {
    path: '/dashboards',
    name: 'Dashboards',
    component: () => import('@/views/DashboardsPage.vue'),
    meta: { title: 'Dashboards' },
  },
  {
    path: '/dashboards/:slug',
    name: 'DashboardDetail',
    component: () => import('@/views/DashboardDetailPage.vue'),
    meta: { title: 'Dashboard' },
  },
  // ... other public routes

  // Auth: uses blank layout, no nav chrome
  {
    path: '/auth',
    name: 'Auth',
    component: () => import('@/views/AuthPage.vue'),
    meta: { title: 'Sign In', layout: 'blank', guestOnly: true },
  },

  // Protected pages
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsPage.vue'),
    meta: { title: 'Settings', requiresAuth: true },
  },

  // Admin routes
  {
    path: '/admin/users',
    name: 'AdminUsers',
    component: () => import('@/views/admin/UsersPage.vue'),
    meta: { title: 'User Management', requiresAuth: true, requiresAdmin: true, layout: 'admin' },
  },

  // Catch-all 404
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundPage.vue'),
    meta: { title: 'Not Found', layout: 'blank' },
  },
]
```

Key conventions:
- **Views directory**: All page components live in `src/views/`, not `src/pages/`.
- **Named routes**: Use `name` for programmatic navigation (`{ name: 'Auth' }` not `{ path: '/auth' }`).
- **Auth path**: The auth page is at `/auth`, not `/login`. All auth flows (sign-in, registration, SSO callback) are handled in one page with tabs.
- **Layout via meta**: Layouts are selected by `meta.layout` in `App.vue`, not by nesting routes under layout components. See skill 04 for the layout system.

---

## 3. `sanitizeRedirect`: Open Redirect Prevention

Validates the `redirect` query parameter to prevent open redirect attacks. Exported from the router module so it can be used by both the navigation guard and the auth page.

```typescript
/**
 * Sanitize the redirect query parameter to prevent open-redirect attacks.
 * Only allows relative paths starting with "/" and blocks protocol-relative URLs.
 */
export function sanitizeRedirect(redirect: unknown): string | undefined {
  if (typeof redirect !== 'string') return undefined
  // Block protocol-relative (//evil.com), javascript:, data:, and anything not starting with /
  if (!redirect.startsWith('/') || redirect.startsWith('//')) return undefined
  // Block embedded credentials or protocol schemes in the path portion
  if (/[:\\@]/.test(redirect.split('?')[0])) return undefined
  return redirect
}
```

What it blocks:
- **Protocol-relative URLs**: `//evil.com/path`; would redirect to `evil.com`.
- **Non-path values**: `https://evil.com`, `javascript:alert(1)`, `data:text/html,...`.
- **Embedded credentials**: `/path@evil.com`; some browsers interpret this as a credentials-bearing URL.
- **Protocol schemes in path**: `/path:something`; edge cases in URL parsing.

The check `redirect.split('?')[0]` only inspects the path portion, allowing query strings like `/dashboard?tab=settings` or `/search?q=user@example.com` to pass through safely.

---

## 4. Navigation Guards

### 4.1 Auth Guard: `beforeEach`

```typescript
router.beforeEach(async (to) => {
  // --- Auth-required routes ---
  if (to.meta.requiresAuth || to.meta.requiresAdmin) {
    const auth = useAuthStore()

    // Bootstrap: if we haven't loaded the user yet, try once
    if (!auth.isAuthenticated && !auth.loading) {
      await auth.fetchUser()
    }

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { name: 'Auth', query: { redirect: to.fullPath } }
    }

    if (to.meta.requiresAdmin && !auth.isAdmin) {
      return { name: 'Home' }
    }
  }

  // --- Guest-only routes (e.g., /auth) ---
  if (to.meta.guestOnly) {
    const auth = useAuthStore()
    if (!auth.isAuthenticated && !auth.loading) {
      await auth.fetchUser()
    }
    if (auth.isAuthenticated) {
      return { name: 'Home' }
    }
  }

  // --- Redirect sanitization ---
  if (to.name === 'Auth' && to.query.redirect) {
    const safe = sanitizeRedirect(to.query.redirect)
    if (safe !== to.query.redirect) {
      return { name: 'Auth', query: safe ? { redirect: safe } : {} }
    }
  }
})
```

Key behaviors:
- **Auth bootstrap on first navigation**: If the user hasn't been fetched yet (`!auth.isAuthenticated && !auth.loading`), the guard awaits `fetchUser()` once. This handles page refreshes where the session cookie is still valid but the store is empty.
- **Redirect preservation**: When redirecting to the auth page, the original `fullPath` is saved in the `redirect` query param so the user returns to where they were going after login.
- **Admin gating**: `requiresAdmin` routes redirect non-admins to Home silently. Adjust to show a 403 page if preferred.
- **Guest-only redirect**: Already-authenticated users are redirected away from the auth page.
- **Redirect sanitization**: If someone manually crafts a URL like `/auth?redirect=//evil.com`, the guard strips the dangerous redirect before the Auth page renders.

### 4.2 Document Title: `afterEach`

```typescript
router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} | App Template` : 'App Template'
})
```

---

## 5. Router Instance

```typescript
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition          // Back/forward navigation
    if (to.hash) return { el: to.hash, behavior: 'smooth' }  // Anchor links
    return { top: 0 }                                // New navigation
  },
})

export default router
```

Key points:
- **`import.meta.env.BASE_URL`**: Uses the Vite base URL so the app works when deployed to a sub-path.
- **`savedPosition`**: Restores scroll position on back/forward navigation for a native-feeling experience.
- **Hash scrolling**: Smooth-scrolls to anchor targets (e.g., `/docs#section-3`).

---

## 6. Layout System Integration

Layouts are handled in `App.vue` via `route.meta.layout`, not by nesting routes under layout components:

```vue
<!-- src/App.vue -->
<template>
  <!-- Skip nav link (accessibility) -->
  <a href="#main-content" class="sr-only focus:not-sr-only ...">Skip to content</a>

  <!-- Route announcer (accessibility) -->
  <div class="sr-only" aria-live="polite" role="status">{{ routeAnnouncement }}</div>

  <!-- Layout switching -->
  <template v-if="layout === 'blank'">
    <main id="main-content">
      <router-view />
    </main>
  </template>
  <template v-else>
    <AppNavbar />
    <main id="main-content">
      <router-view />
    </main>
    <AppFooter />
  </template>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const layout = computed(() => route.meta.layout || 'default')

// Route announcer for screen readers
const routeAnnouncement = ref('')
watch(
  () => route.fullPath,
  () => {
    nextTick(() => {
      routeAnnouncement.value = `Navigated to ${route.meta.title || 'page'}`
    })
  },
)
</script>
```

This approach:
- Keeps route definitions flat (no wrapper components adding nesting complexity).
- Lets any route switch layout by setting `meta: { layout: 'blank' }`.
- Includes accessibility features: skip-nav link and route announcer.

---

## 7. Complete File: `src/router/index.ts`

```typescript
import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// ---- Route Meta Type Augmentation ----
declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'default' | 'admin' | 'blank'
    requiresAuth?: boolean
    requiresAdmin?: boolean
    guestOnly?: boolean
    title?: string
  }
}

// ---- Route Definitions ----
const routes: RouteRecordRaw[] = [
  // Public pages
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: 'Home' },
  },
  {
    path: '/dashboards',
    name: 'Dashboards',
    component: () => import('@/views/DashboardsPage.vue'),
    meta: { title: 'Dashboards' },
  },
  {
    path: '/dashboards/:slug',
    name: 'DashboardDetail',
    component: () => import('@/views/DashboardDetailPage.vue'),
    meta: { title: 'Dashboard' },
  },
  {
    path: '/explore',
    name: 'Explore',
    component: () => import('@/views/ExplorePage.vue'),
    meta: { title: 'Explore Data' },
  },
  {
    path: '/blog',
    name: 'Blog',
    component: () => import('@/views/BlogPage.vue'),
    meta: { title: 'Blog' },
  },
  {
    path: '/blog/:slug',
    name: 'BlogPost',
    component: () => import('@/views/BlogPostPage.vue'),
    meta: { title: 'Blog Post' },
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('@/views/AboutPage.vue'),
    meta: { title: 'About' },
  },
  {
    path: '/contact',
    name: 'Contact',
    component: () => import('@/views/ContactPage.vue'),
    meta: { title: 'Contact' },
  },
  {
    path: '/docs/api',
    name: 'ApiDocs',
    component: () => import('@/views/ApiDocsPage.vue'),
    meta: { title: 'API Documentation' },
  },

  // Auth: blank layout, guest-only
  {
    path: '/auth',
    name: 'Auth',
    component: () => import('@/views/AuthPage.vue'),
    meta: { title: 'Sign In', layout: 'blank', guestOnly: true },
  },

  // Protected pages
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsPage.vue'),
    meta: { title: 'Settings', requiresAuth: true },
  },

  // Catch-all 404
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundPage.vue'),
    meta: { title: 'Not Found', layout: 'blank' },
  },
]

// ---- Router Instance ----
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
})

// ---- Document Title ----
router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} | App Template` : 'App Template'
})

// ---- Open Redirect Prevention ----
export function sanitizeRedirect(redirect: unknown): string | undefined {
  if (typeof redirect !== 'string') return undefined
  if (!redirect.startsWith('/') || redirect.startsWith('//')) return undefined
  if (/[:\\@]/.test(redirect.split('?')[0])) return undefined
  return redirect
}

// ---- Navigation Guards ----
router.beforeEach(async (to) => {
  if (to.meta.requiresAuth || to.meta.requiresAdmin) {
    const auth = useAuthStore()

    if (!auth.isAuthenticated && !auth.loading) {
      await auth.fetchUser()
    }

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { name: 'Auth', query: { redirect: to.fullPath } }
    }

    if (to.meta.requiresAdmin && !auth.isAdmin) {
      return { name: 'Home' }
    }
  }

  if (to.meta.guestOnly) {
    const auth = useAuthStore()
    if (!auth.isAuthenticated && !auth.loading) {
      await auth.fetchUser()
    }
    if (auth.isAuthenticated) {
      return { name: 'Home' }
    }
  }

  if (to.name === 'Auth' && to.query.redirect) {
    const safe = sanitizeRedirect(to.query.redirect)
    if (safe !== to.query.redirect) {
      return { name: 'Auth', query: safe ? { redirect: safe } : {} }
    }
  }
})

export default router
```

---

## Checklist for Implementation

- [ ] Install dependencies: `vue-router`
- [ ] Create `src/router/index.ts` with route meta augmentation, routes, guards, and `sanitizeRedirect`
- [ ] Use `{ name: 'Auth' }` for all auth redirects (not path-based)
- [ ] Use `@/views/` for all view components (not `@/pages/`)
- [ ] Use `@/stores/auth` for the auth store import (not `@/stores/useAuthStore`)
- [ ] Set `layout: 'blank'` on auth and error pages
- [ ] Set `guestOnly: true` on the auth page
- [ ] Use `sanitizeRedirect` for all redirect query params; never trust raw `to.query.redirect`
- [ ] Implement layout switching in `App.vue` using `route.meta.layout` (see section 6)
- [ ] Test: unauthenticated users are redirected to `/auth` with return URL
- [ ] Test: `//evil.com`, `javascript:alert(1)`, `/path@evil.com` are all blocked by `sanitizeRedirect`
- [ ] Test: authenticated users are redirected away from `/auth` (guestOnly)
- [ ] Test: non-admin users cannot access `requiresAdmin` routes
