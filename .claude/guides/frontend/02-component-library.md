# Skill: Component Library & UI Patterns

This skill covers PrimeVue 4.x component integration including theme setup, auto-import, the full component mapping table, plus form/data/navigation/feedback/overlay components. It also covers FormKit form handling, multi-theme systems, server-side DataTable patterns, PrimeVue PassThrough customization, dark mode, and internationalization.

> **Standards:** Cross-reference with [03-coding-conventions](../../standards/03-coding-conventions.md) for naming and formatting, and [05-accessibility](../../standards/05-accessibility.md) for component accessibility and WCAG 2.1 AA compliance.

---

## 2. PrimeVue 4.x Integration

### 2.1 Theme Setup

PrimeVue 4.x uses a styled mode with design token presets. The Aura theme is the default. Other presets include Lara/Material/Nora.

```typescript
// In main.ts
import Aura from '@primeuix/themes/aura'
// Or: import Lara from '@primeuix/themes/lara'
// Or: import Material from '@primeuix/themes/material'

app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.dark-mode',
    },
  },
})
```

### 2.2 Auto-Import (Tree Shaking)

The `@primevue/auto-import-resolver` with `unplugin-vue-components` enables automatic component resolution. Only components you actually use in templates are included in the bundle.

```typescript
// vite.config.ts (already shown above)
Components({
  resolvers: [PrimeVueResolver()],
})
```

This means you never need to manually import PrimeVue components in `<script setup>` blocks -- just use them in templates directly.

### 2.3 Component Mapping Table

Always use PrimeVue components instead of native HTML form elements. This gives consistent theming, accessibility plus behavior.

| Native HTML | PrimeVue Replacement | Notes |
|---|---|---|
| `<input type="text">` | `<InputText>` | Supports `v-model`, `placeholder`, `disabled` |
| `<input type="number">` | `<InputNumber>` | Props: `min`, `max`, `step`, `mode="currency"` |
| `<input type="password">` | `<Password>` | Props: `toggleMask`, `feedback` (strength meter) |
| `<input type="text">` (masked) | `<InputMask>` | Props: `mask="(999) 999-9999"` |
| `<textarea>` | `<Textarea>` | Props: `rows`, `autoResize` |
| `<select>` | `<Select>` | Props: `options`, `optionLabel`, `optionValue`, `filter` |
| `<select multiple>` | `<MultiSelect>` | Props: `display="chip"`, `filter` |
| `<input>` (autocomplete) | `<AutoComplete>` | Props: `suggestions`, `completeMethod`, `field` |
| `<table>` | `<DataTable>` + `<Column>` | Sorting, filtering, pagination, row expansion |
| `<button>` | `<Button>` | Props: `label`, `icon`, `severity`, `text`, `outlined` |
| `<dialog>` | `<Dialog>` | Props: `modal`, `header`, `v-model:visible` |
| `<nav>` (top) | `<Menubar>` | Slots: `#start`, `#end` |
| `<nav>` (tabs) | `<TabMenu>` | Or `<Tabs>` / `<TabList>` / `<TabPanel>` |
| `<nav>` (breadcrumb) | `<Breadcrumb>` | Props: `model`, `home` |
| `<nav>` (steps) | `<Steps>` | Props: `model`, `activeIndex` |
| `<div>` (card) | `<Card>` | Slots: `#title`, `#subtitle`, `#content`, `#footer` |
| `<span>` (badge) | `<Badge>` / `<Tag>` | `<Tag>` for labels; `<Badge>` for counts |
| `<span>` (chip) | `<Chip>` | Props: `label`, `icon`, `removable` |
| `<ul>` (timeline) | `<Timeline>` | Props: `value`, `align` |
| `<ul>` (tree) | `<Tree>` | Props: `value`, `selectionMode` |
| alert / notification | `<Toast>` | Via `ToastService`; severities: success, info, warn, error |
| inline alert | `<Message>` | Props: `severity`, `closable` |
| loading bar | `<ProgressBar>` | Props: `value`, `mode="indeterminate"` |
| placeholder | `<Skeleton>` | Props: `width`, `height`, `shape="circle"` |
| `<input type="date">` | `<DatePicker>` | Props: `dateFormat`, `showIcon`, `showTime` |
| `<input type="checkbox">` | `<Checkbox>` | Props: `binary`, `inputId` |
| `<input type="radio">` | `<RadioButton>` | Props: `inputId`, `value` |
| toggle | `<ToggleSwitch>` | `v-model` boolean |
| range | `<Slider>` | Props: `min`, `max`, `step`, `range` |
| star rating | `<Rating>` | Props: `stars`, `cancel` |
| `<input type="file">` | `<FileUpload>` | Props: `mode`, `accept`, `maxFileSize`, `customUpload` |

