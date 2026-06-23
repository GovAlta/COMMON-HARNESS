# Testing Standard

This standard defines testing practices across Go backends, Node.js/TypeScript backends, and Vue 3 frontends. All projects must maintain test coverage of controllers/middleware/models/services and critical UI paths.

---

## Go Backend Testing

### Framework and Tools

| Tool | Purpose |
|------|---------|
| `testing` (stdlib) | Test runner, assertions, subtests |
| `net/http/httptest` | HTTP handler and controller tests |
| `internal/testutil/` | Custom assertions, fixtures, mocks |
| `database/sql` + test DB | Integration tests with real schema |

No external test frameworks (testify, gomega, etc.). Use the standard `testing` package exclusively.

### Test Organization

```
internal/
├── controllers/
│   ├── user_controller.go
│   └── user_controller_test.go          # Co-located with implementation
├── middleware/
│   ├── auth_middleware.go
│   └── auth_middleware_test.go
├── models/
│   ├── user_model.go
│   └── user_model_test.go
├── services/
│   ├── auth_service.go
│   └── auth_service_test.go
└── testutil/
    ├── assertions.go                     # AssertStatus, AssertJSON, etc.
    ├── fixtures.go                       # Deterministic test data factories
    ├── auth.go                           # Token generation, mock auth context
    ├── db.go                             # Test DB setup, transaction wrappers
    └── mocks.go                          # Interface mock implementations
```

### Test Categories

| Category | Scope | Database | Run Command |
|----------|-------|----------|-------------|
| Unit | Controllers, middleware, utils | Mocked | `make test-unit` |
| Integration | Full request flow, model CRUD | Required | `make test-integration` |
| RBAC | Permission checks per endpoint | Required | `make test-rbac` |
| All | Everything | Required | `make test` |

### Table-Driven Tests with Subtests

Every function with multiple input/output combinations must use table-driven tests:

```go
func TestValidateEmail(t *testing.T) {
    tests := []struct {
        name    string
        email   string
        wantErr bool
    }{
        {"valid email", "user@example.com", false},
        {"missing domain", "user@", true},
        {"empty string", "", true},
        {"unicode local part", "ùser@example.com", false},
        {"multiple at signs", "user@@example.com", true},
    }

    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            err := ValidateEmail(tc.email)
            if (err != nil) != tc.wantErr {
                t.Errorf("ValidateEmail(%q) error = %v, wantErr %v", tc.email, err, tc.wantErr)
            }
        })
    }
}
```

### Controller Tests (httptest)

Test every endpoint through the full HTTP handler chain:

```go
func TestUserController_Create(t *testing.T) {
    db := testutil.SetupTestDB(t)
    router := setupRouter(db)

    t.Run("returns 201 with valid input", func(t *testing.T) {
        body := strings.NewReader(`{"name":"Jane Doe","email":"jane@example.com"}`)
        req := httptest.NewRequest("POST", "/api/v1/users", body)
        req.Header.Set("Content-Type", "application/json")
        testutil.AddAuthHeader(req, testutil.AdminToken)
        resp := httptest.NewRecorder()

        router.ServeHTTP(resp, req)

        testutil.AssertStatus(t, resp, http.StatusCreated)
        testutil.AssertJSONField(t, resp, "data.name", "Jane Doe")
    })

    t.Run("returns 400 on missing required field", func(t *testing.T) {
        body := strings.NewReader(`{"name":"Jane Doe"}`)
        req := httptest.NewRequest("POST", "/api/v1/users", body)
        req.Header.Set("Content-Type", "application/json")
        testutil.AddAuthHeader(req, testutil.AdminToken)
        resp := httptest.NewRecorder()

        router.ServeHTTP(resp, req)

        testutil.AssertStatus(t, resp, http.StatusBadRequest)
        testutil.AssertErrorResponse(t, resp, http.StatusBadRequest, "VALIDATION_ERROR")
    })

    t.Run("returns 401 without auth token", func(t *testing.T) {
        body := strings.NewReader(`{"name":"Jane Doe","email":"jane@example.com"}`)
        req := httptest.NewRequest("POST", "/api/v1/users", body)
        req.Header.Set("Content-Type", "application/json")
        resp := httptest.NewRecorder()

        router.ServeHTTP(resp, req)

        testutil.AssertStatus(t, resp, http.StatusUnauthorized)
    })

    t.Run("returns 409 on duplicate email", func(t *testing.T) {
        testutil.SeedUser(t, db, "existing@example.com")

        body := strings.NewReader(`{"name":"Another","email":"existing@example.com"}`)
        req := httptest.NewRequest("POST", "/api/v1/users", body)
        req.Header.Set("Content-Type", "application/json")
        testutil.AddAuthHeader(req, testutil.AdminToken)
        resp := httptest.NewRecorder()

        router.ServeHTTP(resp, req)

        testutil.AssertStatus(t, resp, http.StatusConflict)
    })
}
```

