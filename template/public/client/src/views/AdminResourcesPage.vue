<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import Select from 'primevue/select'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'
import { FormKit } from '@formkit/vue'
import { Plus, Pencil, Trash2, Copy } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useAdmin } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'
import type {
  ResourceItem,
  CreateResourcePayload,
  ResourceCategory,
  ResourceStatus,
} from '@/types/resource'

// Admin listing returns ALL statuses (draft/published/archived). The public
// useResources composable hits /v1/resources, which intersects with a
// PUBLIC_STATUSES allow-list and strips drafts. Admin pages must call the
// dedicated /v1/admin/resources endpoint via listResourcesAdmin instead.
const items = ref<ResourceItem[]>([])
const pagination = ref<{ page: number; limit: number; total: number; totalPages: number } | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const {
  listResourcesAdmin,
  createResource,
  updateResource,
  deleteResource,
  cloneResource,
  error: adminError,
} = useAdmin()
const { success, error: notifyError } = useToast()
const confirm = useConfirm()

const page = ref(1)
const limit = ref(20)

const dialogOpen = ref(false)
const editing = ref<ResourceItem | null>(null)

interface FormValues extends CreateResourcePayload {
  resource_status: ResourceStatus
  resource_category: ResourceCategory
}

const initialValues = computed<Partial<FormValues>>(() => {
  if (!editing.value) {
    return { resource_status: 'draft', resource_category: 'guide' }
  }
  return {
    resource_title: editing.value.resource_title,
    resource_status: editing.value.resource_status,
    resource_category: editing.value.resource_category,
    resource_summary: editing.value.resource_summary ?? undefined,
    resource_content: editing.value.resource_content ?? undefined,
    resource_author: editing.value.resource_author ?? undefined,
    resource_region: editing.value.resource_region ?? undefined,
  }
})

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const result = await listResourcesAdmin({ page: page.value, limit: limit.value })
    if (result) {
      items.value = result.data
      pagination.value = result.pagination
    }
  } catch (err) {
    error.value = (err as Error).message
    items.value = []
    pagination.value = null
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(row: ResourceItem): void {
  editing.value = row
  dialogOpen.value = true
}

// Local form state for PrimeVue Selects bound via v-model.
const formStatus = ref<ResourceStatus>('draft')
const formCategory = ref<ResourceCategory>('guide')

function syncFormDefaults(): void {
  if (editing.value) {
    formStatus.value = editing.value.resource_status
    formCategory.value = editing.value.resource_category
  } else {
    formStatus.value = 'draft'
    formCategory.value = 'guide'
  }
}

async function onSubmit(data: Partial<FormValues>): Promise<void> {
  const payload: CreateResourcePayload = {
    resource_title: data.resource_title ?? '',
    resource_status: formStatus.value,
    resource_category: formCategory.value,
    resource_summary: data.resource_summary || undefined,
    resource_content: data.resource_content || undefined,
    resource_author: data.resource_author || undefined,
    resource_region: data.resource_region || undefined,
  }
  const result = editing.value
    ? await updateResource(editing.value.pk_resource_item, payload)
    : await createResource(payload)
  if (result) {
    success(editing.value ? 'Resource updated' : 'Resource created')
    dialogOpen.value = false
    await load()
  } else {
    notifyError('Save failed', adminError.value ?? 'Please try again.')
  }
}

function confirmDelete(row: ResourceItem): void {
  confirm.require({
    message: `Delete "${row.resource_title}"? The resource will be hidden from all public and admin lists, but the record is retained in the database for audit purposes. This is a soft-delete and can be restored by an administrator from the audit trail.`,
    header: 'Confirm delete',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      const ok = await deleteResource(row.pk_resource_item)
      if (ok) {
        // Optimistic removal so the row vanishes immediately. The next
        // refresh() call replaces this with authoritative pagination state.
        items.value = items.value.filter(
          (r) => r.pk_resource_item !== row.pk_resource_item,
        )
        success('Resource deleted')
        await load()
      } else {
        notifyError('Delete failed', adminError.value ?? 'Please try again.')
      }
    },
  })
}

function statusSeverity(s: ResourceStatus): 'success' | 'warn' | 'info' {
  if (s === 'published') return 'success'
  if (s === 'draft') return 'warn'
  return 'info'
}

function onPage(event: { page: number; rows: number }): void {
  page.value = event.page + 1
  limit.value = event.rows
  load()
}

/**
 * Clone the row's resource. The server appends " (DRAFT)" to the title,
 * forces status to draft, generates a fresh pk_resource_item, and writes an
 * audit row with metadata.clone_of pointing at the original. We refresh the
 * list so the new draft row appears in place.
 */
