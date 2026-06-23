---
id: cybersecurity-architecture-standards
name: Cybersecurity Architecture Standards Skill
description: Assesses application compliance with organizational cybersecurity architecture standards and produces prioritized remediation artifacts.
type: sub-agent
version: 1.0.0
tools_required:
   - Read
   - Write
   - Edit
   - Glob
   - Grep
   - Bash
tools_optional: []
references:
   - environment
   - cas-rule-definitions
   - ai-artifacts-schema
   - controls-yaml-schema
   - blue-team-shared-security-preflight
   - application-map-skill
upstream:
   - ref: blue-team-shared-security-preflight
      artifacts: []
   - ref: application-map-skill
      artifacts:
         - .ai/blueteam/data/application_map.json
outputs:
   - artifact: .ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md
      format: markdown
   - artifact: .ai/blueteam/reports/cybersecurity_architecture_standard_compliance.html
      format: html
   - artifact: .ai/blueteam/data/code_changes.json
      format: json
   - artifact: .ai/blueteam/data/security_requirements.json
      format: json
   - artifact: .ai/blueteam/data/verification_tests.json
      format: json
   - artifact: .ai/blueteam/data/environment_assumptions.json
      format: json
call_sequence_hard:
   - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
   - Must load shared/skills/preflight.md before assessment setup.
   - Must load shared/reference/environment-baseline.md before assessment steps.
   - Must check application_map staleness and regenerate when stale before rule verification.
---

## Shared Preflight (Load First)

Before rule evaluation begins, load `shared/skills/preflight.md` and continue with its preflight state. The baseline / controls / risk-acceptance setup sections below remain authoritative and may be treated as already satisfied when preflight has completed.

# Decision Logic
- **Exceptions**: Approval-only via cybersecurity@example.com

# Verification Level Guide
- **code**: Verifiable by static analysis of source code files (e.g., grep for hardcoded secrets, check auth middleware, review input validation)
- **configuration**: Verifiable by inspecting config files committed to repo (.toml, .yaml, .json, .env references), environment variable references, and deployment manifests (Dockerfile, render.yaml, etc.)
- **infrastructure**: NOT verifiable from code review alone. Requires cloud console access, network diagrams, or infrastructure-as-code (Terraform, Bicep, ARM templates).

# organizational Environment Baseline

> **Required reading:** Load `shared/reference/environment-baseline.md` before beginning any assessment step. Stop at the `> **NON-ASVS SKILLS: STOP READING HERE.**` marker; the ASVS Chapter Assumption Mapping section that follows is not needed by this skill.

> **Required reading:** Load `shared/reference/cas-rule-definitions.md` before beginning rule verification. That file contains the authoritative requirement text, compliant implementation patterns, organization-specific requirements, applicability scope rules, and ITSG-33 mappings for all CAS rules. The rule tables below (Identity & Authentication, Authorization, Network & Perimeter Security, etc.) are the assessment-layer summary; for full rule specifications consult `shared/reference/cas-rule-definitions.md`.

**Key CAS rule implications from the organizational environment baseline:**

| CAS Rule | organizational Environment Assumption | Assessment Impact |
|----------|---------------------------|------------------|
| WAF-001 | Cloudflare assumed for public-facing apps (Cloud LZ or DC) | Use `ASSUMED COMPLIANT (Environment Baseline)` verdict; note validation required |
| FW-001 | Cloud-native firewall assumed for Cloud LZ deployments | Use `ASSUMED COMPLIANT (Environment Baseline)` verdict |
| CDN-001 | Cloud-native CDN assumed for Cloud LZ deployments | Use `ASSUMED COMPLIANT (Environment Baseline)` verdict |
| BOT-001 | Cloudflare Bot Management assumed for public-facing apps | Use `ASSUMED COMPLIANT (Environment Baseline)` verdict (where SHOULD trigger applies) |
| MAL-001 | MS Defender assumed on all organizational servers/endpoints | Use `ASSUMED COMPLIANT (Environment Baseline)` verdict |
| FW-002 | Zone firewalls assumed for on-premises DC deployments | Use `ASSUMED COMPLIANT (Environment Baseline)` verdict; note that flat network constraint requires explicit segmentation verification |
| LOG-006 | centralized log shipping service assumed available | Use `ASSUMED COMPLIANT (Environment Baseline)` for the infrastructure; verify application ships logs to it |
| ENC-001 (infra) | TLS 1.2+ assumed at perimeter; Cloud LZ managed storage encryption assumed | Do NOT report absence of TLS in app code for app-to-client path; still verify backend-to-backend connections |

> Controls never waived: see `shared/reference/environment-baseline.md` § "Controls That Are NEVER Satisfied by organizational Environment Assumptions."

**Assumptions MUST be reported.** After completing the assessment, include a "Organizational Environment Assumptions" section in the report (Section 9) listing every assumption applied. Write assumptions to `.ai/blueteam/data/environment_assumptions.json` (schema in `shared/schemas/artifacts.md`).

---

## Controls File Loading (Optional, Layers 3 & 4)

After loading `shared/reference/environment-baseline.md`, check for `.ai/controls.yaml` in the repository root:

1. If **absent**: skip all Layer 3 processing; proceed normally.
2. If **present**: parse the YAML and extract the **Active Controls List**: all keys where the boolean is `true`. For any `true` key with an empty detail string, record the key with placeholder: `"(no details provided; application team should add detail)"`.
3. If the file cannot be parsed, add `> Warning: .ai/controls.yaml is present but could not be parsed; Layer 3 annotations skipped.` in the report and proceed.

Read `shared/schemas/controls-yaml.md` (located in the same directory as this skill file) for the **control key to finding type mapping table**, **annotation format (CAS inline style)**, and **Layer 4 organizational Baseline Context hints table**. Store the Active Controls List for annotation use during Section 2 finding writing.

## Risk Acceptance (Pre-Assessment)

> **RA register loaded in preflight.** `shared/skills/preflight.md` Step 3 has loaded `.ai/blueteam/data/risk_acceptances.json` (if present), recorded all RA entries, and established the finding-level RA check procedure including the non-suppressible finding type list. Apply that procedure when writing each NON-COMPLIANT finding in Section 2. Full Step 13 processing completes in Phase 8.

---

# Verdict Guide
When assessing compliance, use the following verdict taxonomy. MUST rules can only be COMPLIANT, NON-COMPLIANT, NOT VERIFIABLE, or ASSUMED COMPLIANT (Environment Baseline). SHOULD rules use REVIEW RECOMMENDED or NOT APPLICABLE based on applicability triggers (see below).

| Verdict | Applies To | Meaning |
|---------|-----------|---------|
| **COMPLIANT** | MUST, SHOULD | The requirement is fully met; evidence confirms the control is in place |
| **NON-COMPLIANT** | MUST only | A mandatory requirement is not met. Remediation required |
| **REVIEW RECOMMENDED** | SHOULD only | The rule may apply based on context but compliance could not be confirmed. Human review needed to determine applicability and whether remediation is warranted |
| **NOT APPLICABLE** | SHOULD only | Applicability triggers were evaluated and the rule does not apply to this application |
| **NOT VERIFIABLE** | MUST, SHOULD | The verification level is `infrastructure`, no organizational environment assumption covers this rule, and it cannot be confirmed from code/configuration review alone. Note what would need to be checked |
| **ASSUMED COMPLIANT (Environment Baseline)** | MUST (infrastructure-level only) | The verification level is `infrastructure`, the organizational environment baseline (`shared/reference/environment-baseline.md`) states this control is assumed present for the applicable deployment target, and no conflicting evidence was found in the repository. Requires human validation before closure |

> **Choosing between NOT VERIFIABLE and ASSUMED COMPLIANT:** Use `ASSUMED COMPLIANT (Environment Baseline)` when `shared/reference/environment-baseline.md` explicitly lists the rule as assumed for the deployment target. Use `NOT VERIFIABLE` for infrastructure controls that `shared/reference/environment-baseline.md` does NOT cover (e.g., FW-002 for a cloud-only app, or CDS-001 when the cloud LZ configuration is non-standard).

**MUST rules with SHOULD sub-requirements**: Some MUST rules contain individual sub-requirements at SHOULD level (e.g., PWD-001 mandates 12-char minimum but only recommends breach checks). The overall rule verdict is based on the MUST sub-requirements. SHOULD sub-requirements within the rule should be listed separately as REVIEW RECOMMENDED items if not implemented.

# MUST Rule Risk Tiers
All MUST rules require remediation when non-compliant, but they are not equal in impact. AI agents assessing compliance MUST assign the risk tier below when reporting NON-COMPLIANT findings. Prioritize remediation output in tier order (Critical first).

| Tier | Meaning | Rule IDs |
|------|---------|----------|
| **Critical** | Remotely exploitable; full compromise or impersonation likely without chaining | AUTH-001, AUTH-002, AUTH-003, AUTH-004, SEC-003, CORS-001, AUTHZ-001, AUTHZ-002, AUTHZ-005 |
| **High** | Significant security gap; exploitation plausible with moderate effort | RATE-001, UPLOAD-001, UPLOAD-002, SEC-001, SEC-002, SEC-004, SEC-005, LOG-001, LOG-010, ENC-001, ENC-002, SESSION-001, SESSION-002, AUTHZ-003, AUTHZ-006, ACCT-001, AI-001, AI-004, AI-005 |
| **Medium** | Defence-in-depth gap; exploitation typically requires chaining with another vulnerability | HDR-001, CSP-001, LOG-002, LOG-003, LOG-005, LOG-006, LOG-007, LOG-008, WEB-001, AI-002, AI-003, AI-006, ENC-003 |
| **Low** | Operational hygiene; unlikely to be directly exploitable | LOG-004, PAT-001, VUL-001, MAL-001, IDPR-001, IDPR-002, IDPV-001, IDBR-001, CDS-001, RES-001, STORE-001, STORE-002 |

> When two findings share a tier, order them by specificity: a finding with concrete exploit evidence (e.g., JWT signature validation disabled) ranks above a finding that is an absence of a control (e.g., missing security header).

# Severity Escalation Rules

The tier table above is the **baseline**. Specific runtime contexts ESCALATE severity. Apply these escalations BEFORE writing the finding's `severity` field:

