---
id: asvs-compliant-builder
name: ASVS-Compliant Builder Skill
description: >
  Generates ASVS Level 2-compliant TypeScript/Node.js code for applications.
  Reads the relevant ASVS chapter files on-demand and applies both the normative
  requirements and the Secure Implementation Guide patterns to produce code that
  passes ASVS Level 2 assessment.
type: skill
version: 1.0.0
tools_required:
  - Read
  - Glob
  - Grep
  - Write
  - Edit
tools_optional: []
references:
  - asvs-level2-security-assessment
  - environment
outputs:
  - description: Modified or new source files with ASVS compliance annotations
    type: code
  - description: ASVS coverage summary table appended to task output
    type: inline
---

> **Builder skill**: generates code and does not write `.ai/` report artifacts. For assessing existing code, use `skills/05-asvs-level2-assessment.md` instead.

---

## Purpose

This skill answers requests like:

- "Build a login endpoint that is ASVS V2-compliant."
- "Write a file upload handler that passes V12 requirements."
- "Implement session management following ASVS V3."
- "Add structured logging that satisfies V7."

It produces TypeScript/Node.js (Express) code with inline `V-N.N.N` annotations
referencing the ASVS requirement each pattern satisfies, plus a coverage table at the end.

---

## Execution Protocol

### Phase 1: Understand the Request

1. Identify which ASVS chapters are relevant to the requested feature.
   Use the **Chapter Selection Guide** below.
2. Read `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping" for
   organization-specific baseline assumptions that apply to the chapter(s).

### Phase 2: Load Relevant Chapters

For each relevant chapter, read the corresponding file in `asvs_chapters/`:

```
asvs_chapters/asvs_v1_architecture_skill.md
asvs_chapters/asvs_v2_authentication_skill.md
asvs_chapters/asvs_v3_session_management_skill.md
asvs_chapters/asvs_v4_access_control_skill.md
asvs_chapters/asvs_v5_input_validation_skill.md
asvs_chapters/asvs_v6_cryptography_skill.md
asvs_chapters/asvs_v7_error_handling_skill.md
asvs_chapters/asvs_v8_data_protection_skill.md
asvs_chapters/asvs_v9_communication_skill.md
asvs_chapters/asvs_v10_malicious_code_skill.md
asvs_chapters/asvs_v11_business_logic_skill.md
asvs_chapters/asvs_v12_files_resources_skill.md
asvs_chapters/asvs_v13_api_security_skill.md
asvs_chapters/asvs_v14_configuration_skill.md
```

Read **only the chapters relevant to the request**; do not load all 14 for a
focused task. Each chapter file contains:
- `## V-N Requirements and Verification Rules`: normative requirements
- `## Secure Implementation Guide`: code patterns for this skill to use

> **Reading instruction:** In each chapter file, locate `## Secure Implementation Guide`
> and use those patterns as the primary code templates. The requirements above it
> define what each pattern must satisfy.

### Phase 3: Generate Code

Apply the following rules when generating code:

1. **Language/framework**: TypeScript + Express (Node.js) unless the user specifies
   otherwise. Match the framework used in the target application if reading existing code.

2. **Annotations**: Add inline `// VN.N.N` comments on the lines that satisfy each
   requirement. Do not annotate every line; annotate only the lines that directly
   implement a security control.

3. **organization-specific defaults** (always apply unless context says otherwise):
   - Identity: Enterprise IdP (e.g. Entra ID) for organizational staff, or Corporate OIDC Provider (public); never mock/bypass
   - Secrets: Azure Key Vault with `DefaultAzureCredential`, no hardcoded values
   - Field-level encryption: AES-256-GCM for PHN, SIN, medical diagnosis, bank/credit card
   - Session idle timeout: 30 minutes (SESSION-001)
   - Rate limiting: required on auth endpoints even with Cloudflare (RATE-001)
   - Logging: structured (pino), with PHN/SIN/password/authorization-header redaction
   - TLS: `rejectUnauthorized: true` always; `trustServerCertificate: false` for SQL Server

4. **Fail-secure**: Authorization middleware must deny on exception, never fail-open.

5. **No auth bypasses**: Do not generate env-var-gated auth bypass patterns (V2.2.4).

6. **Sensitive data never in URLs**: Protected B data (PHN, SIN, medical diagnosis)
   must be in request body, never in URL query parameters (V8.2.2).

### Phase 4: Output Coverage Table

After all code is generated, append a coverage table:

```markdown
## ASVS Coverage

| Chapter | Requirement | Control implemented | Status |
|---------|------------|---------------------|--------|
| V2      | V2.1.1     | Password length ≥ 12 (organizational password policy) | pass |
| V3      | V3.2.1     | Secure session cookie (__Host- prefix) | pass |
| ...     | ...        | ...                 | ...  |
```

