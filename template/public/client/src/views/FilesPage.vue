<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Paginator from 'primevue/paginator'
import Tag from 'primevue/tag'
import { Upload, FileText, Inbox, Download, Paperclip } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useFiles } from '@/composables/useFiles'
import { useToast } from '@/composables/useToast'

const {
  items,
  pagination,
  uploadedThisSession,
  loading,
  error,
  refresh,
  upload,
  downloadUrl,
} = useFiles()
const { success, error: notifyError } = useToast()

const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const page = ref(1)
const limit = ref(20)

async function load(): Promise<void> {
  await refresh({ page: page.value, limit: limit.value })
}

async function pickAndUpload(file: File): Promise<void> {
  const result = await upload(file)
  if (result) {
    success('File uploaded', result.file_original_name)
    page.value = 1
    await load()
  } else {
    notifyError('Upload failed', error.value ?? 'Please try again.')
  }
}

function onSelect(): void {
  fileInput.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await pickAndUpload(file)
  if (input) input.value = ''
}

async function onDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) await pickAndUpload(file)
}

function onPage(event: { page: number; rows: number }): void {
  page.value = event.page + 1
  limit.value = event.rows
  load()
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
  if (mime.startsWith('text/')) return 'TEXT'
  if (mime.includes('spreadsheet') || mime === 'text/csv') return 'SHEET'
  if (mime.includes('word') || mime.includes('officedocument.wordprocessing')) return 'DOC'
  if (mime.includes('zip')) return 'ZIP'
  return mime.split('/').pop()?.toUpperCase() ?? 'FILE'
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString()
}

onMounted(load)
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header class="mb-8">
        <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-2">
          Files
        </h1>
        <p class="text-slate-600 font-geist">
          Upload files to attach to your submissions. Max 10 MB per file.
        </p>
      </header>

      <Message v-if="error" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <!-- Upload widget -->
      <section
        class="mb-8"
        aria-label="Upload file"
        @dragenter.prevent="dragOver = true"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop="onDrop"
      >
        <div
          class="bg-white border-2 border-dashed rounded-2xl p-10 text-center transition-colors"
          :class="dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300'"
        >
          <Upload
            :size="40"
            class="mx-auto mb-3"
            :class="dragOver ? 'text-indigo-600' : 'text-slate-400'"
            aria-hidden="true"
          />
          <p class="text-slate-700 font-geist mb-4">
            Drag and drop a file here, or
          </p>
          <input
            ref="fileInput"
            type="file"
            class="sr-only"
            aria-label="Choose a file to upload"
            @change="onFileChange"
          />
          <button
            type="button"
            class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium font-geist hover:bg-indigo-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="loading"
            @click="onSelect"
          >
            <ProgressSpinner
              v-if="loading"
              style="width:18px;height:18px"
              stroke-width="6"
              aria-label="Uploading"
            />
            <Upload v-else :size="16" aria-hidden="true" />
            {{ loading ? 'Uploading…' : 'Choose file' }}
          </button>
        </div>
      </section>

      <!-- List -->
      <section aria-label="Your files">
        <h2 class="font-jakarta font-bold text-slate-900 mb-4">Your files</h2>

        <div v-if="loading && items.length === 0" class="space-y-3">
          <LoadingSkeleton v-for="i in 4" :key="i" type="text" :lines="2" />
        </div>

        <div
          v-else-if="items.length === 0"
          class="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center"
        >
          <Inbox :size="40" class="mx-auto text-slate-400 mb-3" aria-hidden="true" />
          <h3 class="font-jakarta font-bold text-slate-900 mb-1">No files yet</h3>
          <p class="text-slate-500 font-geist text-sm">
            Use the panel above to upload your first file.
          </p>
        </div>

        <ul v-else class="space-y-3">
          <li
            v-for="f in items"
            :key="f.pk_file_attachment"
            class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <FileText :size="18" class="text-indigo-600" aria-hidden="true" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-jakarta font-semibold text-slate-900 text-sm break-words">
                {{ f.file_original_name }}
              </p>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-geist">
                <Tag :value="friendlyMime(f.file_mime_type)" severity="info" />
                <span>{{ formatBytes(f.file_size_bytes) }}</span>
                <span v-if="f.created_at" aria-hidden="true">·</span>
                <time v-if="f.created_at" :datetime="f.created_at">
                  {{ formatDate(f.created_at) }}
                </time>
                <span
                  v-if="uploadedThisSession.has(f.pk_file_attachment)"
                  class="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-semibold uppercase tracking-wide"
                >
                  Just uploaded
                </span>
                <span
                  v-if="f.fk_file_attachment_form_submission"
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold uppercase tracking-wide"
                >
                  <Paperclip :size="10" aria-hidden="true" />
                  Attached to submission
                </span>
              </div>
            </div>
            <a
              :href="downloadUrl(f.pk_file_attachment)"
              download
              class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 self-start sm:self-auto"
              :aria-label="`Download ${f.file_original_name}`"
            >
              <Download :size="16" aria-hidden="true" />
              Download
            </a>
          </li>
        </ul>

        <div v-if="pagination && pagination.total > limit" class="mt-8">
          <Paginator
            :rows="limit"
            :total-records="pagination.total"
            :first="(page - 1) * limit"
            :rows-per-page-options="[10, 20, 50]"
            template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
            @page="onPage"
          />
        </div>
      </section>
    </div>
  </main>
</template>
