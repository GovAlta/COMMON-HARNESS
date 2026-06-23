# Skill: State Management & Layouts

This skill covers the composable pattern for domain-specific state management (both singleton and instance-scoped), Pinia stores for global cross-cutting state (authentication, notifications), plus the default/admin/blank layout components with responsive navigation.

> **Standards:** Cross-reference with [01-architecture](../../standards/01-architecture.md) for store and composable layer separation, and [03-coding-conventions](../../standards/03-coding-conventions.md) for naming and formatting.

> **Auth store details** (idle timeout, `auth:expired` event, RBAC helpers) are covered in skill 08 (Authentication & Session Management).
> **API client** (`api.ts`, interceptors, error parsing) is covered in skill 07 (API Client & Security Interceptors).

---

## 5. Composable Pattern (Primary State Management)

Composables are the primary state management pattern for domain-specific data. Use module-level reactive state (singleton pattern) when the state should be shared across components. Use function-scoped state when each consumer needs its own independent copy.

### 5.1 Shared Singleton Composable

```typescript
// src/composables/useResources.ts
import { ref, computed } from 'vue'
import api from '@/lib/api'
import { parseApiError } from '@/lib/api'

// ---- Types ----
export interface Resource {
  id: string
  name: string
  description: string
  status: 'active' | 'inactive' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface ResourceInput {
  name: string
  description: string
  status?: string
}

interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

// ---- Module-level singleton state ----
const resources = ref<Resource[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const pagination = ref<PaginationMeta>({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
})

export function useResources() {
  // Computed
  const activeResources = computed(() =>
    resources.value.filter((r) => r.status === 'active'),
  )
  const hasMore = computed(() => pagination.value.page < pagination.value.totalPages)

  // ---- Fetch list ----
  async function fetchResources(page = 1, limit = 20) {
    loading.value = true
    error.value = null
    try {
      const { data } = await api.get('/resources', {
        params: { page, limit },
      })
      resources.value = data.data
      pagination.value = {
        page: data.meta.page,
        limit: data.meta.limit,
        total: data.meta.total,
        totalPages: data.meta.totalPages,
      }
    } catch (err) {
      const { message } = parseApiError(err)
      error.value = message
    } finally {
      loading.value = false
    }
  }

  // ---- Fetch single ----
  async function fetchResource(id: string): Promise<Resource> {
    const { data } = await api.get(`/resources/${id}`)
    return data.data
  }

  // ---- Create ----
  async function createResource(input: ResourceInput): Promise<Resource> {
    const { data } = await api.post('/resources', input)
    // Prepend to local list
    resources.value.unshift(data.data)
    pagination.value.total++
    return data.data
  }

  // ---- Update ----
  async function updateResource(id: string, input: Partial<ResourceInput>): Promise<Resource> {
    const { data } = await api.put(`/resources/${id}`, input)
    // Update in local list
    const index = resources.value.findIndex((r) => r.id === id)
    if (index !== -1) {
      resources.value[index] = data.data
    }
    return data.data
  }

  // ---- Delete ----
  async function deleteResource(id: string): Promise<void> {
    await api.delete(`/resources/${id}`)
    resources.value = resources.value.filter((r) => r.id !== id)
    pagination.value.total--
  }

  // ---- Search ----
  async function searchResources(query: string): Promise<Resource[]> {
    const { data } = await api.get('/resources/search', {
      params: { q: query },
    })
    return data.data
  }

  return {
    // State
    resources,
    loading,
    error,
    pagination,

    // Computed
    activeResources,
    hasMore,

    // Methods
    fetchResources,
    fetchResource,
    createResource,
    updateResource,
    deleteResource,
    searchResources,
  }
}
```

### 5.2 Instance-Scoped Composable (Non-Singleton)

When each component needs its own loading/error state (e.g., a detail page):

```typescript
// src/composables/useResourceDetail.ts
import { ref } from 'vue'
import api from '@/lib/api'
import { parseApiError } from '@/lib/api'
import type { Resource, ResourceInput } from './useResources'

export function useResourceDetail() {
  // State is scoped to each call: not shared
  const resource = ref<Resource | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  async function fetch(id: string) {
    loading.value = true
    error.value = null
    try {
      const { data } = await api.get(`/resources/${id}`)
      resource.value = data.data
    } catch (err) {
      const { message } = parseApiError(err)
      error.value = message
    } finally {
      loading.value = false
    }
  }

  async function save(id: string, input: Partial<ResourceInput>) {
    saving.value = true
    error.value = null
    try {
      const { data } = await api.put(`/resources/${id}`, input)
      resource.value = data.data
      return data.data
    } catch (err) {
      const { message } = parseApiError(err)
      error.value = message
      throw err
    } finally {
      saving.value = false
    }
  }

  return { resource, loading, saving, error, fetch, save }
}
```

---

## 6. Pinia Stores (Global State Only)

Use Pinia stores exclusively for global, cross-cutting state: authentication, notifications, app-level settings. For domain data (users, items, orders), prefer composables.

### 6.1 Auth Store (Summary)

The auth store lives at `src/stores/auth.ts` and uses Pinia's `setup` syntax. It is the single source of truth for authentication state throughout the application.

```typescript
// src/stores/auth.ts
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

  async function fetchUser(): Promise<void> { /* ... */ }
  async function login(provider: 'google' | 'microsoft'): Promise<void> { /* ... */ }
  async function loginWithCredentials(email: string, password: string): Promise<void> { /* ... */ }
  async function logout(): Promise<void> { /* ... */ }

  // Idle session timeout, auth:expired listener; see skill 08

  return {
    user, loading, initialized,
    isAuthenticated, isAdmin, isManager, isEditor,
    hasMinRole,
    fetchUser, login, loginWithCredentials, logout, resetIdleTimer,
  }
})
```

