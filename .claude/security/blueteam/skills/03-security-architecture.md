---
id: security_architecture_design_skill
name: Security Architecture Design & Analysis
description: >
  Non-interactive security architecture skill. Reads available inputs (application_map.json,
  security-classification.yaml, requirements docs) and operates in one of three modes:
  Describe (code-only), Design (requirements-only), or Full (both). Identifies the
  deployment profile, describes the implemented or intended security architecture, and
  emits SA-NNN architectural gap findings distinct from ASVS/CAS code-level findings.
  Extracts SR-NNN security requirements from each SA-NNN gap (no CC entries produced).
version: 1.2.0
status: active
pipeline_position: "After skills/01-application-map.md; before skills/04-threat-model.md"
outputs:
  - .ai/blueteam/data/security_architecture.json
  - .ai/blueteam/data/security_requirements.json   # SR entries extracted from SA-NNN gaps; merged/appended if file already exists
  - .ai/blueteam/reports/security_architecture.md
  - .ai/blueteam/reports/security_architecture.html
---

# Security Architecture Design & Analysis Skill

## Overview

This skill analyses the security architecture of a application without user interaction. It reads available inputs and selects the appropriate mode automatically:

| Mode | Inputs available | What it produces |
|---|---|---|
| **Full** | `application_map.json` + requirements docs | Profile ID, architecture description, design vs. implementation comparison, SA-NNN gaps at both levels |
| **Describe** | `application_map.json` only (no requirements) | Profile ID, architecture description from code, implementation gaps against reference profile |
| **Design** | Requirements docs only (no `application_map.json`) | Recommended profile, design-level architecture specification, design gaps from requirements |
| **Minimal** | Neither available | Notice of limited assessment; no gap findings emitted |

SA-NNN gap IDs are **architectural gaps only**: structural decisions about auth / authorization / data protection / perimeter / logging. Code-level control gaps (specific middleware settings, algorithm choices, header values) belong in ASVS/CAS findings, not here. This distinction prevents double-counting.

Run this skill **after** `skills/01-application-map.md` (Phase 1 of the pipeline) and **before** `skills/04-threat-model.md`. When `security_architecture.json` is present, the threat model reads it to benefit from pre-identified architectural weaknesses.

---

## Pre-Assessment Setup

### Step 1: Load Shared Preflight

Load `shared/skills/preflight.md` and complete all four preflight steps:
- Step 1: baseline (read `shared/reference/environment-baseline.md` up to the `> **NON-ASVS SKILLS: STOP READING HERE.**` marker)
- Step 2: Controls file (parse `.ai/controls.yaml` if present)
- Step 3: RA register (load `.ai/blueteam/data/risk_acceptances.json` if present; establish non-suppressible list)
- Step 4: App map staleness (evaluate `application_map.json` freshness)

### Step 2: Load Reference Architectures

Read `shared/reference/reference-architectures.md` in full. This file defines:
- Profile A (Internal Staff), Profile B (Public Citizen), Profile C (Dual Portal)
- Data classification overlays (Protected B, Protected A, Public)
- REST API architecture baseline

These profiles are the reference points for gap identification throughout this skill.

---

## Phase 1: Input Inventory

Determine which inputs are available and set the operating mode.

### 1.1 Check for application_map.json

Read `.ai/blueteam/data/application_map.json` if present. Extract:
- `source` field: `"code"` (live scan) or `"requirements"` (Requirements Mode)
- `auth_mechanisms[]`: identity providers and auth patterns found
- `endpoints[]`: routes with `auth_level` and `middleware_chain`
- `tech_stack`: framework, language, runtime, session store
- `deployment`: hosting, containerization, environment flags
- `secrets_findings[]`: secrets or config issues found by application map
- `auth_first_in_chain`: boolean (is auth enforced before route handlers?)

Record: `code_inputs_available = true` if `application_map.json` exists AND `source = "code"`.

If `source = "requirements"`, the map was generated from requirements docs rather than code. Treat it as design evidence (not implementation evidence) and set `code_inputs_available = false`.

### 1.2 Check for data classification

Read `.ai/blueteam/data/security-classification.yaml` if present, then extract `overall_classification` (or equivalent field) and map it to: `public`, `protected_a`, `protected_b`, or `unknown`.

If absent, infer from application map `data_classification` field if present; otherwise `unknown`.

### 1.3 Check for requirements documents