### 2.4 Form Components (Full Examples)

```vue
<template>
  <form @submit.prevent="onSubmit" class="flex flex-col gap-4 max-w-lg">
    <!-- Text Input -->
    <div class="flex flex-col gap-1">
      <label for="name" class="font-medium">Name</label>
      <InputText id="name" v-model="form.name" placeholder="Enter full name" />
      <small v-if="errors.name" class="text-red-500">{{ errors.name }}</small>
    </div>

    <!-- Number Input -->
    <div class="flex flex-col gap-1">
      <label for="quantity" class="font-medium">Quantity</label>
      <InputNumber id="quantity" v-model="form.quantity" :min="0" :max="9999" showButtons />
    </div>

    <!-- Textarea -->
    <div class="flex flex-col gap-1">
      <label for="description" class="font-medium">Description</label>
      <Textarea id="description" v-model="form.description" rows="4" autoResize />
    </div>

    <!-- Select (Dropdown) -->
    <div class="flex flex-col gap-1">
      <label for="category" class="font-medium">Category</label>
      <Select
        id="category"
        v-model="form.categoryId"
        :options="categories"
        optionLabel="name"
        optionValue="id"
        placeholder="Select a category"
        filter
      />
    </div>

    <!-- Multi-Select -->
    <div class="flex flex-col gap-1">
      <label for="tags" class="font-medium">Tags</label>
      <MultiSelect
        id="tags"
        v-model="form.tags"
        :options="availableTags"
        optionLabel="name"
        optionValue="id"
        display="chip"
        placeholder="Select tags"
        filter
      />
    </div>

    <!-- Date Picker -->
    <div class="flex flex-col gap-1">
      <label for="dueDate" class="font-medium">Due Date</label>
      <DatePicker id="dueDate" v-model="form.dueDate" dateFormat="yy-mm-dd" showIcon />
    </div>

    <!-- Checkbox -->
    <div class="flex items-center gap-2">
      <Checkbox v-model="form.isActive" :binary="true" inputId="active" />
      <label for="active">Active</label>
    </div>

    <!-- Radio Buttons -->
    <div class="flex flex-col gap-2">
      <span class="font-medium">Priority</span>
      <div class="flex gap-4">
        <div class="flex items-center gap-2">
          <RadioButton v-model="form.priority" inputId="low" value="low" />
          <label for="low">Low</label>
        </div>
        <div class="flex items-center gap-2">
          <RadioButton v-model="form.priority" inputId="high" value="high" />
          <label for="high">High</label>
        </div>
      </div>
    </div>

    <!-- Toggle Switch -->
    <div class="flex items-center gap-2">
      <ToggleSwitch v-model="form.notifications" />
      <span>Enable notifications</span>
    </div>

    <!-- Password -->
    <div class="flex flex-col gap-1">
      <label for="password" class="font-medium">Password</label>
      <Password id="password" v-model="form.password" toggleMask :feedback="true" />
    </div>

    <!-- File Upload -->
    <div class="flex flex-col gap-1">
      <label class="font-medium">Attachment</label>
      <FileUpload
        mode="basic"
        accept="image/*,.pdf,.doc,.docx"
        :maxFileSize="10000000"
        :auto="false"
        chooseLabel="Choose File"
        @select="onFileSelect"
      />
    </div>

    <!-- Submit -->
    <div class="flex gap-2 justify-end">
      <Button label="Cancel" text @click="onCancel" />
      <Button type="submit" label="Save" icon="pi pi-check" :loading="saving" />
    </div>
  </form>
</template>
```