Key design decisions:
- **`role` is a string**: Roles use a string hierarchy (`ROLE_HIERARCHY`) for readable, type-safe access checks. Use `hasMinRole('admin')` for hierarchical checks.
- **`ROLE_HIERARCHY` and `Role` type are exported**: Both the store and components/guards can reference canonical role names with full type safety.
- **`fetchUser()` not `init()`**: The function name accurately describes what it does; fetches the current user from `GET /auth/me`.
- **Store path is `@/stores/auth`**: Not `@/stores/useAuthStore`; the file is named for the domain, not the composable.

> The complete auth store implementation with idle tracking, `auth:expired` handling, and full method bodies is in **skill 08**.

### 6.2 Notification Store

```typescript
// src/stores/notifications.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/lib/api'

export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  read: boolean
  createdAt: string
  link?: string
}

export const useNotificationStore = defineStore('notifications', () => {
  const notifications = ref<Notification[]>([])
  const loading = ref(false)
  const sseConnection = ref<EventSource | null>(null)

  const unreadCount = computed(() =>
    notifications.value.filter((n) => !n.read).length,
  )

  async function fetchNotifications() {
    loading.value = true
    try {
      const { data } = await api.get('/notifications')
      notifications.value = data.data
    } catch {
      // Silent fail: notifications are non-critical
    } finally {
      loading.value = false
    }
  }

  async function markAsRead(id: string) {
    await api.put(`/notifications/${id}/read`)
    const notification = notifications.value.find((n) => n.id === id)
    if (notification) {
      notification.read = true
    }
  }

  async function markAllAsRead() {
    await api.put('/notifications/read-all')
    notifications.value.forEach((n) => (n.read = true))
  }

  function addNotification(notification: Notification) {
    notifications.value.unshift(notification)
  }

  /**
   * Connect to SSE for real-time notification delivery.
   * See skill 05 for full SSE implementation.
   */
  function connectSSE() {
    if (sseConnection.value) return

    const source = new EventSource('/api/v1/notifications/stream', {
      withCredentials: true,
    } as EventSourceInit)

    source.addEventListener('notification', (event) => {
      try {
        const notification: Notification = JSON.parse(event.data)
        addNotification(notification)
      } catch {
        // Ignore malformed events
      }
    })

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        sseConnection.value = null
        setTimeout(connectSSE, 5000)
      }
    }

    sseConnection.value = source
  }

  function disconnectSSE() {
    sseConnection.value?.close()
    sseConnection.value = null
  }

  return {
    notifications,
    loading,
    unreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    addNotification,
    connectSSE,
    disconnectSSE,
  }
})
```

---

## 7. Layouts

The template uses meta-based layout switching in `App.vue` (see skill 03, section 6). Layout components are not route wrappers; they are selected by `route.meta.layout`.

### 7.1 Default Layout

The default layout includes a sticky navbar, main content area, and footer. It is applied when no `layout` meta is set (or when `layout: 'default'`).

```vue
<!-- Structure shown in App.vue (skill 03, section 6) -->
<AppNavbar />
<main id="main-content">
  <router-view />
</main>
<AppFooter />
```

The `AppNavbar` component uses PrimeVue's `Menubar` for desktop navigation and a mobile slide-out menu with transition animations. See the template's `src/components/layout/AppNavbar.vue` for the full implementation.

### 7.2 Admin Layout

For projects that need a sidebar-based admin panel, create an admin layout with:
- A fixed sidebar with navigation menu
- A top bar with breadcrumbs
- A mobile sidebar toggle
- A "Back to App" link

```vue
<!-- src/components/layout/AdminLayout.vue -->
<template>
  <div class="min-h-screen flex">
    <!-- Sidebar (desktop) -->
    <aside class="hidden lg:flex flex-col w-64 border-r">
      <div class="p-4 border-b">
        <router-link to="/admin" class="flex items-center gap-2">
          <i class="pi pi-shield text-xl text-primary" />
          <span class="font-bold text-lg">Admin Panel</span>
        </router-link>
      </div>
      <nav class="flex-1 p-2">
        <Menu :model="sidebarItems" class="w-full border-0" />
      </nav>
      <div class="p-4 border-t">
        <router-link to="/" class="flex items-center gap-2 text-surface-600 hover:text-primary">
          <i class="pi pi-arrow-left" />
          <span>Back to App</span>
        </router-link>
      </div>
    </aside>

    <!-- Main area -->
    <div class="flex-1 flex flex-col">
      <header class="border-b p-4 flex items-center gap-4">
        <Button
          icon="pi pi-bars"
          text rounded
          class="lg:hidden"
          @click="mobileSidebarOpen = true"
          aria-label="Toggle admin sidebar"
        />
        <Breadcrumb :model="breadcrumbs" :home="{ icon: 'pi pi-home', to: '/admin' }" />
      </header>
      <main class="flex-1 p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
```

### 7.3 Blank Layout

Used for auth pages, error pages, and any full-screen view without navigation chrome. Simply renders the `<router-view />` with no navbar or footer.

---

## Import Convention Summary

All skills in this repository use these canonical import paths:

| Module | Path | Skill |
|--------|------|-------|
| API client | `@/lib/api` | 07 |
| Error parsing | `@/lib/api` (`parseApiError`) | 07 |
| HTML sanitization | `@/lib/sanitize` | 07 |
| Auth store | `@/stores/auth` | 08 |
| Router / sanitizeRedirect | `@/router` | 03 |
| Composables | `@/composables/useFoo` | This skill |
| Views | `@/views/FooPage.vue` | 03 |

---

> **Accessibility:** All components must follow the accessibility standard. See `standards/05-accessibility.md`.
