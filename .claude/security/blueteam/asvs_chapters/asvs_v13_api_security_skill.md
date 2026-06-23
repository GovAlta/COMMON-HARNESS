---
id: asvs-v13-api-security-subskill
name: ASVS V13 API Security Sub-Skill
description: ASVS chapter V13 API and web service security assessment logic consumed by the ASVS Level 2 assessment workflow.
type: sub-agent
version: 1.0.0
tools_required:
  - Read
  - Glob
  - Grep
tools_optional: []
references:
  - asvs-level2-security-assessment
  - attack-chain-reference
  - api-security
upstream:
  - ref: api-security
    artifacts: []
outputs: []
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must read API_security_skill.md before assessing any V13 requirement.
  - Must run only within ASVS Level 2 Phase 2 chapter dispatch.
---

> Sub-skill for **V13 API and Web Service Security**. **Read `API_security_skill.md` before assessing any V13 requirement.** Finding IDs: `[V13-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

| Condition                  | Sub-requirements excluded        | Justification             |
| -------------------------- | -------------------------------- | ------------------------- |
| No SOAP/XML web services   | V13.3 SOAP Web Service           | SOAP not present          |
| No GraphQL endpoints       | V13.4 GraphQL                    | GraphQL not implemented   |
| No service-to-service APIs | V13.8 Inter-Service API Security | Single service deployment |

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## V13 Requirements and Verification Rules

### BLOCKING PREREQUISITE — READ BEFORE ASSESSING ANY V13 REQUIREMENT

**You MUST read `shared/skills/api-security.md` (located in the `shared/` folder of the BlueTeam directory) before assessing any V13 requirement.**

The API Security Skill provides comprehensive requirements for authentication, authorization, rate limiting, input validation, transport security, CORS, inter-service security, BaaS/serverless platform security, and organization-specific API security requirements.

The following V13 sub-categories map to sections in the API Security Skill:

| ASVS Sub-Category                               | API Security Skill Sections                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| V13.1 Generic Web Service Security              | 1.1 (General Auth Requirements), 7.2 (Error Response Protection), 8 (API-Type-Specific)     |
| V13.2 RESTful Web Service                       | 4.2 (Content-Type Validation), 4.3 (Request Size/Parameter Validation), 8.1 (REST Security) |
| V13.3 SOAP Web Service                          | 8.2 (SOAP Security)                                                                         |
| V13.4 GraphQL                                   | 5.5 (GraphQL Rate Limiting), 8.3 (GraphQL Security)                                         |
| V13.5 API Authentication and Token Security     | 1.2 (OAuth 2.0/OIDC), 1.3 (API Keys), 1.4 (JWT Security)                                    |
| V13.6 API Rate Limiting and Resource Protection | 5 (Rate Limiting), 6 (Resource Consumption)                                                 |
| V13.7 API Discovery and Inventory               | 11 (API Discovery & Inventory)                                                              |
| V13.8 Inter-Service API Security                | 2 (Inter-Service Security)                                                                  |
| OWASP API Security Top 10 (2023)                | 12 (Full cross-reference table)                                                             |

Do not begin the V13 requirement assessments below until `API_security_skill.md` has been read.

---

## V13 Requirements and Verification Rules

### V13.1 — Generic Web Service Security

**V13.1.1** — Verify that all application components use the same encodings and parsers to avoid parsing attacks that exploit different URI or file parsing behavior that could be used in SSRF and RFI attacks.
- **CAS Rule:** None.
- **Verification:** Check URL parsing and routing consistency across the application. Multiple URL parsing paths with different normalization can create inconsistencies exploitable for path traversal or SSRF bypass.
- **ATT&CK Tactic:** TA0008 — Lateral Movement
- **Severity if failed:** High

**V13.1.2** — Verify that access to administration and management functions is limited to authorized administrators.
- **CAS Rule:** Admin API endpoints must require Enterprise IdP authentication (e.g. Entra ID) (AUTH-002) with MFA.
- **Verification:** Review admin route definitions. Check authentication requirements — any admin endpoint accessible with regular user credentials is a Critical finding.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** Critical

**V13.1.3** — Verify API URLs do not expose sensitive information, such as the API key, session tokens etc.
- **CAS Rule:** None.
- **Verification:** Review API route patterns. Search for `apiKey`, `token`, `session` in URL path/query string patterns.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V13.1.4** — Verify that authorization decisions are made at both the URI, enforced by programmatic or declarative security at the controller level, and at the resource or object level, enforced by model-based permissions.
- **CAS Rule:** None.
- **Verification:** Cross-reference with V4.1 and V4.2 — controller-level and object-level authorization. Write `[V13-NNN: duplicate of V4-NNN]` if already captured.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** Cross-reference V4

**V13.1.5** — Verify that requests containing unexpected or missing content types are rejected with appropriate headers (HTTP response status 406 Unacceptable or 415 Unsupported Media Type).
- **CAS Rule:** None.
- **Verification:** Check API endpoints for `Content-Type` validation on POST/PUT/PATCH requests. Missing validation enables content-type sniffing attacks.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Medium

---

### V13.2 — RESTful Web Service

**V13.2.1** — Verify that enabled RESTful HTTP methods are a valid choice for the user or action, such that normal users cannot use DELETE or PUT on protected API or resources, such as `DELETE /users/{id}` or `PUT /user/profile`.
- **CAS Rule:** None.
- **Verification:** Check that HTTP method restrictions are enforced per-route, not just per-controller. Verify dangerous methods (DELETE, PUT, PATCH) on sensitive resources require appropriate authorization.
- **ATT&CK Tactic:** TA0040 — Impact
- **Severity if failed:** High

**V13.2.2** — Verify that JSON schema validation is in place and verified before accepting input.
- **CAS Rule:** None.
- **Verification:** Check for JSON schema or model validation on API request bodies. Cross-reference with V5.1.3.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Medium

**V13.2.3** — Verify that RESTful web services that utilize cookies are protected from Cross-Site Request Forgery via the use of at least one or more of the following: double submit cookie pattern, CSRF nonces, or Origin request header checks.
- **CAS Rule:** None.
- **Verification:** Cross-reference with V4.2.2 CSRF protection. Write `[V13-NNN: duplicate of V4-NNN]` if already captured.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Cross-reference V4

**V13.2.6** — Verify that REST services are protected from Denial of Service (DoS) using rate limiting or other anti-DoS mitigations.
- **CAS Rule:** Application-level rate limiting required even with Cloudflare. See Environment assumptions above.
- **Verification:** Read API middleware for rate limiting. Check whether rate limiting is applied globally and per-user/per-IP. Verify auth endpoints are rate-limited (RATE-001). Verify bulk listing endpoints have pagination size limits.
- **ATT&CK Tactic:** TA0040 — Impact
- **Severity if failed:** High

---

### V13.3 — SOAP Web Service

*Only assess if SOAP/XML web services are present. If excluded: write `[V13.3 EXCLUDED — no SOAP services]`.*

**V13.3.1** — Verify that XSD schema validation takes place to ensure a properly formed XML document, followed by validation of each input field before any processing of that data takes place.
- **CAS Rule:** None.
- **Verification:** Check XML parsing for schema validation and entity processing restrictions.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical (XXE if entity processing enabled)

**V13.3.2** — Verify that the message payload is signed using WS-Security to ensure reliable transport between client and service.
- **CAS Rule:** None.
- **Verification:** Check SOAP service for WS-Security message signing.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High

---

### V13.4 — GraphQL

*Only assess if GraphQL endpoints are present. If excluded: write `[V13.4 EXCLUDED — no GraphQL]`.*

**V13.4.1** — Verify that a query allowlist or a combination of depth limiting and amount limiting is used to prevent GraphQL or data layer expression Denial of Service (DoS) attacks.
- **CAS Rule:** None.
- **Verification:** Check GraphQL configuration for query depth limits, complexity limits, and field count limits. Absent limits enable "batching attacks" and deeply nested query DoS.
- **ATT&CK Tactic:** TA0040 — Impact
- **Severity if failed:** High

**V13.4.2** — Verify that GraphQL or other data layer authorization logic is implemented at the business logic layer instead of the GraphQL layer.
- **CAS Rule:** None.
- **Verification:** Verify that authorization checks are in resolver logic, not only in GraphQL-layer middleware.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** Critical

---

### V13.5 — API Authentication and Token Security

**V13.5.1** — Verify that all API endpoints are protected using either authentication, authorization, or rate limiting.
- **CAS Rule:** None.
- **Verification:** Review `endpoints[]` from the application map. For each endpoint with `auth_first_in_chain: false`: verify whether the endpoint is legitimately public (health check, login) or incorrectly unprotected. Flag incorrectly unprotected endpoints as High or Critical.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Critical (if data-exposing endpoint), High (if internal-only functionality exposed)

**V13.5.2** — Verify that JWT tokens are validated as per the V3.5.3 requirements.
- **CAS Rule:** None.
- **Verification:** Cross-reference with V3.5.3. Write `[V13-NNN: duplicate of V3-NNN]` if already captured.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Cross-reference V3

**V13.5.3** — Verify that API keys do not provide long-lived unrestricted access.
- **CAS Rule:** Service API keys must not be shared across multiple consuming services (cross-reference V2.10).
- **Verification:** Check API key management: verify expiry or rotation mechanisms exist. Verify API keys have scope restrictions. Cross-reference with V2.10.1 shared API key findings.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

---

### V13.6 — API Rate Limiting and Resource Protection

**V13.6.1** — Verify that the API has rate limiting enabled and that rate limiting is applied to both authenticated and unauthenticated users.
- **CAS Rule:** Application-level rate limiting required even with Cloudflare perimeter protection.
- **Verification:** Read rate limiting middleware configuration. Verify: (1) auth endpoints are rate-limited, (2) unauthenticated endpoints have rate limiting, (3) per-user rate limits exist for authenticated endpoints.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V13.6.2** — Verify that resource-intensive operations are protected by rate limits to prevent financial or resource abuse.
- **CAS Rule:** Financial abuse concern: if the API proxies to AI/LLM APIs, email/SMS services, or cloud compute, unauthenticated access can cause financial loss.
- **Verification:** Check for AI/LLM API calls, email sending, or cloud service API calls that are accessible without rate limiting. For each: estimate potential financial exposure.
- **ATT&CK Tactic:** TA0040 — Impact (financial)
- **Severity if failed:** Critical (if unauthenticated + significant cost per call)

---

### V13.7 — API Discovery and Inventory

**V13.7.1** — Verify that OpenAPI or API documentation is not exposed in production, or if it must be, that access is restricted to authorized users.
- **CAS Rule:** None.
- **Verification:** Check for OpenAPI/Swagger endpoints (`/swagger`, `/api-docs`, `/openapi.json`, `EnableOpenApi: true` in appsettings). If enabled in production without authentication gate, flag as finding. Cross-reference with V14.1.2.
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** Medium (Cross-reference V14 — may already be captured)

**V13.7.2** — Verify that an API inventory exists and is maintained for all APIs.
- **CAS Rule:** None.
- **Verification:** Check for API documentation, OpenAPI spec files, or postman collections in the repository.
- **ATT&CK Tactic:** N/A
- **Severity if failed:** Low

---

### V13.8 — Inter-Service API Security

*Only assess if multiple services communicate with each other.*

**V13.8.1** — Verify that inter-service calls use the minimum necessary authentication and authorization.
- **CAS Rule:** None.
- **Verification:** Review inter-service HTTP client code for authentication. Verify each service uses its own credentials (not shared credentials). Cross-reference V2.10.1.
- **ATT&CK Tactic:** TA0008 — Lateral Movement
- **Severity if failed:** High

**V13.8.2** — Verify that inter-service calls use mutual authentication.
- **CAS Rule:** None.
- **Verification:** Check for mutual TLS (mTLS) or service identity verification in inter-service calls.
- **ATT&CK Tactic:** TA0008 — Lateral Movement
- **Severity if failed:** Medium

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern                              | Primary Tactic           | Kill Chain Stage                                  |
| -------------------------------------------- | ------------------------ | ------------------------------------------------- |
| Unauthenticated API endpoints                | TA0001 Initial Access    | Direct unauthenticated data access                |
| Missing rate limiting on auth endpoints      | TA0006 Credential Access | Brute force attack on credentials                 |
| OpenAPI/Swagger exposed in production        | TA0043 Reconnaissance    | Full API schema discovery without authentication  |
| CORS wildcard on authenticated API           | TA0010 Exfiltration      | Cross-origin data theft via browser               |
| Resource-intensive unauthenticated endpoints | TA0040 Impact            | Financial abuse via AI/LLM/email/SMS API proxying |
| GraphQL no depth/complexity limits           | TA0040 Impact            | Nested query DoS attack                           |

---

## Cross-Chapter Reference Notes

| This chapter finding              | Combines with                | Combined chain risk                                       |
| --------------------------------- | ---------------------------- | --------------------------------------------------------- |
| V13.7.1 OpenAPI in production     | V14.1.2 debug/OpenAPI config | Same root cause — write `[V13-NNN: duplicate of V14-NNN]` |
| V13.5.1 unauthenticated endpoints | V4.1 general access control  | Same root cause — cross-reference                         |
| V13.6.1 rate limiting             | V11.1.4 anti-automation      | Same root cause — cross-reference                         |
| V13.5.3 API key expiry            | V2.10.1 shared API key       | May be same credential — cross-reference                  |

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V13-compliant code.

### When to apply this chapter
Load V13 when building REST APIs, GraphQL endpoints, or inter-service communication. Combine with V3 (session/JWT) and V4 (access control) for complete API security coverage.

### Content-Type Validation (V13.1.5, V13.2.2)

```typescript
// middleware/contentType.ts — ✓ V13.1.5: reject unexpected content types
export function requireJsonBody(req: Request, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.includes('application/json')) {
      return res.status(415).json({ error: 'Unsupported Media Type — application/json required' });
    }
  }
  next();
}

