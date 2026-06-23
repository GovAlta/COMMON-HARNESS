# Skill: Vue 3 Component Patterns

> Vue 3.5+ component patterns using `<script setup>`, TypeScript, and the Composition API.
> All examples target Vue 3.5+ with TypeScript.

> **Standards:** Cross-reference with [03-coding-conventions](../../standards/03-coding-conventions.md) for naming/formatting plus import ordering, and [05-accessibility](../../standards/05-accessibility.md) for component accessibility and ARIA patterns.

---

## 1. Script Setup (Mandatory)

Every component MUST use `<script setup lang="ts">`. Never use the Options API or
the non-setup Composition API (`setup()` function returned from `defineComponent`).

### Canonical ordering inside `<script setup>`

```vue
<script setup lang="ts">
// 1. Imports
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import UserAvatar from '@/components/UserAvatar.vue'
import type { User } from '@/types'

// 2. Props
const props = defineProps<{
  userId: string
  editable?: boolean
}>()

// 3. Emits
const emit = defineEmits<{
  save: [user: User]
  cancel: []
}>()

// 4. Models
const name = defineModel<string>('name', { required: true })

// 5. Composables / stores
const route = useRoute()
const authStore = useAuthStore()
const { currentUser } = storeToRefs(authStore)

// 6. Refs (reactive state)
const isLoading = ref(false)
const formError = ref<string | null>(null)

// 7. Computed
const canEdit = computed(() => props.editable && currentUser.value?.id === props.userId)

// 8. Watchers
watch(() => props.userId, (newId) => {
  fetchUser(newId)
})

// 9. Lifecycle hooks
onMounted(() => {
  fetchUser(props.userId)
})

// 10. Methods / functions
async function fetchUser(id: string) {
  isLoading.value = true
  formError.value = null
  try {
    // fetch logic
  } catch (err) {
    formError.value = (err as Error).message
  } finally {
    isLoading.value = false
  }
}

function handleSave(user: User) {
  emit('save', user)
}
</script>

<template>
  <!-- template last, or in a separate block -->
</template>
```

### Rules

- **Never** use `export default defineComponent({ ... })`.
- **Never** use `<script>` without the `setup` attribute for component logic.
- A plain `<script>` block is only acceptable for `inheritAttrs: false`:

```vue
<script lang="ts">
export default { inheritAttrs: false }
</script>

<script setup lang="ts">
// component logic here
</script>
```

---

## 2. Props (`defineProps`)

Always use the TypeScript generics syntax. Never use the runtime array/object syntax.

### Basic props with defaults

```vue
<script setup lang="ts">
interface Props {
  title: string
  count?: number
  variant?: 'primary' | 'secondary' | 'danger'
  items?: string[]
  user?: {
    id: string
    name: string
    email: string
  }
}

const props = withDefaults(defineProps<Props>(), {
  count: 0,
  variant: 'primary',
  items: () => [],
  user: undefined,
})
</script>
```

### Extracting prop types for reuse

```ts
// types/components.ts
export interface CardProps {
  title: string
  subtitle?: string
  elevated?: boolean
}
```

```vue
<script setup lang="ts">
import type { CardProps } from '@/types/components'

const props = withDefaults(defineProps<CardProps>(), {
  elevated: false,
})
</script>
```

### Rules

- **Always** use `withDefaults()` when you need default values. Do not assign defaults manually.
- **Never** use `defineProps(['title', 'count'])` (runtime array syntax).
- **Never** use `defineProps({ title: { type: String, required: true } })` (runtime object syntax).
- For mutable-reference defaults (arrays, objects), use a factory function: `items: () => []`.

---

## 3. Events (`defineEmits`)

Use the TypeScript generics syntax with named tuple members for payload typing.

### Defining emits

```vue
<script setup lang="ts">
import type { User } from '@/types'

const emit = defineEmits<{
  /** Fired when the user clicks save */
  save: [user: User]
  /** Fired when the user clicks delete: payload is the user id */
  delete: [id: string]
  /** Fired on cancel: no payload */
  cancel: []
  /** Fired on page change: multiple payload members */
  paginate: [page: number, pageSize: number]
}>()

function handleSave(user: User) {
  emit('save', user)
}

function handleDelete(id: string) {
  emit('delete', id)
}
</script>
```

### Parent consuming events

