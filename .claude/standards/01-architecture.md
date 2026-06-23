# Architecture Standard

## Overview

All applications follow a monorepo structure with strict separation of concerns through layered design. Two backend stacks are supported: **Go with Chi** and **Node.js with Express + TypeScript**. Both share a **Vue 3 + Vite** frontend and **PostgreSQL 17+** database.

---

## Monorepo Structure

### Go Backend Layout

```
project-root/
├── backend-go/
│   ├── cmd/server/main.go              # Entry point, initialization
│   ├── internal/
│   │   ├── auth/                       # Authentication types & helpers
│   │   ├── config/                     # Configuration loading, DB connection
│   │   ├── controllers/               # HTTP request handlers (thin)
│   │   ├── middleware/                # HTTP middleware stack
│   │   ├── models/                    # Data models & database queries
│   │   ├── rbac/                      # Role-Based Access Control
│   │   ├── routes/                    # Route registration & grouping
│   │   ├── services/                  # Business logic layer
│   │   ├── testutil/                  # Test helpers & mocks
│   │   ├── utils/                     # Shared utilities (errors, logging, responses)
│   │   └── websocket/                 # WebSocket server & handlers
│   ├── migrations/                    # SQL migration files
│   ├── openapi.yaml                   # OpenAPI 3.0+ specification
│   ├── Makefile                       # Build automation
│   ├── go.mod / go.sum                # Dependency management
│   └── .env.example                   # Environment template
├── frontend/
│   ├── src/
│   │   ├── assets/                    # Static assets, global CSS
│   │   ├── components/                # Reusable Vue components
│   │   ├── composables/               # Composition API hooks (use*)
│   │   ├── views/                     # Route-level view components
│   │   ├── router/                    # Vue Router config & guards
│   │   ├── lib/                       # API client, utilities & helpers
│   │   ├── stores/                    # Pinia stores (global state only)
│   │   ├── types/                     # Shared TypeScript type definitions
│   │   ├── App.vue                    # Root component
│   │   └── main.ts                    # Entry point
│   ├── public/                        # Static public assets
│   ├── index.html                     # HTML shell
│   ├── vite.config.ts                 # Vite build config
│   ├── tsconfig.json                  # TypeScript configuration
│   └── package.json                   # Frontend dependencies
├── migrations/                        # Shared SQL migrations (if not in backend)
├── package.json                       # Root workspace scripts
├── .env.example                       # Root environment template
└── .gitignore
```

### Node.js Backend Layout

```
project-root/
├── server/
│   ├── src/
│   │   ├── config/                    # Configuration loading, DB connection
│   │   ├── controllers/              # HTTP request handlers (thin)
│   │   ├── middleware/               # HTTP middleware stack
│   │   ├── models/                   # Database query functions
│   │   ├── routes/                   # Route registration & grouping
│   │   ├── services/                 # Business logic layer
│   │   ├── validators/               # Zod schema definitions
│   │   ├── utils/                    # Shared utilities (errors, logging, responses)
│   │   ├── websocket/                # Socket.io server & handlers
│   │   ├── types/                    # TypeScript type definitions
│   │   └── index.ts                  # Entry point
│   ├── migrations/                   # SQL migration files
│   ├── seeds/                        # Database seed files
│   ├── tsconfig.json                 # TypeScript configuration
│   ├── package.json                  # Server dependencies
│   └── .env.example                  # Environment template
├── client/
│   ├── src/
│   │   ├── assets/                   # Static assets, global CSS
│   │   ├── components/               # Reusable Vue components
│   │   ├── composables/              # Composition API hooks (use*)
│   │   ├── views/                    # Route-level view components
│   │   ├── router/                   # Vue Router config & guards
│   │   ├── lib/                      # API client, utilities & helpers
│   │   ├── stores/                   # Pinia stores (global state only)
│   │   ├── types/                    # Shared TypeScript type definitions
│   │   ├── App.vue                   # Root component
│   │   └── main.ts                   # Entry point
│   ├── public/                       # Static public assets
│   ├── index.html                    # HTML shell
│   ├── vite.config.ts                # Vite build config
│   ├── tsconfig.json                 # TypeScript configuration
│   └── package.json                  # Client dependencies
├── package.json                      # Root workspace scripts
├── .env.example                      # Root environment template
└── .gitignore
```