Look for any of the following (in order of preference):
- `.ai/blueteam/data/application_map.json` with `source: "requirements"` (most structured form)
- Requirements docs at paths typical of Factory Agent outputs: `requirements/`, `.ai/requirements/`, `docs/requirements/`
- README.md or any markdown file in the repo root that describes the application's users / data / features (fallback)

Record: `requirements_available = true` if any structured requirements evidence is found.

### 1.4 Set operating mode

| `code_inputs_available` | `requirements_available` | Mode |
|---|---|---|
| true | true | **Full** |
| true | false | **Describe** |
| false | true | **Design** |
| false | false | **Minimal** |

In **Minimal** mode: emit a brief report noting the limitation and skip Phases 3-5. Write a minimal JSON artifact with `mode: "minimal"` and `gaps: []`.

---

## Phase 2: Profile Identification

Identify which organizational reference architecture profile best fits this application. This determination informs all gap comparisons.

### 2.1 Gather profile signals

Collect signals from all available inputs:

| Signal | Source | Profile indicator |
|---|---|---|
| Auth driver | application_map.auth_mechanisms | `entra-id` only → Profile A; `saml` only → Profile B; both → Profile C |
| Citizen auth story | Requirements | Mentions end users, public users, or public portal → Profile B or C |
| Staff auth story | Requirements | Mentions organizational staff, employees, Enterprise IdP (e.g. Entra ID), Azure AD → Profile A or C |
| Session store | application_map.tech_stack | PostgreSQL sessions → Profile A; Redis sessions → Profile B or C |
| Public-facing indicator | Deployment, CORS config, env | `example.com` in domains → Profile B or C |
| `SAML_ENTRY_POINT` env | application_map secrets_findings / env | SAML config present → Profile B or C |
| Dual portal flag | CODEMAP or docs | Two Vue apps, dual env configs → Profile C |

### 2.2 Assign profile and confidence

Based on the signals:
- **High confidence**: Multiple consistent signals pointing to one profile
- **Medium confidence**: Mixed or partial signals; one profile is more likely
- **Low confidence**: Insufficient signals to distinguish; note what would resolve ambiguity

If profile is `unknown`, note the missing signals and proceed with gap analysis against the organizational API baseline only.

---

## Phase 3: Architecture Description (Code Mode)

*Skip if `code_inputs_available = false`. Jump to Phase 4.*

Read the following from the application map and (if needed for detail) from relevant source files identified in the map's `critical_files` list:

### 3.1 Auth tier
- What IdP(s) are configured? What driver(s) are registered?
- Is session-based auth used (correct) or JWT (flag if JWT is used for user sessions)?
- Where is session state stored?
- Are multiple auth drivers present? Is the auth-first-in-chain invariant satisfied?

### 3.2 Authorization model
- What roles are present in code? (Search for `requireRole(`, role assignments in auth drivers, role checks in frontend router guards)
- What is the enforcement pattern? (Middleware on route? Controller-level check? Inconsistent?)
- Is per-object authorization present? (Look for ownership checks: `req.session.user.id === record.userId` patterns)
- Note any routes in `endpoints[]` with `auth_level: "none"` or missing middleware (flag unprotected routes)

### 3.3 Data protection
- Is TLS enforced in config or deployment manifests?
- Are secrets loaded from environment / Key Vault, or are any hardcoded (cross-check `secrets_findings`)?
- Is field-level encryption present for any fields? (Look for crypto module usage near data model code)
- Session cookie flags: `httpOnly`, `secure`, `sameSite`
- **`.env` gitignore check**: If `secrets_findings[]` includes secrets found in a `.env` file, check whether `.gitignore` (or `.dockerignore`) excludes `.env`. Record `gitignore_covers_env: true` if a gitignore rule covers it, `false` if absent or not covered. This flag is used in Phase 5 to gate gap emission; do NOT pre-judge here.

### 3.4 Perimeter and transport
- Is a BFF proxy pattern in use? (Look for gateway routes, proxy-to-backend patterns)
- Is rate limiting configured globally? On auth endpoints specifically?
- Are security headers set (Helmet or equivalent)?
- Is CORS restricted or open?

