---
id: security-overview-report
name: Security Assessment Overview Report Skill
description: Synthesizes completed BlueTeam assessment artifacts into a unified security overview in Markdown and SPA HTML formats with audience-specific views.
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
  - ai-artifacts-schema
  - ai-html-report-template
upstream:
  - ref: protected-b-threat-model
    artifacts:
      - .ai/blueteam/data/code_changes.json
      - .ai/blueteam/data/security_requirements.json
  - ref: asvs-level2-security-assessment
    artifacts:
      - .ai/blueteam/data/code_changes.json
      - .ai/blueteam/data/security_requirements.json
  - ref: cybersecurity-architecture-standards
    artifacts:
      - .ai/blueteam/data/code_changes.json
      - .ai/blueteam/data/security_requirements.json
  - ref: kill-chain-aggregator
    artifacts:
      - .ai/blueteam/data/kill_chains.json
  - ref: dr-resilience-analysis
    artifacts:
      - .ai/blueteam/data/dr_resilience_assessment.json
  - ref: cybersecurity-tool-use-scanner
    artifacts:
      - .ai/blueteam/data/security-scan-results.json
outputs:
  - artifact: .ai/blueteam/reports/security_overview.md
    format: markdown
  - artifact: .ai/blueteam/reports/security_overview.html
    format: html
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must stop if none of the required .ai/blueteam/data artifacts are present.
  - Must render all required SPA tabs in final HTML output.
---

## MANDATORY OUTPUT CONSTRAINT

> **WARNING**: **The HTML report produced by this skill is a single-page application (SPA) with 9 fixed tab panels plus up to 2 conditional tabs. It does NOT use `shared/schemas/html-report-template.md`.** Phase 4 provides the complete CSS, tab navigation bar, panel structure, and JavaScript. No other HTML template is used for this skill.
>
> **All 9 fixed tab panels are required:** Dashboard · Remediation Plan · Common Issues · Attack Chains · Threat Model · ASVS · Compliance · Resiliency & DR · Tool Scans · Security Reqs
>
> **Conditional tabs** (generated only when the corresponding artifact is present):
> - **Unit Tests** tab: present when `security_unit_test_coverage.md` has been generated
> - **Risk Register** tab: present only when `.ai/blueteam/data/risk_acceptances.json` exists in the repository. When the file is absent (no risk acceptances have been recorded), this tab is intentionally omitted. This is correct behaviour and does not indicate a script defect.
>
> **Dashboard also requires a Security Classification card** as the first metric card showing "Public" or the letter "A" / "B" / "C" (for Protected A/B/C), coloured by classification level, linking to `security-classification.html`. The card is omitted only when `security-classification.yaml` is absent or has no recognised classification field.
>
> Failure to implement all 9 fixed tabs is a skill execution error. Before writing the HTML file, re-read Phase 4 in full. Do not summarise or abbreviate tab content.

---

## Purpose

Individual security assessment skills produce focused reports covering their own domain. This skill reads the machine-readable JSON artifacts produced by all completed assessment skills and synthesizes a single overview report. It is the entry point for any reader who wants the full security picture without reading multiple separate reports.

**This skill is read-only.** It does not write to any JSON artifact. It only generates the two overview report files.

---

## Inputs

Read all of the following files that exist in the target repository's `.ai/` folder. Note which are present and which are absent; this determines which tabs have content in the HTML report.

| File                                     | Written By                     | Required                                                                          |
| ---------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| `.ai/blueteam/data/code_changes.json`             | Threat Model, ASVS, CAS skills | At least one of the first four must be present                                    |
| `.ai/blueteam/data/security_requirements.json`    | Threat Model, ASVS, CAS skills | At least one of the first four must be present                                    |
| `.ai/blueteam/data/verification_tests.json`       | Threat Model, ASVS, CAS, Kill Chain Aggregator | Optional, summary only (status/coverage); do not render raw commands in overview |
| `.ai/blueteam/data/kill_chains.json`              | Kill Chain Aggregator skill    | Optional, graceful degradation if absent                                         |
| `.ai/blueteam/data/dr_resilience_assessment.json` | DR Resilience Analysis skill   | Optional, graceful degradation if absent                                         |
| `.ai/blueteam/data/security-scan-results.json`    | Cybersecurity Tool Use skill   | Optional, graceful degradation if absent                                         |
| `.ai/blueteam/data/security-classification.yaml`  | Classification skill           | Optional, used for app name and classification label                             |
| `.ai/controls.yaml`                      | Application team (manual)      | Optional, if present, display declared controls status on Dashboard              |
| `.ai/blueteam/data/risk_acceptances.json`         | Application team (manual)      | Optional, if present, populate Risk Register tab; graceful degradation if absent |