```vue
<template>
  <UserForm
    :user="selectedUser"
    @save="onSave"
    @delete="onDelete"
    @cancel="showForm = false"
  />
</template>

<script setup lang="ts">
import type { User } from '@/types'

function onSave(user: User) {
  // user is fully typed here
}

function onDelete(id: string) {
  // id is typed as string
}
</script>
```

### Rules

- **Never** use `defineEmits(['save', 'delete'])` (runtime array syntax).
- **Always** name tuple members: `[user: User]` not `[User]`.
- Keep event names as simple verbs: `save`, `delete`, `select`, `cancel`, `update`.

---

## 4. `v-model` (`defineModel`): Vue 3.4+

`defineModel` replaces the old `modelValue` prop + `update:modelValue` emit pattern.

### Single v-model

```vue
<!-- BaseInput.vue -->
<script setup lang="ts">
const modelValue = defineModel<string>({ required: true })
</script>

<template>
  <input
    :value="modelValue"
    @input="modelValue = ($event.target as HTMLInputElement).value"
  />
</template>
```

```vue
<!-- Parent usage -->
<template>
  <BaseInput v-model="username" />
</template>
```

### Named models (multiple v-model bindings)

```vue
<!-- UserForm.vue -->
<script setup lang="ts">
const firstName = defineModel<string>('firstName', { required: true })
const lastName = defineModel<string>('lastName', { required: true })
const role = defineModel<'admin' | 'user'>('role', { default: 'user' })
</script>

<template>
  <form>
    <input v-model="firstName" placeholder="First name" />
    <input v-model="lastName" placeholder="Last name" />
    <select v-model="role">
      <option value="admin">Admin</option>
      <option value="user">User</option>
    </select>
  </form>
</template>
```

```vue
<!-- Parent usage -->
<template>
  <UserForm
    v-model:first-name="form.firstName"
    v-model:last-name="form.lastName"
    v-model:role="form.role"
  />
</template>
```

### Reusable form input with validation

```vue
<!-- FormInput.vue -->
<script setup lang="ts">
interface Props {
  label: string
  error?: string
  type?: 'text' | 'email' | 'password' | 'number'
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
})

const modelValue = defineModel<string>({ required: true })
</script>

<template>
  <div class="form-group">
    <label class="form-label">{{ label }}</label>
    <input
      v-model="modelValue"
      :type="type"
      class="form-input"
      :class="{ 'form-input--error': error }"
    />
    <span v-if="error" class="form-error">{{ error }}</span>
  </div>
</template>
```

---

## 5. Slots (`defineSlots`): Vue 3.3+

Use `defineSlots` for type-safe slot definitions.

### Basic typed slots

```vue
<!-- DataList.vue -->
<script setup lang="ts">
import type { User } from '@/types'

const props = defineProps<{
  items: User[]
  loading?: boolean
}>()

defineSlots<{
  /** Renders each item */
  default: (props: { item: User; index: number }) => void
  /** Optional header above the list */
  header: () => void
  /** Shown when items array is empty */
  empty: () => void
}>()
</script>

<template>
  <div class="data-list">
    <div v-if="$slots.header" class="data-list__header">
      <slot name="header" />
    </div>

    <div v-if="loading" class="data-list__loading">
      Loading...
    </div>

    <template v-else-if="items.length > 0">
      <div v-for="(item, index) in items" :key="item.id" class="data-list__item">
        <slot :item="item" :index="index" />
      </div>
    </template>

    <div v-else class="data-list__empty">
      <slot name="empty">
        <p>No items found.</p>
      </slot>
    </div>
  </div>
</template>
```

### Parent consuming scoped slots

```vue
<template>
  <DataList :items="users" :loading="isLoading">
    <template #header>
      <h2>Team Members</h2>
    </template>

    <template #default="{ item: user, index }">
      <UserCard :user="user" :rank="index + 1" />
    </template>

    <template #empty>
      <EmptyState message="No team members yet." />
    </template>
  </DataList>
</template>
```

---

## 6. Template Refs

### DOM element refs (Vue 3.5+)

```vue
<script setup lang="ts">
import { useTemplateRef, onMounted } from 'vue'

const inputRef = useTemplateRef<HTMLInputElement>('input')

onMounted(() => {
  inputRef.value?.focus()
})

function selectAll() {
  inputRef.value?.select()
}
</script>

<template>
  <input ref="input" type="text" />
  <button @click="selectAll">Select All</button>
</template>
```

