---
title: "AI Artifacts Schema: Machine-Readable Security Artifacts"
description: Canonical JSON schemas for .ai/blueteam/data/code_changes.json, security_requirements.json, verification_tests.json, and environment_assumptions.json. All security skills MUST reference this file before writing to those artifacts.
version: 1.2.0
status: active
---

## Purpose

This document defines the canonical schemas for the machine-readable artifact files that security assessment skills write into the project's `.ai/` folder:

- `.ai/blueteam/data/code_changes.json`: Code-level fixes required to remediate security findings
- `.ai/blueteam/data/security_requirements.json`: Normative security requirements derived from assessment findings
- `.ai/blueteam/data/verification_tests.json`: Actionable verification commands (for example curl/HTTPie) that validate whether a finding is exploitable and whether mitigation is effective
- `.ai/blueteam/data/environment_assumptions.json`: organizational environment baseline assumptions applied during assessment
- `.ai/blueteam/data/dr_resilience_assessment.json`: DR/BCP resilience scorecard / gaps / recommendations
- `.ai/blueteam/data/app_cloud_environment.json`: Optional in-repo declaration of external cloud properties and DR-relevant configuration
- `.ai/blueteam/data/app_topology.json`: Application architecture topology (zones, components, connections) for DFD rendering in `security_overview.html`; written by `skills/01-application-map.md`

These files serve downstream AI coding agents and requirements injection agents. They are distinct from the human-readable assessment reports (`.ai/blueteam/reports/threat_model.md`, `.ai/blueteam/reports/asvs_level2_security_assessment.md`, `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md`), which remain as evidence documents.

> **Secret Handling Policy: applies to all artifact files and reports:** NEVER write actual secret values (passwords, tokens, API keys, connection strings with embedded credentials) into any `.ai/blueteam/data/*.json`, `.ai/blueteam/data/*.yaml`, or `.ai/blueteam/reports/*.md` file. When a finding involves a hardcoded secret, record the **file path + line number** and use `[REDACTED]` as a placeholder for the literal value in all fields (`description`, `current_code_summary`, `attacker_action`, `acceptance_criteria`, `evidence`, code snippets, etc.). The actual secret value must exist only in the source repository file: not in any assessment artifact or report.

**Related sub-files (load only what you need):**

| Sub-file | When to load |
|---|---|
| `shared/schemas/application-map.md` | Only when generating or reading `.ai/blueteam/data/application_map.json` |
| `shared/schemas/kill-chains.md` | Only when generating or reading `.ai/blueteam/data/kill_chains.json` |
| `shared/schemas/html-report-template.md` | Whenever generating `.html` report files alongside `.md` files |

**Developer reference:**

| File | Purpose |
|---|---|
| `RISK_ACCEPTANCE_GUIDE.md` | Developer and security-staff guide to risk acceptance: how to add inline markers, write register entries, and understand governance badges. Can be provisioned to any assessed repository. |

---

## Schema: `.ai/blueteam/data/code_changes.json`

```json
{
  "schema_version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "generated_by_assessments": ["assessment-name-without-extension"],
  "changes": [
    {
      "id": "CC-NNN",
      "title": "Short imperative description (verb + object)",
      "priority": "critical | high | medium | low",
      "file_path": "relative/path/from/repo/root.ts",
      "line_reference": "118 or 162-177",
      "change_type": "fix | add | remove | refactor",
      "description": "What must change, why it matters, and the consequence of not fixing: 2-3 sentences",
      "current_code_summary": "Single sentence describing the vulnerable construct, e.g., 'Hard-coded fallback string in session secret initialisation (line 118)'",
      "replacement_code": "The exact replacement code (null when extracted from threat model: ASVS/CAS skills will populate via de-duplication merge)",
      "sources": [
        { "assessment": "report-filename-without-extension", "finding_id": "FINDING-NNN or CAS-NNN or T-NNN" }
      ],
      "cas_rules": ["AUTH-001"],
      "asvs_requirements": ["V2.2.1"],
      "related_requirement_ids": ["SR-NNN"],
      "callsite_impact": {
        "function_name": "clearTokenCache",
        "change_description": "Return type is now Promise<void> (previously void): all callers must add await",
        "callsite_search_pattern": "clearTokenCache(",
        "scope": "all: production code and test files"
      },
      "scope_check": {
        "description": "Verify this guard is applied to all write paths to the same data store",
        "additional_paths_to_verify": ["saveDraft in applicant.repository.ts"],
        "sibling_apps_check": false
      }
    }
  ]
}
```

> **Schema note on `status`**: Entries are implicitly `pending` until a downstream agent explicitly updates them. Omit `status` from JSON output.

### Field Definitions: Code Changes

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Sequential identifier: `CC-001`, `CC-002`, etc. Preserve existing IDs on merge. |
| `title` | Yes | Imperative verb phrase (e.g., "Remove unconditional mock-login route registration"). Max 80 chars. |
| `priority` | Yes | `critical` / `high` / `medium` / `low`: derived from the highest severity source finding. **MUST be one of these four lowercase strings exactly. organizational P-scale values (P0, P1, P2, P3) are NOT valid and will cause the overview report to misrender.** |
| `file_path` | Yes | Path relative to repo root using forward slashes. For new files, the intended path. |
| `line_reference` | Yes | Line number (e.g., `118`) or range (e.g., `162-177`). `null` for whole-file changes. |
| `change_type` | Yes | `fix` (correct existing code), `add` (new code), `remove` (delete code), `refactor` (restructure without behavior change) |
| `description` | Yes | What must change, why it matters, and the consequence of not fixing: 2-3 sentences. No inline code blocks. |
| `current_code_summary` | Yes | Single sentence describing the vulnerable construct. E.g., "Hard-coded fallback string in session secret initialisation (line 118)". `null` for pure additions. |
| `replacement_code` | Yes | The exact replacement code. For additions, the full block to insert. Set to `null` when extracted from the threat model: ASVS/CAS skills populate this via de-duplication merge. |
| `sources` | Yes | Array of `{ assessment, finding_id }` objects tracing this change back to specific findings. |
| `cas_rules` | Yes | CAS rule IDs this change addresses. Empty array if none. |
| `asvs_requirements` | Yes | ASVS requirement IDs (e.g., `V2.2.1`). Empty array if none. |
| `related_requirement_ids` | Yes | SR-NNN IDs from `.ai/blueteam/data/security_requirements.json` that this change satisfies. Empty array on creation; populated during merge. |