If none of the required files exist, STOP. Output:
> **STOP**: No security assessment artifacts found in `.ai/blueteam/data/`. Complete at least one assessment skill (Threat Model, ASVS, CAS, or DR Resilience) or run the security tool scanner before generating the overview report.

---

## Preliminary Definitions

### Assessment Display Names

When displaying assessment names in reports, use these mappings:

| JSON value (in `sources[].assessment`)           | Display name        | Short label     |
| ------------------------------------------------ | ------------------- | --------------- |
| `threat_model`                                   | Threat Model        | Threat Model    |
| `asvs_level2_security_assessment`                | ASVS Level 2        | ASVS            |
| `cybersecurity_architecture_standard_compliance` | CAS Compliance  | CAS             |
| `dr_resilience_analysis`                         | Resiliency & DR     | Resiliency & DR |
| `security-scan-results`                          | Security Tool Scans | Tool Scans      |

### Severity Normalization

Scan findings use uppercase severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`). Normalize all severities to Title Case for display and lowercase for CSS class names throughout both reports.

### Determining Which Assessments Have Run

Read `generated_by_assessments` from `code_changes.json` and `security_requirements.json`. Merge the two lists; the union is the set of completed assessments. If `kill_chains.json` exists, add `kill_chain_aggregator` to the completed set; if `dr_resilience_assessment.json` exists, add `dr_resilience_analysis`; if `security-scan-results.json` exists, add `security_tool_scans`.

Assessments that have NOT run = the set difference of all known assessments minus completed ones.

### Classifying Findings as Common vs. Unique

**For CC-NNN and SR-NNN entries:**
- A finding is **common** (confirmed by multiple assessments) if its `sources[]` array contains entries from two or more distinct assessment values.
- A finding is **unique to a skill** if all entries in `sources[]` share the same `assessment` value.

When a finding is unique to a skill, assign it to the skill named by `sources[0].assessment`.

**For scan findings (security-scan-results.json):**
Scan findings are always in the Tool Scans category; they do not participate in the common/unique classification.

**For verification tests (verification_tests.json):**
Render only aggregate status/coverage metrics in the overview (`not-tested`, `passed`, `failed`, `not-applicable`). Do not render raw PoC command templates in this report.

---

## Phase 1: Build the Unified Finding Inventory

Construct five working lists:

### List A: Common Findings
All CC-NNN entries where `sources[]` contains 2+ distinct `assessment` values, sorted: Critical → High → Medium → Low, then by ID.
All SR-NNN entries by the same rule, interleaved with CC-NNN entries at the same severity level.

### List B: Per-Skill Unique Findings
For each assessment that has run, a sub-list of CC-NNN and SR-NNN entries where all `sources[].assessment` values are that assessment. Sort each sub-list by severity then ID.

### List C: Kill Chains

> **WARNING**: **SOURCE AUTHORITY for Kill Chains**: ALL kill chain data (IDs, titles, severity, scope)
> MUST be sourced exclusively from `.ai/blueteam/data/kill_chains.json`. Do **NOT** read chains from
> `.ai/blueteam/reports/threat_model.md`, `.ai/blueteam/reports/cross_domain_kill_chains.md`, or any other
> `.md` file. The kill chain aggregator reassigns KC-NNN IDs on every run; the `.md` reports
> may be stale relative to the JSON. The canonical source is `kill_chains.json` only.

If `kill_chains.json` exists: extract all chains, sorted by severity descending, with `cross_domain` chains before `single_assessment` chains at the same severity.
If absent: List C is empty.

### List D: Scan Findings
If `security-scan-results.json` exists: extract all findings from `findings[]`, sorted by severity (Critical → High → Medium → Low → Info), then by type (vulnerability → secret → misconfiguration).
If absent: List D is empty.

### List E: DR Resilience Findings
If `dr_resilience_assessment.json` exists: extract summary score/risk from `overall_score`, `overall_rating`, `overall_risk`; extract `gaps[]` sorted by severity (critical → high → medium → low), then ID; extract `recommendations[]` sorted by priority (p1 → p2 → p3 → p4).
If absent: List E is empty.

---

## Phase 2: Compute Summary Statistics

Calculate the following counts:

**Code Changes (CC-NNN):**
- Count by priority: critical_cc, high_cc, medium_cc, low_cc, total_cc
- Count of common CC entries (appearing in List A): common_cc
- Count of unique CC entries per skill

**Security Requirements (SR-NNN):**
- Count by priority: critical_sr, high_sr, medium_sr, low_sr, total_sr
- Count of common SR entries: common_sr

**Scan Findings (if present):**
- Count by severity: critical_scan, high_scan, medium_scan, low_scan, info_scan, total_scan
- Count by type: vuln_count, secret_count, misconfig_count

**Kill Chains (if present):**
- Count by severity: critical_kc, high_kc, medium_kc, low_kc, total_kc
- Count cross-domain vs. single-assessment

**DR Resilience (if present):**
- `dr_score` from `overall_score`
- `dr_rating` from `overall_rating`
- `dr_risk` from `overall_risk`
- Gap counts by severity: critical_dr, high_dr, medium_dr, low_dr, total_dr_gaps

**Overall Risk Level:**
- `Critical` if any finding (CC, SR, scan, or DR gap) is Critical priority/severity
- `High` if no Critical findings but any High findings exist
- `Medium` if no Critical/High findings but any Medium findings exist
- `Low` if only Low findings exist
- `Informational` if only Info-level scan findings exist

**Top Critical Findings (for Executive Summary):**
- Collect all CC-NNN and SR-NNN with priority = "critical" plus DRG-NNN entries with `severity = "critical"`, sorted by: common findings first, then unique, then by ID. Take up to 10.

**Declared Controls (if `.ai/controls.yaml` present):**
- Check if `.ai/controls.yaml` exists in the repository root. If absent: `controls_declared = false`, skip.
- If present, parse it and count: `controls_declared_count` = number of keys where the boolean value is `true`.
- Extract `declared_by` and `last_updated` for display.
- Build a brief summary string: e.g., "5 controls declared (rate_limiting_present, mfa_enforced, idp_fully_delegated, input_validation_present, secrets_manager_present); reviewed by Application Security Team on 2026-03-01."

---

## Phase 2b: Compute Tab Verdicts and Exploitability Rating

Compute all verdicts once here. Reference them when rendering each tab in Phase 4.

### Exploitability Rating

Evaluate the rules below in order; the highest triggered tier wins. Derive entirely from the already-loaded JSON artifacts.

| Tier                             | Condition (any one sufficient)                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trivially Exploitable**        | Any scan finding with `type="secret"` · Any scan finding with `severity="CRITICAL"` · Any CC or SR with `priority="critical"` AND title/description contains auth-bypass keywords (case-insensitive: "unauthenticated", "no authentication", "authentication bypass", "without credentials", "JWT bypass", "skip auth") · Any kill chain where `attack_path[0].tactic` starts with `TA0001` AND chain `severity="critical"` |
| **Readily Exploitable**          | Any kill chain with `severity="critical"` or `severity="high"` · Any CC or SR where `sources[].finding_id` contains `AUTH-` or `MFA-` AND `priority="critical"` or `"high"` · Total count of critical+high CC and SR entries ≥ 3                                                                                                                                                                                            |
| **Capability Required**          | `kill_chains.json` is non-empty (any chains exist) · Any CC or SR with `priority="critical"` or `"high"`                                                                                                                                                                                                                                                                                                                    |
| **Advanced Capability Required** | None of the above triggered (no critical/high findings, no kill chains)                                                                                                                                                                                                                                                                                                                                                     |

Record:
- `exploitability_tier`: one of: `"trivially_exploitable"`, `"readily_exploitable"`, `"capability_required"`, `"advanced_capability_required"`
- `exploitability_triggers[]`: list of the specific conditions that fired, for display in the modal "Current Rating Rationale"

**Tier labels / icons / CSS classes for rendering the exploitability banner:**

| Tier                         | Label                        | Icon       | CSS class     |
| ---------------------------- | ---------------------------- | ---------- | ------------- |
| trivially_exploitable        | Trivially Exploitable        | `&#9888;`  | `sb-critical` |
| readily_exploitable          | Readily Exploitable          | `&#9888;`  | `sb-high`     |
| capability_required          | Capability Required          | `&#9679;`  | `sb-medium`   |
| advanced_capability_required | Advanced Capability Required | `&#10003;` | `sb-pass`     |

