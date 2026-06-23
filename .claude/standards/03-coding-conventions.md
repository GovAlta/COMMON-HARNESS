# Coding Conventions

This document defines coding standards for both supported backend stacks (Go and Node.js/TypeScript) and the Vue 3 frontend. All contributors and AI assistants must follow these conventions.

---

## Go Backend Conventions

### Project Structure

All application code lives under `internal/` to prevent external imports:

```
backend-go/
├── cmd/server/main.go
├── internal/
│   ├── config/          # Configuration loading, DB connection pool
│   ├── controllers/     # HTTP request handlers (thin)
│   ├── middleware/       # HTTP middleware (auth, CORS, CSRF, logging, rate limit)
│   ├── models/           # Database query functions, type definitions
│   ├── routes/           # Route registration and grouping
│   ├── services/         # Business logic layer
│   ├── auth/             # Authentication types and helpers
│   ├── rbac/             # Role-based access control
│   ├── utils/            # Shared utilities (errors, logging, responses)
│   ├── websocket/        # WebSocket server and handlers
│   └── testutil/         # Test helpers and mocks
├── migrations/
├── go.mod
└── go.sum
```

- Use Go modules (`go.mod`) for dependency management
- Target Go 1.22+ for latest language features
- Single entry point: `cmd/server/main.go`

### Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Packages | lowercase, single word | `auth`, `config`, `rbac` |
| Exported functions | PascalCase | `CreateUser`, `ValidateToken` |
| Unexported functions | camelCase | `parseJSON`, `hashPassword` |
| Interfaces | PascalCase, `-er` suffix for single-method | `Reader`, `PermissionChecker` |
| Structs | PascalCase | `UserAccount`, `ApiError` |
| Constants | PascalCase | `RoleSuperAdmin`, `DefaultPageSize` |
| Files | snake_case | `user_controller.go`, `auth_middleware.go` |
| Test files | snake_case + `_test` | `user_controller_test.go` |
| Environment variables | SCREAMING_SNAKE_CASE | `DB_CONNECTION_STRING` |

### Type Definitions

Use type aliases for domain enums:

```go
type Role string

const (
    RoleSuperAdmin Role = "super_admin"
    RoleAdmin      Role = "admin"
    RoleManager    Role = "manager"
    RoleUser       Role = "user"
    RoleViewer     Role = "viewer"
)
```

Use pointer types for optional/nullable fields:

```go
type User struct {
    ID          uuid.UUID  `json:"id"`
    Email       string     `json:"email"`
    DisplayName string     `json:"display_name"`
    Role        string     `json:"role"`
    IsDeleted   bool       `json:"-"`
    DeletedAt   *time.Time `json:"deleted_at,omitempty"`
    CreatedAt   time.Time  `json:"created_at"`
    UpdatedAt   time.Time  `json:"updated_at"`
}
```

- Use `json` struct tags on all API-facing types
- Use `omitempty` for optional fields
- Use `json:"-"` for fields that should never be serialized

### Custom Error Type

```go
type ApiError struct {
    StatusCode int         `json:"-"`
    Message    string      `json:"error"`
    Code       string      `json:"code"`
    Details    interface{} `json:"details,omitempty"`
}

func (e *ApiError) Error() string { return e.Message }

// Factory functions
func NotFound(entity string) *ApiError {
    return &ApiError{StatusCode: 404, Message: entity + " not found", Code: "NOT_FOUND"}
}

func Forbidden(msg string) *ApiError {
    return &ApiError{StatusCode: 403, Message: msg, Code: "FORBIDDEN"}
}

func Validation(details interface{}) *ApiError {
    return &ApiError{StatusCode: 422, Message: "Validation failed", Code: "VALIDATION_ERROR", Details: details}
}

func Conflict(msg string) *ApiError {
    return &ApiError{StatusCode: 409, Message: msg, Code: "CONFLICT"}
}

func TooManyRequests(retryAfter int) *ApiError {
    return &ApiError{StatusCode: 429, Message: "Too many requests", Code: "RATE_LIMIT_EXCEEDED",
        Details: map[string]int{"retryAfter": retryAfter}}
}

func BadRequest(msg string) *ApiError {
    return &ApiError{StatusCode: 400, Message: msg, Code: "BAD_REQUEST"}
}

func InternalError(msg string) *ApiError {
    return &ApiError{StatusCode: 500, Message: msg, Code: "INTERNAL_ERROR"}
}
```