### 3.5 Logging
- Is structured logging present? (pino, winston, or similar)
- Is PII redaction implemented in the logger?
- Are correlation IDs present on requests?
- **Audit logging (two-tier scope)** (per CAS LOG-001h):
  - Tier 1: **Write operations on ALL Protected B data** (create, update, delete). Are audit log entries written for data modification events? This is required for any Protected B data.
  - Tier 2: **Read operations on high-sensitivity fields only**. Are audit log entries written for READ access to PHN (Personal Health Number), SIN (Social Insurance Number), health/mental health diagnoses, or financial records? Note: read logging is NOT required for general Protected B business records (e.g. case notes, business identifiers, non-sensitive employee records) unless those records contain PII/health/financial data.

Record findings as architecture components. Note gaps for Phase 5.

---

## Phase 4: Architecture Design Review (Requirements Mode)

*Skip if `requirements_available = false`. Jump to Phase 5.*

Read the requirements evidence identified in Phase 1.3. Extract:

### 4.1 Actors and authentication
- Who are the users? (Citizens, organizational staff, external partners, systems?)
- What authentication is described or implied for each actor type?
- Are there any actors with no authentication story? (Flag as design gap)
- Does the described auth align with the identified profile's expected IdP?

### 4.2 Authorization and roles
- Are roles defined in requirements? List them.
- What can each role access or do?
- Are there actors whose privilege scope is undefined? (Flag as design gap)
- Are there any data access patterns that imply per-object authorization requirements?

### 4.3 Data and classification
- What data does the application create, read, update, or delete?
- Cross-reference with data classification (`security-classification.yaml` if present, or infer from data descriptions)
- Do the requirements acknowledge sensitivity requirements (encryption, access logging, data residency)?
- Are there data elements that appear to require Protected B treatment but are not annotated as such?

### 4.4 Integration points
- Are external APIs or services referenced?
- Is the S2S authentication pattern described for service-to-service calls?
- Is any public API exposure described? (Implies API Gateway requirement)

---

## Phase 5: Gap Analysis

Compare available evidence against the reference architecture for the identified profile plus the applicable data classification overlay. Emit SA-NNN gaps.

### 5.1 Gap identification rules

**Only emit a gap if there is positive evidence of absence**. A gap requires evidence that something is missing, not merely an absence of evidence. When evidence is genuinely ambiguous, use the `evidence` field to note what was assessed and why it is uncertain.

Do not emit gaps for:
- Code-level control settings (algorithm choices, specific header values, timeout numbers); those belong in ASVS/CAS
- Issues already captured in `secrets_findings[]` of the application map (those are handled by the security tool scan)
- Controls enforced by organizational platform/infrastructure (per `shared/reference/environment-baseline.md` baseline assumptions)
- `.env` secrets that are gitignored (`gitignore_covers_env = true` from Phase 3.3 check); local dev `.env` files are expected practice when excluded from version control, so no gap should be emitted. If `gitignore_covers_env = false` (no `.gitignore` or `.env` not covered), a gap MAY be emitted at **Medium** severity only (not High or Critical). See Phase 5.2 Data protection for the full rule.
- Missing read-operation audit logs for general Protected B business records; only emit a logging gap for READ operations on PHN, SIN, health/mental health diagnoses, or financial records. Do NOT flag absent read logging for general Protected B data as a gap.

### 5.2 Architectural gap categories

Assess each category against available evidence:

**Profile fitness**
- Is the implemented/designed profile appropriate for the application's user population and data classification?
- Example: A citizen-facing app with Protected B data using Enterprise IdP (e.g. Entra ID) only: profile mismatch gap

**Authentication architecture**
- Are all user actor types covered by an authentication story?
- Is server-side session auth used for user sessions (not JWT)? (JWT for user sessions is an architectural flaw for organizational web apps)
- Is the session store appropriate for the profile (Redis for SAML/public; PostgreSQL or Redis for internal)?

**Authorization model**
- Are roles defined? If the application handles multiple user types, is RBAC implemented?
- Are roles from requirements present in code (Full mode: compare Phase 3.2 vs. Phase 4.2)?
- Is per-object authorization present where the data model requires it?
- Is there evidence of admin endpoints accessible to lower-privileged roles?

**Data protection architecture**
- For Protected B data: is field-level encryption described or implemented?
- Is encryption-in-transit enforced at the application level (not solely assumed from platform)?
- Secrets management: apply the following three-part rule:
  - **Hardcoded secrets in source files**: always a Critical or High gap (depends on secret type); not suppressible.
  - **`.env` file secrets**: apply the gitignore rule from Phase 3.3. Emit a gap only if `gitignore_covers_env = false`; max severity is **Medium**. If `gitignore_covers_env = true`, do not emit a gap (local dev pattern is acceptable).
  - **Secrets committed to git history** (found in past commits): treat as hardcoded. Assess at Critical or High regardless of current `.gitignore` state.

