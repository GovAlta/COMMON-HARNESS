<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Calendar, ArrowRight, Newspaper, User, X } from 'lucide-vue-next'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import Paginator from 'primevue/paginator'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useBlog } from '@/composables/useBlog'
import { useSeoMeta } from '@/composables/useSeoMeta'

useSeoMeta({
  title: 'Blog',
  description: 'Articles, release notes, and how-tos from the App Template team.',
})

const { items, pagination, loading, error, list } = useBlog()

const page = ref(1)
const limit = ref(12)
const tagFilter = ref<string | null>(null)

async function load(): Promise<void> {
  await list({
    page: page.value,
    limit: limit.value,
    tag: tagFilter.value || undefined,
  })
}

function onPage(event: { page: number; rows: number }): void {
  page.value = event.page + 1
  limit.value = event.rows
  load()
}

function filterByTag(tag: string): void {
  tagFilter.value = tag
  page.value = 1
  load()
}

function clearFilter(): void {
  tagFilter.value = null
  page.value = 1
  load()
}

const featuredPost = computed(() => items.value[0] ?? null)
const remainingPosts = computed(() => items.value.slice(1))

const visibleTags = computed(() => {
  const set = new Set<string>()
  for (const post of items.value) {
    for (const t of post.post_tags ?? []) set.add(t)
  }
  return Array.from(set).slice(0, 12)
})

