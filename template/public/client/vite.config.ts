import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import Components from 'unplugin-vue-components/vite'
import { PrimeVueResolver } from '@primevue/auto-import-resolver'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// ---------------------------------------------------------------------------
// Dev-only plugins
// ---------------------------------------------------------------------------

/**
 * Provides a no-op `virtual:pwa-register` module during development.
 * In production builds, vite-plugin-pwa supplies the real module.
 * This prevents import errors when devOptions.enabled is false.
 */
function pwaDevFallback(): Plugin {
  return {
    name: 'pwa-dev-fallback',
    apply: 'serve',
    resolveId(id) {
      if (id === 'virtual:pwa-register') return '\0virtual:pwa-register'
    },
    load(id) {
      if (id === '\0virtual:pwa-register') {
        return `export function registerSW() { return () => {} }`
      }
    },
    configureServer(server) {
      // Serve a valid manifest in dev (vite-plugin-pwa only serves it in build)
      server.middlewares.use((req, res, next) => {
        if (req.url === '/manifest.webmanifest') {
          res.writeHead(200, { 'Content-Type': 'application/manifest+json' })
          res.end(JSON.stringify({
            name: 'App Template',
            short_name: 'AppTemplate',
            theme_color: '#4f46e5',
            background_color: '#ffffff',
            display: 'standalone',
            scope: '/',
            start_url: '/',
            icons: [
              { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
              { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            ],
          }))
          return
        }
        next()
      })
    },
  }
}

/**
 * Frontend-only development mock for auth bootstrap requests. Returns 200
 * responses so the browser doesn't log console errors when the backend is
 * absent. **Opt-in** — set `VITE_USE_DEV_MOCK=true` in client/.env to enable.
 *
 * Default is OFF so the proxy can pass requests through to a real backend.
 * Previously this defaulted ON, which silently nulled the authenticated user
 * after SSO sign-in (the cookies were set on localhost:3000 but the mock
 * intercepted /api/auth/me on the way back, so the session never surfaced).
 */
function devAuthMock(): Plugin {
  return {
    name: 'dev-auth-mock',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/auth/me') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('null')
          return
        }
        if (req.url === '/api/auth/csrf-token') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ data: { token: 'dev-csrf-' + Date.now() } }))
          return
        }
        next()
      })
    },
  }
}

// ---------------------------------------------------------------------------
// Main config
// ---------------------------------------------------------------------------

// Opt-in mock: only enable when explicitly requested (frontend-only dev).
// Default is OFF so /api/* falls through to the proxy → real backend.
const useMockAuth = process.env.VITE_USE_DEV_MOCK === 'true'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    Components({
      resolvers: [PrimeVueResolver()],
    }),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'App Template',
        short_name: 'AppTemplate',
        description: 'Vue 3 PWA Application Template',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        enabled: false,
      },
    }),
    // Dev-only: no-op PWA register module so imports resolve
    pwaDevFallback(),
    // Dev-only: mock auth endpoints when no backend is running.
    // Opt-in via VITE_USE_DEV_MOCK=true in client/.env. Default OFF.
    ...(useMockAuth ? [devAuthMock()] : []),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      '/sse': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // PrimeVue component library is ~687 KB minified (142 KB gzipped) — inherent to the library
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'primevue-vendor': ['primevue', '@primeuix/themes'],
          'chart-vendor': ['chart.js', 'vue-chartjs'],
          'map-vendor': ['leaflet', '@vue-leaflet/vue-leaflet'],
        },
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
})