async function onClone(row: ResourceItem): Promise<void> {
  const clone = await cloneResource(row.pk_resource_item)
  if (clone) {
    success('Resource cloned', `Created "${clone.resource_title}"`)
    await load()
  } else {
    notifyError('Clone failed', adminError.value ?? 'Please try again.')
  }
}

const categoryOptions: { label: string; value: ResourceCategory }[] = [
  { label: 'Guide', value: 'guide' },
  { label: 'Announcement', value: 'announcement' },
  { label: 'Policy', value: 'policy' },
  { label: 'Reference', value: 'reference' },
  { label: 'Bulletin', value: 'bulletin' },
]
const statusOptions: { label: string; value: ResourceStatus }[] = [
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Archived', value: 'archived' },
]

function onDialogShow(): void {
  syncFormDefaults()
}

onMounted(load)
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-2"
          >
            Manage Resources
          </h1>
          <p class="text-slate-600 font-geist">
            Create, edit, and publish resource items.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
          aria-label="Create a new resource"
          @click="openCreate"
        >
          <Plus :size="16" aria-hidden="true" />
          New resource
        </button>
      </header>

      <Message
        v-if="error || adminError"
        severity="error"
        :closable="false"
        class="mb-6"
      >
        {{ error || adminError }}
      </Message>

      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
      >
        <LoadingSkeleton v-if="loading" type="table" :lines="6" />
        <DataTable
          v-else
          :value="items"
          striped-rows
          paginator
          :rows="limit"
          :rows-per-page-options="[10, 20, 50]"
          :total-records="pagination?.total ?? items.length"
          lazy
          :first="(page - 1) * limit"
          data-key="pk_resource_item"
          aria-label="Resources table"
          @page="onPage"
        >
          <Column field="resource_title" header="Title" sortable />
          <Column field="resource_category" header="Category" sortable>
            <template #body="{ data }">
              <Tag :value="data.resource_category" severity="info" />
            </template>
          </Column>
          <Column field="resource_status" header="Status" sortable>
            <template #body="{ data }">
              <Tag
                :value="data.resource_status"
                :severity="statusSeverity(data.resource_status)"
              />
            </template>
          </Column>
          <Column field="resource_region" header="Region" sortable />
          <Column field="updated_at" header="Updated" sortable>
            <template #body="{ data }">
              {{ new Date(data.updated_at).toLocaleDateString() }}
            </template>
          </Column>
          <Column header="Actions">
            <template #body="{ data }">
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  :aria-label="`Edit resource ${data.resource_title}`"
                  @click="openEdit(data)"
                >
                  <Pencil :size="12" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  :aria-label="`Clone resource ${data.resource_title}`"
                  @click="onClone(data)"
                >
                  <Copy :size="12" aria-hidden="true" />
                  Clone
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  :aria-label="`Delete resource ${data.resource_title}`"
                  @click="confirmDelete(data)"
                >
                  <Trash2 :size="12" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </template>
          </Column>
        </DataTable>
      </section>
    </div>

    <Dialog
      v-model:visible="dialogOpen"
      modal
      :header="editing ? 'Edit resource' : 'New resource'"
      :style="{ width: '40rem', maxWidth: '95vw' }"
      :aria-label="editing ? 'Edit resource form' : 'New resource form'"
      @show="onDialogShow"
    >
      <FormKit
        type="form"
        :actions="false"
        :value="initialValues"
        @submit="onSubmit"
      >
        <FormKit
          type="text"
          name="resource_title"
          label="Title"
          validation="required|length:1,255"
        />

        <div class="formkit-outer mb-4">
          <label
            for="resource-category-select"
            class="block text-sm font-medium text-slate-700 mb-1.5"
          >
            Category
          </label>
          <Select
            v-model="formCategory"
            input-id="resource-category-select"
            :options="categoryOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            aria-label="Resource category"
          />
        </div>

        <div class="formkit-outer mb-4">
          <label
            for="resource-status-select"
            class="block text-sm font-medium text-slate-700 mb-1.5"
          >
            Status
          </label>
          <Select
            v-model="formStatus"
            input-id="resource-status-select"
            :options="statusOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            aria-label="Resource status"
          />
        </div>

        <FormKit type="text" name="resource_author" label="Author" />
        <FormKit type="text" name="resource_region" label="Region" />
        <FormKit
          type="textarea"
          name="resource_summary"
          label="Summary"
          validation="length:0,500"
        />
        <FormKit type="textarea" name="resource_content" label="Content" />

        <div class="mt-6 flex items-center gap-3">
          <FormKit
            type="submit"
            :label="editing ? 'Save changes' : 'Create resource'"
          />
          <button
            type="button"
            class="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            @click="dialogOpen = false"
          >
            Cancel
          </button>
        </div>
      </FormKit>
    </Dialog>

    <ConfirmDialog />
  </main>
</template>
