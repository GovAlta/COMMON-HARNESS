<script setup lang="ts">
import { portalStats } from '@/data/mockData'
import { dashboards } from '@/data/dashboards'
import { blogPosts } from '@/data/blogPosts'
import { useSeoMeta } from '@/composables/useSeoMeta'

useSeoMeta({
  title: 'Home',
  description: 'A production-grade Vue 3 + Node.js application template with SSO, role-based access, dynamic forms, blog, and PWA support.',
})
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ShoppingCart,
  DollarSign,
  Globe,
  Tags,
} from 'lucide-vue-next'
import { useTheme } from '@/composables/useTheme'
import { getPreviewBars } from '@/lib/chartUtils'

const { chartColors } = useTheme()
const featuredDashboards = dashboards.slice(0, 3)
const latestPosts = blogPosts.slice(0, 3)

function getPreviewBarsForDash(dash: (typeof dashboards)[number]) {
  return getPreviewBars(dash, chartColors.value.series[0])
}

const statCards = [
  { label: 'Total Orders', value: portalStats.totalOrders.toLocaleString(), icon: ShoppingCart, accent: 'text-indigo-600' },
  { label: 'Total Revenue', value: `$${portalStats.totalRevenue.toLocaleString()}`, icon: DollarSign, accent: 'text-teal-600' },
  { label: 'Regions', value: portalStats.regions.toLocaleString(), icon: Globe, accent: 'text-purple-600' },
  { label: 'Categories', value: portalStats.categories.toLocaleString(), icon: Tags, accent: 'text-amber-600' },
]
</script>

