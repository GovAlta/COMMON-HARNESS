<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Paginator from 'primevue/paginator'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { Search, FileText, Inbox } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useResources } from '@/composables/useResources'
import type {
  ResourceCategory,
  ResourceStatus,
} from '@/types/resource'

const { items, pagination, loading, error, refresh } = useResources()

const search = ref('')
const status = ref<ResourceStatus | null>(null)
const category = ref<ResourceCategory | null>(null)
const page = ref(1)
const limit = ref(12)

const statusOptions: { label: string; value: ResourceStatus }[] = [
  { label: 'Published', value: 'published' },
  { label: 'Draft', value: 'draft' },
  { label: 'Archived', value: 'archived' },
]
const categoryOptions: { label: string; value: ResourceCategory }[] = [
  { label: 'Guide', value: 'guide' },
  { label: 'Announcement', value: 'announcement' },
  { label: 'Policy', value: 'policy' },
  { label: 'Reference', value: 'reference' },
  { label: 'Bulletin', value: 'bulletin' },
]

async function load(): Promise<void> {
  await refresh({
    page: page.value,
    limit: limit.value,
    search: search.value || undefined,
    status: status.value || undefined,
    category: category.value || undefined,
  })
}

function onSearchInput(): void {
  page.value = 1
  load()
}

function onPage(event: { page: number; rows: number }): void {
  page.value = event.page + 1
  limit.value = event.rows
  load()
}

watch([status, category], () => {
  page.value = 1
  load()
})

onMounted(load)

function statusSeverity(s: string): 'success' | 'info' | 'warn' {
  if (s === 'published') return 'success'
  if (s === 'draft') return 'warn'
  return 'info'
}
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header class="mb-8">
        <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-2">
          Resources
        </h1>
        <p class="text-slate-600 font-geist">
          Browse published guides, announcements, policies, and reference material.
        </p>
      </header>

      <!-- Filters -->
      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6 mb-8"
        aria-label="Filter resources"
      >
        <div class="grid gap-4 md:grid-cols-3">
          <div>
            <label for="resource-search" class="block text-sm font-medium text-slate-700 mb-1.5">
              Search
            </label>
            <span class="relative block">
              <Search
                :size="16"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                aria-hidden="true"
              />
              <InputText
                id="resource-search"
                v-model="search"
                placeholder="Search title, summary, author"
                class="w-full !pl-10"
                aria-label="Search resources"
                @keyup.enter="onSearchInput"
              />
            </span>
          </div>
          <div>
            <label for="resource-status" class="block text-sm font-medium text-slate-700 mb-1.5">
              Status
            </label>
            <Select
              input-id="resource-status"
              v-model="status"
              :options="statusOptions"
              option-label="label"
              option-value="value"
              placeholder="All statuses"
              show-clear
              class="w-full"
            />
          </div>
          <div>
            <label for="resource-category" class="block text-sm font-medium text-slate-700 mb-1.5">
              Category
            </label>
            <Select
              input-id="resource-category"
              v-model="category"
              :options="categoryOptions"
              option-label="label"
              option-value="value"
              placeholder="All categories"
              show-clear
              class="w-full"
            />
          </div>
        </div>
      </section>

      <Message v-if="error" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <!-- Loading -->
      <div v-if="loading" class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <LoadingSkeleton v-for="i in 6" :key="i" type="card" />
      </div>

      <!-- Empty -->
      <div
        v-else-if="items.length === 0"
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center"
      >
        <Inbox :size="40" class="mx-auto text-slate-400 mb-3" aria-hidden="true" />
        <h2 class="font-jakarta font-bold text-slate-900 mb-1">No resources found</h2>
        <p class="text-slate-500 font-geist text-sm">
          Try adjusting your filters or check back later.
        </p>
      </div>

      <!-- List -->
      <div v-else class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <RouterLink
          v-for="r in items"
          :key="r.pk_resource_item"
          :to="`/resources/${r.pk_resource_item}`"
          class="group block bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden hover:shadow-md hover:border-indigo-200 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          :aria-label="`View resource: ${r.resource_title}`"
        >
          <div class="p-6">
            <div class="flex items-center gap-2 mb-3 flex-wrap">
              <Tag :value="r.resource_category" severity="info" />
              <Tag :value="r.resource_status" :severity="statusSeverity(r.resource_status)" />
              <span v-if="r.resource_region" class="text-xs font-geist text-slate-500">
                · {{ r.resource_region }}
              </span>
            </div>
            <h2 class="font-jakarta font-bold text-slate-900 mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors">
              {{ r.resource_title }}
            </h2>
            <p v-if="r.resource_summary" class="text-sm text-slate-600 font-geist line-clamp-3">
              {{ r.resource_summary }}
            </p>
            <div class="mt-4 flex items-center gap-2 text-xs text-slate-400 font-geist">
              <FileText :size="14" aria-hidden="true" />
              <span v-if="r.resource_author">{{ r.resource_author }}</span>
              <span v-if="r.resource_author && r.resource_published_at" aria-hidden="true">·</span>
              <time v-if="r.resource_published_at" :datetime="r.resource_published_at">
                {{ new Date(r.resource_published_at).toLocaleDateString() }}
              </time>
            </div>
          </div>
        </RouterLink>
      </div>

      <!-- Paginator -->
      <div v-if="pagination && pagination.total > limit" class="mt-8">
        <Paginator
          :rows="limit"
          :total-records="pagination.total"
          :first="(page - 1) * limit"
          :rows-per-page-options="[12, 24, 48]"
          template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
          @page="onPage"
        />
      </div>
    </div>
  </main>
</template>
