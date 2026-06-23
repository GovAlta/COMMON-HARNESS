<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import {
  BarChart3,
  FileText,
  MapPin,
  ClipboardList,
  AlertCircle,
  TrendingUp,
} from 'lucide-vue-next'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { useAdmin } from '@/composables/useAdmin'
import type { DashboardTimeSeriesPoint } from '@/types/admin'

const { dashboardStats, loading, error, fetchDashboardStats } = useAdmin()

const days = ref(30)
const rangeOptions = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
  { label: 'Last 12 months', value: 365 },
]

interface DashboardCard {
  label: string
  value: number
  icon: typeof FileText
  accent: string
}

const cards = computed<DashboardCard[]>(() => {
  const stats = dashboardStats.value
  if (!stats) return []
  return [
    {
      label: 'Total resources',
      value: stats.totalResourceCount,
      icon: FileText,
      accent: 'text-teal-600',
    },
    {
      label: 'Published resources',
      value: stats.publishedResourceCount,
      icon: TrendingUp,
      accent: 'text-emerald-600',
    },
    {
      label: 'Service locations',
      value: stats.serviceLocationCount,
      icon: MapPin,
      accent: 'text-amber-600',
    },
    {
      label: 'Open assistance requests',
      value: stats.openAssistanceRequests,
      icon: AlertCircle,
      accent: 'text-rose-600',
    },
    {
      label: 'Pending submissions',
      value: stats.pendingSubmissions,
      icon: ClipboardList,
      accent: 'text-purple-600',
    },
  ]
})

const recentSubmissions = computed(() => dashboardStats.value?.recentSubmissions ?? [])

const submissionsOverTime = computed<DashboardTimeSeriesPoint[]>(
  () => dashboardStats.value?.submissionsOverTime ?? [],
)
const resourcesOverTime = computed<DashboardTimeSeriesPoint[]>(
  () => dashboardStats.value?.resourcesOverTime ?? [],
)

const submissionsMax = computed(() =>
  Math.max(1, ...submissionsOverTime.value.map((p) => p.value)),
)
const resourcesMax = computed(() =>
  Math.max(1, ...resourcesOverTime.value.map((p) => p.value)),
)

function statusSeverity(s: string): 'success' | 'warn' | 'info' | 'danger' | 'secondary' {
  if (s === 'approved' || s === 'completed') return 'success'
  if (s === 'rejected') return 'danger'
  if (s === 'submitted') return 'info'
  if (s === 'in-review') return 'warn'
  return 'secondary'
}

