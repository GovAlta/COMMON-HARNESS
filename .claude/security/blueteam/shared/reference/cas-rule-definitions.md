---
id: cas-rule-definitions
name: Cybersecurity Architecture Standards: Rule Definitions
description: Authoritative CAS rule specifications for assessment and builder skill consumption. Contains all rule requirements, compliant implementation patterns, organization-specific requirements, applicability scope rules, and ITSG-33 control family mappings.
type: reference
version: 1.0.0
status: active
---

## Section Loading Guide

| Skill | Sections loaded | Purpose |
|---|---|---|
| `skills/06-cas-compliance.md` | All | Rule verification during compliance assessment: provides authoritative requirement text, implementation patterns, and ITSG-33 mappings |
| `skills/15-cas-compliant-builder.md` | `Platform Context` + requested domain section(s) per **Domain Selection Guide** in the builder skill | Load only the domain(s) relevant to the feature being built. **Do NOT load the full file.** |

### Domain → Section Heading Map (for builder selective loading)

| Domain abbrev. | File section heading |
|---|---|
| AUTH, MFA | `## Domain: Authentication` |
| IDPR, IDPV, IDBR | `## Domain: Identity Protocol & Provider Management` |
| AUTHZ | `## Domain: Authorization` |
| NET, BOT, CDN, WAF, FW, CORS, RATE | `## Domain: Network & Perimeter Security` |
| SEC, ENC | `## Domain: Secrets & Encryption` |
| LOG, MAL, PAT, VULN | `## Domain: Logging, Monitoring & Vulnerability Management` |
| CDS, RES, STORE | `## Domain: Cloud & Data Security` |
| WEB, CSP, HDR, PWD, SESSION, UPLOAD | `## Domain: Web Application Security` |
| ACCT | `## Domain: Account Lifecycle` |
| AI | `## Domain: AI Agent Security` |

> **ITSG-33 Quick Reference Index**: load only if the consuming skill explicitly needs to map findings to ITSG-33 control families. The CAS builder does not need it for code generation.

---

## Platform Context

The following organization-specific infrastructure and identity context applies across all rules. Implementation patterns below are written assuming this baseline.

### Approved Identity Providers

| Provider | User Type | Protocol | Notes |
|----------|-----------|----------|-------|
| **Corporate OIDC Provider** | Public / external users | OIDC | Configure via `.well-known/openid-configuration` discovery endpoint; do not hardcode individual endpoints |
| **Enterprise IdP (e.g. MS Entra ID)** | organizational staff (internal) | OIDC / SAML | MFA enforced at provider level; JWT issued with `iss` claim from IdP tenant endpoint |
| **External Identity Gateway** | Partner organizations (RCMP, federal agencies) | SAML / OIDC federation | Federation terms per partner agreement |
| **KeyCloak** | Identity broker / federator | OIDC / SAML federation | Used when federation between multiple providers is required; MUST NOT store identities |

### Deployment Targets

| Target | Description | Infrastructure Controls Assumed |
|--------|-------------|--------------------------------|
| **Cloud Landing Zone (Azure / AWS / GCP)** | managed cloud landing zone with PBMM / CCCS Medium guardrails | Cloudflare WAF + DDoS, cloud-native CDN, cloud-native firewall (NSG / Security Groups / VPC Firewall), managed storage encryption at rest, Azure Application Insights / CloudWatch / Cloud Logging |
| **On-Premises DC** | managed data centre with zone firewalls | Zone 2/3 firewalls, SQL Server TDE for databases, MS Defender on all servers. NOTE: not zero-trust: app and DB tiers may be on flat network segments |

### Data Sensitivity Thresholds

| Classification | Examples | Special Encryption Requirements |
|----------------|----------|--------------------------------|
| Protected B | PHN (Personal Health Number), medical / mental health diagnoses, SIN (Social Insurance Number), bank / credit card numbers, income data (e.g., Line 15000) | Field-level encryption required (ENC-002 / ENC-003): SQL Server TDE alone is insufficient |
| Protected A | Employee HR records, internal financial data, personal contact info | At-rest and in-transit encryption required (ENC-001) |
| Public / Unclassified | Publicly published data | Standard TLS in transit |

---

## Domain: Authentication

Rules AUTH-001 through AUTH-004 and MFA-001 through MFA-002.

---

### AUTH-001: External User Authentication

**Enforcement:** MUST
**Verification Level:** configuration

**Requirement:**
Applications with public or external users MUST authenticate those users via the **Corporate OIDC Provider** identity provider. Applications MUST NOT include environment-variable-gated authentication bypasses (e.g., `ALLOW_MOCK_IN_PRODUCTION`, `DISABLE_AUTH`). Authentication bypass mechanisms: even when gated by configuration flags: represent Critical risk because environment variables can be set accidentally or through misconfiguration.

**Compliant Implementation Pattern:**

```typescript
// Node.js / Express: OIDC integration with Corporate OIDC Provider
// Use passport-openidconnect or openid-client; configure via discovery endpoint only.

import { Issuer, Strategy } from 'openid-client';

const issuer = await Issuer.discover(process.env.CA_DISCOVERY_URL!);
// CA_DISCOVERY_URL = https://<tenant>/.well-known/openid-configuration

const client = new issuer.Client({
  client_id: process.env.OIDC_CLIENT_ID!,
  client_secret: process.env.OIDC_CLIENT_SECRET!,
  redirect_uris: [process.env.OIDC_REDIRECT_URI!],
  response_types: ['code'],
});

// No env-var-gated bypass: authentication is always required.
// WRONG (never do this):
// if (process.env.ALLOW_MOCK_IN_PRODUCTION === 'true') { req.user = mockUser; return next(); }
```

Framework-agnostic notes:
- Configure only the discovery URL; let the OIDC library resolve `authorization_endpoint`, `token_endpoint`, and `jwks_uri` automatically (satisfies IDPR-002).
- Never commit `client_secret` to source: store as a runtime secret (satisfies SEC-001/002).
- Place the authentication middleware FIRST in the chain on any protected route (satisfies AUTHZ-002).

**Organization-Specific Requirements:**
- Provider: Corporate OIDC Provider only for public-facing applications.
- No locally implemented password authentication is permitted (see PWD-001).
- Authentication bypass flags (`ALLOW_MOCK_*`, `DISABLE_AUTH`, `SKIP_AUTH`) in any environment are a Critical finding regardless of whether the flag is set.

**Applicability:** All applications with public or external user authentication.

**ITSG-33 Control Families:** IA: IA-2, IA-8

---

### AUTH-002: organizational Staff Authentication

**Enforcement:** MUST
**Verification Level:** configuration

**Requirement:**
Applications with organizational staff users MUST authenticate those users via an **Enterprise IdP (e.g. Microsoft Entra ID)**. No alternative identity provider is permitted for organizational staff authentication outside of approved enterprise identity providers.

**Compliant Implementation Pattern:**

```typescript
// Node.js / Express: Enterprise IdP OIDC via openid-client (example: MS Entra ID)
import { Issuer } from 'openid-client';

const issuer = await Issuer.discover(
  `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/v2.0/.well-known/openid-configuration`
);
const client = new issuer.Client({
  client_id: process.env.ENTRA_CLIENT_ID!,
  client_secret: process.env.ENTRA_CLIENT_SECRET!,
  redirect_uris: [process.env.OIDC_REDIRECT_URI!],
  response_types: ['code'],
});

// JWT validation: verify iss / aud / signature against JWKS (see SEC-003)
// MFA is enforced at the Enterprise IdP / Conditional Access level (e.g. Entra ID): not in application code.
```

Framework-agnostic notes:
- Example: The MS Entra ID issuer URL uses the tenant-specific v2.0 endpoint: `https://login.microsoftonline.com/{tenantId}/v2.0`. Other Enterprise IdPs will have their own issuer URL format.
- Validate the `iss` claim against the expected tenant to prevent cross-tenant token confusion.
- MFA enforcement (MFA-001) is configured at the Enterprise IdP level (e.g. Entra ID Conditional Access): application code does not need to enforce MFA independently, but must not implement a bypass that allows access without a valid IdP token.

**Organization-Specific Requirements:**
- MFA is enforced at the Enterprise IdP level (MFA-001); configure the IdP to require a strong MFA method (e.g. authenticator app). SMS-based MFA is not recommended.
- Applications MUST NOT maintain a parallel local credential store for organizational staff.

**Applicability:** All applications with organizational staff (internal) user authentication.

**ITSG-33 Control Families:** IA: IA-2

---

### AUTH-003: Partner Authentication

**Enforcement:** MUST
**Verification Level:** configuration

**Requirement:**
Applications with partner users (e.g., RCMP, other police services, federal agencies) MUST authenticate those users via the **External Identity Gateway**. No other identity provider is permitted for partner authentication without cybersecurity@example.com approval.

**Compliant Implementation Pattern:**

```typescript
// Node.js: External Identity Gateway federation via SAML or OIDC
// DIG typically exposes an OIDC or SAML endpoint; use the discovery URL provided by organizational DIG team.

const issuer = await Issuer.discover(process.env.DIG_DISCOVERY_URL!);
const client = new issuer.Client({
  client_id: process.env.DIG_CLIENT_ID!,
  client_secret: process.env.DIG_CLIENT_SECRET!,
  redirect_uris: [process.env.OIDC_REDIRECT_URI!],
  response_types: ['code'],
});
```

Framework-agnostic notes:
- Obtain the External Identity Gateway discovery or metadata URL from the organizational Identity team.
- Validate token `iss` against the expected DIG issuer value.
- MFA is enforced per partner agreement at the DIG level.

**Organization-Specific Requirements:**
- Partner federations are governed by inter-agency agreements; contact the organizational Identity team before onboarding a new partner.
- Applications must not store partner credentials locally.

**Applicability:** All applications with partner organization user authentication.

**ITSG-33 Control Families:** IA: IA-2, IA-8

---

### AUTH-004: API Authentication

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
All APIs MUST authenticate callers using **JWT** or an **API Gateway** token mechanism. API Keys are permitted as an approved exception only. Every API endpoint that processes or returns data MUST validate the caller's identity before executing business logic.

**Compliant Implementation Pattern:**

```typescript
// Express middleware: JWT Bearer token validation
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

const jwksClient = jwksRsa({
  jwksUri: process.env.JWKS_URI!, // from IdP discovery
  cache: true,
  rateLimit: true,
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    callback(err, key?.getPublicKey());
  });
}

export function requireJwt(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }
  const token = authHeader.slice(7);
  jwt.verify(token, getKey, { algorithms: ['RS256'], audience: process.env.JWT_AUDIENCE }, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

// Apply to ALL routes (not just sensitive ones):
app.use('/api', requireJwt);
```

Framework-agnostic notes:
- Never use `algorithm: 'none'` or skip signature verification (Critical: SEC-003).
- Always validate `aud` and `iss` claims in addition to signature.
- Mount authentication middleware before any other middleware that could expose information (satisfies AUTHZ-002).

**Organization-Specific Requirements:**
- Unauthenticated endpoints are permissible only for public data (health checks, public content). Any unauthenticated endpoint that accesses a database or service account credentials is a Critical finding.
- Auth bypass flags in code are never acceptable regardless of environment.

**Applicability:** All APIs.

**ITSG-33 Control Families:** IA: IA-3, IA-9

---

### MFA-001: Multi-Factor Authentication for organizational Staff

**Enforcement:** MUST
**Verification Level:** configuration, code

**Requirement:**
Applications with organizational staff users MUST enforce multi-factor authentication via a **strong authenticator method** (e.g. authenticator app or hardware key), with TOTP allowed as an approved exception. SMS-based MFA is explicitly NOT recommended. MFA is enforced at the Enterprise IdP level (e.g. MS Entra ID Conditional Access); applications must not implement bypasses.

**Compliant Implementation Pattern:**

MFA enforcement is a configuration in the Enterprise IdP (e.g. MS Entra ID Conditional Access), not an application code concern. Application code responsibility is:
1. Delegate authentication fully to the Enterprise IdP (AUTH-002): never maintain a parallel local credential path.
2. Never implement an auth bypass that skips the IdP token exchange.
3. Validate IdP tokens on every request (AUTH-004 / SEC-003).

```typescript
// Verify Enterprise IdP-issued token (example: Entra ID): MFA is asserted in the 'amr' claim
jwt.verify(token, getKey, { algorithms: ['RS256'] }, (err, decoded: any) => {
  if (err) return res.status(401).json({ error: 'Invalid token' });
  // Optionally assert MFA was performed (amr includes 'mfa' or 'mfaphonering' etc.)
  // Note: Enterprise IdP conditional access policy is the primary enforcement mechanism (e.g. Entra ID Conditional Access).
  if (!decoded.amr?.includes('mfa') && requiresMfa) {
    return res.status(403).json({ error: 'MFA required' });
  }
  next();
});
```

