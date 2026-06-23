# Skill: Project Setup & Build Configuration

This skill covers Vue 3 project scaffolding with Vite, PrimeVue 4.x and Tailwind CSS configuration, the recommended directory structure, test setup, and production build optimization including code splitting, vendor chunking, tree shaking, and compression.

> **Standards:** Cross-reference with [01-architecture](../../standards/01-architecture.md) for monorepo layout and layer separation, plus [03-coding-conventions](../../standards/03-coding-conventions.md) for naming/formatting plus import ordering.

---

## 1. Project Setup

### 1.1 Scaffolding

```bash
npm create vite@latest my-app -- --template vue-ts
cd my-app

# Core dependencies
npm install vue-router@4 pinia axios

# PrimeVue 4.x
npm install primevue @primeuix/themes primeicons
npm install -D @primevue/auto-import-resolver unplugin-vue-components

# Styling
npm install tailwindcss @tailwindcss/vite

# Security & Markdown
npm install dompurify marked
npm install -D @types/dompurify @types/marked

# Optional: Internationalization
npm install vue-i18n@9

# Forms (required for all form handling)
npm install @formkit/vue @formkit/themes

# Optional: Charts
npm install chart.js vue-chartjs

# Optional: Maps
npm install leaflet
npm install -D @types/leaflet

# Optional: Real-time
npm install socket.io-client

# Dev / Testing
npm install -D vitest @vue/test-utils happy-dom
npm install -D terser
```

### 1.2 vite.config.ts

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import Components from 'unplugin-vue-components/vite'
import { PrimeVueResolver } from '@primevue/auto-import-resolver'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    Components({
      resolvers: [PrimeVueResolver()],
    }),
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
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'primevue-vendor': ['primevue', '@primeuix/themes'],
          'chart-vendor': ['chart.js', 'vue-chartjs'],
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
```

### 1.3 vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    },
  },
})
```

### 1.4 tailwind.config.js

Tailwind CSS v4 uses the `@tailwindcss/vite` plugin and is configured via `main.css`. For v3-style config files:

```javascript
// tailwind.config.js (Tailwind v3; use if your project requires a config file)
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--p-primary-color)',
        'primary-contrast': 'var(--p-primary-contrast-color)',
        surface: {
          0: 'var(--p-surface-0)',
          50: 'var(--p-surface-50)',
          100: 'var(--p-surface-100)',
          200: 'var(--p-surface-200)',
          300: 'var(--p-surface-300)',
          400: 'var(--p-surface-400)',
          500: 'var(--p-surface-500)',
          600: 'var(--p-surface-600)',
          700: 'var(--p-surface-700)',
          800: 'var(--p-surface-800)',
          900: 'var(--p-surface-900)',
        },
      },
    },
  },
  plugins: [],
}
```

### 1.5 src/assets/main.css

