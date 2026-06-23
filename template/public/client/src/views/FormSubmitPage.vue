<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, RouterLink, useRouter } from 'vue-router'
import { FormKit } from '@formkit/vue'
import Message from 'primevue/message'
import { ArrowLeft, CheckCircle2 } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useForms } from '@/composables/useForms'
import { useFiles } from '@/composables/useFiles'
import { useToast } from '@/composables/useToast'
import type { FormDefinition, FormFieldDefinition } from '@/types/form'

const route = useRoute()
const router = useRouter()
const { getSchema, submit, error } = useForms()
const { upload: uploadFile, error: uploadError } = useFiles()
const { success, error: notifyError } = useToast()

const definition = ref<FormDefinition | null>(null)
const loading = ref(true)
const submitting = ref(false)
const uploading = ref(false)
const submitted = ref<{ referenceNumber: string } | null>(null)

async function load(): Promise<void> {
  loading.value = true
  definition.value = await getSchema(route.params.id as string)
  loading.value = false
}

/**
 * Map our schema field types to the FormKit input type. FormKit ships
 * `text`, `textarea`, `select`, `checkbox`, `radio`, `email`, `tel`,
 * `number`, `url`, `date`, `time`, `password`, `file`, etc. natively.
 * Anything not natively supported falls back to `text`.
 *
 * The return type matches FormKit's accepted input names; we declare a
 * narrow union locally so callers (and the template) stay type-safe.
 */
type FormKitInputType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'time'
  | 'url'
  | 'password'
  | 'file'
  | 'color'
  | 'range'
  | 'search'
  | 'hidden'
  | 'month'
  | 'week'

function formkitType(type: FormFieldDefinition['type']): FormKitInputType {
  switch (type) {
    case 'textarea':
      return 'textarea'
    case 'email':
      return 'email'
    case 'phone':
    case 'tel':
      return 'tel'
    case 'number':
      return 'number'
    case 'date':
      return 'date'
    case 'time':
      return 'time'
    case 'select':
      return 'select'
    case 'radio':
      return 'radio'
    case 'checkbox':
      return 'checkbox'
    case 'url':
      return 'url'
    case 'password':
      return 'password'
    case 'file':
      return 'file'
    case 'color':
      return 'color'
    case 'range':
      return 'range'
    case 'search':
      return 'search'
    case 'hidden':
      return 'hidden'
    case 'month':
      return 'month'
    case 'week':
      return 'week'
    case 'datetime-local':
      // FormKit has no native datetime-local input; fall back to date.
      return 'date'
    default:
      return 'text'
  }
}

/** Build a FormKit validation string from our schema's validation block. */
function formkitValidation(field: FormFieldDefinition): string {
  const rules: string[] = []
  if (field.required) rules.push('required')
  const v = field.validation
  if (v) {
    if (typeof v.minLength === 'number') rules.push(`length:${v.minLength}`)
    if (typeof v.maxLength === 'number') rules.push(`length:0,${v.maxLength}`)
    if (typeof v.min === 'number') rules.push(`min:${v.min}`)
    if (typeof v.max === 'number') rules.push(`max:${v.max}`)
    if (v.pattern) rules.push(`matches:/${v.pattern}/`)
  }
  if (field.type === 'email') rules.push('email')
  if (field.type === 'url') rules.push('url')
  return rules.join('|')
}

const fields = computed<FormFieldDefinition[]>(() =>
  definition.value?.form_schema.fields ?? [],
)

const submitButtonLabel = computed<string>(() => {
  if (uploading.value) return 'Uploading attachments…'
  if (submitting.value) return 'Submitting…'
  return 'Submit'
})

/**
 * Build the FormKit v-bind object for one schema field. Using v-bind avoids
 * FormKit's per-input strict prop typing (e.g. `options` is rejected for
 * input types other than select/radio/checkbox), which is fine because the
 * runtime ignores irrelevant attributes.
 */
function fieldBindings(field: FormFieldDefinition): Record<string, unknown> {
  // FormKit does NOT auto-emit a data-required attribute (verified against
  // the @formkit/themes source — the dataset includes invalid/empty/complete
  // etc. but not required). So we append a literal ` *` to the label text
  // for required fields. The `formkit-required-asterisk` CSS hook on the
  // label class still styles the suffix red via the rule in main.css.
  const label = field.required ? `${field.label} *` : field.label

  const bindings: Record<string, unknown> = {
    type: formkitType(field.type),
    name: field.name,
    label,
    validation: formkitValidation(field),
  }
  if (field.placeholder) bindings.placeholder = field.placeholder
  if (field.helpText) bindings.help = field.helpText
  if (field.options && field.options.length > 0) bindings.options = field.options

  // Cap native date/datetime/month/week inputs at year 9999 so a user
  // typing `202001` instead of `2020-01` can't slip a 7-digit year past the
  // control. Browsers honour the `max` attribute by rejecting later values.
  if (field.type === 'date') bindings.max = '9999-12-31'
  else if (field.type === 'datetime-local') bindings.max = '9999-12-31T23:59'
  else if (field.type === 'month') bindings.max = '9999-12'
  else if (field.type === 'week') bindings.max = '9999-W52'

  return bindings
}

function fieldVisible(
  field: FormFieldDefinition,
  values: Record<string, unknown>,
): boolean {
  const c = field.conditional
  if (!c) return true
  const actual = values[c.field]
  switch (c.operator) {
    case 'not_equals':
      return actual !== c.value
    case 'contains':
      return Array.isArray(actual) ? actual.includes(c.value) : false
    case 'not_empty':
      return actual !== null && actual !== undefined && actual !== ''
    case 'equals':
    default:
      return actual === c.value
  }
}

