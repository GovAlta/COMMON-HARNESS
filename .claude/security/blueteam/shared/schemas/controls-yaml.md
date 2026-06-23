---
title: "controls.yaml Schema Reference"
description: Defines the schema for the optional .ai/controls.yaml compensating controls declaration file. Written by the application team. Read by assessment skills to annotate relevant findings with inline review notes.
version: 1.1.0
status: active
---

# `.ai/controls.yaml`: Compensating Controls Declaration Schema

> **For assessment skills:** Read from here through **§ Skill Consumption Instructions** (the sections that follow immediately below). Stop before **§ For Application Teams**: that section contains the YAML schema template and example for the application team only; skills do not need it.

---

## Control Key → Finding Type Mapping

Assessment skills use this table to decide which findings receive an annotation. The annotation is appended as a blockquote after the **Evidence** section of each affected finding.

| Key | Applies to these finding types | Annotation text |
|-----|-------------------------------|-----------------|
| `rate_limiting_present` | Anti-brute-force (V2.2.1), API rate limiting (V13.6), RATE-001 | "Rate limiting declared: [details]: verify it applies to this specific auth/API endpoint and that configured thresholds meet RATE-001 requirements." |
| `mfa_enforced` | Authentication strength (V2.2.2, V2.7, V2.8), MFA-001, MFA-002 | "MFA declared for all user types: [details]: verify it applies to the affected user type and auth path in this finding, not only administrative accounts." |
| `idp_fully_delegated` | Password policies (V2.1), anti-brute-force (V2.2), credential storage (V2.4), AUTH-001/002/003 | "Full IdP delegation declared: [details]: verify this specific auth path delegates to the IdP (no custom auth code) before accepting as mitigated." |
| `session_management_present` | Session binding and expiry (V3.x), SESSION-001/002 | "Session hardening declared: [details]: verify this configuration is enforced on the specific endpoint or session type in this finding." |
| `authz_framework_present` | Access control (V4.x), AUTHZ-001 through AUTHZ-006 | "Authorization framework declared: [details]: verify it enforces authorization on the specific endpoint or object type identified in this finding." |
| `row_level_security_present` | Object-level access control / BOLA (V4.2), AUTHZ-001/002 | "Row-level security declared: [details]: verify RLS applies to the specific table/query identified and cannot be bypassed on this code path." |
| `input_validation_present` | Input validation (V5.x), injection findings, output encoding (V5.3) | "Centralized input validation declared: [details]: verify this endpoint routes through the validation middleware and the specific input vector is covered." |
| `parameterized_queries_enforced` | SQL injection (V5.3.4/5), injection findings | "Parameterized queries declared project-wide: [details]: verify no raw SQL escape path exists on this specific code path." |
| `field_encryption_present` | Data classification at rest (V6.1), sensitive data (V8.2), ENC-002/003 | "Field-level encryption declared: [details]: verify it covers the specific column or field identified in this finding." |
| `secrets_manager_present` | Secrets in code (V6.4, V2.10.3/4), SEC-001/002/004 | "Secrets manager declared: [details]: verify the specific secret in this finding is vault-managed and absent from all committed config." |
| `cors_policy_present` | CORS configuration (V13.1), CORS-001 | "CORS allowlist declared: [details]: verify the allowlist is applied at the specific endpoint group in this finding and not overridden." |
| `security_headers_present` | HTTP security headers (V14.4), CSP-001, HDR-001 | "Security headers declared: [details]: verify headers are applied at the route/middleware level covering this specific endpoint." |
| `security_logging_present` | Logging and audit (V7.x), LOG-001 through LOG-010 | "Security event logging declared: [details]: verify this logging captures the specific event type identified in this finding." |
| `anomaly_detection_present` | Repudiation, monitoring gaps, LOG-010 | "Anomaly detection declared: [details]: this provides detective control but does not replace remediation of the underlying vulnerability." |
| `file_upload_scanning_present` | Malware in uploads (V12.2), UPLOAD-001 | "Upload malware scanning declared: [details]: verify the scanner is invoked synchronously before the file is stored or processed by this handler." |
| `file_upload_type_validation_present` | File type validation (V12.1), UPLOAD-002 | "File type validation declared: [details]: verify magic byte validation covers this specific upload handler." |

