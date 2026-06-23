---
id: kill-chain-aggregator
name: Kill Chain Aggregator Skill
description: Correlates threat model / ASVS / CAS findings to produce cross-domain kill chains and elevate remediation priorities where chain severity is higher.
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
   - attack-chain-reference
   - ai-schema-kill-chains
   - ai-html-report-template
upstream:
   - ref: protected-b-threat-model
      artifacts:
         - .ai/blueteam/reports/threat_model.md
   - ref: asvs-level2-security-assessment
      artifacts:
         - .ai/blueteam/reports/asvs_level2_security_assessment.md
   - ref: cybersecurity-architecture-standards
      artifacts:
         - .ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md
outputs:
   - artifact: .ai/blueteam/reports/cross_domain_kill_chains.md
      format: markdown
   - artifact: .ai/blueteam/reports/cross_domain_kill_chains.html
      format: html
   - artifact: .ai/blueteam/data/kill_chains.json
      format: json
   - artifact: .ai/blueteam/data/verification_tests.json
      format: json
   - artifact: .ai/blueteam/reports/security_requirements.md
      format: markdown
   - artifact: .ai/blueteam/reports/security_requirements.html
      format: html
call_sequence_hard:
   - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
   - Requires threat model / ASVS / CAS reports to exist before execution.
   - Must stop with error if any required assessment report is missing.
---

## Purpose

Individual security assessment skills construct kill chains from their own findings in isolation. This skill reads all three assessment outputs together and identifies **cross-domain kill chains**: multi-step attack paths where each step draws on a finding from a different assessment skill. These chains are invisible to any individual skill and represent compound risk that per-assessment severity scoring does not capture.

A cross-domain chain is significant when:
- A Reconnaissance-stage finding from the ASVS (e.g., verbose error disclosure) enables an Initial Access step identified by the threat model (e.g., credential stuffing), which is then amplified by a CAS gap (e.g., missing rate limiting)
- The chain-breaking fix is a single remediation that resolves findings across multiple assessments simultaneously, making it higher-priority than any individual assessment would rate it

**Run this skill after all three assessment skills have completed for a given application.**

---

## Inputs

Before beginning, load the following reference files (all in the same directory as this skill):

1. `shared/reference/attack-chain-reference.md`: ATT&CK tactic tables, chain construction standards, and common patterns
2. `shared/schemas/kill-chains.md` and `shared/schemas/html-report-template.md`: kill_chains.json schema, field definitions, and HTML report template.

Then read all of the following assessment outputs from the target repository's `.ai/` folder:

### Required Assessment Reports

| File                                                            | Produced By        | Required |
| --------------------------------------------------------------- | ------------------ | -------- |
| `.ai/blueteam/reports/threat_model.md`                                   | Threat Model skill | Required |
| `.ai/blueteam/reports/asvs_level2_security_assessment.md`                | ASVS skill         | Required |
| `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md` | CAS skill          | Required |

If any of the three assessment reports is missing, output an error:
> **STOP**: Kill chain aggregation requires all three assessment reports to be present. Missing: [list missing files]. Run the corresponding assessment skill first, then re-run this aggregator.

### Supporting Artifacts

| File                                    | Purpose                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `.ai/blueteam/data/security_requirements.json`   | SR-NNN entries for cross-referencing and priority elevation                                |
| `.ai/blueteam/data/code_changes.json`            | CC-NNN entries for cross-referencing and priority elevation                                |
| `.ai/blueteam/data/security-classification.yaml` | Application name and classification level for report headers                               |
| `.ai/blueteam/data/risk_acceptances.json`        | Risk acceptance register. If present, annotate accepted steps in chain tables (see below). |

### Risk Acceptance Handling in Kill Chains

If `.ai/blueteam/data/risk_acceptances.json` is present, load it before building chains:

