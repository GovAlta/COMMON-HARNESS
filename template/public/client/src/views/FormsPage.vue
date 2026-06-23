<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import Paginator from 'primevue/paginator'
import Message from 'primevue/message'
import { FileText, Inbox, ArrowRight } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useForms } from '@/composables/useForms'

const { items, pagination, loading, error, refresh } = useForms()

const page = ref(1)
const limit = ref(12)

async function load(): Promise<void> {
  await refresh({ page: page.value, limit: limit.value })
}

function onPage(event: { page: number; rows: number }): void {
  page.value = event.page + 1
  limit.value = event.rows
  load()
}

onMounted(load)
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header class="mb-8">
        <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-2">
          Forms
        </h1>
        <p class="text-slate-600 font-geist">
          Submit any of the published forms below.
        </p>
      </header>

      <Message v-if="error" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <div v-if="loading" class="grid gap-4 md:grid-cols-2">
        <LoadingSkeleton v-for="i in 4" :key="i" type="card" />
      </div>

      <div
        v-else-if="items.length === 0"
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center"
      >
        <Inbox :size="40" class="mx-auto text-slate-400 mb-3" aria-hidden="true" />
        <h2 class="font-jakarta font-bold text-slate-900 mb-1">No forms available</h2>
        <p class="text-slate-500 font-geist text-sm">
          There are no published forms at the moment.
        </p>
      </div>

      <ul v-else class="grid gap-4 md:grid-cols-2">
        <li v-for="f in items" :key="f.pk_form_definition">
          <RouterLink
            :to="`/forms/${f.pk_form_definition}`"
            class="group block bg-white border border-slate-200 rounded-2xl shadow-sm p-6 hover:shadow-md hover:border-indigo-200 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            :aria-label="`Open form: ${f.form_name}`"
          >
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <FileText :size="20" class="text-indigo-600" aria-hidden="true" />
              </div>
              <div class="min-w-0 flex-1">
                <h2 class="font-jakarta font-bold text-slate-900 group-hover:text-indigo-600 transition-colors mb-1">
                  {{ f.form_name }}
                </h2>
                <p v-if="f.form_description" class="text-sm text-slate-600 font-geist line-clamp-2">
                  {{ f.form_description }}
                </p>
                <div class="mt-3 inline-flex items-center gap-1 text-sm font-geist font-medium text-indigo-600">
                  Open form
                  <ArrowRight :size="14" aria-hidden="true" />
                </div>
              </div>
            </div>
          </RouterLink>
        </li>
      </ul>

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