**Rationale sentence** (substitute real counts from Phase 2 statistics):
- Trivially: "[APP_NAME] has [N] exposed secret(s) and/or critical CVEs reachable without authentication. Automated scanners and inexperienced attackers can exploit this without credentials."
- Readily: "[N] critical/high findings exist; [N] attack chain(s) with high severity identified. A low-skill attacker with common tools could exploit this with minimal preconditions."
- Capability: "Exploitation requires chaining [N] finding(s) across [N] kill chain(s). A skilled, targeted attacker is needed."
- Advanced: "No critical or high findings and no kill chains identified. Only a sophisticated or insider attacker could realistically exploit current vulnerabilities."

### Tab Verdict Computations

**Application Security Posture (Dashboard tab):**
- `Critical Risk`: any CC/SR with `priority="critical"` OR any scan finding with `severity="CRITICAL"`
- `Elevated Risk`: any CC/SR with `priority="high"` OR scan with `severity="HIGH"` (no critical found)
- `Manageable Risk`: only medium/low findings exist
- `Low Risk`: only low-severity findings (no medium/high/critical)
- `Informational`: only info-level scan findings, no CC/SR

**ASVS Level 2 Posture (ASVS tab):** Count all CC/SR where any `sources[].assessment = "asvs_level2_security_assessment"`
- `Not Assessed`: ASVS not in `generated_by_assessments`
- `Pass`: ASVS run + 0 findings in ASVS set
- `Conditional Pass`: max priority = medium or low only
- `Fail`: any entry has priority critical or high