### Root package.json Workspace Scripts

The root `package.json` provides unified scripts that delegate to the appropriate sub-project:

```json
{
  "name": "project-name",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "cd server && npm run dev",
    "dev:client": "cd client && npm run dev",
    "build": "npm run build:server && npm run build:client",
    "build:server": "cd server && npm run build",
    "build:client": "cd client && npm run build",
    "test": "npm run test:server && npm run test:client",
    "test:server": "cd server && npm test",
    "test:client": "cd client && npm test",
    "db:migrate": "cd server && npm run db:migrate",
    "db:seed": "cd server && npm run db:seed",
    "db:reset": "cd server && npm run db:reset"
  }
}
```

For Go projects, the root `package.json` manages the frontend while the `Makefile` in `backend-go/` handles Go build/test/migration tasks:

```json
{
  "name": "project-name",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend-go && make run",
    "dev:frontend": "cd frontend && npm run dev",
    "build": "npm run build:backend && npm run build:frontend",
    "build:backend": "cd backend-go && make build",
    "build:frontend": "cd frontend && npm run build",
    "test": "npm run test:backend && npm run test:frontend",
    "test:backend": "cd backend-go && make test",
    "test:frontend": "cd frontend && npm test",
    "db:migrate": "cd backend-go && make migrate",
    "db:seed": "cd backend-go && make seed"
  }
}
```

---

## Backend Layers

Both stacks follow the same layered architecture. Dependencies flow **downward only**: Routes → Middleware → Controllers → Services → Models/Database.

### Routes Layer

Registers HTTP endpoints and composes middleware chains. Contains **no** business logic.

**Go (Chi):**
```go
func RegisterUserRoutes(r chi.Router, deps *Dependencies) {
    r.Route("/api/v1/users", func(r chi.Router) {
        r.Use(middleware.Authenticate(deps.Config))
        r.Get("/", deps.UserController.List)
        r.Post("/", deps.UserController.Create)
        r.Route("/{id}", func(r chi.Router) {
            r.Get("/", deps.UserController.Get)
            r.Put("/", deps.UserController.Update)
            r.Delete("/", deps.UserController.Delete)
        })
    })
}
```

**Node.js (Express):**
```typescript
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserController } from '../controllers/userController';
import { validateBody } from '../middleware/validate';
import { createUserSchema, updateUserSchema } from '../validators/userValidators';

const router = Router();

router.get('/', authenticate, UserController.list);
router.post('/', authenticate, validateBody(createUserSchema), UserController.create);
router.get('/:id', authenticate, UserController.get);
router.put('/:id', authenticate, validateBody(updateUserSchema), UserController.update);
router.delete('/:id', authenticate, authorize('admin'), UserController.delete);

export default router;
```

### Middleware Layer

Handles cross-cutting concerns: authentication, authorization, CORS, CSRF, logging, rate limiting, request ID generation.

- Reads and writes to the request context (Go) or `req` object (Node.js)
- Never calls services directly
- Executed in a defined order per route group

### Controllers Layer

Controllers are **thin**. Their only responsibilities:
1. Extract and validate input from the request (body, params, query)
2. Delegate to the appropriate service method
3. Format and send the response

Controllers never contain business logic. They never call models or the database directly.

**Go:**
```go
func (c *UserController) Create(w http.ResponseWriter, r *http.Request) {
    var input CreateUserInput
    if err := utils.ParseJSON(r, &input); err != nil {
        utils.SendError(w, err)
        return
    }

    authUser := auth.UserFromContext(r.Context())
    user, err := c.userService.Create(r.Context(), authUser.ID, input)
    if err != nil {
        utils.SendError(w, err)
        return
    }

    utils.SendSuccess(w, http.StatusCreated, user)
}
```

**Node.js:**
```typescript
export const create = asyncHandler(async (req: Request, res: Response) => {
  const input = req.validatedBody as CreateUserInput;
  const authUser = req.user!;

  const user = await userService.create(authUser.id, input);

  res.status(201).json({ success: true, data: user });
});
```

### Services Layer

Services contain **all** business logic. Responsibilities:
- Enforce business rules and validate state transitions
- Orchestrate calls to multiple models/query functions
- Manage database transactions when multiple writes are needed
- Emit events or trigger side effects (notifications, audit logging)
- Return domain objects or throw/return typed errors