### RBAC Tests

Every protected endpoint must have explicit tests for each role:

```go
func TestUserController_Delete_RBAC(t *testing.T) {
    db := testutil.SetupTestDB(t)
    router := setupRouter(db)
    user := testutil.SeedUser(t, db, "target@example.com")

    tests := []struct {
        name       string
        token      string
        wantStatus int
    }{
        {"super_admin can delete", testutil.SuperAdminToken, http.StatusNoContent},
        {"admin can delete", testutil.AdminToken, http.StatusNoContent},
        {"editor cannot delete", testutil.EditorToken, http.StatusForbidden},
        {"viewer cannot delete", testutil.ViewerToken, http.StatusForbidden},
        {"unauthenticated returns 401", "", http.StatusUnauthorized},
    }

    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            req := httptest.NewRequest("DELETE", "/api/v1/users/"+user.ID, nil)
            if tc.token != "" {
                testutil.AddAuthHeader(req, tc.token)
            }
            resp := httptest.NewRecorder()

            router.ServeHTTP(resp, req)

            testutil.AssertStatus(t, resp, tc.wantStatus)
        })
    }
}
```

### Middleware Tests

```go
func TestRateLimitMiddleware(t *testing.T) {
    handler := RateLimitMiddleware(10, time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    }))

    t.Run("allows requests under limit", func(t *testing.T) {
        for i := 0; i < 10; i++ {
            req := httptest.NewRequest("GET", "/", nil)
            req.RemoteAddr = "192.168.1.1:1234"
            resp := httptest.NewRecorder()
            handler.ServeHTTP(resp, req)
            testutil.AssertStatus(t, resp, http.StatusOK)
        }
    })

    t.Run("blocks requests over limit", func(t *testing.T) {
        req := httptest.NewRequest("GET", "/", nil)
        req.RemoteAddr = "192.168.1.1:1234"
        resp := httptest.NewRecorder()
        handler.ServeHTTP(resp, req)
        testutil.AssertStatus(t, resp, http.StatusTooManyRequests)
    })

    t.Run("sets rate limit headers", func(t *testing.T) {
        req := httptest.NewRequest("GET", "/", nil)
        req.RemoteAddr = "192.168.1.2:1234"
        resp := httptest.NewRecorder()
        handler.ServeHTTP(resp, req)

        if resp.Header().Get("X-RateLimit-Limit") == "" {
            t.Error("expected X-RateLimit-Limit header")
        }
        if resp.Header().Get("X-RateLimit-Remaining") == "" {
            t.Error("expected X-RateLimit-Remaining header")
        }
    })
}
```

### Integration Tests with Database

```go
func TestUserModel_Create_Integration(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test in short mode")
    }

    db := testutil.SetupTestDB(t)
    t.Cleanup(func() { testutil.TruncateTables(t, db, "users") })

    t.Run("inserts user and returns generated ID", func(t *testing.T) {
        user, err := models.CreateUser(db, models.CreateUserInput{
            Name:  "Integration Test",
            Email: "integration@example.com",
        })
        if err != nil {
            t.Fatalf("unexpected error: %v", err)
        }
        if user.ID == "" {
            t.Error("expected non-empty user ID")
        }
    })

    t.Run("returns conflict error on duplicate email", func(t *testing.T) {
        _, err := models.CreateUser(db, models.CreateUserInput{
            Name:  "Duplicate",
            Email: "integration@example.com",
        })
        if !errors.Is(err, models.ErrDuplicate) {
            t.Errorf("expected ErrDuplicate, got %v", err)
        }
    })

    t.Run("uses parameterized queries", func(t *testing.T) {
        // Verify SQL injection attempt is safely handled
        _, err := models.CreateUser(db, models.CreateUserInput{
            Name:  "Robert'; DROP TABLE users;--",
            Email: "bobby@tables.com",
        })
        if err != nil {
            t.Fatalf("parameterized query should handle special characters: %v", err)
        }
    })
}
```