---

## Layer 4: organizational Baseline Context Hints

In addition to Layer 3 (user-declared controls), assessment skills add **Baseline Context** hints when a finding's type and the detected deployment target match a known defense-in-depth pattern from `shared/reference/environment-baseline.md`. These hints are informational: they never reduce severity.

| Finding type | Deployment condition | Hint |
|---|---|---|
| SQL injection, raw SQL, ORM bypass | On-prem DC (TDE assumed) | "Organizational TDE protects data at rest against physical disk/backup theft only: it does NOT prevent authenticated DB access or SQL injection. Full severity applies." |
| Missing field-level encryption for PHN/SIN | Any | "Organizational TDE or Cloud LZ SSE does not satisfy ENC-002/003. PHN/SIN/health diagnosis/bank account data requires field-level encryption regardless of container-level encryption." |
| Rate limiting / anti-automation | Cloud LZ + public-facing | "Cloudflare perimeter rate limiting exists at L7 but does not satisfy RATE-001: application-level rate limiting on auth endpoints is independently required per CCCS AC-7." |
| Authentication bypass or missing auth | App uses approved organizational IdP | "Organizational IdP enforces controls at provider level for fully-delegated paths only: verify this specific endpoint uses delegated auth before adjusting severity." |
| Missing TLS / certificate validation | Cloud LZ or Cloudflare present | "Cloudflare/Cloud LZ enforces TLS 1.2+ on the app-to-client leg. This finding concerns backend-to-backend connections or disabled certificate validation in code: verify which path is affected." |
| WAF bypass, injection at perimeter | Cloud LZ + public-facing | "Cloudflare WAF (OWASP CRS) provides perimeter-level filtering but can be bypassed via direct backend access, future routing changes, or API paths not proxied through Cloudflare. Full severity applies." |
| Missing security event logging | Cloud LZ | "Organizational log infrastructure (LOG-006) provides SIEM transport, but this finding concerns application-level LOG instrumentation: the infrastructure does not generate application security events on the app's behalf." |
| File upload, malware scanning | Any | "MS Defender on organizational servers provides host-based endpoint protection but does not scan application upload payloads: application-invoked scanning is separately required per UPLOAD-001." |

---

## Annotation Format

Each annotated finding has one blockquote per matched control, inserted after the **Evidence** section (before **Business Impact**):

```markdown
#### Evidence
[...existing evidence text...]

> **Declared compensating control:** Rate limiting declared: AspNetCoreRateLimit at 5 req/min on /auth: verify it applies to this specific auth endpoint and that configured thresholds meet RATE-001 requirements.

#### Business Impact
[...existing business impact text...]
```

For the CAS compliance report (NON-COMPLIANT findings), the annotation appears as a bold inline line after the Evidence block:

```markdown
**Evidence:** `apps/api/src/auth.ts:42`: no rate limiter middleware on auth route.

**Declared compensating control:** Rate limiting declared: AspNetCoreRateLimit at 5 req/min on /auth: verify it applies to this specific auth endpoint before accepting as mitigated.

**Remediation:** ...
```

---

## Skill Consumption Instructions

Assessment skills consume this file as follows:

### Step: Load controls.yaml (at skill start, after shared/reference/environment-baseline.md)

1. Check if `.ai/controls.yaml` exists. If absent: skip all Layer 3 processing; proceed normally.
2. If present: parse the YAML. Extract the **Active Controls List**: all keys where the boolean is `true` and a non-empty detail string is present.
3. If a key is `true` but the detail string is empty, include the key with a placeholder: `"(no details provided: application team should add detail)"`.
4. If the file cannot be parsed as valid YAML, log `> Warning: .ai/controls.yaml is present but could not be parsed: Layer 3 annotations skipped.` in the report and proceed.
5. Store the Active Controls List for annotation use during finding writing.

