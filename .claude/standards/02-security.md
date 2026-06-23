# Security Standard

## Compliance Target

All applications target **OWASP ASVS Level 2** compliance. This document defines mandatory security controls across authentication, authorization, input validation, transport security, and data protection.

---

## Authentication (ASVS V2)

### SSO (Preferred)

Single sign-on via OAuth 2.0 / OpenID Connect is the preferred authentication method.

**Supported providers:**
- Google OAuth 2.0
- Microsoft OIDC (via `openid-client` in Node.js or equivalent in Go)

**OAuth flow requirements:**
- State parameter: 32-byte cryptographic nonce, stored in an httpOnly cookie, validated on callback
- PKCE (Proof Key for Code Exchange) recommended for public clients
- Callback validation: only accept pre-registered redirect URIs
- Account linking: match OAuth email to existing accounts before creating new ones
- Nonce validation for OIDC `id_token` integrity

**Go OAuth pattern:**
```go
// Generate state parameter
state := base64.URLEncoding.EncodeToString(randomBytes(32))
http.SetCookie(w, &http.Cookie{
    Name:     "oauth_state",
    Value:    state,
    HttpOnly: true,
    Secure:   config.IsProduction(),
    SameSite: http.SameSiteLaxMode,
    MaxAge:   600, // 10 minutes
    Path:     "/",
})

// Redirect to provider
url := oauthConfig.AuthCodeURL(state)
http.Redirect(w, r, url, http.StatusTemporaryRedirect)
```

**Node.js OAuth pattern:**
```typescript
// Generate state parameter
const state = crypto.randomBytes(32).toString('base64url');
res.cookie('oauth_state', state, {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 10 * 60 * 1000, // 10 minutes
  path: '/',
});

// Redirect to provider
const authUrl = oauthClient.authorizationUrl({ state, scope: 'openid email profile' });
res.redirect(authUrl);
```

### Local Password Authentication (When Required)

When SSO is not available, local password authentication is supported with these requirements:

| Requirement | Value |
|-------------|-------|
| Hashing algorithm | bcrypt with auto-generated salt |
| Minimum password length | 12 characters |
| Maximum password length | 128 characters (prevent bcrypt DoS) |
| Account lockout threshold | 5 failed attempts |
| Lockout duration | 15 minutes |
| Lockout scope | Per account, not per IP |

**Go password hashing:**
```go
// Hash password
hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)

// Verify password
err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(password))
```

**Node.js password hashing:**
```typescript
import bcrypt from 'bcrypt';

// Hash password
const hash = await bcrypt.hash(password, 12);

// Verify password
const valid = await bcrypt.compare(password, storedHash);
```

---

## JWT Token Management (ASVS V3)

### Token Lifetimes and Algorithms

| Token | Lifetime | Algorithm | Storage (Server) | Storage (Client) |
|-------|----------|-----------|-------------------|-------------------|
| Access token | 15 minutes | RS256 | Not stored | httpOnly cookie + in-memory |
| Refresh token | 7 days | RS256 | SHA-256 hash in database | httpOnly cookie |

### Algorithm Pinning

Always specify the expected algorithm when verifying tokens. This prevents `alg:none` and algorithm-switching attacks.

**Go:**
```go
// Signing with RS256
token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
signedToken, err := token.SignedString(privateKey)

// Verification: pin to RS256
token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
    return publicKey, nil
}, jwt.WithValidMethods([]string{"RS256"}))
```

**Node.js (RS256, default):**
```typescript
import jwt from 'jsonwebtoken';

// Signing: use private key
const accessToken = jwt.sign(payload, privateKey, {
  algorithm: 'RS256',
  expiresIn: '15m',
  issuer: 'app-services',
  audience: 'app-api',
});

// Verification: pin to RS256, use public key
const decoded = jwt.verify(token, publicKey, {
  algorithms: ['RS256'],
  issuer: 'app-services',
  audience: 'app-api',
});
```

**Key management:**
- Use separate RSA-2048 key pairs for access and refresh tokens
- Development: Load from local PEM files, auto-generate with `npm run generate-keys`
- Production: Load from environment variables or Key Vault (Azure Key Vault, AWS Secrets Manager)
- Never commit private keys to source control
- The verification key (public) is separate from the signing key (private), preventing verification-side compromise from enabling token forgery
- Enables public key distribution for multi-service token verification without exposing signing capability

HS256 symmetric signing remains acceptable for single-service deployments where key distribution is not needed. If using HS256, the secret must be at least 64 hex characters (32 bytes of entropy).

### Refresh Token Rotation

When a refresh token is used, the server must:
1. Validate the incoming refresh token hash against the database
2. Revoke the old refresh token (delete or mark as used)
3. Issue a new refresh token
4. Issue a new access token
5. Store the SHA-256 hash of the new refresh token in the database

If a previously revoked refresh token is presented, treat it as a potential token theft, revoke **all** refresh tokens for that user.

**Refresh token hashing:**
```go
// Go
hash := sha256.Sum256([]byte(refreshToken))
hashedToken := hex.EncodeToString(hash[:])
```

```typescript
// Node.js
import { createHash } from 'crypto';
const hashedToken = createHash('sha256').update(refreshToken).digest('hex');
```

#### Differentiated Token Error Codes

When JWT verification fails, return differentiated error codes to enable client-side silent refresh:

| Failure | Code | Client Action |
|---------|------|---------------|
| Token expired | `TOKEN_EXPIRED` | Attempt silent refresh via refresh token |
| Invalid signature | `UNAUTHORIZED` | Redirect to login |
| Malformed token | `UNAUTHORIZED` | Redirect to login |
| Missing token | `UNAUTHORIZED` | Redirect to login |