### Controller Pattern

Controllers are thin: extract input, call service, write response.

```go
func (c *UserController) Create(w http.ResponseWriter, r *http.Request) {
    var input CreateUserInput
    if err := utils.ParseJSON(r, &input); err != nil {
        utils.SendError(w, err)
        return
    }

    if validationErr := input.Validate(); validationErr != nil {
        utils.SendError(w, validationErr)
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

Response utilities:

```go
utils.SendSuccess(w, http.StatusOK, data)
utils.SendCreated(w, entity)
utils.SendError(w, err)
utils.SendPaginated(w, data, pagination)
utils.SendNoContent(w)
```

### Service Pattern

Services accept context as the first parameter:

```go
func (s *UserService) Create(ctx context.Context, creatorID uuid.UUID, input CreateUserInput) (*User, error) {
    // Business logic here
    existing, err := s.userModel.FindByEmail(ctx, input.Email)
    if err != nil {
        return nil, fmt.Errorf("checking existing user: %w", err)
    }
    if existing != nil {
        return nil, utils.Conflict("A user with this email already exists")
    }

    user, err := s.userModel.Create(ctx, input)
    if err != nil {
        return nil, fmt.Errorf("creating user: %w", err)
    }
    return user, nil
}
```

Services may call multiple model functions and manage transactions:

```go
func (s *OrderService) PlaceOrder(ctx context.Context, input PlaceOrderInput) (*Order, error) {
    tx, err := s.pool.Begin(ctx)
    if err != nil {
        return nil, fmt.Errorf("starting transaction: %w", err)
    }
    defer tx.Rollback(ctx)

    order, err := s.orderModel.CreateWithTx(ctx, tx, input)
    if err != nil {
        return nil, fmt.Errorf("creating order: %w", err)
    }

    for _, item := range input.Items {
        if err := s.inventoryModel.DecrementWithTx(ctx, tx, item.ProductID, item.Quantity); err != nil {
            return nil, fmt.Errorf("decrementing inventory: %w", err)
        }
    }

    if err := tx.Commit(ctx); err != nil {
        return nil, fmt.Errorf("committing transaction: %w", err)
    }
    return order, nil
}
```

### Model / Database Query Pattern

Models contain parameterized SQL functions and return typed structs:

```go
func (m *UserModel) FindByID(ctx context.Context, id uuid.UUID) (*User, error) {
    var user User
    err := m.pool.QueryRow(ctx,
        `SELECT id, email, display_name, role, created_at, updated_at
         FROM app.user_accounts
         WHERE id = $1 AND is_deleted = false`,
        id,
    ).Scan(&user.ID, &user.Email, &user.DisplayName, &user.Role, &user.CreatedAt, &user.UpdatedAt)

    if err == pgx.ErrNoRows {
        return nil, nil
    }
    if err != nil {
        return nil, fmt.Errorf("querying user by id: %w", err)
    }
    return &user, nil
}
```

- Use `pgx` directly, no ORM
- Close row iterators with `defer rows.Close()`
- Handle `pgx.ErrNoRows` explicitly
- All queries use `$1`, `$2` parameterized placeholders

### Resource Cleanup

Use `defer` for all cleanup:

```go
// Database rows
rows, err := pool.Query(ctx, query, args...)
if err != nil {
    return nil, err
}
defer rows.Close()

// Response bodies
resp, err := http.Get(url)
if err != nil {
    return err
}
defer resp.Body.Close()

