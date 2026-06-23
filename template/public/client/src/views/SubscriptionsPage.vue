<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { FormKit } from '@formkit/vue'
import Paginator from 'primevue/paginator'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { Bell, Trash2, Plus, X } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useSubscriptions } from '@/composables/useSubscriptions'
import { useToast } from '@/composables/useToast'
import type { SubscriptionType } from '@/types/subscription'

const { items, pagination, loading, error, refresh, subscribe, unsubscribe } = useSubscriptions()
const { success, error: notifyError } = useToast()

const showForm = ref(false)
const submitting = ref(false)
const page = ref(1)
const limit = ref(20)

async function load(): Promise<void> {
  await refresh({ page: page.value, limit: limit.value })
}

function onPage(event: { page: number; rows: number }): void {
  page.value = event.page + 1
  limit.value = event.rows
  load()
}

interface FormValues {
  type: SubscriptionType
  targetId?: string
  regionName?: string
}

async function onSubscribe(data: FormValues): Promise<void> {
  submitting.value = true
  const result = await subscribe({
    type: data.type,
    targetId: data.targetId || null,
    regionName: data.regionName || null,
    filterCriteria: {},
  })
  submitting.value = false
  if (result) {
    success('Subscription added')
    showForm.value = false
  } else {
    notifyError('Could not subscribe', error.value ?? 'Please check the form.')
  }
}

async function onUnsubscribe(id: string): Promise<void> {
  const ok = await unsubscribe(id)
  if (ok) success('Unsubscribed')
  else notifyError('Could not unsubscribe', error.value ?? '')
}

function typeSeverity(t: SubscriptionType): 'info' | 'success' | 'warn' {
  if (t === 'resource') return 'info'
  if (t === 'region') return 'success'
  return 'warn'
}

onMounted(load)
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-2">
            Subscriptions
          </h1>
          <p class="text-slate-600 font-geist">
            Choose what you want to be notified about.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
          :aria-expanded="showForm"
          :aria-label="showForm ? 'Hide subscription form' : 'Add a new subscription'"
          @click="showForm = !showForm"
        >
          <component
            :is="showForm ? X : Plus"
            :size="16"
            aria-hidden="true"
          />
          {{ showForm ? 'Cancel' : 'New subscription' }}
        </button>
      </header>

      <Message v-if="error" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <section
        v-if="showForm"
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 mb-6"
        aria-label="Create subscription"
      >
        <h2 class="font-jakarta font-bold text-slate-900 mb-4">New subscription</h2>
        <FormKit type="form" :actions="false" @submit="onSubscribe">
          <FormKit
            type="select"
            name="type"
            label="Type"
            help="Resource subscriptions need a resource ID; region subscriptions need a region name."
            validation="required"
            :options="[
              { label: 'Resource', value: 'resource' },
              { label: 'Region', value: 'region' },
              { label: 'Broadcast (all updates)', value: 'broadcast' },
            ]"
          />
          <FormKit
            type="text"
            name="targetId"
            label="Resource ID (for resource type)"
            placeholder="UUID of the resource"
            help="Required when type is 'resource'."
          />
          <FormKit
            type="text"
            name="regionName"
            label="Region name (for region type)"
            placeholder="e.g. Northeast"
            help="Required when type is 'region'."
          />
          <FormKit
            type="submit"
            :label="submitting ? 'Subscribing...' : 'Subscribe'"
            :disabled="submitting"
          />
        </FormKit>
      </section>

      <div v-if="loading" class="space-y-3">
        <LoadingSkeleton v-for="i in 4" :key="i" type="text" :lines="2" />
      </div>

      <div
        v-else-if="items.length === 0"
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center"
      >
        <Bell :size="40" class="mx-auto text-slate-400 mb-3" aria-hidden="true" />
        <h2 class="font-jakarta font-bold text-slate-900 mb-1">No subscriptions yet</h2>
        <p class="text-slate-500 font-geist text-sm">
          Add your first subscription using the button above.
        </p>
      </div>

      <ul v-else class="space-y-3">
        <li
          v-for="s in items"
          :key="s.pk_notification_subscription"
          class="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex items-start justify-between gap-3"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <Tag :value="s.subscription_type" :severity="typeSeverity(s.subscription_type)" />
              <span class="text-xs font-geist text-slate-500">
                Added {{ new Date(s.created_at).toLocaleDateString() }}
              </span>
            </div>
            <p class="font-jakarta font-semibold text-slate-900 text-sm">
              <template v-if="s.subscription_type === 'resource'">
                {{ s.target_name || 'Resource: ' + (s.subscription_target_id || '—') }}
              </template>
              <template v-else-if="s.subscription_type === 'region'">
                Region: {{ s.subscription_region_name }}
              </template>
              <template v-else>
                All broadcast notifications
              </template>
            </p>
          </div>
          <button
            type="button"
            class="inline-flex items-center justify-center w-11 h-11 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            :aria-label="`Unsubscribe from ${s.subscription_type}`"
            @click="onUnsubscribe(s.pk_notification_subscription)"
          >
            <Trash2 :size="18" aria-hidden="true" />
          </button>
        </li>
      </ul>

      <!-- Paginator -->
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
    </div>
  </main>
</template>