**Threat Exposure (Threat Model tab):** Count all CC/SR where any `sources[].assessment = "threat_model"`
- `Not Assessed`: Threat Model not run
- `No Active Threats`: run + 0 findings
- `Manageable Exposure`: max priority = medium or low
- `Elevated Exposure`: any high finding
- `Critical Exposure`: any critical finding

**Attack Chain Risk (Attack Chains tab):** Based on `kill_chains.json`
- `Not Assessed`: kill chains not run
- `No Attack Chains`: run + 0 chains
- `Limited Attack Paths`: only low severity chains
- `Active Attack Paths`: any medium or high chain
- `Critical Attack Paths Present`: any critical chain

**Known Vulnerability Status (Tool Scans tab):** Based on `security-scan-results.json`
- `Not Assessed`: no scan results
- `Clean`: run + 0 findings OR only info
- `Low Exposure`: only medium/low/info (no critical/high/secret)
- `Vulnerable`: any high finding OR any secret finding
- `Critically Exposed`: any critical finding

**Remediation Urgency (Remediation tab):** Based on all CC/SR across all assessments
- `No Findings`: no CC or SR entries
- `Immediate Action Required`: any critical finding
- `Action Required`: any high finding (no critical)
- `Monitoring Recommended`: only medium/low findings

**Cross-Assessment Risk (Common Issues tab):** Based on List A (common findings)
- `No Common Findings`: List A is empty
- `Low Confirmed Risk`: only low findings in List A
- `Confirmed Risk`: highest priority in List A = medium
- `High Confidence Risk`: any high in List A
- `High Confidence Critical Risk`: any critical in List A

**Resiliency & DR Posture (Resiliency & DR tab):** Based on `dr_resilience_assessment.json`
- `Not Assessed`: no DR artifact
- `Resilience Mature`: score >= 85 and no critical/high DR gaps
- `Resilience Needs Improvement`: score 50-84 and no critical DR gaps
- `Resilience At Risk`: any high DR gap or score 30-49
- `Resilience Critical`: any critical DR gap or score < 30

---

## Phase 3: Write `.ai/blueteam/reports/security_overview.md`

> **Secret Handling**: NEVER include actual secret values (passwords, tokens, API keys, connection strings with credentials) in this report. When summarizing a finding that involves a hardcoded secret, reference the vulnerability type, file path, and CC-NNN/SR-NNN ID only. Use `[REDACTED]` if any literal secret value would otherwise appear in the text.

Write the Markdown report using the structure below. Read the application name from `security-classification.yaml` if available; otherwise infer from `kill_chains.json` field `application_name`, or from `code_changes.json` metadata (with `[Application Name]` as fallback if not determinable).