**Perimeter architecture**
- For external-facing apps: is API Gateway usage documented or configured?
- Is the BFF pattern in use where a private backend exists?
- Is rate limiting present at the architectural level?

**Logging architecture**
- Is an audit logging strategy present? Evaluate using the two-tier scope (per CAS LOG-001h):
  - **Write operations on ALL Protected B data** (create, update, delete): Is audit logging present for data modification? Flag absence as a High gap.
  - **Read operations on high-sensitivity fields only**: Is audit logging present for READ access to PHN, SIN, health/mental health diagnoses, or financial records? Flag absence as a High gap only when the application handles these specific data types. Do NOT flag missing read-operation audit logs for general Protected B business records.
- Is PII redaction implemented?
- Are correlation IDs threaded through the request lifecycle?

**API architecture (if the application exposes APIs)**
- Does the API versioning strategy exist?
- Are health endpoints present?
- Are error responses sanitized?

### 5.3 Format each gap

For each identified gap, produce one entry:

```
ID:              SA-NNN (sequential, starting at SA-001; never reuse)
Category:        profile | authentication | authorization_model | data_protection | perimeter | logging | api_architecture
Severity:        Critical | High | Medium | Low
  Critical:  No authentication for data access; JWT used for user sessions in organizational web app; no auth model defined for Protected B app
  High:      RBAC absent where multiple roles exist; no API Gateway for external app; no audit log for Protected B data WRITE operations; no READ audit log for PHN/SIN/health/financial fields when such data is handled by the application
  Medium:    Profile mismatch; session store not appropriate for profile; role definitions incomplete; `.env` file with secrets not excluded from version control (gitignore absent or `.env` not covered)
  Low:       API health endpoints absent; minor documentation gaps; optional controls absent
Title:           Short imperative phrase (e.g., "No authorization model defined for staff portal")
Description:     What is missing or inconsistent, and why it matters architecturally
Evidence:        What was examined; what was found (or not found) that led to this gap
Recommendation:  Specific architectural action to close the gap, referencing the relevant reference profile
References:      Profile section, organizational standard, ASVS chapter (architecture level only)
Related SR IDs:  Any SR-NNN from security_requirements.json that relates to this gap (leave empty if none yet allocated)
```

Apply the preflight Step 3 RA check to each gap: if the finding type is non-suppressible, do not suppress even with a risk acceptance.

---

## Phase 6: Write the Security Architecture Report

Write `.ai/blueteam/reports/security_architecture.md`.

### Report structure

