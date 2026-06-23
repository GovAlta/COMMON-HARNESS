<script setup lang="ts">
import { ref, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import { Eye } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import SubmissionDetailView from '@/components/submissions/SubmissionDetailView.vue'
import { useAdmin } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'
import type { AdminSubmission, SubmissionDetail } from '@/types/admin'
import type { SubmissionStatus } from '@/types/form'
import type { ApiPaginationInfo } from '@/types/api'

const {
  listAllSubmissions,
  getSubmissionDetail,
  updateSubmissionStatus,
  error,
  loading,
} = useAdmin()
const { success, error: notifyError } = useToast()

const rows = ref<AdminSubmission[]>([])
const pagination = ref<ApiPaginationInfo | null>(null)
const page = ref(1)
const limit = ref(20)
const statusFilter = ref<SubmissionStatus | null>(null)

// Detail modal state
const dialogOpen = ref(false)
const detail = ref<SubmissionDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)
const pendingStatus = ref<SubmissionStatus | null>(null)
const statusSubmitting = ref(false)

const statusOptions: { label: string; value: SubmissionStatus }[] = [
  { label: 'Submitted', value: 'submitted' },
  { label: 'In review', value: 'in-review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Completed', value: 'completed' },
]

async function load(): Promise<void> {
  const result = await listAllSubmissions({
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

async function openDetail(row: AdminSubmission): Promise<void> {
  dialogOpen.value = true
  detail.value = null
  detailError.value = null
  detailLoading.value = true
  const result = await getSubmissionDetail(row.pk_form_submission)
  detailLoading.value = false
  if (result) {
    detail.value = result
    pendingStatus.value = result.submission.submission_status
  } else {
    detailError.value = error.value ?? 'Could not load submission detail.'
  }
}

async function onUpdateStatus(): Promise<void> {
  if (!detail.value || !pendingStatus.value) return
  if (pendingStatus.value === detail.value.submission.submission_status) return
  statusSubmitting.value = true
  const updated = await updateSubmissionStatus(
    detail.value.submission.pk_form_submission,
    pendingStatus.value,
  )
  statusSubmitting.value = false
  if (updated) {
    detail.value.submission.submission_status = updated.submission_status
    // Patch the table row in-place
    const idx = rows.value.findIndex(
      (r) => r.pk_form_submission === updated.pk_form_submission,
    )
    if (idx >= 0) rows.value[idx].submission_status = updated.submission_status
    success('Status updated')
  } else {
    notifyError('Could not update status', error.value ?? '')
  }
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
          Submissions
        </h1>
        <p class="text-slate-600 font-geist">
          Review and update the status of form submissions.
        </p>
      </header>

      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6 mb-6"
        aria-label="Filter submissions"
      >
        <label for="status-filter" class="block text-sm font-medium text-slate-700 mb-1.5">
          Status
        </label>
        <Select
          input-id="status-filter"
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

      <Message v-if="error && !dialogOpen" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <section class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <LoadingSkeleton v-if="loading && rows.length === 0" type="table" :lines="6" />
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
          aria-label="Submissions table"
        >
          <Column field="submission_reference_number" header="Reference" sortable />
          <Column field="form_name" header="Form" sortable>
            <template #body="{ data }">
              {{ data.form_name || data.fk_form_submission_form_definition.slice(0, 8) }}
            </template>
          </Column>
          <Column field="submission_status" header="Status" sortable>
            <template #body="{ data }">
              <Tag :value="data.submission_status" :severity="statusSeverity(data.submission_status)" />
            </template>
          </Column>
          <Column field="created_at" header="Submitted" sortable>
            <template #body="{ data }">
              {{ new Date(data.created_at).toLocaleString() }}
            </template>
          </Column>
          <Column header="Actions">
            <template #body="{ data }">
              <button
                type="button"
                class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                :aria-label="`View submission ${data.submission_reference_number}`"
                @click="openDetail(data)"
              >
                <Eye :size="12" aria-hidden="true" />
                View
              </button>
            </template>
          </Column>
        </DataTable>
      </section>
    </div>

    <Dialog
      v-model:visible="dialogOpen"
      modal
      :style="{ width: '52rem', maxWidth: '95vw' }"
      :header="detail?.submission.submission_reference_number || 'Submission'"
      :aria-label="`Submission ${detail?.submission.submission_reference_number ?? ''} detail`"
      :dismissable-mask="false"
    >
      <LoadingSkeleton v-if="detailLoading" type="text" :lines="6" />
      <Message v-else-if="detailError" severity="error" :closable="false">
        {{ detailError }}
      </Message>
      <SubmissionDetailView
        v-else-if="detail"
        :detail="detail"
        show-submitter
      >
        <template #actions>
          <div class="space-y-3">
            <h3 class="text-sm font-jakarta font-semibold uppercase tracking-wide text-slate-500">
              Change status
            </h3>
            <div class="flex flex-wrap items-center gap-3">
              <label for="admin-detail-status" class="sr-only">New status</label>
              <Select
                v-model="pendingStatus"
                input-id="admin-detail-status"
                :options="statusOptions"
                option-label="label"
                option-value="value"
                class="w-60"
                aria-label="Select new status"
              />
              <button
                type="button"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="statusSubmitting || !pendingStatus || pendingStatus === detail.submission.submission_status"
                @click="onUpdateStatus"
              >
                {{ statusSubmitting ? 'Updating…' : 'Update status' }}
              </button>
            </div>
          </div>
        </template>
      </SubmissionDetailView>
    </Dialog>
  </main>
</template>
