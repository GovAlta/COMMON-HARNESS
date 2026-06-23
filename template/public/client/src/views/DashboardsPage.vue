<script setup lang="ts">
import { ref, computed } from 'vue'
import { dashboards } from '@/data/dashboards'
import { ArrowRight } from 'lucide-vue-next'
import { useTheme } from '@/composables/useTheme'
import { getPreviewBars } from '@/lib/chartUtils'
import Button from 'primevue/button'

const { chartColors } = useTheme()
const activeCategory = ref<string>('all')

// Derive unique categories from the data
const categories = computed(() => {
  const unique = [...new Set(dashboards.map((d) => d.category))]
  return [
    { value: 'all', label: 'All' },
    ...unique.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })),
  ]
})

const filtered = computed(() => {
  if (activeCategory.value === 'all') return dashboards
  return dashboards.filter((d) => d.category === activeCategory.value)
})

// Badge color map — falls back to indigo for unknown categories
const categoryBadge: Record<string, string> = {
  Sales: 'bg-blue-50 text-blue-600',
  Operations: 'bg-amber-50 text-amber-600',
  Marketing: 'bg-purple-50 text-purple-600',
  Analytics: 'bg-teal-50 text-teal-600',
}

function badgeClass(category: string): string {
  return categoryBadge[category] ?? 'bg-indigo-50 text-indigo-600'
}

function getPreviewBarsForDash(dash: (typeof dashboards)[number]) {
  return getPreviewBars(dash, chartColors.value.series[0])
}
</script>

<template>
  <div class="min-h-screen">
    <!-- Page Header -->
    <header class="pt-10 pb-8 px-4 md:px-8">
      <div class="max-w-screen-2xl mx-auto">
        <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-2">
          Dashboards
        </h1>
        <p class="text-lg text-slate-600 font-geist max-w-3xl">
          Browse interactive dashboards across all categories. Filter by topic to find the insights you need.
        </p>
      </div>
    </header>

    <!-- Category Filters -->
    <section class="px-4 md:px-8 mb-8" aria-label="Category filters">
      <div class="max-w-screen-2xl mx-auto">
        <div class="flex flex-wrap gap-2" role="group" aria-label="Filter dashboards by category">
          <Button
            v-for="cat in categories"
            :key="cat.value"
            :label="cat.label"
            :severity="activeCategory === cat.value ? undefined : 'secondary'"
            :outlined="activeCategory !== cat.value"
            :class="[
              'rounded-full text-sm font-geist font-medium transition-colors',
              activeCategory === cat.value
                ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                : 'bg-slate-100 text-slate-600 border-slate-100 hover:bg-slate-200',
            ]"
            :aria-pressed="activeCategory === cat.value"
            :data-testid="`dashboard-filter-${cat.value}`"
            @click="activeCategory = cat.value"
          />
        </div>
      </div>
    </section>

    <!-- Dashboard Grid -->
    <section class="px-4 md:px-8 pb-20" aria-label="Dashboard gallery">
      <div class="max-w-screen-2xl mx-auto">
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <router-link
            v-for="dash in filtered"
            :key="dash.id"
            :to="`/dashboards/${dash.slug}`"
            class="group border border-slate-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all hover:border-indigo-200 bg-white"
            :aria-label="`View ${dash.title} dashboard`"
            data-testid="dashboard-card"
          >
            <!-- Chart Preview Area -->
            <div class="h-48 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center relative p-6">
              <div
                class="w-full h-full flex items-end justify-center gap-1"
                role="img"
                :aria-label="`Bar chart preview for ${dash.title}`"
              >
                <div
                  v-for="(val, i) in getPreviewBarsForDash(dash).data"
                  :key="i"
                  class="flex-1 rounded-t transition-all"
                  :style="{
                    height: (val / Math.max(...getPreviewBarsForDash(dash).data, 1)) * 100 + '%',
                    backgroundColor: getPreviewBarsForDash(dash).color,
                    opacity: 0.3 + (i / 12) * 0.7,
                  }"
                ></div>
              </div>
              <span
                class="absolute top-3 right-3 text-[10px] font-geist font-semibold uppercase px-2 py-0.5 rounded-full"
                :class="badgeClass(dash.category)"
              >
                {{ dash.category }}
              </span>
            </div>

            <!-- Card Body -->
            <div class="p-6">
              <h2 class="font-jakarta font-bold text-lg text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">
                {{ dash.title }}
              </h2>
              <p class="text-sm font-geist text-slate-500 mb-3">{{ dash.subtitle || '' }}</p>
              <p class="text-sm font-geist text-slate-600 line-clamp-2 leading-relaxed mb-4">
                {{ dash.description }}
              </p>
              <div class="flex items-center justify-between">
                <div class="flex gap-3 text-xs font-geist text-slate-500">
                  <span>{{ dash.sites ?? 0 }} sites</span>
                  <span class="w-1 h-1 bg-slate-300 rounded-full self-center"></span>
                  <span>{{ dash.sampleCount ?? 0 }}</span>
                </div>
                <span
                  class="text-sm font-geist font-medium text-indigo-600 group-hover:translate-x-1 transition-transform flex items-center gap-1"
                >
                  View <ArrowRight class="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </router-link>
        </div>
      </div>
    </section>
  </div>
</template>
