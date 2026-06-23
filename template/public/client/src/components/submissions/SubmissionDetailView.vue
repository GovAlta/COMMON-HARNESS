<script setup lang="ts">
import { computed } from 'vue'
import Tag from 'primevue/tag'
import { FileText, Paperclip, Download } from 'lucide-vue-next'
import { useFiles } from '@/composables/useFiles'
import type { SubmissionDetail } from '@/types/admin'
import type { FormFieldDefinition, SubmissionStatus } from '@/types/form'

/**
 * Read-only renderer for a {submission, form, attachments} triple. Used by
 * both the admin and user submission detail surfaces so field rendering,
 * value formatting, and attachment download links stay consistent.
 *
 * Action controls (status change, edit, retract, etc.) are not part of
 * this component — pass them in via the default slot which renders below
 * the attachment list.
 */

const props = defineProps<{
  detail: SubmissionDetail
  /** Optional — show the user_email/user_name when available on submission. */
  showSubmitter?: boolean
}>()

const { downloadUrl } = useFiles()

const submission = computed(() => props.detail.submission)
const form = computed(() => props.detail.form)
const attachments = computed(() => props.detail.attachments)
const fields = computed<FormFieldDefinition[]>(
  () => form.value.form_schema?.fields ?? [],
)

function statusSeverity(s: SubmissionStatus): 'success' | 'warn' | 'info' | 'danger' | 'secondary' {
  if (s === 'approved' || s === 'completed') return 'success'
  if (s === 'rejected' || s === 'retracted') return 'danger'
  if (s === 'in-review') return 'warn'
  if (s === 'draft') return 'secondary'
  return 'info'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function friendlyMime(mime: string): string {
  if (!mime) return 'file'
  if (mime === 'application/pdf') return 'PDF'
  if (mime.startsWith('image/')) return mime.replace('image/', '').toUpperCase()
  if (mime.startsWith('text/')) return mime.replace('text/', '').toUpperCase()
  return mime.split('/').pop()?.toUpperCase() ?? 'file'
}

/**
 * Format a single submission_data value for display. Booleans become
 * "Yes"/"No", arrays become a comma-separated string, objects fall through
 * to a JSON-rendered <pre> block (handled in template), strings preserve
 * whitespace via the consumer's whitespace-pre-wrap class.
 *
 * Returns `null` for missing/empty values so the template can render the
 * muted "(not provided)" placeholder instead.
 */
function formatValue(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    return value.map((v) => String(v)).join(', ')
  }
  if (typeof value === 'object') return null // rendered as JSON block in template
  return String(value)
}

function isObjectValue(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function getFieldValue(name: string): unknown {
  const data = submission.value.submission_data ?? {}
  return (data as Record<string, unknown>)[name]
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header: form name, reference, status, submitter, dates -->
    <header class="space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-xl sm:text-2xl font-jakarta font-bold text-slate-900">
          {{ submission.form_name || form.form_name }}
        </h2>
        <Tag
          :value="submission.submission_status"
          :severity="statusSeverity(submission.submission_status)"
        />
      </div>
      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm font-geist">
        <div class="flex gap-2">
          <dt class="text-slate-500">Reference:</dt>
          <dd class="text-slate-900 font-mono">
            {{ submission.submission_reference_number }}
          </dd>
        </div>
        <div v-if="showSubmitter && (submission.user_name || submission.user_email)" class="flex gap-2">
          <dt class="text-slate-500">Submitter:</dt>
          <dd class="text-slate-900 truncate">
            {{ submission.user_name || submission.user_email }}
            <span v-if="submission.user_name && submission.user_email" class="text-slate-500">
              ({{ submission.user_email }})
            </span>
          </dd>
        </div>
        <div class="flex gap-2">
          <dt class="text-slate-500">Submitted:</dt>
          <dd class="text-slate-900">
            {{ new Date(submission.created_at).toLocaleString() }}
          </dd>
        </div>
        <div v-if="submission.updated_at !== submission.created_at" class="flex gap-2">
          <dt class="text-slate-500">Updated:</dt>
          <dd class="text-slate-900">
            {{ new Date(submission.updated_at).toLocaleString() }}
          </dd>
        </div>
      </dl>
    </header>

    <!-- Form data: iterate over form.form_schema.fields -->
    <section aria-label="Submission data" class="space-y-3">
      <h3 class="text-sm font-jakarta font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
        <FileText :size="14" aria-hidden="true" />
        Form data
      </h3>
      <div
        v-if="fields.length === 0"
        class="text-sm text-slate-500 font-geist italic"
      >
        This form has no defined fields.
      </div>
      <dl v-else class="space-y-3">
        <div
          v-for="field in fields"
          :key="field.name"
          class="border border-slate-200 rounded-lg p-3 bg-slate-50"
        >
          <dt class="text-xs font-jakarta font-semibold text-slate-600 uppercase tracking-wide mb-1">
            {{ field.label }}
          </dt>
          <dd class="text-sm font-geist text-slate-900">
            <template v-if="isObjectValue(getFieldValue(field.name))">
              <pre class="text-xs bg-white border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap">{{ JSON.stringify(getFieldValue(field.name), null, 2) }}</pre>
            </template>
            <template v-else-if="formatValue(getFieldValue(field.name)) !== null">
              <span class="whitespace-pre-wrap">{{ formatValue(getFieldValue(field.name)) }}</span>
            </template>
            <template v-else>
              <span class="text-slate-400 italic">(not provided)</span>
            </template>
          </dd>
        </div>
      </dl>
    </section>

    <!-- Attachments -->
    <section aria-label="Attachments" class="space-y-3">
      <h3 class="text-sm font-jakarta font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
        <Paperclip :size="14" aria-hidden="true" />
        Attachments
        <span class="text-slate-400 font-normal">({{ attachments.length }})</span>
      </h3>
      <p
        v-if="attachments.length === 0"
        class="text-sm text-slate-500 font-geist italic"
      >
        No files attached.
      </p>
      <ul v-else class="space-y-2">
        <li
          v-for="att in attachments"
          :key="att.pk_file_attachment"
          class="flex items-center gap-3 border border-slate-200 rounded-lg p-3 bg-white"
        >
          <FileText :size="20" class="text-slate-400 flex-shrink-0" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-geist font-medium text-slate-900 truncate">
              {{ att.file_original_name }}
            </p>
            <div class="flex items-center gap-2 mt-0.5">
              <Tag
                :value="friendlyMime(att.file_mime_type)"
                severity="secondary"
                class="!text-[10px]"
              />
              <span class="text-xs font-geist text-slate-500">
                {{ formatBytes(att.file_size_bytes) }}
              </span>
            </div>
          </div>
          <a
            :href="downloadUrl(att.pk_file_attachment)"
            download
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            :aria-label="`Download ${att.file_original_name}`"
          >
            <Download :size="12" aria-hidden="true" />
            Download
          </a>
        </li>
      </ul>
    </section>

    <!-- Action slot (status change controls, retract/edit/submit buttons, etc.) -->
    <section v-if="$slots.actions" aria-label="Actions" class="pt-2 border-t border-slate-200">
      <slot name="actions" />
    </section>
  </div>
</template>
