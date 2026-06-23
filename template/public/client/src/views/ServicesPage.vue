<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Paginator from 'primevue/paginator'
import Message from 'primevue/message'
import { Search, Inbox, ArrowRight } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useServices } from '@/composables/useServices'

const { items, categories, pagination, loading, error, refresh, fetchCategories } =
  useServices()

const search = ref('')
const category = ref<string | null>(null)
const page = ref(1)
const limit = ref(12)

async function load(): Promise<void> {
  await refresh({
    page: page.value,
    limit: limit.value,
    search: search.value || undefined,
    category: category.value || undefined,
  })
}

function onPage(event: { page: number; rows: number }): void {
  page.value = event.page + 1
  limit.value = event.rows
  load()
}

function onSearchInput(): void {
  page.value = 1
  load()
}

function onCategoryChange(): void {
  page.value = 1
  load()
}

onMounted(async () => {
  await fetchCategories()
  await load()
})
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header class="mb-8">
        <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-2">
          Services
        </h1>
        <p class="text-slate-600 font-geist">
          Discover available services across categories.
        </p>
      </header>

      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6 mb-8"
        aria-label="Filter services"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label for="service-search" class="block text-sm font-medium text-slate-700 mb-1.5">
              Search
            </label>
            <span class="relative block">
              <Search
                :size="16"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                aria-hidden="true"
              />
              <InputText
                id="service-search"
                v-model="search"
                placeholder="Search services"
                class="w-full !pl-10"
                aria-label="Search services"
                @keyup.enter="onSearchInput"
              />
            </span>
          </div>
          <div>
            <label for="service-category" class="block text-sm font-medium text-slate-700 mb-1.5">
              Category
            </label>
            <Select
              input-id="service-category"
              v-model="category"
              :options="categories"
              option-label="category_name"
              option-value="pk_service_category"
              placeholder="All categories"
              show-clear
              class="w-full"
              @change="onCategoryChange"
            />
          </div>
        </div>
      </section>

      <Message v-if="error" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <div v-if="loading" class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <LoadingSkeleton v-for="i in 6" :key="i" type="card" />
      </div>

      <div
        v-else-if="items.length === 0"
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center"
      >
        <Inbox :size="40" class="mx-auto text-slate-400 mb-3" aria-hidden="true" />
        <h2 class="font-jakarta font-bold text-slate-900 mb-1">No services found</h2>
        <p class="text-slate-500 font-geist text-sm">Try clearing the filters.</p>
      </div>

      <div v-else class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <RouterLink
          v-for="s in items"
          :key="s.pk_service_catalogue"
          :to="`/services/${s.pk_service_catalogue}`"
          class="group block bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden hover:shadow-md hover:border-indigo-200 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          :aria-label="`View service: ${s.service_title}`"
        >
          <div class="p-6">
            <span
              class="inline-block text-[10px] font-geist font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 mb-3"
            >
              {{ s.category_name }}
            </span>
            <h2 class="font-jakarta font-bold text-slate-900 mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors">
              {{ s.service_title }}
            </h2>
            <p class="text-sm text-slate-600 font-geist line-clamp-3">
              {{ s.service_description_brief }}
            </p>
            <div class="mt-4 inline-flex items-center gap-1 text-sm font-geist font-medium text-indigo-600">
              Details
              <ArrowRight :size="14" aria-hidden="true" />
            </div>
          </div>
        </RouterLink>
      </div>

      <div v-if="pagination && pagination.total > limit" class="mt-8">
        <Paginator
          :rows="limit"
          :total-records="pagination.total"
          :first="(page - 1) * limit"
          :rows-per-page-options="[12, 24, 48]"
          @page="onPage"
        />
      </div>
    </div>
  </main>
</template>
