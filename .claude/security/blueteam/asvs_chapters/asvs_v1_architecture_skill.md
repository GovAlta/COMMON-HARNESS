---
id: asvs-v1-architecture-subskill
name: ASVS V1 Architecture Sub-Skill
description: ASVS chapter V1 assessment logic consumed by the ASVS Level 2 assessment workflow.
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

> Sub-skill for **V1 Architecture, Design and Threat Modeling**. Finding IDs: `[V1-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

| Condition | Sub-requirements excluded | Justification |
|-----------|---------------------------|---------------|
| No file upload functionality | V1.12 (File Upload Architecture) | No file handling to assess |
| No business logic / workflow steps | V1.10 (Business Logic Architecture) | No sequential transaction processing |
| Managed language (C#, Java, Python, JS/TS, Go, Ruby) | V1.4 Memory safety architecture | Managed language provides automatic memory safety |

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## V1 Requirements and Verification Rules

### V1.1 — Secure Software Development Lifecycle

**V1.1.1** — Verify the use of a secure software development lifecycle that addresses security in all stages.
- **CAS Rule:** None beyond standard.
- **Verification:** Architectural assessment — review whether security is addressed in design docs, CI/CD pipelines (SAST, SCA, secret scanning hooks), and code review processes. Evidence: `.github/workflows/` containing security scanning steps, `SECURITY.md`, threat model documents.
- **ATT&CK Tactic:** N/A (architectural gap)
- **Severity if failed:** Low (process gap; elevated to Medium if SAST/SCA entirely absent)

**V1.1.2** — Verify the use of threat modeling for every design change or sprint planning to identify threats, plan for countermeasures, facilitate appropriate risk responses, and guide security testing.
- **CAS Rule:** The organization requires threat modeling for Protected B applications using the STRIDE/DREAD methodology (see `skills/04-threat-model.md`). Verify `.ai/blueteam/reports/` contains a threat model or that `skills/04-threat-model.md` has been run.
- **Verification:** Check for the existence of `.ai/blueteam/reports/threat_model_report.md` or equivalent threat model artifact. If absent and the app is Protected B, this is a finding.
- **ATT&CK Tactic:** N/A
- **Severity if failed:** Medium

**V1.1.3** — Verify that all user stories and features contain functional security constraints.
- **CAS Rule:** None.
- **Verification:** Review of requirements/stories is typically out-of-scope for code review; note as "Not verifiable via code review" and assess as N/A unless requirements artifacts are accessible.
- **ATT&CK Tactic:** N/A
- **Severity if failed:** Low / NOT VERIFIABLE

**V1.1.4** — Verify documentation and justification of all the application's trust boundaries, components, and significant data flows.
- **CAS Rule:** None.
- **Verification:** Look for architecture diagrams, data flow diagrams in the repository. Check `.ai/blueteam/reports/` for existing assessments. Note: absence of documentation is a Low finding; do not elevate.
- **ATT&CK Tactic:** N/A
- **Severity if failed:** Low

**V1.1.5** — Verify definition and security analysis of the application's high-level architecture and all remote services.
- **CAS Rule:** None.
- **Verification:** Review architecture documentation or infer from code structure. Note whether third-party/remote services are identified and their trust levels documented.
- **ATT&CK Tactic:** N/A
- **Severity if failed:** Low

**V1.1.6** — Verify implementation of centralized, simple (economy of design), vetted, secure, and reusable security controls to avoid duplicate, missing, inconsistent, or fragile controls.
- **CAS Rule:** None.
- **Verification:** Review whether auth, authz, validation, and error handling logic is centralized (middleware/shared services) vs. scattered across individual handlers. Duplicated auth checks with inconsistent implementation is a finding.
- **ATT&CK Tactic:** TA0001 — Initial Access (inconsistent controls create bypassable paths)
- **Severity if failed:** Medium (if inconsistencies create exploitable gaps)

**V1.1.7** — Verify availability of a secure coding checklist, security requirements, guideline, or policy to all developers.
- **CAS Rule:** None.
- **Verification:** NOT VERIFIABLE via code review. Note as N/A unless CLAUDE.md or similar developer security guide is present in the repository.
- **ATT&CK Tactic:** N/A
- **Severity if failed:** Low / NOT VERIFIABLE

---

### V1.2 — Authentication Architecture

**V1.2.1** — Verify the use of unique or special low-privilege operating system accounts for all application components, services, and servers.
- **CAS Rule:** None.
- **Verification:** Review Dockerfile, Kubernetes manifests, deployment configs for non-root user specifications. Check for `USER` directive in Dockerfile, `runAsNonRoot: true` in K8s security context.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** High (if running as root/admin in container or service)

**V1.2.2** — Verify that communications between application components, including APIs, middleware and data layers, are authenticated. Components should have the least necessary privileges needed.
- **CAS Rule:** None.
- **Verification:** Review service-to-service communication patterns. Check database connection strings for named service accounts (not admin/sa). Check inter-service API calls for authentication headers.
- **ATT&CK Tactic:** TA0008 — Lateral Movement
- **Severity if failed:** High

**V1.2.3** — Verify that the application uses a single vetted authentication mechanism that is known to be strong, can be extended to include strong authentication, and has sufficient logging and monitoring to detect account abuse or breaches.
- **CAS Rule:** Approved organizational IdPs are the vetted authentication mechanisms. Multiple parallel auth mechanisms (e.g., both JWT and session cookie, both mock and real auth) increase attack surface.
- **Verification:** Identify all auth mechanisms active simultaneously. Multiple active auth paths that are not explicitly designed for IdP federation are a finding.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** High

**V1.2.4** — Verify that all authentication pathways and identity management APIs implement consistent authentication security control strength, such that there are no weaker alternatives that can be used to break the authentication.
- **CAS Rule:** None.
- **Verification:** Check all auth entry points (login, SSO callback, API key, service-to-service) for consistent enforcement of auth checks. If one path has a lower security bar, it is a finding.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Critical

---

### V1.3 — Session Management Architecture

**V1.3.1** — Verify that the application uses a single vetted session management mechanism that is known to be strong, can be extended to include strong authentication.
- **CAS Rule:** None.
- **Verification:** Identify session management approach (JWT, server-side session, cookie). Verify consistency — multiple parallel session mechanisms increase attack surface.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** High

---

### V1.4 — Access Control Architecture

**V1.4.1** — Verify that trusted enforcement points such as access control gateways, servers, and serverless functions enforce access controls. Never enforce access controls on the client.
- **CAS Rule:** None.
- **Verification:** Check that authorization logic is server-side. Search for authorization decisions made solely on client-supplied data without server-side verification.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** Critical

**V1.4.2** — [Removed in ASVS 4.0.3 — skip]

**V1.4.3** — Verify that a single and auditable access control mechanism is used by the application. All requests must pass through this single mechanism.
- **CAS Rule:** None.
- **Verification:** Review authorization architecture for centralized RBAC/ABAC policy enforcement vs. scattered per-handler checks. Multiple independent access control implementations are a finding.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** High

**V1.4.4** — Verify that data and functionality are protected based on security classification of the data being handled.
- **CAS Rule:** Protected B data must have heightened access controls (MFA, audit logging, field-level encryption).
- **Verification:** Cross-reference with security classification output. Verify that Protected B fields have appropriate access control enforcement in handlers.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High (Critical if Protected B data lacks access control)

**V1.4.5** — **Application Partitioning (SC-2)**: Verify that end-user functionality is separated from administrative/management functionality via separate interfaces, routes, or deployments.
- **CAS Rule:** Admin interfaces MUST NOT be accessible through the same entry point as user-facing functionality without additional authentication barriers.
- **Verification:** Review route organization. Check if admin routes are mounted under a protected prefix (`/admin`, `/management`) with additional auth middleware. Confirm admin routes are not accessible from the same unauthenticated entry point as user-facing routes.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** High

---

### V1.5 — Input and Output Architecture

**V1.5.1** — Verify that input and output requirements clearly define how to handle and process data based on type, content, and applicable laws, regulations, and other policy compliance.
- **CAS Rule:** None.
- **Verification:** Review whether input validation is applied consistently at API boundary (not just in UI). Check for centralized input schema validation vs. per-handler ad hoc validation.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Medium

**V1.5.2** — Verify that serialization is not used when communicating with untrusted clients. If this is not possible, ensure that adequate integrity controls (and possibly encryption) are enforced to prevent deserialization attacks.
- **CAS Rule:** None.
- **Verification:** Check for `BinaryFormatter`, `JavaScriptSerializer`, Java serialization, `pickle`, `yaml.load` (unsafe) in code paths receiving client data.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical

**V1.5.3** — Verify that input validation is enforced on a trusted service layer, not on the client alone.
- **CAS Rule:** None.
- **Verification:** Confirm validation logic exists server-side, not only in client-side code.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** High

**V1.5.4** — Verify that output encoding occurs close to or by the interpreter for which it is intended.
- **CAS Rule:** None.
- **Verification:** Review template rendering — check for manual HTML construction vs. framework-managed encoding.
- **ATT&CK Tactic:** TA0001 — Initial Access (XSS)
- **Severity if failed:** High

---

### V1.6 — Cryptographic Architecture

**V1.6.1** — Verify that there is an explicit policy for management of cryptographic keys and that a cryptographic key lifecycle follows a key management standard such as NIST SP 800-57.
- **CAS Rule:** None.
- **Verification:** Check for key rotation mechanisms in secrets manager / key vault configuration. Note whether a formal key lifecycle is documented.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium

**V1.6.2** — Verify that consumers of cryptographic services protect key material and other secrets by using key vaults or API-based alternatives.
- **CAS Rule:** None.
- **Verification:** Check that cryptographic keys are read from secrets manager/key vault at runtime, not hardcoded or stored in config files.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** High

**V1.6.3** — Verify that all keys and passwords are replaceable and are part of a well-defined process to re-encrypt sensitive data.
- **CAS Rule:** None.
- **Verification:** Note whether the application has documented procedures for key rotation.
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Medium

**V1.6.4** — Verify that the architecture treats client-side secrets as visible to attackers. Any secret that must be kept confidential must be stored server-side.
- **CAS Rule:** None.
- **Verification:** Search for secrets embedded in client-side code (JavaScript bundles, mobile app resources, HTML).
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Critical (if production credential), High (if API key)

---

### V1.7 — Errors, Logging, and Auditing Architecture

**V1.7.1** — Verify that a common logging format and approach is used across the system.
- **CAS Rule:** None.
- **Verification:** Check logging library and format — confirm structured logging (JSON) vs. ad hoc string concatenation.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** Medium

**V1.7.2** — Verify that logs are securely transmitted to a preferably remote system for analysis, detection, alerting, and escalation.
- **CAS Rule:** None.
- **Verification:** Check log output configuration — stdout-only is acceptable for containerized apps; confirm logs reach SIEM or log aggregator.
- **ATT&CK Tactic:** TA0005 — Defense Evasion
- **Severity if failed:** Medium

---

### V1.8 — Data Protection and Privacy Architecture

**V1.8.1** — Verify that all sensitive data is identified and classified into protection levels.
- **CAS Rule:** Security classification must be performed using `skills/02-security-classification.md`. Verify `.ai/blueteam/data/security-classification.yaml` exists.
- **Verification:** Check existence of `.ai/blueteam/data/security-classification.yaml`. If absent, the classification skill has not been run — this is a prerequisite failure.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Medium (process gap)

**V1.8.2** — Verify that all protection levels have an associated set of protection requirements.
- **CAS Rule:** None.
- **Verification:** Review whether the application's data handling maps to classification requirements (encryption requirements, access control requirements by classification level).
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Medium

---

### V1.9 — Communications Architecture

**V1.9.1** — Verify the application encrypts communications between components, particularly when these components are in different containers, systems, sites, or cloud providers.
- **CAS Rule:** environment baseline: TLS 1.2+ assumed at perimeter for public-facing organizational apps. Still verify backend-to-backend connections.
- **Verification:** Review inter-service HTTP client configuration for TLS. Check database connection strings for TLS/SSL parameters. Check cache (Redis) and message queue connections for encryption settings.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** High

**V1.9.2** — Verify that application components verify the authenticity of each side in a communication link to prevent person-in-the-middle attacks.
- **CAS Rule:** None.
- **Verification:** Check whether TLS certificate validation is disabled in HTTP clients (`ServerCertificateCustomValidationCallback`, `ssl_verify=False`, `rejectUnauthorized: false`). Any disabled certificate validation is Critical.
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Critical

---

### V1.10 — Malicious Software Architecture

**V1.10.1** — Verify that a source code control system is in use, with procedures to ensure that check-ins are accompanied by issues or change tickets. The source code control system should have access control and identifiable users.
- **CAS Rule:** None.
- **Verification:** Presence of git history with meaningful commit messages and linked issue references. Access control is out-of-scope for code review.
- **ATT&CK Tactic:** TA0040 — Impact (code integrity)
- **Severity if failed:** Low

---

### V1.11 — Business Logic Architecture

**V1.11.1** — Verify the definition and documentation of all application components in terms of the business or security functions they provide.
- **CAS Rule:** None.
- **Verification:** NOT VERIFIABLE via code review unless documentation is present in the repository.
- **ATT&CK Tactic:** N/A
- **Severity if failed:** Low / NOT VERIFIABLE

**V1.11.2** — Verify that all high-value business logic flows, including authentication, session management and access control, do not share unsynchronized state.
- **CAS Rule:** None.
- **Verification:** Review whether concurrent request handling could cause race conditions in auth/authz state (e.g., shared mutable state in session handling).
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** High

**V1.11.3** — Verify that all high-value business logic flows, including authentication, session management and access control, are thread-safe and resistant to time-of-check and time-of-use race conditions.
- **CAS Rule:** None.
- **Verification:** Review critical section handling in auth/authz/session code for TOCTOU patterns.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** High

---

### V1.12 — Secure File Upload Architecture

*Only assess if `has_file_uploads: true` in the application map. If excluded, write `[V1.12 EXCLUDED — no file uploads]` and skip.*

**V1.12.1** — Verify that user-uploaded files are stored outside the web root or in a cloud storage bucket with separate access policies.
- **CAS Rule:** None.
- **Verification:** Check file storage configuration — confirm uploads are not served directly from the web root.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Critical (if executable files can be uploaded and served)

**V1.12.2** — Verify that user-uploaded files — if required to be displayed or downloaded from the application — are served by either octet stream downloads, or from an unrelated domain, such as a cloud file storage bucket.
- **CAS Rule:** None.
- **Verification:** Check file serving routes for Content-Disposition headers and whether uploads are served from app origin vs. CDN/storage domain.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** High

---

### V1.13 — API Architecture

**V1.13.1** — Verify that all application components use the same encoding and escaping strategies to avoid attacks.
- **CAS Rule:** None.
- **Verification:** Check encoding consistency across components (all use JSON, all use same HTML encoding library, etc.).
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Medium

---

### V1.14 — Configuration Architecture

**V1.14.1** — Verify the segregation of components of differing trust levels through well-defined security controls, firewall rules, API gateways, reverse proxies, cloud-based security groups, or similar mechanisms.
- **CAS Rule:** Cloud Landing Zone guardrails provide network segmentation. Verify application-level segregation.
- **Verification:** Review whether admin functionality is behind additional network/middleware controls.
- **ATT&CK Tactic:** TA0004 — Privilege Escalation
- **Severity if failed:** High

**V1.14.2** — Verify that binary signatures, trusted connections, and verified endpoints are used to deploy binaries to remote devices.
- **CAS Rule:** None.
- **Verification:** NOT VERIFIABLE via application code review; infrastructure concern. Note as N/A.
- **ATT&CK Tactic:** TA0040 — Impact
- **Severity if failed:** N/A (infrastructure)

**V1.14.3** — Verify that the build pipeline warns of out-of-date or insecure components and takes appropriate actions.
- **CAS Rule:** None.
- **Verification:** Check CI pipeline files for SCA scanning steps (Trivy, npm audit, Snyk, dependabot).
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** Medium

**V1.14.4** — Verify that the build pipeline contains a build step to automatically build and verify the secure deployment of the application, particularly if the application infrastructure is software defined, such as cloud environment build scripts.
- **CAS Rule:** None.
- **Verification:** Check CI/CD pipeline for automated security testing steps.
- **ATT&CK Tactic:** N/A
- **Severity if failed:** Low

**V1.14.5** — Verify that application deployments adequately sandbox, containerize and/or isolate at the network level to delay and deter attackers from attacking other applications.
- **CAS Rule:** Cloud Landing Zone provides baseline network isolation.
- **Verification:** Check Kubernetes security contexts (`securityContext`, `runAsNonRoot`, `readOnlyRootFilesystem`). Flag containers running as root or with privileged mode.
- **ATT&CK Tactic:** TA0008 — Lateral Movement
- **Severity if failed:** High

**V1.14.6** — Verify that the application does not use unsupported, insecure, or deprecated client-side technologies such as NSAPI plugins, Flash, Shockwave, ActiveX, Silverlight, NACL, or client-side Java applets.
- **CAS Rule:** None.
- **Verification:** Check `package.json` or frontend dependencies for deprecated browser plugin dependencies.
- **ATT&CK Tactic:** TA0002 — Execution
- **Severity if failed:** High

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern | Primary Tactic | Kill Chain Stage |
|----------------|----------------|-----------------|
| Client-side access control / authorization | TA0004 Privilege Escalation | Attacker manipulates client-supplied role/permission claims |
| Unsafe deserialization in architecture | TA0002 Execution | RCE via malicious serialized payload |
| Multiple parallel auth mechanisms | TA0001 Initial Access | Weakest auth path used for bypass |
| Disabled TLS certificate validation | TA0009 Collection | MitM credential/data interception |
| Missing application partitioning (admin/user) | TA0004 Privilege Escalation | Admin function access via user-facing entry point |
| Fail-open security control design | TA0001 Initial Access | Security control failure defaults to permit |

---

## Cross-Chapter Reference Notes

| This chapter finding | Combines with | Combined chain risk |
|---------------------|---------------|---------------------|
| V1.4.5 admin/user partitioning failure | V4.3 Admin interface protection | Same root cause — consolidate into single finding |
| V1.9.2 disabled certificate validation | V9.2 Server communication security | Same root cause — consolidate |
| V1.6.4 client-side secrets | V6.4 Secret Management | Same finding — write `[V1-NNN: duplicate of V6-NNN]` or vice versa |

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V1-compliant code.

### When to apply this chapter
Load V1 when designing new application components, establishing service-to-service communication, configuring deployment infrastructure, or setting up CI/CD security gates.

### Secure SDLC in CI/CD (V1.1)

Every organizational repository should have security scanning integrated into the pipeline. Minimum required gates:

```yaml
# .github/workflows/security.yml
name: Security Checks
on: [push, pull_request]
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      # Secret scanning — ✓ V1.1.1 compliant
      - name: TruffleHog secret scan
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}

      # SCA — ✓ V1.1.1 compliant
      - name: Trivy vulnerability scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          exit-code: 1
          severity: CRITICAL,HIGH

      # For organizational threat-modelled apps: verify .ai/blueteam/reports/threat_model_report.md exists
      # ✓ V1.1.2 compliant (STRIDE/DREAD threat model)
