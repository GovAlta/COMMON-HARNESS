<script setup lang="ts">
import { ref, watch } from 'vue'
import { Palette } from 'lucide-vue-next'
import { useTheme, themes } from '@/composables/useTheme'
import Select from 'primevue/select'

const { currentTheme, setTheme } = useTheme()
const selectedTheme = ref(currentTheme.value)

watch(selectedTheme, (id) => {
  if (id) setTheme(id)
})
</script>

<template>
  <div class="flex items-center gap-2">
    <Palette :size="16" class="text-slate-400" aria-hidden="true" />
    <Select
      v-model="selectedTheme"
      :options="themes"
      option-label="label"
      option-value="id"
      placeholder="Theme"
      class="w-32 text-sm"
      aria-label="Select color theme"
      data-testid="theme-select"
    >
      <template #option="slotProps">
        <div class="flex items-center gap-2">
          <span
            class="w-3 h-3 rounded-full inline-block shrink-0"
            :style="{ background: slotProps.option.swatch }"
            aria-hidden="true"
          />
          <span>{{ slotProps.option.label }}</span>
        </div>
      </template>
    </Select>
  </div>
</template>