| Trigger | Action |
|---|---|
| **Multi-tenant OIDC misconfiguration**: `MICROSOFT_TENANT_ID === 'common'` OR `tid` claim not validated against the configured tenant | Escalate **IDPV-001** / **AUTH-002** by +2 tiers (Low becomes High, Medium becomes Critical). Rationale: any Microsoft account in the world can authenticate; this is a remotely exploitable account-takeover primitive, not "operational hygiene". |
| **Social / consumer IdP wired to an organizational service**: Google/Facebook/GitHub OAuth on an app that processes Protected B data, or any IdP outside the approved list in `cas-rule-definitions.md` § Approved Identity Providers | Escalate **IDPV-001** by +2 tiers (Low becomes High, pair with Protected B data classification becomes Critical). Rationale: violates the "approved IdP only" MUST in IDPV-001; any account in that provider can register and access org data. |
| **Role hierarchy mismatch**: middleware `authorize()` allows roles that the DB `CHECK` constraint or migration doesn't permit (e.g., code has 6 roles, DB has `'user'|'admin'` only) | Escalate **AUTHZ-005** to **Critical**. Rationale: silent over-denial or silent privilege escalation depending on which side is more permissive; same finding chain to Protected B reads. |
| **Protected B at rest in unencrypted JSONB / TEXT column**: column-level encryption (pgcrypto, AWS KMS envelope, Azure SQL Always Encrypted) absent on a column that may contain Protected B data per § Data Sensitivity Thresholds | Escalate **ENC-002** / **ENC-003** to **Critical**. Rationale: SQL Server TDE / Postgres TDE alone is insufficient per the data-sensitivity threshold table. |
| **Protected B data flows through an unapproved third-party service**: AI provider, analytics, error-tracking that egresses raw Protected B to non-organizational tenants | Escalate the relevant **AI-001** / **SEC-005** by +1 tier and surface as a kill-chain candidate. |
| **Auth-lifecycle endpoint without standard middleware**: login, refresh, logout, callback missing `authenticate` + `csrf` + `authRateLimiter` per the canonical chain | Escalate to **High** (or Critical if it bypasses CSRF on a refresh that mints long-lived tokens). |

These escalations apply REGARDLESS of where the rule sits in the baseline tier table. Document the escalation reason in the finding's `notes` field (e.g., `"tier raised: previous=Low, elevated_to=Critical, per Severity Escalation Rules: IDPV-001 with social IdP on Protected B app"`).

# SHOULD Rule Applicability Guide
Rules with `SHOULD` severity are conditionally applicable. AI agents assessing compliance MUST evaluate the applicability triggers below before rendering a verdict. If triggers cannot be evaluated, use the Default Disposition.

| Rule ID | Applicability Triggers (search for these in code/config) | Default If Unknown |
|---------|----------------------------------------------------------|--------------------|
| BOT-001 | Financial transactions: payment processing, money transfers, billing, invoicing. Sensitive data entry forms: health records, SIN/SSN, banking details. High-value account operations: bulk approvals, benefit disbursements. **Search for**: `payment`, `billing`, `invoice`, `transfer`, `disburs`, `SIN`, `health`, `financial`, currency symbols in forms, Stripe/payment SDK imports, API calls to Bambora | NOT APPLICABLE |
| MFA-002 | Public-facing authentication where users access Protected B data (health, financial, legal). Self-service portals for sensitive government services. **Search for**: `Protected B` classification in docs, health/financial/legal data models, public user registration flows accessing sensitive tables | REVIEW RECOMMENDED |
| AUTHZ-004 | Administrative/security function apps with privileged and non-privileged user roles. **Search for**: admin controllers, security settings endpoints, role management, `[Authorize(Roles="Admin")]`, privilege elevation endpoints, role-switching logic | REVIEW RECOMMENDED |

## SHOULD Sub-requirements Within MUST Rules
The following MUST rules contain individual sub-requirements at SHOULD level. These should be assessed separately from the MUST requirements in the same rule.

| Parent Rule | SHOULD Sub-requirement | Applicability Triggers | Default If Unknown |
|-------------|----------------------|------------------------|-------------------|
| CSP-001 | `default-src` SHOULD be `'self'` | All web apps (always applicable unless third-party CDN resources are required) | REVIEW RECOMMENDED |
| SESSION-001 | Session tokens SHOULD be stored in httpOnly, Secure, SameSite cookies rather than localStorage | All web apps with authentication (always applicable unless constrained by SPA framework) | REVIEW RECOMMENDED |
| RATE-001 | API endpoints SHOULD enforce per-user rate limits | All public-facing APIs (always applicable for authenticated endpoints) | REVIEW RECOMMENDED |
| AI-003 | Per-user or per-project quotas SHOULD be implemented | All apps calling paid LLM APIs (always applicable when multiple users share API access) | REVIEW RECOMMENDED |
| AUTHZ-003 | No single role SHOULD combine data modification with audit log access | All apps with administrative functions (always applicable when both data modification and audit log access roles exist) | REVIEW RECOMMENDED |

# Application Map: Shared Discovery Input

Before populating the Application Profile or verifying any CAS rule, check for a pre-built application map from `skills/01-application-map.md`:

## Application Map Staleness Check

1. Check whether `.ai/blueteam/data/application_map.json` exists.
   - **If it does not exist**: Run `skills/01-application-map.md` (located in the same directory as this skill file) before proceeding. Do not infer tech stack or deployment context from code independently; the application map provides this consistently across all assessment skills.
