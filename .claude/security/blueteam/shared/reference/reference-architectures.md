---
title: "Reference Security Architectures"
description: Externalized reference architecture profiles for organizational web applications. Read by skills/03-security-architecture.md. Three profiles (internal/public/dual) plus data-classification overlays and organizational API architecture baseline.
version: 1.0.0
status: active
---

# organizational Reference Security Architectures

This file defines the reference security architectures that the `skills/03-security-architecture.md` uses for profile identification and gap analysis. It is externalized to allow independent updates as organizational standards evolve.

---

## Profile A: Internal Staff Application

**Use when**: Application serves organizational staff and contractors only (no citizen access), with authentication via Enterprise IdP (e.g. Microsoft Entra ID).

### Identity & Authentication
- **IdP**: Enterprise IdP (e.g. Microsoft Entra ID): OIDC / Authorization Code + PKCE for web clients
- **Driver**: Enterprise IdP auth module (e.g. `auth-entra-id`)
- **Session model**: Server-side sessions (NOT JWT for user auth). JWT used only for S2S service tokens.
- **Token storage**: Encrypted at rest in server session store; never persisted to client beyond session cookie
- **MFA**: Enforced by Enterprise IdP conditional access policy (not application-level); assume present for organizational staff
- **Dev/test auth**: Mock driver (`auth-mock`) acceptable in non-production environments only

### Authorization
- **Model**: RBAC enforced server-side via middleware (`requireRole()`) on every protected endpoint
- **Role source**: Enterprise IdP token claims (`roles` → `role` → `groups` in priority order)
- **Least privilege**: Default role assigned via IdP default role config; elevated roles require explicit IdP assignment
- **Per-object authorization**: Required when application data is user-scoped; verify ownership server-side on every access
- **Admin endpoints**: Must not be discoverable by unprivileged users; require explicit `requireRole('admin')` guard

### Session Architecture
- **Store**: PostgreSQL (`connect-pg-simple`) in production; Redis acceptable
- **Cookie**: `httpOnly`, `secure=true`, `sameSite=lax`
- **Timeout**: 30 minutes idle (ASVS V3.3.1); configurable via `SESSION_MAX_AGE`
- **Rotation**: Session ID rotated on privilege change and authentication

### Data Protection
- **In transit**: TLS 1.2+ enforced; HTTP requests rejected (not redirected)
- **At rest**: PostgreSQL TDE (Azure Database for PostgreSQL or organizational on-premises with TDE enabled)
- **Secrets**: Azure Key Vault (production); environment variables via process.env (never hardcoded)
- **Field-level encryption**: Required for Protected B sensitive fields (PHN, SIN, medical data, financial data): see Classification Overlay below

### Perimeter & Transport
- **API Gateway**: API Gateway required for all north-south (client-to-service) traffic
- **BFF Pattern**: Express API acts as Backend for Frontend; proxies to private backend APIs with OAuth service token
- **East-West auth**: OAuth 2.0 Client Credentials (approved); service account, API key, JWT, mTLS also approved
- **Rate limiting**: All endpoints including health checks (100 req/15min general; 5/15min auth endpoints)
- **Security headers**: Helmet (CSP, X-Frame-Options, HSTS, Permissions-Policy)
- **CORS**: Restricted to `CORS_ORIGIN` whitelist; credentials required

### Logging & Audit
- **Format**: Structured JSON (pino); correlation ID in every entry via `x-request-id`
- **PII**: Automatic redaction (passwords, tokens, emails, SSNs, credit cards) before write
- **Audit log**: Required for all state-changing operations (create/update/delete) on protected data
- **Telemetry**: OpenTelemetry (OTLP) for distributed tracing; Azure Monitor or equivalent
- **Log retention**: Per Log Management Standard

### Required Modules (AIM Template)
`security-core`, `auth-core`, `auth-entra-id`, `data-postgres`, `session-store-postgres` (or `session-store-redis`), `service-auth` (if receiving S2S calls)

---

## Profile B: Public Citizen Application

**Use when**: Application serves end users or members of the public. Authentication via Corporate OIDC Provider or External Identity Gateway (SAML 2.0).