### Step: Annotate each finding (Layer 3)

After writing the Evidence section for each finding, check the Active Controls List against the mapping table above. For each matching entry:
- Add the annotation blockquote (ASVS/threat model) or inline bold line (CAS) as shown in the Annotation Format section.
- If multiple controls match, add one blockquote per control.
- If no controls match, omit the annotation block entirely.

### Step: Add organizational Baseline Context (Layer 4)

After the Layer 3 annotation block (or after Evidence if no Layer 3 annotations), check the Layer 4 mapping table. Apply hints where the finding type matches AND the deployment context condition is satisfied. Add one blockquote per applicable hint:

```
> **baseline context:** [hint text]
```

If no Layer 4 hints apply, omit this block.

### ASVS orchestrator: trimmed Controls Summary for sub-agents

The ASVS orchestrator builds a chapter-filtered Controls Summary and injects it into each chapter sub-agent execution. Format:

```
CONTROLS SUMMARY FOR [VN] (declared controls relevant to this chapter: from .ai/controls.yaml):
- [key]: "[detail string]"
[repeat for each active control relevant to this chapter]
DEPLOYMENT TARGET: [cloud_lz | on_premises_dc | unknown]
PUBLIC-FACING: [yes | no | unknown]

If controls.yaml absent: CONTROLS SUMMARY: not present: no Layer 3 annotations.
```

Chapter relevance map (which controls to include per chapter):

| Chapter | Relevant control keys |
|---------|----------------------|
| V2 (Auth) | `rate_limiting_present`, `mfa_enforced`, `idp_fully_delegated` |
| V3 (Session) | `session_management_present`, `idp_fully_delegated` |
| V4 (Access Control) | `authz_framework_present`, `row_level_security_present` |
| V5 (Input Validation) | `input_validation_present`, `parameterized_queries_enforced` |
| V6 (Cryptography) | `field_encryption_present`, `secrets_manager_present` |
| V7 (Error Handling) | `security_logging_present` |
| V8 (Data Protection) | `field_encryption_present`, `secrets_manager_present`, `anomaly_detection_present` |
| V9 (Communication) | *(none: TLS handled by baseline Layer 4 only)* |
| V10 (Malicious Code) | `secrets_manager_present` |
| V11 (Business Logic) | `rate_limiting_present`, `anomaly_detection_present` |
| V12 (Files/Resources) | `file_upload_scanning_present`, `file_upload_type_validation_present` |
| V13 (API Security) | `rate_limiting_present`, `cors_policy_present`, `authz_framework_present` |
| V14 (Configuration) | `security_headers_present`, `secrets_manager_present` |
| V1 (Architecture) | `authz_framework_present`, `input_validation_present` |

---

> **SKILLS: STOP READING HERE.** Everything below this line is for the **application team** writing `.ai/controls.yaml`. It is not needed during security assessment runs.

---

## For Application Teams

### Purpose

Security assessment skills evaluate applications from source code and configuration only. They cannot observe runtime controls, infrastructure configuration, or operational processes. When the application team has implemented controls that may partially or fully mitigate a finding, those controls can be declared in `.ai/controls.yaml`.

**What this file does:**
- Causes assessment skills to append an inline annotation to any finding where a declared control is potentially relevant
- Causes the Security Assessment Overview report to display a summary of declared controls on the Dashboard

**What this file does NOT do:**
- Suppress findings: every finding is still reported at its original severity
- Reduce severity ratings: severity is never automatically lowered based on declarations
- Replace human review: every annotated finding requires a human reviewer to confirm whether the declared control genuinely mitigates the specific risk

Annotations use this format:
> **Declared compensating control:** [your detail text]: verify this mitigates the specific risk before closing.

### Location

The file lives in the root of the assessed repository alongside the `.ai/` folder:

```
<repo-root>/
├── .ai/
│   ├── data/
│   └── reports/
└── .ai/controls.yaml      ← this file
```