List only the requirements that the generated code directly addresses.
If a requirement is covered by deployment infrastructure (from `shared/reference/environment-baseline.md`)
rather than application code, note it as `[Infrastructure: assumed]`.

---

## Chapter Selection Guide

Use this table to determine which chapters to load for a given feature:

| Feature being built                              | Chapters to load          |
| ------------------------------------------------ | ------------------------- |
| Login / authentication endpoint                  | V2, V3, V7, V13           |
| Session management (cookies, JWT)                | V3, V2 (partial), V14     |
| Authorization middleware / RBAC                  | V4, V1 (partial)          |
| Input validation / form processing               | V5, V7 (error handling)   |
| Password hashing / key generation / encryption   | V6                        |
| Structured logging / audit logging               | V7                        |
| PHN/SIN data storage or retrieval                | V6, V8, V7                |
| File upload / download                           | V12, V5 (SSRF), V8        |
| REST API endpoint (general)                      | V13, V4, V5               |
| GraphQL endpoint                                 | V13 (V13.4), V4           |
| Outbound HTTP client / service-to-service        | V9, V13 (V13.8)           |
| Database connection setup                        | V9, V6 (partial)          |
| CI/CD pipeline / Dockerfile                      | V10, V14                  |
| HTTP security headers                            | V14                       |
| Health check or status endpoint                  | V14 (V14.3)               |
| Multi-step workflow / form submission            | V11, V4, V13              |
| Rate limiting                                    | V13 (V13.6), V11          |
| Secrets management                               | V6 (V6.4), V14            |
| Error handling middleware                        | V7                        |
| CSP / security headers middleware                | V14 (V14.4)               |

---

## organizational Technology Reference

Quick reference (consult `shared/reference/environment-baseline.md` for full details). Stop at the `> **NON-ASVS SKILLS: STOP READING HERE.**` marker; the ASVS Chapter Assumption Mapping section is not needed for code generation.

| Concern | organizational standard | ASVS requirement |
|---------|-------------|-----------------|
| Public identity | Corporate OIDC Provider (OIDC) | V2.1, V3.5 |
| Staff identity | Enterprise IdP e.g. MS Entra ID (OIDC/SAML) | V2.1, V3.5 |
| Partner identity | External Identity Gateway | V2.1 |
| Secrets store | Azure Key Vault + Managed Identity | V6.4 |
| Protected B encryption | AES-256-GCM field-level | V6.1 |
| Password policy | organizational password policy (12-char user, 15-char privileged) | V2.1 |
| Session idle timeout | 30 minutes (SESSION-001) | V3.3 |
| Rate limiting | App-layer required + RATE-001 | V13.6 |
| TLS (database) | encrypt=true, trustServerCertificate=false | V9.2 |
| Log format | pino JSON, PHN/SIN redacted, UTC timestamps | V7.1, V7.3 |
| File storage | Azure Blob private container + SAS tokens | V12.4 |
| Admin MFA | Enterprise IdP amr=mfa claim check (e.g. Entra ID) | V2.8, V13.1 |

---

## Excluded Patterns

This skill will NOT generate:

- `rejectUnauthorized: false` for TLS connections
- `DISABLE_AUTH=true` or equivalent env-var auth bypass patterns
- PHN, SIN, medical diagnosis, or bank/credit card numbers in log statements
- Hardcoded secrets, API keys, or passwords in source code
- `'unsafe-inline'` or `'unsafe-eval'` in CSP directives
- Authorization checks that fail-open (catch block allows access on exception)
- `trustServerCertificate: true` for production SQL Server connections

If asked to generate any of the above, explain the security risk and offer
the compliant alternative instead.

---

## Example Invocations

**User:** "Write a login route for a organizational staff-facing application."

**Skill loads:** V2 (authentication), V3 (session), V7 (logging), V13 (API)

**Produces:** Enterprise IdP OIDC callback handler (e.g. Entra ID), JWT httpOnly cookie storage,
auth event logging with pino, rate limiting on /auth/*, coverage table.

---

**User:** "Add an endpoint to retrieve a patient's PHN record."

**Skill loads:** V4 (access control), V6 (encryption), V7 (logging), V8 (data protection)

**Produces:** Ownership check middleware, PHN field decryption with AES-256-GCM,
Protected B audit log (resource ID only, not PHN value), no-store cache header,
coverage table.

---

**User:** "Set up the HTTP security headers middleware."

**Skill loads:** V14 (configuration)

**Produces:** helmet configuration with HSTS, noSniff, X-Frame-Options (not X-Frame-Protection),
CSP without unsafe-inline, Referrer-Policy, coverage table.