### Identity & Authentication
- **IdP**: Corporate OIDC Provider / External Identity Gateway: SAML 2.0
- **Driver**: `auth-saml` module from AIM template
- **Session model**: Server-side sessions with Redis store (required for SAML cross-site POST flow)
- **SAML requirements**: `SAML_WANT_ASSERTIONS_SIGNED=true`, `SAML_WANT_RESPONSE_SIGNED=true`, `sha256` signature algorithm minimum
- **Cookie**: `httpOnly`, `secure=true`, `sameSite=none` (required for SAML cross-site IdP POST callbacks)
- **Token encryption**: SAML assertion decryption key stored as environment secret (never on disk)

### Authorization
- **Model**: Citizen-scoped RBAC; typically single role (`citizen`) with data ownership enforced per-object
- **Per-object authorization**: Mandatory: citizen may only access their own data records
- **Admin access**: Separate admin interface strongly preferred; if in same app, strict role separation required

### Session Architecture
- **Store**: Redis required (in-memory not suitable for SAML callback flow across instances)
- **Redis auth**: Managed Identity (e.g. Entra ID Managed Identity) preferred over access key in production
- **Cookie**: `sameSite=none`, `secure=true` (SAML requirement); `httpOnly`
- **Timeout**: 8 hours maximum (`SESSION_MAX_AGE=28800000`) for citizen sessions (Protected B); shorter for sensitive operations
- **Key rotation**: `SESSION_SECRET_PREVIOUS` supported for graceful secret rotation

### Data Protection
- Same as Profile A with addition:
- **Heightened PII controls**: Citizen data (PHN, SIN, contact information) classified Protected B by default
- **Data residency**: Canada Central region required; no cross-border transmission without explicit authorization

### Perimeter & Transport
- **Cloudflare**: Assumed present for public-facing applications (organizational standard); provides WAF and DDoS mitigation
- **API Gateway**: API Gateway required for all north-south traffic
- **SAML endpoint exposure**: `/api/v1/auth/saml/callback` and `/api/v1/auth/logout/callback` must be protected by rate limiting even though they are unauthenticated (SAML POST flow)
- All other controls same as Profile A

### Logging & Audit
- Same as Profile A with addition:
- **Citizen data access**: Every read of citizen personal data requires audit log entry
- **Cross-session tracing**: Correlation IDs must be preserved across SAML federation boundary

### Required Modules (AIM Template)
`security-core`, `auth-core`, `auth-saml`, `data-redis` (if app data), `session-store-redis`, `api-gateway` (if BFF proxy to private backend)

---

## Profile C: Dual Portal Application

**Use when**: Application serves both end users (public portal) and organizational staff (internal portal) through the same backend API. Two separate frontend apps share one Express BFF.

### Identity & Authentication
- **Public portal**: SAML 2.0 (Corporate OIDC Provider): same as Profile B
- **Internal portal**: Enterprise IdP OIDC (e.g. Entra ID): same as Profile A
- **Driver coexistence**: Both SAML and Enterprise IdP OIDC drivers registered simultaneously via multi-driver registry
- **Session isolation**: Public and internal sessions must be distinguishable; session user record includes `driver` field
- **Auth routing**: Public portal users always authenticated via SAML driver; staff via Enterprise IdP driver; no cross-driver auth

### Authorization
- **Dual context**: Authorization logic must check driver/role combination, not role alone
- **Citizen context**: Per-object ownership (citizen accesses only their own records)
- **Staff context**: RBAC by role as in Profile A; staff may access citizen records per their role
- **Cross-context elevation**: Staff must not be able to impersonate citizen sessions; citizen must not be able to access staff-only views

### Session Architecture
- **Store**: Redis required (both portals share same session store; must handle both cookie configurations)
- **Cookie strategy**: Separate cookie names for public (`session.public`) and internal (`session.internal`) recommended
- **SAML cookies**: `sameSite=none`, `secure=true` for public portal; `sameSite=lax`, `secure=true` for internal portal

### Data Protection
- Combined requirements of Profile A and Profile B
- Most restrictive classification of either user population applies to shared data store

### Perimeter & Transport
- Cloudflare (public portal traffic) + API Gateway (all traffic)
- Rate limiting must be applied per-portal context
- CORS must allow both portal origins

### Required Modules (AIM Template)
`security-core`, `auth-core`, `auth-saml`, `auth-entra-id`, `data-postgres` (app data), `session-store-redis`, `api-gateway`

---

## Data Classification Security Overlays

These controls are added on top of whichever profile applies, based on the application's data classification.