### Component refs

```vue
<script setup lang="ts">
import { useTemplateRef } from 'vue'
import UserForm from './UserForm.vue'

const formRef = useTemplateRef<InstanceType<typeof UserForm>>('form')

function resetForm() {
  formRef.value?.reset()
}
</script>

<template>
  <UserForm ref="form" />
  <button @click="resetForm">Reset</button>
</template>
```

### Exposing methods from a child (`defineExpose`)

Only expose what the parent genuinely needs. Keep the public surface small.

```vue
<!-- UserForm.vue -->
<script setup lang="ts">
import { ref } from 'vue'

const formData = ref({ name: '', email: '' })

function reset() {
  formData.value = { name: '', email: '' }
}

function validate(): boolean {
  return formData.value.name.length > 0 && formData.value.email.includes('@')
}

// Only these two are accessible to the parent via template ref
defineExpose({ reset, validate })
</script>
```

---

## 7. Provide / Inject

### Typed injection keys

```ts
// keys/theme.ts
import type { InjectionKey, Ref } from 'vue'

export interface Theme {
  primary: string
  secondary: string
  mode: 'light' | 'dark'
}

export const ThemeKey: InjectionKey<Ref<Theme>> = Symbol('theme')
```

### Provider component

```vue
<!-- ThemeProvider.vue -->
<script setup lang="ts">
import { provide, ref } from 'vue'
import { ThemeKey, type Theme } from '@/keys/theme'

const theme = ref<Theme>({
  primary: '#3b82f6',
  secondary: '#64748b',
  mode: 'light',
})

provide(ThemeKey, theme)
</script>

<template>
  <div :class="`theme--${theme.mode}`">
    <slot />
  </div>
</template>
```

### Consumer component

```vue
<!-- ThemedButton.vue -->
<script setup lang="ts">
import { inject } from 'vue'
import { ThemeKey } from '@/keys/theme'

// Non-null assertion: we know ThemeProvider is an ancestor
const theme = inject(ThemeKey)!

// Or with a default to avoid the assertion:
// const theme = inject(ThemeKey, ref({ primary: '#000', secondary: '#666', mode: 'light' as const }))
</script>

<template>
  <button :style="{ backgroundColor: theme.primary }">
    <slot />
  </button>
</template>
```

### When to use provide/inject vs alternatives

| Scenario | Use |
| --- | --- |
| Config/theme shared across a subtree | Provide/Inject |
| A form context consumed by nested fields | Provide/Inject |
| Global auth state, notifications, toasts | Pinia store |
| Direct parent-child data flow | Props/Emits |
| Shared stateless logic (formatting, fetching) | Composable |

---

## 8. Composables

### Naming and structure rules

- Always prefix with `use`.
- Return an object of refs and functions, never a raw promise.
- Handle loading and error states inside the composable.
- Accept reactive params via `MaybeRefOrGetter<T>` so callers can pass plain values, refs, or getters.

### Instance-scoped composable (new state per call)

```ts
// composables/usePagination.ts
import { ref, computed } from 'vue'

interface UsePaginationOptions {
  initialPage?: number
  pageSize?: number
}

export function usePagination(totalItems: () => number, options: UsePaginationOptions = {}) {
  const { initialPage = 1, pageSize = 20 } = options

  const currentPage = ref(initialPage)

  const totalPages = computed(() => Math.ceil(totalItems() / pageSize))
  const offset = computed(() => (currentPage.value - 1) * pageSize)
  const hasNextPage = computed(() => currentPage.value < totalPages.value)
  const hasPrevPage = computed(() => currentPage.value > 1)

  function goToPage(page: number) {
    currentPage.value = Math.max(1, Math.min(page, totalPages.value))
  }

  function nextPage() {
    if (hasNextPage.value) currentPage.value++
  }

  function prevPage() {
    if (hasPrevPage.value) currentPage.value--
  }

  return {
    currentPage,
    totalPages,
    offset,
    pageSize,
    hasNextPage,
    hasPrevPage,
    goToPage,
    nextPage,
    prevPage,
  }
}
```

### Singleton composable (shared state across all callers)

