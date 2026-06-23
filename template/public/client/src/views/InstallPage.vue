<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Message from 'primevue/message'
import { Download, Monitor, Smartphone, Apple, CheckCircle2, ExternalLink } from 'lucide-vue-next'
import { usePwaInstall } from '@/composables/usePwa'
import { useToast } from '@/composables/useToast'

const { isInstallable, isInstalled, promptInstall } = usePwaInstall()
const { success: notifySuccess, error: notifyError } = useToast()

const installing = ref(false)

async function onInstallClick(): Promise<void> {
  installing.value = true
  try {
    const accepted = await promptInstall()
    if (accepted) {
      notifySuccess('Installed', 'You can launch from your home screen / start menu.')
    }
  } catch (err) {
    notifyError(
      'Install failed',
      err instanceof Error ? err.message : 'Your browser blocked the install prompt.'
    )
  } finally {
    installing.value = false
  }
}

/**
 * Cheap user-agent sniff for the "your platform" highlight. We *don't* gate
 * the instructions on this — every platform card is always visible. The
 * highlight is just a UX nudge so the right card pops first.
 */
const ua = ref('')
onMounted(() => {
  ua.value = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : ''
})

const isIos = computed(() => /iPad|iPhone|iPod/i.test(ua.value) && !/CriOS|FxiOS/i.test(ua.value))
const isAndroid = computed(() => /Android/i.test(ua.value))
const isDesktop = computed(() => !isIos.value && !isAndroid.value)
</script>