### 2.5 Data Display Components

```vue
<template>
  <!-- DataTable with sorting, filtering, pagination -->
  <DataTable
    :value="items"
    paginator
    :rows="20"
    :rowsPerPageOptions="[10, 20, 50]"
    sortMode="multiple"
    removableSort
    filterDisplay="row"
    :loading="loading"
    responsiveLayout="stack"
    breakpoint="768px"
    v-model:selection="selectedItems"
    dataKey="id"
  >
    <template #header>
      <div class="flex justify-between items-center">
        <h2 class="text-xl font-semibold">Items</h2>
        <Button label="Add" icon="pi pi-plus" @click="showCreateDialog = true" />
      </div>
    </template>

    <Column selectionMode="multiple" headerStyle="width: 3rem" />

    <Column field="name" header="Name" sortable>
      <template #filter="{ filterModel, filterCallback }">
        <InputText v-model="filterModel.value" @input="filterCallback()" placeholder="Search..." />
      </template>
    </Column>

    <Column field="status" header="Status" sortable>
      <template #body="{ data }">
        <Tag :value="data.status" :severity="getStatusSeverity(data.status)" />
      </template>
    </Column>

    <Column field="createdAt" header="Created" sortable>
      <template #body="{ data }">
        {{ new Date(data.createdAt).toLocaleDateString() }}
      </template>
    </Column>

    <Column header="Actions" :exportable="false" style="min-width: 8rem">
      <template #body="{ data }">
        <Button icon="pi pi-pencil" text rounded @click="editItem(data)" />
        <Button icon="pi pi-trash" text rounded severity="danger" @click="confirmDelete(data)" />
      </template>
    </Column>

    <template #empty>
      <div class="text-center py-8 text-surface-500">No items found.</div>
    </template>

    <template #loading>
      <div class="flex flex-col gap-2">
        <Skeleton v-for="i in 5" :key="i" width="100%" height="2.5rem" />
      </div>
    </template>
  </DataTable>

  <!-- Card layout -->
  <Card class="mt-4">
    <template #title>Summary</template>
    <template #subtitle>Overview of current data</template>
    <template #content>
      <div class="flex gap-4">
        <div class="flex items-center gap-2">
          <Badge :value="activeCount" severity="success" />
          <span>Active</span>
        </div>
        <div class="flex items-center gap-2">
          <Badge :value="inactiveCount" severity="warn" />
          <span>Inactive</span>
        </div>
      </div>
    </template>
    <template #footer>
      <Button label="View Details" icon="pi pi-arrow-right" text />
    </template>
  </Card>
</template>
```

### 2.6 Navigation Components

```vue
<template>
  <!-- Top Navigation Bar -->
  <Menubar :model="menuItems">
    <template #start>
      <router-link to="/" class="flex items-center gap-2">
        <img src="/logo.svg" alt="App" class="h-8" />
        <span class="font-bold text-lg">MyApp</span>
      </router-link>
    </template>
    <template #end>
      <div class="flex items-center gap-2">
        <Button icon="pi pi-moon" text rounded @click="toggleDark" v-tooltip="'Toggle dark mode'" />
        <Button icon="pi pi-bell" text rounded @click="toggleNotifications" v-tooltip="'Notifications'">
          <Badge v-if="unreadCount > 0" :value="unreadCount" severity="danger" />
        </Button>
        <Button icon="pi pi-user" text rounded @click="toggleProfile" />
      </div>
    </template>
  </Menubar>

  <!-- Breadcrumb -->
  <Breadcrumb :model="breadcrumbItems" :home="{ icon: 'pi pi-home', to: '/' }" class="mb-4" />

  <!-- Tabs -->
  <Tabs :value="activeTab">
    <TabList>
      <Tab value="details">Details</Tab>
      <Tab value="settings">Settings</Tab>
      <Tab value="activity">Activity</Tab>
    </TabList>
    <TabPanels>
      <TabPanel value="details">
        <p>Details content here.</p>
      </TabPanel>
      <TabPanel value="settings">
        <p>Settings content here.</p>
      </TabPanel>
      <TabPanel value="activity">
        <Timeline :value="activityLog">
          <template #content="{ item }">
            <div class="flex flex-col">
              <span class="font-medium">{{ item.action }}</span>
              <small class="text-surface-500">{{ item.timestamp }}</small>
            </div>
          </template>
        </Timeline>
      </TabPanel>
    </TabPanels>
  </Tabs>

  <!-- Sidebar (for mobile) -->
  <Sidebar v-model:visible="sidebarVisible" class="w-72">
    <h2 class="text-lg font-semibold mb-4">Navigation</h2>
    <Menu :model="sidebarItems" class="w-full border-0" />
  </Sidebar>

  <!-- Steps (wizard) -->
  <Steps :model="wizardSteps" :activeStep="currentStep" class="mb-6" />
</template>
```