// ✓ V13.2.2: Zod schema validation on all request bodies (see also V5 Input Validation)
import { z } from 'zod';
const CreateApplicationSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['TypeA', 'TypeB']),
});

router.post('/applications', requireJsonBody, async (req, res) => {
  const parsed = CreateApplicationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten() });
  }
  // proceed with parsed.data
});
```

### API Rate Limiting (V13.6.1, V13.2.6)

```typescript
// middleware/rateLimiter.ts — ✓ V13.6.1, RATE-001 compliant
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// General API rate limit
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
});

// ✓ RATE-001: strict rate limit on auth endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,                     // 10 attempts per 15 min per IP
  skipSuccessfulRequests: false,
  standardHeaders: true,
  store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
  handler: (req, res) => {
    logger.warn({ event: 'rate_limit.auth_exceeded', ip: req.ip });
    res.status(429).json({ error: 'Too many requests' });
  },
});

// Auth rate limit runs before all auth routes
app.use('/auth', authRateLimit);
app.use('/api', apiRateLimit);
```

### CORS Configuration (V14.5.3)

```typescript
// middleware/cors.ts — ✓ V14.5.3: explicit allowlist, no wildcard
import cors from 'cors';

const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,         // required for cookie-based auth
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

### GraphQL Security (V13.4.1, V13.4.2)