- When a finding that is a step in a chain has a valid active RA entry, annotate that step in the chain step table with `[RISK ACCEPTED: RA-NNN]` in the Finding column.
- **Do NOT remove the finding from the chain.** Accepted risk does not break a kill chain; the attack path still exists. The annotation signals that the team has acknowledged this step, but the chain remains active in the report.
- If **all** steps in a chain are accepted, annotate the chain header with `WARN: All steps in this chain have active risk acceptances. The attack path remains viable; risk acceptance does not eliminate the threat.` Move the chain to a "Fully Accepted Chains" subsection in the report rather than the main chains section. The chain must still appear in the report.
- Kill chain priority elevation (Step 4) still applies to chains with accepted steps; a cross-domain chain elevates SR-NNN/CC-NNN priorities regardless of per-step acceptance status.

---

## Steps

### Step 1: Build the Unified Finding Inventory

Extract every finding from all three assessment reports into a single working inventory. For each finding, record:

| Field             | Source                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Finding ID        | e.g., `T-001` (threat model), `FINDING-003` (ASVS), `AUTH-001` (CAS)                                |
| Assessment source | `threat_model`, `asvs_level2_security_assessment`, `cybersecurity_architecture_standard_compliance` |
| ATT&CK Tactic(s)  | From the `ATT&CK Tactic` / `ATT&CK Tactic(s)` field in each finding block                           |
| Severity          | The `Priority` / `Severity` / `Risk Tier` field                                                |
| Brief description | One sentence describing the vulnerability                                                           |
| Related SR-NNN    | From `.ai/blueteam/data/security_requirements.json` `sources[]`. Find SR entries where `finding_id` matches. |
| Related CC-NNN    | From `.ai/blueteam/data/code_changes.json` `sources[]`. Find CC entries where `finding_id` matches.          |

If an ATT&CK tactic is missing from a finding block, assign one now using the appropriate mapping table in `shared/reference/attack-chain-reference.md` (Section 2 for ASVS findings, Section 3 for CAS findings, Section 1 for threat model findings).

### Step 2: Identify Existing Per-Assessment Chains

Extract all kill chains already documented in the individual assessment reports:

- **Threat model**: Section 9 kill chain narratives (KC-NNN)
- **ASVS**: "Attack Chains" section (KC-NNN)
- **CAS**: Section 8 kill chain narratives (KC-NNN)

Record these as `scope: single_assessment` chains in the working set. They will be included in the output unless superseded by a cross-domain chain that subsumes them.

### Step 3: Identify Cross-Domain Kill Chains

This is the core step. Construct chains where at least two steps draw on findings from **different** assessment skills.

#### Tactic-Based Chain Construction

1. **Group findings by ATT&CK tactic stage** across all three assessments:

   | Tactic Stage               | Findings from Threat Model | Findings from ASVS | Findings from CAS |
   | -------------------------- | -------------------------- | ------------------ | ----------------- |
   | Reconnaissance (TA0043)    | [T-NNN list]               | [FINDING-NNN list] | [CAS rule list]   |
   | Initial Access (TA0001)    | ...                        | ...                | ...               |
   | Credential Access (TA0006) | ...                        | ...                | ...               |
   | [etc.]                     | ...                        | ...                | ...               |

2. **Trace tactic paths**: A complete cross-domain chain begins at Reconnaissance (TA0043) or Initial Access (TA0001) and terminates at Collection/Exfiltration (TA0009/TA0010) or Impact (TA0040). For each pair of early-stage and late-stage findings sourced by **different** assessments, determine whether there is a plausible sequential exploitation path connecting them.

3. **Prioritize chains that**:
   - Begin with a **publicly accessible, unauthenticated** finding (no precondition; maximum attacker reach)
   - Include a step that **expands blast radius** (Privilege Escalation, Credential Access enabling access to additional data)
   - Terminate at **Collection or Exfiltration of Protected B or higher data**, or **Impact**
   - Have a **single chain-breaking fix** that resolves findings from multiple assessments simultaneously

4. **Check all common patterns** from Section 4 of `shared/reference/attack-chain-reference.md` for cross-domain manifestations. Each common pattern should be checked with findings from all three assessments in the finding pools at each step.

#### Cross-Domain Chain Severity

Compute cross-domain chain severity using the same rules as individual assessment skills:
- The chain severity is the **highest severity among all participating findings**, potentially elevated further if the chain enables bulk Protected B data access or impact without authentication
- Apply organizational DREAD floor weights from the threat model skill: any chain reaching Protected B data without authentication is at minimum P0 (Critical)
- Document the severity rationale explicitly