// Transactions
tx, err := pool.Begin(ctx)
if err != nil {
    return err
}
defer tx.Rollback(ctx) // No-op if committed
```

Graceful shutdown:

```go
quit := make(chan os.Signal, 1)
signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
<-quit

ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()
server.Shutdown(ctx)
pool.Close()
```

### Error Wrapping

Always wrap errors with context using `fmt.Errorf`:

```go
user, err := s.userModel.FindByID(ctx, id)
if err != nil {
    return nil, fmt.Errorf("finding user %s: %w", id, err)
}
```

### Testing

Use table-driven tests with subtests:

```go
func TestCreateUser(t *testing.T) {
    tests := []struct {
        name    string
        input   CreateUserInput
        wantErr bool
        errCode string
    }{
        {
            name:    "valid input",
            input:   CreateUserInput{Email: "test@example.com", DisplayName: "Test"},
            wantErr: false,
        },
        {
            name:    "duplicate email",
            input:   CreateUserInput{Email: "existing@example.com", DisplayName: "Test"},
            wantErr: true,
            errCode: "CONFLICT",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            user, err := service.Create(ctx, creatorID, tt.input)
            if tt.wantErr {
                require.Error(t, err)
                var apiErr *ApiError
                require.ErrorAs(t, err, &apiErr)
                assert.Equal(t, tt.errCode, apiErr.Code)
            } else {
                require.NoError(t, err)
                assert.NotEmpty(t, user.ID)
            }
        })
    }
}
```

### Logging

Use structured logging with `logrus` or `slog`:

```go
log.WithFields(log.Fields{
    "user_id":    userID,
    "action":     "create_user",
    "request_id": requestID,
    "duration":   duration.Milliseconds(),
}).Info("User created successfully")
```

Log levels:
- **Debug**: Development-only detail
- **Info**: Normal operations (requests served, jobs completed)
- **Warn**: Recoverable issues (rate limit approached, deprecated endpoint used)
- **Error**: Failures requiring attention (database errors, external service failures)

Never log secrets, tokens, or passwords.

### Configuration

```go
// Load from environment via godotenv
if err := godotenv.Load(); err != nil {
    log.Info("No .env file found, using environment variables")
}

// Parse into typed struct
config, err := LoadConfig()
if err != nil {
    log.Fatalf("Failed to load configuration: %v", err)
}

// Validate at startup
if config.Environment == "production" && len(config.JWTSecret) < 32 {
    log.Fatal("JWT_SECRET must be at least 32 characters in production")
}
```

### Router Registration (Chi)

```go
r := chi.NewRouter()

// Global middleware
r.Use(middleware.RequestID)
r.Use(middleware.Logger)
r.Use(middleware.Recoverer)
r.Use(middleware.SecurityHeaders)
r.Use(middleware.CORS(config))

// Route groups
r.Route("/api/v1", func(r chi.Router) {
    r.Mount("/auth", routes.AuthRoutes(deps))
    r.Mount("/users", routes.UserRoutes(deps))
    r.Mount("/tasks", routes.TaskRoutes(deps))
})
```

---

## TypeScript / Node.js Backend Conventions

### TypeScript Configuration

Enforce strict mode in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Type Usage Rules

| Rule | Correct | Incorrect |
|------|---------|-----------|
| Object shapes | `interface User { ... }` | `type User = { ... }` |
| Unions/intersections | `type Status = 'active' \| 'inactive'` | `interface Status ...` |
| No `any` | `unknown` with narrowing | `any` |
| Public function returns | Explicit return type | Inferred return type |
| Generic constraints | `T extends Record<string, unknown>` | `T extends any` |

```typescript
// CORRECT: interface for object shapes
interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: Date;
}

// CORRECT: type for unions
type UserRole = 'super_admin' | 'admin' | 'manager' | 'user' | 'viewer';

// CORRECT: explicit return type on public functions
export async function findById(id: string): Promise<User | null> {
  // ...
}

