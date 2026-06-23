<script setup lang="ts">
import { usePwaUpdate } from '@/composables/usePwa'
import Button from 'primevue/button'
import { RefreshCw } from 'lucide-vue-next'

const { needRefresh, offlineReady, updateApp, dismissUpdate } = usePwaUpdate()
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-300 ease-out"
    enter-from-class="-translate-y-full"
    enter-to-class="translate-y-0"
    leave-active-class="transition-transform duration-200 ease-in"
    leave-from-class="translate-y-0"
    leave-to-class="-translate-y-full"
  >
    <div
      v-if="needRefresh || offlineReady"
      role="alert"
      class="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[60] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4"
    >
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <RefreshCw class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div class="flex-1 min-w-0">
          <template v-if="needRefresh">
            <p class="text-sm font-semibold text-surface-900 dark:text-surface-0">
              Update Available
            </p>
            <p class="text-xs text-surface-500 mt-0.5">
              A new version is available. Update now to get the latest features and fixes.
            </p>
            <div class="flex gap-2 mt-3">
              <Button
                label="Update now"
                size="small"
                severity="success"
                @click="updateApp"
                aria-label="Update application to latest version"
              />
              <Button
                label="Later"
                size="small"
                severity="secondary"
                text
                @click="dismissUpdate"
                aria-label="Dismiss update prompt"
              />
            </div>
          </template>
          <template v-else>
            <p class="text-sm font-semibold text-surface-900 dark:text-surface-0">
              Ready for Offline Use
            </p>
            <p class="text-xs text-surface-500 mt-0.5">
              This app has been cached and is available offline.
            </p>
            <div class="flex gap-2 mt-3">
              <Button
                label="OK"
                size="small"
                severity="secondary"
                @click="dismissUpdate"
                aria-label="Dismiss offline ready notification"
              />
            </div>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>