### Step 4: Check for Priority Elevations

For each cross-domain chain identified in Step 3, determine whether any SR-NNN or CC-NNN entries participating in the chain have individual priorities **lower than the chain severity**. If so, these entries must be elevated.

For each elevation:
1. Record the `artifact_id` (SR-NNN or CC-NNN), `previous_priority`, `elevated_to`, and `rationale` in the `priority_elevations[]` array for the chain
2. Update the corresponding entry in `.ai/blueteam/data/security_requirements.json` or `.ai/blueteam/data/code_changes.json`: change its `priority` field to the elevated value and add a note to its `rationale` or `description` field: `"Priority raised: previous=[X], elevated_to=[Y], reason=kill chain aggregator, participates in cross-domain chain [KC-NNN] (see .ai/blueteam/data/kill_chains.json)"`

### Step 5: Write `.ai/blueteam/data/kill_chains.json`

> **Secret Handling**: NEVER include actual secret values (passwords, tokens, API keys, connection strings with credentials) in `attacker_action` descriptions or any other field. Reference the vulnerability by finding ID and file path (e.g., "Attacker exploits hardcoded JWT key at apps/auth-api/Startup.cs:156 ([REDACTED-JWT-KEY])") not the literal key value.

> **CRITICAL canonical field names (matters for the HTML overview generator):**
> - Top-level key MUST be `chains` (NOT `kill_chains`). The file is *named* `kill_chains.json` but the array key inside is `chains`.
> - Each chain MUST include `participating_code_change_ids: ["CC-NNN", ...]` as a flat sorted array of every CC-NNN that appears in `attack_path[].finding_refs` plus `chain_breaking_fix.cc_id` plus `priority_elevations[].artifact_id` (CC-NNN only). The HTML overview indexes off this field directly; if it's missing the chain shows up but its CC participation links are broken.
> - `priority_elevations[]` entries MUST have `artifact_id` (NOT `id`), `previous_priority`, `elevated_to`, and `rationale`.
> - `generate_overview_html.js` has a tolerant fallback that derives missing fields from prose, but tightening at this step avoids downstream noise.

Using the schema defined in `shared/schemas/kill-chains.md`, write the complete kill chain inventory. Include:

- **All cross-domain chains** (`scope: cross_domain`) identified in Step 3
- **Single-assessment chains** (`scope: single_assessment`) extracted in Step 2 that are not fully subsumed by a cross-domain chain

**KC-NNN ID allocation**: Allocate IDs sequentially starting at KC-001. Order chains by severity descending (Critical first), then by scope (`cross_domain` before `single_assessment` at the same severity). This file is always regenerated; do not attempt to preserve previous KC-NNN IDs.

After writing, cross-link `chain_breaking_fix.related_requirement_ids` and `chain_breaking_fix.related_code_change_ids` by finding SR-NNN and CC-NNN entries in the JSON artifacts that share `sources[].finding_id` values with the chain's attack path steps.

### Step 5b: Update `.ai/blueteam/data/verification_tests.json` with chain-level checks

For each `KC-NNN` chain, write at least one verification test entry that validates a critical chain step or the chain-breaking fix.

- `finding_id`: `KC-NNN`
- `assessment`: `kill_chain_aggregator`
- `command_template`: actionable placeholder command (for example `curl`)
- `safety_level`: default `safe-authz`; use `destructive` only when state-changing behavior is required
- Include both `expected_vulnerable_result` and `expected_mitigated_result`
- Keep secrets and hostnames redacted/placeheld (`${BASE_URL}`, `${TOKEN_USER}`, `${TOKEN_ADMIN}`)

### Step 5c: Back-Propagate Cross-Assessment Confirmations to CC/SR sources[]

When a kill chain attack_path step has `finding_refs` from two or more **distinct** assessments, and those findings all map to the **same** chain-breaking fix (i.e., they are independent confirmations of the same root vulnerability rather than different steps in a chain), update the corresponding CC and SR entries in `.ai/blueteam/data/code_changes.json` and `.ai/blueteam/data/security_requirements.json`:

For each kill chain chain in `kill_chains.json`:
1. Collect all distinct assessment names from the chain's `source_assessments[]`.
2. If `source_assessments` has 2 or more entries:
   a. For each CC-NNN in `chain_breaking_fix.related_code_change_ids`: add all source assessments to that CC entry's `sources[]` array. Do not duplicate existing entries. Format: `{"assessment": "<canonical-name>", "finding_id": "<finding-id-from-that-assessment>"}`. Derive the `finding_id` from the `finding_refs` in each attack_path step; match by assessment name to find the correct finding_id.
   b. For each SR-NNN in `chain_breaking_fix.related_requirement_ids`: apply the same update to `security_requirements.json`.
3. After updating sources[], verify `generated_by_assessments[]` in both files still contains all assessment names now referenced.

**Why this step is required:** The `security_overview.html` Common Issues tab computes multi-source findings by checking `sources.length > 1` on CC/SR entries. Without this step, all findings appear single-source even when kill chains prove independent cross-assessment confirmation, causing the Common Issues tab to always show 0 findings (a false negative that understates cross-cutting risk).

**Distinction from priority elevations (Step 4):** Step 4 elevates *priority* when chain severity exceeds per-assessment severity. Step 5c back-propagates *attribution* when multiple assessments independently confirmed the same root vulnerability. These are separate concerns; a finding can have Step 4 applied, Step 5c applied, both, or neither.

### Step 6: Write `.ai/blueteam/reports/cross_domain_kill_chains.md` and `.html`

Write the human-readable report using the structure defined below. After writing the `.md`, generate the corresponding `.html` by running `generate_report_html.js` (see **HTML Report Generation** at the end of this skill file).

### Step 7: Write `.ai/blueteam/reports/security_requirements.md` and `.html`

At this point, `.ai/blueteam/data/security_requirements.json` is complete; all three assessments have
contributed entries and all priority elevations from Step 4 have been applied. Produce
`.ai/blueteam/reports/security_requirements.md` as a standalone reference document.

**Required sections:**

1. **Title block**: application name (from `security-classification.yaml`), schema version,
   last-updated date, and generating assessments list (from `generated_by_assessments[]`).

2. **Executive Summary table**: counts by priority: Critical, High, Medium, Low, Total.
   Count the SR-NNN and CC-NNN elevations **directly from the Priority Elevations Summary table**
   you already wrote in `cross_domain_kill_chains.md`. Count rows with `SR-` prefix for SR count and
   rows with `CC-` prefix for CC count. Do **not** estimate or write these numbers freehand.
   The executive summary sentence must match the Priority Elevations table exactly.

3. **Requirements table per priority band**: four tables (Critical, High, Medium, omit Low if
   empty), each with columns: ID, Title, Related Code Change, Kill Chain IDs, CAS Rules, ASVS.
   Include a note beneath the Critical table identifying which entries were elevated and from
   what previous priority.

4. **Requirement Details**: one `### SR-NNN` subsection per entry. Each subsection contains:
   the full `requirement_text`, an **Acceptance Criteria** bullet list, and a one-line
   cross-reference listing `sources[]` finding IDs by assessment.

After writing the `.md`, generate `.ai/blueteam/reports/security_requirements.html` by running:

```bash
node <BlueTeam>/scripts/generate_report_html.js --repo-root /path/to/repo
```

---

## Required Output Structure

### `.ai/blueteam/reports/cross_domain_kill_chains.md`