> **Common field-name errors that break the overview report** (caught by `validate_reports.js`)
>
> | Wrong (do not use) | Correct | Consequence if wrong |
> |---|---|---|
> | `"file"` | `"file_path"` | Quick Ref file column, File Hotspots, and card file reference all show empty |
> | `"line_range"` | `"line_reference"` | Quick Ref line column shows empty |
> | `"change_description"` | `"description"` | Detailed Change card body text is blank |
> | *(field absent)* | `"change_type"` required: one of `fix \| add \| remove \| refactor` | Quick Ref type column and File Hotspot type breakdown show empty |
> | *(field absent)* | `"related_requirement_ids"` required: empty array `[]` is valid | Quick Ref requirements column shows empty; cross-reference links absent |

| `callsite_impact` | No | Present when this change modifies a function or method signature (async conversion, parameter change, return type change). `function_name`: the symbol to search for callers. `change_description`: what every call site must change. `callsite_search_pattern`: the exact string to grep for across the codebase. `scope`: which file groups to search (e.g., `"all: production code and test files"`). Set to `null` when the change has no signature impact on callers. An implementing agent MUST scan all call sites matching `callsite_search_pattern` and update them before marking this change complete. |
| `scope_check` | No | Present when the fix may need to be applied at additional code paths beyond the one identified. `description`: explains what to verify. `additional_paths_to_verify`: list of other functions, files, or paths to check (e.g., a `saveDraft` path alongside a `submitApplication` guard). `sibling_apps_check`: `true` if this pattern was found by grep/substring matching and should also be verified in all other repositories in scope. Set to `null` when the change is self-contained. An implementing agent MUST verify each entry in `additional_paths_to_verify` and check sibling repos when `sibling_apps_check` is `true` before marking this change complete. |

---

## Schema: `.ai/blueteam/data/security_requirements.json`

```json
{
  "schema_version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "generated_by_assessments": ["assessment-name-without-extension"],
  "requirements": [
    {
      "id": "SR-NNN",
      "title": "Short requirement title",
      "priority": "critical | high | medium | low",
      "requirement_text": "The system MUST / SHOULD... [full normative text]",
      "rationale": "Why this requirement is needed",
      "acceptance_criteria": [
        "Verifiable criterion 1 (observable, testable)",
        "Verifiable criterion 2",
        "Verifiable criterion 3"
      ],
      "sources": [
        { "assessment": "report-filename-without-extension", "finding_id": "FINDING-NNN or T-NNN or CAS-NNN" }
      ],
      "related_code_change_ids": ["CC-NNN"]
    }
  ]
}
```

> **Schema note on `acceptance_criteria`**: List exactly 3 acceptance criteria: the minimum set that unambiguously verifies compliance. Do not exceed 3.

### Field Definitions: Security Requirements

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Sequential identifier: `SR-001`, `SR-002`, etc. Preserve existing IDs on merge. |
| `title` | Yes | Noun phrase summarising the control (e.g., "Eliminate mock authentication bypass"). Max 80 chars. |
| `priority` | Yes | `critical` / `high` / `medium` / `low`. **MUST be one of these four lowercase strings exactly. organizational P-scale values (P0, P1, P2, P3) are NOT valid.** |
| `requirement_text` | Yes | Full normative requirement using RFC 2119 keywords (MUST, SHOULD, MAY). One or two sentences. |
| `rationale` | Yes | Why this requirement exists. Cross-reference organizational standards or ASVS where relevant. |
| `acceptance_criteria` | Yes | Exactly 3 testable/observable criteria: the minimum set that unambiguously verifies compliance. Do not exceed 3. |
| `sources` | Yes | Array of `{ assessment, finding_id }` tracing back to source findings. |
| `related_code_change_ids` | Yes | CC-NNN IDs from `.ai/blueteam/data/code_changes.json`. Empty array on creation; populated during merge. **Do NOT use `related_code_changes`: that alias is not read by the overview generator and will silently suppress CC back-links.** |

---

## Schema: `.ai/blueteam/data/verification_tests.json`

This artifact stores machine-readable verification test definitions for findings and kill chains. It is consumed by `generate_report_html.js` for inline, collapsible "Verification Test" blocks in detailed reports. The security overview report reads only summary status counts and does not display raw commands.

```json
{
  "schema_version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "generated_by_assessments": ["assessment-name-without-extension"],
  "tests": [
    {
      "id": "VT-NNN",
      "finding_id": "FINDING-001",
      "assessment": "asvs_level2_security_assessment",
      "title": "Short test title",
      "safety_level": "safe-readonly | safe-authz | destructive",
      "preconditions": [
        "Required auth token available in ${TOKEN_USER}",
        "Target endpoint exists at ${BASE_URL}/api/resource"
      ],
      "command_template": "curl -i -sS -X GET \"${BASE_URL}/api/resource/${TARGET_ID}\" -H \"Authorization: Bearer ${TOKEN_USER}\"",
      "expected_vulnerable_result": "HTTP 200 with data for an unauthorized resource",
      "expected_mitigated_result": "HTTP 403 and no protected data in body",
      "evidence_to_capture": [
        "HTTP status code",
        "Response body field 'ownerId'",
        "WAF/API gateway log event ID"
      ],
      "validation_status": "not-tested | passed | failed | not-applicable",
      "last_validated_at": null,
      "notes": "Optional analyst notes"
    }
  ]
}
```

### Field Definitions: Verification Tests

| Field | Required | Description |
|---|---|---|
| `schema_version` | Yes | Schema version: `"1.0"` |
| `last_updated` | Yes | ISO date of last write |
| `generated_by_assessments` | Yes | Assessment names that contributed tests |
| `tests[].id` | Yes | Sequential identifier: `VT-001`, `VT-002`, etc. |
| `tests[].finding_id` | Yes | Finding/chain identifier this test validates (`T-NNN`, `FINDING-NNN`, `AUTH-NNN`, `KC-NNN`, etc.) |
| `tests[].assessment` | Yes | Source assessment name |
| `tests[].title` | Yes | Short test label |
| `tests[].safety_level` | Yes | `safe-readonly`, `safe-authz`, or `destructive` |
| `tests[].preconditions` | Yes | Runtime assumptions required before running the test |
| `tests[].command_template` | Yes | Actionable command with placeholders only (never embed real secrets) |
| `tests[].expected_vulnerable_result` | Yes | Observable output indicating vulnerability is present |
| `tests[].expected_mitigated_result` | Yes | Observable output indicating mitigation is effective |
| `tests[].evidence_to_capture` | Yes | Evidence list to capture for adjudication |
| `tests[].validation_status` | Yes | `not-tested`, `passed`, `failed`, or `not-applicable` |
| `tests[].last_validated_at` | Yes | ISO date or `null` |
| `tests[].notes` | No | Optional context for reviewers |