```typescript
if (err instanceof jwt.TokenExpiredError) {
  return res.status(401).json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' } });
}
return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
```

### Secret Requirements

**RS256 (default):** Use RSA-2048 PEM key pairs. Generate with `npm run generate-keys`.

| Secret | Format | Required In |
|--------|--------|-------------|
| JWT_PRIVATE_KEY | RSA PEM (starts with `-----BEGIN`) | Production (env var or file) |
| JWT_PUBLIC_KEY | RSA PEM | Production (env var or file) |
| JWT_REFRESH_PRIVATE_KEY | RSA PEM | Production (env var or file) |
| JWT_REFRESH_PUBLIC_KEY | RSA PEM | Production (env var or file) |
| CSRF_SECRET | 32+ characters | Always |

**HS256 (alternative for single-service):** If using symmetric signing instead:

| Secret | Minimum Length | Recommended |
|--------|---------------|-------------|
| JWT_SECRET | 32 bytes | 64 hex characters |
| JWT_REFRESH_SECRET | 32 bytes | 64 hex characters |

- Validate key presence at application startup
- In development: generate PEM files with `npm run generate-keys`, warn if missing
- In production: reject placeholder values (`changeme`, `secret`, `password`, etc.): fail startup

---

## Session and Cookie Security (ASVS V3)

### Cookie Configuration

| Cookie | httpOnly | Secure | SameSite | Path | Max-Age |
|--------|----------|--------|----------|------|---------|
| `access_token` | true | true (prod) | Lax | `/` | 900 (15 min) |
| `refresh_token` | true | true (prod) | Lax | `/` | 604800 (7 days) |
| `csrf_token` | true | true (prod) | Lax | `/` | Session |
| `oauth_state` | true | true (prod) | Lax | `/` | 600 (10 min) |

### Rules

- **Never** store tokens in `localStorage` or `sessionStorage`: these are accessible to XSS attacks
- Access token is stored in an httpOnly cookie AND held in memory for Axios header injection
- On page refresh, the client calls `/auth/refresh` to recover the session from the refresh token cookie
- Concurrent 401 responses are handled by queuing requests and replaying them after a single token refresh

#### sameSite and OAuth SSO

Use `sameSite: 'lax'` (not `'strict'`) when using OAuth SSO. SSO callbacks are cross-site navigations, with `'strict'`, the browser will not send cookies when redirected back from the identity provider (Google, Microsoft), silently breaking the authentication flow.

For logout, cookie clearing options must match the `path` and `domain` of the original cookies so the browser removes them.

### Token Recovery Flow

```
1. Page loads → no in-memory token
2. Client calls GET /auth/refresh
3. Server reads refresh_token cookie
4. Server validates refresh token hash against database
5. Server issues new access token + new refresh token
6. Server sets new cookies, returns user data + access token in body
7. Client stores access token in memory, sets user state
```

---

## CSRF Protection (ASVS V4.2.2)

### Double-Submit Cookie Pattern

The application uses a double-submit cookie pattern with server-side validation:

1. **Server generates token**: sets it in an httpOnly cookie
2. **Client receives token**: reads the CSRF token from the response body (not the cookie)
3. **Client stores in memory**: attaches to every state-changing request as `X-CSRF-Token` header
4. **Server validates**: compares the `X-CSRF-Token` header against the cookie value using constant-time comparison

### Constant-Time Comparison

Always use constant-time comparison to prevent timing attacks:

**Go:**
```go
import "crypto/subtle"

valid := subtle.ConstantTimeCompare([]byte(headerToken), []byte(cookieToken)) == 1
```

**Node.js:**
```typescript
import { timingSafeEqual, createHmac } from 'crypto';

function csrfTokensMatch(headerToken: string, cookieToken: string): boolean {
  const a = Buffer.from(headerToken);
  const b = Buffer.from(cookieToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

### Exemptions

Skip CSRF validation for:
- Safe methods: `GET`, `HEAD`, `OPTIONS`
- API key authentication (stateless, no session to hijack)
- Authentication endpoints where no session exists yet

---

## Role-Based Access Control (ASVS V4)

### Role Hierarchy

Roles are defined as strings with a fixed hierarchy. Higher positions in the hierarchy indicate more privilege:

| Role | Description |
|------|-------------|
| `guest` | Unauthenticated / lowest privilege |
| `viewer` | Read-only access |
| `user` | Standard authenticated user |
| `editor` | Can create and modify content |
| `manager` | Team / resource manager |
| `admin` | Administrator |
| `super_admin` | System-wide administrator |

Applications may define additional roles between these levels as needed. Authorization checks use hierarchy position:

**Go:**
```go
func Authorize(minRole string) func(http.Handler) http.Handler {
    hierarchy := []string{"guest", "viewer", "user", "editor", "manager", "admin", "super_admin"}
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            user := auth.UserFromContext(r.Context())
            if indexOf(hierarchy, user.Role) < indexOf(hierarchy, minRole) {
                utils.SendError(w, utils.Forbidden("Insufficient permissions"))
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}
```

**Node.js:**
```typescript
const ROLE_HIERARCHY = ['guest', 'viewer', 'user', 'editor', 'manager', 'admin', 'super_admin'] as const;

export function authorize(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      throw AppError.forbidden('Insufficient permissions');
    }
    next();
  };
}
```

**Frontend (Vue):**
```typescript
export const ROLE_HIERARCHY = ['guest', 'viewer', 'user', 'editor', 'manager', 'admin', 'super_admin'] as const
export type Role = typeof ROLE_HIERARCHY[number]