### 2.7 Feedback and Overlay Components

```vue
<template>
  <!-- Toast container (place once in App.vue) -->
  <Toast position="top-right" />

  <!-- Confirm dialog container (place once in App.vue) -->
  <ConfirmDialog />

  <!-- Modal Dialog -->
  <Dialog
    v-model:visible="showDialog"
    modal
    :header="isEditing ? 'Edit Item' : 'Create Item'"
    :style="{ width: '550px' }"
    :draggable="false"
  >
    <template #default>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label for="dlg-name" class="font-medium">Name</label>
          <InputText id="dlg-name" v-model="dialogForm.name" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="dlg-desc" class="font-medium">Description</label>
          <Textarea id="dlg-desc" v-model="dialogForm.description" rows="3" autoResize />
        </div>
      </div>
    </template>
    <template #footer>
      <Button label="Cancel" text @click="showDialog = false" />
      <Button label="Save" icon="pi pi-check" @click="saveDialog" :loading="saving" />
    </template>
  </Dialog>

  <!-- Inline messages -->
  <Message v-if="errorMsg" severity="error" :closable="true" @close="errorMsg = ''">
    {{ errorMsg }}
  </Message>
  <Message severity="info" :closable="false">
    This is an informational message.
  </Message>

  <!-- Progress indicators -->
  <ProgressBar v-if="uploading" :value="uploadProgress" />
  <ProgressBar v-if="loadingIndeterminate" mode="indeterminate" style="height: 4px" />

  <!-- Skeleton loading state -->
  <div v-if="loading" class="flex flex-col gap-3">
    <Skeleton width="60%" height="1.5rem" />
    <Skeleton width="100%" height="8rem" />
    <div class="flex gap-2">
      <Skeleton width="5rem" height="2.5rem" />
      <Skeleton width="5rem" height="2.5rem" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

const toast = useToast()
const confirm = useConfirm()

function showSuccess(message: string) {
  toast.add({
    severity: 'success',
    summary: 'Success',
    detail: message,
    life: 3000,
  })
}

function showError(message: string) {
  toast.add({
    severity: 'error',
    summary: 'Error',
    detail: message,
    life: 5000,
  })
}

function confirmDelete(item: { id: string; name: string }) {
  confirm.require({
    message: `Are you sure you want to delete "${item.name}"?`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await deleteItem(item.id)
        showSuccess('Item deleted successfully')
      } catch (err) {
        showError('Failed to delete item')
      }
    },
  })
}
</script>
```

---

## 13. FormKit Integration (Required)

FormKit is the standard form library for all Vue applications. It replaces native HTML form elements and PrimeVue form components for form handling. The library ships with validation, accessibility plus consistent UX built in.

### 13.1 Setup

FormKit requires a Tailwind class configuration to match the application's design system. Without it, inputs render unstyled (no border, no padding, no font).

**Key architecture detail:** FormKit wraps each `<input>` inside an `inner` div. The visible border/ring must go on `inner`, not on `input` itself. The `input` should have `border-none` and `focus:ring-0` to avoid doubling.

Use `generateClasses()` (`@formkit/themes`) to convert a theme object into the `rootClasses` function FormKit expects. Theme keys use FormKit's family system: `global`, `family:text`, `family:box`, `family:button`, `textarea`, `form`.

