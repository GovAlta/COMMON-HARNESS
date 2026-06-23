# Skill: Build Configuration & Production Hardening

This skill covers the Vite build pipeline, TypeScript strictness, ESLint configuration, Content Security Policy, and production optimization patterns used in the template.

> **Note:** The base `vite.config.ts` setup (aliases, dev proxy, plugin registration) is covered in skill 01 (Project Setup). This skill covers **advanced** build optimizations only: chunk splitting strategy, compression, bundle analysis, and CI pipeline integration.

---

## 1. Vite Production Config

**File: `vite.config.ts`**

```ts
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
          'primevue': ['primevue'],
          'chartjs': ['chart.js', 'vue-chartjs'],
          'leaflet': ['leaflet', '@vue-leaflet/vue-leaflet'],
        },
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,    // Strip all console.* calls in production
        drop_debugger: true,   // Strip debugger statements in production
      },
    },
  },
})
```

### Key configuration points

- **`@tailwindcss/vite`**: Tailwind v4's official Vite plugin (replaces PostCSS-based setup from v3)
- **`unplugin-vue-components`** with `PrimeVueResolver`; auto-imports PrimeVue components without manual `import` statements, generating a `components.d.ts` file
- **`@` alias**: resolves to `./src` for clean imports like `@/composables/useTheme`
- **Dev proxy**: forwards `/api`, `/ws`, and `/sse` to the backend at `localhost:3000` during development
- **Terser minification**: chosen over default esbuild for `drop_console` and `drop_debugger` support

---

## 2. Manual Chunk Splitting

The `manualChunks` configuration splits large vendor libraries into separate cache-friendly chunks:

```ts
manualChunks: {
  'primevue': ['primevue'],                        // PrimeVue UI components
  'chartjs': ['chart.js', 'vue-chartjs'],          // Chart.js + Vue wrapper
  'leaflet': ['leaflet', '@vue-leaflet/vue-leaflet'], // Leaflet maps
}
```

### Why manual chunks matter

- **Cache efficiency**: Vendor libraries change rarely. Splitting them into dedicated chunks means users only re-download what changed.
- **Parallel loading**: The browser can fetch multiple smaller chunks in parallel instead of one large bundle.
- **Route-based loading**: Pages that don't use charts or maps won't load those chunks at all (when combined with dynamic imports).

### Adding a new vendor chunk

When adding a large dependency (e.g. `@tanstack/vue-query`), add it to `manualChunks`:

```ts
manualChunks: {
  'primevue': ['primevue'],
  'chartjs': ['chart.js', 'vue-chartjs'],
  'leaflet': ['leaflet', '@vue-leaflet/vue-leaflet'],
  'tanstack': ['@tanstack/vue-query'],  // new chunk
}
```

### Manual Chunk Splitting

Use Rollup `manualChunks` to separate vendor bundles by category for independent cache invalidation:

```typescript
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('node_modules')) {
          if (id.includes('primevue') || id.includes('@anthropic')) {
            return 'vendor-design-system';
          }
          if (id.includes('leaflet') || id.includes('chart')) {
            return 'vendor-maps'; // Heavy, only loaded on map/chart pages
          }
          if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router')) {
            return 'vendor-vue';
          }
          return 'vendor';
        }
      },
    },
  },
},
```

**Benefits:**
- Design system updates don't invalidate the Vue vendor cache
- Heavy libraries (maps, charts) are only loaded on pages that need them
- Each vendor category has independent cache lifetimes
- A change in any single dependency only invalidates its category's chunk

Without manual splitting, all vendor dependencies share one chunk; any dependency change invalidates the entire vendor cache.

---

## 3. Bundle Analysis with rollup-plugin-visualizer

To analyze bundle size, add the visualizer plugin:

```ts
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    Components({ resolvers: [PrimeVueResolver()] }),
    // Add visualizer: generates stats.html after build
    visualizer({
      open: true,          // Auto-open in browser after build
      filename: 'stats.html',
      gzipSize: true,      // Show gzipped sizes
      brotliSize: true,    // Show brotli sizes
    }),
  ],
  // ... rest of config
})
```

Run `npm run build` and a `stats.html` file will open showing a treemap of all chunks and their sizes.