### Verification Test Authoring Rules

1. Commands MUST be directly runnable with placeholders (for example `${BASE_URL}`, `${TOKEN_USER}`, `${TOKEN_ADMIN}`) and must not include real secrets or internal hostnames.
2. Use `safe-readonly` by default. Use `safe-authz` for authorization boundary checks. Mark exploitative or state-changing probes as `destructive`.
3. Keep each test focused: one command validates one security claim.
4. For disputed infrastructure controls, include evidence expectations that can confirm control-path enforcement (for example API gateway/WAF deny logs).

---

## Schema: `.ai/blueteam/data/environment_assumptions.json`

```json
{
  "schema_version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "deployment_target": "cloud_lz | on_premises | unknown",
  "public_facing": true,
  "baseline_version": "shared/reference/environment-baseline.md v1.0.0",
  "assessments_applied": ["assessment-name-without-extension"],
  "assumptions": [
    {
      "id": "ASMP-NNN",
      "control": "WAF-001",
      "asvs_requirements": ["V13.6.1"],
      "assumed_state": "Compliant",
      "basis": "Cloudflare assumed for public-facing organizational app per shared/reference/environment-baseline.md: organizational standard for all public-facing applications",
      "verdict_applied": "ASSUMED COMPLIANT (Environment Baseline)",
      "validation_required": "Confirm Cloudflare is in the DNS path for this application; check Cloudflare dashboard or NS records",
      "assessment_source": "cybersecurity_architecture_standard_compliance",
      "conflict_detected": false,
      "conflict_detail": null
    }
  ]
}
```

### Field Definitions: Environment Assumptions

| Field | Required | Description |
|-------|----------|-------------|
| `schema_version` | Yes | Schema version: `"1.0"` |
| `last_updated` | Yes | ISO date of last write |
| `deployment_target` | Yes | `"cloud_lz"`, `"on_premises"`, or `"unknown"` |
| `public_facing` | Yes | `true`, `false`, or `null` (unknown) |
| `baseline_version` | Yes | Version string of `shared/reference/environment-baseline.md` used |
| `assessments_applied` | Yes | List of assessment report names (without `.md` extension) that have written to this file |
| `assumptions[].id` | Yes | Sequential identifier: `ASMP-001`, `ASMP-002`, etc. Preserve existing IDs on merge |
| `assumptions[].control` | Yes | CAS rule ID (e.g., `WAF-001`) or empty string if ASVS-only |
| `assumptions[].asvs_requirements` | Yes | ASVS requirement IDs covered by this assumption. Empty array if CAS-only |
| `assumptions[].assumed_state` | Yes | `"Compliant"`: the assumed compliance state |
| `assumptions[].basis` | Yes | Explanation of why this assumption applies, citing `shared/reference/environment-baseline.md` |
| `assumptions[].verdict_applied` | Yes | The verdict reported in the assessment (e.g., `"ASSUMED COMPLIANT (Environment Baseline)"`) |
| `assumptions[].validation_required` | Yes | Specific action a human reviewer must take to confirm this assumption |
| `assumptions[].assessment_source` | Yes | Assessment report that recorded this assumption |
| `assumptions[].conflict_detected` | Yes | `true` if repository evidence conflicts with this assumption |
| `assumptions[].conflict_detail` | Yes | Description of conflict if `conflict_detected` is true; `null` otherwise |

### Merging environment_assumptions.json

When a new assessment run writes to an existing `environment_assumptions.json`:

1. **Read the existing file** and extract the current `assessments_applied` list and `assumptions[]` array.
2. **Add the current assessment name** to `assessments_applied` if not already present.
3. **Merge assumptions**: An incoming assumption is a **DUPLICATE** if it has the same `control` AND the same `assumed_state`. When a duplicate is detected: update `assessment_source` to the latest assessment; update `conflict_detected` and `conflict_detail` if the new run detected a conflict not found previously. Do NOT create a new entry.
4. **Add new assumptions** (non-duplicates) with the next sequential ASMP-NNN ID.
5. Update `last_updated` to today's date.

---

## Schema: `.ai/blueteam/data/app_cloud_environment.json` (Optional)

This optional file lets teams declare cloud properties and minimal DR-relevant settings that may not exist directly in source code.

`skills/10-dr-resilience.md` reads this artifact and applies partial confidence scoring (`declared`) when direct technical evidence is unavailable.

```json
{
  "schema_version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "application_name": "string",
  "environment_owner": "team-declared",
  "providers": [
    {
      "name": "supabase | render | lovable | azure | aws | gcp | other",
      "role": "hosting | database | cache | queue | storage | auth | other",
      "region": "string | null",
      "plan_tier": "string | null",
      "resilience": {
        "multi_zone": "true | false | unknown",
        "multi_region": "true | false | unknown",
        "automatic_failover": "true | false | unknown"
      },
      "backup": {
        "enabled": "true | false | unknown",
        "frequency": "hourly | daily | weekly | other | unknown",
        "retention_days": "number | null",
        "point_in_time_recovery": "true | false | unknown"
      },
      "dr_targets": {
        "rto_target": "string | null",
        "rpo_target": "string | null"
      },
      "notes": "string | null"
    }
  ]
}
```

### Field Definitions: app_cloud_environment

| Field | Required | Description |
|-------|----------|-------------|
| `schema_version` | Yes | Schema version: `"1.0"` |
| `last_updated` | Yes | ISO date of last write |
| `application_name` | Yes | Human-readable application name |
| `environment_owner` | Yes | Current allowed value: `"team-declared"` |
| `providers[]` | Yes | Cloud properties in use by the app |
| `providers[].name` | Yes | Provider name |
| `providers[].role` | Yes | Functional role used by the app |
| `providers[].region` | No | Region where service is hosted |
| `providers[].plan_tier` | No | Plan/SKU/tier name |
| `providers[].resilience.*` | Yes | Minimal resilience characteristics |
| `providers[].backup.*` | Yes | Minimal backup/restore characteristics |
| `providers[].dr_targets.*` | No | Optional explicit RTO/RPO targets |
| `providers[].notes` | No | Additional context |

