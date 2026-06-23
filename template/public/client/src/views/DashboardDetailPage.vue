<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { dashboards } from '@/data/dashboards'
import { Line, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { ArrowLeft, Download, Calendar, BarChart3, TrendingUp, FileText } from 'lucide-vue-next'
import { useTheme } from '@/composables/useTheme'
import Button from 'primevue/button'
import Tag from 'primevue/tag'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const route = useRoute()
const { chartColors } = useTheme()
const chartRef = ref<HTMLElement | null>(null)

const dashboard = computed(() => {
  return dashboards.find((d) => d.slug === route.params.slug)
})

// Related dashboards: same category, excluding current
const relatedDashboards = computed(() => {
  if (!dashboard.value) return []
  return dashboards
    .filter((d) => d.category === dashboard.value!.category && d.slug !== dashboard.value!.slug)
    .slice(0, 3)
})

// Build Chart.js data from dashboard config
const chartData = computed(() => {
  if (!dashboard.value) return null
  const cfg = dashboard.value.mockChartConfig
  const cc = chartColors.value

  const isStacked =
    dashboard.value.chartType === 'bar' && cfg.datasets.length > 2

  return {
    labels: cfg.labels,
    datasets: cfg.datasets.map(
      (ds: { label: string; data: number[] }, i: number) => ({
        label: ds.label,
        data: ds.data,
        borderColor: cc.series[i % cc.series.length],
        backgroundColor: isStacked
          ? cc.series[i % cc.series.length] + 'cc'
          : cc.series[i % cc.series.length] + '33',
        fill: dashboard.value!.chartType === 'line',
        tension: 0.4,
        pointRadius: 3,
      })
    ),
  }
})

const chartOptions = computed(() => {
  const cc = chartColors.value
  const isStacked =
    dashboard.value?.chartType === 'bar' &&
    (dashboard.value?.mockChartConfig?.datasets?.length ?? 0) > 2

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: { size: 12 },
          color: cc.text,
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        mode: isStacked ? ('index' as const) : ('nearest' as const),
        backgroundColor: cc.tooltip,
      },
    },
    scales: {
      x: {
        stacked: isStacked,
        grid: { display: false },
        ticks: { color: cc.text, font: { size: 11 } },
      },
      y: {
        stacked: isStacked,
        grid: { color: cc.grid },
        ticks: { color: cc.text, font: { size: 11 } },
      },
    },
  }
})

// Determine which chart component to render
const chartComponent = computed(() => {
  if (!dashboard.value) return Line
  return dashboard.value.chartType === 'bar' ? Bar : Line
})

// Category badge color mapping
const categoryColors: Record<string, string> = {
  Sales: 'bg-blue-100 text-blue-700',
  Operations: 'bg-amber-100 text-amber-700',
  Marketing: 'bg-purple-100 text-purple-700',
  Analytics: 'bg-teal-100 text-teal-700',
}

function getCategoryClass(category: string): string {
  return categoryColors[category] || 'bg-surface-100 text-surface-700 dark:bg-surface-700 dark:text-surface-200'
}