Services never access HTTP request/response objects. They receive typed input and return typed output.

**Go:**
```go
func (s *UserService) Create(ctx context.Context, creatorID uuid.UUID, input CreateUserInput) (*User, error) {
    // Business rule: check if email already exists
    existing, err := s.userModel.FindByEmail(ctx, input.Email)
    if err != nil {
        return nil, fmt.Errorf("checking existing user: %w", err)
    }
    if existing != nil {
        return nil, utils.Conflict("A user with this email already exists")
    }

    // Create the user
    user, err := s.userModel.Create(ctx, input)
    if err != nil {
        return nil, fmt.Errorf("creating user: %w", err)
    }

    // Side effect: audit log
    s.auditService.Log(ctx, "create", "user_accounts", user.ID, nil, user, creatorID)

    return user, nil
}
```

**Node.js:**
```typescript
export async function create(creatorId: string, input: CreateUserInput): Promise<User> {
  // Business rule: check if email already exists
  const existing = await userModel.findByEmail(input.email);
  if (existing) {
    throw AppError.conflict('A user with this email already exists');
  }

  // Create the user
  const user = await userModel.create(input);

  // Side effect: audit log
  await auditService.log('create', 'user_accounts', user.id, null, user, creatorId);

  return user;
}
```

### Models / Database Layer

Models contain **only** database access logic. They execute parameterized SQL queries and return typed results. They contain no business logic, no HTTP concerns, and no validation.

**Go:**
```go
func (m *UserModel) FindByEmail(ctx context.Context, email string) (*User, error) {
    var user User
    err := m.pool.QueryRow(ctx,
        `SELECT id, email, display_name, role, created_at
         FROM app.user_accounts
         WHERE email = $1 AND is_deleted = false`,
        email,
    ).Scan(&user.ID, &user.Email, &user.DisplayName, &user.Role, &user.CreatedAt)

    if err == pgx.ErrNoRows {
        return nil, nil
    }
    if err != nil {
        return nil, fmt.Errorf("finding user by email: %w", err)
    }
    return &user, nil
}
```

**Node.js:**
```typescript
export async function findByEmail(email: string): Promise<User | null> {
  const result = await pool.query(
    `SELECT id, email, display_name, role, created_at
     FROM app.user_accounts
     WHERE email = $1 AND is_deleted = false`,
    [email]
  );
  return result.rows[0] || null;
}
```

**Key rules for the database layer:**
- Parameterized SQL only (`$1`, `$2`, etc.): never string interpolation
- No ORM, use raw SQL via `pgx` (Go) or `pg`/`postgres` (Node.js)
- Handle `ErrNoRows` / empty result sets gracefully
- Close row iterators with `defer rows.Close()` (Go)
- Map PostgreSQL error codes to domain errors at the service layer, not here

---

## Frontend Architecture (Vue 3)

### Component Hierarchy

```
App.vue → Router → Page → Layout → Components
```

### Layer Responsibilities

| Layer | Responsibility | Example |
|-------|---------------|---------|
| Pages | Route-level components, compose layouts and domain sections | `DashboardPage.vue`, `UserListPage.vue` |
| Layouts | Structural wrappers (nav, sidebar, footer) | `DefaultLayout.vue`, `AuthLayout.vue` |
| Components | Reusable UI pieces, receive props, emit events | `DataTable.vue`, `ConfirmDialog.vue` |
| Composables | API calls + reactive state, `use` prefix | `useUsers.ts`, `useAuth.ts` |
| Stores | Pinia setup syntax, ONLY for global cross-component state | `useAuthStore.ts`, `useNotificationStore.ts` |
| Services | Axios API client, interceptors, token management | `api.ts`, `authService.ts` |
| Router | Route definitions, navigation guards, lazy loading | `index.ts`, `guards.ts` |

### Composables as Primary State Management

Composables are the **primary** mechanism for managing state in the frontend. They encapsulate API calls, loading/error states, and reactive data for a specific domain.