### Test Utility Package (`testutil/`)

```go
// assertions.go
func AssertStatus(t *testing.T, resp *httptest.ResponseRecorder, expected int) {
    t.Helper()
    if resp.Code != expected {
        t.Errorf("expected status %d, got %d; body: %s", expected, resp.Code, resp.Body.String())
    }
}

func AssertErrorResponse(t *testing.T, resp *httptest.ResponseRecorder, status int, code string) {
    t.Helper()
    AssertStatus(t, resp, status)
    var errResp struct {
        Error struct {
            Code    string `json:"code"`
            Message string `json:"message"`
        } `json:"error"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&errResp); err != nil {
        t.Fatalf("failed to decode error response: %v", err)
    }
    if errResp.Error.Code != code {
        t.Errorf("expected error code %q, got %q", code, errResp.Error.Code)
    }
}

func AssertJSONField(t *testing.T, resp *httptest.ResponseRecorder, path string, expected interface{}) {
    t.Helper()
    // Parse JSON and walk dot-separated path to assert value
}

func AssertPaginated(t *testing.T, resp *httptest.ResponseRecorder, expectedTotal int) {
    t.Helper()
    // Assert response contains pagination metadata with correct total
}

// fixtures.go
const (
    FixtureUserID    = "550e8400-e29b-41d4-a716-446655440001"
    FixtureAdminID   = "550e8400-e29b-41d4-a716-446655440002"
    FixtureProjectID = "550e8400-e29b-41d4-a716-446655440010"
)

func SeedUser(t *testing.T, db *sql.DB, email string) User {
    t.Helper()
    // Insert user with deterministic data, return created entity
}

func SeedUserWithRole(t *testing.T, db *sql.DB, email string, role string) User {
    t.Helper()
    // Insert user with specific role assignment
}

// auth.go
var (
    SuperAdminToken = generateTestToken("super_admin")
    AdminToken      = generateTestToken("admin")
    EditorToken     = generateTestToken("editor")
    ViewerToken     = generateTestToken("viewer")
)

func AddAuthHeader(req *http.Request, token string) {
    req.Header.Set("Authorization", "Bearer "+token)
}

// db.go
func SetupTestDB(t *testing.T) *sql.DB {
    t.Helper()
    // Connect to test database, run migrations, return connection
    // Register cleanup to close connection
}

func TruncateTables(t *testing.T, db *sql.DB, tables ...string) {
    t.Helper()
    // Truncate specified tables for clean test state
}
```

### Coverage

Run with `make test-coverage` to generate an HTML coverage report.

Required coverage areas:
- All controller/handler functions (every endpoint, every HTTP method)
- All middleware (auth, CSRF, rate limiting, validation, error handling, CORS)
- All RBAC permission checks (every role against every protected endpoint)
- All model CRUD operations (create, read, update, delete, list with pagination)
- Critical service business logic (auth flows, token refresh, password hashing)
- Error handling paths (validation errors, not found, conflict, internal errors)

---

## Node.js/TypeScript Backend Testing

### Framework and Tools

| Tool | Purpose |
|------|---------|
| Vitest | Test runner (Jest-compatible API) |
| Supertest | Express HTTP integration tests |
| `vitest/vi` | Mocking, spying, timers |

### Test Organization

```
src/
├── __tests__/
│   ├── controllers/
│   │   ├── user.controller.test.ts
│   │   └── auth.controller.test.ts
│   ├── middleware/
│   │   ├── auth.middleware.test.ts
│   │   ├── csrf.middleware.test.ts
│   │   └── rateLimit.middleware.test.ts
│   ├── models/
│   │   ├── user.model.test.ts
│   │   └── project.model.test.ts
│   ├── services/
│   │   ├── auth.service.test.ts
│   │   └── email.service.test.ts
│   └── integration/
│       ├── auth.flow.test.ts
│       └── user.crud.test.ts
├── controllers/
├── middleware/
├── models/
└── services/
```

### Controller Tests (Supertest)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app'
import { setupTestDB, teardownTestDB, seedUser } from '../helpers/db'

describe('POST /api/v1/users', () => {
  beforeAll(async () => {
    await setupTestDB()
  })

  afterAll(async () => {
    await teardownTestDB()
  })

  it('creates a user and returns 201', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Jane Doe', email: 'jane@example.com' })
      .expect(201)

    expect(res.body.data).toMatchObject({
      name: 'Jane Doe',
      email: 'jane@example.com',
    })
    expect(res.body.data.id).toBeDefined()
  })

  it('returns 400 on missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Jane Doe' })
      .expect(400)

    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 401 without auth token', async () => {
    await request(app)
      .post('/api/v1/users')
      .send({ name: 'Jane Doe', email: 'jane@example.com' })
      .expect(401)
  })

  it('returns 409 on duplicate email', async () => {
    await seedUser({ email: 'existing@example.com' })

    await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Another', email: 'existing@example.com' })
      .expect(409)
  })
})
```

