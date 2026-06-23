<script setup lang="ts">
withDefaults(
  defineProps<{
    lines?: number
    type?: 'text' | 'card' | 'table'
  }>(),
  {
    lines: 3,
    type: 'text',
  },
)
</script>

<template>
  <!-- Text skeleton -->
  <div v-if="type === 'text'" class="space-y-3">
    <div
      v-for="i in lines"
      :key="i"
      class="h-4 bg-slate-200 rounded animate-pulse"
      :class="i === lines ? 'w-2/3' : 'w-full'"
    />
  </div>

  <!-- Card skeleton -->
  <div
    v-else-if="type === 'card'"
    class="border border-slate-200 rounded-xl p-6 space-y-4"
  >
    <div class="h-32 bg-slate-200 rounded-lg animate-pulse" />
    <div class="h-5 bg-slate-200 rounded animate-pulse w-3/4" />
    <div class="h-4 bg-slate-200 rounded animate-pulse w-full" />
    <div class="h-4 bg-slate-200 rounded animate-pulse w-1/2" />
  </div>

  <!-- Table skeleton -->
  <div v-else-if="type === 'table'" class="space-y-2">
    <div class="h-10 bg-slate-300 rounded animate-pulse" />
    <div
      v-for="i in lines"
      :key="i"
      class="h-8 bg-slate-200 rounded animate-pulse"
    />
  </div>
</template>