---

## 4. CSP Meta Tag and Server Headers

**File: `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.tile.openstreetmap.org; connect-src 'self'; base-uri 'self'; form-action 'self';" />
    <!--
      Production security headers (must be set at the web server / CDN level):
        Content-Security-Policy: frame-ancestors 'none'  (cannot be set via meta tag)
        X-Content-Type-Options: nosniff
        X-Frame-Options: DENY
        Strict-Transport-Security: max-age=31536000; includeSubDomains
        Referrer-Policy: strict-origin-when-cross-origin
        Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
    -->
    <title>App Template</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Geist:wght@300;400;500;600;700&display=swap" rel="stylesheet" crossorigin="anonymous">
  </head>
  <body class="antialiased text-slate-600 bg-white">
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

### CSP directive breakdown

| Directive | Value | Purpose |
|-----------|-------|---------|
| `default-src` | `'self'` | Fallback; only allow resources from same origin |
| `script-src` | `'self'` | Only scripts from same origin (no inline, no eval) |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | Same-origin styles + inline (needed for Vue/PrimeVue) + Google Fonts CSS |
| `font-src` | `'self' https://fonts.gstatic.com` | Same-origin fonts + Google Fonts files |
| `img-src` | `'self' data: https://*.tile.openstreetmap.org` | Same-origin images + data URIs + OSM map tiles |
| `connect-src` | `'self'` | Only same-origin XHR/fetch/WebSocket |
| `base-uri` | `'self'` | Prevents `<base>` tag hijacking |
| `form-action` | `'self'` | Forms can only submit to same origin |

### Server-level headers (cannot be set via meta tag)

These must be configured at the web server (nginx, Caddy) or CDN (Cloudflare, Vercel) level:

```
Content-Security-Policy: frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

### Adjusting CSP for your app

- **If using an external API**: add the domain to `connect-src` (e.g. `connect-src 'self' https://api.example.com`)
- **If using WebSockets**: `connect-src` also covers `ws://` and `wss://`; add `wss://your-ws-server.com` if external
- **If embedding iframes**: add `frame-src` directive
- **If loading external images** (e.g. S3-hosted user avatars): add the domain to `img-src`

---

## 5. TypeScript Strict Configuration

**File: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "env.d.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### Key compiler options explained