**Organization-Specific Requirements:**
- SMS OTP is not recommended. Authenticator apps, hardware keys, and TOTP are preferred.
- MFA conditional access policy must be confirmed in Enterprise IdP tenant configuration (infrastructure-level verification).

**Applicability:** All applications with organizational staff user authentication.

**ITSG-33 Control Families:** IA: IA-2(1), IA-2(6)

---

### MFA-002: Multi-Factor Authentication for Public/External Users

**Enforcement:** SHOULD
**Verification Level:** configuration, code

**Requirement:**
Applications serving public or external users who access **Protected B data** (health, financial, legal) SHOULD enforce multi-factor authentication. Approved methods: MS Authenticator App, TOTP, SMS. Applicability is context-dependent: see triggers below.

**Applicability Triggers:** Public-facing authentication where users access Protected B data (health records, SIN/SSN, banking details). Self-service portals for sensitive government services. Search for: `Protected B` classification in docs, health/financial/legal data models, public user registration flows accessing sensitive tables.

**Default If Triggers Cannot Be Evaluated:** REVIEW RECOMMENDED.

**Compliant Implementation Pattern:**

MFA for public users is configured in the **Corporate OIDC Provider** tenant. Application code responsibility is the same as MFA-001: delegate fully to the approved IdP and do not implement bypasses. When Corporate OIDC Provider is configured to require MFA for a given service, the OIDC `amr` claim will include evidence of the second factor.

**Organization-Specific Requirements:**
- Corporate OIDC Provider supports SMS for public users (unlike MFA-001 where SMS is prohibited for staff).
- The decision to require MFA for a given public-facing application must be made in the data classification and threat model phases.

**ITSG-33 Control Families:** IA: IA-2(1)

---

## Domain: Identity Protocol & Provider Management

Rules IDPR-001, IDPR-002, IDPV-001, IDBR-001.

---

### IDPR-001: Identity Protocol Standard

**Enforcement:** MUST
**Verification Level:** code, configuration

**Requirement:**
All applications with authentication MUST use **SAML** or **OIDC** (OIDC preferred) as the identity protocol. Proprietary or custom authentication protocols are not permitted.

**Compliant Implementation Pattern:**

Use a standards-conformant OIDC library (e.g., `openid-client` for Node.js, `Microsoft.Identity.Web` for .NET). Verify the library performs standard OIDC flows (Authorization Code with PKCE for SPAs, Authorization Code for server-side apps).

```typescript
// PKCE flow for public clients (SPAs)
const codeVerifier = generators.codeVerifier();
const codeChallenge = generators.codeChallenge(codeVerifier);

const authUrl = client.authorizationUrl({
  scope: 'openid profile email',
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
});
```

**Organization-Specific Requirements:**
- OIDC is preferred over SAML for new integrations.
- All approved IdPs (e.g. Corporate OIDC Provider, MS Entra ID, External Identity Gateway) support OIDC.

**Applicability:** All applications with authentication.

**ITSG-33 Control Families:** IA: IA-2

---

### IDPR-002: OIDC Discovery Endpoint

**Enforcement:** MUST
**Verification Level:** code, configuration

**Requirement:**
All applications using OIDC MUST configure only the **identity provider discovery URL** (`.well-known/openid-configuration` endpoint) and allow the OIDC library to resolve individual endpoints (`authorization_endpoint`, `token_endpoint`, `jwks_uri`). Hardcoding individual endpoint URLs is not permitted because it prevents automatic handling of JWKS key rotation and IdP endpoint changes.

**Detection Patterns:** Search config files and auth setup code for hardcoded `authorization_endpoint`, `token_endpoint`, `jwks_uri` values. Compliant apps configure only a discovery URL (e.g., `identityMetadata`, `authority`, `issuer`) and allow the OIDC library to resolve individual endpoints.

**Compliant Implementation Pattern:**

```typescript
// Compliant: discovery URL only:
const issuer = await Issuer.discover('https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration');
// Library auto-resolves authorization_endpoint, token_endpoint, jwks_uri

// NON-COMPLIANT: hardcoded endpoints:
// const authEndpoint = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize';
// const tokenEndpoint = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token';
// const jwksUri = 'https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys';
```

**Organization-Specific Requirements:**
- Discovery URLs for approved IdPs:
  - Corporate OIDC Provider: `https://<tenant>/.well-known/openid-configuration` (obtain from organizational Identity team)
  - Enterprise IdP (e.g. MS Entra ID): `https://login.microsoftonline.com/{tenantId}/v2.0/.well-known/openid-configuration`
  - External Identity Gateway: obtain discovery URL from organizational DIG team

**Applicability:** All applications using OIDC.

**ITSG-33 Control Families:** IA, SC: IA-2, SC-23

---

### IDPV-001: Identity Provider Validation

**Enforcement:** MUST
**Verification Level:** code, configuration

**Requirement:**
Applications MUST use only approved organizational identity providers (e.g. **Corporate OIDC Provider** or **MS Entra ID**). KeyCloak and cloud-native tools (Azure AD B2C, AWS Cognito, etc.) MUST NOT store identities: they may only act as brokers/federators that pass through to an approved upstream IdP.

**Compliant Implementation Pattern:**

Point the application IdP configuration at an approved organizational IdP. If KeyCloak or a cloud-native tool is present in the architecture, verify it is configured in federation/broker mode (upstream IdP is an approved organizational IdP (e.g. Corporate OIDC Provider or MS Entra ID)), not as a local user store.

```typescript
// Compliant: points to approved organizational IdP:
const APPROVED_ISSUERS = [
  `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/v2.0`,
  process.env.CA_ISSUER, // Corporate OIDC Provider issuer
  process.env.DIG_ISSUER,        // External Identity Gateway issuer
];

function validateIssuer(iss: string) {
  if (!APPROVED_ISSUERS.includes(iss)) {
    throw new Error(`Token issuer '${iss}' is not an approved organizational identity provider`);
  }
}
```

**Organization-Specific Requirements:**
- Applications MUST NOT use social login providers (Google, Facebook, GitHub) as identity providers for organizational services.
- Azure AD B2C local account flows and similar "user store" configurations in cloud-native tools are not permitted.

**Applicability:** All applications with authentication.

**ITSG-33 Control Families:** IA: IA-2, IA-4

---

### IDBR-001: Identity Broker / Federator

**Enforcement:** MUST
**Verification Level:** infrastructure, configuration

**Requirement:**
When identity federation is required, applications MUST use the **External Identity Gateway**, **KeyCloak**, or **cloud-native tools in organizational landing zones** as the federator. The federator MUST NOT store identities: it MUST pass authentication through to an upstream approved organizational IdP (e.g. Corporate OIDC Provider, MS Entra ID), and infrastructure-level verification is required.

**Compliant Implementation Pattern:**

This rule is verified at the infrastructure level (KeyCloak `realms` configuration, DIG federation settings). Application code responsibility is to target the broker's OIDC/SAML endpoint and validate that tokens originate from an approved upstream issuer (consistent with IDPV-001).

**Organization-Specific Requirements:**
- KeyCloak deployments in Cloud Landing Zone are acceptable as brokers when configured in identity federation mode only.
- All federation agreements for the External Identity Gateway must be approved through the organizational Identity governance process.

**Applicability:** Applications requiring identity federation between multiple IdPs.

**ITSG-33 Control Families:** IA: IA-2, IA-4

---

## Domain: Authorization

Rules AUTHZ-001 through AUTHZ-006.

---

### AUTHZ-001: Authorization Backend

**Enforcement:** MUST
**Verification Level:** code, configuration

**Requirement:**
All applications with authorization MUST implement authorization using **AD Groups**, **KeyCloak**, or **OAuth2** as the authorization backend. No other authorization mechanism is permitted. The authorization backend MUST be the single source of truth for roles and permissions.

**Compliant Implementation Pattern:**

```typescript
// Express: RBAC using Enterprise IdP group claims from JWT (example: Entra ID)
function requireRole(requiredRole: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const groups: string[] = req.user?.groups ?? [];
    if (!groups.includes(requiredRole)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
}

app.get('/admin/users', requireJwt, requireRole(process.env.ADMIN_GROUP_ID!), listUsersHandler);
```

Framework-agnostic notes:
- Roles MUST be sourced from the validated token claims or a server-side lookup: never from client input (see AUTHZ-005).
- AD Group object IDs (GUIDs) are preferred over display names for `groups` claim matching to prevent spoofing via display name changes.

**Organization-Specific Requirements:**
- Example: Entra ID group claims are included in JWT when the application manifest is configured with `groupMembershipClaims: "SecurityGroup"` or `All`. Other Enterprise IdPs may use different claim configurations.
- KeyCloak role assignments (realms-level roles and client roles) are acceptable OAuth2-based authorization backends.

**Applicability:** All applications with authorization.

**ITSG-33 Control Families:** AC: AC-3, AC-6

---

### AUTHZ-002: RBAC/ABAC + Middleware Ordering

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
Applications MUST implement authorization using RBAC or ABAC built on top of AUTHZ-001. Authentication checks MUST execute BEFORE any middleware that may produce informative error responses (configuration status, gateway availability, feature flags). On every protected route with multiple middleware layers, the auth check MUST be first so unauthenticated requests receive only a `401` response, not internal configuration details or environment variable names.

**Detection Patterns:** Examine route definitions and middleware composition order. A NON-COMPLIANT pattern is: `app.use('/api', configStatusMiddleware, authMiddleware, ...)`: auth must come before config/feature middleware.

**Compliant Implementation Pattern:**

```typescript
// Compliant middleware ordering: auth FIRST:
app.use('/api',
  requireJwt,        // 1. Authentication: MUST be first
  requireRole('user'), // 2. Authorization
  rateLimiter,       // 3. Rate limiting
  handler            // 4. Business logic
);

// NON-COMPLIANT ordering (leaks config info to unauthenticated callers):
// app.use('/api', featureFlagMiddleware, configStatusMiddleware, requireJwt, handler);
```

**Organization-Specific Requirements:**
- Health check and readiness probe endpoints that are intentionally unauthenticated MUST return only an HTTP status code and a generic status indicator: they must not disclose database connectivity, Redis status, environment names, or authentication driver names (e.g., `"mock"` vs `"saml"`).

**Applicability:** All applications with authorization.

**ITSG-33 Control Families:** AC: AC-3, AC-4

---

### AUTHZ-003: Separation of Duties

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
Applications MUST enforce separation of duties between operational / administrative / security-monitoring roles. No single role SHOULD combine data modification with audit log access.

**Compliant Implementation Pattern:**

```typescript
// Define distinct roles: no overlap between data-modification and audit-log roles:
const ROLES = {
  DATA_ENTRY:   process.env.ROLE_DATA_ENTRY!,   // can modify records
  AUDITOR:      process.env.ROLE_AUDITOR!,       // can read audit logs: cannot modify records
  ADMIN:        process.env.ROLE_ADMIN!,         // manages users/roles: cannot modify records or audit logs
};

// Audit log endpoint: restricted to AUDITOR role only:
app.get('/audit-logs', requireJwt, requireRole(ROLES.AUDITOR), getAuditLogsHandler);

// Data modification endpoint: restricted to DATA_ENTRY role only:
app.post('/records', requireJwt, requireRole(ROLES.DATA_ENTRY), createRecordHandler);
```

**Organization-Specific Requirements:**
- The SHOULD sub-requirement (no single role combining data modification with audit log access) should be assessed separately under REVIEW RECOMMENDED if the MUST separation-of-duties structure is present.

**Applicability:** All applications with administrative functions.

**ITSG-33 Control Families:** AC: AC-5

---

### AUTHZ-004: Non-Privileged Access for Non-Security Functions

**Enforcement:** SHOULD
**Verification Level:** code

**Requirement:**
Users with administrative or security-function access SHOULD use non-privileged accounts for non-security work. Applications SHOULD support role switching or separate accounts for administrative functions.

**Applicability Triggers:** Administrative / security function apps with privileged and non-privileged user roles. Search for: admin controllers, security settings endpoints, role management, `[Authorize(Roles="Admin")]`, privilege elevation endpoints, role-switching logic.

**Default If Triggers Cannot Be Evaluated:** REVIEW RECOMMENDED.

**Compliant Implementation Pattern:**