```markdown
# Cross-Domain Kill Chain Analysis: [Application Name]

**Generated:** [YYYY-MM-DD]
**Classification:** [Overall application classification from security-classification.yaml]
**Assessments synthesized:** Threat Model · ASVS Level 2 · CAS v2.x
**Total chains identified:** [N] ([N] cross-domain, [N] single-assessment)

---

## Executive Summary

[2-3 sentences summarizing the most critical finding from the cross-domain analysis. Lead with the highest-severity cross-domain chain and its real-world impact (e.g., "An unauthenticated attacker can exploit a reconnaissance gap identified in the ASVS assessment combined with a missing rate limit (CAS) and an authorization bypass (threat model) to extract all Protected B records without authentication."). Note how many SR-NNN and CC-NNN priorities were elevated as a result of this analysis.]

---

## ATT&CK Tactic Coverage: Unified View

This table reflects tactic coverage across all three assessments combined.

| ATT&CK Tactic        | ID     | Coverage Status                | Finding Count | Assessments |
| -------------------- | ------ | ------------------------------ | ------------- | ----------- |
| Reconnaissance       | TA0043 | Covered / Gap / Not Applicable | [N]           | [list]      |
| Initial Access       | TA0001 | ...                            | ...           | ...         |
| Execution            | TA0002 | ...                            | ...           | ...         |
| Persistence          | TA0003 | ...                            | ...           | ...         |
| Privilege Escalation | TA0004 | ...                            | ...           | ...         |
| Defense Evasion      | TA0005 | ...                            | ...           | ...         |
| Credential Access    | TA0006 | ...                            | ...           | ...         |
| Discovery            | TA0007 | ...                            | ...           | ...         |
| Lateral Movement     | TA0008 | ...                            | ...           | ...         |
| Collection           | TA0009 | ...                            | ...           | ...         |
| Exfiltration         | TA0010 | ...                            | ...           | ...         |
| Impact               | TA0040 | ...                            | ...           | ...         |

---

## Cross-Domain Kill Chains

[For each cross-domain chain, use the KC-NNN card format below. Order by severity descending.]

### KC-NNN: [Chain Title]

**Chain Severity:** [Critical / High / Medium / Low]
**Attacker Type:** [Classification]
**AI-enabled variant:** [Description or N/A]
**Scope:** Cross-domain (spans [assessment A], [assessment B][, and assessment C])
**Chain-Breaking Fix:** [Single remediation (SR-NNN or CC-NNN reference)] *(remediation detail in linked artifact)*

**Attack Path:**

| Step | Attacker Action | Finding      | Assessment   | ATT&CK Tactic   |
| ---- | --------------- | ------------ | ------------ | --------------- |
| 1    | [action]        | [finding ID] | [assessment] | TA#### [Tactic] |
| 2    | ...             | ...          | ...          | ...             |

**Why this chain is cross-domain:** [1-2 sentences explaining why no single assessment would have identified this chain: what each assessment contributes and why they are only dangerous in combination]

**Verification Test (SAFE-READONLY | SAFE-AUTHZ | DESTRUCTIVE):**
- **Preconditions:** [list]
- **Command template:**
```bash
[actionable command with placeholders only]
```
- **Expected vulnerable result:** [observable outcome]
- **Expected mitigated result:** [observable outcome]
- **Evidence to capture:** [status code, response cues, log event IDs]

**Priority elevations resulting from this chain:**
- [SR-NNN or CC-NNN]: raised, previous=[X], elevated_to=[Y], rationale=[brief]
- *(none)* if no elevations

---

## Single-Assessment Chains

[For each single-assessment chain not subsumed by a cross-domain chain, use a condensed format:]

### KC-NNN: [Chain Title] *(Source: [assessment name])*

**Chain Severity:** [severity] | **Attacker Type:** [type] | **AI-enabled variant:** [description or N/A]
**Chain-Breaking Fix:** [Single remediation]

| Step | Attacker Action | Finding | ATT&CK Tactic |
| ---- | --------------- | ------- | ------------- |
| 1    | ...             | ...     | ...           |

---

## Priority Elevations Summary

[Only include this section if any elevations occurred. Otherwise omit.]

The following SR-NNN and CC-NNN entries had their priority elevated because cross-domain kill chain analysis revealed compound severity exceeding individual-assessment scoring:

| Artifact | Previous Priority | Elevated To | Chain  | Rationale |
| -------- | ----------------- | ----------- | ------ | --------- |
| SR-NNN   | Medium            | Critical    | KC-001 | [brief]   |
| CC-NNN   | High              | Critical    | KC-001 | [brief]   |

These updates have been written to `.ai/blueteam/data/security_requirements.json` and `.ai/blueteam/data/code_changes.json`.

---

## Chain-Breaking Fix Prioritization

[If 3 or more chains share a chain-breaking fix, note it here:]

The following remediations break multiple kill chains and should be prioritized accordingly:

| Remediation                   | Breaks Chains          | Combined Severity |
| ----------------------------- | ---------------------- | ----------------- |
| [SR-NNN / CC-NNN description] | KC-001, KC-003, KC-005 | Critical          |

---

## Appendix: Finding Inventory

[Condensed table of all findings used as inputs, grouped by assessment source. Allows reviewers to verify chain inputs without reading all three reports.]

### Threat Model Findings

| Threat ID | Brief Description | ATT&CK Tactic | Priority |
| --------- | ----------------- | ------------- | -------- |
| T-001     | ...               | TA####        | P0       |

### ASVS Findings

| Finding ID  | Brief Description | ATT&CK Tactic | Severity |
| ----------- | ----------------- | ------------- | -------- |
| FINDING-001 | ...               | TA####        | Critical |

### CAS Findings

| CAS Rule | Brief Description | ATT&CK Tactic | Risk Tier |
| -------- | ----------------- | ------------- | --------- |
| AUTH-001 | ...               | TA0001        | Critical  |
```