// CORRECT: narrowing unknown
function handleError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
```

### AppError Class

```typescript
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static validation(details: unknown): AppError {
    return new AppError(422, 'VALIDATION_ERROR', 'Validation failed', details);
  }

  static conflict(message: string): AppError {
    return new AppError(409, 'CONFLICT', message);
  }

  static tooManyRequests(retryAfter: number): AppError {
    return new AppError(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests', { retryAfter });
  }

  static badRequest(message: string): AppError {
    return new AppError(400, 'BAD_REQUEST', message);
  }

  static internal(message = 'An unexpected error occurred'): AppError {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }
}
```

### asyncHandler Wrapper

All controller functions must be wrapped with `asyncHandler` to catch async errors:

```typescript
type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(fn: AsyncRequestHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

### Controller Pattern

```typescript
// controllers/userController.ts
import { asyncHandler } from '../utils/asyncHandler';
import * as userService from '../services/userService';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const result = await userService.list(page, limit);

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const input = req.validatedBody as CreateUserInput;
  const user = await userService.create(req.user!.id, input);

  res.status(201).json({ success: true, data: user });
});
```

### Zod Validators

Define Zod schemas in separate validator files:

```typescript
// validators/userValidators.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email().max(255),
  displayName: z.string().min(1).max(100).trim(),
  role: z.enum(['guest', 'viewer', 'user', 'editor', 'manager', 'admin', 'super_admin']).optional().default('user'),
});

export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(100).trim().optional(),
  role: z.enum(['guest', 'viewer', 'user', 'editor', 'manager', 'admin', 'super_admin']).optional(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
```

### Express Middleware Composition

Compose middleware for route protection:

```typescript
// Route with authentication + role check + input validation
router.post(
  '/',
  authenticate,
  authorize('admin'),
  csrfProtection,
  validateBody(createUserSchema),
  UserController.create
);

// Route with just authentication
router.get('/', authenticate, UserController.list);
```

### Error Handling Middleware

```typescript
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
      },
    });
    return;
  }

  // Log unexpected errors
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.headers['x-request-id'],
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
      details: config.NODE_ENV === 'production' ? null : err.stack,
    },
  });
}
```

---

## Vue 3 Frontend Conventions

### Component Structure

All components use `<script setup lang="ts">`:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useUsers } from '@/composables/useUsers';
import type { User } from '@/types';

// Props with defaults
const props = withDefaults(
  defineProps<{
    title: string;
    showActions?: boolean;
    maxItems?: number;
  }>(),
  {
    showActions: true,
    maxItems: 10,
  }
);

// Typed emits
const emit = defineEmits<{
  select: [user: User];
  delete: [userId: string];
}>();

// Composable usage
const { users, loading, error, fetchUsers } = useUsers();

// Local state
const searchQuery = ref('');

// Computed
const filteredUsers = computed(() =>
  users.value.filter((u) =>
    u.displayName.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
);

// Lifecycle
onMounted(() => {
  fetchUsers();
});

// Methods
function handleSelect(user: User) {
  emit('select', user);
}
</script>

<template>
  <div class="user-list">
    <input
      v-model="searchQuery"
      type="text"
      placeholder="Search users..."
      data-testid="user-search-input"
    />

    <div v-if="loading" data-testid="user-list-loading">Loading...</div>
    <div v-else-if="error" data-testid="user-list-error">{{ error }}</div>
    <ul v-else data-testid="user-list">
      <li
        v-for="user in filteredUsers"
        :key="user.id"
        data-testid="user-list-item"
        @click="handleSelect(user)"
      >
        {{ user.displayName }}
      </li>
    </ul>
  </div>
</template>
```

### Component File Naming

- PascalCase for all component files: `UserProfile.vue`, `DataTable.vue`, `ConfirmDialog.vue`
- One component per file
- Domain-based directory structure under `components/`:

```
components/
├── common/              # Shared UI components
│   ├── DataTable.vue
│   ├── ConfirmDialog.vue
│   └── LoadingSpinner.vue
├── users/               # User domain components
│   ├── UserCard.vue
│   ├── UserForm.vue
│   └── UserAvatar.vue
└── tasks/               # Task domain components
    ├── TaskList.vue
    └── TaskDetail.vue
```

### Composables

Composables are the primary state management mechanism. They encapsulate API calls and reactive state:

```typescript
// composables/useUsers.ts
import { ref } from 'vue';
import api from '@/lib/api';
import type { User, CreateUserInput, Pagination } from '@/types';

export function useUsers() {
  const users = ref<User[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const pagination = ref<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });

  async function fetchUsers(page = 1, limit = 20): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.get('/api/v1/users', { params: { page, limit } });
      users.value = res.data.data;
      pagination.value = res.data.pagination;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to load users';
    } finally {
      loading.value = false;
    }
  }

  async function createUser(input: CreateUserInput): Promise<User> {
    const res = await api.post('/api/v1/users', input);
    users.value.unshift(res.data.data);
    return res.data.data;
  }

  async function deleteUser(id: string): Promise<void> {
    await api.delete(`/api/v1/users/${id}`);
    users.value = users.value.filter((u) => u.id !== id);
  }

  return { users, loading, error, pagination, fetchUsers, createUser, deleteUser };
}
```

Rules for composables:
- Prefix with `use`: `useAuth`, `useWebSocket`, `usePermissions`
- Return refs and functions, not raw promises
- Handle loading and error states internally
- Can be instantiated per-component (each call creates fresh state)

### Pinia Stores

Pinia stores use setup syntax and are reserved for global state:

```typescript
// stores/useNotificationStore.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timeout?: number;
}