```typescript
// Support explicit role context switching: user operates in least-privilege mode by default:
app.post('/session/elevate-to-admin', requireJwt, requireRole(ROLES.ADMIN), (req, res) => {
  // Elevate session to admin context; log the elevation event (LOG-001j)
  req.session.activeRole = 'admin';
  auditLog.info({ event: 'PRIVILEGE_ELEVATED', userId: req.user.sub });
  res.json({ activeRole: 'admin' });
});

app.post('/session/drop-to-user', requireJwt, (req, res) => {
  req.session.activeRole = 'user';
  res.json({ activeRole: 'user' });
});
```

**ITSG-33 Control Families:** AC: AC-6(2)

---

### AUTHZ-005: Role Source Integrity

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
Authorization roles and permissions MUST be sourced exclusively from **validated IdP tokens** or **server-side authoritative stores**. Roles MUST NOT be read from client-provided request bodies, custom HTTP headers (e.g., `X-User-Role`, `X-Permissions`, `X-Role`), query parameters, or any other client-controllable input: regardless of whether those inputs appear trustworthy or are documented in an internal API. Accepting client-supplied roles bypasses the entire authorization model established by AUTHZ-001 and AUTHZ-002.

**Detection Patterns:** Search for `req.body.role`, `req.body.permissions`, `request.role`, `headers['x-user-role']`, `X-User-Role`, `X-Permissions`, `x-role`; verify that role/permission extraction reads from validated token claims or a server-side role lookup keyed on the authenticated user identity, never from request inputs.

**Compliant Implementation Pattern:**

```typescript
// Compliant: roles sourced from validated JWT claims only:
function getEffectiveRole(req: Request): string {
  // req.user is populated by requireJwt middleware after signature validation
  return req.user?.roles?.[0] ?? req.user?.groups?.[0] ?? 'none';
}

// NON-COMPLIANT patterns (never do these):
// const role = req.headers['x-user-role'];                    // client-supplied header
// const role = req.body.role;                                 // client-supplied body field
// const role = req.query.role;                                // client-supplied query param
// const { role } = JSON.parse(req.headers['x-claims'] ?? '{}'); // any client-supplied claims
```

**Organization-Specific Requirements:**
- Internal APIs between organizational services that use `X-User-Role` or similar headers MUST validate those headers against the authenticated caller's identity before acting on them. Token-based role propagation (forwarding the original user token to downstream services) is preferred.

**Applicability:** All applications with authorization.

**ITSG-33 Control Families:** AC, SI: AC-3, SI-10

---

### AUTHZ-006: Client-Side Sensitive Claims

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
Sensitive claims from IdP tokens (PHN, SIN, financial data, health flags, clearance levels, and any Protected B data elements per ENC-002/003) MUST be processed server-side only. Frontends MUST receive only the minimum non-sensitive data needed for display purposes and MUST NOT receive raw token payloads containing Protected B attributes. Server-side APIs MUST project only safe, non-sensitive fields before returning data to the client.

**Detection Patterns:** Search for `jwt_decode`, `jwtDecode`, `atob(`, `parseJwt`, `decodeToken` in frontend JavaScript/TypeScript files; verify that any decoded claims do not include Protected B fields; check that API responses do not return raw or full token payloads.

**Compliant Implementation Pattern:**

```typescript
// Server-side: project only safe fields before sending to client:
app.get('/api/me', requireJwt, (req, res) => {
  const user = req.user as any;
  // Return only display-safe fields: never return raw token or Protected B claims:
  res.json({
    displayName: user.name,
    email: user.email,
    role: user.roles?.[0],
    // NEVER include: phn, sin, healthConditions, financialData, clearanceLevel, etc.
  });
});

// Frontend: never decode the token to extract user data; call the /api/me endpoint instead.
// NON-COMPLIANT frontend pattern:
// import { jwtDecode } from 'jwt-decode';
// const claims = jwtDecode(localStorage.getItem('token'));  // token may contain Protected B claims
```

**Organization-Specific Requirements:**
- PHN, SIN, medical diagnoses, and bank/credit card numbers are non-suppressible: any exposure to the client layer is a Critical finding.

**Applicability:** All applications with browser frontends handling Protected B data.

**ITSG-33 Control Families:** AC, SC: AC-4, SC-28

---

## Domain: Network & Perimeter Security

Rules BOT-001, FW-001, FW-002, CDN-001, WAF-001, CORS-001, RATE-001.

---

### BOT-001: Bot / Fraud Protection

**Enforcement:** SHOULD
**Verification Level:** infrastructure, configuration

**Requirement:**
Applications handling sensitive operations (financial transactions, money transfers, billing, sensitive data entry forms for health/SIN/banking) SHOULD implement bot and fraud protection using **F5 Shape** or equivalent. For apps on Cloudflare (Cloud LZ), Cloudflare Bot Management is assumed present as a baseline.

**Applicability Triggers:** Financial transactions (payment processing, money transfers, billing, invoicing). Sensitive data entry forms (health records, SIN/SSN, banking details). High-value account operations (bulk approvals, benefit disbursements). Search for: `payment`, `billing`, `invoice`, `transfer`, `disburs`, `SIN`, `health`, `financial`, currency symbols in forms, Stripe/payment SDK imports, API calls to Bambora.

**Default If Triggers Cannot Be Evaluated:** NOT APPLICABLE.

**Organization-Specific Requirements:**
- For public-facing apps on Cloud Landing Zone: Cloudflare Bot Management is assumed present per `shared/reference/environment-baseline.md`: use ASSUMED COMPLIANT verdict when applicable.
- For on-premises apps or apps with financial transactions: verify F5 Shape or explicit Cloudflare bot rules are configured.

**Applicability:** Sensitive apps with financial transaction or high-value account operation features.

**ITSG-33 Control Families:** SI: SI-3, SI-10

---

### FW-001: Firewall (Cloud Landing Zone)

**Enforcement:** MUST
**Verification Level:** infrastructure

**Requirement:**
Applications deployed to Cloud Landing Zones MUST have cloud-native firewall protection. Approved tools: Azure NSG + Azure Firewall, AWS Security Groups + Network Firewall, GCP VPC Firewall. Cloudflare is an approved exception for perimeter-only scenarios.

**Organization-Specific Requirements:**
- Cloud Landing Zone guardrails automatically enforce cloud-native firewalls. For confirmed Cloud LZ deployments, use ASSUMED COMPLIANT (Environment Baseline) verdict: no code review evidence is available for infrastructure controls.
- Validate in the cloud console: confirm that the application's VNet/VPC has appropriate NSG/Security Group rules and that an Azure Firewall, AWS Network Firewall, or GCP VPC Firewall is in the path.

**Applicability:** Applications deployed to organizational Azure / AWS / GCP Cloud Landing Zones.

**ITSG-33 Control Families:** SC: SC-7

---

### FW-002: Firewall (Data Centre)

**Enforcement:** MUST
**Verification Level:** infrastructure

**Requirement:**
Applications deployed to data centres MUST be protected by Zone 2/3 firewalls. The on-premises DC is **NOT zero-trust by default**: application and database servers may be on the same flat network segment. Explicit segmentation (separate VLANs/subnets per tier) MUST be verified separately. Do NOT assume the DB tier is isolated from the app tier.

**Organization-Specific Requirements:**
- Zone 2/3 firewalls are assumed for confirmed organizational DC deployments (ASSUMED COMPLIANT). However, the flat-network constraint is a threat model amplifier: lateral movement out of a compromised app tier into the DB tier is realistic without explicit segmentation.
- Verify explicit VLAN/subnet segmentation between app tier and DB tier as a separate validation step.

**Applicability:** Applications deployed to organizational on-premises data centres.

**ITSG-33 Control Families:** SC: SC-7

---

### CDN-001: Content Delivery Network

**Enforcement:** MUST
**Verification Level:** infrastructure

**Requirement:**
Applications deployed to Cloud Landing Zones MUST use a cloud-native CDN. Approved tools: Azure Front Door, AWS CloudFront, GCP Cloud CDN. CDN provides caching, DDoS mitigation, and SSL/TLS termination for public-facing content.

**Organization-Specific Requirements:**
- Cloud-native CDN is assumed for confirmed Cloud Landing Zone deployments (ASSUMED COMPLIANT). Verify in the cloud console.
- CDN does not satisfy application-layer security controls (authentication, authorization, logging).

**Applicability:** Applications deployed to Cloud Landing Zones.

**ITSG-33 Control Families:** SC: SC-7

---

### WAF-001: Web Application Firewall

**Enforcement:** MUST
**Verification Level:** infrastructure, configuration

**Requirement:**
All public-facing applications MUST be protected by a Web Application Firewall. The approved WAF is **Cloudflare** (enterprise agreement). Cloudflare provides OWASP Core Rule Set WAF, DDoS protection (L3/L4/L7), bot management, and SSL/TLS termination.

**Organization-Specific Requirements:**
- Cloudflare is assumed for all public-facing apps in Cloud Landing Zone or DC per `shared/reference/environment-baseline.md`. Use ASSUMED COMPLIANT verdict; note validation required (confirm Cloudflare is in the DNS path for the application).
- Cloudflare does NOT satisfy: application authentication, application authorization, application-level rate limiting (RATE-001), secrets management, field-level encryption, security event logging, file upload validation, CORS policy, HTTP security headers, or session management. These controls must be implemented in application code.

**Applicability:** All public-facing applications.

**ITSG-33 Control Families:** SC: SC-7

---

### CORS-001: Cross-Origin Resource Sharing

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
APIs accepting credentials MUST NOT use wildcard `*` for `Access-Control-Allow-Origin`. Allowed origins MUST be explicitly listed and validated against a server-side allowlist. This rule applies to all APIs that accept cookies, Authorization headers, or any credential material from browser clients.

**Detection Patterns:** Search for `cors(`, `Access-Control-Allow-Origin`, `allowedOrigins`, `origin: '*'` in middleware configuration. For detailed CORS assessment methodology and remediation patterns, see `shared/skills/api-security.md` Section 9.

**Compliant Implementation Pattern:**

```typescript
import cors from 'cors';

const allowedOrigins = process.env.ALLOWED_ORIGINS!.split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin (e.g., server-to-server, curl):
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin '${origin}' not allowed by CORS policy`));
    }
  },
  credentials: true, // Required when credentials (cookies, Authorization header) are sent
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// NON-COMPLIANT:
// app.use(cors({ origin: '*', credentials: true })); // wildcard + credentials = CRITICAL finding
```

**Organization-Specific Requirements:**
- For applications deployed across multiple environments, store `ALLOWED_ORIGINS` as a runtime secret per environment: never hardcode origins in code.
- Cloudflare does not set CORS headers: application code is solely responsible for this control.

**Applicability:** All APIs accepting credentials from browser clients.

**ITSG-33 Control Families:** SC: SC-8, SC-23

---

### RATE-001: Rate Limiting

**Enforcement:** MUST
**Verification Level:** code, infrastructure

**Requirement:**
All public-facing APIs MUST enforce rate limits on authentication endpoints (e.g., 5 failed attempts per 15 minutes, then lockout). API endpoints SHOULD enforce per-user rate limits. Cloudflare perimeter-level rate limiting is an approved exception for non-auth endpoints: it does NOT satisfy the authentication endpoint requirement, which must be implemented at the application layer.

**Threshold basis:** CCCS Medium / Protected B AC-7 requires lockout after 3 consecutive invalid attempts within 15 minutes with a 3-hour lockout. RATE-001's 5-attempt threshold is a pragmatic middle ground satisfying CCCS/PB requirements while remaining operationally reasonable. For applications delegating auth to organizational standard IdPs, RATE-001 adds an application-level defence layer in addition to the provider's lockout policy.

**Detection Patterns:** Search for `express-rate-limit`, `rate-limiter-flexible`, `ThrottleGuard`, `RateLimitMiddleware`, `@ratelimit`, `429` response configuration. For detailed rate limiting implementation patterns, see `shared/skills/api-security.md` Section 5.

**Compliant Implementation Pattern:**

```typescript
import rateLimit from 'express-rate-limit';

// Auth endpoint rate limiter: stricter threshold:
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                   // 5 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts; please try again later.' },
  handler: (req, res, next, options) => {
    // Log the rate limit event (satisfies LOG-001f):
    logger.warn({ event: 'RATE_LIMIT_EXCEEDED', ip: req.ip, endpoint: req.path });
    res.status(429).json(options.message);
  },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/token', authLimiter);

// Per-user rate limiter for authenticated API endpoints (SHOULD):
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  keyGenerator: (req) => req.user?.sub ?? req.ip, // per-user key
});