---

## Completion Report

After all steps, output:

```
## Kill Chain Aggregation Complete

**Application:** [name]
**Date:** [YYYY-MM-DD]

**Chains identified:**
- Cross-domain chains: [N] (KC-NNN through KC-NNN)
- Single-assessment chains carried forward: [N] (KC-NNN through KC-NNN)
- Total chains in .ai/blueteam/data/kill_chains.json: [N]

**Priority elevations:**
- SR-NNN entries elevated: [N] ([list IDs if any])  ← derive N by counting SR-prefix rows in Priority Elevations table
- CC-NNN entries elevated: [N] ([list IDs if any])  ← derive N by counting CC-prefix rows in Priority Elevations table

**Tactic coverage gaps** (tactics with no finding from any assessment):
- [TA#### TacticName, or "None detected"]

**Reports written:**
- .ai/blueteam/data/kill_chains.json: [N] chains
- .ai/blueteam/data/verification_tests.json: [N] chain-level verification test entries updated
- .ai/blueteam/reports/cross_domain_kill_chains.md: written
- .ai/blueteam/reports/cross_domain_kill_chains.html: written
- .ai/blueteam/reports/security_requirements.md: written ([N] requirements)
- .ai/blueteam/reports/security_requirements.html: written
- .ai/blueteam/data/security_requirements.json: [N] entries updated (priority elevations)
- .ai/blueteam/data/code_changes.json: [N] entries updated (priority elevations)
- .ai/blueteam/data/code_changes.json: [N] entries updated (sources[] back-propagation, Step 5c)
- .ai/blueteam/data/security_requirements.json: [N] entries updated (sources[] back-propagation, Step 5c)
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

- [ ] `.ai/blueteam/reports/threat_model.md`: verified present; written by `skills/04-threat-model.md`.
- [ ] `.ai/blueteam/reports/asvs_level2_security_assessment.md`: verified present; written by `skills/05-asvs-level2-assessment.md`.
- [ ] `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md`: verified present; written by `skills/06-cas-compliance.md`.

### Outputs written by this skill

- [ ] `.ai/blueteam/data/kill_chains.json`: all chains written with `chain_breaking_fix` as a dict (`{"cc_id": "...", "description": "..."}`)
- [ ] `.ai/blueteam/data/verification_tests.json`: chain-level verification entries written/updated
- [ ] `.ai/blueteam/reports/cross_domain_kill_chains.md`: written
- [ ] `.ai/blueteam/reports/cross_domain_kill_chains.html`: generated by `generate_report_html.js`
- [ ] `.ai/blueteam/data/security_requirements.json`: updated with any priority elevations
- [ ] `.ai/blueteam/data/code_changes.json`: updated with any priority elevations
- [ ] Step 5c complete: CC/SR entries for cross-domain chains have all contributing assessments in sources[]
- [ ] `.ai/blueteam/reports/security_requirements.md`: written (Step 7)
- [ ] `.ai/blueteam/reports/security_requirements.html`: generated by `generate_report_html.js` (Step 7)

### Verification command

Run the following at the repository root to confirm no files are missing:

```bash
node <BlueTeam>/scripts/validate_reports.js --repo-root /path/to/repo
```

If `validate_reports.js` reports missing files, generate them before exiting.
