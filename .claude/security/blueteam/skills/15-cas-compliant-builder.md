---
id: cas-compliant-builder
name: CAS-Compliant Builder Skill
description: >
  Generates Cybersecurity Architecture Standards (CAS)-compliant TypeScript/Node.js
  code. Reads shared/reference/cas-rule-definitions.md and applies the compliant implementation
  patterns to produce code that satisfies CAS requirements and passes CAS compliance
  assessment.
type: skill
version: 1.1.0
tools_required:
  - Read
  - Glob
  - Grep
  - Write
  - Edit
tools_optional: []
references:
  - cybersecurity-architecture-standards
  - cas-rule-definitions
  - environment
outputs:
  - description: Modified or new source files with CAS compliance annotations
    type: code
  - description: CAS coverage summary table appended to task output
    type: inline
---

> **Builder skill**: generates code and does not write `.ai/` report artifacts. For assessing existing code against CAS, use `skills/06-cas-compliance.md`.

---

## Purpose

This skill answers requests like:

- "Write a route that complies with organizational AUTH rules."
- "Implement logging that satisfies the CAS LOG requirements."
- "Add input validation following the organizational SEC standards."
- "Set up Enterprise IdP authentication (e.g. Entra ID) per organizational AUTHZ and AUTH CAS rules."

It produces TypeScript/Node.js (Express) code with inline `// CAS:RULE-NNN` annotations
referencing the CAS rule each pattern satisfies, plus a coverage table at the end.

---

## Execution Protocol

### Phase 1: Understand the Request

1. Identify which CAS rule domains are relevant to the requested feature.
   Use the **Domain Selection Guide** below.
2. Read `shared/reference/environment-baseline.md` for infrastructure baseline assumptions
   (Cloudflare, Cloud Landing Zone, SQL Server TDE, etc.) that are already satisfied
   by infrastructure and do not require application-level implementation.
   Stop at the `> **NON-ASVS SKILLS: STOP READING HERE.**` marker; the ASVS
   Chapter Assumption Mapping section is not needed for code generation.

### Phase 2: Load CAS Rule Definitions (selective)

Read ONLY the relevant sections of `shared/reference/cas-rule-definitions.md`; do **not** load the full file. Follow the Section Loading Guide and Domain to Section Heading Map at the top of that file.

**Selective loading procedure:**

1. Always load the `## Platform Context` section first (required for every invocation; provides approved IdPs, deployment targets, and data sensitivity thresholds).
2. Identify the relevant domains from the Domain Selection Guide below.
3. Load ONLY the `## Domain: [Name]` sections that match those domains using the mapping table in `shared/reference/cas-rule-definitions.md`.
4. Do NOT load `## ITSG-33 Quick Reference Index`; it is not needed for code generation.

This file is the authoritative source for rule requirement text, compliant implementation patterns, organization-specific requirements, and applicability scope.

> **Reading instruction:** Use the "Compliant Implementation Pattern" subsections as the primary code templates for the relevant domain rules.

### Phase 3: Generate Code

Apply the following rules when generating code:

1. **Language/framework**: TypeScript + Express (Node.js) unless the user specifies
   otherwise. Match the framework used in the target application if reading existing code.

2. **Annotations**: Add inline `// CAS:RULE-NNN` comments on lines that directly
   implement a CAS control. For compound rules (e.g., AUTH-001 + AUTHZ-001), annotate
   once at the function level rather than on every line.

3. **MUST rules**: All MUST-level CAS rules must be implemented. If a MUST rule cannot
   be satisfied at the application layer (e.g., it is a network or infrastructure rule),
   note it as `// Infrastructure: see shared/reference/environment-baseline.md`.

4. **SHOULD rules**: Implement SHOULD rules unless the applicability condition excludes
   them (documented in `shared/reference/cas-rule-definitions.md`). When a SHOULD rule is excluded,
   note the exclusion reason in a comment.

5. **Identity defaults** (always apply):
   - Staff: Enterprise IdP (e.g. MS Entra ID), never a local user store
   - Public: Corporate OIDC Provider (OIDC)
   - Partners: External Identity Gateway
   - No mock/bypass auth in any environment

6. **Fail-secure**: Authorization checks must deny on exception, never fail-open.

7. **Sensitive data handling**:
   - PHN, SIN, medical/mental health diagnosis, bank/credit card: AES-256-GCM at field level
   - Never log these values in any form
   - Never expose in URL query parameters

### Phase 4: Output Coverage Table

After all code is generated, append a coverage table:

```markdown
## CAS Coverage

| Domain | Rule ID | Rule summary | Status |
|--------|---------|-------------|--------|
| Identity & Authentication | AUTH-001 | approved IdP only | pass |
| Authorization | AUTHZ-001 | Deny-by-default access control | pass |
| Logging | LOG-001 | Security event audit log | pass |
| ... | ... | ... | ... |
```

For rules covered by infrastructure (not application code), note:
`[Infrastructure: assumed present per shared/reference/environment-baseline.md]`

---

## Domain Selection Guide