```css
@import "tailwindcss";

/* Map PrimeVue design tokens to CSS custom properties */
:root {
  --app-color-primary: var(--p-primary-color);
  --app-color-surface: var(--p-surface-0);
  --app-color-text: var(--p-text-color);
  --app-color-border: var(--p-surface-border);
}

/* Screen reader only utility */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

### Font Loading Optimization

For design systems that depend on web fonts, optimize loading in `index.html`:

#### Resource Hints
```html
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" href="https://fonts.googleapis.com/css2?family=..." as="style">
```

#### font-display: swap

Override all web font `@font-face` rules to prevent Flash of Invisible Text (FOIT):

```css
@font-face {
  font-family: 'design-system-font';
  font-display: swap;
}
```

#### Fallback Font Stacks

Specify fallback stacks that approximate the design system typography to minimize layout shift:

```css
body {
  font-family: 'design-system-font', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
```

### 1.6 src/main.ts

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'
import router from './router'
import App from './App.vue'

// Optional: vue-i18n
// import { createI18n } from 'vue-i18n'
// import en from './locales/en.json'
// import fr from './locales/fr.json'

// Optional: FormKit
// import { plugin as formkitPlugin, defaultConfig } from '@formkit/vue'
// import '@formkit/themes/genesis'

import 'primeicons/primeicons.css'
import './assets/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: Aura,     // Also available: Lara, Material, Nora
    options: {
      darkModeSelector: '.dark-mode',
      cssLayer: {
        name: 'primevue',
        order: 'tailwind-base, primevue, tailwind-utilities',
      },
    },
  },
})
app.use(ToastService)
app.use(ConfirmationService)
app.directive('tooltip', Tooltip)

// Optional: i18n
// const i18n = createI18n({
//   legacy: false,
//   locale: 'en',
//   fallbackLocale: 'en',
//   messages: { en, fr },
// })
// app.use(i18n)

// Optional: FormKit
// app.use(formkitPlugin, defaultConfig)

app.mount('#app')
```

### 1.7 Directory Structure

```
src/
├── assets/                    # Static assets, global CSS
│   └── main.css
├── components/                # Reusable Vue components
│   ├── common/                # Shared (ErrorBoundary, etc.)
│   ├── layout/                # AppNavbar, ThemeSwitcher, etc.
│   └── [feature]/             # Feature-specific components
├── composables/               # Composition API hooks (use*)
│   ├── useTheme.ts
│   └── useNotifications.ts
├── data/                      # Mock/seed data (replace with API calls)
├── lib/                       # API client, utilities & helpers
│   ├── api.ts                 # Axios instance with interceptors
│   ├── sanitize.ts            # DOMPurify HTML sanitization
│   ├── socket.ts              # Socket.io client (optional)
│   └── sse.ts                 # Server-Sent Events client (optional)
├── router/                    # Vue Router config & guards
│   └── index.ts
├── stores/                    # Pinia stores
│   ├── auth.ts                # Auth state, role checks, idle timeout
│   └── notifications.ts
├── views/                     # Route-level page components
│   ├── HomeView.vue
│   ├── AuthPage.vue
│   ├── DashboardsPage.vue
│   └── ...
├── App.vue                    # Root component (meta-based layout switching)
└── main.ts                    # Entry point (Vue, Pinia, PrimeVue, FormKit)
```

## 12. Build Optimization

### 12.1 Code Splitting with Lazy Routes

All route components must use dynamic imports for automatic code splitting:

```typescript
// Every route uses () => import(...)
{ path: '/items', component: () => import('@/views/Items.vue') }
```

This creates a separate chunk per page, loaded only when the user navigates to that route.

### 12.2 Vendor Chunk Splitting

Configure manual chunks in `vite.config.ts` to separate vendor libraries from application code. This improves caching: vendor chunks change rarely and stay cached across deployments.

```typescript
// vite.config.ts → build.rollupOptions.output.manualChunks
manualChunks: {
  'vue-vendor': ['vue', 'vue-router', 'pinia'],
  'primevue-vendor': ['primevue', '@primeuix/themes'],
  'chart-vendor': ['chart.js', 'vue-chartjs'],      // Only if using charts
  'map-vendor': ['leaflet'],                         // Only if using maps
  'i18n-vendor': ['vue-i18n'],                       // Only if using i18n
}
```

### 12.3 Tree Shaking with PrimeVue Auto-Import

The `@primevue/auto-import-resolver` includes only PrimeVue components used in templates in the final bundle. Do not manually register all PrimeVue components globally.

```typescript
// vite.config.ts
Components({
  resolvers: [PrimeVueResolver()],
})
```

### 12.4 Minification

Use Terser for production minification. Drop `console.log` and `debugger` statements:

```typescript
// vite.config.ts → build
minify: 'terser',
terserOptions: {
  compress: {
    drop_console: true,
    drop_debugger: true,
  },
},
```

### 12.5 Compression

Enable gzip and Brotli compression via `vite-plugin-compression` or configure at the server level (nginx, Caddy, or the Go/Node.js backend):

```typescript
// If using vite-plugin-compression:
// npm install -D vite-plugin-compression
import compression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    compression({ algorithm: 'gzip' }),
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
  ],
})
```

Or configure at the reverse proxy / server level (recommended for production):

```nginx
# nginx.conf
gzip on;
gzip_types text/plain application/javascript application/json text/css image/svg+xml;
gzip_min_length 1024;

# Brotli (requires ngx_brotli module)
brotli on;
brotli_types text/plain application/javascript application/json text/css image/svg+xml;
```

### 12.6 Analyzing Bundle Size

```bash
# Generate a bundle visualization
npx vite-bundle-visualizer

# Or use rollup-plugin-visualizer
npm install -D rollup-plugin-visualizer
```

```typescript
// vite.config.ts (temporary, for analysis)
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    vue(),
    visualizer({ open: true, gzipSize: true }),
  ],
})
```

---

## Quick Reference: When to Use What

| Concern | Pattern | Example |
|---|---|---|
| Domain data (CRUD) | Composable (singleton or scoped) | `useResources()`, `useUsers()` |
| Global auth state | Pinia store | `useAuthStore` |
| Global notifications | Pinia store + SSE | `useNotificationStore` |
| Form state | Local `ref()` in component | `const form = ref({...})` |
| API calls | Axios service + composable | `api.get(...)` in composable |
| Real-time updates | Socket.io composable | `useWebSocket('chat')` |
| Streaming data | SSE composable | `useSSE('notifications')` |
| Dark mode | Singleton composable | `useDarkMode()` |
| Translations | vue-i18n `$t()` / `useI18n()` | `$t('common.save')` |
| UI components | PrimeVue (never raw HTML) | `<DataTable>`, `<Button>` |
| Styling | Tailwind utilities + PrimeVue tokens | `class="flex gap-4 p-4"` |
| Form handling | FormKit | `<FormKit type="form">` |
| Multi-theme | Singleton composable | `useTheme()` |
| SEO / page titles | Router afterEach hook | `document.title` |

---

> **Accessibility:** All components must follow the accessibility standard. See `standards/05-accessibility.md`.