### Middleware Tests

```typescript
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { csrfMiddleware } from '../../middleware/csrf'

describe('CSRF Middleware', () => {
  const app = express()
  app.use(csrfMiddleware)
  app.post('/test', (req, res) => res.json({ ok: true }))

  it('rejects POST without CSRF token', async () => {
    await request(app)
      .post('/test')
      .expect(403)
  })

  it('accepts POST with valid CSRF token', async () => {
    // First GET to obtain token
    const getRes = await request(app).get('/csrf-token')
    const token = getRes.body.token

    await request(app)
      .post('/test')
      .set('X-CSRF-Token', token)
      .expect(200)
  })
})
```

### Model Tests (SQL Parameterization)

```typescript
import { describe, it, expect } from 'vitest'
import { createUser, findUserByEmail } from '../../models/user.model'
import { setupTestDB, teardownTestDB } from '../helpers/db'

describe('User Model', () => {
  beforeAll(() => setupTestDB())
  afterAll(() => teardownTestDB())

  it('creates a user with parameterized INSERT', async () => {
    const user = await createUser({
      name: 'Test User',
      email: 'test@example.com',
    })
    expect(user.id).toBeDefined()
  })

  it('safely handles SQL injection attempts', async () => {
    const user = await createUser({
      name: "Robert'; DROP TABLE users;--",
      email: 'bobby@tables.com',
    })
    expect(user.name).toBe("Robert'; DROP TABLE users;--")
  })

  it('maps duplicate key error to ConflictError', async () => {
    await createUser({ name: 'First', email: 'dupe@example.com' })
    await expect(
      createUser({ name: 'Second', email: 'dupe@example.com' })
    ).rejects.toThrow('DUPLICATE')
  })

  it('never uses string interpolation in queries', () => {
    // Static analysis: grep model files for template literals in query strings
    // This test serves as a documented requirement
  })
})
```

### Service Tests (Mocked Dependencies)

```typescript
import { describe, it, expect, vi } from 'vitest'
import { AuthService } from '../../services/auth.service'

describe('AuthService', () => {
  const mockUserModel = {
    findByEmail: vi.fn(),
    create: vi.fn(),
  }
  const mockTokenService = {
    generate: vi.fn(),
    verify: vi.fn(),
  }
  const authService = new AuthService(mockUserModel, mockTokenService)

  it('returns tokens on valid login', async () => {
    mockUserModel.findByEmail.mockResolvedValue({
      id: '1',
      email: 'user@example.com',
      passwordHash: await hash('password123'),
    })
    mockTokenService.generate.mockReturnValue('jwt-token')

    const result = await authService.login('user@example.com', 'password123')

    expect(result.accessToken).toBe('jwt-token')
    expect(mockTokenService.generate).toHaveBeenCalledWith({ userId: '1' })
  })

  it('throws on invalid credentials', async () => {
    mockUserModel.findByEmail.mockResolvedValue(null)

    await expect(
      authService.login('unknown@example.com', 'password')
    ).rejects.toThrow('INVALID_CREDENTIALS')
  })
})
```

---

## Vue 3 Frontend Testing

### Framework and Tools

