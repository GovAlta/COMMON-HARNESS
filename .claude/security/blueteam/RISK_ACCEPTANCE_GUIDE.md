---
title: "Security Risk Acceptance Guide"
description: Reference for developers, development leads, and security staff on how to formally acknowledge and accept known security risks in application repositories assessed by the Blue Team Security Agent.
version: 1.0.0
status: active
---

# Security Risk Acceptance Guide

This document explains how to acknowledge a known security risk in a repository assessed by the Blue Team Security Agent. It is intended for **developers**, **development leads**, and **security reviewers**. It can be copied or linked into any assessed repository as a local reference.

---

## Quick Reference

```js
// RISK_ACCEPTED: RA-001
const fallbackSecret = process.env.SESSION_SECRET || "local-dev-only";
```

1. Add `// RISK_ACCEPTED: RA-001` immediately above the flagged line.
2. Add an entry for `RA-001` to `.ai/blueteam/data/risk_acceptances.json` in the repository.
3. Raise a pull request as you normally would; lead review applies.
4. After the PR is merged, re-running any security assessment skill will move the finding to the **Accepted Risks appendix** instead of the main findings section.

---

## Contents

1. [What Risk Acceptance Is and Is Not](#what-risk-acceptance-is--and-is-not)
2. [The Inline Marker](#the-inline-marker)
3. [The Risk Register](#the-risk-register)
4. [Status: pending vs active](#status-pending-vs-active)
5. [Governance and Report Badges](#governance-and-report-badges)
6. [What Cannot Be Suppressed](#what-cannot-be-suppressed)
7. [Review Expiry](#review-expiry)
8. [How Risk Acceptance Affects Assessment Reports](#how-risk-acceptance-affects-assessment-reports)
9. [Accepting Tool-Scan Findings](#accepting-tool-scan-findings-cves-misconfigurations)
10. [GitHub Advanced Security](#github-advanced-security)
11. [Operational Playbook](#operational-playbook)

---

## What Risk Acceptance Is and Is Not

### What it is

Risk acceptance is a formal, auditable acknowledgement that a specific security finding:
- Has been reviewed and understood
- Cannot or will not be remediated at this time for a documented reason
- Has compensating controls in place that reduce the practical exposure
- Will be re-evaluated by a specified date

The finding **does not disappear** from reports. Instead, it moves into a dedicated **Accepted Risks appendix** in every subsequent assessment, where it remains visible to all reviewers. The acceptance is time-bounded; it expires automatically on the `review_date`.

### What it is not

- **Not a way to make findings disappear.** Accepted findings are always visible in reports. They are listed in the appendix with the acceptance date, the person who accepted them, and the review deadline.
- **Not permanent.** All acceptances expire. Past-due acceptances are treated as active unmitigated findings until renewed.
- **Not available for certain critical finding types.** See [What Cannot Be Suppressed](#what-cannot-be-suppressed).

---

## The Inline Marker

Place a `RISK_ACCEPTED: RA-NNN` marker **immediately above** the line or block that triggers the finding. Keep it as terse as possible; all detail belongs in the register, not in the comment.

### Syntax by language

| Language / File type | Marker syntax |
|---|---|
| JavaScript, TypeScript, Java, C, C++, Go, Rust, C#, Swift, Kotlin | `// RISK_ACCEPTED: RA-001` |
| Python, Ruby, Shell, YAML, PowerShell, R | `# RISK_ACCEPTED: RA-001` |
| SQL, Lua, Haskell (single-line) | `-- RISK_ACCEPTED: RA-001` |
| HTML, XML, JSX, TSX, Vue templates | `<!-- RISK_ACCEPTED: RA-001 -->` |
| Jinja2, Twig, Django templates | `{# RISK_ACCEPTED: RA-001 #}` |

### Examples

```js
// RISK_ACCEPTED: RA-001
const fallbackSecret = process.env.SESSION_SECRET || "local-dev-only";
```

```python
# RISK_ACCEPTED: RA-002
ALLOWED_HOSTS = ["*"]  # Overridden by nginx in deployed environments
```

```sql
-- RISK_ACCEPTED: RA-003
SELECT * FROM users WHERE username = '" + username + "'
-- Legacy stored procedure; migration tracked in JIRA-4821
```

### Placement rules

- Place the marker **immediately above** (within 1-3 lines of) the flagged construct.
- Do **not** place it at the top of a file. Broad file-level suppression is not valid; each RA entry is scoped to a specific line or line range.
- For a block (e.g., a function or a multi-line expression), place it above the first line of the block and record the full line range in the register's `scope.line_reference` field.

### Optional extended form

For complex cases where the marker might confuse a future developer who doesn't know the register exists, you can add a hint comment. The skill ignores this second line (it is for human readers only).

```ts
// RISK_ACCEPTED: RA-004
// Hard-coded admin bypass in test scaffolding; see .ai/blueteam/data/risk_acceptances.json for justification
if (process.env.SKIP_AUTH_FOR_INTEGRATION_TEST === "true") {
```

---

## The Risk Register

The **risk register** is a JSON file at `.ai/blueteam/data/risk_acceptances.json` in the assessed repository. It is the governed record that backs every inline marker. A marker with no corresponding register entry is treated as an **unauthorized suppression attempt**; the finding will be escalated, not accepted.

### Full schema

```json
{
  "schema_version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "acceptances": [
    {
      "id": "RA-001",
      "finding_reference": {
        "assessment": "threat_model | asvs_level2_security_assessment | cybersecurity_architecture_standard_compliance | dr_resilience_analysis | cybersecurity_tool_use | kill_chain_aggregator",
        "finding_id": "T-003 | FINDING-NNN | CAS-RULE-ID | DRG-NNN | CVE-YYYY-NNNNN | GHSA-xxxx",
        "tool": "trivy | trufflehog | osv-scanner | null",
        "package": "package-name or null",
        "package_version": "1.2.3 or null",
        "cas_rule": "AUTH-001 (or null)",
        "asvs_requirement": "V2.10.1 (or null)"
      },
      "scope": {
        "file_path": "relative/path/from/repo/root.ts",
        "line_reference": "118 or 162-177 or null (tool CVE findings only)"
      },
      "risk_description": "One sentence describing the specific risk being accepted",
      "business_justification": "Why this risk is being accepted rather than remediated at this time",
      "compensating_controls": [
        "Specific compensating control that reduces the practical exposure",
        "Second compensating control if applicable"
      ],
      "severity_at_acceptance": "critical | high | medium | low",
      "accepted_by": "Full name",
      "accepted_by_role": "Job title or role",
      "acceptance_date": "YYYY-MM-DD",
      "review_date": "YYYY-MM-DD",
      "pr_reference": "PR number or URL (optional but recommended for high/critical)",
      "ghas_alert_id": "GitHub Advanced Security alert ID if applicable (optional)",
      "status": "pending | active | expired | withdrawn"
    }
  ]
}
```

### Field definitions

| Field | Required | Description |
|---|---|---|
| `id` | Yes | Sequential identifier: `RA-001`, `RA-002`, etc. Never reuse or renumber an ID. |
| `finding_reference.assessment` | Yes | The skill that produced the finding. Use the exact value from the table below. |
| `finding_reference.finding_id` | Yes | The specific finding ID from the assessment report (e.g., `T-003`, `FINDING-012`, `CVE-2024-12345`). |
| `finding_reference.tool` | Conditional | Required for tool-scan findings. One of: `trivy`, `trufflehog`, `osv-scanner`. |
| `finding_reference.package` | Conditional | Required for CVE/dependency findings. The affected package name. |
| `finding_reference.package_version` | Conditional | Required for CVE/dependency findings. The affected version. |
| `finding_reference.cas_rule` | No | CAS rule ID if applicable (e.g., `AUTH-001`). `null` otherwise. |
| `finding_reference.asvs_requirement` | No | ASVS requirement ID if applicable (e.g., `V2.10.1`). `null` otherwise. |
| `scope.file_path` | Yes | Repo-relative path (forward slashes) of the file containing the inline marker. For CVE/package findings, the primary affected manifest file. |
| `scope.line_reference` | Conditional | Line number or range (e.g., `118` or `162-177`). `null` only for whole-package CVE acceptances. |
| `risk_description` | Yes | One sentence. Specific enough that a new team member understands the risk without reading the code. |
| `business_justification` | Yes | Why remediation is not feasible or appropriate at this time. |
| `compensating_controls` | Yes | At least one compensating control. An empty array is not valid. |
| `severity_at_acceptance` | Yes | Severity of the finding at time of acceptance. Cannot be retroactively lowered. |
| `accepted_by` | Yes | Full name of the person accepting the risk. |
| `accepted_by_role` | Yes | Their job title or role. |
| `acceptance_date` | Yes | ISO 8601 date. |
| `review_date` | Yes | ISO 8601 date. Maximum 12 months from `acceptance_date` for High severity; 6 months for Critical (if permitted; see below). |
| `pr_reference` | No | The PR number or URL where this acceptance was reviewed. Recommended for high/critical. |
| `ghas_alert_id` | No | GitHub Advanced Security alert ID, if this acceptance corresponds to a GHAS dismissal. |
| `status` | Yes | `pending` (flagged, awaiting approval); `active` (formally accepted); `expired` (past `review_date`); `withdrawn` (revoked before expiry). |

### Assessment name values

| Assessment | `finding_reference.assessment` value |
|---|---|
| Threat Model | `threat_model` |
| ASVS Level 2 | `asvs_level2_security_assessment` |
| CAS Compliance | `cybersecurity_architecture_standard_compliance` |
| DR Resilience Analysis | `dr_resilience_analysis` |
| Security Tool Scans | `cybersecurity_tool_use` |
| Kill Chain Analysis | `kill_chain_aggregator` |
| Security Architecture | `security_architecture_design` |

### Adding an entry: step by step

1. Run the security assessment skill to identify the finding you want to accept.
2. Note the finding ID from the report (e.g., `T-003`, `FINDING-012`, `CVE-2024-12345`).
3. Open `.ai/blueteam/data/risk_acceptances.json`. If the file does not exist, create it with the minimal structure:
   ```json
   { "schema_version": "1.0", "last_updated": "YYYY-MM-DD", "acceptances": [] }
   ```
4. Add a new entry following the schema above. Increment the `RA-NNN` ID from the highest existing ID.
5. Add the inline marker `// RISK_ACCEPTED: RA-NNN` immediately above the flagged line in the source file.
6. Update `last_updated` to today's date.
7. Raise a pull request containing both the register entry and the inline marker.

---

## Status: `pending` vs `active`

| Status | Meaning | How the skill treats it |
|---|---|---|
| `pending` | Developer has flagged the finding for acceptance review, but it has not been formally approved yet | **Treated as an active finding**, appears in main findings section with a note: _"RA-NNN is pending; finding treated as active until approved."_ |
| `active` | Formally accepted | Moved to Accepted Risks appendix in all subsequent assessments |
| `expired` | Past `review_date` | **Treated as an active finding**, appears with a note: _"RA-NNN expired [date]; acceptance must be renewed."_ |
| `withdrawn` | Acceptance revoked before expiry (risk was remediated, or acceptance was judged inappropriate) | **Treated as an active finding**; inline marker should be removed from source code |

**Use `pending` when:**
- You have acknowledged a finding and have a business justification ready, but you want a lead reviewer to formally approve it before it suppresses the finding in reports.
- You are mid-sprint and want to flag the finding as "known and being handled" without waiting for the PR to merge.

**Workflow for `pending`:**
1. Add the register entry with `status: pending` and the inline marker.
2. Raise a PR.
3. The lead reviewer updates `status` to `active` when approving (or rejects the acceptance and removes the entry).
4. After the PR merges, the next assessment run will treat it as accepted.

---

## Governance and Report Badges

The security assessment skills detect the governance tier of the risk register at assessment time. This is reported in the **Accepted Risks appendix** of each assessment report and in the **Risk Register tab** of the unified overview report.

### How governance detection works

The skill checks whether `.ai/blueteam/data/risk_acceptances.json` or `SECURITY_RISK_REGISTER.md` appears in the repository's CODEOWNERS file (checked in order: `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS`).

- **If listed in CODEOWNERS:** Every change to the risk register that reaches the main branch has been reviewed by a designated CODEOWNER, because that is how CODEOWNERS works in combination with required PR reviews. The skill reports this as "CODEOWNER governance active."
- **If not listed:** Acceptances are self-service, governed only by the normal PR review process and git attribution.

> **Note:** CODEOWNERS governance detection is based on file presence and is a whole-register signal, not per-entry. It does not require the `gh` CLI; the skill reads the CODEOWNERS file directly. If your repository does not use branch protection rules, CODEOWNERS enforcement is not automatic; the badge reflects configuration, not enforcement verification.

### Governance badges in reports

| Badge | Meaning |
|---|---|
| **Accepted: CODEOWNER governance active** | The register is listed in CODEOWNERS; all accepted entries have been lead-reviewed as part of normal PR workflow |
| **Accepted: Self-service** | Valid, complete RA entry; not CODEOWNER-governed |
| **Advisory: high/critical without CODEOWNER governance** | The finding severity is High or Critical and the register is not CODEOWNER-protected; consider adding the register to CODEOWNERS |
| **Pending acceptance** | Entry exists with `status: pending`; finding treated as active |

### Adding CODEOWNERS protection (recommended for high/critical risks)

Add one of the following lines to `.github/CODEOWNERS`:

```
.ai/blueteam/data/risk_acceptances.json    @your-org/security-team
SECURITY_RISK_REGISTER.md         @your-org/security-team
```

Replace `@your-org/security-team` with your team's GitHub team handle or a lead's username.

---

## What Cannot Be Suppressed

The following finding types **cannot be moved to the Accepted Risks appendix**, regardless of any `RISK_ACCEPTED` marker or register entry. When a suppression attempt is detected, the skill adds a `SUPPRESSION_REJECTED` flag and reports the finding as active:

| Category | Examples |
|---|---|
| **Hardcoded secrets in source code or git history** | Passwords, API keys, private keys, connection strings with embedded credentials in committed files, past or present |
| **Authentication bypass** | Routes that skip auth entirely; environment-variable-gated bypasses; mock login routes present in production code |
| **Sensitive data exposure paths** | Any code path that can expose PHN (Personal Health Number), SIN (Social Insurance Number), medical or mental health diagnosis, or bank/credit card numbers without authorization |
| **Bulk Protected B data extraction** | Missing pagination or row limits on export endpoints handling Protected B data |
| **Active backdoor routes** | Dev/debug/mock login routes present in production code |
| **Privilege escalation via client input** | Client-controlled role or permission headers; client-supplied `isAdmin` flags |

These findings require remediation, not acceptance. If remediation is genuinely not possible, escalation to the Information Security team is required; a code comment cannot authorize these risks.

---

## Review Expiry

All risk acceptances expire. The `review_date` field is mandatory and must not be set more than:
- **12 months** from `acceptance_date` for High severity
- **6 months** from `acceptance_date` for Critical severity (only permitted with CISO-equivalent sign-off; see non-suppressible list above)
- **24 months** for Medium and Low severity (recommended maximum)

When a `review_date` is in the past:
- The skill treats the entry as `expired`; the finding is reported as an **active unmitigated finding** in all subsequent assessments.
- The `status` field in the JSON file is NOT automatically updated. The team must manually update it to `expired` and either renew the acceptance or remediate the finding.
- The inline marker remains in the code but has no suppression effect until the register entry is renewed with a new `review_date`.

**To renew:** Update `acceptance_date`, `review_date`, and optionally `accepted_by` / `accepted_by_role` in the register. Raise a PR. No change to the inline marker is required unless the line number has shifted.

---

## How Risk Acceptance Affects Assessment Reports

When a security assessment skill (Threat Model, ASVS, CAS, DR Resilience, Tool Scans) runs against a repository with a valid risk register:

1. **Before writing each finding**, the skill checks whether a `RISK_ACCEPTED: RA-NNN` marker exists in the source file near the flagged line, and cross-references it against the register.

2. **Valid active in-scope acceptance:** The finding is moved to the **Accepted Risks appendix** at the end of the assessment report. It is never omitted entirely; it remains visible with the acceptance metadata.

3. **Any anomaly** (expired, unregistered marker, wrong scope, non-suppressible type): The finding is reported as an **active finding** with a note explaining the anomaly.

4. **Kill chains:** RA'd findings do not disappear from kill chain analysis. A chain step that has been accepted is annotated `[RISK ACCEPTED: RA-NNN]` in the step table. The chain itself remains visible; accepting one step does not break the chain or remove it from the report.

5. **Security unit tests:** RA'd findings still generate security unit test recommendations. The tests verify that compensating controls are in place and functioning. An accepted risk still warrants test coverage.

### Anomaly types and their meaning

| Anomaly type | Trigger | Report treatment |
|---|---|---|
| `UNAUTHORIZED_SUPPRESSION` | `RISK_ACCEPTED: RA-NNN` marker in code but RA-NNN not in register | Finding escalated; treated as active unmitigated |
| `STALE_REGISTER_ENTRY` | Register has RA-NNN but no marker found in the source file at the recorded scope | Administrative finding: code may have been fixed (delete RA entry) or marker may have been accidentally removed (restore and investigate) |
| `EXPIRED_ACCEPTANCE` | `review_date` is in the past | Finding reported as active with expiry note |
| `OUT_OF_SCOPE_SUPPRESSION` | RA-NNN exists and is active, but `scope.file_path` or `scope.line_reference` does not match the flagged location | Finding reported as active; RA entries are scoped, not global |
| `SUPPRESSION_REJECTED` | Non-suppressible finding type (see above) | Finding reported as active regardless of any RA entry |

---

## Accepting Tool-Scan Findings (CVEs, Misconfigurations)

Findings from the three tool scanners (Trivy + TruffleHog + OSV-Scanner) can be risk-accepted using the same mechanism, with these differences:

### CVE / dependency vulnerability (Trivy, OSV-Scanner)

The `finding_id` is the CVE identifier (e.g., `CVE-2024-12345`) or OSV advisory ID (e.g., `GHSA-xxxx-xxxx-xxxx`). The `scope` is typically the manifest file (e.g., `package.json`, `requirements.txt`) rather than a specific source line.

The inline marker goes in the manifest file or in a comment above the package declaration:

```json
// RISK_ACCEPTED: RA-005
"express": "4.17.1",
```

For package managers that don't support inline comments (e.g., `package.json`), place the marker in a companion file noted in `scope.file_path`, or use a manifest comment if the package manager supports it.

A CVE acceptance is scoped to the specific **package + version** combination. It does not suppress the same CVE if the package is upgraded to a version where the CVE is patched.

### Misconfiguration (Trivy)

Use the Trivy rule ID as `finding_id` (e.g., `DS026` for Dockerfile HEALTHCHECK). The marker goes immediately above the flagged configuration line.

### Secrets (TruffleHog)

Hardcoded secrets are **non-suppressible** (see above), so TruffleHog findings cannot be risk-accepted; the only valid response is to remove the secret and rotate it.

---

## GitHub Advanced Security

If GitHub Advanced Security (GHAS) is enabled: GHAS runs its own code scanning and secret scanning in GitHub Actions pipelines.

**GHAS and risk acceptances are separate:** A risk acceptance in `.ai/blueteam/data/risk_acceptances.json` does not dismiss the corresponding GHAS alert, and a GHAS dismissal does not create a risk acceptance in the register.

**If you dismiss a GHAS alert and also want to accept the finding in the skill-generated register:** Add the GHAS alert ID to the `ghas_alert_id` field in the register entry. This cross-reference is informational; it helps security reviewers reconcile the two systems. It does not automatically sync states between them.

**Why use the skill register if GHAS is already running?** The skills perform a deeper, context-aware analysis than GHAS (threat modeling, kill chains, architecture compliance, DR resilience). The risk register captures risk decisions made at that deeper level, including findings that GHAS may not detect. Teams that run the Blue Team skills alongside GHAS get defence-in-depth on both detection and risk governance.

---

## Operational Playbook

### For developers

1. When a security assessment flags a finding you believe is acceptable or already mitigated, review the finding carefully.
2. If you agree it should be accepted: add the inline marker, create the register entry with `status: pending`, and raise a PR.
3. Your lead or reviewer approves the entry by setting `status: active` and adding their name to `accepted_by` before merging.
4. Re-run the affected assessment skill after the PR merges to confirm the finding moves to the appendix.
5. Track the `review_date`; diarise it or add a ticket. When it approaches, re-evaluate whether the risk is still acceptable.

### For development leads (PR reviewers)

When reviewing a PR that modifies `.ai/blueteam/data/risk_acceptances.json`:

1. Verify that every `RISK_ACCEPTED: RA-NNN` marker referenced in the PR has a corresponding register entry, and vice versa.
2. Check that `risk_description` and `business_justification` are specific and accurate; vague justifications should be sent back for revision.
3. Verify that at least one real `compensating_controls` entry is listed. "None required" is not valid.
4. Confirm `severity_at_acceptance` matches the finding's severity in the assessment report.
5. Confirm `review_date` complies with the maximum periods above.
6. For High/Critical findings: ensure `pr_reference` is populated.
7. Update `accepted_by` and `accepted_by_role` to your own name/role and set `status: active` before approving.

### For security staff

- The unified overview report (`security_overview.html`) contains a **Risk Register tab** listing all active entries plus any in non-active states (pending / expired / anomalous) across all assessments.
- Every subsequent assessment run re-evaluates all RA entries for expiry and scope validity, so accepted risks cannot silently persist beyond their `review_date`.
- To revoke an acceptance: set `status: withdrawn` in the register and remove the inline marker. Raise a PR. The finding will reappear as an active finding in the next assessment run.
- Orphan detection (both directions) runs automatically at every assessment; unregistered markers and stale register entries are always surfaced.

---

## Discoverability

A one-line stub file at `SECURITY_RISK_REGISTER.md` in the repository root helps developers and auditors find the register without knowing about the `.ai/` folder:

```markdown
# Security Risk Register

Accepted security risks for this repository are tracked in [`.ai/blueteam/data/risk_acceptances.json`](.ai/blueteam/data/risk_acceptances.json)
and rendered in [`.ai/blueteam/reports/risk_register.md`](.ai/blueteam/reports/risk_register.md).

See [RISK_ACCEPTANCE_GUIDE.md] for instructions on how to add or modify risk acceptances.
```

This file is created automatically when the first RA entry is processed by a security assessment skill.
