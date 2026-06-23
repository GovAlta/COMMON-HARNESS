<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
import { useAdminBlog } from '@/composables/useAdminBlog'
import { useToast } from '@/composables/useToast'
import type {
  BlogPost,
  CreateBlogPostPayload,
  UpdateBlogPostPayload,
} from '@/types/blog'

const { items, pagination, loading, error, list, create, update, softDelete, clone } =
  useAdminBlog()
const { success, error: notifyError } = useToast()
const confirm = useConfirm()

const dialogOpen = ref(false)
const editing = ref<BlogPost | null>(null)
const submitting = ref(false)
const formError = ref<string | null>(null)
const page = ref(1)
const limit = ref(20)

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

interface FormValues {
  slug: string
  title: string
  excerpt?: string
  body: string
  heroImageUrl?: string
  authorName?: string
  tagsCsv?: string
  isPublished?: boolean
  publishedAt?: string
}

const initialValues = computed<Partial<FormValues>>(() => {
  if (!editing.value) {
    return { isPublished: false, tagsCsv: '' }
  }
  const p = editing.value
  return {
    slug: p.post_slug,
    title: p.post_title,
    excerpt: p.post_excerpt ?? '',
    body: p.post_body,
    heroImageUrl: p.post_hero_image_url ?? '',
    authorName: p.post_author_name ?? '',
    tagsCsv: (p.post_tags ?? []).join(', '),
    isPublished: p.is_published,
    publishedAt: p.published_at ? p.published_at.slice(0, 16) : undefined,
  }
})

async function load(): Promise<void> {
  await list({ page: page.value, limit: limit.value })
}

function openCreate(): void {
  editing.value = null
  formError.value = null
  dialogOpen.value = true
}

function openEdit(row: BlogPost): void {
  editing.value = row
  formError.value = null
  dialogOpen.value = true
}