```markdown
# Security Architecture Design & Analysis

**Application**: [name from application_map or classification file]
**Assessment Date**: [today's date]
**Mode**: Full | Describe | Design | Minimal
**Profile**: [Profile A/B/C/Custom/Unknown] ([confidence])

---

> **Related diagrams**: The Data Flow Diagram (DFD) and Authentication Flow sequence for this
> application are produced by `skills/04-threat-model.md`. See the **Threat Model**
> report and the **DFD** tab in the security overview for those visuals. This report covers
> architectural gap analysis and control coverage only.

---

## At-a-Glance Metrics

| Metric | Value |
|---|---|
| Profile | [Profile label, e.g. Profile A: Internal Staff] ([confidence] confidence) |
| Mode | [Full / Describe / Design / Minimal] |
| Architectural Gaps | [N total]. Critical: [N], High: [N], Medium: [N], Low: [N] |
| Highest Gap Severity | [Critical / High / Medium / Low / None identified] |
| SR Requirements Generated | [N (derived from SA-NNN gaps in Phase 7b)] |
| Domains with Gaps | [N of 7 architectural domains have at least one open gap] |

*Count gaps from `gaps[]` in the JSON artifact. Count SR entries from `security_requirements.json` where `sources[].assessment == "security_architecture_design"`.*

---

## 1. Executive Summary

[2-4 sentences: what profile was identified, how many SA gaps were found, highest severity, key recommendation]

---

## 2. Profile Identification

**Assigned profile**: [name]
**Confidence**: High | Medium | Low
**Basis**: [What evidence drove this assignment]
**Signals examined**: [bulleted list of signals and what each indicated]

---

## 3. Security Architecture Description

*[Present in Describe and Full modes. In Design mode, replace with "Recommended Architecture". In Minimal, note limitation.]*

### 3.1 Identity & Authentication
[What is implemented / recommended]

### 3.2 Authorization Model
[Roles found in code or defined in requirements; enforcement pattern; per-object auth status]

### 3.3 Data Protection
[Encryption in transit and at rest; secrets management; field-level encryption status]

### 3.4 Perimeter & Transport
[API Gateway usage; BFF pattern; rate limiting; security headers; CORS]

### 3.5 Logging & Audit
[Structured logging; PII redaction; correlation IDs; audit log coverage]

### 3.6 Control Coverage Matrix

A snapshot of which architectural controls are present, partial, or absent. Populated directly from the structured fields captured during Phases 3-4.

**Status key**: PRESENT (implemented). PARTIAL (uncertain). ABSENT (non-compliant). N/A (not applicable).

| Domain | Control | Status | Notes |
|---|---|---|---|
| **Authentication** | IdP drivers configured | [PRESENT: list / ABSENT: None] | |
| **Authentication** | Session-based auth (not JWT for user sessions) | [PRESENT: Yes / ABSENT: JWT in use] | `jwt_for_user_sessions` field |
| **Authentication** | MFA enforced | [PRESENT: / ❌] | `mfa_required` field |
| **Authorization** | Roles defined | [PRESENT: list / ABSENT: None] | From `roles_found_in_code` or `roles_defined_in_requirements` |
| **Authorization** | Enforcement pattern | [PRESENT: Middleware / PARTIAL: Inconsistent / ABSENT: None] | `enforcement_pattern` field |
| **Authorization** | Per-object authorization | [PRESENT: Present / PARTIAL: Partial / ABSENT: Absent / N/A: Not required] | `per_object_auth` field |
| **Data Protection** | Encryption in transit | [PRESENT: Enforced / PARTIAL: Unknown / ABSENT: Not enforced] | `encryption_in_transit` field |
| **Data Protection** | Secrets management | [PRESENT: Key Vault / PARTIAL: Env vars / ABSENT: Hardcoded] | `secrets_management` field |
| **Data Protection** | Field-level encryption | [PRESENT: Present / N/A: Not required / ABSENT: Absent] | `field_level_encryption` field |
| **Perimeter** | Rate limiting | [PRESENT: Global / PARTIAL: Auth endpoints only / ABSENT: Absent] | `rate_limiting` field |
| **Perimeter** | Security headers | [PRESENT: Present / PARTIAL: Partial / ABSENT: Absent] | `security_headers` field |
| **Perimeter** | API gateway | [PRESENT: Found / ABSENT: Required but absent / N/A: Not required] | `api_gateway_required` + `api_gateway_found` fields |
| **Logging** | Structured logging | [PRESENT: Present / ABSENT: Absent] | `structured_logging` field |
| **Logging** | PII redaction | [PRESENT: Present / ABSENT: Absent] | `pii_redaction` field |
| **Logging** | Correlation IDs | [PRESENT: Present / ABSENT: Absent] | `correlation_ids` field |
| **Logging** | Audit logging | [PRESENT: Present / PARTIAL: Partial / ABSENT: Absent] | `audit_logging` field |

*Use `N/A` for controls that are not applicable to this application's profile or data classification. The Notes column references the source field in `security_architecture.json` for traceability.*

---

## 4. Architectural Gap Findings

*[Omit this section entirely if no gaps found. In Minimal mode, note that gap analysis was not performed.]*

### Gap Severity Distribution

*[Produce this table even if some cells are empty. Include all 7 categories as rows. Use `-` for cells with no gap of that severity in that category. If a category has multiple gaps at the same severity, list all IDs separated by commas. Include a bold Total row.*]

| Category | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| authentication | [SA-NNN or -] | ... | ... | ... | N |
| authorization_model | ... | ... | ... | ... | N |
| data_protection | ... | ... | ... | ... | N |
| perimeter | ... | ... | ... | ... | N |
| logging | ... | ... | ... | ... | N |
| api_architecture | ... | ... | ... | ... | N |
| profile | ... | ... | ... | ... | N |
| **Total** | **N** | **N** | **N** | **N** | **N** |

### Gap Details

| ID | Severity | Category | Title |
|---|---|---|---|
| SA-001 | High | authorization_model | No RBAC defined for multi-role application |
| SA-002 | Medium | profile | ... |

### SA-NNN: [Title]

**Severity**: [Critical/High/Medium/Low]
**Category**: [category]
**Description**: [full description]
**Evidence**: [what was examined]
**Recommendation**: [specific architectural action]
**References**: [profile section, organizational standard, ASVS]

*[Repeat for each gap]*

---

## 5. Architecture vs. Requirements Comparison

*[Full mode only. Omit in Describe or Design modes.]*

| Aspect | Designed (Requirements) | Implemented (Code) | Status |
|---|---|---|---|
| Auth driver | SAML (Corporate IdP) | auth-saml module | Aligned |
| Roles | admin, case-worker | admin, user | Inconsistent ('case-worker' missing) |
| ... | ... | ... | ... |

---

## 6. Recommendations

[Numbered list of architectural actions, prioritized by severity]

1. [Critical/High gaps first]
2. ...
```