// Download chart as PNG
function downloadPNG(): void {
  const canvas = document.querySelector('.chart-area canvas') as HTMLCanvasElement | null
  if (!canvas) return
  const link = document.createElement('a')
  link.download = `${dashboard.value?.slug || 'chart'}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

// Download chart data as CSV
function downloadCSV(): void {
  if (!dashboard.value || !chartData.value) return
  const data = chartData.value
  const headers = ['Label', ...data.datasets.map((ds: { label: string }) => ds.label)]
  const rows = data.labels.map((label: string, i: number) =>
    [label, ...data.datasets.map((ds: { data: number[] }) => ds.data[i] ?? '')].join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const link = document.createElement('a')
  link.download = `${dashboard.value.slug}.csv`
  link.href = URL.createObjectURL(blob)
  link.click()
  URL.revokeObjectURL(link.href)
}
</script>

<template>
  <div class="min-h-screen">
    <!-- Dashboard found -->
    <div v-if="dashboard" class="max-w-screen-2xl mx-auto px-4 md:px-8 py-8">
      <!-- Back navigation -->
      <nav aria-label="Breadcrumb" class="mb-6">
        <router-link
          to="/dashboards"
          class="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-primary-600 transition-colors"
        >
          <ArrowLeft class="w-4 h-4" aria-hidden="true" />
          All Dashboards
        </router-link>
      </nav>

      <div class="grid lg:grid-cols-3 gap-8">
        <!-- Main content: 2/3 width -->
        <div class="lg:col-span-2">
          <!-- Header -->
          <header class="mb-8">
            <div class="flex flex-wrap items-center gap-3 mb-3">
              <span
                class="text-[11px] font-semibold uppercase px-2.5 py-1 rounded-full"
                :class="getCategoryClass(dashboard.category)"
              >
                {{ dashboard.category }}
              </span>
              <span class="text-xs text-surface-400 flex items-center gap-1">
                <Calendar class="w-3 h-3" aria-hidden="true" />
                Updated {{ dashboard.lastUpdated }}
              </span>
            </div>

            <h1 class="text-2xl sm:text-3xl md:text-4xl font-bold text-surface-900 dark:text-surface-0 mb-2">
              {{ dashboard.title }}
            </h1>
            <p class="text-lg text-surface-600 dark:text-surface-300">
              {{ dashboard.description }}
            </p>
          </header>

          <!-- Chart area -->
          <section
            aria-label="Visualization"
            class="bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl p-6 mb-8"
          >
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
              <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-0">
                Visualization
              </h2>
              <div class="flex gap-2">
                <Button
                  size="small"
                  severity="secondary"
                  outlined
                  @click="downloadPNG"
                  aria-label="Download chart as PNG"
                >
                  <template #icon>
                    <Download class="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                  </template>
                  PNG
                </Button>
                <Button
                  size="small"
                  severity="secondary"
                  outlined
                  @click="downloadCSV"
                  aria-label="Download chart data as CSV"
                >
                  <template #icon>
                    <Download class="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                  </template>
                  CSV
                </Button>
              </div>
            </div>

            <div ref="chartRef" class="chart-area" style="height: 360px">
              <component
                v-if="chartData"
                :is="chartComponent"
                :data="chartData"
                :options="chartOptions"
              />
            </div>
          </section>

          <!-- Methodology -->
          <section
            v-if="dashboard.methodology"
            aria-label="Methodology"
            class="bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl p-6 mb-8"
          >
            <div class="flex items-center gap-2 mb-3">
              <FileText class="w-4 h-4 text-surface-400" aria-hidden="true" />
              <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-0">
                Methodology
              </h2>
            </div>
            <p class="text-sm text-surface-600 dark:text-surface-300 leading-relaxed">
              {{ dashboard.methodology }}
            </p>
          </section>

          <!-- Features list -->
          <section
            v-if="dashboard.features && dashboard.features.length"
            aria-label="Features"
            class="bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl p-6"
          >
            <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-0 mb-4">
              Features
            </h2>
            <ul class="space-y-2">
              <li
                v-for="feature in dashboard.features"
                :key="feature"
                class="flex items-start gap-2 text-sm text-surface-600 dark:text-surface-300"
              >
                <div class="w-1.5 h-1.5 rounded-full bg-primary-500 mt-2 shrink-0" aria-hidden="true"></div>
                {{ feature }}
              </li>
            </ul>
          </section>
        </div>

        <!-- Sidebar: 1/3 width -->
        <aside class="space-y-6" aria-label="Dashboard details">
          <!-- Key stats -->
          <div class="bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl p-6">
            <h3 class="font-semibold text-surface-900 dark:text-surface-0 mb-4 flex items-center gap-2">
              <BarChart3 class="w-4 h-4 text-surface-400" aria-hidden="true" />
              Key Stats
            </h3>
            <dl class="space-y-3">
              <div class="flex justify-between items-center text-sm">
                <dt class="text-surface-500">Sites</dt>
                <dd class="font-semibold text-surface-900 dark:text-surface-0">
                  {{ dashboard.sites }}
                </dd>
              </div>
              <div class="flex justify-between items-center text-sm">
                <dt class="text-surface-500">Data Points</dt>
                <dd class="font-semibold text-surface-900 dark:text-surface-0">
                  {{ dashboard.sampleCount }}
                </dd>
              </div>
              <div class="flex justify-between items-center text-sm">
                <dt class="text-surface-500">Last Updated</dt>
                <dd class="font-semibold text-surface-900 dark:text-surface-0">
                  {{ dashboard.lastUpdated }}
                </dd>
              </div>
            </dl>
          </div>

          <!-- Related dashboards -->
          <div
            v-if="relatedDashboards.length"
            class="bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl p-6"
          >
            <h3 class="font-semibold text-surface-900 dark:text-surface-0 mb-4 flex items-center gap-2">
              <TrendingUp class="w-4 h-4 text-surface-400" aria-hidden="true" />
              Related Dashboards
            </h3>
            <ul class="space-y-3">
              <li v-for="related in relatedDashboards" :key="related.slug">
                <router-link
                  :to="`/dashboards/${related.slug}`"
                  class="block p-3 rounded-lg border border-surface-100 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                >
                  <div class="flex items-center gap-2 mb-1">
                    <Tag
                      :value="related.category"
                      severity="info"
                      class="text-[10px]"
                    />
                  </div>
                  <span class="text-sm font-medium text-surface-900 dark:text-surface-0">
                    {{ related.title }}
                  </span>
                  <p class="text-xs text-surface-500 mt-1 line-clamp-2">
                    {{ related.subtitle || related.description }}
                  </p>
                </router-link>
              </li>
            </ul>
          </div>

          <!-- Explore CTA -->
          <div class="bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-xl p-6">
            <h3 class="font-semibold text-surface-900 dark:text-surface-0 mb-2">
              Explore the Data
            </h3>
            <p class="text-sm text-surface-600 dark:text-surface-300 mb-4">
              Dive deeper into the underlying data behind this dashboard.
            </p>
            <router-link
              to="/explore"
              class="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Open data explorer
              <ArrowLeft class="w-3.5 h-3.5 rotate-180" aria-hidden="true" />
            </router-link>
          </div>
        </aside>
      </div>
    </div>

    <!-- Not found state -->
    <div v-else class="max-w-screen-2xl mx-auto px-4 md:px-8 py-20 text-center">
      <div class="max-w-md mx-auto">
        <div class="w-16 h-16 bg-surface-100 dark:bg-surface-700 rounded-full flex items-center justify-center mx-auto mb-6">
          <BarChart3 class="w-8 h-8 text-surface-400" aria-hidden="true" />
        </div>
        <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-0 mb-3">
          Dashboard Not Found
        </h1>
        <p class="text-surface-500 mb-6">
          The dashboard you are looking for does not exist or may have been removed.
        </p>
        <router-link
          to="/dashboards"
          class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <ArrowLeft class="w-4 h-4" aria-hidden="true" />
          Back to Dashboards
        </router-link>
      </div>
    </div>
  </div>
</template>