app.use('/api', requireJwt, apiLimiter);
```

**Organization-Specific Requirements:**
- Cloudflare perimeter-level rate limiting is assumed present for public-facing apps but does NOT satisfy RATE-001 for authentication endpoints. Application-level rate limiting on auth endpoints is always required per CCCS AC-7.

**Applicability:** All public-facing APIs.

**ITSG-33 Control Families:** AC, SI: AC-7, SI-10

---

## Domain: Secrets & Encryption

Rules SEC-001 through SEC-005, ENC-001 through ENC-003.

---

### SEC-001: Secrets in Source Code

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
Secrets MUST NOT appear in source code. Secrets include: user IDs, passwords, private keys, server names, connection strings, API keys, database connection strings, and any other credential material. Secrets in git history (even in deleted files) are a confirmed finding.

**Detection Patterns:** `eyJ` (base64 JWT), `AKIA` (AWS access key), `sk-` (OpenAI key), `ghp_` (GitHub PAT), private key PEM headers (`-----BEGIN`), connection strings with passwords, Azure connection strings.

**Compliant Implementation Pattern:**

```typescript
// Compliant: all secrets via environment variables:
const dbConnection = process.env.DATABASE_URL!;
const apiKey = process.env.THIRD_PARTY_API_KEY!;
const jwtSecret = process.env.JWT_SECRET!; // for HMAC-signed JWTs; prefer RS256 with key vault

// At startup, validate required secrets are present:
const REQUIRED_SECRETS = ['DATABASE_URL', 'JWT_SECRET', 'OIDC_CLIENT_SECRET'];
for (const key of REQUIRED_SECRETS) {
  if (!process.env[key]) throw new Error(`Required secret ${key} is not set`);
}

// NON-COMPLIANT: hardcoded secrets (any of these types is a CRITICAL finding):
// connection strings
// API keys
// private keys
```

**Organization-Specific Requirements:**
- Secrets discovered in git history (even if the file is deleted from HEAD) are a confirmed SEC-001 finding: the secret must be rotated and the history cleaned or the repo treated as compromised.
- GitHub Advanced Security scans all organizational repos; findings in GHAS code scanning are authoritative evidence for this rule.

**Applicability:** All applications.

**ITSG-33 Control Families:** IA: IA-5

---

### SEC-002: Secrets Management

**Enforcement:** MUST
**Verification Level:** code, configuration

**Requirement:**
Applications handling Protected B data MUST use an approved secrets management tool: **GitHub Secrets**, **OneIdentity Safeguard**, **KeyPass**, **Windows Credential Manager**, or **cloud-native tools in organizational landing zone** (e.g., Azure Key Vault). Secrets must not be stored in application config files in plaintext.

**Compliant Implementation Pattern:**

```typescript
// Azure Key Vault integration (Cloud Landing Zone):
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

const credential = new DefaultAzureCredential(); // Uses managed identity in Cloud LZ
const vaultUrl = process.env.AZURE_KEYVAULT_URL!;
const client = new SecretClient(vaultUrl, credential);

async function getSecret(name: string): Promise<string> {
  const secret = await client.getSecret(name);
  return secret.value!;
}

// At startup: retrieve database credentials from Key Vault:
const dbPassword = await getSecret('database-password');
```

```typescript
// GitHub Secrets (CI/CD environments): available as environment variables at runtime.
// No application code changes needed when secrets are injected via GitHub Actions / runner.
```

**Organization-Specific Requirements:**
- For Cloud Landing Zone deployments: Azure Key Vault with managed identity is the preferred approach.
- For on-premises DC deployments: OneIdentity Safeguard or Windows Credential Manager.
- GitHub Secrets is appropriate for CI/CD pipelines and deployment-time injection.

**Applicability:** All applications with Protected B data.

**ITSG-33 Control Families:** IA: IA-5

---

### SEC-003: JWT Security

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
JWTs MUST be signed. JWT signature validation MUST be enabled and MUST use an asymmetric algorithm (RS256 preferred) with JWKS key rotation. Sensitive data in JWTs that must be sent to clients MUST be encrypted (JWE). The `algorithm: 'none'` bypass is a Critical finding.

**Detection Patterns:** Search for `algorithm: 'none'`, `algorithms: ['none']`, `verify: false`, `ignoreExpiration: true`, hardcoded symmetric secrets used for JWT signing.

**Compliant Implementation Pattern:**

```typescript
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

// Compliant: RS256 with JWKS key rotation:
const jwksClient = jwksRsa({
  jwksUri: process.env.JWKS_URI!, // auto-populated from OIDC discovery
  cache: true,
  cacheMaxAge: 600_000, // 10 minutes
  rateLimit: true,
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    callback(err, key?.getPublicKey());
  });
}

function verifyToken(token: string): Promise<jwt.JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {
      algorithms: ['RS256'],    // Explicitly reject 'none' and HS256
      audience: process.env.JWT_AUDIENCE,
      issuer: process.env.JWT_ISSUER,
    }, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded as jwt.JwtPayload);
    });
  });
}

// NON-COMPLIANT patterns (any of these is a CRITICAL finding):
// jwt.verify(token, secret, { algorithms: ['none'] }, callback);  // algorithm none
// jwt.decode(token); // decode-only without verification
// const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()); // raw decode
```

**Organization-Specific Requirements:**
- approved IdPs (e.g. MS Entra ID, Corporate OIDC Provider, External Identity Gateway) typically issue RS256 JWTs with JWKS rotation: application code must use JWKS-based verification, not a hardcoded public key.
- Never include PHN, SIN, or other Protected B fields in JWT payloads (see AUTHZ-006).

**Applicability:** All applications using JWTs.

**ITSG-33 Control Families:** IA, SC: IA-5, SC-8

---

### SEC-004: .env / Config File Secrets

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
`.env` files and other configuration files containing secrets (e.g., `web.config`, `appsettings.json`, `secrets.yaml`) MUST NOT be committed to version control. Example files with placeholders (`.env.example`) and files with parameterized secrets (referencing environment variables or secret store names) MAY be committed. A committed `.env` with literal credentials is a High finding.

**Detection Patterns:** Check `.gitignore` for `.env` exclusions. Search git history for committed `.env` files. Verify that any `.env.*` files in the repository contain only placeholder values, not literal credentials.

**Compliant Implementation Pattern:**

```gitignore
# .gitignore: secrets and config files with credentials:
.env
.env.local
.env.*.local
*.env
web.config          # if it contains connection strings
appsettings.*.json  # if environment-specific with secrets
secrets.yaml
```

```bash
# .env.example (safe to commit: placeholders only):
DATABASE_URL=postgresql://user:PASSWORD@host:5432/dbname
JWT_SECRET=your-jwt-secret-here
OIDC_CLIENT_SECRET=your-oidc-secret-here
```

**Organization-Specific Requirements:**
- organizational repos are scanned by GitHub Advanced Security: committed secrets will be detected.
- When a `.env` with real credentials is found in git history (even if deleted), treat as confirmed SEC-001/SEC-004 finding: credentials must be rotated immediately.

**Applicability:** All applications.

**ITSG-33 Control Families:** IA: IA-5

---

### SEC-005: System Credential Lifecycle

**Enforcement:** MUST
**Verification Level:** code, configuration

**Requirement:**
System credentials (application registration secrets, SSH keys, API keys, encryption keys, certificate private keys) MUST be rotated at a minimum of every **365 calendar days**. System credentials MUST NOT be shared between environments (dev, test, production must each have unique credentials). Rotation MUST be documented or automated via secrets management tooling (SEC-002). Reference: organizational Digital User Credentials Standard v4.3 s1.6.

**Compliant Implementation Pattern:**

```typescript
// Azure Key Vault: configure rotation policy (infrastructure/IaC level):
// rotation_policy {
//   automatic { time_after_creation = "P90D" }  // rotate 90 days after creation
//   expire_after = "P365D"                        // max lifetime 365 days
//   notify_before_expiry = "P30D"
// }

// Application code: verify credential rotation via expiry metadata:
async function checkCredentialExpiry(secretName: string) {
  const secret = await keyVaultClient.getSecret(secretName);
  const expiresOn = secret.properties.expiresOn;
  if (expiresOn && expiresOn < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) {
    logger.warn({ event: 'CREDENTIAL_EXPIRY_APPROACHING', secretName, expiresOn });
  }
}
```

**Organization-Specific Requirements:**
- Application registration secrets in the Enterprise IdP (e.g. Entra ID) may expire; configure explicit expiry and rotation reminders.
- Each organizational environment (dev, test, prod) must have separate IdP app registrations with separate secrets.

**Applicability:** All applications with system credentials.

**ITSG-33 Control Families:** IA: IA-5(1)

---

### ENC-001: Encryption (Protected A and Higher)

**Enforcement:** MUST
**Verification Level:** code, infrastructure, configuration

**Requirement:**
ALL data classified as Protected A or higher MUST be encrypted at rest and in transit (TLS 1.2+). This includes database encryption, file system encryption, and backup encryption. Full database encryption (SQL Server TDE or cloud-managed storage encryption) satisfies the at-rest requirement for Protected A. The organizational Cryptographic Algorithms Standard applies to all encryption implementations.

**Compliant Implementation Pattern:**

```typescript
// In-transit: TLS is enforced at the Cloudflare/Cloud LZ perimeter: verify via environment-baseline.md.
// Application code does not typically configure TLS directly (perimeter-managed).

// At-rest for databases: SQL Server TDE (on-prem) or Azure SQL encryption (Cloud LZ) are assumed
// present per environment-baseline.md. Application code responsibility is to:
// 1. Use TLS in database connection strings (verify connection string options):
const dbConfig = {
  host: process.env.DB_HOST,
  ssl: {
    require: true,
    rejectUnauthorized: true, // do NOT set to false: that disables certificate validation
  },
};

// 2. For field-level encryption of Protected B data: see ENC-002 / ENC-003.
```

**Organization-Specific Requirements:**
- TLS 1.2+ at the perimeter is ASSUMED COMPLIANT for Cloud Landing Zone and DC deployments.
- For backend-to-backend connections (app tier to DB tier), verify TLS is enabled in the connection string or connection pool configuration.
- Never disable certificate validation (`rejectUnauthorized: false`) in production: this is a Critical finding.

**Applicability:** All applications with Protected A or higher data.

**ITSG-33 Control Families:** SC: SC-8, SC-28

---

### ENC-002: Encryption for Health Data (Protected B)

**Enforcement:** MUST
**Verification Level:** code, infrastructure, configuration

**Requirement:**
Personal Health Numbers (PHN) and other sensitive health information (diagnoses, health conditions) MUST be encrypted in transit AND at rest. Full database encryption such as SQL Server TDE is **insufficient**: field-level encryption is required. PHN and health diagnosis data are non-suppressible findings: no risk acceptance can suppress a finding for unencrypted PHN/health data.

**Compliant Implementation Pattern:**

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256-bit

// Key stored in Azure Key Vault (never in code or .env):
const encryptionKey = Buffer.from(process.env.FIELD_ENCRYPTION_KEY_HEX!, 'hex');

function encryptField(plaintext: string): { ciphertext: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const tag = cipher.getAuthTag();
  return {
    ciphertext,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptField(ciphertext: string, iv: string, tag: string): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

// Store in database:
// { phn_ciphertext, phn_iv, phn_tag }: never store plaintext PHN
```

**Organization-Specific Requirements:**
- PHN is a non-suppressible finding: any storage or transmission of plaintext PHN must be reported regardless of risk acceptance status.
- Medical diagnoses and health conditions require the same field-level encryption treatment as PHN.
- SQL Server TDE (assumed for organizational DC) does NOT satisfy ENC-002: field-level encryption is required in addition.

**Applicability:** All applications with Protected B health data.

**ITSG-33 Control Families:** SC: SC-28

---

### ENC-003: Encryption for Sensitive Data (Protected B)

**Enforcement:** SHOULD
**Verification Level:** code, infrastructure, configuration

**Requirement:**
Social Insurance Numbers (SIN) and other fields highly valuable to attackers (e.g., Line 15000 income from tax forms, bank account numbers, credit card numbers) SHOULD be encrypted in transit and at rest using field-level encryption. This rule is a SHOULD at the rule level but SIN, bank account numbers, and credit card numbers are listed as non-suppressible in the organizational risk acceptance framework.

**Compliant Implementation Pattern:**

Same implementation pattern as ENC-002 (AES-256-GCM field-level encryption with key stored in Key Vault). Apply the `encryptField` / `decryptField` pattern to SIN, bank account numbers, credit card PANs, and income data fields.

```typescript
// When storing a SIN:
const encryptedSin = encryptField(userInput.sin);
await db.query(
  'INSERT INTO applicants (sin_ciphertext, sin_iv, sin_tag) VALUES ($1, $2, $3)',
  [encryptedSin.ciphertext, encryptedSin.iv, encryptedSin.tag]
);
```