### Protected B Overlay (adds to any profile)

| Control | Requirement |
|---|---|
| Field-level encryption | Required for PHN, SIN, medical/mental health diagnosis, bank account numbers, credit card numbers |
| Audit logging | Mandatory for every read AND write of Protected B fields; must include who accessed what and when |
| Session timeout | Maximum 30 minutes idle for staff; 8 hours for citizens (with re-authentication for sensitive operations) |
| Data residency | Canada Central only; no cross-border data transfer |
| MFA | Required (enforced via Enterprise IdP conditional access for staff; via Corporate OIDC Provider for citizens) |
| Backup encryption | Backups must be encrypted with separate key from production |
| Data minimization | API responses must not expose Protected B fields unless the requesting role explicitly requires them |

### Protected A Overlay (adds to any profile)

| Control | Requirement |
|---|---|
| Encryption in transit | TLS 1.2+ mandatory on all connections (already in baseline) |
| Basic audit logging | Log authentication events and data modification operations |
| Authentication | All endpoints serving Protected A data must require authentication |
| Error response hygiene | Error responses must not expose Protected A field values or internal IDs |

### Public Data (no overlay)
Template baseline controls sufficient. Authentication may be omitted for read-only public data APIs at Information Controller's discretion; rate limiting still required.

---

## REST API Architecture Baseline

Synthesized from organizational Web API Standard v1.0 (Nov 2024), REST API Standard v1.0 (Nov 2024), and organizational API Security Standard.

### Required Structural Patterns
- **REST Maturity**: Richardson Level 2 minimum (resource-based URIs, HTTP verbs, status codes)
- **Versioning**: URL path versioning required in production (`/api/v1/` or `/v1/resource`); consistent per API
- **URI conventions**: Kebab-case, lowercase, plural nouns for collections, no trailing slash, no file extensions, < 2000 chars
- **Documentation**: OpenAPI Specification 3.1 (3.0 acceptable if 3.1 infeasible)
- **Health endpoints**: `/health`, `/health/liveness`, `/health/readiness`: all `GET`, return 200 + JSON when healthy
- **Error format**: Structured JSON with: request URL, method, timestamp, correlation ID, client principal, error code, message
- **Payload format**: JSON default; no top-level arrays (wrap in `{ "data": [...] }`); ISO 8601 dates
- **Collections**: Pagination via `?top=N&skip=N`; filtering via `?filter=expr`; sorting via `?sort=+field`

### Required Security Controls
- **Authentication**: All endpoints require auth unless explicitly documented as public (open data, health checks)
- **Rate limiting**: Applied to all endpoints including unauthenticated health checks and SAML callbacks
- **Input validation**: Zero-trust; re-validate all inputs server-side regardless of client-side validation
- **TLS**: TLS 1.2+ required; HTTP requests must be rejected (not redirected to HTTPS)
- **Sensitive data in URLs**: Never expose SIN, PHN, personal info in request URLs; use JSON body
- **Sensitive data in errors**: Error responses must not include stack traces, internal IDs, or Protected data values
- **Audit logging**: All incoming requests must be logged with correlation ID; mandatory fields per Log Management Standard
- **API Gateway**: API Gateway required for all north-south (client-to-service) traffic
- **IAM**: organizational IAM services (Corporate OIDC Provider, External Identity Gateway) required for north-south authentication
- **East-West auth**: Service account, API key, JWT, OAuth 2.0 Client Credentials, or mTLS (all approved)
- **Security context propagation**: User security context must be propagated across service-to-service calls

### OWASP API Security Top 10 Required Mitigations
- **BOLA (API1)**: Per-object ownership check on every endpoint accepting an object ID
- **Authentication (API2)**: Consistent auth mechanism; server-side token validation on every request
- **BOPLA/Mass Assignment (API3)**: Allowlist-based field serialization; reject unexpected fields on update
- **BFLA (API5)**: Role check on every admin/privileged endpoint; admin endpoints not discoverable

### Deployment
- **Cloud Landing Zone**: Azure/AWS/GCP in Canada Central (Canada Central region for data residency)
- **Containerized**: Docker-based deployment; single-process Express serving API + static SPA
- **Reverse proxy**: Cloudflare (public-facing) or F5 Shape assumed; `TRUST_PROXY` must be set
- **Penetration testing**: Required for all external-facing APIs (request via BERNIE)