Validation rule for DR scoring:
- `app_cloud_environment.json` may grant only partial (`declared`) credit and only when provider usage is independently evidenced in repository artifacts.

---

## Application Map Schema

See `shared/schemas/application-map.md` for the full schema and field definitions for `.ai/blueteam/data/application_map.json`.

---

## Schema: `.ai/blueteam/data/dr_resilience_assessment.json`

This file is written by `skills/10-dr-resilience.md` and consumed by `skills/12-security-overview-report.md`.

```json
{
  "schema_version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "assessment_name": "dr_resilience_analysis",
  "application_name": "string",
  "overall_score": 0,
  "overall_rating": "excellent | good | moderate | poor | critical",
  "overall_risk": "low | medium | high | critical",
  "dimensions": [],
  "rto_rpo": {},
  "gaps": [],
  "recommendations": [],
  "metadata": {}
}
```

`gaps[].severity` must use: `critical`, `high`, `medium`, `low`.

ID format:
- `DRG-NNN` for gaps
- `DRR-NNN` for recommendations

Load `shared/schemas/application-map.md` if your skill generates or reads the application map. Skills that only perform assessments (threat model, ASVS, CAS) do NOT need to load this sub-file: they consume the application map as a pre-existing JSON input and do not write it.

---

## Schema: `.ai/blueteam/data/security_architecture.json`

This file is written by `skills/03-security-architecture.md` and consumed by `skills/12-security-overview-report.md` (Security Architecture tab).

```json
{
  "schema_version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "assessment_name": "security_architecture_design",
  "application_name": "string",
  "mode": "full | describe | design | minimal",
  "profile": "internal | public | dual | custom | unknown",
  "profile_confidence": "high | medium | low",
  "profile_basis": "string",
  "data_classification": "public | protected_a | protected_b | unknown",
  "auth": {},
  "authorization": {},
  "data_protection": {},
  "perimeter": {},
  "logging": {},
  "gaps": []
}
```

`gaps[].severity` must use title case: `Critical`, `High`, `Medium`, `Low`.

ID format:
- `SA-NNN` for architectural gaps

`assessment_name` must be exactly `"security_architecture_design"`: used by `generate_overview_html.js` to load the Security Architecture tab.

---

## Kill Chains Schema

See `shared/schemas/kill-chains.md` for the full schema and field definitions for `.ai/blueteam/data/kill_chains.json`.

Load `shared/schemas/kill-chains.md` if your skill generates or reads kill chain data (i.e., `skills/07-kill-chain-aggregator.md`). Other assessment skills do not need this sub-file.

---

## De-duplication Algorithm

All security skills MUST apply this algorithm when merging new entries into existing JSON files. The goal is a **minimum unified set**: one entry per root issue, regardless of how many assessments have identified the same issue.

### Code Changes De-duplication

An incoming code change entry is a **DUPLICATE** of an existing entry if **ANY** of the following match:

1. Same `file_path` AND overlapping `line_reference` AND same `change_type`
2. Same primary `cas_rules` entry (one CAS rule ID = one code-level remediation)
3. Same `file_path` AND `current_code_summary` describes the same construct (same function, variable, or line reference) as the existing entry's `current_code_summary`

**When a duplicate is detected:**
- **Merge `sources`**: Add the new source objects to the existing entry's `sources` array (avoid duplicating identical `{ assessment, finding_id }` pairs)
- **Keep highest `priority`**: If the incoming entry has a higher priority than the existing, update `priority`
- **Populate `replacement_code`: REQUIRED**: If the existing entry has `replacement_code: null`, you MUST write the actual replacement code by reading the source file at `file_path` and `line_reference`. Write the minimal self-contained block that fixes the issue (replacement method/function/block, not the entire file). Do NOT leave `replacement_code: null` on any entry you touch during a merge. If both the existing and incoming entries have values, keep the longer/more complete one.
- **Keep most complete `current_code_summary`**: If the existing entry has `null` and the incoming has a value, update it.
- **Union `cas_rules`**: Add any new rule IDs from the incoming entry
- **Union `asvs_requirements`**: Add any new requirement IDs from the incoming entry
- **Do NOT create a new entry**

### Security Requirements De-duplication

An incoming security requirement entry is a **DUPLICATE** of an existing entry if **ANY** of the following match:

1. `title` similarity > 80% (use judgement: e.g., "Eliminate mock auth bypass" and "Remove mock authentication route" address the same root control)
2. Overlapping `sources[].finding_id` entries: the same finding ID appears in both entries' `sources` arrays
3. `requirement_text` addresses the same root control using the same primary MUST verb and resource noun (e.g., both require "MUST NOT store OAuth tokens in session")

**When a duplicate is detected:**
- Merge `sources`, keep highest `priority`, update `requirement_text` to the more complete version if applicable
- **Do NOT create a new entry**

### ID Allocation

- When a JSON file **does not exist**, start IDs at `CC-001` / `SR-001`
- When a JSON file **does exist**, read the highest existing ID number and increment from there for new (non-duplicate) entries
- **Never reuse or renumber existing IDs**: downstream agents may reference IDs by value

---

## Cross-Linking

After writing both JSON files in the same skill run, **cross-link** the `related_requirement_ids` and `related_code_change_ids` fields:

For each code change entry:
- Find all SR entries that share at least one `sources[].finding_id` value with this CC entry
- Add matching SR IDs to `related_requirement_ids`

For each requirement entry:
- Find all CC entries that share at least one `sources[].finding_id` value with this SR entry
- Add matching CC IDs to `related_code_change_ids`

---

## Human-Review File Formats

After writing both JSON files, each skill MUST regenerate the following human-review Markdown files from the full JSON state.

### `.ai/blueteam/reports/code_changes.md`

```markdown
# Pending Code Changes: [Application Name]
Generated: YYYY-MM-DD | Source assessments: [list] | Status: [N] pending, [N] completed

## Summary
| Priority | Count |
|----------|-------|
| Critical | N |
| High | N |
| Medium | N |
| Low | N |

---

## Critical Changes

### CC-001 · [Title]
**File:** `path/to/file.ts:line`  **Type:** fix
**Sources:** FINDING-001 (asvs_level2_security_assessment), CAS-AUTH-001 (cybersecurity_architecture_standard_compliance)
**Rules:** AUTH-001  **ASVS:** V2.2.1  **Related requirements:** SR-001

**Evidence:** `path/to/file.ts:line_reference`
**Summary:** [current_code_summary: one sentence describing the vulnerable construct]

**Replacement:**
```[lang]
[replacement code]
```

**Description:** [description: what must change, why it matters, and the consequence of not fixing]

---

[repeat for all changes, sorted by priority then ID]
```