```typescript
// composables/useUsers.ts
import { ref, computed } from 'vue';
import api from '@/lib/api';
import type { User, CreateUserInput, PaginatedResponse } from '@/types';

export function useUsers() {
  const users = ref<User[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 });

  async function fetchUsers(page = 1, limit = 20) {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.get<PaginatedResponse<User>>('/api/v1/users', {
        params: { page, limit },
      });
      users.value = response.data.data;
      pagination.value = response.data.pagination;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to load users';
    } finally {
      loading.value = false;
    }
  }

  async function createUser(input: CreateUserInput): Promise<User> {
    const response = await api.post<{ data: User }>('/api/v1/users', input);
    users.value.unshift(response.data.data);
    return response.data.data;
  }

  return { users, loading, error, pagination, fetchUsers, createUser };
}
```

### Pinia Stores: Global State Only

Pinia stores are reserved for state that is global and shared across many unrelated components. Common examples: authentication state, notification toasts, app-wide settings.

**No Vuex.** Pinia with setup syntax is the only supported store pattern.

```typescript
// stores/useAuthStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User } from '@/types';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const accessToken = ref<string | null>(null);

  const isAuthenticated = computed(() => !!user.value);
  const roleLevel = computed(() => user.value?.roleLevel ?? 0);

  function setSession(userData: User, token: string) {
    user.value = userData;
    accessToken.value = token;
  }

  function clearSession() {
    user.value = null;
    accessToken.value = null;
  }

  return { user, accessToken, isAuthenticated, roleLevel, setSession, clearSession };
});
```

---

## Communication Patterns

| Pattern | Technology | Use Case | Direction |
|---------|-----------|----------|-----------|
| REST API | Axios → Chi or Express | CRUD operations, data fetching | Client → Server |
| WebSocket | Gorilla (Go) or Socket.io (Node.js) | Real-time streaming (LLM output, live updates) | Bidirectional |
| Server-Sent Events | Native EventSource | Notifications, progress updates | Server → Client |
| OAuth 2.0 Redirect | HTTP 302 | SSO authentication flow | Client ↔ IdP ↔ Server |

### REST API

- All API calls go through a single Axios instance with `withCredentials: true`
- Request interceptor attaches CSRF token and request ID headers
- Response interceptor handles 401 (triggers token refresh with request queuing)
- Base URL configured via environment variable (`VITE_API_URL`)

### WebSocket

- Connection authenticated via JWT (from cookie on handshake or sent as first message)
- Origin validated against allowed origins
- Messages structured as JSON with a `type` field for routing
- Heartbeat/ping every 30 seconds for connection health
- Automatic reconnection with exponential backoff on the client

### Server-Sent Events

- Used for server-push scenarios where bidirectional communication is not needed
- Client connects via `EventSource` API
- Server sends events with `event:` and `data:` fields
- Automatic reconnection built into the browser EventSource API

### OAuth 2.0 Callbacks

- Server initiates flow by redirecting to the identity provider
- State parameter stored in httpOnly cookie for CSRF protection
- Callback endpoint validates state, exchanges code for tokens, creates/links user account
- Final redirect to frontend with session established via cookies

---

## Database Design Principles

### PostgreSQL 17+ Required

All applications use PostgreSQL 17 or later. No other databases are supported for primary storage.

### Schema Isolation

Use a named schema (e.g., `app`) to isolate application tables from the `public` schema:

```sql
CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;
```

### Primary Keys

All tables use UUID primary keys generated by the database:

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

Never use `uuid_generate_v4()` (requires the `uuid-ossp` extension). `gen_random_uuid()` is built into PostgreSQL 13+ and does not require extensions.

### Timestamps

All timestamp columns use `TIMESTAMPTZ` (never `TIMESTAMP` without time zone):