**Organization-Specific Requirements:**
- SIN, bank account numbers, and credit card numbers are non-suppressible: unencrypted storage of these fields must be reported regardless of risk acceptance status.
- MVID (Motor Vehicle Identification) is NOT classified as sensitive and does not require field-level encryption.

**Applicability:** All applications with Protected B SIN, financial, or other high-sensitivity data.

**ITSG-33 Control Families:** SC: SC-28

---

## Domain: Logging, Monitoring & Vulnerability Management

Rules LOG-001 through LOG-010, MAL-001, PAT-001, VUL-001.

---

### LOG-001: Security Event Logging

**Enforcement:** MUST
**Verification Level:** code, infrastructure

**Requirement:**
All applications MUST log all security events (success and failure). LOG-001 has individually assessable sub-requirements: each sub-ID must be assessed separately. The overall LOG-001 verdict is NON-COMPLIANT if ANY sub-requirement is not met.

**LOG-001 Sub-requirements:**

| Sub-ID | Event Category | What to Log | Applicability |
|--------|---------------|-------------|---------------|
| LOG-001a | Authentication events | Successful and failed auth attempts; source IP, user/client ID, timestamp | All apps with authentication |
| LOG-001b | Authorization decisions | Successful and denied authorization checks; resource, action, principal | All apps with authorization |
| LOG-001c | Password / credential events | Password changes, resets, failed attempts, account lockouts | Apps with password-based auth |
| LOG-001d | Token events | Token issuance / refresh / revocation / expiry | All apps using JWTs or OAuth tokens |
| LOG-001e | Session events | Session creation, termination, timeout, concurrent session detection | Apps with server-side sessions |
| LOG-001f | Rate limit exceeded | Requests rejected by rate limiting; source IP and endpoint | All apps with rate limiting |
| LOG-001g | Application errors / exceptions | All unhandled exceptions, 5xx responses, caught security-relevant exceptions | All apps |
| LOG-001h | Sensitive data CRUD | Create, read, update, delete on PII / financial / health data | Apps with databases containing sensitive data |
| LOG-001i | Configuration changes | Changes to application settings, feature flags, security configuration | Apps with runtime-configurable settings |
| LOG-001j | Administrative operations | User management, role assignment, permission changes, bulk operations | Apps with administrative interfaces |
| LOG-001k | File and storage operations | File uploads, downloads, deletions, storage access | Apps handling file uploads or cloud storage |

**Detection Patterns:** `OnAuthenticationFailed`, `OnTokenValidated`, `AuthorizationFailed`, `Forbidden`, `403` logging, `PasswordChanged`, `AccountLocked`, `TokenIssued`, `SessionStart`, `OnRejected`, `RateLimitExceeded`, global exception handler, audit logging on repositories/service methods.

**Compliant Implementation Pattern:**

```typescript
import pino from 'pino';
const logger = pino({ level: 'info' }); // structured JSON output (satisfies LOG-005)

// LOG-001a: authentication events:
passport.on('fail', (challenge) => {
  logger.warn({ event: 'AUTH_FAILED', ip: req.ip, userId: req.body?.username, challenge });
});

// LOG-001b: authorization decisions:
function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRoles = req.user?.roles ?? [];
    if (!userRoles.includes(role)) {
      logger.warn({ event: 'AUTHZ_DENIED', userId: req.user?.sub, role, resource: req.path });
      return res.status(403).json({ error: 'Forbidden' });
    }
    logger.info({ event: 'AUTHZ_GRANTED', userId: req.user?.sub, role, resource: req.path });
    next();
  };
}

// LOG-001d: token events:
// In OIDC callback handler:
logger.info({ event: 'TOKEN_ISSUED', userId: user.sub, sessionId: req.sessionID });

// LOG-001f: rate limit exceeded (in RATE-001 handler):
logger.warn({ event: 'RATE_LIMIT_EXCEEDED', ip: req.ip, endpoint: req.path });

// LOG-001g: global exception handler (Express):
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ event: 'UNHANDLED_EXCEPTION', error: err.message, stack: err.stack, path: req.path });
  res.status(500).json({ error: 'Internal server error' });
});

// LOG-001h: sensitive data CRUD (in service layer):
logger.info({ event: 'SENSITIVE_DATA_READ', userId: req.user?.sub, recordId: id, dataType: 'PHN' });
```

**Organization-Specific Requirements:**
- Log events MUST be shipped to the centralized cybersecurity log shipping service (Splunk or LogStash) via LOG-006.
- Log events MUST NOT include PHN, SIN, passwords, tokens, or other secret values in plaintext (see LOG-003).
- Logs MUST be structured JSON (see LOG-005): free-text logs are not acceptable.

**Applicability:** All applications.

**ITSG-33 Control Families:** AU: AU-2, AU-12

---

### LOG-002: Immutable Logs

**Enforcement:** MUST
**Verification Level:** code, infrastructure

**Requirement:**
Audit logs MUST be immutable: log records must not be modifiable or deletable by application logic or normal user operations. Immutability is typically enforced at the infrastructure layer (append-only log storage, SIEM forwarding). Application code must not implement log deletion endpoints accessible to normal users.

**Compliant Implementation Pattern:**

```typescript
// Application code responsibility: write to an append-only log sink; never provide delete/overwrite APIs.
// Infrastructure: configure log destination as append-only (Azure Blob Storage with immutability policy,
// AWS S3 Object Lock, Splunk with access controls).

// Verify: no controller or service method deletes from the audit log table/store
// NON-COMPLIANT: app.delete('/audit-logs/:id', requireJwt, deleteAuditLogHandler);
```

**Applicability:** All applications.

**ITSG-33 Control Families:** AU: AU-9

---

### LOG-003: No Secrets or PII in Logs

**Enforcement:** MUST
**Verification Level:** code, infrastructure

**Requirement:**
Log statements MUST NOT include secrets, passwords, tokens, API keys, or Personally Identifiable Information (PHN, SIN, health data, full names combined with sensitive data). Log redaction or masking must be applied when sensitive fields are present in objects being logged.

**Detection Patterns:** Search for `logger.*password`, `logger.*token`, `logger.*phn`, `logger.*sin`, `JSON.stringify(req.body)` in log statements (body may contain credentials).

**Compliant Implementation Pattern:**

```typescript
// Never log the full request body: redact sensitive fields:
logger.info({
  event: 'REQUEST_RECEIVED',
  path: req.path,
  method: req.method,
  // NEVER: body: req.body : may contain passwords, tokens, PHN
  userId: req.user?.sub,
});

// Redact sensitive fields when logging objects:
function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE_KEYS = ['password', 'token', 'secret', 'phn', 'sin', 'creditCard', 'apiKey'];
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) =>
      SENSITIVE_KEYS.some(s => k.toLowerCase().includes(s)) ? [k, '[REDACTED]'] : [k, v]
    )
  );
}

// Pino supports built-in redaction:
const logger = pino({
  redact: { paths: ['req.body.password', 'req.body.token', 'req.headers.authorization'], censor: '[REDACTED]' }
});
```

**Applicability:** All applications.

**ITSG-33 Control Families:** AU: AU-3

---

### LOG-004: Time Synchronization

**Enforcement:** MUST
**Verification Level:** code, infrastructure

**Requirement:**
Application servers MUST synchronize time to the NTP server. Accurate timestamps are required for security event correlation. This is an infrastructure-level control assumed for all deployments per `shared/reference/environment-baseline.md`.

**Organization-Specific Requirements:**
- NTP time synchronization is assumed present for all deployments (ASSUMED COMPLIANT).
- Application code responsibility: use the system clock (do not implement custom time sources); emit log timestamps in ISO 8601 or RFC 3339 format with timezone offset.

**Applicability:** All applications.

**ITSG-33 Control Families:** AU: AU-8

---

### LOG-005: Structured Logs (JSON)

**Enforcement:** MUST
**Verification Level:** code, infrastructure

**Requirement:**
All log output MUST be structured in JSON format. Free-text log messages without consistent structure are not acceptable for security event analysis and SIEM ingestion.

**Compliant Implementation Pattern:**

```typescript
// Node.js: use pino (preferred) or winston with JSON transport:
import pino from 'pino';
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // pino outputs JSON by default
});

// .NET: use Serilog with JSON output:
// Log.Logger = new LoggerConfiguration()
//   .WriteTo.Console(new JsonFormatter())
//   .CreateLogger();

// Python: use structlog:
// import structlog
// structlog.configure(processors=[structlog.processors.JSONRenderer()])
```

**Applicability:** All applications.

**ITSG-33 Control Families:** AU: AU-3

---

### LOG-006: Log Shipping

**Enforcement:** MUST
**Verification Level:** code, infrastructure

**Requirement:**
All applications MUST ship security event logs to the centralized cybersecurity log shipping service. Approved destinations: **Splunk** (primary), **LogStash** (secondary). The centralized log shipping service infrastructure is assumed present for all deployments per `shared/reference/environment-baseline.md`: the application must be configured to forward logs to it.

**Compliant Implementation Pattern:**

```typescript
// Application code responsibility: write structured JSON logs to stdout (Cloud LZ)
// or configure a log forwarder (on-premises). The infrastructure reads from stdout/log files.

// For explicit Splunk HEC forwarding (when required):
import winston from 'winston';
// const SplunkStreamEvent = require('winston-splunk-httplogger');

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({ format: winston.format.json() }), // Cloud LZ: stdout → log agent
    // new SplunkStreamEvent({ splunk: { token: process.env.SPLUNK_HEC_TOKEN, url: process.env.SPLUNK_URL } })
  ]
});
```

**Organization-Specific Requirements:**
- For Cloud Landing Zone: write to stdout; the cloud-native log agent (Azure Monitor agent, CloudWatch agent, etc.) forwards to the organizational SIEM.
- For organizational DC: configure the application log file path in the organizational log shipping agent (LogStash or Splunk forwarder).
- The log shipping infrastructure is assumed compliant per `shared/reference/environment-baseline.md`; application responsibility is to produce logs in the expected format and location.

**Applicability:** All applications.

**ITSG-33 Control Families:** AU: AU-4, AU-6

---

### LOG-007: Telemetry Logs

**Enforcement:** MUST
**Verification Level:** code, infrastructure

**Requirement:**
All applications MUST implement telemetry logging. For Cloud LZ deployments, this means integration with cloud-native telemetry services (Azure Application Insights, AWS CloudWatch, GCP Cloud Logging). For on-premises deployments, application logs and server logs must be captured.

**Organization-Specific Requirements:**
- Cloud LZ: Azure Application Insights / CloudWatch / Cloud Logging are assumed available: application code must instrument the SDK.
- On-premises: application logs written to the standard log path are captured by organizational log infrastructure.

**Compliant Implementation Pattern:**

```typescript
// Azure Application Insights (Cloud LZ):
import { TelemetryClient } from 'applicationinsights';
const client = new TelemetryClient(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING!);
client.trackEvent({ name: 'AppStarted', properties: { version: process.env.APP_VERSION } });

// For general structured logging shipped to telemetry (pino + Azure Monitor transport):
import pino from 'pino';
const logger = pino({ level: 'info' });
// Configure Azure Monitor OpenTelemetry exporter to receive pino logs
```

**Applicability:** All applications.

**ITSG-33 Control Families:** AU: AU-3

---

### LOG-008: Audit Failure Handling

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
Applications MUST alert on audit/logging processing failures. Applications MUST implement a defined overflow strategy (e.g., overwrite oldest records) rather than silently dropping new audit events.

**Compliant Implementation Pattern:**

```typescript
// Detect and alert on log shipping failures:
const logger = pino({
  onChild: () => {},
});

// For critical audit operations, implement local buffer with overflow strategy:
class AuditLogger {
  private buffer: AuditEvent[] = [];
  private readonly MAX_BUFFER = 1000;

  log(event: AuditEvent) {
    try {
      this.emitToSiem(event);
    } catch (err) {
      // SIEM unavailable: buffer locally and alert:
      if (this.buffer.length >= this.MAX_BUFFER) {
        // Overflow strategy: overwrite oldest (ring buffer):
        this.buffer.shift();
        logger.error({ event: 'AUDIT_BUFFER_OVERFLOW', dropped: 1 });
      }
      this.buffer.push(event);
      this.alertOps('AUDIT_SHIPPING_FAILURE', err);
    }
  }
}
```

**Applicability:** All applications.

**ITSG-33 Control Families:** AU: AU-5

---

### LOG-010: Audit Access Control