<template>
  <main class="min-h-screen bg-slate-50">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header class="mb-10">
        <h1 class="text-3xl sm:text-4xl font-jakarta font-bold text-slate-900 mb-2">
          Install the app
        </h1>
        <p class="text-slate-600 font-geist max-w-2xl">
          Add this app to your device for faster launches, an app icon on your home screen,
          and offline access to pages you've already visited. Installation is optional —
          everything still works in your browser.
        </p>
      </header>

      <!-- Primary install card — collapses to status when already installed -->
      <section
        class="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 mb-8"
        aria-labelledby="install-card-heading"
      >
        <div class="flex flex-col sm:flex-row sm:items-center gap-4">
          <div
            class="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center flex-shrink-0"
            aria-hidden="true"
          >
            <Download class="w-7 h-7 text-indigo-600" />
          </div>
          <div class="flex-1 min-w-0">
            <h2 id="install-card-heading" class="font-jakarta font-bold text-slate-900 mb-1">
              <template v-if="isInstalled">App already installed</template>
              <template v-else-if="isInstallable">Install in one click</template>
              <template v-else>Install instructions</template>
            </h2>
            <p class="text-sm text-slate-600 font-geist">
              <template v-if="isInstalled">
                You're running this app in standalone mode — no further setup needed.
              </template>
              <template v-else-if="isInstallable">
                Your browser supports one-click install. Click the button to add the app.
              </template>
              <template v-else>
                Your browser doesn't expose a one-click install prompt for this app yet.
                Follow your platform's instructions below.
              </template>
            </p>
          </div>
          <div class="flex-shrink-0">
            <button
              v-if="isInstallable && !isInstalled"
              type="button"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-geist font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
              :disabled="installing"
              data-testid="install-now"
              @click="onInstallClick"
            >
              <Download :size="16" aria-hidden="true" />
              {{ installing ? 'Installing…' : 'Install now' }}
            </button>
            <span
              v-else-if="isInstalled"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-geist font-medium"
            >
              <CheckCircle2 :size="16" aria-hidden="true" />
              Installed
            </span>
          </div>
        </div>
      </section>

      <Message
        v-if="!isInstallable && !isInstalled"
        severity="info"
        :closable="false"
        class="mb-8"
      >
        Most browsers only expose the install button after you've visited the site a few
        times, or when the page meets PWA criteria (HTTPS in production, valid manifest,
        service worker registered). If you don't see the button on your platform, use the
        manual steps below — they always work.
      </Message>

      <h2 class="text-xl font-jakarta font-bold text-slate-900 mb-4">Platform-specific steps</h2>

      <div class="grid gap-6 md:grid-cols-3">
        <!-- Desktop -->
        <article
          class="bg-white border-2 rounded-2xl shadow-sm p-6 transition-colors"
          :class="isDesktop ? 'border-indigo-500' : 'border-slate-200'"
          aria-labelledby="pc-install-heading"
        >
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center" aria-hidden="true">
              <Monitor class="w-5 h-5 text-slate-700" />
            </div>
            <h3 id="pc-install-heading" class="font-jakarta font-bold text-slate-900">Windows / Mac / Linux</h3>
          </div>
          <p class="text-xs text-slate-500 font-geist mb-3">Chrome, Edge, Brave, Arc</p>
          <ol class="space-y-3 text-sm text-slate-700 font-geist list-decimal list-inside">
            <li>Look in the address bar for an <strong>install icon</strong> (a tiny computer with a down arrow) near the bookmark star.</li>
            <li>Click it and confirm the install in the dialog.</li>
            <li>Alternatively, open the browser menu (⋯) → <strong>Install app</strong>, or <strong>Apps → Install this site as an app</strong>.</li>
            <li>The app opens in its own window and is pinned to your start menu / Dock.</li>
          </ol>
          <p class="text-xs text-slate-500 font-geist mt-4">
            Firefox and Safari on desktop don't yet support PWA install. Open this page in
            Chrome or Edge to install.
          </p>
        </article>

        <!-- Android -->
        <article
          class="bg-white border-2 rounded-2xl shadow-sm p-6 transition-colors"
          :class="isAndroid ? 'border-indigo-500' : 'border-slate-200'"
          aria-labelledby="android-install-heading"
        >
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center" aria-hidden="true">
              <Smartphone class="w-5 h-5 text-slate-700" />
            </div>
            <h3 id="android-install-heading" class="font-jakarta font-bold text-slate-900">Android</h3>
          </div>
          <p class="text-xs text-slate-500 font-geist mb-3">Chrome, Samsung Internet, Edge</p>
          <ol class="space-y-3 text-sm text-slate-700 font-geist list-decimal list-inside">
            <li>Tap the browser menu (the three-dot icon).</li>
            <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
            <li>Confirm the install. The app icon appears on your home screen and in the app drawer.</li>
            <li>Some Android browsers show a one-tap banner at the bottom of the page — tap <strong>Install</strong> there if you see it.</li>
          </ol>
        </article>

        <!-- iOS -->
        <article
          class="bg-white border-2 rounded-2xl shadow-sm p-6 transition-colors"
          :class="isIos ? 'border-indigo-500' : 'border-slate-200'"
          aria-labelledby="ios-install-heading"
        >
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center" aria-hidden="true">
              <Apple class="w-5 h-5 text-slate-700" />
            </div>
            <h3 id="ios-install-heading" class="font-jakarta font-bold text-slate-900">iPhone / iPad</h3>
          </div>
          <p class="text-xs text-slate-500 font-geist mb-3">Safari (required — Chrome on iOS uses Safari under the hood and can't install)</p>
          <ol class="space-y-3 text-sm text-slate-700 font-geist list-decimal list-inside">
            <li>Open this page in <strong>Safari</strong>. Chrome/Firefox on iOS cannot install PWAs.</li>
            <li>Tap the <strong>Share</strong> button (the square with an upward arrow) at the bottom of the screen.</li>
            <li>Scroll the share sheet and choose <strong>Add to Home Screen</strong>.</li>
            <li>Edit the name if you like, then tap <strong>Add</strong>. The app icon lands on your home screen.</li>
          </ol>
          <p class="text-xs text-slate-500 font-geist mt-4">
            iOS doesn't fire the standard install event, so the one-click button above will
            never appear on iPhone or iPad. The manual steps are the only path on Apple devices.
          </p>
        </article>
      </div>

      <section class="mt-10 bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h2 class="font-jakarta font-bold text-slate-900 mb-2">What happens after install?</h2>
        <ul class="space-y-2 text-sm text-slate-700 font-geist list-disc list-inside">
          <li>The app launches in its own window — no browser tabs, no address bar.</li>
          <li>Pages you've visited stay available offline via the service worker cache.</li>
          <li>You'll get a prompt to refresh whenever a new version is deployed.</li>
          <li>To remove the app, uninstall it the same way you'd remove any other installed app on your device.</li>
        </ul>
        <p class="mt-4 text-xs text-slate-500 font-geist inline-flex items-center gap-1">
          <ExternalLink :size="12" aria-hidden="true" />
          PWAs follow the same security model as your browser — they can't access anything a website couldn't.
        </p>
      </section>
    </div>
  </main>
</template>
