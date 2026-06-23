<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, Calendar, User, ArrowRight } from 'lucide-vue-next'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useBlog } from '@/composables/useBlog'
import { useSeoMeta } from '@/composables/useSeoMeta'
import { sanitizeHtml } from '@/lib/sanitize'
import type { BlogPost } from '@/types/blog'

const route = useRoute()
const { getBySlug, loading, error } = useBlog()

const post = ref<BlogPost | null>(null)
const notFound = ref(false)

// Per-post SEO — title and excerpt drive document.title, meta description,
// og:* and twitter:* tags. Hero image (if any) becomes the og:image.
useSeoMeta(() => ({
  title: post.value?.post_title ?? 'Blog post',
  description: post.value?.post_excerpt ?? undefined,
  image: post.value?.post_hero_image_url ?? undefined,
}))

async function load(slug: string): Promise<void> {
  notFound.value = false
  post.value = null
  if (!slug) {
    notFound.value = true
    return
  }
  const result = await getBySlug(slug)
  if (result) {
    post.value = result
  } else {
    notFound.value = true
  }
}

watch(
  () => route.params.slug,
  (slug) => {
    if (typeof slug === 'string') load(slug)
  },
  { immediate: true },
)

function formatDate(date: string | null): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Minimal, conservative markdown-to-HTML conversion: paragraph breaks on
 * blank lines, `## Heading` / `# Heading`, bullet lists (`- item`),
 * inline `**bold**` and `_italic_`, and inline `[label](url)` links.
 * Everything else is escaped. Output is run through sanitizeHtml before
 * v-html — markdown features beyond this set degrade to escaped plain text.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function applyInline(text: string): string {
  let out = escapeHtml(text)
  // Links: [label](url) — restrict url to http(s) and relative paths
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g,
    (_m, label: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  )
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>')
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  return out
}

function markdownToHtml(body: string): string {
  if (!body) return ''
  const blocks = body.replace(/\r\n/g, '\n').split(/\n{2,}/)
  const parts: string[] = []
  for (const raw of blocks) {
    const block = raw.trim()
    if (!block) continue
    // H2
    if (block.startsWith('## ')) {
      parts.push(`<h2>${applyInline(block.slice(3).trim())}</h2>`)
      continue
    }
    // H1
    if (block.startsWith('# ')) {
      parts.push(`<h2>${applyInline(block.slice(2).trim())}</h2>`)
      continue
    }
    // Bullet list
    if (block.split('\n').every((line) => /^\s*-\s+/.test(line))) {
      const items = block
        .split('\n')
        .map((line) => `<li>${applyInline(line.replace(/^\s*-\s+/, ''))}</li>`)
        .join('')
      parts.push(`<ul>${items}</ul>`)
      continue
    }
    // Paragraph (collapse single newlines to <br>)
    const para = block
      .split('\n')
      .map((line) => applyInline(line))
      .join('<br>')
    parts.push(`<p>${para}</p>`)
  }
  return parts.join('')
}

const renderedBody = computed(() => {
  if (!post.value) return ''
  return sanitizeHtml(markdownToHtml(post.value.post_body))
})
</script>