**Enforcement:** MUST
**Verification Level:** code, configuration

**Requirement:**
Access to audit log management / configuration / deletion MUST be restricted to a defined subset of privileged users. The set of users who can modify logging configuration MUST NOT fully overlap with the set of users whose actions are being logged. This control protects audit trail integrity: it prevents attackers or insiders from covering their tracks.

**Compliant Implementation Pattern:**

```typescript
// Restrict audit log access to AUDITOR role (defined as separate from DATA_ENTRY and ADMIN roles):
app.get('/admin/audit-logs', requireJwt, requireRole(ROLES.AUDITOR), getAuditLogsHandler);

// Logging configuration endpoint: restricted to separate security admin role:
app.post('/admin/logging-config', requireJwt, requireRole(ROLES.SECURITY_ADMIN), updateLoggingConfigHandler);

// The AUDITOR role must be held by different principals from the DATA_ENTRY role
// (enforced by AD group assignment, not application code alone: but application must define the roles).
```

**Organization-Specific Requirements:**
- Verify that the directory groups/Enterprise IdP roles (e.g. AD groups, Entra ID roles) assigned to the AUDITOR and DATA_ENTRY functions do not have overlapping membership.

**Applicability:** All applications.

**ITSG-33 Control Families:** AU: AU-9, AU-6

---

### MAL-001: Anti-Malware

**Enforcement:** MUST
**Verification Level:** infrastructure, code

**Requirement:**
All application servers and endpoints MUST run the Anti-Malware Standard (MS Defender). This is an infrastructure-level control assumed for all deployments per `shared/reference/environment-baseline.md`.

**Organization-Specific Requirements:**
- MS Defender is assumed deployed on all managed servers (ASSUMED COMPLIANT).
- Application code responsibility: when accepting file uploads (UPLOAD-001), the application must invoke malware scanning as part of the upload validation pipeline: MS Defender on the server does not automatically scan files submitted via API.

**Applicability:** All applications and endpoints.

**ITSG-33 Control Families:** SI: SI-3

---

### PAT-001: Patching

**Enforcement:** MUST
**Verification Level:** code, infrastructure

**Requirement:**
No vulnerabilities rated "critical" or "high" by NVD/CVSSv3 MUST exist in production dependencies. Automated vulnerability scanning (Trivy, npm audit, OWASP Dependency-Check) must be part of the CI/CD pipeline. Critical and High vulnerabilities must be remediated within the organizational patching SLA.

**Compliant Implementation Pattern:**

```bash
# CI/CD integration: fail build on critical/high CVEs:
npm audit --audit-level=high        # Node.js
trivy fs --exit-code 1 --severity CRITICAL,HIGH .   # container/filesystem scan
```

**Organization-Specific Requirements:**
- GitHub Advanced Security (Dependabot) is assumed active for all organizational repos: GHAS findings are authoritative evidence for PAT-001 findings.
- organizational patching SLA: Critical CVEs must be remediated within 30 days; High within 90 days (verify current SLA in organizational security operations standards).

**Applicability:** All applications.

**ITSG-33 Control Families:** SI: SI-2

---

### VUL-001: Vulnerability Management

**Enforcement:** MUST
**Verification Level:** code, configuration

**Requirement:**
All applications MUST follow the organizational Threat Model and Risk Assessment Standard. Threat modeling (per `skills/04-threat-model.md`) and security assessment must be part of the development lifecycle. Applications with no security assessment artifacts are NON-COMPLIANT.

**Applicability:** All applications, assessed during the development lifecycle.

**ITSG-33 Control Families:** CA: CA-2

---

## Domain: Cloud & Data Security

Rules RES-001, CDS-001, STORE-001, STORE-002.

---

### RES-001: Data Residency

**Enforcement:** MUST
**Verification Level:** code, infrastructure, configuration

**Requirement:**
Cloud applications SHOULD use Cloud Landing Zones deployed in Canadian regions. Cloud applications SHOULD NOT use data storage or processing services outside of Canada. Data residency in Canada is required for all Protected data.

**Organization-Specific Requirements:**
- Cloud Landing Zone is deployed in Canadian regions (Canada Central / Canada East for Azure; equivalent for AWS / GCP): ASSUMED COMPLIANT for confirmed Cloud LZ deployments.
- Verify that any third-party SaaS integrations or external API calls do not transmit Protected B data to services outside Canada.

**Applicability:** Cloud-deployed applications.

**ITSG-33 Control Families:** SC, SA: SC-7, SA-9

---

### CDS-001: Cloud Data Security

**Enforcement:** MUST
**Verification Level:** infrastructure, configuration

**Requirement:**
Applications deployed in organizational Azure Landing Zones MUST comply with the organizational Data Security in Cloud Standard. This standard specifies key management, storage access policies, and encryption requirements for cloud data stores. Infrastructure-level verification required.

**Applicability:** Applications in organizational Azure Landing Zones.

**ITSG-33 Control Families:** SC: SC-28

---

### STORE-001: Storage Bucket Security

**Enforcement:** MUST
**Verification Level:** configuration

**Requirement:**
Storage buckets (Azure Blob Storage, AWS S3, GCP Cloud Storage) MUST NOT be publicly accessible. All access MUST be mediated through authenticated API endpoints. Direct public bucket URLs that return data without authentication are a High finding.

**Compliant Implementation Pattern:**

```typescript
// Azure Blob Storage: generate a SAS token for authorized access (server-side):
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';

async function generateSecureDownloadUrl(containerName: string, blobName: string, userId: string): Promise<string> {
  // Verify authorization before generating URL (logged for LOG-001h):
  await verifyUserAccessToBlob(userId, containerName, blobName);
  logger.info({ event: 'BLOB_ACCESS_GRANTED', userId, container: containerName, blob: blobName });

  const sasOptions = {
    containerName,
    blobName,
    permissions: BlobSASPermissions.parse('r'), // read-only
    expiresOn: new Date(Date.now() + 15 * 60 * 1000), // 15-minute expiry
  };
  const sasToken = generateBlobSASQueryParameters(sasOptions, storageCredential).toString();
  return `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
}
```

**Organization-Specific Requirements:**
- Cloud Landing Zone guardrails enforce storage account access controls by default: verify that no policy exception has opened public access.
- Never generate SAS tokens with `Write` or `Delete` permissions unless required and audited.

**Applicability:** All applications using cloud storage.

**ITSG-33 Control Families:** AC: AC-3

---

### STORE-002: Data Store Security

**Enforcement:** MUST
**Verification Level:** configuration

**Requirement:**
Databases and file stores MUST NOT be publicly accessible. Database connection ports MUST NOT be exposed to the internet. All database access MUST be mediated through authenticated API endpoints.

**Compliant Implementation Pattern:**

```typescript
// Database connection: use private endpoint / VNet-bound connection string:
// Do NOT use a public hostname or IP for the database server.
// Verify DATABASE_URL points to a private/internal hostname, not a public IP.
const dbConfig = {
  connectionString: process.env.DATABASE_URL!, // must be a private endpoint
  ssl: { require: true, rejectUnauthorized: true },
};

// Verify database is not exposed in deployment manifest (Dockerfile, render.yaml, etc.)
// NEVER expose database port in docker-compose for production:
// NON-COMPLIANT:
// ports:
//   - "5432:5432"  # exposes database publicly
```

**Applicability:** All applications using databases or file stores.

**ITSG-33 Control Families:** AC: AC-3

---

## Domain: Web Application Security

Rules WEB-001, CSP-001, HDR-001, PWD-001, SESSION-001, SESSION-002, UPLOAD-001, UPLOAD-002.

---

### WEB-001: OWASP ASVS Level 2 Compliance

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
All Protected B web applications MUST be verified at OWASP ASVS version 4.0.3 Level 2. Full ASVS assessment is performed by `skills/05-asvs-level2-assessment.md`. WEB-001 in the CAS assessment records whether ASVS assessment has been completed and what the outcome is.

**Applicability:** All web applications handling Protected B data.

**ITSG-33 Control Families:** SA: SA-11, SA-15

---

### CSP-001: Content Security Policy

**Enforcement:** MUST
**Verification Level:** code, configuration

**Requirement:**
Applications MUST set a `Content-Security-Policy` header. `script-src` MUST NOT allow `unsafe-inline` or `unsafe-eval` unless justified. `default-src` SHOULD be `'self'`. `img-src` MUST NOT use wildcard origins (`https:`, `*`): restrict to specific, known image sources. `frame-ancestors` MUST be set explicitly: for applications that should not be framed, use `'none'`; for applications on shared hosting domains (e.g., `*.onrender.com`, `*.azurewebsites.net`), `'self'` is insufficient as other tenants share the origin.

**Compliant Implementation Pattern:**

```typescript
// Express: helmet.js provides CSP and other security headers:
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // Add specific hashes or nonces instead of 'unsafe-inline':
        // "'sha256-<hash>'",
        // "nonce-${nonce}",
      ],
      styleSrc: ["'self'", "'unsafe-inline'"], // inline styles often required; audit and minimize
      imgSrc: ["'self'", 'data:', 'https://specific-cdn.example.com'], // never wildcard https:
      fontSrc: ["'self'"],
      connectSrc: ["'self'", 'https://api.example.com'],
      frameAncestors: ["'none'"], // prevent framing entirely for public apps on shared hosting
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
}));
```

**Organization-Specific Requirements:**
- For apps on shared hosting domains (e.g., `*.azurewebsites.net`), `frame-ancestors: 'self'` is NOT sufficient: use `frame-ancestors: 'none'` or an explicit allowlist of organizational domains.
- `unsafe-inline` in `script-src` is a Medium finding unless justified by a nonce-based CSP.

**Applicability:** All web applications.

**ITSG-33 Control Families:** SC: SC-8

---

### HDR-001: Security Headers

**Enforcement:** MUST
**Verification Level:** code, configuration

**Requirement:**
Applications MUST set all of the following HTTP security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (preferred for public-facing apps, especially on shared hosting) or `SAMEORIGIN`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (minimum 1-year max-age)
- `Referrer-Policy: strict-origin-when-cross-origin`

Health / readiness / liveness endpoints that are exempt from authentication MUST return only an HTTP status code and a generic status indicator: they MUST NOT disclose infrastructure component connectivity (Redis/database status), environment names, application versions, or internal configuration state. Authentication status endpoints MUST NOT expose internal implementation details such as authentication driver names (e.g., `"mock"` vs `"saml"`).

**Compliant Implementation Pattern:**

```typescript
import helmet from 'helmet';

app.use(helmet({
  xContentTypeOptions: true,       // X-Content-Type-Options: nosniff
  frameguard: { action: 'deny' },  // X-Frame-Options: DENY
  hsts: {
    maxAge: 31536000,              // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Health endpoint: return ONLY status; no infrastructure details:
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' }); // CORRECT
  // NON-COMPLIANT:
  // res.json({ status: 'ok', db: dbStatus, redis: redisStatus, version: '1.2.3' });
  // res.json({ status: 'ok', authDriver: process.env.AUTH_DRIVER }); // leaks auth config
});
```

**Organization-Specific Requirements:**
- HSTS is also enforced at the Cloudflare/Cloud LZ edge for public-facing apps (defence-in-depth): application-level HSTS must still be present.
- Information disclosure via health endpoints is a common finding in organizational assessments: health endpoints returning `authDriver: "mock"` are a confirmed HDR-001 finding.

**Applicability:** All web applications.

**ITSG-33 Control Families:** SC: SC-8

---

### PWD-001: Password Policy

**Enforcement:** MUST
**Verification Level:** code, configuration

**Requirement:**
Applications MUST NOT implement their own password-based authentication: they MUST use a standard authentication tool/service (AUTH-001/002/003). **Supplemental password validators** layered on top of an approved IdP MUST enforce: (1) minimum **12 characters** (organizational password policy; CCCS IA-5); (2) complexity: at least one uppercase letter, one lowercase letter, one digit or special character. Password length and complexity MUST be enforced **server-side**: client-side-only enforcement is NON-COMPLIANT.

**Detection Patterns:** Search for `lengthValidator`, `passwordLength`, `min:`, `minLength`, `PasswordValidator`, `validatePassword`, `isValidPassword` in both frontend (`src/`) and backend source. Check the minimum value against 12. If a validator sets `min` < 12, NON-COMPLIANT (High). If length/complexity is only in frontend with no backend equivalent before persistence, second NON-COMPLIANT finding (High): "client-side-only password enforcement."

**Compliant Implementation Pattern:**

```typescript
// Server-side password validator: MUST be enforced in backend route/service, not only frontend:
function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 12) errors.push('Password must be at least 12 characters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Password must contain a lowercase letter');
  if (!/[\d\W]/.test(password)) errors.push('Password must contain a digit or special character');
  return { valid: errors.length === 0, errors };
}