```typescript
// src/formkit.config.ts
import type { DefaultConfigOptions } from '@formkit/vue'
import { generateClasses } from '@formkit/themes'

const theme: Record<string, Record<string, string>> = {
  global: {
    outer: 'mb-5',
    label: 'block text-sm font-medium text-slate-700 mb-1.5',
    help: 'text-xs text-slate-400 mt-1.5',
    messages: 'list-none p-0 mt-1.5',
    message: 'text-xs text-red-600',
  },
  'family:text': {
    inner:
      'flex items-center rounded-xl border border-slate-300 bg-white ' +
      'focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 ' +
      'transition-colors overflow-hidden',
    input:
      'w-full px-4 py-3 border-none bg-transparent text-sm text-slate-900 ' +
      'placeholder:text-slate-400 focus:outline-none focus:ring-0 focus:shadow-none',
  },
  textarea: {
    inner:
      'flex items-start rounded-xl border border-slate-300 bg-white ' +
      'focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 ' +
      'transition-colors overflow-hidden',
    input:
      'w-full px-4 py-3 border-none bg-transparent text-sm text-slate-900 ' +
      'placeholder:text-slate-400 focus:outline-none focus:ring-0 resize-y min-h-[120px]',
  },
  // Add family:box, family:button, form as needed
}

const config: DefaultConfigOptions = {
  config: {
    classes: generateClasses(theme),
  },
}
export default config
```

```typescript
// main.ts
import { plugin as formkit, defaultConfig } from '@formkit/vue'
import formkitConfig from '@/formkit.config'

app.use(formkit, defaultConfig(formkitConfig))
```

### 13.2 Basic Form Pattern

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useNotifications } from '@/composables/useNotifications'

const { success, error } = useNotifications()
const loading = ref(false)