### `.ai/blueteam/reports/security_requirements.md`

```markdown
# Pending Security Requirements: [Application Name]
Generated: YYYY-MM-DD | Source assessments: [list] | Status: [N] pending, [N] completed

> Human review required before running the requirements injection agent.
> Verify each requirement is accurate and appropriately scoped before marking status as approved.

---

## Critical Requirements

### SR-001 · [Title]
**Priority:** Critical  **Related changes:** CC-001

**Requirement:**
> [Full normative requirement text]

**Rationale:** [rationale text]

**Acceptance criteria:**
- [ ] [criterion 1]
- [ ] [criterion 2]
- [ ] [criterion 3]

**Sources:** FINDING-001 (asvs_level2_security_assessment)

---

[repeat for all requirements, sorted by priority then ID]
```

---

## Schema: `.ai/blueteam/data/risk_acceptances.json`

This file is authored by the application team (developers and leads). Security assessment skills **read** this file to apply risk acceptance decisions to findings: they do not write it. The developer guide for authoring this file is `RISK_ACCEPTANCE_GUIDE.md`.

```json
{
  "schema_version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "acceptances": [
    {
      "id": "RA-NNN",
      "finding_reference": {
        "assessment": "threat_model | asvs_level2_security_assessment | cybersecurity_architecture_standard_compliance | dr_resilience_analysis | cybersecurity_tool_use | kill_chain_aggregator",
        "finding_id": "T-NNN | FINDING-NNN | CAS-RULE-ID | DRG-NNN | CVE-YYYY-NNNNN | GHSA-xxxx",
        "tool": "trivy | trufflehog | osv-scanner | null",
        "package": "package-name or null",
        "package_version": "1.2.3 or null",
        "cas_rule": "AUTH-001 or null",
        "asvs_requirement": "V2.10.1 or null"
      },
      "scope": {
        "file_path": "relative/path/from/repo/root.ts",
        "line_reference": "118 or 162-177 or null"
      },
      "risk_description": "One sentence describing the specific risk being accepted",
      "business_justification": "Why this risk is being accepted rather than remediated",
      "compensating_controls": [
        "Specific compensating control 1",
        "Specific compensating control 2"
      ],
      "severity_at_acceptance": "critical | high | medium | low",
      "accepted_by": "Full name",
      "accepted_by_role": "Job title or role",
      "acceptance_date": "YYYY-MM-DD",
      "review_date": "YYYY-MM-DD",
      "pr_reference": "PR number or URL or null",
      "ghas_alert_id": "GitHub Advanced Security alert ID or null",
      "status": "pending | active | expired | withdrawn"
    }
  ]
}
```

### Field Definitions: Risk Acceptances

| Field | Required | Description |
|---|---|---|
| `id` | Yes | Sequential identifier: `RA-001`, `RA-002`, etc. Never reuse or renumber. |
| `finding_reference.assessment` | Yes | The skill that produced the finding being accepted. |
| `finding_reference.finding_id` | Yes | The specific finding ID from the assessment report. |
| `finding_reference.tool` | Conditional | Required for tool-scan findings: `trivy`, `trufflehog`, or `osv-scanner`. `null` for assessment findings. |
| `finding_reference.package` | Conditional | Required for CVE/dependency findings. The affected package name. |
| `finding_reference.package_version` | Conditional | Required for CVE/dependency findings. The affected version. |
| `finding_reference.cas_rule` | No | CAS rule ID if applicable. `null` otherwise. |
| `finding_reference.asvs_requirement` | No | ASVS requirement ID if applicable. `null` otherwise. |
| `scope.file_path` | Yes | Repo-relative path (forward slashes) of the file with the inline marker. For CVE findings, the primary affected manifest file. |
| `scope.line_reference` | Conditional | Line number or range. `null` only for whole-package CVE acceptances where no specific line applies. |
| `risk_description` | Yes | One sentence. Specific enough for a new developer to understand without reading the code. |
| `business_justification` | Yes | Why remediation is not feasible or appropriate at this time. |
| `compensating_controls` | Yes | At least one real compensating control. Empty array is not valid. |
| `severity_at_acceptance` | Yes | Severity of the finding at acceptance time. Cannot be retroactively lowered. |
| `accepted_by` | Yes | Full name of the person accepting the risk. |
| `accepted_by_role` | Yes | Their job title or role. |
| `acceptance_date` | Yes | ISO 8601 date. |
| `review_date` | Yes | ISO 8601 date. Max 12 months for High; 6 months for Critical; 24 months for Medium/Low. |
| `pr_reference` | No | PR number or URL. Recommended for High/Critical. |
| `ghas_alert_id` | No | GHAS alert ID for cross-referencing with GitHub Advanced Security. |
| `status` | Yes | `pending`: awaiting approval (treated as active finding); `active`: formally accepted; `expired`: past `review_date` (treated as active finding); `withdrawn`: revoked. |

### Non-Suppressible Finding Types

The following finding types MUST be reported as active findings regardless of any RA entry or marker. When a suppression attempt is detected, add a `SUPPRESSION_REJECTED` note and continue reporting as active:

- Hardcoded secrets in source code or git history (any tool or assessment)
- Authentication bypass routes or conditions
- Exposure paths for PHN (Personal Health Number), SIN (Social Insurance Number), medical/mental health diagnosis, or bank/credit card numbers
- Bulk Protected B data extraction (missing pagination/row limits on Protected B export endpoints)
- Active backdoor or mock-login routes in production code
- Privilege escalation via client-supplied input (e.g., client-controlled role or permission headers)

---

### Human-Review Format: `.ai/blueteam/reports/risk_register.md`