2. If the file exists, run `git rev-parse HEAD` and compare to `generated_at_commit`.
   - **Matching**: Map is fresh. Extract fields per the table below and proceed directly to Section 1.
   - **Different**: Map is stale. Run `skills/01-application-map.md` to regenerate, then proceed.
   - **`generated_at_commit` is null**: Compare dates. Same day, use as fresh. Different day, regenerate.

## Using an Existing Application Map

Read `.ai/blueteam/data/application_map.json` and pre-populate the following before beginning rule-by-rule assessment:

| Map Field | CAS Use |
|---|---|
| `tech_stack.primary_language` + `frameworks` | Section 1 Application Profile: Type field |
| `tech_stack.deployment_target_inferred` | Determines which organizational environment assumptions apply (cloud_lz vs. on_premises vs. unknown) |
| `tech_stack.has_file_uploads` | Triggers UPLOAD-001 and UPLOAD-002 assessment |
| `tech_stack.has_ai_llm_features` + `ai_llm_details` | Triggers AI-001 through AI-006 assessment |
| `identity_providers[]` | Pre-populates AUTH-001/002/003 identity provider check; verify actual IdP config against approved list |
| `auth_mechanisms[]` | Pre-populates SEC-003 JWT validation check; `signature_verified: false` is a pre-confirmed NON-COMPLIANT finding |
| `endpoints[].auth_level: 'unauthenticated'` | Pre-confirmed AUTH-001/004 candidates for unauthenticated endpoints; verify intentional vs. missing auth |
| `endpoints[].auth_first_in_chain: false` | Pre-confirmed AUTHZ-002 NON-COMPLIANT finding (auth middleware ordering violation) |
| `endpoints[].uses_elevated_credentials: true` | Pre-confirmed Critical finding (unauthenticated endpoint using elevated/service credentials) |
| `critical_files` | Directs rule verification to the correct files without re-scanning the codebase |
| `secrets_findings[].location: 'current_head'` | Pre-confirmed SEC-001/002/004 NON-COMPLIANT findings; treat each as a confirmed finding |
| `gitignore_gaps[].any_committed: true` | Pre-confirmed SEC-004 NON-COMPLIANT finding (committed sensitive file) |
| `tech_stack.deployment_manifests_found` | Section 1 Application Profile: Deployment Target field; base for infrastructure-level verification |

---

# Assessment Output Template
AI agents performing compliance assessments MUST structure their output using the sections below to keep assessments consistent / comparable / actionable across projects.

Save as: `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md` (and `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.html`)

After writing the `.md`, generate the corresponding `.html` by running `generate_report_html.js` (see **HTML Report Generation** at the end of this skill file).

> **Compliance Status Banner:** To add a status banner at the top of `cybersecurity_architecture_standard_compliance.html`, insert the banner HTML directly into the `.md` file as a raw HTML block before the Executive Summary section, using the `.status-banner` CSS classes from `shared/schemas/html-report-template.md`.
>
> | Condition | Verdict | Banner CSS | Icon |
> |---|---|---|---|
> | Run + 0 findings | Compliant | `sb-pass` | `&#10003;` |
> | Max priority = medium or low only | Conditionally Compliant | `sb-medium` | `&#9679;` |
> | Any critical or high-priority finding | Non-Compliant | `sb-critical` | `&#9888;` |
>
> **Banner HTML (render the one matching state):**
>
> ```html
> <!-- Non-Compliant -->
> <div class="status-banner sb-critical">
>   <div class="sb-icon">&#9888;</div>
>   <div class="sb-body">
>     <div class="sb-title">Non-Compliant</div>
>     <div class="sb-detail">[APPLICATION_NAME] does not meet Cybersecurity Architecture Standards. [N critical] critical and [N high] high-severity non-conformance(s) must be remediated before this application meets CAS requirements.</div>
>   </div>
> </div>
>
> <!-- Conditionally Compliant -->
> <div class="status-banner sb-medium">
>   <div class="sb-icon">&#9679;</div>
>   <div class="sb-body">
>     <div class="sb-title">Conditionally Compliant</div>
>     <div class="sb-detail">[APPLICATION_NAME] meets the CAS baseline with [N] minor gap(s). No critical or high-severity non-conformances identified. Compliance is conditional on addressing the medium and low findings in this report.</div>
>   </div>
> </div>
>
> <!-- Compliant -->
> <div class="status-banner sb-pass">
>   <div class="sb-icon">&#10003;</div>
>   <div class="sb-body">
>     <div class="sb-title">Compliant</div>
>     <div class="sb-detail">[APPLICATION_NAME] meets all assessed Cybersecurity Architecture Standards requirements. No architecture non-conformances were identified.</div>
>   </div>
> </div>
> ```

## Required Sections

### 1. Application Profile
Summarise the application's security-relevant characteristics so readers can interpret findings without reading source code.

| Field | Description |
|-------|-------------|
| **Type** | e.g., .NET 9 Web API, Node.js SPA + API, Python Flask monolith |
| **Purpose** | One-sentence description of what the application does |
| **Authentication Model** | e.g., JWT Bearer via KeyCloak (OIDC), cookie-based via Entra ID |
| **Authorization Model** | e.g., RBAC with `DMS_USER` role, ABAC via OPA |
| **Identity Provider(s)** | e.g., KeyCloak at `idpdev.example.com`, MS Entra ID |
| **User Types** | e.g., organizational staff, public citizens, service accounts, partners |
| **Data Classification** | e.g., Protected B (health), Protected B (financial), unclassified |
| **Database / Storage** | e.g., Azure SQL, PostgreSQL, none (stateless) |
| **File Uploads** | Yes/No (if Yes, describe mechanism: IFormFile, base64 payload, etc.) |
| **AI / LLM Features** | Yes/No (if Yes, describe: Azure OpenAI chat, code generation, etc.) |
| **Deployment Target** | e.g., organizational Azure Landing Zone, on-premises IIS, unknown |

