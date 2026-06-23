---
name: harness-build
description: Build orchestrator for the harness template — phases for scaffolding and developing enterprise Vue + Node/Go apps. Use when starting a new project, implementing features, or following the build lifecycle.
---

# Build Orchestrator

This skill orchestrates building enterprise-grade applications using the harness's template + skills/guides/standards. It tells you WHICH guides and standards to load at each phase.

---

## Core Principle

**ALWAYS start from `./template/public/`** — never scaffold from scratch. Copy the template into `./app/`, then follow the guides in order. This applies to BOTH frontend AND backend code. Never write backend code from scratch when the template server exists.

---

## The Template

| Template | Contents | Location |
|----------|----------|----------|
| **public** (only template) | Fullstack monorepo: Vue 3 + PrimeVue + Tailwind client, Express + TypeScript + Postgres server, e2e tests, root-level `install:all` / `dev:all` / `build` / `test` scripts | `./template/public/` |

Earlier harness revisions split this into `generic` + `goa-public`; the current single `public` template absorbed both lines and is the only sanctioned scaffold source.

**Auth model shipped with the template:** OAuth-only (Google / Microsoft SSO), composable-based auth on the client, httpOnly cookie + CSRF on the server. Role hierarchy lives in `server/src/middleware/authorize.ts` and the migrations CHECK constraints (`user_role_name` enum).

---

## Phase 1: Project Initialization

1. **Copy the template:** invoke `/build` (or `/build fullstack`). See the build skill's SKILL.md for the exact copy steps.
2. **Read:** `.claude/standards/01-architecture.md` (monorepo layout, layer separation).
3. **Read backend setup:** `.claude/guides/backend/nodejs/01-project-setup.md` (Node) or `.claude/guides/backend/golang/01-project-setup.md` (Go).
4. **Read frontend setup:** `.claude/guides/frontend/01-project-setup.md`.

---

## Phase 2: Core Development

Follow backend guides **sequentially** (01 through 08). Each builds on the previous:

| # | Guide | What It Does |
|---|-------|-------------|
| 01 | project-setup | Directory layout, dependencies, config, Makefile/scripts |
| 02 | security-middleware | Middleware chain (CORS, CSRF, rate limiting, headers) |
| 03 | authentication | JWT tokens, OAuth2, refresh rotation, account lockout |
| 04 | database | PostgreSQL patterns, migrations, soft deletes, audit logging |
| 05 | api-patterns | RESTful routes, controllers, pagination, error responses |
| 06 | realtime | WebSocket/SSE, LLM streaming, multi-provider abstraction |
| 07 | file-uploads | Magic byte validation, MIME allowlist, UUID rename, BYTEA storage |
| 08 | deployment | Docker, health probes, graceful shutdown, structured logging |

**Guide locations:**
- Node: `.claude/guides/backend/nodejs/{NN}-{name}.md`
- Go: `.claude/guides/backend/golang/{NN}-{name}.md`

Follow frontend guides (01 through 12) in parallel or after backend:

| # | Guide | What It Does |
|---|-------|-------------|
| 01 | project-setup | Vue 3 + Vite scaffolding, PrimeVue, Tailwind, FormKit |
| 02 | component-library | PrimeVue 4.x theme, auto-import, DataTable, FormKit |
| 03 | routing-navigation | Router guards, auth gates, lazy loading, redirect prevention |
| 04 | state-management | Composables, Pinia stores (auth, notifications) |
| 05 | realtime | WebSocket/SSE composables, streaming |
| 06 | vue-component-patterns | `<script setup>`, Composition API, canonical ordering |
| 07 | api-client-security | Axios, CSRF interceptor, token refresh queue |
| 08 | auth-session-management | Role hierarchy, idle timeout, SSO + credential login |
| 09 | theming-system | 5 themes, dark mode, CSS variables, chart palette |
| 10 | build-config | Vite optimization, chunk splitting, CSP, bundle analysis |
| 11 | security-testing | XSS, redirect, RBAC, session, leakage tests |
| 12 | pwa | Install/update prompts, service worker, offline precaching |

**Guide location:** `.claude/guides/frontend/{NN}-{name}.md`

### Cross-Check Standards During Development

For **every feature** you implement, cross-check against:

| Standard | When to Load | Location |
|----------|-------------|----------|
| 01-architecture | Setting up project structure, adding layers | `.claude/standards/01-architecture.md` |
| 02-security | Implementing auth, CSRF, rate limiting, validation | `.claude/standards/02-security.md` |
| 03-coding-conventions | Writing any code — naming, formatting, imports | `.claude/standards/03-coding-conventions.md` |
| 04-testing | Writing tests, coverage targets | `.claude/standards/04-testing.md` |
| 05-accessibility | Building UI components, forms, navigation | `.claude/standards/05-accessibility.md` |
| 06-pwa | PWA manifest, service worker, install/update | `.claude/standards/06-pwa.md` |

---

## Phase 3: Testing

Read `.claude/standards/04-testing.md`, then:
- Write unit tests alongside each feature (backend and frontend)
- Write integration tests for API endpoints
- Write E2E tests for critical user flows
- Coverage targets: backend 80%, frontend 70%, security-critical 90%

---

## Phase 4: Security Assessment

Run after the application has functional code. Use the `/blueteam`, `/redteam`, `/greenteam`, and `/yellowteam` skills.

---

## Backend Interchangeability

Both backend tracks (Node + Go) produce identical API contracts — the frontend works without modification regardless of backend choice:

| Contract | Both Implementations |
|----------|---------------------|
| JWT access token | RS256, 15-minute TTL |
| Refresh rotation | SHA-256 hashed, 7-day TTL |
| CSRF handshake | HMAC token in httpOnly cookie + response body |
| Error response | `{ success, error: { code, message, correlationId } }` |
| RBAC model | String roles, hierarchical, defined in `middleware/authorize.ts` |
| Health checks | `/health/live`, `/health/ready` |
| Rate limits | 200/15min general, 30/15min auth |

---

## Template Adaptation Checklist

After copying the template:

1. Replace mock data in `client/src/data/` with real API calls
2. Wire OAuth buttons to your backend's OAuth endpoints (`/api/auth/google`, `/api/auth/microsoft`)
3. Update `client/vite.config.ts` proxy target to your backend port
4. Replace placeholder contact details with real values
5. Extend the auth role hierarchy for your RBAC needs (`server/migrations/019_expand_role_check.sql`)
6. Replace placeholder PWA icons (`npx @vite-pwa/assets-generator`)
7. Remove unused views/components per Step 5 of the build skill

---

## Key Rules

1. **Guides are sequential** — follow 01 through 08 per backend, 01-12 for frontend
2. **Standards are cross-cutting** — reference throughout development, not just once
3. **Template is the starting point** — adapt it, never build from scratch
4. **Security by default** — OWASP ASVS Level 2 compliance is non-negotiable
5. **Parameterized SQL only** — no string interpolation in database queries, ever
6. **httpOnly cookies** — never store tokens in localStorage or sessionStorage