```markdown
# Security Risk Register: [Application Name]
Generated: YYYY-MM-DD | Total: [N] active, [N] pending, [N] expired, [N] withdrawn
Register governance: [CODEOWNER governance active | Self-service: not CODEOWNER-protected]

> Accepted risks are never removed from assessment reports. They appear in the Accepted Risks appendix
> of every subsequent assessment until withdrawn or expired. Expired entries are treated as active
> unmitigated findings until renewed.

---

## Active Acceptances

### RA-001 · [risk_description: one sentence]
**Finding:** [finding_id] ([assessment display name])  **Severity:** [severity_at_acceptance]
**Accepted by:** [accepted_by] ([accepted_by_role])  **Date:** [acceptance_date]  **Review due:** [review_date]
**PR:** [pr_reference or]  **GHAS:** [ghas_alert_id or]

**Scope:** `[file_path]:[line_reference]`

**Justification:** [business_justification]

**Compensating controls:**
- [control 1]
- [control 2]

---

[repeat for all active entries, sorted by severity then ID]

---

## Pending Acceptances

> These entries have been submitted but not yet formally approved. The referenced findings are still
> treated as active unmitigated findings in all assessment reports.

### RA-NNN · [risk_description]
**Finding:** [finding_id] ([assessment])  **Severity:** [severity_at_acceptance]
**Submitted by:** [accepted_by] ([accepted_by_role])  **Date:** [acceptance_date]

---

## Expired Acceptances

> These entries have passed their review_date. The referenced findings are treated as active
> unmitigated findings until the entry is renewed or withdrawn.

### RA-NNN · [risk_description]
**Finding:** [finding_id]  **Expired:** [review_date]  **Originally accepted by:** [accepted_by]

---

## Withdrawn Acceptances

### RA-NNN · [risk_description]  *(withdrawn)*
**Finding:** [finding_id]  **Withdrawn:** [acceptance_date of last update]

---
```

---

## Extraction Phase Instructions

The following 13-step process is used by all security skills to extract and write `.ai/` artifacts. This process is referenced as "the extraction phase" in each skill's final phase. **Steps 1-12 handle artifact writing; Step 13 handles risk acceptance processing and is always the final step.**

### Step 1: Read schema files

Read `shared/schemas/artifacts.md` (this file) to load the core schema definitions (code_changes.json, security_requirements.json, environment_assumptions.json) and de-duplication algorithm.

Also read `shared/schemas/html-report-template.md` to load the HTML generation template: needed for Steps 10 and 11.

If your skill generates the application map, additionally read `shared/schemas/application-map.md`. If your skill generates kill chain data, additionally read `shared/schemas/kill-chains.md`. Other assessment skills (threat model, ASVS, CAS) do not need those sub-files.

### Step 2: Read existing code changes
Read `.ai/blueteam/data/code_changes.json`. If the file does not exist, initialise an empty structure:
```json
{ "schema_version": "1.0", "last_updated": "", "generated_by_assessments": [], "changes": [] }
```

### Step 3: Extract candidate code changes
From the current assessment's output, extract one candidate CC entry per distinct code-level fix. Source material varies by skill:
- **Threat model**: from each "Vulnerable Code Example" → Remediation in `.ai/blueteam/reports/threat_model.md`
- **ASVS**: from each `FINDING-NNN → Remediation` section in `.ai/blueteam/reports/asvs_level2_security_assessment.md`
- **CAS**: from each `NON-COMPLIANT finding → Remediation` section in `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md`

For each candidate CC entry, also evaluate and populate the following optional fields:

**`callsite_impact`**: Set this field (non-null) whenever the change involves any of:
- Converting a synchronous function to async (adds `async`/`await`, returns `Promise<T>` instead of `T`)
- Adding, removing, or retyping parameters on a shared function or method
- Changing the return type of a function called from multiple places
- Renaming a shared function or method

When any of these apply: populate `function_name` with the function being changed, `change_description` with what callers must do differently, `callsite_search_pattern` with the grep string to find all callers, and `scope` describing which files to search (default: `"all: production code and test files"`). If none of these apply, set `callsite_impact` to `null`.

**`scope_check`**: Set this field (non-null) whenever:
- The fix is a business logic control (duplicate submission guard, idempotency check, rate limit, sequential step enforcement): check whether other write paths to the same data store also need the guard; list them in `additional_paths_to_verify`
- The finding was identified by substring/pattern matching in a middleware file (CSRF bypass, auth bypass, input validation exemption): set `sibling_apps_check: true` to signal that the same pattern should be verified in all other in-scope repositories and all other middleware files of the same type

If neither condition applies, set `scope_check` to `null`.

### Step 4: Apply de-duplication (code changes)
For each candidate CC entry, apply the de-duplication algorithm. Create new entries for non-duplicates; merge into existing entries for duplicates.

### Step 5: Allocate IDs and write `.ai/blueteam/data/code_changes.json`
Allocate new IDs for non-duplicate entries.

**MANDATORY: do not skip:** Add this assessment's canonical name to `generated_by_assessments[]` if it is not already present, even when all CC candidates were de-duplicated into existing entries and no new IDs were allocated. `generate_overview_html.js` builds `assessments_run` **exclusively** from this array: omitting the name causes the overview to show "assessment has not been run", blank tab content, wrong compliance verdicts, and broken Dashboard links.

Write the updated file.

### Step 6: Read existing security requirements
Read `.ai/blueteam/data/security_requirements.json`. If the file does not exist, initialise empty:
```json
{ "schema_version": "1.0", "last_updated": "", "generated_by_assessments": [], "requirements": [] }
```

### Step 7: Extract candidate security requirements
From the current assessment's output, extract one candidate SR entry per distinct requirement. Source material:
- **Threat model**: from each P0/P1/P2 item in the requirements section of `.ai/blueteam/reports/threat_model.md`
- **ASVS**: from each item in the `Remediation Roadmap` section of `.ai/blueteam/reports/asvs_level2_security_assessment.md`
- **CAS**: from each item in the `Prioritised Remediation` list in Section 7 of `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md`
- **Security Architecture Design**: from each open gap in `gaps[]` in `.ai/blueteam/data/security_architecture.json`: see Phase 7b in `skills/03-security-architecture.md` for mapping instructions. **No CC entries are produced alongside these SRs**: architectural gaps require design-level solutions, not code changes. `sources[].assessment` = `"security_architecture_design"`, `finding_id` = `"SA-NNN"`.

### Step 8: Apply de-duplication (requirements)
For each candidate SR entry, apply the de-duplication algorithm. Create new entries or merge as appropriate.

### Step 9: Allocate IDs and write `.ai/blueteam/data/security_requirements.json`
Allocate new IDs for non-duplicate entries.

**MANDATORY: do not skip:** Add this assessment's canonical name to `generated_by_assessments[]` if it is not already present, even when all SR candidates were de-duplicated into existing entries and no new IDs were allocated. This array is the sole source of truth for which assessments have run: see Step 5 note for consequences of omitting the name.

Write the updated file.