```markdown
# Security Assessment Overview: [Application Name]

**Generated:** [YYYY-MM-DD]
**Classification:** [from security-classification.yaml, or OFFICIAL if not available]
**Assessments completed:** [comma-separated display names, or "None"]
**Assessments not yet run:** [comma-separated display names, or "None"]

---

## 1. Executive Summary

[2-3 sentences: overall risk level, total finding counts by severity, key themes. E.g.: "This application carries a **Critical** overall risk rating across [N] completed assessments, with [N] critical and [N] high-severity findings. The most significant risks involve [theme 1 derived from highest-severity common findings] and [theme 2]. Immediate remediation is required for [N] critical code changes before this application is considered safe for deployment."]

### Risk Metrics

| Finding Type               | Critical | High     | Medium   | Low      | Total    |
| -------------------------- | -------- | -------- | -------- | -------- | -------- |
| Code Changes (CC)          | [N]      | [N]      | [N]      | [N]      | [N]      |
| Security Requirements (SR) | [N]      | [N]      | [N]      | [N]      | [N]      |
| DR Resilience Gaps (DRG)   | [N or -] | [N or -] | [N or -] | [N or -] | [N or -] |
| Tool Scan Findings         | [N or -] | [N or -] | [N or -] | [N or -] | [N or -] |
| **Combined**               | **[N]**  | **[N]**  | **[N]**  | **[N]**  | **[N]**  |

*[N] findings confirmed by multiple assessments. [N] kill chains identified [or: Kill chain analysis not yet run].*

### Assessment Status

| Assessment          | Status                   | Report                                                                                                     |
| ------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Threat Model        | [✓ Complete / ✗ Not run] | [threat_model.html](threat_model.html)                                                                     |
| ASVS Level 2        | [✓ Complete / ✗ Not run] | [asvs_level2_security_assessment.html](asvs_level2_security_assessment.html)                               |
| CAS Compliance  | [✓ Complete / ✗ Not run] | [cybersecurity_architecture_standard_compliance.html](cybersecurity_architecture_standard_compliance.html) |
| Resiliency & DR     | [✓ Complete / ✗ Not run] | [dr_resilience_assessment.html](dr_resilience_assessment.html)                                             |
| Kill Chain Analysis | [✓ Complete / ✗ Not run] | [cross_domain_kill_chains.html](cross_domain_kill_chains.html)                                             |
| Security Tool Scans | [✓ Complete / ✗ Not run] | N/A                                                                                                        |

[If controls_declared:] **[N] compensating controls declared** by [declared_by] ([last_updated]). See Dashboard tab for details. Annotated findings in individual assessment reports may already be partially mitigated; validate with your security team before closing.

[If not controls_declared:] *No compensating controls declared. If additional controls are in place beyond the baseline (custom WAF rules, field-level encryption, centralized authorization, etc.), declare them in `.ai/controls.yaml` to annotate relevant findings.*

### Top Critical Findings

[For each finding in Top Critical Findings list (up to 10), one line per finding:]
1. **[CC-NNN or SR-NNN or DRG-NNN]**: [title] *(Sources: [assessment display names or "Resiliency & DR"])*
2. ...

[If no Critical findings: "No critical findings identified across completed assessments."]

---

## 2. Remediation Roadmap

[Intro: "The following timeline groups all code changes and security requirements by priority. Items shared across multiple assessments are marked with the assessment names that identified them."]

### Immediate: 0 to 7 Days *(Critical)*

[If no critical items: "No critical-priority items." Otherwise, for each CC-NNN with priority = "critical":]

**CC-[NNN] · [Title]**
`[file_path]:[line_reference]` · Type: [change_type] · Sources: [assessment display names]
[description, first sentence only, truncated at 200 chars if necessary]

[For each SR-NNN with priority = "critical":]

**SR-[NNN] · [Title]**
Sources: [assessment display names]
> [requirement_text]

### Short-Term: 1 to 4 Weeks *(High)*

[Same pattern for priority = "high"]

### Medium-Term: 1 to 3 Months *(Medium)*

[Same pattern for priority = "medium"]

### Long-Term: 3 to 6 Months *(Low)*

[Same pattern for priority = "low"]

---

## 3. Common Findings

*[N] issues independently confirmed by two or more assessment skills. These represent the highest-confidence vulnerabilities in the codebase. Every finding in this section has been corroborated from at least two independent analytical angles.*

[For each severity level (Critical, High, Medium, Low) that has at least one common finding:]

### [Severity]

[For each CC-NNN in List A with this priority:]
**CC-[NNN]: [Title]** \[[Assessment Short Label] · [Assessment Short Label]\]
File: `[file_path]:[line_reference]`
[description, first sentence]

[For each SR-NNN in List A with this priority:]
**SR-[NNN]: [Title]** \[[Assessment Short Label] · [Assessment Short Label]\]
[requirement_text, truncated at 200 chars]

[If List A is empty: "No findings were identified by multiple assessments. This may indicate assessments are not yet complete; common findings emerge when at least two of the three primary assessments have run."]

---

## 4. Attack Chain Summary

[If List C is empty:]
> Kill chain analysis has not been run. Complete all three primary assessments (Threat Model, ASVS Level 2, organizational CAS), then run `skills/07-kill-chain-aggregator.md` to identify cross-domain attack paths that span multiple assessment findings.

[If List C is NOT empty, for each chain in List C (show all chains if 5 or fewer; show top 5 by severity if more than 5):]

### [KC-NNN]: [Chain Title] *(Severity: [severity] · [cross-domain / single-assessment])*

**Attacker:** [attacker_type] · **AI-enabled variant:** [ai_enabled_variant or N/A]
**Chain-breaking fix:** [chain_breaking_fix.description] ([SR-NNN or CC-NNN])

| Step | Attacker Action | Finding | Assessment | ATT&CK Tactic |
| ---- | --------------- | ------- | ---------- | ------------- |
[one row per attack_path step]

[If more than 5 chains:]
*[N − 5] additional chains are documented in the [full kill chain report](cross_domain_kill_chains.html).*

---

## 5. Per-Skill Unique Findings

*Critical and High severity only. For all severities, see the Appendix.*

[For each assessment that has run, in order: Threat Model, ASVS Level 2, organizational CAS:]

### [Assessment Display Name]

[If assessment has NOT run:] *Not completed. Run `[skill filename]` to generate findings.*

[If assessment has run but has no unique findings (all its findings are common):] *All [N] findings from this assessment are shared with other assessments and appear in Section 3 (Common Findings).*

[If assessment has unique Critical or High findings:]
**[N] unique findings** (Critical: [N], High: [N], Medium: [N], Low: [N]) · [View full report →]([report_filename].html)

[For each CC-NNN in List B for this assessment with priority in {critical, high}:]
- **CC-[NNN]**: [title] · *[priority badge]* · `[file_path]`

[For each SR-NNN in List B for this assessment with priority in {critical, high}:]
- **SR-[NNN]**: [title] · *[priority badge]*

### Resiliency & DR

[If List E is empty:] *Not completed. Run `skills/10-dr-resilience.md` to assess disaster recovery and business continuity resilience posture.*

[If List E is NOT empty:]
**Score:** [dr_score]/100 ([dr_rating]) · **Risk:** [dr_risk]
**Gaps:** [total_dr_gaps] (Critical: [critical_dr], High: [high_dr], Medium: [medium_dr], Low: [low_dr])
**Report:** [dr_resilience_assessment.html](dr_resilience_assessment.html)

[List top 5 DR gaps by severity and ID:]
- **[DRG-NNN]**: [title] · *[severity badge]*

### Security Tool Scans

[If List D is empty:] *Not completed. Run `skills/08-tool-scanning.md` to scan for CVEs / secrets / misconfigurations.*

[If List D is NOT empty:]
**[N] findings** (Critical: [N], High: [N], Medium: [N], Low: [N], Info: [N])
**By type:** Vulnerabilities: [N] · Secrets: [N] · Misconfigurations: [N]
**Tools run:** [tool names from scan_metadata.tools_executed]

*Top Critical Scan Findings:*
[For each scan finding with severity = CRITICAL (up to 5):]
1. `[id]`: [title] · [affected_component]@[affected_version or N/A] · CVSS: [cvss_score or N/A]

[If more critical findings: "*[N] additional critical scan findings in the HTML report Tool Scans tab.*"]

### Risk Register

[If `.ai/blueteam/data/risk_acceptances.json` is absent:] *No risk acceptances recorded. See `RISK_ACCEPTANCE_GUIDE.md` for instructions on formally accepting known security risks.*

[If present:]
**Governance:** [CODEOWNER governance active | Self-service, not CODEOWNER-protected]
**Acceptances:** [N] active · [N] pending · [N] expired · [N] withdrawn
[If anomalies exist:] **WARN Anomalies:** [N] UNAUTHORIZED_SUPPRESSION, [N] STALE_REGISTER_ENTRY, [N] EXPIRED_ACCEPTANCE. See Risk Register tab for details.

---

## 6. Appendix: Full Finding Inventory

### All Code Changes (CC-NNN)

| ID  | Title | Priority | Sources | File |
| --- | ----- | -------- | ------- | ---- |
[One row per CC entry, sorted by priority then ID. Sources column: comma-separated assessment short labels.]

### All Security Requirements (SR-NNN)

| ID  | Title | Priority | Sources |
| --- | ----- | -------- | ------- |
[One row per SR entry, sorted by priority then ID.]

[Only if List D is NOT empty:]

### All Tool Scan Findings

| ID  | Type | Severity | Title | Component | CVSS | Tools |
| --- | ---- | -------- | ----- | --------- | ---- | ----- |
[One row per scan finding, sorted by severity then type. Type: vulnerability / secret / misconfiguration. Tools: comma-separated from sources[].]
```

