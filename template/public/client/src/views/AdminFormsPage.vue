<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'
import { FormKit } from '@formkit/vue'
import { Plus, Pencil, Trash2, Copy } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useAdmin } from '@/composables/useAdmin'
import { useToast } from '@/composables/useToast'
import type {
  FormDefinition,
  FormSchema,
  CreateFormPayload,
} from '@/types/form'

const { listAdminForms, createForm, updateForm, deleteForm, cloneForm, error, loading } = useAdmin()
const { success, error: notifyError } = useToast()
const confirm = useConfirm()

const forms = ref<FormDefinition[]>([])
const dialogOpen = ref(false)
const editing = ref<FormDefinition | null>(null)
const schemaError = ref<string | null>(null)

interface FormValues {
  form_name: string
  form_description?: string
  is_published?: boolean
  form_schema_json?: string
}

const initialValues = computed<Partial<FormValues>>(() => {
  if (!editing.value) {
    return {
      is_published: false,
      form_schema_json: JSON.stringify(
        {
          title: 'New form',
          fields: [
            { name: 'fullName', type: 'text', label: 'Full name', required: true },
          ],
        },
        null,
        2,
      ),
    }
  }
  return {
    form_name: editing.value.form_name,
    form_description: editing.value.form_description ?? undefined,
    is_published: editing.value.is_published,
    form_schema_json: JSON.stringify(editing.value.form_schema, null, 2),
  }
})

async function load(): Promise<void> {
  forms.value = await listAdminForms()
}

function openCreate(): void {
  editing.value = null
  dialogOpen.value = true
  schemaError.value = null
}

function openEdit(row: FormDefinition): void {
  editing.value = row
  dialogOpen.value = true
  schemaError.value = null
}

async function onSubmit(data: FormValues): Promise<void> {
  schemaError.value = null
  let schema: FormSchema
  try {
    schema = JSON.parse(data.form_schema_json ?? '{}') as FormSchema
    if (!schema.title || !Array.isArray(schema.fields)) {
      throw new Error('Schema must have a `title` and a `fields` array.')
    }
  } catch (err) {
    schemaError.value = err instanceof Error ? err.message : 'Invalid JSON in schema'
    return
  }
  const payload: CreateFormPayload = {
    form_name: data.form_name,
    form_description: data.form_description,
    form_schema: schema,
    is_published: !!data.is_published,
  }
  const result = editing.value
    ? await updateForm(editing.value.pk_form_definition, payload)
    : await createForm(payload)
  if (result) {
    success(editing.value ? 'Form updated' : 'Form created')
    dialogOpen.value = false
    await load()
  } else {
    notifyError('Save failed', error.value ?? 'Please try again.')
  }
}

/**
 * Clone the row's form. Server appends " (DRAFT)" to form_name, forces
 * is_published to false, copies form_schema verbatim, and writes an audit
 * row with metadata.clone_of pointing at the original.
 */
async function onClone(row: FormDefinition): Promise<void> {
  const clone = await cloneForm(row.pk_form_definition)
  if (clone) {
    success('Form cloned', `Created "${clone.form_name}"`)
    await load()
  } else {
    notifyError('Clone failed', error.value ?? 'Please try again.')
  }
}

function confirmDelete(row: FormDefinition): void {
  confirm.require({
    message: `Delete "${row.form_name}"? The form will be hidden from the public list AND unpublished, but existing submissions and the form definition stay in the database for audit purposes. This is a soft-delete and can be restored by an administrator from the audit trail.`,
    header: 'Confirm delete',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      const ok = await deleteForm(row.pk_form_definition)
      if (ok) {
        forms.value = forms.value.filter(
          (r) => r.pk_form_definition !== row.pk_form_definition,
        )
        success('Form deleted')
        await load()
      } else {
        notifyError('Delete failed', error.value ?? 'Please try again.')
      }
    },
  })
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
            Manage Forms
          </h1>
          <p class="text-slate-600 font-geist">
            Define form schemas, publish them, and version them.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
          aria-label="Create a new form"
          @click="openCreate"
        >
          <Plus :size="16" aria-hidden="true" />
          New form
        </button>
      </header>

      <Message v-if="error" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
      >
        <LoadingSkeleton
          v-if="loading && forms.length === 0"
          type="table"
          :lines="6"
        />
        <DataTable
          v-else
          :value="forms"
          striped-rows
          paginator
          :rows="20"
          :rows-per-page-options="[10, 20, 50]"
          data-key="pk_form_definition"
          aria-label="Forms table"
        >
          <Column field="form_name" header="Name" sortable />
          <Column field="form_version_number" header="Version" sortable />
          <Column field="is_published" header="Published" sortable>
            <template #body="{ data }">
              <Tag
                :value="data.is_published ? 'Published' : 'Draft'"
                :severity="data.is_published ? 'success' : 'warn'"
              />
            </template>
          </Column>
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
                  :aria-label="`Edit form ${data.form_name}`"
                  @click="openEdit(data)"
                >
                  <Pencil :size="12" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  :aria-label="`Clone form ${data.form_name}`"
                  @click="onClone(data)"
                >
                  <Copy :size="12" aria-hidden="true" />
                  Clone
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  :aria-label="`Delete form ${data.form_name}`"
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
      :header="editing ? 'Edit form' : 'New form'"
      :style="{ width: '52rem', maxWidth: '95vw' }"
      :aria-label="editing ? 'Edit form definition' : 'New form definition'"
    >
      <Message v-if="schemaError" severity="error" :closable="false" class="mb-4">
        {{ schemaError }}
      </Message>
      <FormKit
        type="form"
        :actions="false"
        :value="initialValues"
        @submit="onSubmit"
      >
        <FormKit
          type="text"
          name="form_name"
          label="Name"
          validation="required|length:1,200"
        />
        <FormKit type="textarea" name="form_description" label="Description" />
        <FormKit type="checkbox" name="is_published" label="Publish this form" />
        <FormKit
          type="textarea"
          name="form_schema_json"
          label="Schema (JSON)"
          help="A JSON object with `title` and `fields` array. See documentation for full structure."
          validation="required"
          input-class="font-mono text-xs min-h-[300px]"
        />
        <div class="mt-6 flex items-center gap-3">
          <FormKit
            type="submit"
            :label="editing ? 'Save changes' : 'Create form'"
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