| Option | Value | Why |
|--------|-------|-----|
| `target` | `ES2022` | Modern browsers; enables top-level await, class fields, etc. |
| `module` | `ESNext` | Use native ES modules (Vite handles bundling) |
| `moduleResolution` | `bundler` | New TS 5+ mode that understands Vite's resolution algorithm |
| `strict` | `true` | Enables all strict checks: `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, etc. |
| `noEmit` | `true` | TypeScript only type-checks; Vite/esbuild handles transpilation |
| `isolatedModules` | `true` | Required by esbuild; lets each file be transpiled independently |
| `verbatimModuleSyntax` | `true` | Enforces explicit `import type` for type-only imports. Prevents accidental runtime imports of types. |
| `allowImportingTsExtensions` | `true` | Allows `import './foo.ts'` syntax (with `noEmit`) |
| `skipLibCheck` | `true` | Skips type-checking `.d.ts` files for faster builds |
| `forceConsistentCasingInFileNames` | `true` | Prevents cross-platform bugs from case-insensitive imports |
| `resolveJsonModule` | `true` | Allows importing `.json` files with type safety |

### The `@/*` path alias

Maps to `src/*` so you can write `import Foo from '@/components/Foo.vue'` instead of relative paths. This alias must also be configured in `vite.config.ts`:

```ts
resolve: {
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
},
```

### Type declarations

- `vite/client`; types for `import.meta.env`, asset imports (`.svg`, `.png`), etc.
- `vitest/globals`; types for `describe`, `it`, `expect` without explicit imports

---

## 6. ESLint Configuration for Vue 3 + TypeScript

**File: `eslint.config.js`** (flat config format)

```js
import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default [
  // Base JS recommended rules
  js.configs.recommended,
  // TypeScript recommended rules
  ...ts.configs.recommended,
  // Vue 3 recommended rules (flat config format)
  ...vue.configs['flat/recommended'],

  // Vue-specific parser configuration
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,          // vue-eslint-parser handles <template>
      parserOptions: {
        parser: ts.parser,         // typescript-eslint handles <script lang="ts">
        sourceType: 'module',
      },
    },
  },

  // Custom rule overrides
  {
    rules: {
      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',

      // Vue
      'vue/multi-word-component-names': 'off',  // Allow single-word names like "Dashboard"
      'vue/no-v-html': 'off',                   // We use DOMPurify for sanitization

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
    },
  },

  // Ignored paths
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'components.d.ts'],
  },
]
```

### Key decisions

- **Flat config**: ESLint 9+ format; no `.eslintrc` file needed
- **Dual parser**: `vue-eslint-parser` parses `.vue` files, delegates `<script lang="ts">` blocks to `typescript-eslint`
- **`argsIgnorePattern: '^_'`**; Prefix unused function args with `_` to suppress errors (common pattern for event handlers)
- **`no-console: 'warn'`**; Allows `console.warn` and `console.error` but warns on `console.log` (which gets stripped by terser in production anyway)
- **`vue/no-v-html: 'off'`**; Disabled because the template uses DOMPurify for sanitization
- **`components.d.ts` ignored**: Auto-generated by `unplugin-vue-components`

---

## 7. Compression Plugin (gzip + brotli)

To serve pre-compressed assets, add `vite-plugin-compression`:

```bash
npm install -D vite-plugin-compression
```

```ts
import compression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    Components({ resolvers: [PrimeVueResolver()] }),
    // Gzip compression
    compression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024,       // Only compress files > 1KB
    }),
    // Brotli compression (better ratio, supported by all modern browsers)
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
    }),
  ],
  // ... rest of config
})
```

Your web server (nginx, Caddy, etc.) must be configured to serve `.br` or `.gz` files when the client sends `Accept-Encoding: br` or `Accept-Encoding: gzip`.

### Nginx example

```nginx
location /assets/ {
    gzip_static on;
    brotli_static on;    # requires ngx_brotli module
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

---

## 8. Environment Variable Usage Pattern

Vite exposes environment variables prefixed with `VITE_` through `import.meta.env`.

### Defining variables

Create `.env` files (never commit `.env.local`):

```bash
# .env: defaults, committed to repo
VITE_APP_TITLE=My App
VITE_API_BASE_URL=/api

# .env.local: local overrides, gitignored (rarely needed)
# VITE_API_BASE_URL=/api    # Relative path works in dev (Vite proxy) and production (same origin)

# .env.production: production values, committed
# No change needed: /api resolves naturally when client and server are same-origin
VITE_API_BASE_URL=/api
```

### Using variables in code

```ts
const apiBase = import.meta.env.VITE_API_BASE_URL
const appTitle = import.meta.env.VITE_APP_TITLE
const isDev = import.meta.env.DEV        // true in dev, false in production
const isProd = import.meta.env.PROD       // true in production, false in dev
const mode = import.meta.env.MODE         // 'development' | 'production' | custom
```

### Type safety for env variables

Create or update `env.d.ts` (already included in `tsconfig.json`):

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly VITE_API_BASE_URL: string
  // Add more VITE_* variables here
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

### Important rules

- Only variables prefixed with `VITE_` are exposed to client code. Variables without this prefix (e.g. `DATABASE_URL`) are **not** bundled and remain server-side only.
- Variables are statically replaced at build time; they are **not** available at runtime. `import.meta.env.VITE_FOO` becomes a string literal in the built output.
- Never put secrets in `VITE_*` variables; they will be visible in the client bundle.

---

## Production Build Checklist

1. Run `npm run build` and verify no TypeScript or ESLint errors
2. Check `dist/assets/` for expected chunk splitting (separate primevue, chartjs, leaflet chunks)
3. Verify no `console.log` calls in built output (terser `drop_console` should strip them)
4. Confirm CSP meta tag matches your deployment's required domains
5. Add server-level security headers (HSTS, X-Frame-Options, etc.)
6. Enable pre-compression (gzip + brotli) if your server supports it
7. Run `npx vite-bundle-visualizer` or add the visualizer plugin to audit bundle sizes
8. Test with Lighthouse; aim for 90+ on Performance and Best Practices