---

## Phase 7: Write JSON Artifact

Write `.ai/blueteam/data/security_architecture.json`. Use the schema below. All string fields use plain ASCII or basic Unicode (no typographic quotes, em-dashes, or smart apostrophes, which cause mojibake in the overview report).

```json
{
  "schema_version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "assessment_name": "security_architecture_design",
  "application_name": "string",
  "mode": "full | describe | design | minimal",
  "profile": "internal | public | dual | custom | unknown",
  "profile_confidence": "high | medium | low",
  "profile_basis": "string: evidence summary for profile assignment",
  "data_classification": "public | protected_a | protected_b | unknown",
  "auth": {
    "drivers": ["string"],
    "session_store": "string | null",
    "mfa_required": true,
    "citizen_auth": false,
    "jwt_for_user_sessions": false
  },
  "authorization": {
    "roles_defined_in_requirements": ["string"],
    "roles_found_in_code": ["string"],
    "enforcement_pattern": "string | null",
    "per_object_auth": "present | absent | partial | not_required | unknown"
  },
  "data_protection": {
    "encryption_in_transit": "enforced | not_enforced | unknown",
    "encryption_at_rest": "string describing evidence or 'unknown'",
    "field_level_encryption": "present | absent | not_required | unknown",
    "secrets_management": "key_vault | environment_vars | hardcoded | unknown"
  },
  "perimeter": {
    "api_gateway_required": true,
    "api_gateway_found": "string | null",
    "bff_pattern": "present | absent | unknown",
    "rate_limiting": "global | auth_only | absent | unknown",
    "security_headers": "present | partial | absent | unknown"
  },
  "logging": {
    "structured_logging": "present | absent | unknown",
    "pii_redaction": "present | absent | unknown",
    "correlation_ids": "present | absent | unknown",
    "audit_logging": "present | partial | absent | unknown"
  },
  "gaps": [
    {
      "id": "SA-NNN",
      "category": "profile | authentication | authorization_model | data_protection | perimeter | logging | api_architecture",
      "severity": "Critical | High | Medium | Low",
      "title": "string",
      "description": "string",
      "evidence": "string",
      "recommendation": "string",
      "references": ["string"],
      "related_requirement_ids": ["SR-NNN"],
      "status": "open | risk_accepted"
    }
  ]
}
```

**Field validation rules:**
- `assessment_name` MUST be exactly `"security_architecture_design"`. This is the canonical value consumed by `generate_overview_html.js`.
- `gaps[].id` MUST follow `SA-\d+` format
- `gaps[].severity` MUST be one of: `Critical`, `High`, `Medium`, `Low`
- `gaps[].status` MUST be `open` unless a risk acceptance in the RA register explicitly covers this gap
- All gap fields (`title`, `description`, `evidence`, `recommendation`) MUST be populated (no null or empty strings)

---

## Phase 7b: Extract Security Requirements from SA-NNN Gaps

SA-NNN architectural gaps represent actionable control requirements. This phase translates each open gap into one SR-NNN entry in `.ai/blueteam/data/security_requirements.json`. No CC-NNN code change entries are produced; architectural gaps require design-level solutions (choosing an IdP, implementing RBAC at the architecture level). Specific code changes are generated by ASVS and CAS skills when they encounter the same control gaps at the code level.

### Step 1: Read existing security_requirements.json

