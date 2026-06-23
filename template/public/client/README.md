# App Template

A production-ready Vue 3 application template demonstrating best-practice architecture, PrimeVue component integration, multi-theme support, PWA capabilities, and standards-compliant patterns for full-stack applications.

**Stack:** Vue 3.5 + TypeScript 5.7 (strict) + Vite 7 + PrimeVue 4 + Tailwind CSS v4 + FormKit + Chart.js + Leaflet

## Quick Start

```bash
npm install
npm run dev
```

## Features

- **5-Theme System** -- Light, Dark, Warm, Ocean, Forest with CSS custom property switching
- **PrimeVue 4.x** -- Enterprise components with auto-import, Aura preset, PassThrough overrides
- **FormKit** -- Production-ready forms with built-in validation
- **TypeScript** -- Strict mode throughout with proper type exports
- **Chart.js** -- Theme-aware visualizations with reactive color palettes
- **Leaflet Maps** -- Interactive maps with typed region markers
- **Pinia Stores** -- Auth store with JWT refresh rotation, RBAC (7-level role hierarchy), idle timeout (30 min)
- **Axios API Client** -- CSRF double-submit token handling, request queuing during refresh, X-Request-ID
- **DOMPurify** -- HTML sanitization with tag/attribute allowlist
- **PWA Support** -- Install prompt, update prompt, offline precaching via Workbox
- **Accessibility** -- Skip navigation, route-change announcer (ARIA live region), reduced motion support, PrimeVue ARIA
- **Security Testing** -- Dedicated test suite covering XSS, open redirect, RBAC, session, information leakage
- **Lazy Routes** -- Code-split pages with layout-per-route meta system
- **Error Handling** -- ErrorBoundary component with onErrorCaptured

## Project Structure

```
src/
├── assets/main.css            # Tailwind v4, PrimeVue overrides, 5 theme definitions
├── components/
│   ├── layout/                # AppNavbar (auth-aware), AppFooter, ThemeSwitcher
│   ├── pwa/                   # PwaInstallPrompt, PwaUpdatePrompt
│   ├── common/                # ErrorBoundary, LoadingSkeleton
│   └── explore/               # MapView (Leaflet)
├── composables/               # useTheme, usePwa, useNotifications, useFetch
├── data/                      # Demo data (orders, products, regions, dashboards, blog)
├── lib/                       # api.ts (Axios), sanitize.ts (DOMPurify), socket.ts, sse.ts
├── router/                    # TypeScript routes with auth guards, open redirect prevention
├── stores/                    # Pinia auth store (JWT, RBAC, idle timeout)
├── views/                     # 11 page components
└── formkit.config.ts          # FormKit validation config
tests/
├── unit/                      # 14 test files (208 passing tests)
│   ├── components/            # ErrorBoundary tests
│   ├── composables/           # useFetch, useTheme tests
│   ├── stores/                # Auth store tests (token refresh, RBAC, idle timeout)
│   ├── lib/                   # API client, sanitize tests
│   ├── router/                # Route guard tests
│   └── data/                  # Mock data validation tests
└── security/                  # Security posture checks
```

## Standards Compliance

This template targets compliance with the ai-skills standards:

| Standard | Status |
|----------|--------|
| TypeScript strict mode | Yes |
| PrimeVue for all UI | Yes |
| FormKit for forms | Yes |
| OWASP security patterns | Yes (CSRF, JWT refresh, RBAC, DOMPurify, open redirect prevention) |
| WCAG 2.1 AA accessibility | Yes (skip nav, route announcer, ARIA, reduced motion, contrast) |
| Vitest testing | Yes (208/208 tests passing) |
| PWA (vite-plugin-pwa) | Yes (install prompt, update prompt, offline precaching) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 5173 |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview production build |
| `npm run test:unit` | Run unit tests with Vitest |
| `npm run lint` | ESLint check |
| `npx vue-tsc --noEmit` | TypeScript type checking |

## Production Build Profile

```
Total: ~1.75 MB raw, ~330 KB gzipped (first load)
Vendor chunks: Vue (~39 KB gz), PrimeVue (~142 KB gz), Chart.js (~57 KB gz)
Lazy chunks load per-route. Initial payload is smaller as a result.
Service worker generated with Workbox precaching (43 entries).
```
