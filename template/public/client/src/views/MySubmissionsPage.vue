<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { Eye, Inbox } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useUserSubmissions, type FormSubmissionListItem } from '@/composables/useUserSubmissions'
import type { SubmissionStatus } from '@/types/form'
import type { ApiPaginationInfo } from '@/types/api'

const router = useRouter()
const { list, loading, error } = useUserSubmissions()

const rows = ref<FormSubmissionListItem[]>([])
const pagination = ref<ApiPaginationInfo | null>(null)
const page = ref(1)
const limit = ref(20)
const statusFilter = ref<SubmissionStatus | null>(null)

const statusOptions: { label: string; value: SubmissionStatus }[] = [
  { label: 'Draft', value: 'draft' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'In review', value: 'in-review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Completed', value: 'completed' },
  { label: 'Retracted', value: 'retracted' },
]

async function load(): Promise<void> {
  const result = await list({
    page: page.value,
    limit: limit.value,
    status: statusFilter.value ?? undefined,
  })
  rows.value = result.items
  pagination.value = result.pagination
}

function onPage(event: { page: number; rows: number }): void {
  page.value = event.page + 1
  limit.value = event.rows
  load()
}

function viewDetail(id: string): void {
  router.push(`/submissions/${id}`)
}

function statusSeverity(s: SubmissionStatus): 'success' | 'warn' | 'info' | 'danger' | 'secondary' {
  if (s === 'approved' || s === 'completed') return 'success'
  if (s === 'rejected' || s === 'retracted') return 'danger'
  if (s === 'in-review') return 'warn'
  if (s === 'draft') return 'secondary'
  return 'info'
}

onMounted(load)
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header class="mb-8">
        <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-2">
          My submissions
        </h1>
        <p class="text-slate-600 font-geist">
          View and manage the forms you've submitted.
        </p>
      </header>

      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6 mb-6"
        aria-label="Filter submissions"
      >
        <label for="my-status-filter" class="block text-sm font-medium text-slate-700 mb-1.5">
          Status
        </label>
        <Select
          input-id="my-status-filter"
          v-model="statusFilter"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          placeholder="All statuses"
          show-clear
          class="w-full sm:w-72"
          @change="load"
        />
      </section>

      <Message v-if="error" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
        aria-label="Your submissions"
      >
        <LoadingSkeleton v-if="loading && rows.length === 0" type="table" :lines="6" />
        <div
          v-else-if="rows.length === 0"
          class="p-10 text-center"
        >
          <Inbox
            :size="40"
            class="mx-auto text-slate-400 mb-3"
            aria-hidden="true"
          />
          <h2 class="font-jakarta font-bold text-slate-900 mb-1">No submissions yet</h2>
          <p class="text-slate-500 font-geist text-sm">
            Forms you submit will appear here.
          </p>
        </div>
        <DataTable
          v-else
          :value="rows"
          striped-rows
          paginator
          lazy
          :rows="limit"
          :rows-per-page-options="[10, 20, 50]"
          :total-records="pagination?.total ?? rows.length"
          :first="(page - 1) * limit"
          @page="onPage"
          data-key="pk_form_submission"
          aria-label="My submissions table"
        >
          <Column field="form_name" header="Form" sortable>
            <template #body="{ data }">
              {{ data.form_name || data.fk_form_submission_form_definition.slice(0, 8) }}
            </template>
          </Column>
          <Column field="submission_reference_number" header="Reference" sortable>
            <template #body="{ data }">
              <span class="font-mono text-sm">{{ data.submission_reference_number }}</span>
            </template>
          </Column>
          <Column field="submission_status" header="Status" sortable>
            <template #body="{ data }">
              <Tag :value="data.submission_status" :severity="statusSeverity(data.submission_status)" />
            </template>
          </Column>
          <Column field="updated_at" header="Updated" sortable>
            <template #body="{ data }">
              {{ new Date(data.updated_at).toLocaleString() }}
            </template>
          </Column>
          <Column header="Actions">
            <template #body="{ data }">
              <button
                type="button"
                class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                :aria-label="`View submission ${data.submission_reference_number}`"
                @click="viewDetail(data.pk_form_submission)"
              >
                <Eye :size="12" aria-hidden="true" />
                View
              </button>
            </template>
          </Column>
        </DataTable>
      </section>
    </div>
  </main>
</template>