### Step 9b: Generate and write `.ai/blueteam/data/verification_tests.json`
Generate actionable verification tests for findings introduced or updated by the current assessment.

1. Read existing `.ai/blueteam/data/verification_tests.json`; if absent, initialize:

```json
{ "schema_version": "1.0", "last_updated": "", "generated_by_assessments": [], "tests": [] }
```

2. For each active finding in the current assessment, create one `tests[]` entry with:
  - `finding_id` mapped to the report finding ID (`T-NNN`, `FINDING-NNN`, `AUTH-NNN`, etc.)
  - `command_template` with placeholders only (never real secrets)
  - both `expected_vulnerable_result` and `expected_mitigated_result`
  - `validation_status` defaulted to `not-tested`

3. For kill-chain findings (`KC-NNN`), generate at least one chain-level verification command that validates a critical chain step and references chain context in `notes`.

4. De-duplicate by `(assessment, finding_id, command_template)`; merge by keeping the most recent non-empty fields.

5. Allocate `VT-NNN` IDs for new entries, update `last_updated`, append assessment to `generated_by_assessments`, and write the file.

### Step 10: Conditionally regenerate `.ai/blueteam/reports/code_changes.md` and `.ai/blueteam/reports/code_changes.html`
Only regenerate if at least one **new** CC entry was created in Step 5 (i.e., `new_entries_added > 0`: not merely merged into existing entries). If all candidate CC entries were de-duplicated into existing entries, skip regeneration for this run. When regenerating, read the full `.ai/blueteam/data/code_changes.json` state and produce **both**:
1. `.ai/blueteam/reports/code_changes.md`: using the human-review Markdown format above.
2. `.ai/blueteam/reports/code_changes.html`: by running `generate_report_html.js --file .ai/blueteam/reports/code_changes.md` (see **HTML Report Generation** section below).

Both files must be written together: skipping or regenerating one applies equally to the other.

### Step 11: Conditionally regenerate `.ai/blueteam/reports/security_requirements.md` and `.ai/blueteam/reports/security_requirements.html`
Only regenerate if at least one **new** SR entry was created in Step 9 (i.e., `new_entries_added > 0`). If all candidate SR entries were de-duplicated into existing entries, skip regeneration for this run. When regenerating, **prefer the script** over AI-written output:

```bash
node <BlueTeam>/scripts/generate_requirements_report.js --repo-root /path/to/repo
```

This script reads `.ai/blueteam/data/security_requirements.json` and produces both files atomically, ensuring the executive summary counts and entry list are always consistent with the JSON. Run it after any direct modification of `security_requirements.json` (bulk additions, patch scripts, manual edits).

If the script is unavailable, produce both files manually:
1. `.ai/blueteam/reports/security_requirements.md`: using the human-review Markdown format above.
2. `.ai/blueteam/reports/security_requirements.html`: by running `generate_report_html.js --file .ai/blueteam/reports/security_requirements.md` (see **HTML Report Generation** section below).

Both files must be written together: skipping or regenerating one applies equally to the other.

**Key naming rule**: `.ai/blueteam/data/security_requirements.json` MUST use `"requirements"` as the top-level array key (not `"entries"` or `"items"`). Similarly, `.ai/blueteam/data/code_changes.json` MUST use `"changes"` as the top-level array key.

### Step 12: Write `.ai/blueteam/data/environment_assumptions.json`
Write or merge environment assumptions using the schema above. Each skill calls out this step explicitly (as "Step 12") after completing Steps 1-11. Apply the merging rules above if the file already exists. Always update `last_updated` and `assessments_applied`.

---

### Step 13: Risk Acceptance Processing

This step applies risk acceptance decisions to findings from the current assessment. It runs after the assessment report has been written and after Steps 1-12 are complete.

#### 13.1: Load the risk register

Check for `.ai/blueteam/data/risk_acceptances.json`. If absent, **skip Steps 13.2-13.8** and proceed to the Completion Report: there are no accepted risks to process.

If present:
- Load all entries.
- Classify each by effective status:
  - `active` entries where `review_date` < today → treat as **effectively expired** for this run (do NOT rewrite the JSON file; just apply expired treatment in the report).
  - `active` entries where `review_date` ≥ today → treat as **valid active**.
  - All `pending`, `expired`, and `withdrawn` entries → note separately.

#### 13.2: CODEOWNERS governance detection

Check for a CODEOWNERS file in the repository (in this order): `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS`. Use the git command line (`git`): do not require the `gh` CLI.

If a CODEOWNERS file is found:
- Read its contents.
- Check whether `.ai/blueteam/data/risk_acceptances.json` or `SECURITY_RISK_REGISTER.md` appears in any rule line.
- If either appears: set `codeowners_protected = true`.
- If neither appears: set `codeowners_protected = false`.

If no CODEOWNERS file is found: set `codeowners_protected = false`.

Record `codeowners_protected` for use in Steps 13.7 and 13.8.

> **Note:** CODEOWNERS detection is a whole-register governance signal, not per-entry. It confirms that changes to the register file require a CODEOWNERS-designated reviewer when branch protection is configured. It does not verify whether a specific PR was reviewed.

#### 13.3: Identify accepted findings for this assessment

For each **valid active** RA entry where `finding_reference.assessment` matches the current assessment's identifier:

1. Identify the finding in the current assessment report that matches `finding_reference.finding_id`.
2. Check that `scope.file_path` and `scope.line_reference` match the finding's flagged location.
3. Verify that a `RISK_ACCEPTED: RA-NNN` marker exists in `scope.file_path` at or within 3 lines above `scope.line_reference` (read the file and check the relevant lines).
4. **Non-suppressible check:** If the finding type is on the Non-Suppressible list (see above), add `SUPPRESSION_REJECTED`: report as active regardless.

If all checks pass (valid match, scope matches, marker present, not non-suppressible):
- Mark the finding as **accepted** for this report: it will appear in the Accepted Risks appendix, not the main findings section.

If any check fails, classify the anomaly:
- Scope mismatch → `OUT_OF_SCOPE_SUPPRESSION`
- Non-suppressible → `SUPPRESSION_REJECTED`
- No marker at declared location → `STALE_REGISTER_ENTRY` (anomaly)

For **effectively expired** active entries: treat as `EXPIRED_ACCEPTANCE`: report as active finding with note.

For **tool-scan findings** (`finding_reference.assessment = "cybersecurity_tool_use"`): scope matching uses `finding_id` (CVE/OSV advisory ID) + `package` + `package_version`. The `scope.file_path` should be the manifest file. A CVE acceptance applies to the specific package + version only: it does not suppress the CVE if the package is updated.