// Applied in API route (server-side: not just client-side form validation):
app.post('/api/account/set-password', requireJwt, (req, res) => {
  const { password } = req.body;
  const result = validatePassword(password);
  if (!result.valid) return res.status(400).json({ errors: result.errors });
  // proceed to set password via IdP API...
});
```

**Organization-Specific Requirements:**
- If auth is fully delegated to an approved organizational IdP (AUTH-001/002/003) and no supplemental validator exists, mark as ASSUMED COMPLIANT: "password policy delegated to organizational IdP."
- Breach password checks (SHOULD) should be assessed as a REVIEW RECOMMENDED sub-requirement.

**Applicability:** All applications with password-based authentication (supplemental validators included).

**ITSG-33 Control Families:** IA: IA-5

---

### SESSION-001: Session Management

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
Session tokens SHOULD be stored in httpOnly, Secure, SameSite cookies rather than `localStorage`. Session tokens MUST NOT appear in URLs. Session idle timeout MUST be enforced. Applications MUST invalidate all session identifiers (tokens, cookies) upon user logout or session termination: session identifiers MUST NOT be reusable after invalidation.

**Detection Patterns:** Search for `localStorage.setItem.*token` and `sessionStorage.setItem.*token` in frontend code (token stored in browser storage: SHOULD sub-requirement violation), and for `?token=` in URL construction. Then verify that idle timeout is configured in session middleware and that the logout handler destroys the session.

**Compliant Implementation Pattern:**

```typescript
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
const PgSession = connectPgSimple(session);

app.use(session({
  store: new PgSession({ conString: process.env.DATABASE_URL }),
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,       // prevents JavaScript access
    secure: true,         // HTTPS only
    sameSite: 'strict',   // prevents CSRF via cross-site requests
    maxAge: 30 * 60 * 1000, // 30-minute idle timeout
  },
  name: '__Host-session', // __Host- prefix enforces secure, path=/, no domain attribute
}));

// Logout: invalidate session and clear cookie:
app.post('/logout', requireJwt, (req, res) => {
  req.session.destroy((err) => {
    if (err) logger.error({ event: 'SESSION_DESTROY_FAILED', error: err.message });
    res.clearCookie('__Host-session');
    // Also call IdP end_session_endpoint (SESSION-002):
    res.redirect(`${process.env.IDP_LOGOUT_URL}?post_logout_redirect_uri=${encodeURIComponent(process.env.APP_URL!)}`);
  });
});
```

**Organization-Specific Requirements:**
- Stateless APIs using only Bearer token authentication (no cookies, no server-side sessions) satisfy the MUST sub-requirements automatically. The SHOULD sub-requirement (httpOnly/Secure/SameSite cookies) may be marked NOT APPLICABLE with justification "stateless API; no cookies."
- The `__Host-` cookie prefix enforces the most restrictive same-site semantics and is recommended for organizational apps.

**Applicability:** All web applications with authentication.

**ITSG-33 Control Families:** AC, SC: AC-12, SC-10

---

### SESSION-002: Federated Logout

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
Applications using federated identity (AUTH-001/002/003) MUST call the IdP's `end_session_endpoint` (OIDC RP-initiated logout) on user logout, in addition to destroying the local session (SESSION-001). Clearing only the local session or cookies without calling the IdP logout is NON-COMPLIANT: the upstream IdP session remains active, allowing the user to re-access the application without re-entering credentials. The logout redirect MUST include a `post_logout_redirect_uri` registered with the IdP.

**Detection Patterns:** Search for logout handlers/controllers; verify they redirect to the IdP logout URL (e.g. Entra ID: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/logout`; KeyCloak / Corporate OIDC: `{issuer}/protocol/openid-connect/logout`). A logout that only destroys the server-side session or clears cookies without calling the IdP `end_session_endpoint` is NON-COMPLIANT.

**Compliant Implementation Pattern:**

```typescript
// Enterprise IdP RP-initiated logout (example: Entra ID):
const ENTRA_LOGOUT_URL = `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/oauth2/v2.0/logout`;

app.post('/logout', requireJwt, (req, res) => {
  const idToken = req.session.idToken; // preserve for id_token_hint before destroying session

  req.session.destroy(() => {
    res.clearCookie('__Host-session');
    // Redirect to IdP end_session_endpoint:
    const logoutUrl = new URL(ENTRA_LOGOUT_URL);
    logoutUrl.searchParams.set('post_logout_redirect_uri', process.env.APP_URL!);
    if (idToken) logoutUrl.searchParams.set('id_token_hint', idToken); // recommended for Entra ID
    res.redirect(logoutUrl.toString());
  });
});

// Corporate OIDC Provider / KeyCloak logout:
// const KEYCLOAK_LOGOUT_URL = `${process.env.OIDC_ISSUER}/protocol/openid-connect/logout`;
```

**Organization-Specific Requirements:**
- Example: Entra ID supports RP-initiated logout; the `post_logout_redirect_uri` must be pre-registered in the IdP app registration.
- Corporate OIDC Provider and KeyCloak use the standard OpenID Connect RP-initiated logout spec.

**Applicability:** All applications using federated identity (AUTH-001/002/003).

**ITSG-33 Control Families:** AC, IA: AC-12, IA-4

---

### UPLOAD-001: File Upload Security

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
Uploaded files MUST be validated by BOTH extension whitelist AND magic byte / MIME type inspection. File size limits MUST be enforced server-side. Uploaded files MUST be scanned for malware before storage. Uploaded files MUST NOT be served with executable content types unless explicitly required.

**Scope: "file uploads" includes base64 payloads:** "File uploads" means any mechanism by which untrusted file content enters the application: multipart form uploads (`IFormFile`, `multipart/form-data`), base64-encoded file content in JSON/XML request bodies, file paths or URLs supplied by the client that the server fetches and processes.

**Detection Patterns:** Search for `IFormFile`, `[FromForm]`, `multipart`, `base64`, `Buffer.from(`, `atob(`, combined with file-related model names (e.g., `EncodedDoc`, `Template`, `EncodedPdf`).

**Compliant Implementation Pattern:**

```typescript
import multer from 'multer';
import fileType from 'file-type';
import path from 'path';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.png', '.jpg', '.jpeg'];
const ALLOWED_MIME_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    // Extension whitelist check:
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error(`File extension '${ext}' is not allowed`));
    }
    cb(null, true);
  },
  storage: multer.memoryStorage(), // hold in memory for magic byte inspection before writing
});

app.post('/upload', requireJwt, upload.single('file'), async (req, res) => {
  const buffer = req.file!.buffer;

  // Magic byte inspection:
  const detected = await fileType.fromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
    return res.status(400).json({ error: 'File type does not match allowed types' });
  }

  // Malware scanning: call ClamAV, MS Defender API, or cloud-native malware scanning:
  const scanResult = await malwareScanner.scan(buffer, req.file!.originalname);
  if (scanResult.infected) {
    logger.warn({ event: 'MALWARE_DETECTED', filename: req.file!.originalname, userId: req.user?.sub });
    return res.status(400).json({ error: 'File failed security scan' });
  }

  // Log file upload (LOG-001k):
  logger.info({ event: 'FILE_UPLOADED', userId: req.user?.sub, filename: req.file!.originalname, size: buffer.length });

  // Proceed to UPLOAD-002 compliant storage...
});
```

**Organization-Specific Requirements:**
- Malware scanning is required before storage: MS Defender on the server does not automatically scan API-submitted files.

**Applicability:** All applications accepting file uploads (including base64-encoded file content in API payloads).

**ITSG-33 Control Families:** SI: SI-3, SI-10

---

### UPLOAD-002: File Upload Storage

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
Uploaded files MUST NOT be stored long-term in buckets, Blob storage, or databases. Uploaded files MUST be moved to **M365 SharePoint** with appropriate metadata. UPLOAD-002 applies when the application persists uploaded file content. APIs that process file content entirely in memory and return the result without persisting are NOT subject to UPLOAD-002 for those in-memory operations.

**Compliant Implementation Pattern:**

```typescript
// After UPLOAD-001 validation and scanning, move to organizational M365 SharePoint:
import { Client } from '@microsoft/microsoft-graph-client';

const graphClient = Client.init({
  authProvider: (done) => {
    // Use managed identity or app registration to obtain Graph token:
    done(null, await getGraphToken());
  },
});

async function moveToSharePoint(buffer: Buffer, filename: string, metadata: Record<string, string>) {
  const siteId = process.env.SHAREPOINT_SITE_ID!;
  const driveId = process.env.SHAREPOINT_DRIVE_ID!;

  // Upload to SharePoint document library:
  const uploadedItem = await graphClient
    .api(`/sites/${siteId}/drives/${driveId}/root:/${filename}:/content`)
    .put(buffer);

  // Apply metadata (column values):
  await graphClient
    .api(`/sites/${siteId}/drives/${driveId}/items/${uploadedItem.id}/listItem/fields`)
    .patch(metadata);

  return uploadedItem.id;
}
```

**Organization-Specific Requirements:**
- organizational M365 SharePoint is the mandated long-term storage destination for uploaded files.
- Do not store uploaded files permanently in Azure Blob Storage, S3, or application databases as the primary storage location: those may be used as transit/staging areas only.

**Applicability:** All applications that persist uploaded file content.

**ITSG-33 Control Families:** SC: SC-28

---

## Domain: Account Lifecycle

Rule ACCT-001.

---

### ACCT-001: Inactive Account Lifecycle

**Enforcement:** MUST
**Verification Level:** code, configuration

**Requirement:**
Applications MUST disable accounts after **90 consecutive days of inactivity**. Disabled accounts MUST be terminated (access fully revoked) after **180 days of inactivity**. Terminated accounts MUST be permanently removed after **270 days of inactivity**. Applications that delegate account management to organizational standard identity providers (AUTH-001/002/003) satisfy this requirement if the provider enforces equivalent lifecycle rules. Reference: organizational Digital User Credentials Standard v4.3 Appendix A; CCCS AC-2(3); PB AC-2(3).

**Compliant Implementation Pattern:**

```typescript
// Scheduled job: detect and disable inactive accounts:
async function enforceAccountLifecycle() {
  const now = new Date();
  const day90Ago = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const day180Ago = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const day270Ago = new Date(now.getTime() - 270 * 24 * 60 * 60 * 1000);

  // Disable accounts inactive for 90+ days:
  await db.query(
    `UPDATE users SET status = 'disabled' WHERE last_active < $1 AND status = 'active'`,
    [day90Ago]
  );

  // Terminate accounts inactive for 180+ days:
  await db.query(
    `UPDATE users SET status = 'terminated' WHERE last_active < $1 AND status = 'disabled'`,
    [day180Ago]
  );

  // Permanently remove accounts inactive for 270+ days:
  await db.query(
    `DELETE FROM users WHERE last_active < $1 AND status = 'terminated'`,
    [day270Ago]
  );

  logger.info({ event: 'ACCOUNT_LIFECYCLE_ENFORCED', timestamp: now });
}
```

**Organization-Specific Requirements:**
- If account management is fully delegated to the Enterprise IdP (e.g. Entra ID) or Corporate OIDC Provider (AUTH-001/002), verify the provider's account lifecycle policies satisfy the 90/180/270-day thresholds. If the provider enforces equivalent rules, mark as ASSUMED COMPLIANT.
- If the application maintains local accounts or user tables, the lifecycle job above is required.

**Applicability:** All applications with local or application-managed accounts.

**ITSG-33 Control Families:** AC: AC-2(3)

---

## Domain: AI Agent Security

Rules AI-001 through AI-006.

---

### AI-001: AI Input Sanitization

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
User input MUST be sanitized or bounded before inclusion in LLM prompts. System prompts MUST be isolated against user-controlled content to prevent prompt injection attacks. Untrusted input must not be able to override system instructions.

**Detection Patterns:** Search for template literals or string concatenation that mixes `process.env` system prompt content with `req.body` user input directly.

**Compliant Implementation Pattern:**

```typescript
// Compliant: system prompt separated from user content using chat roles:
const response = await openai.chat.completions.create({
  model: process.env.OPENAI_MODEL!,
  messages: [
    {
      role: 'system',
      content: process.env.SYSTEM_PROMPT!, // never include user input in system role
    },
    {
      role: 'user',
      // Sanitize and bound user content before including:
      content: sanitizeUserInput(userMessage).slice(0, MAX_USER_INPUT_LENGTH),
    },
  ],
  max_tokens: parseInt(process.env.MAX_TOKENS!, 10), // server-side limit (AI-003)
});

function sanitizeUserInput(input: string): string {
  // Remove known prompt injection patterns:
  return input
    .replace(/ignore previous instructions/gi, '[removed]')
    .replace(/system prompt/gi, '[removed]')
    .trim();
}
```