export const useNotificationStore = defineStore('notifications', () => {
  const notifications = ref<Notification[]>([]);

  function add(notification: Omit<Notification, 'id'>) {
    const id = crypto.randomUUID();
    notifications.value.push({ ...notification, id });

    if (notification.timeout !== 0) {
      setTimeout(() => remove(id), notification.timeout ?? 5000);
    }
  }

  function remove(id: string) {
    notifications.value = notifications.value.filter((n) => n.id !== id);
  }

  return { notifications, add, remove };
});
```

**No Vuex.** Only Pinia with setup syntax is supported.

### Router

Lazy-load all route components:

```typescript
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/auth',
      name: 'auth',
      component: () => import('@/views/AuthPage.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/',
      meta: { layout: 'default', requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/DashboardPage.vue'),
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/UsersPage.vue'),
          meta: { requiresRole: 'admin' },
        },
      ],
    },
  ],
});

// Navigation guard
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({ name: 'auth', query: { redirect: to.fullPath } });
  }

  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return next({ name: 'dashboard' });
  }

  if (to.meta.requiresRole && !authStore.hasMinRole(to.meta.requiresRole as string)) {
    return next({ name: 'dashboard' });
  }

  next();
});

export default router;
```

### API Client

Single Axios instance with interceptors:

```typescript
// lib/api.ts
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach CSRF token
api.interceptors.request.use((config) => {
  const authStore = useAuthStore();
  if (authStore.csrfToken) {
    config.headers['X-CSRF-Token'] = authStore.csrfToken;
  }
  config.headers['X-Request-ID'] = crypto.randomUUID();
  return config;
});