```sql
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Create a trigger function for auto-updating `updated_at`:

```sql
CREATE OR REPLACE FUNCTION app.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to each table
CREATE TRIGGER trg_user_accounts_updated_at
    BEFORE UPDATE ON app.user_accounts
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at();
```

### Soft Deletes

Where business requirements demand recoverability, use soft deletes:

```sql
is_deleted BOOLEAN NOT NULL DEFAULT false,
deleted_at TIMESTAMPTZ
```

All queries against soft-deletable tables must include `WHERE is_deleted = false` unless explicitly querying deleted records.

### JSONB for Flexible Data

Use JSONB columns for data that varies across records or changes structure frequently:

```sql
tags JSONB DEFAULT '[]'::jsonb,
metadata JSONB DEFAULT '{}'::jsonb,
form_schema JSONB
```

Index JSONB columns with GIN indexes when queried:

```sql
CREATE INDEX idx_resources_tags ON app.resources USING GIN (tags);
```

### Audit Trail Table

Every application must have an audit trail for mutation tracking:

```sql
CREATE TABLE app.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(20) NOT NULL,          -- 'create', 'update', 'delete'
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    old_data JSONB,                        -- Previous state (null for creates)
    new_data JSONB,                        -- New state (null for deletes)
    user_id UUID,                          -- Who performed the action
    ip_address INET,                       -- Client IP address
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_table_record ON app.audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_user ON app.audit_log (user_id);
CREATE INDEX idx_audit_log_created ON app.audit_log (created_at);
```

### Indexes

Apply indexes selectively:
- All foreign key columns (PostgreSQL does not auto-index these)
- Status and type fields used in WHERE clauses
- Columns used in query predicates (filters, sorting)
- Composite indexes for multi-column queries (most selective column first)
- Partial indexes for common filtered queries: `WHERE is_deleted = false`

Naming convention: `idx_<table>_<columns>`

```sql
CREATE INDEX idx_user_accounts_email ON app.user_accounts (email);
CREATE INDEX idx_user_accounts_role ON app.user_accounts (role);
CREATE INDEX idx_tasks_status_created ON app.tasks (status, created_at);
CREATE INDEX idx_tasks_active ON app.tasks (status) WHERE is_deleted = false;
```

### CHECK Constraints

Use CHECK constraints for enum-like fields instead of application-level validation:

```sql
status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
priority INTEGER NOT NULL DEFAULT 0
    CHECK (priority BETWEEN 0 AND 5)