function hasMinRole(minRole: Role): boolean {
  if (!user.value) return false
  return ROLE_HIERARCHY.indexOf(user.value.role) >= ROLE_HIERARCHY.indexOf(minRole)
}
```

### Entity-Level Permissions

For multi-tenant applications, entity-level permissions extend role-based access:

- Per-entity type access control (organizations, projects, resources)
- Scope types: `none`, `read`, `write`, `admin`
- Permission inheritance: parent entity permissions cascade to children
- Grant types: explicit, inherited, role-based
- Time-limited permissions with `valid_from` / `valid_until` timestamps

### IDOR Prevention

Every query that accesses user-scoped data must include an ownership or permission check:

```sql
-- Direct ownership check
SELECT * FROM app.tasks WHERE id = $1 AND user_id = $2 AND is_deleted = false;

-- Permission-based check
SELECT t.* FROM app.tasks t
INNER JOIN app.entity_permissions ep ON ep.entity_id = t.project_id
WHERE t.id = $1 AND ep.user_id = $2 AND ep.scope IN ('read', 'write', 'admin');
```

Never rely on the client to filter data. The server must enforce access control at the query level.

---

## Input Validation (ASVS V5)

### Server-Side Validation

All API input (body, query parameters, URL parameters) must be validated before processing.

**Node.js, Zod schemas:**
```typescript
// validators/userValidators.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email().max(255),
  displayName: z.string().min(1).max(100),
  role: z.enum(['guest', 'viewer', 'user', 'editor', 'manager', 'admin', 'super_admin']).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// middleware/validate.ts
export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw AppError.validation(
        result.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        }))
      );
    }
    req.validatedBody = result.data;
    next();
  };
}
```

**Go, Structured validation:**
```go
type CreateUserInput struct {
    Email       string `json:"email"`
    DisplayName string `json:"display_name"`
    Role        *string `json:"role"`
}

func (i *CreateUserInput) Validate() *ApiError {
    var errors []FieldError
    if !isValidEmail(i.Email) {
        errors = append(errors, FieldError{Field: "email", Message: "Invalid email address"})
    }
    if len(i.DisplayName) == 0 || len(i.DisplayName) > 100 {
        errors = append(errors, FieldError{Field: "display_name", Message: "Must be 1-100 characters"})
    }
    if len(errors) > 0 {
        return Validation(errors)
    }
    return nil
}
```

### Validation Error Response

All validation errors return HTTP 422 with field-level details:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "email", "message": "Invalid email address" },
      { "field": "display_name", "message": "Must be 1-100 characters" }
    ]
  }
}
```

### Parameterized SQL Only

All database queries must use parameterized placeholders. **Zero** string interpolation in queries.

```go
// CORRECT
row := pool.QueryRow(ctx, "SELECT * FROM app.users WHERE id = $1", userID)

// NEVER DO THIS
row := pool.QueryRow(ctx, "SELECT * FROM app.users WHERE id = '" + userID + "'")
```

### Client-Side Validation

- Vue template expressions are auto-escaped (prevents XSS)
- Use `DOMPurify` for any `v-html` rendering
- Validate form inputs before submission (but never trust client validation on the server)

### Configurable Body Size Limits

Always set explicit body size limits on JSON and URL-encoded parsers. Default to `1mb`. Make limits configurable via environment variables:

```typescript
app.use(express.json({ limit: env.BODY_LIMIT_JSON }));       // Default: '1mb'
app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT_URLENCODED })); // Default: '1mb'
```

Never rely on Express defaults, which may change across versions.

### Open Redirect Prevention

- Only allow redirect URLs starting with `/` (relative paths)
- Never redirect to user-supplied absolute URLs
- Validate redirect targets against an allowlist when absolute URLs are required

---

## HTTP Security Headers (ASVS V14)

Apply these headers on every response via middleware (Helmet for Node.js, manual for Go):

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'none'; object-src 'none'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self' data:` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `Cross-Origin-Embedder-Policy` | `require-corp` (when needed for SharedArrayBuffer) |
| `Cross-Origin-Opener-Policy` | `same-origin` |

**Go middleware:**
```go
func SecurityHeaders(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("X-Content-Type-Options", "nosniff")
        w.Header().Set("X-Frame-Options", "DENY")
        w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
        w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
        w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        w.Header().Set("Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "+
            "frame-src 'none'; object-src 'none'; img-src 'self' data: blob:; "+
            "connect-src 'self' ws: wss:; font-src 'self' data:")
        w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
        next.ServeHTTP(w, r)
    })
}
```

**Node.js with Helmet:**
```typescript
import helmet from 'helmet';

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'", 'data:'],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permissionsPolicy: {
      features: { camera: [], microphone: [], geolocation: [], payment: [], usb: [] },
    },
  })
);
```

---

## Rate Limiting (ASVS V13.6)

### Tier Configuration

| Tier | Default Limit | Window | Scope | Env Override |
|------|--------------|--------|-------|--------------|
| General API | 200 requests | 15 minutes | Per IP | `RATE_LIMIT_API` |
| Authentication | 30 requests | 15 minutes | Per IP | `RATE_LIMIT_AUTH` |
| AI / LLM | 60 requests | 1 hour | Per IP | `RATE_LIMIT_AI` |

All limits are configurable via environment variables.