> **Before reviewing findings:** See **Section 9 (Environment Assumptions)** for the infrastructure controls assumed during this assessment. These assumptions affect several compliance verdicts. Infrastructure-level controls listed as `ASSUMED COMPLIANT (Environment Baseline)` have not been independently verified from source code and require validation by your operations team before those items can be formally closed.

### 2. NON-COMPLIANT Findings (Mandatory MUST Failures)
List every NON-COMPLIANT finding. Each finding MUST include:
- **Rule ID** and **Risk Tier** (from MUST Rule Risk Tiers table)
- **ATT&CK Tactic:** TA#### - [Tactic Name] (use the CAS to ATT&CK mapping table in Section 8)
- **File path and line number** where the violation occurs
- **Evidence**: the specific code, configuration, or absence that constitutes non-compliance. Code Evidence MUST use `file:line` references (e.g., `apps/api/src/app.ts:181`) rather than inline code block quotations unless the exact code text is required for establishing non-compliance. Evidence + Description combined MUST NOT exceed 100 words per NON-COMPLIANT finding. **NEVER include actual secret values** (passwords, tokens, API keys, connection strings with credentials); replace any literal value with `[REDACTED]` and cite the file path + line number instead.
- **Declared compensating control (Layer 3, if controls.yaml present):** After the Evidence line, check the Active Controls List against the mapping table in `shared/schemas/controls-yaml.md`. For each matching control, add a bold inline line: `**Declared compensating control:** [detail string]. Verify this mitigates the specific risk before accepting as mitigated.` Omit entirely if no controls match.
- **baseline context (Layer 4):** After any Layer 3 line, check the Layer 4 hints table in `shared/schemas/controls-yaml.md`. If the finding type and deployment target match, add: `**baseline context:** [hint text]` Omit entirely if no hints apply.
- **Remediation**: concise description of what must change, ending with a one-line reference: `**Change ID:** CC-NNN, see \`.ai/blueteam/data/code_changes.json\`` (CC-NNN IDs are allocated during Phase 8 and backfilled here)
- **Verification Test**: one actionable command template (for example `curl`) using placeholders only (`${BASE_URL}`, `${TOKEN_USER}`, `${TOKEN_ADMIN}`), plus expected vulnerable result, expected mitigated result, and evidence to capture. Mark safety as `SAFE-READONLY`, `SAFE-AUTHZ`, or `DESTRUCTIVE`.

Order findings by risk tier (Critical, then High, then Medium, then Low). Within the same tier, order by specificity (concrete exploit evidence before absence of a control).

**Pattern completeness (required before filing any pattern-based finding):** When a NON-COMPLIANT finding was identified by searching for a specific substring, code pattern, or middleware construct (e.g., a CSRF bypass via `path.includes(...)`, an auth bypass via an environment variable gate, a missing security header), perform these two checks before filing the finding:
1. **Within-repo sweep**: Search **all middleware files of the same type** (all CSRF middleware, all auth middleware, all rate-limiting middleware) for the same pattern. Use `critical_files.authentication`, `critical_files.authorization`, and related categories from the application map as the file list. File a separate NON-COMPLIANT finding for each additional instance found; do not combine them into a single finding.
2. **Cross-repo flag**: If this assessment session covers multiple repositories (e.g., a public portal and a staff portal in separate monorepos), note in the finding description that the pattern must also be verified in each sibling repository. Set `scope_check.sibling_apps_check: true` in the corresponding CC entry so that any implementing agent knows to check all repositories before marking the fix complete.

### 3. COMPLIANT Findings
List every rule assessed as COMPLIANT with a brief evidence summary (rule ID, one-line evidence). Present as a table.

### 4. NOT APPLICABLE Findings
List rules that do not apply with the justification for each (e.g., "No public/external users; internal API only"). Present as a table.

### 5. NOT VERIFIABLE Findings (Infrastructure)
List rules that cannot be verified from code/configuration alone. For each, state **what would need to be checked** and **where** (e.g., "Confirm TLS 1.2+ at load balancer; check Azure Front Door TLS settings"). Present as a table.

### 6. REVIEW RECOMMENDED (SHOULD Sub-requirements)
List SHOULD-level items that are not implemented or could not be confirmed. Present as a table.

### 7. Summary and Prioritised Remediation
- **Summary table**: Counts of each verdict type (NON-COMPLIANT, COMPLIANT, NOT APPLICABLE, NOT VERIFIABLE, REVIEW RECOMMENDED, ASSUMED COMPLIANT (Environment Baseline)).
- **Prioritised remediation list**: Numbered list of NON-COMPLIANT findings ordered by risk tier, with a short action statement for each (e.g., "P0, SEC-003: Re-enable JWT signature validation"). Each item MUST include an SR-NNN reference and, where the finding participates in a kill chain, a KC-NNN cross-reference: `**SR-NNN**: [action statement] *(breaks KC-NNN)*`. SR-NNN IDs are allocated during Phase 8 and backfilled here.