```

### Migration Files

Migrations are sequential, numbered SQL files tracked in a `schema_migrations` table:

```
migrations/
├── 001_initial_schema.sql
├── 002_add_user_accounts.sql
├── 003_add_audit_log.sql
├── 004_add_tasks.sql
└── 005_add_indexes.sql
```

Each migration file contains both the migration SQL and is applied once. The migration runner tracks which files have been applied:

```sql
CREATE TABLE IF NOT EXISTS app.schema_migrations (
    version INTEGER PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Connection Pooling

- Go: use `pgxpool` with configurable min/max connections (default min: 2, max: 20)
- Node.js: use `pg.Pool` with configurable pool size (default max: 20)

---

## Environment Configuration

### Principles

1. **All secrets via environment variables**: never hardcoded in source
2. **Validate at startup**: fail fast if required configuration is missing
3. **Reject placeholders in production**: values like `changeme`, `secret`, `password` must cause startup failure in production
4. **Type-safe configuration**: load into a typed struct (Go) or validated object (Zod for Node.js)

### Development

Use `.env` files for local development:
- `.env.example`: committed to git, contains all variable names with placeholder values
- `.env`: never committed, contains actual local values
- `.env.test`: test-specific overrides

### Production

Use a secrets manager or key vault service with environment variables injected by the deployment platform; never deploy `.env` files to production.

### Go Configuration Pattern

```go
type Config struct {
    Port            int    `env:"PORT" default:"8080"`
    DatabaseURL     string `env:"DATABASE_URL" required:"true"`
    JWTSecret       string `env:"JWT_SECRET" required:"true" min:"32"`
    JWTRefreshSecret string `env:"JWT_REFRESH_SECRET" required:"true" min:"32"`
    CSRFSecret      string `env:"CSRF_SECRET" required:"true" min:"32"`
    AllowedOrigins  string `env:"ALLOWED_ORIGINS" required:"true"`
    Environment     string `env:"ENVIRONMENT" default:"development"`
}
```

### Node.js Configuration Pattern (Zod)

```typescript
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  ALLOWED_ORIGINS: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const config = envSchema.parse(process.env);
```

---

## Health Check Endpoints

All applications must expose two health check endpoints:

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `/health/live` (liveness) | Confirms the process is running and not deadlocked | 200 OK when the process is responsive |
| `/health/ready` (readiness) | Confirms all dependencies (database, cache, external services) are reachable | 200 OK with per-dependency status; 503 when any critical dependency is unavailable |

- Readiness checks must individually verify each dependency and report per-dependency status with latency
- Liveness checks must be lightweight and free of dependency calls
- Both endpoints must be unauthenticated and excluded from rate limiting
- Readiness response should include a structured body listing each dependency with its status and response time

---

## Graceful Shutdown

All applications must implement graceful shutdown on receiving termination signals (SIGTERM, SIGINT):

1. **Stop accepting** new connections immediately
2. **Drain in-flight requests** with a configurable timeout (default: 30 seconds)
3. **Close infrastructure connections** (database pools, cache clients, message queues) in dependency order
4. **Flush log buffers** to prevent loss of final log entries
5. **Exit cleanly** with exit code 0 on success, non-zero on timeout

If the drain timeout expires, force-exit to prevent zombie processes. Never terminate mid-transaction without attempting rollback.

---

## Observability

### Structured Logging

In production, all log output must be structured JSON with a consistent schema:

| Field | Required | Description |
|-------|----------|-------------|
| `timestamp` | Yes | ISO 8601 with timezone |
| `level` | Yes | debug, info, warn, error |
| `message` | Yes | Human-readable description |
| `service` | Yes | Application or service name |
| `environment` | Yes | dev, staging, production |
| `requestId` | Yes (request-scoped) | Correlation ID from X-Request-ID header |
| `method` | Contextual | HTTP method |
| `path` | Contextual | Request path |
| `statusCode` | Contextual | Response status code |
| `duration_ms` | Contextual | Request duration in milliseconds |

In development, human-readable console format is acceptable.

### Correlation IDs

- Every inbound request must be assigned a unique correlation ID (via `X-Request-ID` header or generated server-side)
- The correlation ID must be included in all log entries for that request
- When making outbound calls to other services, propagate the correlation ID
- Return the correlation ID in the response headers for client-side debugging

### Application Metrics

All applications should collect and expose these core metrics:

- **HTTP request duration**: histogram with defined buckets, labeled by method/route/status code
- **Request count**: counter labeled by method/route/status code
- **Active connections**: gauge of currently open connections
- **Error rate**: counter of 5xx responses

Expose metrics via a dedicated endpoint (e.g., `/metrics`). The specific instrumentation library is not mandated.

---

## External Service Resilience

### Circuit Breaker Pattern

All outbound calls to external services must use a circuit breaker pattern:

| State | Behavior |
|-------|----------|
| **Closed** | Requests pass through normally; failures are counted |
| **Open** | Requests fail immediately with a fallback response; no calls to the external service |
| **Half-Open** | A limited number of test requests are sent; success closes the circuit, failure reopens it |

Configure per-service: error threshold percentage, reset timeout, and fallback response. The application must degrade gracefully rather than cascade failures.

### Retry with Exponential Backoff

Retries for transient failures (network errors, 5xx responses) must use exponential backoff:

- Maximum 3 retry attempts
- Backoff intervals: 1s, 2s, 4s (with jitter)
- Only retry idempotent operations or operations known to be safe to retry
- Non-idempotent requests (POST) must not be retried unless the server returned no response

### Connection Retry for Infrastructure

Database and cache connections must be configured with:

- Retry strategy using exponential backoff with a maximum delay cap
- Explicit connection pool settings (max connections, idle timeout, connection timeout): never rely on library defaults
- Reconnection logic for runtime connection loss

#### AI Provider Abstraction

Applications integrating AI/LLM services must use an adapter/factory pattern to prevent vendor lock-in:

- Define a provider interface with `chat()`, `streamChat()`, `analyzeImages()`, and `isAvailable()` methods
- Implement a provider factory with registry pattern and singleton caching
- Support runtime provider selection via environment variables (`AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`)
- Enable extensibility via `registerProvider(name, factoryFn)`

See `skills/backend/nodejs/06-realtime.md` for the full implementation pattern.

---

## API Versioning

### Versioning Strategy

Production APIs must be versioned using URL path strategy (e.g., `/api/v1/resources`).

### Breaking vs Non-Breaking Changes

| Change Type | Breaking? | Requires New Version? |
|-------------|-----------|----------------------|
| Adding a required request parameter | Yes | Yes |
| Removing an endpoint or response field | Yes | Yes |
| Changing a field name, type, or format | Yes | Yes |
| Changing response status codes or error types | Yes | Yes |
| Changing authorization scope requirements | Yes | Yes |
| Adding a new optional request parameter | No | No |
| Adding a new endpoint | No | No |
| Adding a new response field | No | No |
| Reordering response fields | No | No |

#### Backward-Compatible Aliasing

During initial development, mount a backward-compatible alias at `/api/*` pointing to the current version's router. This allows clients to use unversioned paths during early development and transition to versioned paths when a v2 is introduced:

```typescript
app.use('/api/v1', v1Routes);
app.use('/api', v1Routes); // Alias: remove when v2 is introduced
```

### API Documentation

All REST APIs must be documented with an OpenAPI Specification (OAS 3.0+). Documentation must include all endpoints, request/response schemas, authentication requirements, error responses, and examples.

### Design Principles

- **Contract-first**: Design the API specification before writing implementation code
- **Extensibility (Postel's Law)**: Be conservative in what you send, be liberal in what you accept. Send the minimum data necessary; accept additional unknown fields gracefully
- **Resilience**: Handle unavailable downstream resources by returning appropriate error codes or cached responses rather than crashing or hanging

---

## Containerization

All applications must provide a container definition following these principles:

1. **Multi-stage build**: separate build stage (full toolchain) from production stage (minimal base image)
2. **Deterministic installs**: use lock-file-based install commands for reproducible builds
3. **Non-root runtime**: run the application as a non-root user in the final image
4. **Health check**: include a container-level health check instruction
5. **Minimal final image**: copy only built artifacts and production dependencies to the final stage
6. **No secrets in images**: never bake secrets, credentials, or environment files into container images

---

## Deployment Strategy

### Zero-Downtime Deployments

All production deployments must use a rolling update strategy that holds downtime to zero:

- At least one instance must remain available and serving traffic at all times during a rollout
- The application must support running multiple versions simultaneously during the rollout window
- Pre-stop hooks should include a brief delay to allow load balancers to drain connections before the process is terminated
- Readiness probes must gate traffic routing to new instances

### Response Compression

All production deployments must enable response compression (gzip at minimum, brotli preferred) for text-based content types (JSON, HTML, CSS, JavaScript, XML). Compression may be applied at the application layer or at the reverse proxy layer, but must be explicitly configured and verified.

#### SSE Compression Exclusion

HTTP compression middleware buffers response chunks before sending, which defeats real-time delivery for Server-Sent Events. Always exclude SSE streams from compression:

```typescript
app.use(compression({
  filter: (req, res) => {
    if (req.headers.accept === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
}));
```

This prevents SSE notifications from arriving in delayed batches instead of real-time.

### Production Data Isolation

Production data must not be used for testing at any environment level below user acceptance testing. Use synthetic or anonymized data for development/integration/QA testing.

---

## Webhook Security

When receiving webhook payloads from external services:

- Verify the payload signature (e.g., HMAC-SHA256) before processing
- Validate the source of webhook requests against known origins
- Never trust webhook data without source validation
- Apply rate limiting to webhook endpoints to prevent abuse

---

## Database Design: Additional Principles

### Named Constraints

All constraints must use explicit names following a consistent pattern:

| Constraint Type | Naming Pattern | Example |
|----------------|----------------|---------|
| Primary key | `pk_<table>` | `pk_user_accounts` |
| Foreign key | `fk_<table>_<referenced>` | `fk_tasks_user_accounts` |
| Unique | `uq_<table>_<columns>` | `uq_user_accounts_email` |
| Check | `ck_<table>_<column>` | `ck_tasks_status` |

Named constraints make migration scripts, error messages, and troubleshooting significantly more readable.

### Explicit Referential Actions

Every foreign key constraint must specify its referential action explicitly (`CASCADE`, `SET NULL`, `RESTRICT`, `NO ACTION`). Never rely on database defaults, which vary by context and lead to unexpected cascading deletes or orphaned records.

### Migration Rollback Strategy

Establish a rollback policy for database migrations:

- Each migration should be designed to be reversible where feasible
- Document the rollback approach for destructive migrations (column drops, table drops)
- Validate migrations against both a fresh database (from scratch) and the current production schema (incremental) before deployment
- Test migration scripts in a staging environment that mirrors production data volume

### DDL Ordering

CREATE TABLE statements within a migration must be ordered so that referenced (parent) tables appear before referencing (child) tables. This lets scripts run top-to-bottom without foreign key errors in fresh environments.
