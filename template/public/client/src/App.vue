<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Toast from 'primevue/toast'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
// Install nag deliberately removed — install is now opt-in via /install.
import PwaUpdatePrompt from '@/components/pwa/PwaUpdatePrompt.vue'
import { useNotificationStream } from '@/composables/useNotificationStream'
import { useUserNotifications } from '@/composables/useUserNotifications'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const layout = computed(() => route.meta.layout || 'default')

const routeAnnouncement = ref('')

watch(
  () => route.fullPath,
  () => {
    nextTick(() => {
      routeAnnouncement.value = `Navigated to ${route.meta.title || route.name?.toString() || 'page'}`
    })
  },
)

// Real-time notifications. Three things happen here:
//   1. On boot (if already signed in), fetch the current unread count so the
//      navbar badge reflects state from before this tab opened.
//   2. Re-fetch when the user signs in (handles SSO return + same-tab login).
//   3. SSE listener bumps the count and surfaces each push as a toast.
const { info } = useToast()
const { fetchUnreadCount, incrementUnread } = useUserNotifications()
const auth = useAuthStore()

onMounted(() => {
  if (auth.isAuthenticated) fetchUnreadCount()
})
watch(
  () => auth.isAuthenticated,
  (signedIn) => {
    if (signedIn) fetchUnreadCount()
  },
)

useNotificationStream((payload) => {
  incrementUnread()
  info(payload.title || 'New notification', payload.body || '')
})
</script>

<template>
  <a href="#main-content" class="skip-nav" data-testid="skip-nav">Skip to main content</a>
  <div id="route-announcer" class="sr-only" aria-live="polite" aria-atomic="true">{{ routeAnnouncement }}</div>
  <Toast position="top-right" />
  <PwaUpdatePrompt />

  <!-- Blank layout: no chrome (used by /auth and the 404 page) -->
  <template v-if="layout === 'blank'">
    <main id="main-content" class="min-h-screen" data-testid="main-content">
      <router-view />
    </main>
  </template>

  <!--
    Default layout (catch-all): navbar + footer. Also serves the 'admin'
    layout meta value for now — admin pages reuse the main chrome and rely
    on the Admin dropdown in AppNavbar for cross-page navigation. If you
    later want a dedicated admin sidebar / breadcrumb, fork a new branch
    here keyed on layout === 'admin'.
  -->
  <template v-else>
    <div class="min-h-screen flex flex-col overflow-x-hidden">
      <AppNavbar />
      <main id="main-content" class="flex-1" data-testid="main-content">
        <router-view />
      </main>
      <AppFooter />
    </div>
  </template>
</template>