```

### Single Vetted Authentication Architecture (V1.2)

Use one auth mechanism, never two in parallel. For organizational apps:

```typescript
// app.ts — ✓ V1.2.3, V1.2.4 compliant: single auth mechanism
import { entraIdAuth } from './middleware/auth';    // Staff
import { oidcAuth } from './middleware/auth'; // Public users

// WRONG: two parallel auth paths for the same route group
// app.use('/api', entraIdAuth);
// app.use('/api', oidcAuth); // ← creates weaker bypass path

// RIGHT: select one IdP per route group based on user type
app.use('/api/staff', entraIdAuth);    // Staff routes
app.use('/api/public', oidcAuth); // Public routes
```

### Centralized Access Control Architecture (V1.4)

Authorization must run server-side in a single middleware, never in individual handlers:

```typescript
// middleware/authorize.ts — ✓ V1.4.1, V1.4.3 compliant
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // NEVER trust client-supplied role claims
    const userRole = req.user?.role; // ← from verified JWT, not req.body
    if (!userRole || !hasRole(userRole, role)) {
      // Fail-secure: always deny on exception ✓ V1.4.1
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Route registration — auth MUST come before authz ✓ V1.2.4
router.get('/admin/users', authenticate, requireRole('admin'), listUsers);
//                         ↑ auth first   ↑ authz second        ↑ handler last
```

### Application Partitioning (V1.4.5)

Separate admin and user-facing interfaces at the routing level:

```typescript
// ✓ V1.4.5 compliant: admin routes behind elevated auth
const adminRouter = express.Router();
adminRouter.use(authenticate);         // Regular auth
adminRouter.use(requireRole('admin')); // Elevated requirement — Enterprise IdP + MFA
adminRouter.use(auditLog);             // All admin actions logged

app.use('/admin', adminRouter);  // Isolated mount point
app.use('/api', userRouter);     // Separate user-facing router
```

### Cryptographic Key Architecture (V1.6)

Never load key material into code. Use Azure Key Vault:

```typescript
// secrets.ts — ✓ V1.6.1, V1.6.2 compliant
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

const client = new SecretClient(
  process.env.AZURE_KEY_VAULT_URL!,
  new DefaultAzureCredential() // Managed identity — no credentials in code
);

export async function getSecret(name: string): Promise<string> {
  const secret = await client.getSecret(name);
  return secret.value!;
}

// Load once at startup, not hardcoded ✓ V1.6.4
const encryptionKey = await getSecret('field-encryption-key');
```

### Structured Logging Architecture (V1.7)

Centralize logging with structured JSON output:

```typescript
// logger.ts — ✓ V1.7.1, V1.7.2 compliant
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }), // Consistent field name
  },
  // Redact sensitive fields — ✓ V7.1.1 compliant
  redact: {
    paths: ['req.headers.authorization', '*.password', '*.phn', '*.sin'],
    censor: '[REDACTED]',
  },
});