---

## Phase 4: Write `.ai/blueteam/reports/security_overview.html`

Run the Python script from the repository root:

```bash
node <BlueTeam>/scripts/generate_overview_html.js --repo-root /path/to/repo
```

Replace `<BlueTeam>` with the path to the BlueTeam skills directory.

The script reads all `.ai/blueteam/data/` JSON artifacts (code_changes.json, security_requirements.json,
verification_tests.json, kill_chains.json, dr_resilience_assessment.json, security-scan-results.json, risk_acceptances.json) and generates
`.ai/blueteam/reports/security_overview.html` as a self-contained SPA (9 fixed tabs + conditional Unit Tests and Risk Register tabs) with:

- **Dashboard**: **Security Classification card** (first metric card: "Public" for public apps; for Protected data, "Protected" label (13px bold, coloured by level) stacked above the large letter "A"/"B"/"C" (42px bold, same colour), with "Classification" label below; links to `security-classification.html`); overall risk; exploitability rating; severity distribution; **Top Actions** (5 highest-priority CC items by kill-chain participation) for application owners; **Assessment Verdict table** showing each assessment's outcome badge and a direct link to its detail tab
- **Remediation Plan**: links to `code_changes.html` and `security_requirements.html` detail
  reports; compact **Quick Reference** summary table (`remed-summary`) listing all CC entries with
  ID / file / line / type / priority / linked SR-NNN IDs; **File Hotspots** section, with files ranked
  by finding count; each row shows filename (with full-path tooltip), finding count badge (dark for
  multi-finding files), worst-priority badge, source assessment chips (TM/ASVS/CAS/DR),
  change-type breakdown, kill-chain count, and CC ID anchor links; then all CC-NNN code change
  cards sorted by priority (kill-chain participation count desc → multi-source confirmation desc →
  severity asc → ID asc); each card shows a numbered priority badge, linked SR-NNN
  cross-references to `security_requirements.html#SR-NNN`, expandable **Current code** block
  (`current_code_summary`), expandable **Show fix** code block (`replacement_code`), and
  kill-chain participation chips; kill-chain-elevated items display a red **Elevated by kill
  chain** badge
