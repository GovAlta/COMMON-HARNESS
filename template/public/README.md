# Application Template

**Full-stack template (Vue 3 + Express + Postgres) for production web applications**

> A vetted starter for building modern, secure, accessible web applications. Distributed inside the Claude Build Harness at `template/public/`; copied into your project's `app/` by the `/build` skill.

| | |
|---|---|
| **Frontend** | Vue 3, TypeScript, Vite, Pinia, Vue Router, PrimeVue |
| **Backend** | Express.js, TypeScript, PostgreSQL, Passport.js SSO, JWT |
| **Tests** | 773 passing (81 suites) -- 0 failures |
| **Security** | OWASP ASVS Level 2 aligned, 6 automated scanners |
| **Accessibility** | WCAG 2.1 AA |
| **Deployment** | Containerized (Docker); cloud-agnostic (Azure / AWS / GCP), GitHub Actions CI/CD |

---

## Table of Contents

- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Environment Variables](#environment-variables)
- [Scripts Reference](#scripts-reference)
- [Database](#database)
- [Testing](#testing)
- [Security](#security)
- [Accessibility](#accessibility)
- [Deployment](#deployment)
- [Customizing This Template](#customizing-this-template)
- [Standards and Skills](#standards-and-skills)
- [License](#license)

---

## Quick Start

### Prerequisites

- **Node.js 18+**: runtime for both client and server.
- **PostgreSQL 14+**: required. The server will not start without a reachable database. Local Postgres via Docker, Homebrew, or [Postgres.app](https://postgresapp.com/) is fine; managed Postgres (Render, Supabase, AWS RDS, Azure Database for PostgreSQL, GCP Cloud SQL) works in any environment.
- **npm 9+**
- **At least one OAuth identity provider**: Google or Microsoft (Entra ID). Users cannot sign in until one is configured. If you skip this in dev, public read paths still work but anything behind auth is unreachable.

### 1. Clone and install

The template ships inside the harness repo, at `template/public/`. The `/build` skill copies it into your project's `app/` for you. To work with it directly:

```bash
git clone https://github.com/<org>/<harness-repo>.git <your-project>
cd <your-project>
npm run install:all                       # installs root + client + server deps
# OR, after /build has copied the template into ./app/:
cd app && npm run install:all
```

Replace `<your-project>` with whatever you want to call the resulting application repo.

### 2. Configure environment

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env   # only if you need to override defaults
```

Edit `server/.env` and set:
- `DATABASE_URL`: Postgres connection string. Format: `postgresql://user:PASSWORD@host:5432/dbname`. For local dev, create the DB first: `createdb myapp_dev`.
- **OAuth credentials** (at least one provider):
  - **Google**: register an OAuth 2.0 client at the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`.
  - **Microsoft**: register an app at the [Microsoft Entra ID admin center](https://entra.microsoft.com/) (App registrations, New registration) and set `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET` + `MICROSOFT_TENANT_ID`.
  - The redirect URI to register at the provider is `${API_BASE_URL}/api/v1/auth/{provider}/callback` (e.g., `http://localhost:3000/api/v1/auth/google/callback` for dev).
- `CSRF_SECRET`: any random string of at least 32 chars. Generate with `openssl rand -hex 32`.
- `AI_API_KEY`: only required if you keep the AI Chat phase (Phase 8); leave blank otherwise.

See [Environment Variables](#environment-variables) for the full reference.

### 3. Generate RSA keys for JWT signing

```bash
npm run generate-keys             # Creates RSA-2048 key pairs in server/keys/
npm run generate-keys -- --check  # Verify keys are valid
```

Keys are stored locally in `server/keys/` (gitignored, never committed). For production, inject PEM strings via env vars from a secrets manager. See [Key Management](#key-management).

### 4. Set up the database

```bash
npm run db:migrate    # applies all NNN_*.sql files in server/migrations/
npm run db:seed       # optional; populates sample data for dev
```

`db:migrate` is idempotent and safe to re-run. It tracks applied migrations in a `schema_migration` table. The migration runner refuses to start if `DATABASE_URL` is unreachable, so a failed migrate is your first signal that the DB is misconfigured.

### 5. Start development servers

```bash
npm run dev:all
```

This starts the Express API server and Vite dev server concurrently. The client proxies API requests to the backend automatically.

### 6. Verify

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`
- Liveness probe: `http://localhost:3000/health/liveness` (returns 200 always)
- Readiness probe: `http://localhost:3000/health/readiness` (returns 200 only if DB reachable; 503 otherwise). A passing readiness probe confirms migrations and DB config are good.

---

## Project Structure

```
<your-project>/                 (or app/, if scaffolded by /build inside the harness)
├── client/                     Vue 3 + Vite frontend
│   ├── src/
│   │   ├── components/         UI components organized by domain
│   │   │   ├── admin/            Admin dashboard widgets
│   │   │   ├── ai/               AI chat assistant
│   │   │   ├── common/           Shared/reusable components
│   │   │   ├── forms/            Digital form builder and renderer
│   │   │   ├── landing/          Landing page sections
│   │   │   ├── map/              Leaflet map and location components
│   │   │   ├── notification/     Notification UI and subscriptions
│   │   │   ├── resource/         Resource management views
│   │   │   └── services/         Service catalogue components
│   │   ├── composables/        Vue composition functions
│   │   ├── layouts/            Page layout wrappers
│   │   ├── pages/              Route-level page components
│   │   │   ├── admin/            Admin pages
│   │   │   ├── auth/             Login, callback, logout
│   │   │   ├── public/           Public-facing pages (+ DesignPage.vue at /design)
│   │   │   └── user/             Authenticated user pages
│   │   ├── router/             Vue Router configuration and guards
│   │   ├── services/           API client modules
│   │   ├── stores/             Pinia state management
│   │   ├── types/              TypeScript type definitions
│   │   └── utils/              Client-side utility functions
│   └── public/                 Static assets
├── server/                     Express.js + TypeScript backend
│   ├── src/
│   │   ├── config/             App configuration and env validation
│   │   ├── controllers/        Route handlers
│   │   ├── middleware/         Auth, CSRF, rate limiting, validation
│   │   ├── models/             Database access layer
│   │   ├── routes/             Express route definitions
│   │   ├── services/           Business logic layer
│   │   ├── utils/              Server-side utilities
│   │   ├── validators/         Zod validation schemas
│   │   └── websocket/          Socket.io event handlers
│   ├── migrations/             PostgreSQL migration files (19 active + 1 opt-in .example)
│   └── seeds/                  Sample data SQL files
├── security/                   Security assessment scripts and reports
├── docs/                       Feature documentation
├── skills/                     Implementation guides for AI workers
├── standards/                  Code standards and conventions
├── .env.example                Environment variable template
├── package.json                Root workspace scripts
└── README.md
```

---

## Features

The template ships with 13 feature phases, each production-ready and fully tested.

### Phase 1 -- Health Checks

Kubernetes-compatible liveness and readiness probes at `/health/liveness` and `/health/readiness`. The readiness probe verifies database connectivity before reporting healthy.

### Phase 2 -- Authentication

- **Google OAuth 2.0** and **Microsoft OIDC** single sign-on via Passport.js
- JWT access tokens (15 min) stored in httpOnly secure cookies
- Refresh token rotation (7-day expiry) with automatic revocation of old tokens
- No tokens in localStorage -- cookies only
- Role-based access control (user/admin)

### Phase 3 -- Resource Management

Full CRUD for resources with categories and tags, plus a revision history. Includes server-side pagination, full-text search, and filtering.

### Phase 4 -- Service Catalogue

Browse and manage services organized by searchable categories.

### Phase 5 -- Service Locations with Map

Interactive Leaflet map with marker clustering and browser geolocation. Search and filter office/service locations geographically.

### Phase 6 -- Digital Forms

JSON Schema-driven forms rendered with FormKit, supporting a draft/submit/retract workflow and file attachments with secure upload handling.

### Phase 7 -- Notifications

Real-time notification delivery via Server-Sent Events (SSE), with user-managed subscriptions and admin broadcast.

### Phase 8 -- AI Chat Assistant

Streaming AI responses over WebSocket (Socket.io). Supports image analysis (base64), conversation history, and configurable AI provider/model via environment variables.

### Phase 9 -- Admin Panel

Full-width admin panel with persistent sidebar navigation. Includes:

- **Dashboard** -- Statistics overview with charts, quick actions, and broadcast form
- **Manage Resources** -- Full CRUD with View/Edit tabs. Create, edit all metadata (title, category, status, region, author, tags, summary, content), and add resource updates (revisions, corrections, supplements)
- **Manage Services** -- Full CRUD for the service catalogue. Create and edit services with category assignment, descriptions, eligibility, how-to-apply, required documents, and contact information. Changes reflect on the public service catalogue and map
- **Manage Forms** -- Create and edit JSON Schema form definitions with an inline schema editor. Toggle publish status
- **Process Submissions** -- View all user submissions across forms, filter by status/date, and update submission status through the workflow (submitted, in-review, approved, rejected, completed)
- **Notifications** -- Broadcast real-time notifications to ALL active users via SSE. View broadcast history. Users receive toast popups instantly and see notifications in their `/notifications` page

Admin role is assigned via CLI:
```bash
npm run set-role -- user@example.com admin
```
User must log out and back in after role change.

### Phase 10 -- Landing Page

Aggregated data display, emergency notice banners, and quick-link navigation.

### Phase 11 -- Audit Trail

Every data mutation is logged to the `audit_log` table with: user ID, IP address, user agent, action type, and full old/new data snapshots.

### Phase 12 -- Accessibility & Design System Compliance

WCAG 2.1 AA compliance achieved through the PrimeVue component library plus semantic HTML conventions. The template uses standard PrimeVue components throughout:

- **Navigation**: PrimeVue `Menubar` / `Menu` for responsive desktop/mobile nav with user account dropdown
- **Layout**: `Sidebar` and `Panel` for admin layouts, plus container and divider components
- **Forms**: `InputText`, `Dropdown`, `Textarea`, `Calendar`, `Checkbox`, `RadioButton`
- **Data display**: `DataTable`, `Tag`, `TabView`, `Accordion`, `Paginator`
- **Feedback**: `Message`, `Toast`, `Dialog`, `ProgressSpinner`
- **Actions**: `Button`, `SplitButton`, icon buttons, `OverlayPanel`
- **Theming**: centralized CSS custom properties for color and spacing tokens plus typography tokens
- **Reference page**: Visit `/design` to see all components demonstrated in a single page

Custom HTML elements (`<input>`, `<select>`, `<button>`, `<table>`) have been replaced with their PrimeVue equivalents across all pages.

### Phase 13 -- Security Hardening

Comprehensive security controls across all layers. See the full [Security](#security) section below.

---

## Technology Stack

### Frontend

| Package | Purpose |
|---|---|
| Vue 3 | UI framework (Composition API) |
| TypeScript | Type safety |
| Vite | Build tooling and dev server |
| Pinia | State management |
| Vue Router | Client-side routing with navigation guards |
| PrimeVue | UI component library (WCAG 2.1 AA aligned) |
| FormKit | JSON Schema-driven form rendering |
| Leaflet | Interactive maps with marker clustering |
| Socket.io (client) | WebSocket for AI chat streaming |
| DOMPurify | HTML sanitization for rendered content |
| marked | Markdown parsing |

### Backend

| Package | Purpose |
|---|---|
| Express.js | HTTP server framework |
| TypeScript | Type safety |
| pg (node-postgres) | PostgreSQL client with parameterized queries |
| Passport.js | Google OAuth 2.0 and Microsoft OIDC |
| jsonwebtoken | JWT signing (RS256 asymmetric, RSA-2048) |
| Socket.io | WebSocket server for AI streaming |
| Winston | Structured logging |
| Zod | Request validation schemas |
| Helmet | Security headers (CSP, HSTS, etc.) |
| compression | gzip/brotli response compression |
| multer | Multipart file upload handling |

### Testing

| Package | Purpose |
|---|---|
| Vitest | Test runner and assertions |
| Vue Test Utils | Vue component testing |
| Supertest | HTTP integration testing for Express |
| happy-dom | Lightweight DOM for component tests |

---

## Environment Variables

Copy `.env.example` to `.env` and configure the following values.

### Server Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | Server listening port |
| `NODE_ENV` | No | `development` | Environment mode (`development` or `production`) |
| `DATABASE_URL` | Yes | -- | PostgreSQL connection string (e.g., `postgresql://<user>:<password>@localhost:5432/hyper`) |
| `CORS_ORIGIN` | Yes | -- | Allowed origins, comma-separated for multiple (e.g., `http://localhost:5173,https://app.example.com`) |
| `JWT_PRIVATE_KEY` | No* | -- | RSA private key PEM for access token signing (production via secrets manager) |
| `JWT_PUBLIC_KEY` | No* | -- | RSA public key PEM for access token verification (production via secrets manager) |
| `JWT_REFRESH_PRIVATE_KEY` | No* | -- | RSA private key PEM for refresh token signing (production via secrets manager) |
| `JWT_REFRESH_PUBLIC_KEY` | No* | -- | RSA public key PEM for refresh token verification (production via secrets manager) |
| `SERVE_CLIENT` | No | `false` | Serve built Vue client from Express in production |
| `BODY_LIMIT_JSON` | No | `1mb` | Max JSON request body size |
| `BODY_LIMIT_URLENCODED` | No | `1mb` | Max URL-encoded body size |

### File Upload Extension Points

The template ships pluggable adapters so deployments can swap the malware scanner and the file backend without touching the upload route. Defaults are safe-out-of-the-box but flagged as risk-accepted in `.ai/data/risk_acceptances.json` (RA-FS-001 + RA-FS-002). Replace them before going to production with user uploads or sensitive data.

| Variable | Default | Description |
|---|---|---|
| `FILE_SCANNER` | `noop` | Malware scanner adapter. `noop` accepts everything (DEV ONLY). Wire in `clamav`/`defender`/`custom` adapters in `server/src/services/file-scanner.ts`; see the file header for the contract. |
| `FILE_STORE` | `database` | Storage backend adapter. `database` writes to Postgres BYTEA (covered by `pg_dump`). Implement `sharepoint`/`azure-blob`/`s3` adapters in `server/src/services/file-store.ts` when scaling beyond BYTEA. |

### Sensitive-Data Encryption (opt-in)

| Variable | Required | Description |
|---|---|---|
| `PGCRYPTO_DATA_KEY` | Only if migration `020_optional_pgcrypto.sql.example` is enabled | 256-bit base64 key for column-level encryption of `form_submission.submission_data`. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and store in your secrets manager. Required when the deployment processes sensitive data (e.g., personal health, government IDs, financial, medical). See `docs/dr/sensitive-data-encryption.md` for the full procedure. |

### Authentication

**At least one OAuth provider must be configured** for any user to sign in (the public read surface still works without one). You can wire both; the login page surfaces a button per configured provider.

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | If using Google SSO | Google OAuth 2.0 client ID. Get one at [Google Cloud Console, Credentials](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | If using Google SSO | Google OAuth 2.0 client secret (from the same console) |
| `MICROSOFT_CLIENT_ID` | If using Microsoft SSO | Microsoft Entra ID application (client) ID. Register an app at [Entra admin center, App registrations](https://entra.microsoft.com/) |
| `MICROSOFT_CLIENT_SECRET` | If using Microsoft SSO | Microsoft Entra ID client secret (from the app registration, Certificates & secrets) |
| `MICROSOFT_TENANT_ID` | If using Microsoft SSO | **Single-tenant GUID required**. Multi-tenant values (`common`, `organizations`, `consumers`) are REJECTED in production by `environment.ts` because they let ANY Microsoft account in the world authenticate. The OIDC callback also verifies the `tid` claim matches this value, so tokens from other tenants are rejected even when the signature passes. |

**OAuth redirect URIs to register at the provider:**
- Google: `${API_BASE_URL}/api/v1/auth/google/callback`
- Microsoft: `${API_BASE_URL}/api/v1/auth/microsoft/callback`

(Replace `${API_BASE_URL}` with your dev or prod URL, e.g., `http://localhost:3000` for dev.)

### AI Chat

| Variable | Required | Default | Description |
|---|---|---|---|
| `AI_PROVIDER` | No | -- | AI service provider (e.g., `openai`, `anthropic`, `google`) |
| `AI_API_KEY` | No | -- | API key for the AI provider |
| `AI_MODEL` | No | -- | Model identifier (e.g., `gpt-4`) |
| `AI_MAX_TOKENS` | No | `1024` | Maximum tokens per AI response |

### Rate Limiting

All rate limits are configurable. Defaults are tuned for typical production application traffic.

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_API` | `200` | General API requests per 15-minute window |
| `RATE_LIMIT_AUTH` | `30` | Auth endpoint requests per 15-minute window |
| `RATE_LIMIT_AI` | `60` | AI endpoint requests per hour |

### Client

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | API URL used by the Vite dev server proxy |
| `API_BASE_URL` | No | API base URL used at runtime |

> **JWT keys:** In development, RSA key files in `server/keys/` are used automatically. In production, inject PEM strings via `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, etc. from your secrets manager. See [Key Management](#key-management).

---

## Scripts Reference

All scripts are run from the project root.

| Script | Description |
|---|---|
| `npm run install:all` | Install dependencies for the root workspace plus client and server |
| `npm run dev:all` | Start both client and server in development mode (concurrently) |
| `npm run dev:server` | Start only the Express server in watch mode |
| `npm run dev:client` | Start only the Vite dev server |
| `npm run build` | Build both client and server for production |
| `npm run start` | Start the production server |
| `npm run test` | Run all tests (server + client) |
| `npm run test:server` | Run server tests only |
| `npm run test:client` | Run client tests only |
| `npm run db:migrate` | Run all pending database migrations |
| `npm run db:rollback` | Roll back the last migration batch |
| `npm run db:seed` | Seed the database with sample data |
| `npm run set-role -- <email> <role>` | Set a user's role (admin or user) |
| `npm run generate-keys` | Generate RSA-2048 key pairs for JWT signing |
| `npm run generate-keys -- --check` | Verify existing keys are valid |
| `npm run generate-keys -- --env` | Output keys as env var format for production |
| `./scripts/backup.sh` | Snapshot the DB to a compressed `pg_dump` (custom format). Designed for cron; see `docs/dr/RTO-RPO.md`. Env: `DATABASE_URL`, `BACKUP_DIR` (default `./backups`), `BACKUP_RETAIN` (default 7). |
| `./scripts/restore.sh <dump-file>` | **Destructive**. Drops and restores the target schema. Refuses to run against a `DATABASE_URL` containing `prod` unless `ALLOW_PROD_RESTORE=true`. Use for DR drills and recovery. |

---

## Disaster Recovery

See `docs/dr/RTO-RPO.md` for the full RTO/RPO discussion + operational pattern (cron schedule, off-host storage, quarterly restore drills). Template defaults:

| Target | Value | Upgrade trigger |
|---|---|---|
| RTO | 4 hours | Tighten to ≤ 1 hr when processing sensitive data (requires managed PITR or replica) |
| RPO | 24 hours (daily `backup.sh` cron) | Tighten to ≤ 15 min by enabling continuous WAL archiving on managed Postgres |

When the application starts processing sensitive data, also enable the column-level encryption migration. See `docs/dr/sensitive-data-encryption.md`.

---

## Database

### Overview

PostgreSQL with 19 sequential migration files managing the full schema (plus 1 opt-in `.sql.example` for sensitive-data column-level encryption). All tables follow consistent conventions:

- **UUID primary keys** generated by the database
- **Timestamps** (`created_at`, `updated_at`) with automatic trigger-based `updated_at` updates
- **Soft deletes** where appropriate
- **JSONB columns** for flexible structured data (form schemas, submission data, metadata)
- **Indexes** on foreign keys and frequently queried columns

### Tables

| Table | Purpose |
|---|---|
| `user_account` | User profiles populated from SSO providers |
| `refresh_token` | JWT refresh tokens with rotation tracking |
| `audit_log` | Immutable audit trail for all data mutations |
| `resource_item` | Managed resources (guides, announcements, policies, bulletins) |
| `resource_update` | Version/update history for resources |
| `service_category` | Taxonomy for the service catalogue |
| `service_catalogue` | Service listings |
| `service_location` | Geolocated service points with coordinates |
| `form_definition` | JSON Schema form templates |
| `form_submission` | User form submissions (draft/submitted/retracted) |
| `file_attachment` | Uploaded file metadata and references |
| `notification_subscription` | User notification preferences |
| `notification_message` | Notification content |
| `notification_delivery` | Per-user delivery and read tracking |
| `ai_conversation` | AI chat session metadata |
| `ai_message` | Individual AI chat messages |

### Migration Commands

```bash
# Apply all pending migrations
npm run db:migrate

# Roll back the last batch
npm run db:rollback

# Load sample data
npm run db:seed
```

---

## Testing

### Results Summary

| Scope | Suites | Tests | Failures |
|---|---|---|---|
| Server | 37 | 365 | 0 |
| Client | 44 | 410 | 0 |
| **Total** | **81** | **773** | **0** |

### Running Tests

```bash
# Run all tests
npm run test

# Server tests only (Supertest + Vitest)
npm run test:server

# Client tests only (Vue Test Utils + happy-dom + Vitest)
npm run test:client
```

### Test Coverage

**Server tests** cover:
- All controllers and route handlers
- Middleware chains (authentication, CSRF, rate limiting, validation)
- Database models and query functions
- Service/business logic layer
- WebSocket handlers for AI chat streaming
- Error handling and edge cases
- Health probe endpoints
- Validators (Zod schemas)

**Client tests** cover:
- All Vue component rendering and interactions
- Pinia store actions and getters
- Composable behavior (useApi, useAuth, useMap, useSSE, useForm, useAiChat, etc.)
- Router navigation guards
- Form validation logic
- User interaction flows across all feature areas

---

## Security

This template implements a defense-in-depth security architecture aligned with **OWASP ASVS Level 2**. Six automated security scanners are included in the `/security/` directory. All 14 ASVS chapters have been evaluated and are passing.

### Authentication and Session Management

| Control | Implementation |
|---|---|
| Token storage | JWT in httpOnly, secure, sameSite=lax cookies -- never in localStorage |
| Access token lifetime | 15 minutes |
| Refresh token lifetime | 7 days with rotation (old token revoked on each refresh) |
| Algorithm pinning | RS256 enforced in both `jwt.sign()` and `jwt.verify()` |
| OAuth state parameter | CSRF protection on all SSO initiation flows |
| Microsoft tenant validation | `MICROSOFT_TENANT_ID` must be a single-tenant GUID in production (multi-tenant `common`/`organizations`/`consumers` rejected by `environment.ts`); OIDC callback verifies the `tid` claim matches the configured tenant |
| Role hierarchy | 6-tier (`viewer` → `super_admin`); DB CHECK constraint aligned via migration `019_expand_role_check.sql`; legacy `'user'` value aliased to `'viewer'` in `middleware/authorize.ts` |

### Cross-Site Request Forgery (CSRF)

Double-submit cookie pattern validated with `crypto.timingSafeEqual()` to prevent timing-based attacks. The middleware is **mounted globally** on `/api/v1` + `/api` in `server/src/app.ts` so newly-added state-changing routes are protected by default. Any opt-out requires an explicit exemption.

| Aspect | Detail |
|---|---|
| Default | Applied to every POST/PUT/PATCH/DELETE under `/api/v1/*` and `/api/*` |
| Explicit exemptions (each documented in `middleware/csrf.ts -> CSRF_EXEMPT_PATHS`) | `POST /api/auth/google`, `POST /api/auth/microsoft` (OAuth init, no session to forge); the matching `/callback` routes (state cookie + nonce protect); `POST /api/auth/refresh` (refresh-token cookie + SameSite=Lax + rotation defend). |
| GET / HEAD / OPTIONS | Auto-exempt (HTTP-safe, no state change) |
| Bearer-only routes | If/when you add an API namespace that authenticates exclusively via `Authorization: Bearer <token>` (no cookie auth), add a documented exemption regex. CSRF attacks need cookie auto-submit, which Bearer tokens never get. |

Adding a new exemption is a security-relevant change reviewable in PR; the per-route `csrf` middleware that exists in individual routers is retained as belt-and-braces (running it twice on the same request is harmless).

### Cross-Site Scripting (XSS)

- **DOMPurify** sanitizes all `v-html` rendered content
- Vue's default auto-escaping for all template interpolation
- **Content Security Policy** enforced via Helmet with no `unsafe-eval`

### Injection Prevention

- All **157+ SQL query patterns** use parameterized queries -- zero string concatenation
- **Zod validation schemas** on every API endpoint
- Input length and type constraints enforced server-side

### HTTP Security Headers (Helmet)

| Header | Configuration |
|---|---|
| Content-Security-Policy | Strict policy, no `unsafe-eval` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains; preload` (1 year) |
| X-Frame-Options | Deny/SameOrigin |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera, microphone, geolocation, payment all disabled |

### Rate Limiting

Three tiers, all configurable via environment variables:

| Tier | Default Limit | Window |
|---|---|---|
| General API | 200 requests | 15 minutes |
| Authentication | 30 requests | 15 minutes |
| AI endpoints | 60 requests | 1 hour |

All 429 responses include a `Retry-After` header (in seconds) per RFC 6585. Content-Type validation rejects unexpected types with 415 Unsupported Media Type.

### File Upload Security

- **Magic byte validation** -- inspects actual file content, not just the extension
- **MIME type allowlist:** JPEG, PNG, WEBP, PDF only
- Files renamed to **UUID** on disk to prevent path traversal
- **10 MB** maximum file size
- **Malware scanning** via the pluggable `FileScanner` adapter. Default is no-op (RA-FS-001); wire in `clamav` / `defender` / custom adapter via `FILE_SCANNER` env var. See `server/src/services/file-scanner.ts` for the contract.
- **Storage backend** via the pluggable `FileStore` adapter. Default is Postgres BYTEA (RA-FS-002); swap to `sharepoint` / `azure-blob` / `s3` adapters via `FILE_STORE` env var. See `server/src/services/file-store.ts`.

Risk acceptances RA-FS-001 (no-op scanner) and RA-FS-002 (BYTEA storage) live in `.ai/data/risk_acceptances.json`. **Retire them before production if the app accepts user uploads** by wiring real adapters.

### WebSocket Security

- JWT authentication required on connection handshake
- Origin header validation
- Base64 image payload size limits for AI image analysis

### AI Safety

System prompt guardrails to mitigate prompt injection attacks.

### Open Redirect Prevention

`safeRedirect()` utility validates all redirect paths start with `/` and do not start with `//`. This blocks open redirect attacks on login flows.

### CORS

Multi-origin support via comma-separated `CORS_ORIGIN` environment variable with strict validation against the allowlist.

### Additional Security Controls

| Control | Detail |
|---|---|
| Response compression | gzip and brotli on all responses (SSE streams excluded to prevent buffering) |
| Error sanitization | Production errors return generic messages; no stack traces to clients |
| Process error handlers | `unhandledRejection` and `uncaughtException` caught and logged via Winston |
| Environment validation | Zod validates all env vars at startup; rejects placeholder secrets in production |
| Trust proxy | Configured for cloud load balancer X-Forwarded-For headers |
| Graceful shutdown | SIGTERM/SIGINT triggers ordered teardown: WebSocket -> HTTP server -> DB pool |
| Audit logging | Every mutation recorded with user ID, IP address, user agent, old/new data snapshots |

### Security Assessment

The `/security/` directory contains six automated scanner scripts and their reports. The assessment covers all 14 OWASP ASVS chapters with a target of Level 2 compliance. Run the scanners to verify security posture:

```bash
cd security/
# See individual scanner scripts for usage
```

---

## Accessibility

Accessibility is built into the template at every layer:

- **PrimeVue** ships WCAG 2.1 AA-aligned components out of the box
- **Skip navigation** links on all pages
- **Semantic HTML** structure throughout (landmarks, headings hierarchy, lists)
- **ARIA attributes** on interactive elements, dynamic content regions, and status updates
- **Keyboard navigation** support for all interactive features, including the Leaflet map

---

## Key Management

JWT tokens use RS256 (asymmetric RSA-2048) signing. Separate key pairs for access tokens and refresh tokens.

### Development

```bash
npm run generate-keys             # Generate 4 PEM files in server/keys/
npm run generate-keys -- --check  # Verify keys work (sign + verify roundtrip)
```

Keys are stored in `server/keys/` (gitignored). The app reads them automatically at startup.

### Production (secrets manager / Key Vault)

1. Generate keys locally:
   ```bash
   npm run generate-keys
   ```

2. Upload to your secrets manager (Azure Key Vault, AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault, etc.). Example for Azure Key Vault:
   ```bash
   az keyvault secret set --vault-name <vault-name> --name jwt-private-key --file server/keys/jwt-private.pem
   az keyvault secret set --vault-name <vault-name> --name jwt-public-key --file server/keys/jwt-public.pem
   az keyvault secret set --vault-name <vault-name> --name jwt-refresh-private-key --file server/keys/jwt-refresh-private.pem
   az keyvault secret set --vault-name <vault-name> --name jwt-refresh-public-key --file server/keys/jwt-refresh-public.pem
   ```

3. Inject the secrets into the runtime as env vars `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_REFRESH_PRIVATE_KEY`, `JWT_REFRESH_PUBLIC_KEY` using your platform's secret-reference mechanism.

4. Grant the runtime identity (managed identity / service account) read access to those secrets.

### Key Rotation

1. Generate new key pairs: delete `server/keys/` and run `npm run generate-keys`
2. Upload new keys to your secrets manager (new versions of existing secrets)
3. Restart the service to pick up new keys
4. Existing tokens signed with old keys will fail verification and users re-authenticate (15-minute access token expiry means natural rollover)

### GitHub Actions CI/CD

In your workflow, inject secrets-manager values as environment variables. Example for Azure Key Vault:
```yaml
- uses: azure/login@v2
  with: { creds: '${{ secrets.AZURE_CREDENTIALS }}' }
- run: |
    JWT_PRIVATE_KEY=$(az keyvault secret show --vault-name $VAULT --name jwt-private-key --query value -o tsv)
    echo "JWT_PRIVATE_KEY<<EOF" >> $GITHUB_ENV
    echo "$JWT_PRIVATE_KEY" >> $GITHUB_ENV
    echo "EOF" >> $GITHUB_ENV
```

---

## API Versioning

All API routes are mounted under `/api/v1/` with a backward-compatible alias at `/api/`:

```
/api/v1/resources     (versioned - preferred)
/api/resources        (alias - backward compatible)
```

When breaking changes are needed, add new routes under `/api/v2/` without disrupting existing clients. The unversioned `/api/` alias always points to v1.

---

## Operational Constraints

These items are deployment decisions, not template code. Document and address before production:

| Item | Status | Notes |
|------|--------|-------|
| **Rate limiter store** | Memory (single-instance) | Replace with `rate-limit-redis` for horizontal scaling. Currently works for single-instance deployments. |
| **JWT algorithm** | RS256 (asymmetric) | RSA-2048 key pairs with issuer/audience claim validation. Public key can be shared with microservices for token verification without exposing signing capability. |
| **AI data residency** | External LLM providers | Choose an `AI_PROVIDER` whose data residency matches your regulatory needs. Implement PII scrubbing before sending to external APIs if required. Data processing agreements needed with each provider. |
| **Load testing** | Not included | Run load tests (k6, Artillery) against staging before production launch. Establish baseline for concurrent users and response times. |
| **Backup/DR** | Cloud-managed | Managed Postgres services typically include automated backups. Define RPO/RTO. File uploads are in PostgreSQL BYTEA (included in DB backups, not local disk). |
| **Independent pen test** | Recommended | This template's self-assessment should be validated by an independent security firm before processing sensitive data. |

---

## Deployment

### Target Environment

The template is cloud-agnostic and ships with a multi-stage Dockerfile. Common deployment targets:

| Component | Examples |
|---|---|
| Compute | Container runtime (Cloud Run, AWS ECS/EKS, Azure App Service / Container Apps, Kubernetes) |
| Database | Managed Postgres (AWS RDS, Azure Database for PostgreSQL, GCP Cloud SQL, Supabase, Neon) |
| Secrets | Secrets manager (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, HashiCorp Vault) |
| CI/CD | GitHub Actions |

### Health Probes

Configure your container orchestrator's health probes to target these endpoints:

| Probe | Endpoint | Purpose |
|---|---|---|
| Liveness | `GET /health/liveness` | Confirms the process is running |
| Readiness | `GET /health/readiness` | Confirms the app can serve requests (database connected) |

### Production Build and Start

```bash
npm run build
npm run start
```

In production with `SERVE_CLIENT=true`, the Express server serves the built Vue client directly.

### Production Deployment Checklist

**Secrets (secrets manager):**
- [ ] Generate RSA key pairs: `npm run generate-keys`
- [ ] Upload keys to your secrets manager (4 keys: `jwt-private-key`, `jwt-public-key`, `jwt-refresh-private-key`, `jwt-refresh-public-key`)
- [ ] Map secrets to runtime env vars: `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_REFRESH_PRIVATE_KEY`, `JWT_REFRESH_PUBLIC_KEY`
- [ ] Store `DATABASE_URL`
- [ ] Store `GOOGLE_CLIENT_SECRET`
- [ ] Store `MICROSOFT_CLIENT_SECRET` (if used)
- [ ] Store `AI_API_KEY`

**Configuration:**
- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGIN` to production domain(s), comma-separated
- [ ] Set `API_BASE_URL` to production URL (for OAuth callbacks)
- [ ] Register OAuth redirect URIs with Google/Microsoft for production domain

**Infrastructure:**
- [ ] Configure health probes: `/health/liveness` and `/health/readiness`
- [ ] Put a WAF in front of the public endpoint
- [ ] Enable platform-level DDoS protection
- [ ] Enforce database SSL (`sslmode=verify-full`)
- [ ] Ship Winston JSON logs to a centralised log store
- [ ] Enable HTTPS-only / TLS termination at the load balancer

**CI/CD:**
- [ ] Run `npm audit` in CI pipeline
- [ ] Set up GitHub Actions deployment workflow
- [ ] Run `npm run db:migrate` against production database

**Pre-Go-Live (Operational):**
- [ ] Replace in-memory rate limiter with `rate-limit-redis` if scaling horizontally
- [ ] Conduct independent penetration test before processing sensitive data
- [ ] Establish AI data residency policy and PII handling procedures
- [ ] Perform load testing (k6, Artillery) against staging
- [ ] Configure and test backup/disaster recovery (define RPO/RTO)
- [ ] Document data retention and deletion policies

### GitHub Actions CI/CD

The pipeline runs automatically on push to the main branch:

1. Install dependencies
2. Run the full test suite (773 tests)
3. Build client and server for production
4. Deploy to your chosen container runtime

---

## Customizing This Template

### Adding a New Domain Entity

Follow this sequence to add a new feature domain end-to-end:

1. Create a database migration in `server/migrations/`
2. Create TypeScript types in `server/src/types/`
3. Create a model in `server/src/models/`
4. Create a service in `server/src/services/`
5. Create Zod validators in `server/src/validators/`
6. Create a controller in `server/src/controllers/`
7. Create routes in `server/src/routes/` and register them in `server/src/app.ts`
8. Create client types in `client/src/types/`
9. Create a composable in `client/src/composables/`
10. Create components in `client/src/components/`
11. Create pages in `client/src/pages/`
12. Add routes to `client/src/router/index.ts`
13. Write tests for both server and client

### Changing SSO Providers

See `server/src/config/auth.ts` and `docs/authentication.md` for Passport.js strategy configuration.

### Modifying the Design System

This template uses **PrimeVue** as the primary component library. Key files:

- `client/src/assets/theme.css` -- Application-level CSS custom properties for color and spacing tokens plus typography tokens. Use `var(--app-color-*)` instead of hardcoded hex values.
- `client/src/assets/formkit-theme.css` -- FormKit integration styling.
- `client/src/pages/public/DesignPage.vue` -- Live reference page at `/design` showing the components in use.

When adding new pages, prefer the existing component library over custom HTML elements. See the [PrimeVue documentation](https://primevue.org/) for the full catalog.

---

## Standards and Skills

Detailed coding standards and implementation guides are maintained alongside the template:

- `standards/STANDARD-api.md` -- REST API design conventions
- `standards/STANDARD-database.md` -- PostgreSQL naming and schema design
- `standards/STANDARD-frontend.md` -- Vue 3 component patterns
- `standards/STANDARD-security.md` -- Security requirements
- `standards/STANDARD-testing.md` -- Testing patterns and expectations
- `skills/` -- Step-by-step implementation guides for each feature area, designed for both human developers and AI workers

---

## License

CC0-1.0. Free for any use.
