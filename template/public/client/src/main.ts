import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import { plugin as formkit, defaultConfig } from '@formkit/vue'
import formkitConfig from '@/formkit.config'
import 'primeicons/primeicons.css'
import './assets/main.css'
import App from './App.vue'
import router from './router'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'
import { fetchCsrfToken } from '@/lib/api'

// Preload primeicons woff2 to shorten the critical request chain
// (Lighthouse: "Avoid chaining critical requests"). Using new URL()
// lets vite emit the hashed asset path at build time, so the preload
// hint always matches the actual font URL even across rebuilds.
const primeIconFontUrl = new URL(
  'primeicons/fonts/primeicons.woff2',
  import.meta.url,
).href
const preload = document.createElement('link')
preload.rel = 'preload'
preload.as = 'font'
preload.type = 'font/woff2'
preload.href = primeIconFontUrl
preload.crossOrigin = 'anonymous'
document.head.appendChild(preload)

const { initTheme } = useTheme()
initTheme()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      prefix: 'p',
      darkModeSelector: '.dark-mode',
    },
  },
})

app.use(ToastService)
app.use(ConfirmationService)
app.use(formkit, defaultConfig(formkitConfig))
app.use(router)

app.config.errorHandler = (err, _instance, info) => {
  console.error('[Global Error]', err, info)
  // Surface to user via PrimeVue toast (non-blocking)
  const toast = app.config.globalProperties.$toast
  if (toast) {
    toast.add({
      severity: 'error',
      summary: 'Something went wrong',
      detail: 'An unexpected error occurred. Please refresh and try again.',
      life: 8000,
    })
  }
}

// Bootstrap: fetch current user session, then CSRF token
const auth = useAuthStore()
auth.fetchUser().then(() => fetchCsrfToken()).finally(() => {
  app.mount('#app')
})