If the file is absent, skills proceed normally with no annotations added.

### When to Create This File

**Before an assessment:** If your team has implemented controls beyond the organizational Environment Baseline, declare them before running skills to get annotated findings on the first pass.

**After an assessment:** Use the findings report to identify which controls you have that weren't visible to the scanner, then fill in this file and re-run for annotated output.

### Relationship to the organizational Environment Baseline

The organizational Environment Baseline (`shared/reference/environment-baseline.md`) handles assumed controls that apply to all applications by deployment target: Cloudflare WAF, SQL Server TDE, MS Defender, Azure/AWS/GCP Cloud LZ guardrails, and approved organizational identity providers.

**Do not re-declare these in `controls.yaml`**: they are already factored into the assessment. This file is only for application-layer controls beyond the baseline.

### Full Schema Template

Copy this template into `.ai/controls.yaml` and set boolean flags to `true` for controls you have implemented. **Provide a detail string for every `true` flag**: annotations without detail strings are less useful to reviewers.

```yaml
# .ai/controls.yaml
# Compensating controls declaration for [APPLICATION NAME]
# See BlueTeam/shared/schemas/controls-yaml.md for schema documentation.
schema_version: "1.0"
declared_by: ""       # Team or person who verified these controls exist
last_updated: ""      # YYYY-MM-DD

# ─── WAF / Perimeter ─────────────────────────────────────────────────────────
waf_present: false              # Custom WAF rules beyond the Cloudflare baseline
waf_details: ""                 # e.g. "Azure Front Door with custom OWASP CRS tuning for API paths"

rate_limiting_present: false    # Application-layer rate limiting on auth/sensitive endpoints
rate_limiting_details: ""       # e.g. "AspNetCoreRateLimit: 5 req/min per IP on /auth and /api/reset"

# ─── Authentication ───────────────────────────────────────────────────────────
mfa_enforced: false             # MFA enforced on all user-facing auth paths (all user types)
mfa_details: ""                 # e.g. "Authenticator app via Enterprise IdP Conditional Access: all user roles"

idp_fully_delegated: false      # 100% of auth paths delegate to an approved organizational IdP: no custom auth code
idp_name: ""                    # e.g. "Enterprise IdP (AUTH-002) via OIDC: all auth paths verified"

session_management_present: false   # Session hardening beyond framework defaults
session_details: ""                 # e.g. "30-min sliding expiry, httpOnly+Secure+SameSite=Strict, server-side revocation"

# ─── Authorization ────────────────────────────────────────────────────────────
authz_framework_present: false  # Centralized authorization framework enforced on all endpoints
authz_framework_details: ""     # e.g. "OPA Rego policies evaluated per request via middleware sidecar"

row_level_security_present: false   # Row-level access control (DB or application layer)
row_level_security_details: ""      # e.g. "PostgreSQL RLS policies per tenant_id; verified in migration files"

# ─── Input Validation / Injection Defense ─────────────────────────────────────
input_validation_present: false     # Centralized input validation / schema validation layer
input_validation_details: ""        # e.g. "Zod schema validation on all API inputs via global middleware"

parameterized_queries_enforced: false   # ORM or parameterized queries enforced project-wide: no raw SQL
parameterized_queries_details: ""       # e.g. "Entity Framework Core with query audits; raw SQL banned in code review"

# ─── Encryption / Secrets ─────────────────────────────────────────────────────
field_encryption_present: false     # Field-level encryption for PHN/SIN/high-sensitivity fields
field_encryption_details: ""        # e.g. "Azure Key Vault-backed AES-256-GCM on PHN and SIN columns"

secrets_manager_present: false      # All secrets stored in vault: not in source code or environment files
secrets_manager_details: ""         # e.g. "Azure Key Vault; verified no secrets in appsettings.json or .env"

# ─── CORS / HTTP Headers ──────────────────────────────────────────────────────
cors_policy_present: false          # Explicit CORS allowlist configured
cors_policy_details: ""             # e.g. "AllowedOrigins: ['https://app.example.com'] only: wildcard blocked"

security_headers_present: false     # CSP, HSTS, X-Frame-Options, etc. configured
security_headers_details: ""        # e.g. "Helmet.js: strict-dynamic CSP, HSTS max-age=31536000, X-Frame-Options=DENY"

# ─── Logging / Monitoring ─────────────────────────────────────────────────────
security_logging_present: false     # Security event logging (auth, authz, data access events) implemented
security_logging_details: ""        # e.g. "Serilog structured logs to organizational Splunk via LOG-006; auth events logged"

anomaly_detection_present: false    # Runtime anomaly detection / SIEM alerting active
anomaly_detection_details: ""       # e.g. "Azure Sentinel alert rules for failed auth spikes and unusual data volume"

# ─── File Upload ──────────────────────────────────────────────────────────────
file_upload_scanning_present: false     # Malware scanning on all uploads
file_upload_scanning_details: ""        # e.g. "ClamAV scan invoked synchronously before S3 storage write"

file_upload_type_validation_present: false   # Magic byte + content-type validation
file_upload_type_validation_details: ""      # e.g. "FileMagic library validates MIME vs extension on all upload handlers"
```