| Tool | Purpose |
|------|---------|
| Vitest | Test runner and assertions |
| Vue Test Utils | Component mounting and interaction |
| `@pinia/testing` | Store testing with `createTestingPinia` |
| `happy-dom` | Lightweight DOM environment (preferred over jsdom) |

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

### Test Organization

```
src/
├── components/
│   ├── UserProfile.vue
│   └── __tests__/
│       └── UserProfile.spec.ts
├── composables/
│   ├── useAuth.ts
│   └── __tests__/
│       └── useAuth.spec.ts
├── pages/
│   └── __tests__/
├── stores/
│   └── __tests__/
├── router/
│   └── __tests__/
│       └── guards.spec.ts
└── api/
    └── __tests__/
        └── interceptors.spec.ts
```

### Component Tests

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createMemoryHistory } from 'vue-router'
import UserProfile from '../UserProfile.vue'

function mountWithPlugins(component: any, options = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })

  return mount(component, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn }), router],
      stubs: { 'router-link': true },
    },
    ...options,
  })
}

describe('UserProfile', () => {
  it('renders user name from props', () => {
    const wrapper = mountWithPlugins(UserProfile, {
      props: { user: { id: '1', name: 'Jane Doe', email: 'jane@example.com' } },
    })

    expect(wrapper.text()).toContain('Jane Doe')
  })

  it('emits edit event when edit button is clicked', async () => {
    const wrapper = mountWithPlugins(UserProfile, {
      props: { user: { id: '1', name: 'Jane Doe', email: 'jane@example.com' } },
    })

    await wrapper.find('[data-testid="edit-button"]').trigger('click')

    expect(wrapper.emitted('edit')).toHaveLength(1)
  })

  it('renders slot content', () => {
    const wrapper = mountWithPlugins(UserProfile, {
      props: { user: { id: '1', name: 'Jane Doe', email: 'jane@example.com' } },
      slots: { actions: '<button>Custom Action</button>' },
    })

    expect(wrapper.text()).toContain('Custom Action')
  })

  it('shows loading skeleton when loading prop is true', () => {
    const wrapper = mountWithPlugins(UserProfile, {
      props: { loading: true },
    })

    expect(wrapper.find('[data-testid="loading-skeleton"]').exists()).toBe(true)
  })
})
```

### Composable Tests

```typescript
import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useAuth } from '../useAuth'

describe('useAuth', () => {
  it('starts in unauthenticated state', () => {
    const { isAuthenticated, user } = useAuth()
    expect(isAuthenticated.value).toBe(false)
    expect(user.value).toBeNull()
  })

  it('updates state after successful login', async () => {
    const { login, isAuthenticated, user } = useAuth()

    vi.spyOn(api, 'post').mockResolvedValue({
      data: { user: { id: '1', name: 'Jane' }, accessToken: 'token' },
    })

    await login('jane@example.com', 'password')
    await flushPromises()

    expect(isAuthenticated.value).toBe(true)
    expect(user.value?.name).toBe('Jane')
  })

  it('clears state on logout', async () => {
    const { login, logout, isAuthenticated } = useAuth()

    vi.spyOn(api, 'post').mockResolvedValue({
      data: { user: { id: '1', name: 'Jane' }, accessToken: 'token' },
    })
    await login('jane@example.com', 'password')

    await logout()

    expect(isAuthenticated.value).toBe(false)
  })
})
```

### Store Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../useAuthStore'

describe('AuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with no user', () => {
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
  })

  it('sets user and authentication state', () => {
    const store = useAuthStore()
    store.setUser({ id: '1', name: 'Test User', role: 'admin' })

    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.name).toBe('Test User')
  })

  it('provides role-based getters', () => {
    const store = useAuthStore()
    store.setUser({ id: '1', name: 'Admin', role: 'admin' })

    expect(store.isAdmin).toBe(true)
    expect(store.isViewer).toBe(false)
  })

  it('clears state on logout', () => {
    const store = useAuthStore()
    store.setUser({ id: '1', name: 'Test', role: 'viewer' })
    store.clearUser()

    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
  })
})
```

### Router Guard Tests

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'
import { routes } from '../../router'
import { useAuthStore } from '../../stores/useAuthStore'