// Response interceptor: handle 401
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await api.post('/auth/refresh');
        failedQueue.forEach(({ resolve }) => resolve());
        failedQueue = [];
        return api(originalRequest);
      } catch {
        failedQueue.forEach(({ reject }) => reject(error));
        failedQueue = [];
        const authStore = useAuthStore();
        authStore.clearSession();
        window.location.href = '/auth';
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

### Template Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Props | camelCase | `userName`, `isActive`, `maxItems` |
| Events | kebab-case | `@update:model-value`, `@row-select` |
| CSS classes | kebab-case or Tailwind | `user-profile`, `flex items-center` |
| Slots | kebab-case | `#header`, `#empty`, `#row-actions` |
| data-testid | kebab-case | `data-testid="submit-button"` |

### Testing Attributes

Add `data-testid` attributes on all interactive elements:

```vue
<button data-testid="submit-button" @click="handleSubmit">Submit</button>
<input data-testid="email-input" v-model="email" />
<div data-testid="error-message" v-if="error">{{ error }}</div>
```

### Error Boundaries

Every application must implement error boundary components that wrap major page sections:

- Catch errors raised inside the child component tree so the entire application does not crash
- Render a user-friendly fallback UI with a retry action
- Report the error to the configured error tracking integration
- Log the error context (component name, props, route) for debugging

### Frontend API Retry Logic

The frontend API client should automatically retry failed requests:

- Maximum 3 retry attempts using exponential backoff (1s, 2s, 4s with jitter)
- Only retry on network errors and 5xx server errors
- Never retry on 4xx client errors (these are not transient)
- Non-idempotent requests (POST, PUT, DELETE) should only be retried when the server returned no response at all

### Structured Logging in Production

In production environments, all application log output must be structured JSON (see Architecture Standard for the mandatory field schema). In development, human-readable console format is acceptable.

---

## Database Conventions

### Table and Column Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Table names | snake_case, plural | `user_accounts`, `audit_logs`, `task_items` |
| Column names | snake_case | `created_at`, `is_deleted`, `display_name` |
| Primary keys | `id UUID DEFAULT gen_random_uuid()` | `id` |
| Foreign keys | `<entity>_id` | `user_id`, `project_id` |
| Boolean columns | `is_` or `has_` prefix | `is_deleted`, `is_active`, `has_verified` |
| Timestamps | `_at` suffix, TIMESTAMPTZ | `created_at`, `updated_at`, `deleted_at` |

### Primary Key Pattern

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

### Foreign Key Pattern

```sql
user_id UUID NOT NULL REFERENCES app.user_accounts(id),
project_id UUID REFERENCES app.projects(id) ON DELETE SET NULL
```

### Index Naming

Pattern: `idx_<table>_<columns>`

```sql
CREATE INDEX idx_user_accounts_email ON app.user_accounts (email);
CREATE INDEX idx_tasks_user_status ON app.tasks (user_id, status);
CREATE INDEX idx_tasks_active ON app.tasks (created_at) WHERE is_deleted = false;
```

### Migration Files

Sequential numbered files:

```
migrations/
├── 001_initial_schema.sql
├── 002_add_user_accounts.sql
├── 003_add_projects.sql
├── 004_add_tasks.sql
├── 005_add_audit_log.sql
└── 006_add_indexes.sql
```

Each migration file contains forward-only SQL. Tracked in `app.schema_migrations`:

```sql
CREATE TABLE IF NOT EXISTS app.schema_migrations (
    version INTEGER PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Complete Table Example

```sql
CREATE TABLE app.user_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'user'
        CHECK (role IN ('guest', 'viewer', 'user', 'editor', 'manager', 'admin', 'super_admin')),
    avatar_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_accounts_email ON app.user_accounts (email);
CREATE INDEX idx_user_accounts_role ON app.user_accounts (role);
CREATE INDEX idx_user_accounts_active ON app.user_accounts (created_at) WHERE is_deleted = false;

CREATE TRIGGER trg_user_accounts_updated_at
    BEFORE UPDATE ON app.user_accounts
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at();
```

---

## API Conventions

### Endpoint Naming

- Use kebab-case for multi-word resource names: `/api/v1/resource-items`
- Use plural nouns for collections: `/api/v1/users`, `/api/v1/tasks`
- Nest sub-resources: `/api/v1/users/:userId/tasks`
- Version prefix: `/api/v1/`

### RESTful Verbs

| Method | Purpose | Response Code | Example |
|--------|---------|---------------|---------|
| `GET` | List collection | 200 | `GET /api/v1/users` |
| `GET` | Read single resource | 200 | `GET /api/v1/users/:id` |
| `POST` | Create resource | 201 | `POST /api/v1/users` |
| `PUT` | Update resource (full) | 200 | `PUT /api/v1/users/:id` |
| `DELETE` | Remove resource | 204 | `DELETE /api/v1/users/:id` |

### Consistent Response Format

**Success (single resource):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "displayName": "Test User"
  }
}
```

**Success (collection with pagination):**
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "The requested resource was not found.",
    "details": null
  }
}
```

### Pagination

Use `page` and `limit` query parameters:

```
GET /api/v1/users?page=2&limit=20&search=john
```

Default: `page=1`, `limit=20`. Maximum `limit=100`.

**Go pagination helper:**
```go
type PaginationMeta struct {
    Page       int `json:"page"`
    Limit      int `json:"limit"`
    Total      int `json:"total"`
    TotalPages int `json:"totalPages"`
}