- **Common Issues**: findings confirmed by 2+ assessments (highest confidence); same card
  enhancements as Remediation Plan
- **Attack Chains**: kill chain cards with step-by-step attack paths, chain-breaker fix links,
  and collapsible **AI-enabled attack variant** sections
- **Threat Model**: Threat Model-unique findings with exposure verdict
- **ASVS**: ASVS Level 2-unique findings with posture verdict; assessment one-liner shown below
  verdict banner
- **Compliance**: organizational CAS-unique findings with compliance verdict; assessment one-liner shown
  below verdict banner
- **Resiliency & DR**: DR score with **score band** label (Critical / High Risk / Needs
  Improvement / Mature), dimension bars, gaps table, recommendations
- **Tool Scans**: all VULN/SECRET/MISCONFIG scan findings with type and CVSS
- **Security Reqs**: all SR-NNN items across all completed assessments, sorted by priority; verdict banner; link to full `security_requirements.html` detail report; expandable **Acceptance criteria** on each item

**CC finding card features (Remediation Plan, Common Issues, assessment tabs):**
- Numbered priority circle (e.g. `①`) indicating fix order across the entire remediation plan
- Red `Elevated by kill chain` badge when the item was priority-elevated during kill chain analysis
- Kill chain participation chips listing every chain the fix helps break
- Linked SR-NNN cross-reference badges pointing to `security_requirements.html#SR-NNN`
- Expandable **Current code** block rendering `current_code_summary` (shows what the code looks
  like now, even before a fix is written)
- Expandable **Show fix** block rendering `replacement_code` from code_changes.json
- Expandable **Acceptance criteria** block rendering `acceptance_criteria` from
  security_requirements.json (SR items)
- `[REDACTED-*]` tokens rendered as styled red chips (`.redacted-chip`)

**SR finding card features:**
- Expandable **Acceptance criteria** list from security_requirements.json

**Kill chain card features:**
- Collapsible **AI-enabled attack variant** section when present in kill_chains.json

### HTML Structure Verification (confirm before declaring complete)