Read `.ai/blueteam/data/security_requirements.json`. If the file does not exist, initialise an empty structure:

```json
{ "schema_version": "1.0", "last_updated": "", "generated_by_assessments": [], "requirements": [] }
```

### Step 2: Extract candidate SR entries from gaps

For each gap in `gaps[]` where `status != "risk_accepted"`, produce one candidate SR entry:

**Priority mapping** (from gap severity):

| Gap severity | SR priority |
|---|---|
| Critical | critical |
| High | high |
| Medium | medium |
| Low | low |

**SR entry format**:

```json
{
  "id": "[allocated in Step 4]",
  "title": "[gap title, restate as a requirement noun phrase]",
  "priority": "[mapped priority]",
  "requirement_text": "The system MUST [specific architectural action from gap.recommendation].",
  "rationale": "[gap.description: why this matters architecturally]",
  "acceptance_criteria": [
    "[verifiable criterion 1 derived from gap.recommendation]",
    "[verifiable criterion 2]",
    "[verifiable criterion 3]"
  ],
  "sources": [
    { "assessment": "security_architecture_design", "finding_id": "[gap.id]" }
  ],
  "related_code_change_ids": []
}
```

The `requirement_text` MUST open with `The system MUST` and describe the specific architectural action from the gap's `recommendation` field. Write exactly 3 `acceptance_criteria` items; each one must be independently verifiable and testable.

### Step 3: Apply de-duplication

For each candidate SR entry, apply the standard de-duplication algorithm (from `shared/schemas/artifacts.md`):
- If an existing SR entry has title similarity > 80%, or a `sources[].finding_id` match (same `SA-NNN`), merge sources and keep the highest priority.
- Otherwise, create a new entry.

### Step 4: Allocate IDs and write security_requirements.json

Allocate SR-NNN IDs sequentially from the current maximum ID in the file (or starting at `SR-001` if empty).

**MANDATORY**: Add `"security_architecture_design"` to `generated_by_assessments[]` if not already present, even if all candidates were de-duplicated into existing entries. Update `last_updated` to today's date. Write the file.

### Step 5: Backfill related_requirement_ids in security_architecture.json

For each gap that generated or matched an SR entry, update `gaps[].related_requirement_ids` in `.ai/blueteam/data/security_architecture.json` with the allocated or matched `SR-NNN` ID. Re-write `security_architecture.json` with the updated `related_requirement_ids`.

### Step 6: Conditionally regenerate requirements reports

If at least one new SR entry was created (not merely merged), regenerate the requirements report:

```bash
node scripts/generate_requirements_report.js --repo-root <repo>
```

This produces both `.ai/blueteam/reports/security_requirements.md` and `.ai/blueteam/reports/security_requirements.html` atomically. If the script is unavailable, produce both files manually using the format in `shared/schemas/artifacts.md § .ai/blueteam/reports/security_requirements.md`.

---

## Phase 8: Generate HTML Report

Run:

```bash
node scripts/generate_report_html.js --repo-root <repo>
```

This converts `.ai/blueteam/reports/security_architecture.md` to `.ai/blueteam/reports/security_architecture.html` using the organizational CSS template.

After HTML generation, run the validator:

```bash
node scripts/validate_reports.js --repo-root <repo>
```

If the validator reports errors, fix them before declaring the skill complete.

---

## Downstream Skill Integration

When `security_architecture.json` is present in `.ai/blueteam/data/`, the following skills benefit from reading it:

**Threat Model** (`skills/04-threat-model.md`): Before constructing the DFD, read `security_architecture.json`. Use `profile`, `auth`, `authorization`, and `gaps` to:
- Pre-populate trust boundary assumptions from the identified profile
- Flag SA-NNN gaps as confirmed pre-existing weaknesses in relevant threat entries rather than discovering them anew
- Reference the profile's expected perimeter controls when assessing Spoofing and Elevation threats

**Kill Chain Aggregator** (`skills/07-kill-chain-aggregator.md`): SA-NNN gaps may serve as chain enablers. When a kill chain step relies on an architectural weakness (e.g., missing per-object authorization enabling BOLA exploitation), reference the relevant `SA-NNN` in the chain step's `finding` field.

**Security Overview Report** (`skills/12-security-overview-report.md`): The Security Architecture tab in the overview SPA is populated from `security_architecture.json`. SA-NNN gaps appear alongside SR-NNN requirements as a distinct architectural findings category.