describe('Router Guards', () => {
  let router: ReturnType<typeof createRouter>

  beforeEach(() => {
    setActivePinia(createPinia())
    router = createRouter({
      history: createMemoryHistory(),
      routes,
    })
  })

  it('redirects unauthenticated users to login', async () => {
    await router.push('/dashboard')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('allows authenticated users to access protected routes', async () => {
    const store = useAuthStore()
    store.setUser({ id: '1', name: 'User', role: 'viewer' })

    await router.push('/dashboard')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('redirects authenticated users away from login page', async () => {
    const store = useAuthStore()
    store.setUser({ id: '1', name: 'User', role: 'viewer' })

    await router.push('/login')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('blocks access to admin routes for non-admin users', async () => {
    const store = useAuthStore()
    store.setUser({ id: '1', name: 'User', role: 'viewer' })

    await router.push('/admin')
    await router.isReady()

    expect(router.currentRoute.value.path).not.toBe('/admin')
  })
})
```

### API Interceptor Tests

```typescript
import { describe, it, expect, vi } from 'vitest'
import { apiClient } from '../../api/client'
import MockAdapter from 'axios-mock-adapter'

describe('API Interceptors', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it('retries request after 401 with refreshed token', async () => {
    let callCount = 0
    mock.onGet('/api/v1/users').reply(() => {
      callCount++
      if (callCount === 1) return [401, { error: { code: 'TOKEN_EXPIRED' } }]
      return [200, { data: [] }]
    })
    mock.onPost('/api/v1/auth/refresh').reply(200, {
      accessToken: 'new-token',
    })

    const response = await apiClient.get('/api/v1/users')

    expect(response.status).toBe(200)
    expect(callCount).toBe(2)
  })

  it('redirects to login after failed token refresh', async () => {
    const routerPush = vi.fn()
    mock.onGet('/api/v1/users').reply(401)
    mock.onPost('/api/v1/auth/refresh').reply(401)

    await expect(apiClient.get('/api/v1/users')).rejects.toThrow()
  })

  it('retries request with fresh CSRF token on 403 CSRF error', async () => {
    let callCount = 0
    mock.onPost('/api/v1/users').reply(() => {
      callCount++
      if (callCount === 1) return [403, { error: { code: 'CSRF_TOKEN_INVALID' } }]
      return [201, { data: { id: '1' } }]
    })
    mock.onGet('/api/v1/csrf-token').reply(200, { token: 'new-csrf-token' })

    const response = await apiClient.post('/api/v1/users', { name: 'Test' })

    expect(response.status).toBe(201)
    expect(callCount).toBe(2)
  })
})
```

### Test Selectors

Use `data-testid` attributes for stable test targeting that is decoupled from CSS and DOM structure:

```vue
<!-- Component template -->
<template>
  <div data-testid="user-card">
    <h2 data-testid="user-name">{{ user.name }}</h2>
    <button data-testid="edit-button" @click="$emit('edit')">Edit</button>
    <div v-if="loading" data-testid="loading-skeleton" />
  </div>
</template>
```

```typescript
// Test file
wrapper.find('[data-testid="user-name"]')     // Target by test ID
wrapper.find('[data-testid="edit-button"]')    // Stable across CSS changes
```

#### Test Environment: happy-dom

For Vue component tests, use `happy-dom` instead of `jsdom` as the test environment. It is significantly faster and has sufficient DOM API coverage for Vue component testing:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        url: 'http://localhost:5173',
      },
    },
  },
});
```

#### Playwright E2E Configuration

For E2E tests, configure Playwright with production-like settings:

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

Key settings:
- `retries: 1`: reduces flaky test failures in CI
- `trace: 'retain-on-failure'`: captures full execution traces for debugging failed tests
- `reuseExistingServer`: avoids starting a second server during local development
- `screenshot: 'only-on-failure'`: captures visual state on failure for debugging

---

## Test Patterns Summary

| Pattern | Scope | External Dependencies | Database |
|---------|-------|-----------------------|----------|
| Unit | Single function or class | Mocked | No |
| Integration | Full request flow | Real | Yes |
| Controller | HTTP request to response | Mocked or real | Optional |
| Middleware | Request pipeline behavior | Mocked | No |
| Model | Data access and SQL | Real | Yes |
| Component | Vue component rendering | Mocked | No |
| Composable | Reactive state logic | Mocked | No |
| Store | Pinia state management | None | No |
| Router Guard | Navigation behavior | Mocked store | No |
| Interceptor | HTTP client behavior | Mocked HTTP | No |

---

## Coverage Requirements

### Coverage Thresholds

| Scope | Line Coverage | Branch Coverage |
|-------|--------------|-----------------|
| Backend (Go) | 80% minimum | 70% minimum |
| Backend (Node.js/TypeScript) | 80% minimum | 70% minimum |
| Frontend (Vue/TypeScript) | 70% minimum | 60% minimum |
| Security-critical code (auth, RBAC, input validation, CSRF) | 90% minimum | -- |
| E2E | Cover all critical user flows: login, CRUD operations, error states, role-based access | -- |

These thresholds are enforced in CI. PRs that reduce coverage below these minimums must not be merged. Security-critical code has a higher bar because failures in those paths have outsized impact.

### Mandatory Coverage Areas

| Area | What to Cover |
|------|--------------|
| Controllers/Handlers | Every endpoint and HTTP method, including success and error paths |
| Middleware | Auth, CSRF, rate limiting, validation, error handling, CORS |
| Models | All CRUD operations, error mapping, SQL parameterization |
| Services | Business logic, edge cases, error handling |
| RBAC | Every role against every protected endpoint |
| Router Guards | Auth redirects, role-based access, public routes |
| Stores | State mutations, getters, actions |
| Composables | Reactive state, async operations, cleanup |
| API Interceptors | 401 refresh flow, CSRF retry, error transformation |

### Running Tests

```bash
# Go backend
make test              # All tests
make test-unit         # Unit tests only (no DB required)
make test-integration  # Integration tests (DB required)
make test-rbac         # RBAC permission tests
make test-coverage     # Generate HTML coverage report

# Node.js backend
npm test               # All tests
npm run test:unit      # Unit tests only
npm run test:int       # Integration tests
npm run test:coverage  # Coverage report

# Vue frontend
npm test               # All tests
npm run test:unit      # Unit tests only
npm run test:coverage  # Coverage report
```

---

## Test Data

### Deterministic Fixtures

Use fixed UUIDs and predictable data for reproducible test results:

```go
// Go fixtures
const (
    FixtureUserID      = "550e8400-e29b-41d4-a716-446655440001"
    FixtureAdminID     = "550e8400-e29b-41d4-a716-446655440002"
    FixtureProjectID   = "550e8400-e29b-41d4-a716-446655440010"
    FixtureOrgID       = "550e8400-e29b-41d4-a716-446655440020"
)
```

```typescript
// TypeScript fixtures
export const fixtures = {
  userId: '550e8400-e29b-41d4-a716-446655440001',
  adminId: '550e8400-e29b-41d4-a716-446655440002',
  projectId: '550e8400-e29b-41d4-a716-446655440010',
  orgId: '550e8400-e29b-41d4-a716-446655440020',
} as const
```

### Factory Functions

```go
// Go factory
func NewTestUser(overrides ...func(*User)) User {
    u := User{
        ID:    FixtureUserID,
        Name:  "Test User",
        Email: "test@example.com",
        Role:  "viewer",
    }
    for _, fn := range overrides {
        fn(&u)
    }
    return u
}

// Usage
user := NewTestUser(func(u *User) {
    u.Role = "admin"
    u.Email = "admin@example.com"
})
```

```typescript
// TypeScript factory
export function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: fixtures.userId,
    name: 'Test User',
    email: 'test@example.com',
    role: 'viewer',
    ...overrides,
  }
}

// Usage
const admin = createTestUser({ role: 'admin', email: 'admin@example.com' })
```

### Database Seed Scripts

```go
// Go seed for integration tests
func SeedTestData(t *testing.T, db *sql.DB) TestData {
    t.Helper()
    admin := SeedUserWithRole(t, db, "admin@test.com", "admin")
    viewer := SeedUserWithRole(t, db, "viewer@test.com", "viewer")
    project := SeedProject(t, db, admin.ID, "Test Project")
    return TestData{Admin: admin, Viewer: viewer, Project: project}
}
```

```typescript
// TypeScript seed for integration tests
export async function seedTestData(db: Database): Promise<TestData> {
  const admin = await seedUser(db, { email: 'admin@test.com', role: 'admin' })
  const viewer = await seedUser(db, { email: 'viewer@test.com', role: 'viewer' })
  const project = await seedProject(db, { ownerId: admin.id, name: 'Test Project' })
  return { admin, viewer, project }
}
```

### Cleanup Strategies

| Strategy | When to Use | Example |
|----------|-------------|---------|
| Transaction rollback | Unit/controller tests | Wrap each test in a transaction, rollback after |
| Table truncation | Integration test suites | `TRUNCATE TABLE users, projects CASCADE` after suite |
| `t.Cleanup()` (Go) | Any test needing teardown | `t.Cleanup(func() { truncate(db) })` |
| `afterAll` / `afterEach` | Node.js/TypeScript tests | `afterAll(() => teardownTestDB())` |
| Isolated test database | CI/CD pipelines | Spin up fresh DB per pipeline run |

---

## Resilience and Non-Functional Testing

### Chaos and Failure Injection Testing

Include a testing category that verifies application behavior under failure conditions:

| Failure Scenario | What to Verify |
|-----------------|----------------|
| Database unavailability | Readiness probe returns 503; in-flight requests receive appropriate errors; application recovers when database returns |
| External service timeout | Circuit breaker opens; fallback responses are served; normal operation resumes after recovery |
| Network latency injection | Timeouts fire correctly; requests do not hang indefinitely |
| Resource exhaustion (memory, connections) | Application degrades gracefully rather than crashing without warning |

These tests confirm graceful degradation and recovery rather than only testing the happy path.

### Performance Baseline Testing

Require performance baselines that:

- Establish expected throughput and latency under normal load
- Identify breaking points (maximum concurrent connections, queue depth limits)
- Validate that scaling mechanisms trigger at the correct thresholds
- Are re-validated after significant architectural or dependency changes

### Health Check Validation

Health check endpoints (liveness and readiness probes) must have dedicated tests:

- Verify all failure modes are correctly detected (e.g., database down returns 503 on readiness)
- Confirm no false positives (a healthy system never returns unhealthy status)
- Confirm recovery detection (when a dependency comes back, the probe returns healthy)

### Graceful Shutdown Verification

Verify clean shutdown behavior:

- In-flight requests complete before the process exits
- Database and cache connections are closed cleanly (no connection leaks)
- Log buffers are flushed
- The process exits with the expected exit code

### Frontend Error Boundary Testing

Frontend error boundary components must be covered by tests that verify:

- Rendering errors in child components are caught without crashing the entire UI
- Fallback content renders correctly
- The user has a recovery path (e.g., a "Try again" action)
- Errors are reported to the configured error tracking service

### Frontend Performance Monitoring

All frontend applications should measure and report Core Web Vitals (LCP, CLS, INP/FID, FCP, TTFB):

- Verify that performance monitoring instrumentation initializes correctly
- Confirm that metrics are captured and reported to the analytics endpoint
- Monitor for long tasks (> 50ms) and log them as warnings

---

## Maintenance Testing Cadence

Establish a schedule for re-running specialized tests:

| Test Category | Cadence | Trigger |
|--------------|---------|---------|
| Chaos / resilience tests | Quarterly | Also after infrastructure changes |
| Alert and monitoring validation | Quarterly | Also after alerting rule changes |
| Performance baselines | After significant changes | Also quarterly |
| Dependency update validation | Monthly | Also on major dependency upgrades |
| Security regression tests | Every release | Also after vulnerability patches |

---

## Cross-Layer Traceability

When building multi-tier applications, verify end-to-end consistency:

- Every data entity has a corresponding database table, API endpoint(s), and UI representation
- Every business rule is enforced at the appropriate layer (database constraint, API validation, or UI validation) with documentation of where enforcement occurs
- Test cases should trace to requirements, each testable requirement should have at least one test case covering it
- Use stable identifiers (requirement IDs, entity names) for cross-referencing rather than prose descriptions

---

## Test Data Isolation

- Production data must never be used for testing at any environment below user acceptance testing
- Use synthetic or anonymized data for development/integration/QA testing
- Test databases should be isolated per pipeline run in CI/CD to prevent cross-contamination