async function load(): Promise<void> {
  await fetchDashboardStats(days.value)
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
            Admin Dashboard
          </h1>
          <p class="text-slate-600 font-geist">
            Overview of platform activity and key metrics.
          </p>
        </div>
        <div class="flex items-center gap-3">
          <label
            for="dashboard-range"
            class="text-sm font-geist text-slate-600"
          >
            Range
          </label>
          <Select
            v-model="days"
            input-id="dashboard-range"
            :options="rangeOptions"
            option-label="label"
            option-value="value"
            class="w-44"
            aria-label="Select time range for dashboard statistics"
            @change="load"
          />
        </div>
      </header>

      <Message v-if="error" severity="error" :closable="false" class="mb-6">
        {{ error }}
      </Message>

      <div
        v-if="loading && !dashboardStats"
        class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        <LoadingSkeleton v-for="i in 5" :key="i" type="card" />
      </div>

      <div v-else-if="dashboardStats">
        <section
          class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          aria-label="Platform totals"
        >
          <div
            v-for="c in cards"
            :key="c.label"
            class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6"
          >
            <div class="flex items-center gap-3 mb-3">
              <div
                class="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center"
              >
                <component
                  :is="c.icon"
                  :size="20"
                  :class="c.accent"
                  aria-hidden="true"
                />
              </div>
              <span class="text-sm font-geist text-slate-500">
                {{ c.label }}
              </span>
            </div>
            <div class="text-3xl font-jakarta font-bold text-slate-900">
              {{ c.value }}
            </div>
          </div>
        </section>

        <section
          class="mt-10 grid gap-6 lg:grid-cols-2"
          aria-label="Activity over time"
        >
          <div
            class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8"
          >
            <h2 class="font-jakarta font-bold text-slate-900 mb-1">
              Submissions over time
            </h2>
            <p class="text-sm font-geist text-slate-500 mb-5">
              {{ submissionsOverTime.length }} day{{
                submissionsOverTime.length === 1 ? '' : 's'
              }}
              · peak {{ submissionsMax }}
            </p>
            <div
              v-if="submissionsOverTime.length > 0"
              class="flex items-end gap-1 h-32"
              role="img"
              :aria-label="`Submissions over the last ${submissionsOverTime.length} days, peak ${submissionsMax}`"
            >
              <div
                v-for="(pt, idx) in submissionsOverTime"
                :key="`s-${idx}`"
                class="flex-1 rounded-t bg-indigo-500 hover:bg-indigo-600 transition-colors"
                :style="{
                  height: `${Math.max(2, (pt.value / submissionsMax) * 100)}%`,
                }"
                :title="`${pt.date}: ${pt.value}`"
              />
            </div>
            <p
              v-else
              class="text-sm font-geist text-slate-400 italic text-center py-8"
            >
              No submission activity in this range.
            </p>
          </div>

          <div
            class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8"
          >
            <h2 class="font-jakarta font-bold text-slate-900 mb-1">
              Resources created over time
            </h2>
            <p class="text-sm font-geist text-slate-500 mb-5">
              {{ resourcesOverTime.length }} day{{
                resourcesOverTime.length === 1 ? '' : 's'
              }}
              · peak {{ resourcesMax }}
            </p>
            <div
              v-if="resourcesOverTime.length > 0"
              class="flex items-end gap-1 h-32"
              role="img"
              :aria-label="`Resources created over the last ${resourcesOverTime.length} days, peak ${resourcesMax}`"
            >
              <div
                v-for="(pt, idx) in resourcesOverTime"
                :key="`r-${idx}`"
                class="flex-1 rounded-t bg-teal-500 hover:bg-teal-600 transition-colors"
                :style="{
                  height: `${Math.max(2, (pt.value / resourcesMax) * 100)}%`,
                }"
                :title="`${pt.date}: ${pt.value}`"
              />
            </div>
            <p
              v-else
              class="text-sm font-geist text-slate-400 italic text-center py-8"
            >
              No resources created in this range.
            </p>
          </div>
        </section>

        <section
          class="mt-10 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8"
          aria-label="Recent submissions"
        >
          <div class="flex items-center gap-3 mb-4">
            <BarChart3
              :size="20"
              class="text-indigo-600"
              aria-hidden="true"
            />
            <h2 class="font-jakarta font-bold text-slate-900">
              Recent submissions
            </h2>
          </div>
          <div
            v-if="recentSubmissions.length === 0"
            class="text-sm font-geist text-slate-400 italic"
          >
            No recent submissions.
          </div>
          <ul v-else class="divide-y divide-slate-100">
            <li
              v-for="s in recentSubmissions"
              :key="s.pk_form_submission"
              class="py-3 flex items-start justify-between gap-3"
            >
              <div class="min-w-0">
                <p class="font-jakarta font-semibold text-slate-900 text-sm">
                  {{ s.form_name }}
                </p>
                <p class="text-xs font-geist text-slate-500 mt-0.5">
                  Ref {{ s.submission_reference_number }} ·
                  {{ new Date(s.created_at).toLocaleString() }}
                </p>
              </div>
              <Tag
                :value="s.submission_status"
                :severity="statusSeverity(s.submission_status)"
              />
            </li>
          </ul>
        </section>
      </div>
    </div>
  </main>
</template>