### Response on Limit Exceeded

Return `429 Too Many Requests` with a `Retry-After` header indicating seconds until the limit resets:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "details": {
      "retryAfter": 120
    }
  }
}
```

### Implementation

- Use in-memory rate limiter for single-instance deployments
- Use Redis-backed rate limiter for distributed deployments
- Apply rate limiting middleware before authentication middleware (to protect unauthenticated endpoints)

#### Rate Limit Observability

- **Event logging:** Log all rate limit hits with `{ ip, path, userId, userAgent }` for security monitoring and forensics
- **Retry-After header:** Set the `Retry-After` HTTP header (RFC 6585) in addition to including it in the JSON error body
- **Endpoint scoping:** Bootstrap endpoints (`/auth/csrf-token`, `/auth/me`) should use the general API rate limit, not the stricter auth rate limit, to prevent spurious 429 errors during normal application startup

---

## CORS Policy

### Configuration

- **Explicit origin allowlist**: no wildcards (`*`), no `null` origin
- **Credentials supported**: `Access-Control-Allow-Credentials: true`
- **Multi-origin support**: origins configured via comma-separated environment variable

**Go:**
```go
allowedOrigins := strings.Split(config.AllowedOrigins, ",")

cors := cors.New(cors.Options{
    AllowedOrigins:   allowedOrigins,
    AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
    AllowedHeaders:   []string{"Content-Type", "Authorization", "X-CSRF-Token", "X-Request-ID"},
    AllowCredentials: true,
    MaxAge:           86400,
})
```

**Node.js:**
```typescript
import cors from 'cors';

app.use(
  cors({
    origin: config.ALLOWED_ORIGINS.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'],
    maxAge: 86400,
  })
);
```

#### CORS Configuration Details

- **Exposed headers:** Include `X-Correlation-ID` and `X-CSRF-Token` in `exposedHeaders` so the frontend can read them from responses
- **Methods:** Include `PATCH` alongside GET, POST, PUT, DELETE, OPTIONS
- **Headers:** Include `X-Requested-With` in `allowedHeaders`
- **Development bypass:** In development mode, allow any `localhost:*` origin via regex: `/^https?:\/\/localhost(:\d+)?$/`

---

## File Upload Security (ASVS V12)

### Validation Rules

| Check | Rule |
|-------|------|
| MIME type | Allowlist: `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| Magic bytes | Validate file header bytes match declared Content-Type |
| File size | 10 MB maximum (configurable) |
| Filename | UUID rename: never use original filename |
| Storage | Database (BYTEA) preferred; object storage acceptable; never local filesystem in production |

### Magic Byte Validation

Never trust the declared `Content-Type`. Validate actual file content:

```typescript
const MAGIC_BYTES: Record<string, Buffer> = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  'image/webp': Buffer.from([0x52, 0x49, 0x46, 0x46]), // RIFF header
  'application/pdf': Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
};

function validateMagicBytes(buffer: Buffer, declaredType: string): boolean {
  const expected = MAGIC_BYTES[declaredType];
  if (!expected) return false;
  return buffer.subarray(0, expected.length).equals(expected);
}
```

### Upload Flow

1. Check file size against limit
2. Validate MIME type against allowlist
3. Read first bytes and validate magic bytes
4. Generate UUID filename (preserve extension for serving)
5. Store file content (database BYTEA or object storage)
6. Save metadata record (original name, MIME type, size, UUID, uploader)

### Serving Files

- Never serve user uploads with the original filename
- Set `Content-Disposition: attachment` for downloads
- Set correct `Content-Type` based on validated MIME type
- Apply `X-Content-Type-Options: nosniff`

---

## WebSocket Security

### Authentication

- Authenticate on connection handshake using JWT from the cookie
- Reject connections with invalid or expired tokens
- Validate the `Origin` header against the allowed origins list

### Message Security

- Enforce maximum message size (configurable, default 64 KB)
- Validate all incoming message payloads with Zod (Node.js) or structured validation (Go)
- Structure messages with a `type` field for routing

**Node.js (Socket.io):**
```typescript
io.use((socket, next) => {
  const cookies = parseCookies(socket.handshake.headers.cookie);
  const token = cookies.access_token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    socket.data.user = decoded;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});
```

### Connection Management

- Heartbeat/ping every 30 seconds for connection health
- Automatic cleanup of stale connections
- Per-connection task limits (prevent resource exhaustion)

---

## Audit Trail

### Requirements

All data mutations (create, update, delete) must be logged to an `audit_log` table.

### Fields

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `action` | VARCHAR(20) | `create`, `update`, `delete` |
| `table_name` | VARCHAR(100) | Source table name |
| `record_id` | UUID | ID of the affected record |
| `old_data` | JSONB | Previous state (null for creates) |
| `new_data` | JSONB | New state (null for deletes) |
| `user_id` | UUID | Who performed the action |
| `ip_address` | INET | Client IP address |
| `created_at` | TIMESTAMPTZ | When the action occurred |

### Rules

- Audit logging must never crash the application, wrap in error handling with server-side logging
- Never log sensitive data: passwords, tokens, secret keys, raw PII
- Sanitize `old_data` and `new_data` before storage (strip sensitive fields)
- Retain audit logs according to data retention policy (minimum 90 days recommended)

#### Authentication Audit Actions

In addition to CRUD actions, the following authentication events are mandatory for security forensics:

| Action | When | Required Fields |
|--------|------|-----------------|
| `LOGIN` | Successful authentication | user_id, ip_address, user_agent |
| `LOGOUT` | User-initiated logout | user_id, ip_address |
| `LOGIN_FAILED` | Failed auth attempt | ip_address, user_agent, metadata (reason) |
| `TOKEN_REFRESH` | Successful token refresh | user_id, ip_address |

Domain-specific actions (e.g., `FORM_SUBMIT`, `AI_CHAT`, `RATE_LIMIT`) should be defined per application for key business flows.

Additional optional fields: `user_agent TEXT`, `metadata JSONB` (for domain-specific context).

---

## Error Handling

### Production vs Development

| Aspect | Production | Development |
|--------|-----------|-------------|
| Stack traces | Never exposed to client | Included in error response |
| Error details | Generic safe messages | Full error details |
| Server-side logging | Full details with stack | Full details with stack |

### Structured Error Response

All errors follow a consistent format:

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

### PostgreSQL Error Code Mapping

| PG Error Code | Name | HTTP Status | App Error Code |
|---------------|------|-------------|----------------|
| `23505` | `unique_violation` | 409 Conflict | `CONFLICT` |
| `23503` | `foreign_key_violation` | 400 Bad Request | `BAD_REFERENCE` |
| `23502` | `not_null_violation` | 400 Bad Request | `MISSING_REQUIRED` |
| `23514` | `check_violation` | 422 Unprocessable | `VALIDATION_ERROR` |

**Go:**
```go
func MapPgError(err error) *ApiError {
    var pgErr *pgconn.PgError
    if errors.As(err, &pgErr) {
        switch pgErr.Code {
        case "23505":
            return Conflict("A record with this value already exists")
        case "23503":
            return BadRequest("Referenced record does not exist")
        case "23502":
            return BadRequest("A required field is missing")
        case "23514":
            return Validation("Value violates a constraint")
        }
    }
    return InternalError("An unexpected error occurred")
}
```

**Node.js:**
```typescript
export function mapPgError(err: unknown): AppError {
  if (err && typeof err === 'object' && 'code' in err) {
    switch ((err as { code: string }).code) {
      case '23505': return AppError.conflict('A record with this value already exists');
      case '23503': return AppError.badRequest('Referenced record does not exist');
      case '23502': return AppError.badRequest('A required field is missing');
      case '23514': return AppError.validation('Value violates a constraint');
    }
  }
  return AppError.internal('An unexpected error occurred');
}
```

Additional PostgreSQL error mappings for production resilience:

| PG Code | HTTP | Error Code | User Message |
|---------|------|------------|--------------|
| 08000, 08003, 08006 | 503 | `CONNECTION_ERROR` | Service temporarily unavailable |
| 57P03 | 503 | `DATABASE_UNAVAILABLE` | Service temporarily unavailable |
| ETIMEDOUT | 503 | `CONNECTION_TIMEOUT` | Request timed out |

Include `url`, `method`, and `timestamp` in error responses for client-side debugging without exposing internals.

---

## Secret Management

### Rules

| Rule | Enforcement |
|------|-------------|
| All secrets in environment variables | Code review, no hardcoded strings |
| Minimum secret lengths validated at startup | Startup check, fail fast |
| Auto-generated with warning in development | Dev convenience only |
| Reject placeholders in production | Startup check: reject `changeme`, `secret`, `password` |
| Key Vault / secrets manager in production | Deployment configuration |
| Never commit `.env` files | `.gitignore`, CI checks |
| Never commit PEM key files | `keys/*.pem` and `keys/` in `.gitignore` before first commit: not after |
| Env vars take priority over filesystem for key loading | Code: check env var first, fall back to file only for local dev |
| Rotate secrets periodically | Operational procedure |

### Minimum Secret Lengths

**RS256 (default):** PEM key pairs validated at startup, must start with `-----BEGIN`.

| Secret | Requirement |
|--------|-------------|
| `JWT_PRIVATE_KEY` | RSA PEM key pair (generate with `npm run generate-keys`) |
| `JWT_PUBLIC_KEY` | RSA PEM key pair |
| `JWT_REFRESH_PRIVATE_KEY` | RSA PEM key pair |
| `JWT_REFRESH_PUBLIC_KEY` | RSA PEM key pair |
| `CSRF_SECRET` | 32+ characters |
| `DATABASE_URL` | Must contain credentials |

### Startup Validation

```typescript
// Node.js example: RS256 key validation
function validateSecrets(config: Config): void {
  const required = ['CSRF_SECRET'];
  const placeholders = ['changeme', 'secret', 'password', 'your-secret-here', 'xxx'];

  for (const key of required) {
    const value = config[key];
    if (!value || value.length < 32) {
      if (config.NODE_ENV === 'production') {
        throw new Error(`${key} must be at least 32 characters in production`);
      }
      console.warn(`WARNING: ${key} is missing or too short. Auto-generating for development.`);
      config[key] = crypto.randomBytes(32).toString('hex');
    }
    if (config.NODE_ENV === 'production' && placeholders.includes(value.toLowerCase())) {
      throw new Error(`${key} contains a placeholder value. Set a real secret in production.`);
    }
  }
}
```

---

## SSRF Prevention (OWASP API7:2023)

When the application accepts URLs or URIs from users and fetches them server-side:

- Validate inputs against an allowlist of permitted domains or IP ranges
- Block requests to internal/private network addresses (10.x, 172.16-31.x, 192.168.x, 127.x, ::1)
- Block requests to cloud metadata endpoints (169.254.169.254 and equivalents)
- Use a dedicated HTTP client for outbound requests with restricted DNS resolution
- Log all server-side fetch attempts for security monitoring