function parseTags(csv: string | undefined): string[] {
  if (!csv) return []
  return csv
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

async function onSubmit(data: FormValues): Promise<void> {
  formError.value = null
  // Slug validation (also enforced server-side; preempt for a friendly message)
  if (!SLUG_REGEX.test(data.slug)) {
    formError.value =
      'Slug must be lowercase letters, numbers, and single hyphens (e.g. "my-post").'
    return
  }
  if (!data.title?.trim()) {
    formError.value = 'Title is required.'
    return
  }
  if (!data.body?.trim()) {
    formError.value = 'Body is required.'
    return
  }

  submitting.value = true
  const basePayload: CreateBlogPostPayload = {
    slug: data.slug.trim(),
    title: data.title.trim(),
    excerpt: data.excerpt?.trim() || null,
    body: data.body,
    heroImageUrl: data.heroImageUrl?.trim() || null,
    authorName: data.authorName?.trim() || null,
    tags: parseTags(data.tagsCsv),
    isPublished: !!data.isPublished,
    publishedAt: data.publishedAt
      ? new Date(data.publishedAt).toISOString()
      : null,
  }

  let result: BlogPost | null
  if (editing.value) {
    const updatePayload: UpdateBlogPostPayload = basePayload
    result = await update(editing.value.pk_blog_post, updatePayload)
  } else {
    result = await create(basePayload)
  }
  submitting.value = false

  if (result) {
    success(editing.value ? 'Post updated' : 'Post created')
    dialogOpen.value = false
    await load()
  } else {
    formError.value = error.value ?? 'Save failed.'
    notifyError('Save failed', error.value ?? 'Please try again.')
  }
}

/**
 * Clone a post. The server appends " (DRAFT)" to the title, regenerates the
 * slug as `${original}-draft` (with random hex suffix on UNIQUE collision),
 * sets is_published to false, and writes an audit row referencing the
 * original via metadata.clone_of.
 */
async function onClone(row: BlogPost): Promise<void> {
  const result = await clone(row.pk_blog_post)
  if (result) {
    success('Post cloned', `Created "${result.post_title}"`)
    await load()
  } else {
    notifyError('Clone failed', error.value ?? 'Please try again.')
  }
}

function confirmDelete(row: BlogPost): void {
  confirm.require({
    message: `Delete "${row.post_title}"? This action cannot be undone from the UI.`,
    header: 'Confirm delete',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      const ok = await softDelete(row.pk_blog_post)
      if (ok) {
        success('Post deleted')
        await load()
      } else {
        notifyError('Delete failed', error.value ?? 'Please try again.')
      }
    },
  })
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
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-2">
            Manage Blog
          </h1>
          <p class="text-slate-600 font-geist">
            Create, edit, and publish blog posts.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
          aria-label="Create a new blog post"
          @click="openCreate"
        >
          <Plus :size="16" aria-hidden="true" />
          New post
        </button>
      </header>

      <Message v-if="error" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
        aria-label="Blog posts"
      >
        <LoadingSkeleton v-if="loading && items.length === 0" type="table" :lines="6" />
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
          data-key="pk_blog_post"
          aria-label="Blog posts table"
          @page="onPage"
        >
          <Column field="post_title" header="Title" sortable>
            <template #body="{ data }">
              <div class="font-jakarta font-semibold text-slate-900">
                {{ data.post_title }}
              </div>
            </template>
          </Column>
          <Column field="post_slug" header="Slug" sortable>
            <template #body="{ data }">
              <code class="text-xs text-slate-600 font-mono">{{ data.post_slug }}</code>
            </template>
          </Column>
          <Column field="is_published" header="Status" sortable>
            <template #body="{ data }">
              <Tag
                :value="data.is_published ? 'Published' : 'Draft'"
                :severity="data.is_published ? 'success' : 'warn'"
              />
            </template>
          </Column>
          <Column field="published_at" header="Published" sortable>
            <template #body="{ data }">
              <span v-if="data.published_at" class="text-sm text-slate-600 font-geist">
                {{ new Date(data.published_at).toLocaleDateString() }}
              </span>
              <span v-else class="text-xs text-slate-400 font-geist">—</span>
            </template>
          </Column>
          <Column field="post_tags" header="Tags">
            <template #body="{ data }">
              <div class="flex flex-wrap gap-1">
                <Tag
                  v-for="t in (data.post_tags ?? []).slice(0, 3)"
                  :key="t"
                  :value="t"
                  severity="info"
                  size="small"
                />
                <span
                  v-if="(data.post_tags ?? []).length > 3"
                  class="text-xs text-slate-400 font-geist"
                >
                  +{{ data.post_tags.length - 3 }}
                </span>
              </div>
            </template>
          </Column>
          <Column header="Actions">
            <template #body="{ data }">
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  :aria-label="`Edit post ${data.post_title}`"
                  @click="openEdit(data)"
                >
                  <Pencil :size="12" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  :aria-label="`Clone post ${data.post_title}`"
                  @click="onClone(data)"
                >
                  <Copy :size="12" aria-hidden="true" />
                  Clone
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-600 text-xs font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  :aria-label="`Delete post ${data.post_title}`"
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
      :header="editing ? 'Edit post' : 'New post'"
      :style="{ width: '52rem', maxWidth: '95vw' }"
      :aria-label="editing ? 'Edit blog post form' : 'New blog post form'"
    >
      <Message v-if="formError" severity="error" :closable="false" class="mb-4">
        {{ formError }}
      </Message>
      <FormKit
        type="form"
        :actions="false"
        :value="initialValues"
        @submit="onSubmit"
      >
        <FormKit
          type="text"
          name="slug"
          label="Slug"
          help="Lowercase letters, numbers, and single hyphens — e.g. my-first-post"
          validation="required|matches:/^[a-z0-9]+(?:-[a-z0-9]+)*$/"
          :validation-messages="{
            matches: 'Slug must be lowercase letters, numbers, and single hyphens.',
          }"
        />
        <FormKit
          type="text"
          name="title"
          label="Title"
          validation="required|length:1,300"
        />
        <FormKit
          type="textarea"
          name="excerpt"
          label="Excerpt"
          help="Short summary shown on the blog index."
        />
        <FormKit
          type="textarea"
          name="body"
          label="Body (Markdown)"
          help="Supports paragraphs, ## headings, - bullets, **bold**, _italic_, [link](url)."
          validation="required"
          input-class="font-mono text-xs min-h-[300px]"
        />
        <FormKit
          type="url"
          name="heroImageUrl"
          label="Hero image URL"
          placeholder="https://…"
          validation="url"
        />
        <FormKit
          type="text"
          name="authorName"
          label="Author name"
          placeholder="Jane Doe"
        />
        <FormKit
          type="text"
          name="tagsCsv"
          label="Tags"
          help="Comma-separated list (e.g. release, engineering, security)"
          placeholder="release, engineering"
        />
        <FormKit
          type="checkbox"
          name="isPublished"
          label="Published"
        />
        <FormKit
          type="datetime-local"
          name="publishedAt"
          label="Published at"
          help="Leave blank to omit a publish date."
        />
        <div class="mt-6 flex items-center gap-3">
          <FormKit
            type="submit"
            :label="submitting ? 'Saving…' : (editing ? 'Save changes' : 'Create post')"
            :disabled="submitting"
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