```ts
// composables/useOnlineStatus.ts
import { ref, onMounted, onUnmounted } from 'vue'

// State declared OUTSIDE the function: shared across all callers
const isOnline = ref(navigator.onLine)
let listenerCount = 0

function handleOnline() { isOnline.value = true }
function handleOffline() { isOnline.value = false }

export function useOnlineStatus() {
  onMounted(() => {
    if (listenerCount === 0) {
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    }
    listenerCount++
  })

  onUnmounted(() => {
    listenerCount--
    if (listenerCount === 0) {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  })

  return { isOnline }
}
```

### Composable with reactive params

```ts
// composables/useFetch.ts
import { ref, watchEffect, toValue, type MaybeRefOrGetter } from 'vue'

interface UseFetchReturn<T> {
  data: Ref<T | null>
  error: Ref<string | null>
  isLoading: Ref<boolean>
  refresh: () => Promise<void>
}

export function useFetch<T>(url: MaybeRefOrGetter<string>): UseFetchReturn<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<string | null>(null)
  const isLoading = ref(false)

  async function doFetch() {
    isLoading.value = true
    error.value = null
    try {
      const response = await fetch(toValue(url))
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      data.value = await response.json()
    } catch (err) {
      error.value = (err as Error).message
      data.value = null
    } finally {
      isLoading.value = false
    }
  }

  // Automatically re-fetch when URL changes
  watchEffect(() => {
    toValue(url) // track the dependency
    doFetch()
  })

  return { data, error, isLoading, refresh: doFetch }
}
```

Usage with reactive params:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFetch } from '@/composables/useFetch'
import type { User } from '@/types'

const userId = ref('1')
const url = computed(() => `/api/users/${userId.value}`)

// Re-fetches automatically when userId changes
const { data: user, isLoading, error } = useFetch<User>(url)
</script>
```

### Composable with cleanup

```ts
// composables/useInterval.ts
import { ref, onUnmounted } from 'vue'

export function useInterval(callback: () => void, ms: number) {
  const isActive = ref(true)
  const id = setInterval(() => {
    if (isActive.value) callback()
  }, ms)

  function stop() {
    isActive.value = false
    clearInterval(id)
  }

  onUnmounted(stop)

  return { isActive, stop }
}
```

---

## 9. Component Communication Patterns

| Pattern | Use When | Direction |
| --- | --- | --- |
| Props / Emits | Direct parent-child data and events | Down / Up |
| `v-model` | Two-way binding on form inputs or toggles | Bidirectional |
| Provide / Inject | Multi-level nested components sharing context (theme, form) | Down (skip levels) |
| Pinia Store | App-wide global state (auth, notifications, cart) | Any direction |
| Composable | Shared logic with its own reactive state | N/A (logic reuse) |
| Template Refs | Imperative child access (focus, scroll, validate) | Parent to Child |

### Decision guide

1. **Start with props/emits.** This is the default and most explicit.
2. **If prop drilling exceeds 2 levels**, consider provide/inject or a composable.
3. **If state is app-wide** (persists across routes, needed by unrelated components), use a Pinia store.
4. **If you are reusing logic** (not state ownership), extract a composable.
5. **If you need imperative access** to a child (e.g., `formRef.value.validate()`), use template refs + `defineExpose`.

---

## 10. Async Components & Suspense

### Lazy-loaded components

```ts
import { defineAsyncComponent } from 'vue'

const HeavyChart = defineAsyncComponent(() => import('./HeavyChart.vue'))

const HeavyChartWithOptions = defineAsyncComponent({
  loader: () => import('./HeavyChart.vue'),
  loadingComponent: ChartSkeleton,
  delay: 200, // ms before showing loading component
  errorComponent: ChartError,
  timeout: 10_000, // ms before treating as error
})
```

### Suspense

```vue
<template>
  <Suspense>
    <template #default>
      <!-- Component with top-level await in <script setup> -->
      <AsyncDashboard />
    </template>
    <template #fallback>
      <DashboardSkeleton />
    </template>
  </Suspense>
</template>

<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'
import AsyncDashboard from './AsyncDashboard.vue'
import DashboardSkeleton from './DashboardSkeleton.vue'

const error = ref<Error | null>(null)

onErrorCaptured((err) => {
  error.value = err as Error
  return false // prevent further propagation
})
</script>
```

### Async component with top-level await

```vue
<!-- AsyncDashboard.vue -->
<script setup lang="ts">
import type { DashboardData } from '@/types'