---

## Mass Assignment Prevention (OWASP API3:2023)

On create and update endpoints:

- Use explicit allowlists for writable fields, only accept fields the client is authorized to modify
- Reject unexpected fields in request bodies rather than silently ignoring them
- Never rely on blocklists for field filtering, they break when new sensitive fields are added
- Validate that role/permission/status fields cannot be set by unprivileged users through any endpoint

---

## API Response Filtering

Filter all API responses to include only fields the requesting user is authorized to see:

- Use explicit serialization allowlists, not blocklists
- Strip from responses any fields the user lacks permission for (e.g., internal IDs, other users' data, admin-only metadata)
- Apply column-level authorization in addition to row-level (IDOR) checks
- Different roles may see different response shapes for the same resource

---

## Content-Type Validation

- Validate that the `Content-Type` header matches the expected media type on every request that includes a body
- Reject requests with unexpected content types with `415 Unsupported Media Type`
- Validate that response `Content-Type` matches the actual response body format

### Content-Type Validation

Enforce Content-Type on all state-changing requests to prevent content-type confusion attacks:

- **Enforce on:** POST, PUT, PATCH
- **Allowlist:** `application/json`, `application/x-www-form-urlencoded`, `multipart/form-data`
- **Return:** 415 Unsupported Media Type for non-matching requests
- **Exclude:** SSE streams (`text/event-stream`), WebSocket upgrades
- **Position:** After CORS, before body parsing in middleware chain

```typescript
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const ct = req.headers['content-type'] || '';
    const allowed = ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'];
    if (!allowed.some(type => ct.startsWith(type))) {
      return res.status(415).json({ success: false, error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type not supported' } });
    }
  }
  next();
});
```

---

## Inter-Service API Security

For service-to-service (east-west) communication:

- Enforce authentication on all internal API calls, do not rely solely on network perimeter for trust
- Use mutual TLS, signed tokens, or service mesh identity for service authentication
- Propagate the end-user's security context across service-to-service calls for audit and authorization
- Keep internal APIs off external networks
- Apply the principle of least privilege to service-to-service credentials

---

## Sensitive Data in URLs

- Never expose sensitive data (personal identifiers, tokens, secrets, session IDs) in URL paths or query parameters
- Pass sensitive values in request bodies or headers instead
- URLs are logged by servers/proxies/CDNs; cached in browser history; and visible in referrer headers, even when encrypted in transit

---

## Deserialization Safety

- Apply integrity checks on serialized data before deserializing
- Enforce strict typing during deserialization, reject payloads that don't match expected types
- Isolate deserialization code from business logic
- Never deserialize untrusted data without validation against a schema

---

## Bulk Operation Abuse Prevention

In addition to request-rate-based rate limiting:

- Limit array sizes in request bodies (e.g., maximum batch size per request)
- Enforce maximum page sizes on paginated endpoints
- Apply per-endpoint request size limits
- Monitor for patterns of abuse via large payloads within single requests

---

## Resource Consumption and Financial Exposure

For endpoints that consume paid third-party services (LLM APIs, email/SMS providers, cloud compute):

- Require authentication on all such endpoints, never expose metered services to unauthenticated users
- Apply a dedicated rate limiter (e.g. `aiRateLimiter`) in addition to auth, auth alone does not bound cost
- Set budget alerts and hard spending caps on third-party API accounts
- Monitor for anomalous consumption patterns
- Document estimated cost-per-request for expensive endpoints
- Apply per-user and per-organization consumption limits where applicable

> **PoC-01 lesson (redteam confirmed):** A prototype comment "No auth required, validating latency" left the Ally SSE endpoint open in production code. The org API key was drainable in minutes via an automated loop. Prototype auth stubs (`// no auth for now`, `// TODO: add auth`) are **forbidden** in any code committed to main, auth must be wired before the commit, not after.

---

## Security Event Logging

Beyond the audit trail for data mutations, log these security-relevant events:

| Event Category | Examples |
|---------------|----------|
| Authentication failures | Invalid credentials, expired tokens, locked accounts |
| Authorization failures | Access denied, insufficient role, IDOR attempts |
| Input validation failures | Malformed payloads, injection attempts, schema violations |
| Rate limiting triggers | Requests blocked by rate limiter |
| Unusual patterns | Rapid sequential requests, geographic anomalies, credential stuffing patterns |

### Log Protection

- Protect logs from injection attacks (sanitize user input before logging)
- Prevent log truncation or tampering
- Restrict access to log storage and viewing
- Include correlation IDs in all security event logs for investigation

---

## API Inventory Management (OWASP API9:2023)

- Maintain an inventory of all API endpoints, including internal and partner-facing APIs
- Compare implemented routes against API documentation to identify undocumented endpoints
- Identify and secure or remove deprecated API versions
- Audit for shadow endpoints, routes that exist in code but are not in the official API documentation
- Review API inventory periodically as part of the security assessment cycle

---

## TLS Enforcement

When TLS is required, reject plain HTTP requests outright rather than redirecting them. The initial cleartext request exposes the URL (and potentially sensitive data in query parameters) even if the redirect eventually uses TLS.

---

## Third-Party API Consumption (OWASP API10:2023)

When your application consumes external or third-party APIs:

- Validate and sanitize all response data before processing, do not trust third-party data implicitly
- Apply appropriate timeouts to prevent hanging on unresponsive external services
- Implement circuit breakers for external API calls (see Architecture Standard)
- Handle unexpected response formats gracefully without exposing internal errors
- Monitor third-party API availability and response patterns

---

## Anti-Automation on Business-Critical Flows (OWASP API6:2023)

Identify business-critical flows (account creation, checkout, booking, password reset, data export) and protect them from automated abuse:

- Rate limiting alone is insufficient, intelligent automation can work within rate limits
- Consider step-up verification (CAPTCHA, email confirmation, SMS code) for sensitive flows
- Implement behavioral analysis where appropriate (timing patterns, interaction patterns)
- Monitor for bot-like activity patterns on critical endpoints

---

## API Key Security

When using API keys for authentication:

- Transmit API keys only in HTTP headers, never in URL query strings
- Implement key rotation mechanisms with overlap periods for zero-downtime rotation
- Scope keys to the minimum required permissions
- Set expiration dates on all API keys
- Log all API key usage for auditing
- Provide a self-service mechanism for key regeneration

---

## Process-Level Error Handling

All server applications must register handlers for unrecoverable process-level errors (e.g., uncaught exceptions, unhandled promise rejections):

- Log the full error with stack trace
- Initiate graceful shutdown (see Architecture Standard)
- Never silently swallow process-level errors or allow the process to continue in an undefined state
- Configure the process manager or orchestrator to restart the process after a crash

---

## Docker and Container Security

Derived from redteam findings PoC-02 and PoC-06. Mandatory for all Dockerized services.

### .dockerignore (required: no exceptions)

Every `server/` or project root containing a `Dockerfile` **must** have a `.dockerignore` that excludes:

```
.env
keys/
*.pem
node_modules/
coverage/
.git/
```

`COPY . .` without a `.dockerignore` bakes secrets/private keys/dev credentials into the image. Any party who can pull the image can extract them. A `.dockerignore` is a hard requirement.

### Non-root runtime user (required)

All Dockerfiles must create and switch to a non-root user in the **runtime stage**:

```dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
```

Running as root inside a container allows container-escape vulnerabilities to gain host-level access. Cloud Run and Kubernetes both support non-root users without configuration changes.

### Key loading order (required)

When RSA PEM keys can be loaded from either environment variables or the filesystem, **env vars must take priority**:

```typescript
// Correct: env var first, filesystem fallback for local dev only
function loadKey(envVar: string | undefined, filePath: string): string {
  if (envVar) return envVar;
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf-8');
  return '';
}
```

Never invert this order. If the filesystem check runs first, a developer who forgets to set env vars in production will silently load a dev key, which may have been committed to git.

### .gitignore must precede first commit

Add `keys/*.pem`, `keys/`, and `.env` to `.gitignore` **before** generating key files or running `npm run generate-keys`. Adding them after the fact does not remove previously committed content from history.

> **PoC-02 lesson (redteam confirmed, live exploit):** JWT private keys committed in the initial scaffold commit allowed forging RS256 tokens with `role=super_admin`. Four admin endpoints returned HTTP 200 with real data. Key rotation, git history purge (`git filter-branch`), and force push were required to remediate. Prevention cost: two lines in `.gitignore` before `npm run generate-keys`.

---

## M3 Security Findings: Codified Rules

The following rules were derived from blueteam findings T-M3-001 through T-M3-004 on the community module and Ally AI assistant. Each rule is permanently codified here so the same class of mistake cannot recur.

### T-M3-001: Public API Endpoints Serving Non-Sensitive Catalogue Data

`GET /ally/programmes` is intentionally unauthenticated. Programme catalogue data (titles, descriptions, eligibility summaries) is publicly available information equivalent to what appears on a public service-catalogue website. Requiring authentication would break the anonymous guest flow (FR-AUTH-02).

**Rule:** An unauthenticated GET endpoint is acceptable only when all four conditions hold:
1. The data is non-personal (no PII, no user-specific data)
2. The endpoint is annotated with a JSDoc comment citing the FR and this finding ID (`T-M3-001`)
3. The relevant FR explicitly requires anonymous access
4. Rate limiting is applied

Any new public GET endpoint that doesn't meet all four conditions requires a security review before merge.

### T-M3-002: HTML Sanitisation Before Storage (Stored XSS Prevention)

User-generated text content stored in the database (community thread titles/bodies, post bodies, direct messages) must have HTML tags stripped server-side before INSERT/UPDATE. Vue templates auto-escape on render, but defence-in-depth requires server-side stripping, the same data may later be rendered in admin tools, notification emails, or future surfaces without Vue's auto-escape.

**Rule:** All user-generated text fields must be passed through `text.replace(/<[^>]*>/g, '').trim()` (or an equivalent library call) before database storage. Apply stripping **before** crisis/moderation detection so keywords inside tags (e.g., `<b>homeless</b>`) are still caught. Never store raw user HTML unless `DOMPurify` or equivalent has been applied.

### T-M3-003: AI System Prompt Must Use the `system` Parameter

The Ally system prompt is hardcoded as a constant in `ent-tools.provider.ts` and passed via the Anthropic `system` API parameter (not concatenated into the user message turn). This separation is the correct pattern, the `system` parameter is processed before user content at the API level, so prompt injection cannot escalate into a system-level instruction override.

**Rule:** AI system prompts must always be passed via the `system` parameter, never by concatenating the prompt with user messages. Hardcoding the system prompt as a code constant is preferred over database-driven prompts for security-sensitive instructions: it subjects all prompt changes to code review. Document the Grade level/tone/safety rules as comments adjacent to the constant.

### T-M3-004: Unicode Homoglyph Bypass in Keyword Pattern Matching

Raw `str.toLowerCase()` is insufficient for keyword-based security filters (crisis detection, moderation, content classifiers). Adversarial input can use Unicode compatibility characters (Cyrillic lookalikes, fullwidth Latin, superscripts, fractions) to spell keywords that pass `toLowerCase()` but are visually identical. Example: `hоmeless` (Cyrillic "о") bypasses a filter checking for `homeless`.

**Rule:** All keyword/pattern matching against user input must apply `text.normalize('NFKC').toLowerCase()` before comparison; NFKC normalization collapses compatibility equivalents. Apply this in the canonical `utils/crisis-detector.ts` utility and in every local copy (e.g., `community.service.ts`); prefer importing the shared utility over maintaining local copies to prevent future drift.

---

## MAC002 Redteam Findings: Codified Rules

The following rules were derived from the MAC002 redteam offensive assessment of the community module. Each finding was confirmed through code analysis and is permanently codified here.

### MAC002-001: HTML Injection via User Profile Fields

The `displayName` and `visibleCategories` fields in `upsertMember` are user-controlled and inserted into the database. Without sanitisation these fields are a stored XSS vector, even fields not rendered as HTML today may be displayed in admin tools, audit logs, or notification emails.

**Rule:** Every user-controlled text field must be passed through `stripHtml()` (or equivalent) before any INSERT or UPDATE, regardless of whether it is currently rendered as HTML. Apply stripping to all items in array fields too (`visibleCategories.map(c => stripHtml(c))`).

### MAC002-002: Consent Gate Must Cover All Community Read Operations

`requireConsent()` was missing from `listThreads()` and `listPosts()`. A user who had never completed the FOIPPA consent notice could browse community content by calling these endpoints directly.

**Rule:** Every community service function that returns community-member-contributed content (threads, posts, peers, messages) must call `requireConsent(userId)` at the top of the function body, before any database reads. "Read-only" is not a valid reason to skip the consent gate, FOIPPA requires consent for both collection and access.

### MAC002-003: Input Length Cap on All AI-Facing Endpoints

The ally `/stream` SSE endpoint accepted unbounded `?message=` query strings. This enabled resource exhaustion and token amplification attacks. The `/escalate` POST already enforced a 2000-char cap via Zod; the SSE endpoint did not.

**Rule:** Every endpoint that forwards user input to an AI provider must enforce a character limit at the HTTP boundary before any AI call, not inside the AI provider service. Limit must match across sibling endpoints (all Ally endpoints use 2000 chars). Apply the check with an early return before any async work.

### MAC002-004: Audit Logging for Community State Changes

`optIn`, `optOut` (via `updateSettings`), and admin `removeContent` were executed without audit log entries. Privacy regulations and standard security policy require an immutable audit trail for consent operations and content moderation actions.

**Rule:** Every operation that changes community membership state (opt-in, opt-out, pause/unpause) or removes community content must call `logAuditEvent()` with an appropriate `COMMUNITY_*` action type. The audit event must be emitted AFTER the database operation succeeds. Do not log audit events optimistically before the DB write.

### MAC002-F-002: Error Responses Must Not Expose HTTP 500 for Policy Rejections

CORS rejections thrown via `new Error('...')` resulted in HTTP 500 responses. The error handler only converts `AppError` instances to proper HTTP codes; plain `Error` objects fall through to the 500 generic handler.

**Rule:** All policy rejections (auth failures, CORS, permission checks, rate limits, validation) must use `AppError.forbidden()`, `AppError.unauthorized()`, `AppError.badRequest()`, etc. , never `new Error()`. Returning 500 for a policy rejection leaks that the server has an uncaught exception on a security code path and obscures monitoring (500 alerts ≠ 403 alerts).

### MAC002-006: AI Error Messages Must Not Propagate Internal Details

Errors from AI provider calls were being written directly into SSE `error` events: `JSON.stringify({ message: (err as Error).message })`. Provider error messages can contain stack traces, API endpoint URLs, internal service names, or rate-limit quota details.

**Rule:** All error events emitted to SSE clients must use a fixed generic message (`'AI service error. Please try again.'`); log the full error internally via `logger.error()` with the real message for operational debugging. Never forward raw Error objects or `.message` strings to clients when those errors originated in external services.

### CA-001: Test-Auth Routes Must Be Gated to Non-Production Environments

The `test-signup`, `verify-email`, and `test-login` routes return a verification token directly in the HTTP response body (no email required). Mounting these routes unconditionally means an attacker in production can create and verify an account without any email access.

**Rule:** Any route or handler that exists solely for sandbox/test purposes and returns credentials, tokens, or secrets in the response body must be wrapped in a `process.env.NODE_ENV !== 'production'` guard at route registration time. A comment saying "remove before production" is not enforcement. Code is the gate.

Fix applied: `auth.routes.ts` wraps `test-signup`, `verify-email`, `test-login` registration in `if (process.env.NODE_ENV !== 'production')`.

### CA-008: Tokens Must Not Be Logged in Plaintext

Verification tokens and password-reset tokens were logged in full via `logger.info()`. In any log-aggregation environment (CloudWatch, Splunk, GCP Logging), anyone with log-read access can harvest live session-creation tokens.

**Rule:** Never log full token values. Log only a partial suffix (last 8 chars) for debugging correlation: `tokenSuffix: \`...${token.slice(-8)}\``. Full token values must never appear in any log level.

Fix applied: `test-auth.service.ts` lines 81 and 210 now log `tokenSuffix` only.