func ParsePagination(r *http.Request) (page, limit, offset int) {
    page, _ = strconv.Atoi(r.URL.Query().Get("page"))
    limit, _ = strconv.Atoi(r.URL.Query().Get("limit"))
    if page < 1 { page = 1 }
    if limit < 1 || limit > 100 { limit = 20 }
    offset = (page - 1) * limit
    return
}
```

### Additional API Design Rules

#### HTTP Verbs

| Method | Purpose | Response Code | Idempotent |
|--------|---------|---------------|------------|
| `GET` | Read resource(s) | 200 | Yes |
| `POST` | Create resource | 201 | No |
| `PUT` | Full resource replacement | 200 | Yes |
| `PATCH` | Partial resource update | 200 | No |
| `DELETE` | Remove resource | 204 | Yes |

- Use `PATCH` for partial resource updates (modifying individual fields). Use `PUT` only for full resource replacement.
- POST endpoints that create resources must return HTTP 201 with a `Location` header pointing to the newly created resource.
- When a client sends an HTTP method not supported for a given URI, return `405 Method Not Allowed`, not `404`.

#### URI Design Rules

- No trailing slashes: `/api/v1/users` is correct; `/api/v1/users/` is not
- No file extensions in URIs: rely on `Content-Type` and `Accept` headers for content negotiation
- URI maximum length: keep below 2,000 characters to avoid issues with browsers/proxies/intermediaries
- Query parameter names: use camelCase or snake_case, hyphens are not permitted in query parameters

#### Response Payload Rules

- API responses must never return top-level JSON arrays. Always wrap collections in an object (e.g., `{"data": [...]}`). This enables future extensibility without breaking consumers.
- All dates and times in JSON payloads must use ISO 8601 format (e.g., `2025-07-16T19:20:30Z`).
- Error responses must never expose stack traces, internal system identifiers, database column names, or personal information. Log detailed diagnostics server-side only.
- Sensitive data (tokens, credentials, personal identifiers) must never appear in URLs. Pass in request bodies or headers.

#### Collection Query Conventions

In addition to `page` and `limit` for pagination, collection endpoints should support:

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `sort` | Ordering with direction prefix | `sort=+name` (ascending), `sort=-created_at` (descending) |
| `filter` | Field-level filtering | `filter[status]=active`, `filter[role]=admin` |

#### X-Request-ID Header

All API requests must include an `X-Request-ID` header containing a UUID v4 value for request correlation and cross-service tracing. If the client does not provide one, the server must generate it. Responses must echo the same `X-Request-ID` value back to the caller.

- **Frontend:** The Axios interceptor in `lib/api.ts` attaches `X-Request-ID` via `crypto.randomUUID()` on every outgoing request.
- **Go backend:** The `middleware.RequestID` middleware reads or generates the header and injects it into the request context. All structured log entries include the `request_id` field.
- **Node.js backend:** The request ID middleware reads `req.headers['x-request-id']` or generates a new UUID, attaches it to the request object, and includes it in error responses.

#### Content-Type Validation

- Validate `Content-Type` header on every request that includes a body
- Reject unexpected content types with `415 Unsupported Media Type`
- Always set correct `Content-Type` on responses

#### Error Response Enhancement

In addition to the standard `code`, `message`, and `details` fields, error responses should include:

| Field | Purpose |
|-------|---------|
| `requestId` | Correlation ID for cross-service tracing |
| `timestamp` | ISO 8601 timestamp of when the error occurred |

These fields aid debugging and incident investigation without exposing sensitive internals.

---

## Git Conventions

### Branching

- Feature branches from `main`: `feat/add-user-management`, `fix/login-redirect`
- No long-lived branches other than `main`
- Pull request reviews before merge
- No force pushes to `main`

### Conventional Commits

All commit messages follow the conventional commits format:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feat:` | New feature | `feat: add user profile page` |
| `fix:` | Bug fix | `fix: prevent duplicate form submission` |
| `chore:` | Maintenance, dependencies | `chore: update dependencies` |
| `docs:` | Documentation changes | `docs: add API endpoint documentation` |
| `test:` | Test additions or fixes | `test: add user service unit tests` |
| `refactor:` | Code restructuring | `refactor: extract validation logic` |
| `style:` | Formatting, whitespace | `style: fix indentation in router` |
| `perf:` | Performance improvements | `perf: add database index for user lookup` |

### Files That Must Not Be Committed

Add these to `.gitignore`:

```
.env
.env.local
.env.*.local
node_modules/
dist/
*.log
.DS_Store
```

Never commit files containing secrets, credentials, API keys, or connection strings.

### Environment File Convention

- `.env.example`: committed, contains all variable names with placeholder values
- `.env`: never committed, contains actual local values
- `.env.test`: test-specific overrides (committed if no secrets)
