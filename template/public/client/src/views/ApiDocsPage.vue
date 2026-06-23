<script setup lang="ts">
import { ref } from 'vue'
import { Code2, ChevronDown } from 'lucide-vue-next'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import { apiEndpoints } from '@/data/apiEndpoints'
import { useToast } from '@/composables/useToast'

const { success } = useToast()
const expandedEndpoint = ref<string | null>(null)

function toggleEndpoint(path: string): void {
  expandedEndpoint.value = expandedEndpoint.value === path ? null : path
}

const methodColors: Record<string, string> = {
  GET: 'info',
  POST: 'success',
  PUT: 'warn',
  DELETE: 'danger',
}

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text)
  success('Copied', 'Example copied to clipboard')
}
</script>

<template>
  <div class="min-h-screen">
    <header class="pt-10 pb-8 px-4 md:px-8">
      <div class="max-w-screen-xl mx-auto">
        <h1 class="text-4xl font-jakarta font-bold text-slate-900 mb-4">API Documentation</h1>
        <p class="text-lg text-slate-500 font-geist">RESTful API reference for integrating with the platform.</p>
        <div class="mt-4 inline-flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2">
          <Code2 :size="14" class="text-slate-500" />
          <code class="text-sm font-mono text-slate-700">Base URL: /api/v1</code>
        </div>
      </div>
    </header>

    <section class="px-4 md:px-8 pb-16">
      <div class="max-w-screen-xl mx-auto space-y-4">
        <div
          v-for="endpoint in apiEndpoints"
          :key="endpoint.path"
          class="border border-slate-200 rounded-xl overflow-hidden"
        >
          <button
            class="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
            @click="toggleEndpoint(endpoint.path)"
            :aria-expanded="expandedEndpoint === endpoint.path"
          >
            <Tag :value="endpoint.method" :severity="methodColors[endpoint.method] ?? 'info'" class="font-mono text-xs" />
            <code class="font-mono text-sm text-slate-700 flex-1">{{ endpoint.path }}</code>
            <span class="text-sm text-slate-500 font-geist hidden sm:block">{{ endpoint.description }}</span>
            <ChevronDown
              :size="16"
              class="text-slate-400 transition-transform"
              :class="{ 'rotate-180': expandedEndpoint === endpoint.path }"
            />
          </button>

          <div v-if="expandedEndpoint === endpoint.path" class="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
            <p class="text-sm text-slate-600 font-geist mb-4">{{ endpoint.description }}</p>

            <div v-if="endpoint.parameters.length" class="mb-4">
              <h3 class="text-xs font-geist font-semibold uppercase tracking-wider text-slate-500 mb-2">Parameters</h3>
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs text-slate-500 border-b border-slate-200">
                      <th class="pb-2 pr-4 font-geist">Name</th>
                      <th class="pb-2 pr-4 font-geist">Type</th>
                      <th class="pb-2 pr-4 font-geist">Required</th>
                      <th class="pb-2 font-geist">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="param in endpoint.parameters" :key="param.name" class="border-b border-slate-100">
                      <td class="py-2 pr-4 font-mono text-indigo-600">{{ param.name }}</td>
                      <td class="py-2 pr-4 text-slate-500">{{ param.type }}</td>
                      <td class="py-2 pr-4">
                        <Tag :value="param.required ? 'Required' : 'Optional'" :severity="param.required ? 'danger' : 'secondary'" class="text-xs" />
                      </td>
                      <td class="py-2 text-slate-600">{{ param.description }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-if="endpoint.exampleResponse">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-xs font-geist font-semibold uppercase tracking-wider text-slate-500">Example Response</h3>
                <Button
                  icon="pi pi-copy"
                  severity="secondary"
                  text
                  size="small"
                  @click="copyToClipboard(endpoint.exampleResponse)"
                  aria-label="Copy example response"
                />
              </div>
              <pre class="code-block text-xs">{{ endpoint.exampleResponse }}</pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