### 9. organizational Environment Assumptions

**Required**: include this section in every assessment report. List every organizational environment assumption applied during this assessment. This section is cross-referenced from Section 1 (Application Profile); readers should review it before interpreting compliance verdicts.

**Deployment target:** [Cloud LZ | On-Premises DC | Unknown, not determinable from inputs]
**Public-facing:** [Yes | No | Unknown]
**Baseline version:** shared/reference/environment-baseline.md v[version]

| ID | Assumption | CAS Rule(s) | Verdict Applied | Validation Required |
|----|-----------|-------------|----------------|-------------------|
| ASMP-001 | [e.g., "Cloudflare WAF assumed for public-facing organizational app"] | WAF-001 | ASSUMED COMPLIANT (Environment Baseline) | [e.g., "Confirm Cloudflare in DNS path for this app"] |
| ASMP-002 | [e.g., "MS Defender assumed on all servers"] | MAL-001 | ASSUMED COMPLIANT (Environment Baseline) | [e.g., "Verify in endpoint management console"] |

**Conflicts detected with standard assumptions:**
[List any repository evidence that conflicts with a standard assumption, or "None detected"]

> **Note for reviewers:** ASSUMED COMPLIANT verdicts require validation before the compliance assessment can be closed. Each row in this table represents a control assumed to be present at the infrastructure level but not independently verified from source code; confirm with your operations team before formally closing these items.

#### Declared Controls (application team input via `.ai/controls.yaml`)

If `.ai/controls.yaml` is present, list declared controls in this table. If no controls were declared, omit this subsection.

| Control Key | Detail (from controls.yaml) | Findings Annotated |
|-------------|----------------------------|--------------------|
| [key] | [detail string] | [rule IDs where this annotation was applied, e.g., RATE-001, AUTH-001] |

---

### 8. Attack Chain Analysis (MITRE ATT&CK)

Synthesize NON-COMPLIANT findings into complete attacker kill chains. **Required when 2 or more NON-COMPLIANT findings exist.** Kill chains reveal compounded risk that per-finding risk tier assessment does not capture; two High findings that chain together can produce a Critical-severity breach path.

#### CAS Rule to ATT&CK Tactic Quick Reference

Read **Sections 1, 3, and 4** of `shared/reference/attack-chain-reference.md` (located in the same directory as this skill file; see its Section Loading Guide for instructions on reading only specific sections). Use **Section 3: CAS Rule to ATT&CK Tactic Mapping** to assign ATT&CK tactics to NON-COMPLIANT findings. Consult **Section 1** for tactic descriptions. Check **Section 4: Common Kill Chain Patterns** when constructing chains. Do NOT load Sections 2 (ASVS-only), 5 (chain construction standards are defined inline in this skill), or 6 (threat model only).

#### Kill Chain Construction Requirements

1. **Assign ATT&CK tactic to each NON-COMPLIANT finding**: Use the quick reference table above. Record the tactic in the Section 2 finding block. Where a finding spans multiple tactics, record the earliest kill chain stage.

2. **Identify complete kill chains**: A complete kill chain begins at **Reconnaissance** (TA0043) or **Initial Access** (TA0001) and terminates at **Collection/Exfiltration** (TA0009/TA0010) or **Impact** (TA0040). Identify combinations of NON-COMPLIANT findings that, if exploited in sequence, enable an attacker to reach Protected B data or cause operational impact. Assign each chain a **Chain ID** (KC-001, KC-002, ...).

