<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { ArrowLeft, Calendar, MapPin, User, ClipboardList } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useResources } from '@/composables/useResources'
import type { ResourceItem, ResourceUpdate } from '@/types/resource'

const route = useRoute()
const { fetchOne, fetchUpdates, error } = useResources()

const resource = ref<ResourceItem | null>(null)
const updates = ref<ResourceUpdate[]>([])
const loading = ref(true)

async function load(): Promise<void> {
  loading.value = true
  const id = route.params.id as string
  resource.value = await fetchOne(id)
  if (resource.value) {
    const { items } = await fetchUpdates(id, { limit: 50 })
    updates.value = items
  }
  loading.value = false
}

function updateTypeSeverity(type: string): 'info' | 'success' | 'warn' | 'danger' {
  if (type === 'revision') return 'info'
  if (type === 'supplement') return 'success'
  if (type === 'correction') return 'warn'
  return 'danger'
}

onMounted(load)
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <RouterLink
        to="/resources"
        class="inline-flex items-center gap-2 text-sm font-geist text-slate-600 hover:text-indigo-600 mb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
      >
        <ArrowLeft :size="16" aria-hidden="true" />
        Back to resources
      </RouterLink>

      <div v-if="loading">
        <LoadingSkeleton type="text" :lines="6" />
      </div>

      <Message v-else-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div
        v-else-if="!resource"
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center"
      >
        <h1 class="font-jakarta font-bold text-slate-900 mb-2">Resource not found</h1>
        <p class="text-slate-500 font-geist text-sm">
          The resource you requested does not exist or has been removed.
        </p>
      </div>

      <article v-else>
        <header class="mb-8">
          <div class="flex flex-wrap items-center gap-2 mb-4">
            <Tag :value="resource.resource_category" severity="info" />
            <Tag
              :value="resource.resource_status"
              :severity="resource.resource_status === 'published' ? 'success' : 'warn'"
            />
          </div>
          <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-4">
            {{ resource.resource_title }}
          </h1>
          <dl class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500 font-geist">
            <div v-if="resource.resource_author" class="flex items-center gap-1.5">
              <User :size="14" aria-hidden="true" />
              <dt class="sr-only">Author</dt>
              <dd>{{ resource.resource_author }}</dd>
            </div>
            <div v-if="resource.resource_region" class="flex items-center gap-1.5">
              <MapPin :size="14" aria-hidden="true" />
              <dt class="sr-only">Region</dt>
              <dd>{{ resource.resource_region }}</dd>
            </div>
            <div v-if="resource.resource_published_at" class="flex items-center gap-1.5">
              <Calendar :size="14" aria-hidden="true" />
              <dt class="sr-only">Published</dt>
              <dd>
                <time :datetime="resource.resource_published_at">
                  {{ new Date(resource.resource_published_at).toLocaleDateString() }}
                </time>
              </dd>
            </div>
          </dl>
        </header>

        <section
          v-if="resource.resource_summary"
          class="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 mb-8"
          aria-label="Summary"
        >
          <h2 class="text-sm font-jakarta font-semibold uppercase tracking-wider text-indigo-700 mb-2">
            Summary
          </h2>
          <p class="text-slate-700 font-geist leading-relaxed">
            {{ resource.resource_summary }}
          </p>
        </section>

        <section
          v-if="resource.resource_content"
          class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 mb-10"
          aria-label="Content"
        >
          <div class="prose max-w-none font-geist text-slate-700 whitespace-pre-wrap">
            {{ resource.resource_content }}
          </div>
        </section>

        <!-- Updates timeline -->
        <section aria-label="Updates timeline">
          <h2 class="text-xl font-jakarta font-bold text-slate-900 mb-4 flex items-center gap-2">
            <ClipboardList :size="20" aria-hidden="true" />
            Updates
          </h2>

          <div
            v-if="updates.length === 0"
            class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-sm text-slate-500 font-geist"
          >
            No updates have been posted for this resource yet.
          </div>

          <ol v-else class="space-y-4">
            <li
              v-for="u in updates"
              :key="u.pk_resource_update"
              class="relative bg-white border border-slate-200 rounded-2xl shadow-sm p-5 pl-8"
            >
              <span
                class="absolute left-3 top-6 w-2 h-2 rounded-full bg-indigo-500"
                aria-hidden="true"
              />
              <div class="flex flex-wrap items-center gap-2 mb-2">
                <Tag :value="u.update_type" :severity="updateTypeSeverity(u.update_type)" />
                <time
                  :datetime="u.created_at"
                  class="text-xs font-geist text-slate-500"
                >
                  {{ new Date(u.created_at).toLocaleString() }}
                </time>
              </div>
              <h3 class="font-jakarta font-semibold text-slate-900 mb-1">
                {{ u.update_title }}
              </h3>
              <p v-if="u.update_description" class="text-sm text-slate-600 font-geist">
                {{ u.update_description }}
              </p>
            </li>
          </ol>
        </section>
      </article>
    </div>
  </main>
</template>