#### 13.4: Orphan detection (source file scan)

Run this scan after all findings are processed:

**Direction 1: markers without register entries:**
Search all source files for occurrences of `RISK_ACCEPTED:` (covering comment styles: `//`, `#`, `--`, `<!--`, `{#`). For each match:
- Extract the RA-NNN ID.
- If RA-NNN is NOT in the register: add `UNAUTHORIZED_SUPPRESSION` anomaly: _"RISK_ACCEPTED marker at [file]:[line] references RA-NNN which does not exist in the register. This marker cannot suppress the finding. Treat as unmitigated."_
- If RA-NNN is in the register with `status: pending`: note in report: _"RA-NNN is pending acceptance. Finding treated as active."_

Use the git command-line grep: `git grep -n "RISK_ACCEPTED:" -- "*.ts" "*.js" "*.py" "*.go"` etc., adjusted for the repo's languages. Fall back to reading source files directly if git grep is unavailable.

**Direction 2: register entries without markers:**
For each RA entry where `finding_reference.assessment` matches this assessment:
- Check whether `RISK_ACCEPTED: [entry.id]` exists in `scope.file_path` near `scope.line_reference`.
- If absent: add `STALE_REGISTER_ENTRY` anomaly: _"RA-NNN register entry references [file]:[line] but no matching marker found. Either the code was fixed (delete the RA entry) or the marker was accidentally removed (restore it and investigate)."_

#### 13.5: Build the Accepted Risks appendix content

Assemble the following content for appending to the assessment report:

```markdown
## Accepted Risks

> Risk acceptances recorded in `.ai/blueteam/data/risk_acceptances.json`.
> Accepted findings remain visible in all subsequent assessments: they do not disappear from reports.
> See `RISK_ACCEPTANCE_GUIDE.md` for instructions on adding or modifying risk acceptances.

### Governance
- Risk register CODEOWNERS protection: [**Active**: register is listed in CODEOWNERS | **Not configured**: self-service acceptances only]
[If high/critical self-service entries exist:]
> ⚠ Advisory: [N] high/critical acceptance(s) exist without CODEOWNERS governance. Consider listing `.ai/blueteam/data/risk_acceptances.json` in `.github/CODEOWNERS` to require a lead reviewer on changes to the register.

### Known Accepted Risks
[If none:] No findings from this assessment have active risk acceptances.

| ID | Finding | Severity | Accepted by | Role | Accepted | Review due | PR |
|---|---|---|---|---|---|---|---|
| RA-NNN | [risk_description] | [severity] | [accepted_by] | [accepted_by_role] | [acceptance_date] | [review_date] | [pr_reference or] |

### Pending Acceptances
[If none:] No pending risk acceptances for this assessment.

| ID | Finding | Severity | Submitted by | Date |
|---|---|---|---|---|
| RA-NNN | [risk_description] | [severity] | [accepted_by] | [acceptance_date] |

### Acceptance Anomalies
[If none:] No acceptance anomalies detected.

| Type | ID | Details |
|---|---|---|
| EXPIRED_ACCEPTANCE | RA-NNN | Expired [review_date]: treated as active finding until renewed |
| UNAUTHORIZED_SUPPRESSION |: | RISK_ACCEPTED marker at [file]:[line] references non-existent RA-NNN |
| STALE_REGISTER_ENTRY | RA-NNN | No marker at [file]:[line]: code fixed or marker removed |
| OUT_OF_SCOPE_SUPPRESSION | RA-NNN | Scope [file]:[line] does not match flagged location |
| SUPPRESSION_REJECTED | RA-NNN | [Finding type] is non-suppressible: acceptance cannot apply |
```

#### 13.6: Append accepted risks section to the assessment report

Append the Step 13.5 content into `.ai/blueteam/reports/[assessment-name].md`. Then regenerate `.ai/blueteam/reports/[assessment-name].html` using `generate_report_html.js`.

If **no risk acceptances and no anomalies** apply to this assessment, append a minimal section:
```markdown
## Accepted Risks
No risk acceptances are recorded for this application. See `RISK_ACCEPTANCE_GUIDE.md` to learn how to formally accept known risks.
```

#### 13.7: Write or update `.ai/blueteam/reports/risk_register.md` and `.ai/blueteam/reports/risk_register.html`

Regenerate `.ai/blueteam/reports/risk_register.md` from the full `.ai/blueteam/data/risk_acceptances.json` state using the human-review format defined in the risk_acceptances.json section above. Include all entries across all assessments (not just the current one).

Also create `SECURITY_RISK_REGISTER.md` at the **repository root** if it does not already exist:

```markdown
# Security Risk Register

Accepted security risks for this repository are tracked in [`.ai/blueteam/data/risk_acceptances.json`](.ai/blueteam/data/risk_acceptances.json)
and rendered in [`.ai/blueteam/reports/risk_register.md`](.ai/blueteam/reports/risk_register.md).

See [`RISK_ACCEPTANCE_GUIDE.md`] for instructions on how to add or modify risk acceptances.
```

Then regenerate `.ai/blueteam/reports/risk_register.html` using `generate_report_html.js --file .ai/blueteam/reports/risk_register.md`.

If `.ai/blueteam/data/risk_acceptances.json` does not exist, skip this step entirely: do not create empty register files.

---

After completing all steps, report the counts of new entries created, duplicates merged, total entries now in each file, whether each MD file was regenerated or skipped, the count of environment assumptions written, and the risk acceptance summary (active, pending, expired, anomalies).

---

## HTML Report Generation

All `.html` report files are generated by running `generate_report_html.js` from the `scripts/` directory of the BlueTeam skills repository. Do **not** generate HTML manually.

```bash
# Setup (one-time, from blueteam/ directory):
npm install

# Convert a specific report:
node <BlueTeam>/scripts/generate_report_html.js --file .ai/blueteam/reports/<report-name>.md

# Convert all reports at once:
node <BlueTeam>/scripts/generate_report_html.js --repo-root /path/to/repo
```

For `security_overview.html` specifically, use `generate_overview_html.js` instead (reads JSON artifacts directly, no markdown library required).

See `shared/schemas/html-report-template.md` for the CSS classes, badge patterns, and Mermaid→SVG rules that the script implements. Every `.md` file written to `.ai/blueteam/reports/` MUST have a corresponding `.html` file with the same basename.