// Structured log event ✓ V1.7.1
logger.info({
  event: 'auth.login.success',
  userId: user.id,
  ip: req.ip,
  requestId: req.id,
  timestamp: new Date().toISOString(),
});
```

### Secure Container Architecture (V1.14)

```dockerfile
# Dockerfile — ✓ V1.14.5 compliant
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
# Non-root user — ✓ V1.2.1 compliant
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=appuser:appgroup . .
USER appuser
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Common anti-patterns
- Multiple parallel auth mechanisms on the same route group (creates weaker bypass path)
- Authorization logic scattered across individual route handlers instead of centralized middleware
- Client-supplied role or permission claims used in access control decisions
- Secrets embedded in Dockerfile ENV instructions or config files
- Running containers as root (`USER root` or no `USER` directive)
- Catch blocks in auth middleware that `return next()` on exception (fail-open)
- `UseDeveloperExceptionPage()` / `app.use(require('errorhandler')())` active in production

### Organization-specific patterns
- Use `DefaultAzureCredential` for all Azure SDK authentication (Managed Identity in Cloud LZ)
- Admin interfaces must authenticate via Enterprise IdP (e.g. Entra ID); public-facing apps via Corporate OIDC Provider
- Health check endpoints: return only HTTP 200 with `{"status":"healthy"}` — no version, no component names
- All Protected B apps must have a threat model in `.ai/blueteam/reports/threat_model_report.md`