After the script completes, verify:
- [ ] `.ai/blueteam/reports/security_overview.html` exists and is non-empty
- [ ] File contains `<nav class="tab-nav">` with at least 9 `<button class="tab-btn">` elements (9 fixed + up to 2 conditional)
- [ ] File contains at least 9 `<div class="tab-panel">` elements with IDs: panel-dashboard, panel-remediation, panel-common, panel-chains, panel-threat-model, panel-asvs, panel-cas, panel-dr, panel-scans, panel-security-reqs
- [ ] **Risk Register tab**: `panel-risk-register` is present when `.ai/blueteam/data/risk_acceptances.json` exists; absent otherwise (this is correct behavior, not a defect)
- [ ] **Unit Tests tab**: `panel-unit-tests` is present when `security_unit_test_coverage.md` has been generated; absent otherwise
- [ ] File contains `function switchTab(`
- [ ] No `[PLACEHOLDER]` strings remain in the output
- [ ] Dashboard metric grid contains `security-classification.html` link (classification card) when `security-classification.yaml` is present
- [ ] Dashboard contains `class="action-item"` (Top Actions section) and `class="assess-table"` (Assessment Verdict table)
- [ ] Remediation Plan tab contains links to `code_changes.html` and `security_requirements.html`
- [ ] Remediation Plan tab contains a `class="remed-summary"` Quick Reference table
- [ ] Remediation Plan tab contains `class="hotspot-table"` (File Hotspots section)
- [ ] Remediation Plan cards contain `class="priority-num"` (numbered priority badges)
- [ ] Remediation Plan cards with `related_requirement_ids` contain `security_requirements.html#SR-NNN` links
- [ ] Finding cards for kill-chain-elevated items contain `class="elevated-badge"`
- [ ] Finding cards contain `<details class="finding-detail"` (expandable code/criteria blocks)
- [ ] DR tab contains `class="dr-band"` (score band label)
- [ ] DR tab heading reads "Potential Gaps (given evidence in repo)" (not just "Potential Gaps")
- [ ] Security Reqs tab (`panel-security-reqs`) contains finding cards for SR-NNN items
- [ ] No raw secret values appear in the output (only `[REDACTED-*]` tokens or `.redacted-chip` spans)

### Setup (one-time)

No third-party packages beyond those in `package.json` are required.

```bash
# Verify Node.js is available:
node --version   # Node.js 20+ required
npm install      # Install dependencies (if not already done)
```


---

## Phase 5: Update `shared/schemas/html-report-template.md`

After writing both report files, add the new filenames to the naming convention table in `shared/schemas/html-report-template.md` under **§ HTML Report Generation → Naming Convention**:

| Markdown file                      | HTML file                            |
| ---------------------------------- | ------------------------------------ |
| `.ai/blueteam/reports/security_overview.md` | `.ai/blueteam/reports/security_overview.html` |

---

## Completion Report

After all phases, output:

```
## Security Overview Report Complete

**Application:** [name]
**Date:** [YYYY-MM-DD]
**Overall risk level:** [Critical / High / Medium / Low]

**Assessments included:**
- [List each with "Complete" or "Not run"]

**Finding counts:**
- Code Changes (CC): [total] ([critical] critical, [high] high, [medium] medium, [low] low)
- Security Requirements (SR): [total] ([critical] critical, [high] high, [medium] medium, [low] low)
- DR Resilience Gaps (DRG): [total or "Not run"] ([critical] critical, [high] high, [medium] medium, [low] low)
- Tool Scan Findings: [total or "Not run"]
- Kill Chains: [total or "Not run"]
- Common findings (multi-assessment): [N] CC + [N] SR = [total] common

**Reports written:**
- .ai/blueteam/reports/security_overview.md: written
- .ai/blueteam/reports/security_overview.html: written

**HTML generation (Phase 4):**
- [ ] `generate_overview_html.js` was run successfully
- [ ] `.ai/blueteam/reports/security_overview.html` exists and is non-empty
- [ ] File contains `<nav class="tab-nav">` with at least 9 `<button class="tab-btn">` elements (9 fixed + conditional)
- [ ] File contains at least 9 `<div class="tab-panel">` elements with correct IDs; Risk Register tab present only when risk_acceptances.json exists
- [ ] File contains `function switchTab(`
- [ ] Dashboard classification card present (links to `security-classification.html`) when YAML is available
- [ ] Dashboard shows Top Actions (5 items) and Assessment Verdict table
- [ ] Remediation Plan cards show numbered priority badges, SR cross-reference links, expandable Current code blocks, and expandable Show fix blocks
- [ ] Kill-chain-elevated CC items show elevation badge
- [ ] DR tab shows score band label (Critical / High Risk / Needs Improvement / Mature)
- [ ] Security Reqs tab shows SR-NNN finding cards with verdict banner and report link
- [ ] No raw secret values in HTML output
```