3. **Document 2-4 kill chains**:

   #### KC-NNN: [Chain Name, e.g., "Credential Brute Force, then Bulk PHN Extraction"]

   **Chain Severity:** [Combined severity (may exceed any individual finding's risk tier)]
   **Attacker Type:** [e.g., Cybercriminal with purchased credential lists and automated tooling]
   **AI-enabled variant:** [e.g., LLM-assisted enumeration accelerates Step 1; or N/A]

   | Step | Attacker Action | CAS Finding | ATT&CK Tactic |
   |------|----------------|-------------|---------------|
   | 1 | [e.g., "Enumerate valid usernames via differential error responses"] | HDR-001 | TA0043 Reconnaissance |
   | 2 | [e.g., "Brute-force credentials against login endpoint (no rate limit)"] | RATE-001 | TA0006 Credential Access |
   | 3 | [e.g., "Access PHN records via BOLA (no row-level authorization checks)"] | AUTHZ-001 | TA0009 Collection |
   | 4 | [e.g., "Bulk-export unredacted records; unencrypted PHN readable in response"] | ENC-002 | TA0010 Exfiltration |

   **Chain-Breaking Fix:** [The single CAS rule remediation that most effectively disrupts this chain, e.g., "Enforce authentication on all public endpoints (AUTH-001 remediation) removes Step 2 and all downstream steps"]

4. **Cross-reference to Section 7**: In the Section 7 Prioritised Remediation list, annotate each item that is a chain-breaking fix with the KC-NNN reference (e.g., `*(breaks KC-001, KC-003)*`).

5. **Document untestable chain segments**: If key NON-COMPLIANT findings are NOT VERIFIABLE (infrastructure-level), note which kill chains cannot be fully traced from code review alone, and what infrastructure checks would complete the chain analysis.

## Rule Specifications

> Rule specifications are in `shared/reference/cas-rule-definitions.md`. Load that file for the full rule text, compliant implementation patterns, organization-specific requirements, applicability scope rules, and ITSG-33 mappings for all CAS rules (AUTH-001 through AI-006).

> The domains covered in `shared/reference/cas-rule-definitions.md` are: Authentication (AUTH-001..004, MFA-001..002), Identity Protocol & Provider Management (IDPR-001..002, IDPV-001, IDBR-001), Authorization (AUTHZ-001..006), Network & Perimeter Security (BOT-001, FW-001..002, CDN-001, WAF-001, CORS-001, RATE-001), Secrets & Encryption (SEC-001..005, ENC-001..003), Logging Monitoring & Vulnerability Management (LOG-001..010 with sub-requirements, MAL-001, PAT-001, VUL-001), Cloud & Data Security (RES-001, CDS-001, STORE-001..002), Web Application Security (WEB-001, CSP-001, HDR-001, PWD-001, SESSION-001..002, UPLOAD-001..002), Account Lifecycle (ACCT-001), AI Agent Security (AI-001..006).

---

## Phase 8: Extract to .ai/ Artifacts

**This phase MUST run after the full compliance assessment report (`.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md`) has been written**, including all NON-COMPLIANT findings and the Section 7 Prioritised Remediation list.

This phase extracts machine-readable artifacts into the `.ai/` folder so that downstream AI coding agents and requirements injection agents can consume the findings without re-parsing prose. **Load `shared/schemas/artifacts.md` now** (§ "Extraction Phase Instructions": the 13-step process). Follow that process exactly, using the source material and naming conventions below.

### Source Material for This Skill

**For code changes (Steps 2-5):** Extract from each NON-COMPLIANT finding's Remediation block in `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md` (Section 2). Each NON-COMPLIANT finding that includes a code or configuration fix produces one candidate CC entry. The `sources[].assessment` value is `cybersecurity_architecture_standard_compliance` and the `sources[].finding_id` is the CAS rule ID (e.g., `AUTH-001`).

**For security requirements (Steps 6-9):** Extract from each item in the Section 7 Prioritised Remediation list of `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md`. Each numbered remediation item produces one candidate SR entry. The `sources[].assessment` value is `cybersecurity_architecture_standard_compliance` and the `sources[].finding_id` is the CAS rule ID (e.g., `AUTH-001`).

**For verification tests (Step 9b):** Extract one verification entry per active NON-COMPLIANT finding from Section 2. Use the CAS rule ID (for example `AUTH-001`) as `finding_id`, set `assessment` to `cybersecurity_architecture_standard_compliance`, and include placeholder-only command templates with vulnerable/mitigated expectations.

### Post-Extraction: Backfill CC-NNN and SR-NNN References

After completing the 13 steps:
1. Return to `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md` Section 2 and update each NON-COMPLIANT finding's Remediation block: replace the placeholder `CC-NNN` in the `**Change ID:** CC-NNN, see \`.ai/blueteam/data/code_changes.json\`` line with the actual allocated ID.
2. Update Section 7 Prioritised Remediation: replace each placeholder `SR-NNN` with the actual allocated ID.

### Step 12: Write environment_assumptions.json

Write `.ai/blueteam/data/environment_assumptions.json` using the schema defined in `shared/schemas/artifacts.md`. Record every organizational environment assumption applied during this assessment (from Section 9 of the compliance report), the deployment target determined, and whether any conflicts were detected. If the file already exists (from a prior assessment run), merge in assumptions from this run (avoid duplicating identical entries; update `assessments_applied[]` to include this run).

### Step 13: Risk Acceptance Processing

Follow **Step 13** of `shared/schemas/artifacts.md` (§ "Extraction Phase Instructions") exactly. This step loads the risk register (if present), performs CODEOWNERS governance detection, moves accepted findings to the report appendix, runs orphan detection in both directions, and writes/updates `.ai/blueteam/reports/risk_register.md`, `.ai/blueteam/reports/risk_register.html`, and `SECURITY_RISK_REGISTER.md` (repo root stub).

If `.ai/blueteam/data/risk_acceptances.json` does not exist, skip Step 13 with a note in the completion report.

### Completion Report

After all steps, output a brief summary:
```
## Phase 8 Artifact Extraction Complete
- Code changes: [N] new entries created, [N] duplicates merged. Total [N] in .ai/blueteam/data/code_changes.json
- Security requirements: [N] new entries created, [N] duplicates merged. Total [N] in .ai/blueteam/data/security_requirements.json
- Verification tests: [N] new entries created, [N] duplicates merged. Total [N] in .ai/blueteam/data/verification_tests.json
- Environment assumptions: [N] assumptions written to .ai/blueteam/data/environment_assumptions.json
- .ai/blueteam/reports/code_changes.md: [regenerated | skipped, no new entries]
- .ai/blueteam/reports/code_changes.html: [regenerated | skipped, no new entries]
- .ai/blueteam/reports/security_requirements.md: [regenerated | skipped, no new entries]
- .ai/blueteam/reports/security_requirements.html: [regenerated | skipped, no new entries]
- Risk acceptances: [N active, N pending, N expired | skipped, no risk_acceptances.json]
- Acceptance anomalies: [N UNAUTHORIZED_SUPPRESSION, N STALE_REGISTER_ENTRY, N EXPIRED | none]
- .ai/blueteam/reports/risk_register.md: [regenerated | skipped]
```


---

## HTML Report Generation

All `.html` report files are generated by the `generate_report_html.js` script located in the `scripts/` directory of the BlueTeam skills repository, so do **not** generate HTML manually; run the script instead.

### Setup (one-time)

```bash
npm install  # dependencies defined in package.json
```

### Usage

```bash
# Convert a specific report:
node <BlueTeam>/scripts/generate_report_html.js --file .ai/blueteam/reports/<report-name>.md

# Convert all reports in .ai/blueteam/reports/ at once:
node <BlueTeam>/scripts/generate_report_html.js --repo-root /path/to/repo
```

Replace `<BlueTeam>` with the path to the BlueTeam skills directory. Run commands from the target repository root, or pass `--repo-root` explicitly.

**Optional Mermaid diagram rendering:**
```bash
npm install -g @mermaid-js/mermaid-cli
```
If `mmdc` is installed, diagrams are rendered as inline SVG. Otherwise a styled fallback box is shown.

---

## Completion Checklist

Before declaring this skill execution complete, verify every item below. Do not mark the skill done if any required output is missing; generate it first.

### Prerequisite artifacts (verified present, NOT written by this skill)

- [ ] `.ai/blueteam/data/security-classification.yaml`: verified present with canonical schema (`application:` key, `details_file:` key); written by `skills/02-security-classification.md`. If absent or has wrong schema, STOP. Run that skill first.
- [ ] `.ai/blueteam/data/security-classification-details.yaml`: verified present; written by `skills/02-security-classification.md`. If absent, STOP. Run that skill first.
- [ ] `.ai/blueteam/data/application_map.json`: verified present and fresh (staleness check performed per Application Map Staleness Check section).

### Outputs written by this skill

- [ ] `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md`: written in Phase 8
- [ ] `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.html`: generated by `generate_report_html.js`
- [ ] `.ai/blueteam/data/code_changes.json`: updated in Phase 8 (new CC entries merged)
- [ ] `.ai/blueteam/data/security_requirements.json`: updated in Phase 8 (new SR entries merged)
- [ ] `.ai/blueteam/data/verification_tests.json`: updated in Phase 8
- [ ] `.ai/blueteam/data/environment_assumptions.json`: updated in Phase 8

### Internal consistency checks (verify before finalising)

- [ ] **Section 18 ↔ Executive Summary**: Count each verdict type in the Section 18 table and confirm the totals match the Executive Summary verdict table exactly.  Common discrepancy causes:
  - A rule listed with a qualified verdict (e.g., `COMPLIANT (auth-api)`) may be categorised differently in the executive summary; standardise to the canonical verdict (e.g., `PARTIAL COMPLIANT`) so badge injection and the summary count agree.
  - A combined row (e.g., `AI-001..AI-006`) covers multiple rules but produces only one badge; either split it into one row per rule or adjust the executive summary count to match the row count.
- [ ] **Section 18 ↔ Section 2 body**: Every `NON-COMPLIANT` row in Section 18 must correspond to a finding in Section 2.  Count the findings in Section 2 and verify it equals the `NON-COMPLIANT` total in Section 7.  If a rule has two distinct findings at different severities (e.g., CAS-008 Medium and CAS-009 Low both under WEB-001), use separate rows `RULE-001` and `RULE-001b`. **never collapse two findings into one row with `-` priority**, as that hides the lower-severity finding from the chip bar.
- [ ] **Section 18 ↔ Section 3 body**: Every `COMPLIANT` row in Section 18 must appear in Section 3.  Items in Section 3 with `ASSUMED COMPLIANT` evidence text must appear in Section 18 as `ASSUMED COMPLIANT`, not `COMPLIANT`.  Items listed in Section 3 that have a `NON-COMPLIANT` verdict in Section 18 are an error; remove them from Section 3.  Items `COMPLIANT` in Section 18 but missing in Section 3 must be added to Section 3 with supporting evidence.
- [ ] **chip-source annotation**: `<!-- chip-source -->` is placed immediately before the `## 18.` section heading in `cybersecurity_architecture_standard_compliance.md`.  The HTML generator finds the next `<table>` after the comment, even when a heading is interposed; the comment does **not** need to be on the line directly before the table itself.
- [ ] **Chip bar sanity**: After regenerating the HTML, verify the chip bar counts (Verdicts and Risk level groups) match the Section 18 row counts.  If they differ, re-check for unresolved verdict text that was not converted to a badge (e.g., a verdict cell containing plain text instead of a standard verdict keyword).
- [ ] **PARTIAL COMPLIANT Priority column**: Rows with a `PARTIAL COMPLIANT` verdict must have `-` in the Priority (Risk) column, not a risk level keyword.  The Priority column is intended only for `NON-COMPLIANT` rows; a risk keyword in a PARTIAL COMPLIANT row will produce a spurious risk-level chip in the chip bar.

### Verification command

Run the following at the repository root to confirm no files are missing:

```bash
node <BlueTeam>/scripts/validate_reports.js --repo-root /path/to/repo
```

If `validate_reports.js` reports missing files, generate them before exiting.