/**
 * FormKit's `file` input stores its value as an array of { file: File, name }
 * entries, NOT raw File objects. We must:
 *   1. Walk the schema for `type === 'file'` fields.
 *   2. For each one, pull the File objects out of `data[field.name]` and
 *      upload them via POST /api/v1/files/upload, collecting their
 *      pk_file_attachment UUIDs.
 *   3. Replace the raw FormKit value on `data[field.name]` with the array
 *      of UUIDs so server-side AJV validation sees a clean string[] (the
 *      `file` branch in buildAjvSchema accepts `string | array`).
 *   4. Submit `{ data, fileIds }` — the server's submitForm() service then
 *      calls fileModel.linkToSubmission(fileIds, submissionId), wiring the
 *      attachments to the submission row so admin + user detail views
 *      render them.
 */
interface FormKitFileEntry {
  file: File
  name: string
}

function isFormKitFileEntry(v: unknown): v is FormKitFileEntry {
  return (
    typeof v === 'object' &&
    v !== null &&
    'file' in v &&
    (v as { file: unknown }).file instanceof File
  )
}

async function onSubmit(data: Record<string, unknown>): Promise<void> {
  if (!definition.value) return
  const fileFields = definition.value.form_schema.fields.filter(
    (f) => f.type === 'file',
  )

  const fileIds: string[] = []

  if (fileFields.length > 0) {
    uploading.value = true
    try {
      for (const field of fileFields) {
        const value = data[field.name]
        if (!Array.isArray(value) || value.length === 0) {
          // No file picked for this field — leave the entry alone (server's
          // submission_data validator accepts missing optional fields).
          continue
        }

        const idsForField: string[] = []
        for (const entry of value as unknown[]) {
          if (!isFormKitFileEntry(entry)) continue
          const uploaded = await uploadFile(entry.file)
          if (!uploaded) {
            notifyError(
              'Upload failed',
              uploadError.value ?? 'One of the attachments could not be uploaded.',
            )
            uploading.value = false
            return
          }
          idsForField.push(uploaded.pk_file_attachment)
          fileIds.push(uploaded.pk_file_attachment)
        }

        // Replace the raw File entries with the array of UUIDs so the JSON
        // payload is serialisable AND the server's AJV `file` branch (which
        // accepts string | array) is happy.
        data[field.name] = idsForField
      }
    } finally {
      uploading.value = false
    }
  }

  submitting.value = true
  const result = await submit(definition.value.pk_form_definition, {
    data,
    fileIds,
  })
  submitting.value = false
  if (result) {
    submitted.value = { referenceNumber: result.referenceNumber }
    success('Form submitted', `Reference: ${result.referenceNumber}`)
  } else {
    notifyError('Submission failed', error.value ?? 'Please try again.')
  }
}

onMounted(load)
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <RouterLink
        to="/forms"
        class="inline-flex items-center gap-2 text-sm font-geist text-slate-600 hover:text-indigo-600 mb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
      >
        <ArrowLeft :size="16" aria-hidden="true" />
        Back to forms
      </RouterLink>

      <div v-if="loading"><LoadingSkeleton type="text" :lines="10" /></div>

      <Message v-else-if="!definition && error" severity="error" :closable="false">
        {{ error }}
      </Message>

      <div
        v-else-if="!definition"
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center"
      >
        <h1 class="font-jakarta font-bold text-slate-900 mb-2">Form not found</h1>
      </div>

      <section
        v-else-if="submitted"
        class="bg-white border border-emerald-200 rounded-2xl shadow-sm p-10 text-center"
        aria-live="polite"
      >
        <CheckCircle2 :size="48" class="mx-auto text-emerald-500 mb-3" aria-hidden="true" />
        <h1 class="text-2xl font-jakarta font-bold text-slate-900 mb-2">
          Submission received
        </h1>
        <p class="text-slate-600 font-geist mb-2">
          Thank you. Your reference number is:
        </p>
        <p class="font-mono text-lg text-indigo-600 font-bold mb-6">
          {{ submitted.referenceNumber }}
        </p>
        <div class="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium font-geist hover:bg-indigo-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            @click="router.push('/forms')"
          >
            Back to forms
          </button>
        </div>
      </section>

      <article v-else>
        <header class="mb-6">
          <h1 class="text-3xl font-jakarta font-bold text-slate-900 mb-2">
            {{ definition.form_schema.title || definition.form_name }}
          </h1>
          <p
            v-if="definition.form_schema.description || definition.form_description"
            class="text-slate-600 font-geist"
          >
            {{ definition.form_schema.description || definition.form_description }}
          </p>
        </header>

        <Message v-if="error" severity="error" :closable="false" class="mb-6">
          {{ error }}
        </Message>

        <section
          class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8"
          aria-label="Form fields"
        >
          <FormKit
            type="form"
            :submit-label="submitButtonLabel"
            :submit-attrs="{ disabled: submitting || uploading }"
            :actions="false"
            v-slot="{ value }"
            @submit="onSubmit"
          >
            <template v-for="field in fields" :key="field.name">
              <FormKit
                v-if="fieldVisible(field, value as Record<string, unknown>)"
                v-bind="fieldBindings(field)"
              />
            </template>
            <FormKit
              type="submit"
              :label="submitButtonLabel"
              :disabled="submitting || uploading"
            />
          </FormKit>
        </section>
      </article>
    </div>
  </main>
</template>
