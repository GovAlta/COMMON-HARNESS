<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import SelectButton from 'primevue/selectbutton'
import Message from 'primevue/message'
import Paginator from 'primevue/paginator'
import Tag from 'primevue/tag'
import { Bell, BellOff, CheckCheck } from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useUserNotifications } from '@/composables/useUserNotifications'

const {
  items,
  pagination,
  unreadCount,
  loading,
  error,
  refresh,
  fetchUnreadCount,
  markRead,
  markAllRead,
} = useUserNotifications()

type Filter = 'all' | 'unread' | 'read'
const filter = ref<Filter>('all')
const page = ref(1)
const limit = ref(20)

const filterOptions: { label: string; value: Filter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Unread', value: 'unread' },
  { label: 'Read', value: 'read' },
]

async function load(): Promise<void> {
  await refresh({ page: page.value, limit: limit.value, filter: filter.value })
}

function onPage(event: { page: number; rows: number }): void {
  page.value = event.page + 1
  limit.value = event.rows
  load()
}

watch(filter, () => {
  page.value = 1
  load()
})

function typeSeverity(t: string): 'info' | 'warn' | 'danger' | 'success' {
  if (t === 'emergency_broadcast') return 'danger'
  if (t === 'service_update') return 'warn'
  if (t === 'announcement') return 'info'
  return 'success'
}

async function onMarkAllRead(): Promise<void> {
  await markAllRead()
  await fetchUnreadCount()
}

async function onMarkOne(id: string): Promise<void> {
  await markRead(id)
}

onMounted(async () => {
  await Promise.all([load(), fetchUnreadCount()])
})
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-2">
            Notifications
          </h1>
          <p class="text-slate-600 font-geist">
            <span v-if="unreadCount > 0">
              <strong>{{ unreadCount }}</strong> unread
            </span>
            <span v-else>You're all caught up.</span>
          </p>
        </div>
        <button
          v-if="unreadCount > 0"
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
          aria-label="Mark all notifications as read"
          @click="onMarkAllRead"
        >
          <CheckCheck :size="16" aria-hidden="true" />
          Mark all read
        </button>
      </header>

      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6 mb-6"
        aria-label="Filter notifications"
      >
        <SelectButton
          v-model="filter"
          :options="filterOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          aria-label="Filter notifications"
        />
      </section>

      <Message v-if="error" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <div v-if="loading" class="space-y-3">
        <LoadingSkeleton v-for="i in 5" :key="i" type="text" :lines="2" />
      </div>

      <div
        v-else-if="items.length === 0"
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center"
      >
        <BellOff :size="40" class="mx-auto text-slate-400 mb-3" aria-hidden="true" />
        <h2 class="font-jakarta font-bold text-slate-900 mb-1">No notifications</h2>
        <p class="text-slate-500 font-geist text-sm">
          Notifications you receive will appear here.
        </p>
      </div>

      <ul v-else class="space-y-3">
        <li
          v-for="n in items"
          :key="n.pk_notification_delivery"
          class="bg-white border rounded-2xl shadow-sm p-5 transition-all"
          :class="n.is_read ? 'border-slate-200' : 'border-indigo-200 bg-indigo-50/30'"
        >
          <div class="flex items-start gap-3">
            <div
              class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              :class="n.is_read ? 'bg-slate-100 text-slate-500' : 'bg-indigo-100 text-indigo-600'"
              aria-hidden="true"
            >
              <Bell :size="18" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <Tag :value="n.message_type" :severity="typeSeverity(n.message_type)" />
                <time
                  :datetime="n.delivered_at"
                  class="text-xs font-geist text-slate-500"
                >
                  {{ new Date(n.delivered_at).toLocaleString() }}
                </time>
                <span
                  v-if="!n.is_read"
                  class="text-[10px] font-geist font-semibold uppercase tracking-wider text-indigo-600"
                >
                  New
                </span>
              </div>
              <h2 class="font-jakarta font-semibold text-slate-900 mb-1">
                {{ n.message_title }}
              </h2>
              <p class="text-sm text-slate-600 font-geist whitespace-pre-wrap">
                {{ n.message_body }}
              </p>
            </div>
            <button
              v-if="!n.is_read"
              type="button"
              class="text-xs font-geist text-indigo-600 hover:text-indigo-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
              @click="onMarkOne(n.pk_notification_delivery)"
              aria-label="Mark as read"
            >
              Mark read
            </button>
          </div>
        </li>
      </ul>

      <div v-if="pagination && pagination.total > limit" class="mt-8">
        <Paginator
          :rows="limit"
          :total-records="pagination.total"
          :first="(page - 1) * limit"
          :rows-per-page-options="[10, 20, 50]"
          @page="onPage"
        />
      </div>
    </div>
  </main>
</template>