// Top-level await: requires <Suspense> in parent
const response = await fetch('/api/dashboard')
const data: DashboardData = await response.json()
</script>

<template>
  <div class="dashboard">
    <StatCard v-for="stat in data.stats" :key="stat.id" :stat="stat" />
  </div>
</template>
```

---

## 11. Error Boundaries

Vue does not have built-in error boundary components, but you can build one with
`onErrorCaptured`.

### ErrorBoundary.vue

```vue
<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

interface Props {
  /** Called when an error is captured: use for reporting to Sentry, etc. */
  onError?: (error: Error, info: string) => void
}

const props = defineProps<Props>()

const error = ref<Error | null>(null)
const errorInfo = ref<string>('')

onErrorCaptured((err, _instance, info) => {
  error.value = err as Error
  errorInfo.value = info

  props.onError?.(err as Error, info)

  return false // stop propagation
})

function retry() {
  error.value = null
  errorInfo.value = ''
}
</script>

<template>
  <slot v-if="!error" />

  <div v-else class="error-boundary" role="alert">
    <slot name="fallback" :error="error" :retry="retry">
      <div class="error-boundary__default">
        <h3>Something went wrong</h3>
        <p>{{ error.message }}</p>
        <button @click="retry">Try Again</button>
      </div>
    </slot>
  </div>
</template>
```

### Usage

```vue
<template>
  <ErrorBoundary :on-error="reportToSentry">
    <UserProfile :user-id="userId" />

    <template #fallback="{ error, retry }">
      <div class="error-card">
        <p>Failed to load profile: {{ error.message }}</p>
        <button @click="retry">Retry</button>
      </div>
    </template>
  </ErrorBoundary>
</template>

<script setup lang="ts">
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import UserProfile from '@/components/UserProfile.vue'

function reportToSentry(error: Error, info: string) {
  console.error('[ErrorBoundary]', error, info)
  // Sentry.captureException(error, { extra: { info } })
}
</script>
```

---

## 12. Component Size Guidelines

### Single Responsibility

Each component should do **one thing**. If you find yourself writing comments like
"// user section" and "// settings section" in the same template, split them.

### When to extract

| Signal | Action |
| --- | --- |
| Template section > ~80 lines with its own state | Extract to child component |
| Logic reused in 2+ components | Extract to composable |
| Complex computed/watchers for one concern | Extract to composable |
| Component file > ~300 lines | Review and split |

### Component hierarchy

```
pages/
  DashboardPage.vue          ← route-level, composes sections
    sections/
      DashboardStats.vue      ← domain section
      DashboardRecentUsers.vue
    components/
      StatCard.vue            ← presentational primitive
      UserRow.vue
```

**Page components** orchestrate layout and data fetching.
**Section components** own a specific domain area of the page.
**Presentational components** accept props and emit events, with no side effects.

### Keep templates clean

```vue
<!-- BAD: business logic in template -->
<template>
  <span>{{ items.filter(i => i.active).reduce((sum, i) => sum + i.price, 0).toFixed(2) }}</span>
</template>

<!-- GOOD: extract to computed -->
<script setup lang="ts">
const activeTotal = computed(() =>
  items.value
    .filter((i) => i.active)
    .reduce((sum, i) => sum + i.price, 0)
    .toFixed(2)
)
</script>

<template>
  <span>{{ activeTotal }}</span>
</template>
```

---

## 13. Naming Conventions

| Type | Convention | Example |
| --- | --- | --- |
| Page components | `*Page.vue` | `DashboardPage.vue` |
| Layout components | `*Layout.vue` | `DefaultLayout.vue` |
| Domain components | `PascalCase.vue` | `UserCard.vue` |
| Base/primitive components | `Base*.vue` | `BaseButton.vue` |
| Composables | `use*.ts` | `useUsers.ts` |
| Pinia stores | `*.ts` (domain name) | `auth.ts` |
| TypeScript types | `PascalCase` interface/type | `interface User {}` |
| Injection keys | `PascalCase + Key` | `ThemeKey`, `FormContextKey` |
| Event handler props | `on*` in parent | `@save="onSave"` |
| Boolean props | `is*` / `has*` / `can*` / `show*` | `isLoading`, `canEdit` |

### File placement

```
src/
  components/           ← shared components
    BaseButton.vue
    BaseInput.vue
    ErrorBoundary.vue
  composables/          ← shared composables
    useFetch.ts
    usePagination.ts
  stores/               ← Pinia stores (named by domain, not composable)
    auth.ts
  types/                ← shared TypeScript types
    index.ts
    user.ts
  keys/                 ← injection keys
    theme.ts
  pages/                ← route-level components
    DashboardPage.vue
  layouts/              ← layout components
    DefaultLayout.vue
