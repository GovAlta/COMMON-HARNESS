<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

const props = withDefaults(
  defineProps<{
    fallbackMessage?: string
  }>(),
  {
    fallbackMessage: 'Something went wrong. Please try again.',
  },
)

const error = ref<Error | null>(null)

onErrorCaptured((err: Error) => {
  error.value = err
  console.error('[ErrorBoundary]', err)
  return false
})

function retry() {
  error.value = null
}
</script>

<template>
  <slot v-if="!error" />
  <div
    v-else
    class="flex flex-col items-center justify-center p-8 text-center border border-red-200 bg-red-50 rounded-xl"
    role="alert"
  >
    <p class="text-sm text-red-700 mb-4" data-testid="error-message">{{ props.fallbackMessage }}</p>
    <button
      class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
      data-testid="error-retry"
      @click="retry"
    >
      Try again
    </button>
  </div>
</template>