| Feature being built                             | CAS domains to load                |
| ----------------------------------------------- | ---------------------------------- |
| Login / authentication                          | AUTH, AUTHZ                        |
| Authorization / RBAC / permission checks        | AUTHZ                              |
| Session management                              | AUTH (session rules), SEC          |
| Input validation / sanitization                 | SEC                                |
| Secrets / API key management                    | SEC (secrets), ENC                 |
| Encrypted storage of Protected B data           | ENC, SEC                           |
| Audit logging / security event logging          | LOG                                |
| Error handling / exception management           | SEC, LOG                           |
| Outbound HTTP / service-to-service calls        | NET, AUTH (service identity)       |
| TLS / certificate configuration                 | NET, ENC                           |
| HTTP security headers                           | SEC (hardening)                    |
| File upload / download                          | SEC, ENC                           |
| CI/CD pipeline / Dockerfile                     | SEC (supply chain)                 |
| Health / status endpoints                       | SEC (information disclosure)       |
| Rate limiting / anti-automation                 | SEC, NET                           |
| AI/LLM integration                              | AI (AI Agent Security rules)       |

---

## CAS Rule Domains Reference

| Domain prefix | Rule count | Description |
|---------------|-----------|-------------|
| AUTH          | ~8 rules  | Identity & Authentication |
| AUTHZ         | ~6 rules  | Authorization |
| NET           | ~5 rules  | Network & Perimeter Security |
| ENC           | ~6 rules  | Encryption & Key Management |
| LOG           | ~10 rules | Logging & Monitoring |
| SEC           | ~12 rules | General Security Controls |
| DR            | ~4 rules  | Disaster Recovery & Resilience |
| VULN          | ~3 rules  | Vulnerability Management |
| TPS           | ~2 rules  | Third-Party Security |
| AI            | ~3 rules  | AI Agent Security |

Full rule specifications: `shared/reference/cas-rule-definitions.md`

---

## organizational Technology Reference

Quick reference for CAS-mandated technology choices:

| Concern | CAS requirement | Implementation |
|---------|----------------|----------------|
| Staff authentication | AUTH-001: Enterprise IdP (e.g. Entra ID) | OIDC with `@azure/msal-node` or `passport-azure-ad` |
| Public authentication | AUTH-001: Corporate OIDC Provider | OIDC with `openid-client` |
| MFA for admin | AUTH-002: Enterprise IdP MFA (e.g. Entra ID) | Check `amr` claim contains `mfa` |
| Service identity | AUTH-003: Managed Identity | `DefaultAzureCredential` |
| Secrets | SEC-003: Azure Key Vault | `@azure/keyvault-secrets` + `DefaultAzureCredential` |
| Protected B encryption | ENC-001: AES-256-GCM | Node.js `crypto.createCipheriv` or Azure Key Vault Encrypt |
| Password hashing | ENC-002: argon2id | `argon2` package |
| Session timeout | AUTH-004: 30 min idle | `express-session` with `rolling: false`, `cookie.maxAge: 1800000` |
| Rate limiting | SEC-004: app-layer | `express-rate-limit` with Redis store |
| Audit log fields | LOG-001: required fields | timestamp, userId, requestId, event, action, result, sourceIP |
| Sensitive field log redaction | LOG-002: PHN/SIN redaction | pino `redact` config |

---

## Excluded Patterns

This skill will NOT generate:

- Authentication against a local user store when the application serves organizational staff
  (Enterprise IdP is required per AUTH-001, e.g. Entra ID)
- Hardcoded API keys, passwords, or secrets in any source file
- PHN, SIN, medical diagnosis, or bank/credit card numbers in log output
- Mock authentication or env-var-gated auth bypass
- AES-ECB or DES/3DES encryption for Protected B data
- `rejectUnauthorized: false` for TLS connections
- `'unsafe-inline'` in CSP script-src
- Authorization fail-open patterns (catch block allows access on exception)

If asked to generate any of the above, explain the CAS rule that prohibits it
and offer the compliant alternative instead.

---

## Example Invocations

**User:** "Write authentication middleware for a organizational staff portal."

**Skill loads:** CAS AUTH domain (AUTH-001, AUTH-002, AUTH-004), AUTHZ domain

**Produces:** Enterprise IdP OIDC middleware (e.g. Entra ID), JWT validation with JWKS, MFA claim check
for admin routes, 30-minute session idle timeout, auth event logging per LOG-001,
CAS coverage table.

---

**User:** "Implement an audit log for Protected B data access."

**Skill loads:** CAS LOG domain (LOG-001 through LOG-010)

**Produces:** pino logger with PHN/SIN redaction, `auditProtectedBAccess` middleware
(logs resource ID only, not field value), required log fields (timestamp, userId,
requestId, event, sourceIP), CAS coverage table.

---

**User:** "Add secrets management for an Azure-deployed Express app."

**Skill loads:** CAS SEC domain (SEC-003), ENC domain (ENC key management rules)

**Produces:** `@azure/keyvault-secrets` client with `DefaultAzureCredential`,
startup secrets loading with caching, rotation-ready reference pattern, CAS coverage table.