### Validation Rules

- Boolean keys must be `true` or `false` (not `yes`/`no`, `1`/`0`, or quoted strings)
- Detail strings are strongly recommended for every `true` flag: annotations without details are less actionable
- Unknown or extra keys are silently ignored by skills
- YAML parse errors skip Layer 3 entirely (skills log a warning): they do not fail the assessment
- The file does not affect severity ratings, finding suppression, or compliance verdicts

### Example Filled-In File

```yaml
# .ai/controls.yaml
schema_version: "1.0"
declared_by: "Application Security Team: organizational Digital Platforms"
last_updated: "2026-03-01"

waf_present: true
waf_details: "Azure Front Door with custom rate rules for /api/auth; Cloudflare Enterprise also in path"

rate_limiting_present: true
rate_limiting_details: "AspNetCoreRateLimit middleware: 5 req/15min per IP on /api/auth/login and /api/auth/reset"

mfa_enforced: false
mfa_details: ""

idp_fully_delegated: true
idp_name: "Enterprise IdP (AUTH-002) via OIDC: all authentication paths delegate; no custom password handling"

session_management_present: true
session_details: "JWT access tokens (15 min), refresh tokens (8 hr) stored httpOnly+Secure+SameSite=Strict; revocation via Redis blocklist"

authz_framework_present: true
authz_framework_details: "Custom RBAC middleware evaluates DMS_USER/DMS_ADMIN roles on every API route; verified in route integration tests"

row_level_security_present: false
row_level_security_details: ""

input_validation_present: true
input_validation_details: "Zod schema validation applied via global middleware; rejects unknownKeys on all request bodies"

parameterized_queries_enforced: true
parameterized_queries_details: "Entity Framework Core with no raw SQL; verified in code review checklist"

field_encryption_present: false
field_encryption_details: ""

secrets_manager_present: true
secrets_manager_details: "Azure Key Vault: all secrets accessed via managed identity; no secrets in appsettings.json or repo"

cors_policy_present: true
cors_policy_details: "AllowedOrigins: ['https://app.example.com'] only: no wildcard; configured in Startup.cs line 84"

security_headers_present: true
security_headers_details: "Helmet.js: strict-dynamic CSP, HSTS max-age=31536000 preload, X-Frame-Options=DENY"

security_logging_present: true
security_logging_details: "Serilog structured logs to organizational Splunk (LOG-006); auth / authz / data access events logged with user ID and IP"

anomaly_detection_present: false
anomaly_detection_details: ""

file_upload_scanning_present: false
file_upload_scanning_details: ""

file_upload_type_validation_present: false
file_upload_type_validation_details: ""

notes: "App runs in organizational Azure Landing Zone (East Canada). All traffic via Cloudflare Enterprise. PHN not collected: data store is Protected A."
```