<template>
  <div class="min-h-screen">
    <!-- Loading -->
    <div v-if="loading && !post" class="pt-10 pb-20 px-4 md:px-8">
      <div class="max-w-screen-2xl mx-auto">
        <router-link
          to="/blog"
          class="inline-flex items-center gap-1 text-sm font-geist text-slate-500 hover:text-indigo-600 transition-colors mb-8"
        >
          <ArrowLeft class="w-4 h-4" aria-hidden="true" /> Back to blog
        </router-link>
        <div class="space-y-4 max-w-3xl">
          <LoadingSkeleton type="text" :lines="2" />
          <LoadingSkeleton type="card" />
          <LoadingSkeleton type="text" :lines="6" />
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error && !post" class="pt-10 pb-20 px-4 md:px-8">
      <div class="max-w-3xl mx-auto">
        <Message severity="error" :closable="false" class="mb-6">{{ error }}</Message>
        <router-link
          to="/blog"
          class="inline-flex items-center gap-1 text-indigo-600 font-geist hover:underline"
        >
          <ArrowLeft class="w-4 h-4" aria-hidden="true" /> Back to blog
        </router-link>
      </div>
    </div>

    <!-- Post Found -->
    <div v-else-if="post" class="pt-10 pb-20 px-4 md:px-8">
      <div class="max-w-screen-2xl mx-auto">
        <router-link
          to="/blog"
          class="inline-flex items-center gap-1 text-sm font-geist text-slate-500 hover:text-indigo-600 transition-colors mb-8"
        >
          <ArrowLeft class="w-4 h-4" aria-hidden="true" /> Back to blog
        </router-link>

        <div class="grid lg:grid-cols-4 gap-12">
          <article class="lg:col-span-3">
            <header class="mb-8">
              <div class="flex flex-wrap items-center gap-3 mb-4">
                <Tag
                  v-for="t in post.post_tags ?? []"
                  :key="t"
                  :value="t"
                  severity="info"
                />
                <span
                  v-if="post.published_at"
                  class="text-sm font-geist text-slate-500 flex items-center gap-1"
                >
                  <Calendar class="w-3.5 h-3.5" aria-hidden="true" />
                  {{ formatDate(post.published_at) }}
                </span>
                <span
                  v-if="post.post_author_name"
                  class="text-sm font-geist text-slate-500 flex items-center gap-1"
                >
                  <User class="w-3.5 h-3.5" aria-hidden="true" />
                  {{ post.post_author_name }}
                </span>
              </div>
              <h1 class="text-2xl sm:text-3xl md:text-4xl font-jakarta font-bold text-slate-900 leading-tight">
                {{ post.post_title }}
              </h1>
            </header>

            <img
              v-if="post.post_hero_image_url"
              :src="post.post_hero_image_url"
              :alt="`Cover image for ${post.post_title}`"
              class="w-full h-auto max-h-96 object-cover rounded-2xl mb-8 border border-slate-100"
              width="1200"
              height="675"
              fetchpriority="high"
              decoding="async"
              referrerpolicy="no-referrer"
            />

            <div
              class="prose prose-slate max-w-none font-geist
                prose-headings:font-jakarta prose-headings:font-bold prose-headings:text-slate-900
                prose-p:text-slate-600 prose-p:leading-relaxed prose-p:text-[15px]
                prose-li:text-slate-600 prose-li:text-[15px]
                prose-strong:text-slate-800
                prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline"
              v-html="renderedBody"
            />
          </article>

          <aside class="lg:col-span-1">
            <div class="sticky top-28 space-y-6">
              <router-link
                to="/blog"
                class="block bg-indigo-50 border border-indigo-100 rounded-2xl p-6 hover:bg-indigo-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                <h2 class="font-jakarta font-semibold text-slate-900 mb-1">Browse All Posts</h2>
                <p class="text-xs font-geist text-slate-600 mb-3">
                  Explore more articles and updates from our blog.
                </p>
                <span class="text-sm font-geist font-medium text-indigo-600 flex items-center gap-1">
                  View all <ArrowRight class="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </router-link>
            </div>
          </aside>
        </div>
      </div>
    </div>

    <!-- 404 -->
    <div v-else-if="notFound" class="pt-10 pb-20 px-4 md:px-8 text-center">
      <h1 class="text-3xl font-jakarta font-bold text-slate-900 mb-4">Post not found</h1>
      <p class="text-slate-500 font-geist mb-6">
        The blog post you are looking for does not exist or has been removed.
      </p>
      <router-link
        to="/blog"
        class="inline-flex items-center gap-1 text-indigo-600 font-geist hover:underline"
      >
        <ArrowLeft class="w-4 h-4" aria-hidden="true" /> Back to blog
      </router-link>
    </div>
  </div>
</template>