async function handleSubmit(data: Record<string, unknown>): Promise<void> {
  loading.value = true
  try {
    await api.post('/endpoint', data)
    success('Saved', 'Your changes have been saved.')
  } catch (err) {
    error('Error', parseApiError(err).message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <FormKit type="form" :actions="false" @submit="handleSubmit">
    <FormKit
      type="text"
      name="name"
      label="Full Name"
      validation="required|length:2,100"
      placeholder="Jane Doe"
    />
    <FormKit
      type="email"
      name="email"
      label="Email"
      validation="required|email"
      placeholder="jane@example.com"
    />
    <FormKit
      type="textarea"
      name="message"
      label="Message"
      validation="required|length:10,500"
      placeholder="How can we help?"
    />
    <Button type="submit" label="Submit" :loading="loading" class="mt-4" />
  </FormKit>
</template>
```

### 13.3 Validation Rules

FormKit provides extensive built-in validation. Common patterns:

| Rule | Usage | Description |
|------|-------|-------------|
| `required` | `validation="required"` | Field must have a value |
| `email` | `validation="email"` | Valid email format |
| `length:min,max` | `validation="length:8,128"` | String length range |
| `confirm` | `validation="required|confirm"` | Must match another field (e.g., password confirm) |
| `matches` | `validation="matches:/^[a-z]+$/"` | Regex match |
| `number` | `validation="number"` | Must be numeric |
| `between:min,max` | `validation="between:1,100"` | Numeric range |
| `url` | `validation="url"` | Valid URL format |

### 13.4 When to Use FormKit vs PrimeVue Components

| Use Case | Use |
|----------|-----|
| Any form with validation | **FormKit** |
| Non-form data display | PrimeVue (DataTable, Tag, Card) |
| Filters (no submit) | PrimeVue (Select, MultiSelect, DatePicker) |
| Search inputs | PrimeVue (InputText, AutoComplete) |

---

## 14. Multi-Theme System

For applications requiring more than dark/light mode, use a CSS custom property theme system that overrides Tailwind v4 color tokens.

### 14.1 Theme System

The complete theme composable (`useTheme`), CSS theme definitions, and PrimeVue dark mode integration are defined in **skill 09 (Theming & Customization)**. That skill is the single source of truth for all theming patterns.

Key integration point: PrimeVue uses `darkModeSelector: '.dark-mode'` in `main.ts`. The theme composable adds `dark-mode` class to `<html>` when the dark theme is active.

### 14.2 Chart Color Palettes

Provide per-theme chart colors for Chart.js:

```typescript
// In useTheme composable
const chartColors = computed(() => themePalettes[currentTheme.value])
```

Each theme palette includes: `series` (dataset colors), `grid`, `tooltip`, `text`, `muted`, `marker`.

---

## 15. Server-Side DataTable Pattern

For large datasets, use PrimeVue DataTable's lazy mode with server-side pagination plus sorting plus filtering.

### 15.1 Lazy DataTable Component

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import type { DataTablePageEvent, DataTableSortEvent, DataTableFilterEvent } from 'primevue/datatable'
import api from '@/lib/api'

interface LazyParams {
  page: number
  rows: number
  sortField?: string
  sortOrder?: number
  filters?: Record<string, unknown>
}

const loading = ref(false)
const items = ref([])
const totalRecords = ref(0)
const lazyParams = ref<LazyParams>({ page: 0, rows: 20 })

async function loadData(): Promise<void> {
  loading.value = true
  try {
    const { data } = await api.get('/items', {
      params: {
        offset: lazyParams.value.page * lazyParams.value.rows,
        limit: lazyParams.value.rows,
        sort: lazyParams.value.sortField,
        order: lazyParams.value.sortOrder === 1 ? 'asc' : 'desc',
      },
    })
    items.value = data.items
    totalRecords.value = data.total
  } finally {
    loading.value = false
  }
}

function onPage(event: DataTablePageEvent): void {
  lazyParams.value.page = event.page
  lazyParams.value.rows = event.rows
  loadData()
}

function onSort(event: DataTableSortEvent): void {
  lazyParams.value.sortField = event.sortField as string
  lazyParams.value.sortOrder = event.sortOrder ?? 1
  loadData()
}

onMounted(loadData)
</script>

<template>
  <DataTable
    :value="items"
    :loading="loading"
    :lazy="true"
    :paginator="true"
    :rows="lazyParams.rows"
    :total-records="totalRecords"
    :rows-per-page-options="[10, 20, 50]"
    @page="onPage"
    @sort="onSort"
    striped-rows
    removable-sort
  >
    <Column field="id" header="ID" sortable />
    <Column field="name" header="Name" sortable />
    <Column field="status" header="Status" sortable>
      <template #body="{ data }">
        <Tag :value="data.status" :severity="data.status === 'active' ? 'success' : 'warn'" />
      </template>
    </Column>
  </DataTable>
</template>
```

---

## 18. PrimeVue PassThrough (PT) System

PrimeVue 4.x's PassThrough API allows injecting Tailwind classes into component internals.

### 18.1 Global PT Configuration

```typescript
// main.ts
app.use(PrimeVue, {
  pt: {
    button: {
      root: { class: 'font-geist' },
    },
    datatable: {
      headerRow: { class: 'bg-slate-50' },
    },
    card: {
      root: { class: 'rounded-2xl border border-slate-100' },
    },
  },
})
```

### 18.2 Per-Instance PT

```vue
<Card :pt="{ root: { class: 'shadow-xl rounded-3xl' } }">
  <template #content>Custom styled card</template>
</Card>
```

## 10. Dark Mode

### 10.1 Composable

```typescript
// src/composables/useDarkMode.ts
import { ref, watchEffect } from 'vue'

const STORAGE_KEY = 'app-dark-mode'

// Singleton state: shared across all consumers
const isDark = ref(initializeDarkMode())

function initializeDarkMode(): boolean {
  // Check sessionStorage first
  const stored = sessionStorage.getItem(STORAGE_KEY)
  if (stored !== null) {
    return stored === 'true'
  }

  // Fall back to OS preference
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  return false
}

// Watch and apply changes
watchEffect(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', isDark.value)
    sessionStorage.setItem(STORAGE_KEY, String(isDark.value))
  }
})

// Listen for OS preference changes
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    // Only auto-switch if user hasn't manually set a preference
    if (sessionStorage.getItem(STORAGE_KEY) === null) {
      isDark.value = e.matches
    }
  })
}

export function useDarkMode() {
  function toggle() {
    isDark.value = !isDark.value
  }

  function setDark(value: boolean) {
    isDark.value = value
  }

  return { isDark, toggle, setDark }
}
```

### 10.2 Dark Mode Toggle Component

```vue
<!-- src/components/common/DarkModeToggle.vue -->
<template>
  <Button
    :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'"
    text
    rounded
    :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggle"
  />
</template>

<script setup lang="ts">
import { useDarkMode } from '@/composables/useDarkMode'
const { isDark, toggle } = useDarkMode()
</script>
```

### 10.3 PrimeVue Theme Switching

PrimeVue 4.x uses the `darkModeSelector` option set in `main.ts`. When the `.dark` class is toggled on `<html>`, PrimeVue automatically switches to its dark palette. No additional theme switching logic is needed.

Tailwind CSS also uses `darkMode: 'class'`, so Tailwind's `dark:` variants activate at the same time. PrimeVue components and custom Tailwind-styled elements stay in sync as a result.

---

## 11. Internationalization (Optional)

### 11.1 Setup

```typescript
// src/i18n/index.ts
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'

const i18n = createI18n({
  legacy: false,                      // Use Composition API mode
  locale: localStorage.getItem('locale') || 'en',
  fallbackLocale: 'en',
  messages: { en },
  missing: (_locale, key) => {
    // Return the key itself as fallback: avoids showing "undefined"
    console.warn(`[i18n] Missing translation: ${key}`)
    return key
  },
})

/**
 * Lazy-load additional locale files on demand.
 */
export async function loadLocale(locale: string) {
  if (i18n.global.availableLocales.includes(locale)) {
    i18n.global.locale.value = locale
    return
  }

  const messages = await import(`@/locales/${locale}.json`)
  i18n.global.setLocaleMessage(locale, messages.default)
  i18n.global.locale.value = locale
  localStorage.setItem('locale', locale)
}

export default i18n
```

### 11.2 Locale File Structure

```json
// src/locales/en.json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "search": "Search",
    "loading": "Loading...",
    "noResults": "No results found",
    "confirm": "Are you sure?",
    "yes": "Yes",
    "no": "No"
  },
  "auth": {
    "login": "Log In",
    "logout": "Log Out",
    "email": "Email",
    "password": "Password",
    "forgotPassword": "Forgot Password?",
    "register": "Create Account"
  },
  "nav": {
    "dashboard": "Dashboard",
    "items": "Items",
    "profile": "Profile",
    "admin": "Admin"
  },
  "errors": {
    "required": "{field} is required",
    "invalid": "Invalid {field}",
    "networkError": "Unable to reach the server",
    "unauthorized": "You are not authorized"
  }
}
```

### 11.3 Usage in Components

```vue
<template>
  <div>
    <h1>{{ $t('nav.dashboard') }}</h1>

    <Button :label="$t('common.save')" @click="save" />
    <Button :label="$t('common.cancel')" text @click="cancel" />

    <!-- With interpolation -->
    <Message severity="error" v-if="error">
      {{ $t('errors.required', { field: $t('auth.email') }) }}
    </Message>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

// Programmatic usage
function showValidationError(field: string) {
  const message = t('errors.required', { field: t(`fields.${field}`) })
  console.error(message)
}
</script>
```

### 11.4 Language Selector Component

```vue
<!-- src/components/common/LanguageSelector.vue -->
<template>
  <Select
    v-model="currentLocale"
    :options="locales"
    optionLabel="name"
    optionValue="code"
    placeholder="Language"
    class="w-36"
    @change="changeLocale"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { loadLocale } from '@/i18n'

const { locale } = useI18n()
const currentLocale = ref(locale.value)

const locales = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
]

async function changeLocale() {
  await loadLocale(currentLocale.value)
  document.documentElement.setAttribute('lang', currentLocale.value)
}
</script>
```

---

> **Accessibility:** All components must follow the accessibility standard. See `standards/05-accessibility.md`.
