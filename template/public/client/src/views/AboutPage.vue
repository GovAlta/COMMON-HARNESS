<script setup lang="ts">
import { Users, Shield, Globe, Zap, Target } from 'lucide-vue-next'

const values = [
  { icon: Shield, title: 'Security First', desc: 'OWASP ASVS Level 2 compliance baked into every layer of the stack.' },
  { icon: Globe, title: 'Open Standards', desc: 'Built on open-source tools and transparent, well-documented architecture.' },
  { icon: Users, title: 'Collaboration', desc: 'Designed for teams — clear conventions, shared patterns, and consistent code.' },
  { icon: Zap, title: 'Performance', desc: 'Optimized builds, lazy loading, and efficient data handling at every level.' },
]

const stack = [
  { name: 'Vue 3', desc: 'Composition API with TypeScript for type-safe, reactive UIs' },
  { name: 'PrimeVue 4', desc: 'Enterprise-grade UI components with built-in accessibility' },
  { name: 'Tailwind CSS', desc: 'Utility-first styling with theme-aware custom properties' },
  { name: 'FormKit', desc: 'Production-ready form handling with validation' },
  { name: 'Chart.js', desc: 'Responsive, theme-aware data visualizations' },
  { name: 'Leaflet', desc: 'Interactive maps with custom markers and clustering' },
]
</script>

<template>
  <div class="min-h-screen">
    <header class="pt-10 pb-8 px-4 md:px-8">
      <div class="max-w-screen-xl mx-auto text-center">
        <h1 class="text-4xl md:text-5xl font-jakarta font-bold text-slate-900 mb-4">
          About This Template
        </h1>
        <p class="text-lg text-slate-500 font-geist max-w-2xl mx-auto leading-relaxed">
          A production-ready application template built on proven architecture standards, security best practices, and modern tooling for Vue.js full-stack applications.
        </p>
      </div>
    </header>

    <section class="px-4 md:px-8 pb-16" aria-labelledby="values-heading">
      <div class="max-w-screen-xl mx-auto">
        <h2 id="values-heading" class="text-2xl font-jakarta font-bold text-slate-900 mb-8 text-center">Core Principles</h2>
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div
            v-for="v in values"
            :key="v.title"
            class="bg-slate-50 rounded-2xl p-6 border border-slate-100 hover:border-indigo-200 transition-colors"
          >
            <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mb-4">
              <component :is="v.icon" :size="20" class="text-indigo-600" />
            </div>
            <h3 class="font-jakarta font-semibold text-slate-900 mb-2">{{ v.title }}</h3>
            <p class="text-sm text-slate-500 font-geist leading-relaxed">{{ v.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="px-4 md:px-8 pb-16" aria-labelledby="stack-heading">
      <div class="max-w-screen-xl mx-auto">
        <h2 id="stack-heading" class="text-2xl font-jakarta font-bold text-slate-900 mb-8 text-center">Technology Stack</h2>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="tech in stack"
            :key="tech.name"
            class="flex items-start gap-3 bg-white rounded-xl p-4 border border-slate-100"
          >
            <Target :size="16" class="text-indigo-500 mt-0.5 shrink-0" />
            <div>
              <h3 class="font-geist font-semibold text-sm text-slate-900">{{ tech.name }}</h3>
              <p class="text-sm text-slate-500 font-geist">{{ tech.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