```

---

## 14. Performance Patterns

### `v-once`: render once, never update

Use for static content that will never change after mount.

```vue
<template>
  <header v-once>
    <h1>{{ appTitle }}</h1>
    <p>Version {{ appVersion }}</p>
  </header>
</template>
```

### `v-memo`: skip re-renders conditionally

Memoizes a template sub-tree. Only re-renders when the dependency array changes.

```vue
<template>
  <div v-for="item in list" :key="item.id" v-memo="[item.id === selectedId, item.name]">
    <p :class="{ active: item.id === selectedId }">{{ item.name }}</p>
    <HeavySubComponent :item="item" />
  </div>
</template>
```

The row only re-renders when `item.id === selectedId` changes or `item.name` changes.

### `shallowRef` / `shallowReactive`

Use when you have large objects and only need to track top-level reassignment, not deep
property changes.

```vue
<script setup lang="ts">
import { shallowRef, triggerRef } from 'vue'

interface BigDataset {
  rows: Record<string, unknown>[]
  metadata: Record<string, string>
}

// Only triggers reactivity on .value reassignment, not deep changes
const dataset = shallowRef<BigDataset>({ rows: [], metadata: {} })

async function loadData() {
  const response = await fetch('/api/data')
  // Replacing the entire value triggers reactivity
  dataset.value = await response.json()
}

function updateMetadata(key: string, value: string) {
  dataset.value.metadata[key] = value
  // Must manually trigger since shallowRef doesn't track deep changes
  triggerRef(dataset)
}
</script>
```

### Prefer `computed` over methods in templates

```vue
<script setup lang="ts">
import { computed } from 'vue'

// GOOD: cached; only recalculates when dependencies change
const sortedItems = computed(() =>
  [...items.value].sort((a, b) => a.name.localeCompare(b.name))
)

// BAD: called every render cycle
function getSortedItems() {
  return [...items.value].sort((a, b) => a.name.localeCompare(b.name))
}
</script>

<template>
  <!-- GOOD -->
  <Item v-for="item in sortedItems" :key="item.id" :item="item" />

  <!-- BAD; re-sorts on every render -->
  <Item v-for="item in getSortedItems()" :key="item.id" :item="item" />
</template>
```

### Lazy event handlers

For expensive handlers, debounce or throttle:

```vue
<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'

const handleSearch = useDebounceFn((query: string) => {
  // expensive search operation
}, 300)
</script>

<template>
  <input @input="handleSearch(($event.target as HTMLInputElement).value)" />
</template>
```

### Keep reactive scope minimal

```ts
// BAD: entire config object is recursively reactive
const config = reactive(hugeConfigObject)

// GOOD: only track what the template needs
const theme = ref(hugeConfigObject.theme)
const locale = ref(hugeConfigObject.locale)
```

---

## Quick Reference: Complete Component Template

```vue
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { User } from '@/types'
import BaseButton from '@/components/BaseButton.vue'

// Props
interface Props {
  users: User[]
  selectable?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  selectable: false,
})

// Emits
const emit = defineEmits<{
  select: [user: User]
}>()

// Slots
defineSlots<{
  default: (props: { user: User }) => void
  empty: () => void
}>()

// State
const searchQuery = ref('')

// Computed
const filteredUsers = computed(() =>
  props.users.filter((u) =>
    u.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
)

// Methods
function handleSelect(user: User) {
  if (props.selectable) {
    emit('select', user)
  }
}
</script>

<template>
  <div class="user-list">
    <input v-model="searchQuery" placeholder="Search users..." />

    <template v-if="filteredUsers.length > 0">
      <div
        v-for="user in filteredUsers"
        :key="user.id"
        class="user-list__item"
        @click="handleSelect(user)"
      >
        <slot :user="user">
          <span>{{ user.name }}</span>
        </slot>
      </div>
    </template>

    <div v-else class="user-list__empty">
      <slot name="empty">
        <p>No users found.</p>
      </slot>
    </div>
  </div>
</template>
```