**Organization-Specific Requirements:**
- For applications handling Protected B data via LLMs: data sent to LLMs must respect authorization boundaries (AI-004).
- LLM API keys must be managed as secrets (SEC-001/002): never hardcode `OPENAI_API_KEY` in source.

**Applicability:** All applications using LLM APIs.

**ITSG-33 Control Families:** SI: SI-10

---

### AI-002: AI Output Sanitization

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
LLM-generated output MUST be treated as untrusted input. HTML or JavaScript output from LLMs MUST be sanitized before rendering in a browser. LLM output MUST NOT be executed as code without human review.

**Compliant Implementation Pattern:**

```typescript
import DOMPurify from 'isomorphic-dompurify';

// Sanitize LLM HTML output before rendering:
app.get('/api/ai-content', requireJwt, async (req, res) => {
  const rawOutput = await getLlmResponse(req.query.prompt as string);

  // Treat as untrusted HTML: sanitize before sending to client:
  const safeHtml = DOMPurify.sanitize(rawOutput, {
    ALLOWED_TAGS: ['p', 'ul', 'ol', 'li', 'strong', 'em', 'h2', 'h3'],
    ALLOWED_ATTR: [],
  });

  res.json({ content: safeHtml });
});

// Frontend: render sanitized content with safe method (NOT innerHTML with raw output):
// COMPLIANT: element.innerHTML = safeHtml;  (after server-side sanitization)
// NON-COMPLIANT: element.innerHTML = rawLlmOutput; // XSS risk
```

**Applicability:** All applications rendering AI output in browser frontends.

**ITSG-33 Control Families:** SI: SI-10

---

### AI-003: AI Cost Controls

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
Server-side token limits MUST be enforced for all LLM API calls. Per-user or per-project quotas SHOULD be implemented when multiple users share LLM API access. Client-supplied token limits MUST NOT be allowed to exceed server-side maximums.

**Compliant Implementation Pattern:**

```typescript
const MAX_TOKENS_PER_REQUEST = parseInt(process.env.MAX_TOKENS!, 10) || 1000;
const MAX_TOKENS_PER_USER_PER_HOUR = parseInt(process.env.MAX_TOKENS_USER_HOUR!, 10) || 50000;

app.post('/api/ai/chat', requireJwt, async (req, res) => {
  const { prompt, maxTokens: clientMax } = req.body;

  // Server-side cap: client-supplied maxTokens cannot exceed server maximum:
  const effectiveMaxTokens = Math.min(
    typeof clientMax === 'number' ? clientMax : MAX_TOKENS_PER_REQUEST,
    MAX_TOKENS_PER_REQUEST
  );

  // Per-user quota check:
  const usage = await getTokenUsageLastHour(req.user!.sub);
  if (usage + effectiveMaxTokens > MAX_TOKENS_PER_USER_PER_HOUR) {
    return res.status(429).json({ error: 'Token quota exceeded for this period' });
  }

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL!,
    messages: [{ role: 'user', content: sanitizeUserInput(prompt) }],
    max_tokens: effectiveMaxTokens,
  });

  await recordTokenUsage(req.user!.sub, response.usage?.total_tokens ?? 0);
  res.json({ content: response.choices[0].message.content });
});
```

**Applicability:** All applications calling paid LLM APIs.

**ITSG-33 Control Families:** SC, SA: SC-5, SA-9

---

### AI-004: AI Data Boundary

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
Project data sent to LLM APIs MUST respect the same authorization boundaries as direct data access. User A's data MUST NOT be includable in User B's AI prompts. Prompt construction that aggregates data across user boundaries is a Critical finding.

**Compliant Implementation Pattern:**

```typescript
app.post('/api/ai/analyze-record', requireJwt, async (req, res) => {
  const { recordId } = req.body;

  // Authorization check BEFORE including data in prompt: same as for direct data access:
  const record = await db.getRecord(recordId);
  if (!record || record.ownerId !== req.user!.sub) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Only include the authenticated user's own record in the prompt:
  const prompt = `Analyze the following record for the authenticated user only:\n${JSON.stringify(record)}`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL!,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: MAX_TOKENS_PER_REQUEST,
  });

  res.json({ analysis: response.choices[0].message.content });
});
```

**Organization-Specific Requirements:**
- For applications with Protected B data: LLM prompts must never include another user's PHN, SIN, or health data.
- Review whether the LLM API provider meets organizational data residency requirements (RES-001) before sending Protected B data to external LLM APIs.

**Applicability:** All applications sending user data to LLMs.

**ITSG-33 Control Families:** AC: AC-3, AC-4

---

### AI-005: AI Tool Execution

**Enforcement:** MUST
**Verification Level:** code

**Requirement:**
AI agents with tool-use capabilities (file I/O, API calls, database queries) MUST have explicit capability boundaries. File path inputs MUST be validated against traversal attacks. URL inputs MUST be validated against SSRF. Tool calls must be scoped to the authenticated user's authorized data.

**Compliant Implementation Pattern:**

```typescript
import path from 'path';

const ALLOWED_FILE_DIR = path.resolve(process.env.UPLOAD_STORAGE_PATH!);

// File tool: validate path traversal:
function safeReadFile(userSuppliedPath: string): Buffer {
  const resolved = path.resolve(ALLOWED_FILE_DIR, userSuppliedPath);
  if (!resolved.startsWith(ALLOWED_FILE_DIR)) {
    throw new Error('Path traversal detected');
  }
  return fs.readFileSync(resolved);
}

// URL tool: validate against SSRF (allowlist of permitted external hosts):
const ALLOWED_FETCH_HOSTS = new Set(process.env.ALLOWED_FETCH_HOSTS!.split(','));

async function safeFetch(url: string): Promise<Response> {
  const parsed = new URL(url);
  if (!ALLOWED_FETCH_HOSTS.has(parsed.hostname)) {
    throw new Error(`Host '${parsed.hostname}' is not in the allowed fetch list`);
  }
  // Block internal/private IP ranges:
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.)/.test(parsed.hostname)) {
    throw new Error('SSRF: internal IP ranges are not allowed');
  }
  return fetch(url);
}
```

**Applicability:** All applications using AI tool-use / function-calling.

**ITSG-33 Control Families:** SI, SC: SI-10, SC-7

---

### AI-006: AI Code Generation

**Enforcement:** MUST
**Verification Level:** code, configuration

**Requirement:**
AI-generated code MUST NOT be deployed to production without human review or automated security scanning. Generated code MUST be treated as untrusted input and must pass the same security gates as human-authored code (static analysis, dependency scanning, peer review).

**Compliant Implementation Pattern:**

```yaml
# CI/CD pipeline: AI-generated code must pass all gates before deployment:
# .github/workflows/security-checks.yml
jobs:
  security:
    steps:
      - name: Static Analysis
        run: npx eslint . --ext .ts,.js --rule '{"no-eval": "error"}'
      - name: Dependency Vulnerability Scan
        run: npm audit --audit-level=high
      - name: SAST Scan
        run: trivy fs --exit-code 1 --severity CRITICAL,HIGH .
      # PR review gate enforced by branch protection: no self-merging
```

**Organization-Specific Requirements:**
- GitHub Advanced Security (CodeQL) scans all organizational repos and applies to AI-generated code automatically.
- AI-generated code committed by bot accounts (no human review) is a confirmed AI-006 finding: verify PR review records.

**Applicability:** All applications generating deployable code via AI.

**ITSG-33 Control Families:** SA: SA-11, CM-14

---

## ITSG-33 Quick Reference Index

| Rule ID | Rule Topic | ITSG-33 Control Family | Primary Controls |
|---------|-----------|------------------------|-----------------|
| AUTH-001 | Authentication (Public/External) | IA | IA-2, IA-8 |
| AUTH-002 | Authentication (Staff) | IA | IA-2 |
| AUTH-003 | Authentication (Partners) | IA | IA-2, IA-8 |
| AUTH-004 | API Authentication | IA | IA-3, IA-9 |
| IDPR-001 | Identity Protocol (SAML/OIDC) | IA | IA-2 |
| IDPR-002 | OIDC Discovery Endpoint | IA, SC | IA-2, SC-23 |
| IDPV-001 | Identity Providers | IA | IA-2, IA-4 |
| IDBR-001 | Identity Broker / Federator | IA | IA-2, IA-4 |
| MFA-001 | MFA (Staff) | IA | IA-2(1), IA-2(6) |
| MFA-002 | MFA (Public/External) | IA | IA-2(1) |
| AUTHZ-001 | Authorization Backend | AC | AC-3, AC-6 |
| AUTHZ-002 | RBAC / ABAC + Middleware Ordering | AC | AC-3, AC-4 |
| AUTHZ-003 | Separation of Duties | AC | AC-5 |
| AUTHZ-004 | Non-Privileged Access | AC | AC-6(2) |
| AUTHZ-005 | Role Source Integrity | AC, SI | AC-3, SI-10 |
| AUTHZ-006 | Client-Side Sensitive Claims | AC, SC | AC-4, SC-28 |
| BOT-001 | Bot / Fraud Protection | SI | SI-3, SI-10 |
| FW-001 | Firewall (Cloud LZ) | SC | SC-7 |
| FW-002 | Firewall (Data Centre) | SC | SC-7 |
| CDN-001 | Content Delivery Network | SC | SC-7 |
| WAF-001 | Web Application Firewall | SC | SC-7 |
| CORS-001 | Cross-Origin Resource Sharing | SC | SC-8, SC-23 |
| RATE-001 | Rate Limiting | AC, SI | AC-7, SI-10 |
| SEC-001 | Secrets in Source Code | IA | IA-5 |
| SEC-002 | Secrets Management | IA | IA-5 |
| SEC-003 | JWT Security | IA, SC | IA-5, SC-8 |
| SEC-004 | .env / Config File Secrets | IA | IA-5 |
| SEC-005 | System Credential Lifecycle | IA | IA-5(1) |
| ENC-001 | Encryption (Protected A+) | SC | SC-8, SC-28 |
| ENC-002 | Encryption (Health Data) | SC | SC-28 |
| ENC-003 | Encryption (Sensitive Data) | SC | SC-28 |
| LOG-001 | Security Event Logging | AU | AU-2, AU-12 |
| LOG-002 | Immutable Logs | AU | AU-9 |
| LOG-003 | No Secrets / PII in Logs | AU | AU-3 |
| LOG-004 | Time Synchronization | AU | AU-8 |
| LOG-005 | Structured Logs (JSON) | AU | AU-3 |
| LOG-006 | Log Shipping | AU | AU-4, AU-6 |
| LOG-007 | Telemetry Logs | AU | AU-3 |
| LOG-008 | Audit Failure Handling | AU | AU-5 |
| LOG-010 | Audit Access Control | AU | AU-9, AU-6 |
| MAL-001 | Anti-Malware | SI | SI-3 |
| PAT-001 | Patching | SI | SI-2 |
| VUL-001 | Vulnerability Management | CA | CA-2 |
| RES-001 | Data Residency | SC, SA | SC-7, SA-9 |
| CDS-001 | Cloud Data Security | SC | SC-28 |
| STORE-001 | Storage Bucket Security | AC | AC-3 |
| STORE-002 | Data Store Security | AC | AC-3 |
| WEB-001 | OWASP ASVS Level 2 | SA | SA-11, SA-15 |
| CSP-001 | Content Security Policy | SC | SC-8 |
| HDR-001 | Security Headers | SC | SC-8 |
| PWD-001 | Password Policy | IA | IA-5 |
| SESSION-001 | Session Management | AC, SC | AC-12, SC-10 |
| SESSION-002 | Federated Logout | AC, IA | AC-12, IA-4 |
| UPLOAD-001 | File Upload Security | SI | SI-3, SI-10 |
| UPLOAD-002 | File Upload Storage | SC | SC-28 |
| ACCT-001 | Inactive Account Lifecycle | AC | AC-2(3) |
| AI-001 | AI Input Sanitization | SI | SI-10 |
| AI-002 | AI Output Sanitization | SI | SI-10 |
| AI-003 | AI Cost Controls | SC, SA | SC-5, SA-9 |
| AI-004 | AI Data Boundary | AC | AC-3, AC-4 |
| AI-005 | AI Tool Execution | SI, SC | SI-10, SC-7 |
| AI-006 | AI Code Generation | SA | SA-11, CM-14 |