function formatDate(date: string | null, style: 'long' | 'short' = 'long'): string {
  if (!date) return ''
  const options: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { month: 'long', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' }
  return new Date(date).toLocaleDateString('en-US', options)
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen">
    <header class="pt-10 pb-8 px-4 md:px-8">
      <div class="max-w-screen-2xl mx-auto">
        <div class="flex items-center gap-3 mb-4">
          <Newspaper class="w-8 h-8 text-indigo-600" aria-hidden="true" />
          <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900">Blog</h1>
        </div>
        <p class="text-lg text-slate-600 font-geist max-w-3xl">
          Updates, insights, and news from our team.
        </p>
      </div>
    </header>

    <section class="px-4 md:px-8 pb-20">
      <div class="max-w-screen-2xl mx-auto">
        <Message v-if="error" severity="error" :closable="false" class="mb-6">
          {{ error }}
        </Message>

        <!-- Tag filters -->
        <div
          v-if="visibleTags.length > 0 || tagFilter"
          class="mb-8 flex flex-wrap items-center gap-2"
          aria-label="Filter posts by tag"
        >
          <span class="text-xs font-geist font-semibold uppercase tracking-wider text-slate-400 mr-1">
            Tags:
          </span>
          <button
            v-for="t in visibleTags"
            :key="t"
            type="button"
            class="inline-flex items-center px-3 py-1 rounded-full text-xs font-geist transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            :class="
              tagFilter === t
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            "
            :aria-pressed="tagFilter === t"
            @click="filterByTag(t)"
          >
            {{ t }}
          </button>
          <button
            v-if="tagFilter"
            type="button"
            class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100 text-xs font-geist transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Clear tag filter"
            @click="clearFilter"
          >
            <X :size="12" aria-hidden="true" />
            Clear
          </button>
        </div>

        <!-- Loading -->
        <div v-if="loading && items.length === 0" class="space-y-6">
          <LoadingSkeleton type="card" />
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <LoadingSkeleton v-for="i in 6" :key="i" type="card" />
          </div>
        </div>

        <!-- Empty -->
        <div
          v-else-if="items.length === 0"
          class="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center"
        >
          <Newspaper :size="40" class="mx-auto text-slate-400 mb-3" aria-hidden="true" />
          <h2 class="font-jakarta font-bold text-slate-900 mb-1">No posts yet</h2>
          <p class="text-slate-500 font-geist text-sm">
            <template v-if="tagFilter">
              No posts tagged "{{ tagFilter }}". Try another tag.
            </template>
            <template v-else>
              Check back soon for fresh updates.
            </template>
          </p>
        </div>

        <template v-else>
          <!-- Featured Post -->
          <router-link
            v-if="featuredPost"
            :to="`/blog/${featuredPost.post_slug}`"
            class="block mb-10 group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded-3xl"
            :aria-label="`Read post: ${featuredPost.post_title}`"
          >
            <div class="bg-slate-50 rounded-3xl overflow-hidden border border-slate-100 hover:shadow-lg transition-all hover:border-indigo-200">
              <div class="h-48 sm:h-64 bg-gradient-to-br from-indigo-100 to-slate-100 flex items-center justify-center overflow-hidden">
                <img
                  v-if="featuredPost.post_hero_image_url"
                  :src="featuredPost.post_hero_image_url"
                  :alt="`Cover image for ${featuredPost.post_title}`"
                  class="w-full h-full object-cover"
                  width="1200"
                  height="600"
                  fetchpriority="high"
                  decoding="async"
                  referrerpolicy="no-referrer"
                />
                <Newspaper v-else class="w-16 h-16 text-indigo-300" aria-hidden="true" />
              </div>
              <div class="p-5 sm:p-8 md:p-10">
                <div class="flex flex-wrap items-center gap-3 mb-4">
                  <Tag
                    v-for="t in (featuredPost.post_tags ?? []).slice(0, 3)"
                    :key="t"
                    :value="t"
                    severity="info"
                  />
                  <span
                    v-if="featuredPost.published_at"
                    class="text-sm font-geist text-slate-500 flex items-center gap-1"
                  >
                    <Calendar class="w-3.5 h-3.5" aria-hidden="true" />
                    {{ formatDate(featuredPost.published_at) }}
                  </span>
                  <span
                    v-if="featuredPost.post_author_name"
                    class="text-sm font-geist text-slate-500 flex items-center gap-1"
                  >
                    <User class="w-3.5 h-3.5" aria-hidden="true" />
                    {{ featuredPost.post_author_name }}
                  </span>
                </div>
                <h2 class="text-2xl md:text-3xl font-jakarta font-bold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors">
                  {{ featuredPost.post_title }}
                </h2>
                <p
                  v-if="featuredPost.post_excerpt"
                  class="text-slate-600 font-geist leading-relaxed max-w-3xl mb-4"
                >
                  {{ featuredPost.post_excerpt }}
                </p>
                <span class="inline-flex items-center gap-1 text-sm font-geist font-medium text-indigo-600">
                  Read more <ArrowRight class="w-4 h-4" aria-hidden="true" />
                </span>
              </div>
            </div>
          </router-link>

          <!-- Post Grid -->
          <div v-if="remainingPosts.length > 0" class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <router-link
              v-for="post in remainingPosts"
              :key="post.pk_blog_post"
              :to="`/blog/${post.post_slug}`"
              class="group border border-slate-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all hover:border-indigo-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              :aria-label="`Read post: ${post.post_title}`"
            >
              <div class="h-36 bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center overflow-hidden">
                <img
                  v-if="post.post_hero_image_url"
                  :src="post.post_hero_image_url"
                  :alt="`Cover image for ${post.post_title}`"
                  class="w-full h-full object-cover"
                  width="800"
                  height="450"
                  loading="lazy"
                  decoding="async"
                  referrerpolicy="no-referrer"
                />
                <Newspaper v-else class="w-10 h-10 text-slate-300" aria-hidden="true" />
              </div>
              <div class="p-6">
                <div class="flex flex-wrap items-center gap-2 mb-3">
                  <Tag
                    v-for="t in (post.post_tags ?? []).slice(0, 2)"
                    :key="t"
                    :value="t"
                    severity="info"
                    size="small"
                  />
                  <span v-if="post.published_at" class="text-xs font-geist text-slate-500">
                    {{ formatDate(post.published_at, 'short') }}
                  </span>
                </div>
                <h3 class="font-jakarta font-bold text-lg text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">
                  {{ post.post_title }}
                </h3>
                <p
                  v-if="post.post_excerpt"
                  class="text-sm font-geist text-slate-500 leading-relaxed line-clamp-3"
                >
                  {{ post.post_excerpt }}
                </p>
                <span class="inline-flex items-center gap-1 text-sm font-geist font-medium text-indigo-600 mt-4">
                  Read more <ArrowRight class="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </div>
            </router-link>
          </div>

          <div v-if="pagination && pagination.total > limit" class="mt-10">
            <Paginator
              :rows="limit"
              :total-records="pagination.total"
              :first="(page - 1) * limit"
              :rows-per-page-options="[12, 24, 48]"
              template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
              @page="onPage"
            />
          </div>
        </template>
      </div>
    </section>
  </div>
</template>