<template>
  <div class="min-h-screen">
    <!-- Hero -->
    <header class="pt-20 pb-14 px-4 md:px-8" aria-label="Hero section">
      <div class="max-w-screen-2xl mx-auto">
        <div
          class="bg-slate-50 rounded-3xl p-5 sm:p-8 md:p-14 relative overflow-hidden"
          style="box-shadow: 0 0 0 1px rgba(148,163,184,0.1), 0 4px 30px rgba(0,0,0,0.04)"
        >
          <!-- Decorative gradient blobs -->
          <div class="absolute top-0 right-0 w-96 h-96 bg-indigo-100 rounded-full blur-[120px] opacity-40"></div>
          <div class="absolute bottom-0 left-0 w-64 h-64 bg-teal-100 rounded-full blur-[100px] opacity-30"></div>

          <div class="relative max-w-3xl">
            <div class="flex items-center gap-2 mb-6">
              <span
                class="text-xs font-geist font-semibold uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full"
              >
                Analytics Platform
              </span>
            </div>
            <h1 class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-jakarta font-bold text-slate-900 leading-[1.1] mb-6">
              Analytics from
              <span class="text-indigo-600">data to insight</span>
            </h1>
            <p class="text-lg text-slate-600 font-geist leading-relaxed mb-8 max-w-xl">
              A unified analytics platform that transforms raw data into actionable
              insights. Explore interactive dashboards, drill into regional trends,
              and uncover the stories behind the numbers.
            </p>
            <div class="flex flex-wrap gap-3">
              <router-link
                to="/explore"
                class="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-full text-sm font-medium font-geist hover:bg-indigo-700 transition-colors shadow-sm"
                aria-label="Explore data"
                data-testid="hero-cta-explore"
              >
                Explore Data
                <ArrowRight class="w-4 h-4" />
              </router-link>
              <router-link
                to="/dashboards"
                class="inline-flex items-center gap-2 px-6 py-3 border border-slate-300 bg-white text-slate-700 rounded-full text-sm font-medium font-geist hover:bg-slate-50 transition-colors"
                aria-label="View dashboards"
                data-testid="hero-cta-dashboards"
              >
                <BarChart3 class="w-4 h-4" />
                View Dashboards
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Stats Bar -->
    <section class="px-4 md:px-8 mb-20" aria-label="Key statistics">
      <div class="max-w-screen-2xl mx-auto">
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div
            v-for="stat in statCards"
            :key="stat.label"
            class="bg-white rounded-3xl border border-slate-200 p-6 backdrop-blur"
            style="box-shadow: 0 0 0 1px rgba(148,163,184,0.08), 0 2px 12px rgba(0,0,0,0.03)"
          >
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                <component :is="stat.icon" class="w-5 h-5" :class="stat.accent" />
              </div>
            </div>
            <div class="text-2xl font-jakarta font-bold text-slate-900">{{ stat.value }}</div>
            <div class="text-xs font-geist text-slate-500 mt-1">{{ stat.label }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Featured Dashboards -->
    <section class="px-4 md:px-8 mb-20" aria-label="Featured dashboards">
      <div class="max-w-screen-2xl mx-auto">
        <div class="flex items-end justify-between mb-8">
          <div>
            <h2 class="text-3xl font-jakarta font-bold text-slate-900 mb-2">Featured Dashboards</h2>
            <p class="text-slate-600 font-geist">Interactive dashboards showcasing key analytics and trends.</p>
          </div>
          <router-link
            to="/dashboards"
            class="hidden md:inline-flex items-center gap-1 text-sm font-geist font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            View all dashboards <ArrowRight class="w-4 h-4" />
          </router-link>
        </div>
        <div class="grid md:grid-cols-3 gap-6">
          <router-link
            v-for="dash in featuredDashboards"
            :key="dash.id"
            :to="`/dashboards/${dash.slug}`"
            class="group border border-slate-200 rounded-3xl overflow-hidden hover:shadow-lg transition-all hover:border-indigo-200 bg-white"
          >
            <!-- Mini bar chart preview -->
            <div class="h-40 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center relative p-6">
              <div class="w-full h-full flex items-end justify-center gap-1" role="img" :aria-label="`Bar chart preview for ${dash.title}`">
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
                class="absolute top-3 right-3 text-[10px] font-geist font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600"
              >
                {{ dash.category }}
              </span>
            </div>
            <div class="p-5">
              <h3 class="font-jakarta font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">
                {{ dash.title }}
              </h3>
              <p class="text-sm font-geist text-slate-500 line-clamp-2">{{ dash.subtitle || '' }}</p>
              <div class="mt-3 flex items-center gap-3 text-xs font-geist text-slate-500">
                <span>{{ dash.sites ?? 0 }} sites</span>
                <span class="w-1 h-1 bg-slate-300 rounded-full"></span>
                <span>{{ dash.sampleCount ?? 0 }} samples</span>
              </div>
            </div>
          </router-link>
        </div>
        <div class="mt-6 text-center md:hidden">
          <router-link to="/dashboards" class="text-sm font-geist font-medium text-indigo-600">
            View all dashboards →
          </router-link>
        </div>
      </div>
    </section>

    <!-- Latest from the Blog -->
    <section class="px-4 md:px-8 mb-20" aria-label="Latest blog posts">
      <div class="max-w-screen-2xl mx-auto">
        <div class="flex items-end justify-between mb-8">
          <div>
            <h2 class="text-3xl font-jakarta font-bold text-slate-900 mb-2">Latest from the Blog</h2>
            <p class="text-slate-600 font-geist">News, updates, and insights from the team.</p>
          </div>
          <router-link
            to="/blog"
            class="hidden md:inline-flex items-center gap-1 text-sm font-geist font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            All posts <ArrowRight class="w-4 h-4" />
          </router-link>
        </div>
        <div class="grid md:grid-cols-3 gap-6">
          <router-link
            v-for="post in latestPosts"
            :key="post.id"
            :to="`/blog/${post.slug}`"
            class="group border border-slate-200 rounded-3xl p-6 hover:shadow-lg transition-all hover:border-indigo-200 bg-white backdrop-blur"
          >
            <div class="flex items-center gap-2 mb-3">
              <span class="text-[10px] font-geist font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                {{ post.category }}
              </span>
              <span class="text-xs font-geist text-slate-500">
                {{ new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
              </span>
            </div>
            <h3 class="font-jakarta font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-2">
              {{ post.title }}
            </h3>
            <p class="text-sm font-geist text-slate-500 line-clamp-3 leading-relaxed">{{ post.excerpt }}</p>
            <div class="mt-4 flex items-center gap-1 text-sm font-geist font-medium text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
              <BookOpen class="w-3.5 h-3.5" />
              Read more
            </div>
          </router-link>
        </div>
      </div>
    </section>
  </div>
</template>