```typescript
// graphql/server.ts — ✓ V13.4.1: depth and complexity limits
import { createComplexityLimitRule } from 'graphql-validation-complexity';
import depthLimit from 'graphql-depth-limit';

const server = new ApolloServer({
  schema,
  validationRules: [
    depthLimit(7),                       // ✓ V13.4.1: prevent deeply nested queries
    createComplexityLimitRule(1000),      // ✓ V13.4.1: complexity budget
  ],
  // ✓ V13.4.2: authorization lives in resolvers (business logic), not GraphQL middleware
});

// Resolver with ownership check ✓ V13.4.2, V4.2.1
const resolvers = {
  Query: {
    application: async (_, { id }, context) => {
      const app = await Application.findOne({ where: { id, userId: context.user.id } });
      if (!app) throw new ForbiddenError('Not found or access denied');
      return app;
    },
  },
};
```

### Inter-Service Auth with Managed Identity (V13.8.1)

```typescript
// services/internalApiClient.ts — ✓ V13.8.1: Managed Identity for service-to-service
import { DefaultAzureCredential } from '@azure/identity';
import https from 'https';

const credential = new DefaultAzureCredential();

export async function callInternalService(endpoint: string, body: object) {
  // ✓ V13.8.1: service-specific token — not shared credentials (V2.10.1)
  const token = await credential.getToken('https://internal-service.example.azure.com/.default');
  return axios.post(endpoint, body, {
    headers: { Authorization: `Bearer ${token.token}` },
    httpsAgent: new https.Agent({ rejectUnauthorized: true }), // ✓ V9.2.1
  });
}
```

### Common anti-patterns
- No `Content-Type` validation on POST/PUT — enables content sniffing attacks
- CORS configured with `AllowAnyOrigin()` or `*` on authenticated endpoints
- No rate limiting on auth endpoints — enables brute force
- GraphQL with no depth/complexity limits — enables DoS via deeply nested queries
- Swagger/OpenAPI served unauthenticated in production
- Shared API keys across services — each service must have its own credential

### Organization-specific patterns
- Enterprise IdP Managed Identity (e.g. Entra ID): use `DefaultAzureCredential` for all inter-service calls; no stored API keys for Azure services
- Admin API endpoints require Enterprise IdP auth (AUTH-002, e.g. Entra ID) with MFA claim — check `amr` claim contains `mfa`
- RATE-001: application-layer rate limiting is required even when Cloudflare is in front; Cloudflare rate limits are not a substitute
- API keys for external services: store in Azure Key Vault; rotate at maximum 90-day intervals (SEC-003)
