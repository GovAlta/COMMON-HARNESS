---
id: dr-resilience-analysis
name: DR Resilience Analysis Skill
description: Assesses disaster recovery and business continuity resilience from repository evidence and produces scored DR gaps and recommendations in machine-readable and report formats.
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
  - cloud-environment-baseline
  - ai-artifacts-schema
  - blue-team-shared-security-preflight
upstream:
  - ref: blue-team-shared-security-preflight
    artifacts: []
  - ref: app-cloud-environment
    artifacts:
      - .ai/blueteam/data/app_cloud_environment.json
outputs:
  - artifact: .ai/blueteam/data/dr_resilience_assessment.json
    format: json
  - artifact: .ai/blueteam/reports/dr_resilience_assessment.md
    format: markdown
  - artifact: .ai/blueteam/reports/dr_resilience_assessment.html
    format: html
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must load shared/skills/preflight.md before assessment setup.
  - Must load risk acceptances before writing gap findings when file exists.
  - Must determine cloud context before scoring dimensions.
---

## Shared Preflight (Load First)

Before DR evidence scoring starts, load `shared/skills/preflight.md` and reuse its preflight outcomes (baseline assumptions, controls status, risk-acceptance mode). The setup sections below are preserved and can be treated as inherited context after preflight.

## Purpose

This skill evaluates disaster recovery (DR) and business continuity resilience as a cybersecurity domain for applications.

It MUST produce:
- `.ai/blueteam/data/dr_resilience_assessment.json` (machine-readable)
- `.ai/blueteam/reports/dr_resilience_assessment.md` (human-readable)
- `.ai/blueteam/reports/dr_resilience_assessment.html` (human-readable HTML paired with `.md`)

The output is consumed by `skills/12-security-overview-report.md` under the **Resiliency & DR** tab.

This skill MUST apply `shared/reference/environment-baseline.md` (stop at the `> **NON-ASVS SKILLS: STOP READING HERE.**` marker; the ASVS Chapter Assumption Mapping section is not needed) and `shared/reference/cloud-environment-baseline.md` when evaluating inherited environment resilience controls.

---

## Input Discovery Scope

Assess the current repository for resilience evidence across:

1. Application resilience controls
2. Backup implementation
3. Recovery implementation
4. Infrastructure resilience
5. DR/BCP documentation
6. RTO/RPO definitions and evidence

Inspect files in likely locations including `docs/`, `scripts/`, `ops/`, `backup/`, `infrastructure/`, `terraform/`, `cloudformation/`, `k8s/`, `helm/`, and deployment manifests.

Also inspect optional cloud declaration files:
- `.ai/blueteam/data/app_cloud_environment.json` (preferred)
- `.ai/blueteam/data/app_cloud_environment.md`

If both are present, prefer JSON.

---

## Risk Acceptance (Pre-Assessment)

> **RA register loaded in preflight.** `shared/skills/preflight.md` Step 3 has loaded `.ai/blueteam/data/risk_acceptances.json` (if present), recorded all RA entries, and established the finding-level RA check procedure. Apply that procedure when writing each DRG-NNN gap entry. Note that Critical DR gaps are in the non-suppressible list established by the preflight. Any suppression attempt for a Critical gap results in a `SUPPRESSION_REJECTED` flag and the gap remains in the main findings section. Full Step 13 processing completes at the end of this skill run.

---

## Scoring Model (100 points)

Use the following dimensions:

| Dimension                 | Max Points |
| ------------------------- | ---------- |
| Application Resilience    | 20         |
| Backup Implementation     | 20         |
| Recovery Implementation   | 20         |
| Infrastructure Resilience | 20         |
| DR/BCP Documentation      | 20         |

Score interpretation:

| Score Range | Rating    | Risk Level |
| ----------- | --------- | ---------- |
| 85-100      | Excellent | Low        |
| 70-84       | Good      | Low-Medium |
| 50-69       | Moderate  | Medium     |
| 30-49       | Poor      | High       |
| 0-29        | Critical  | Critical   |

Gap severity mapping by dimension score:
- `<25%` = `critical`
- `<50%` = `high`
- `<75%` = `medium`
- `<100%` = `low`

### Evidence-Weighted Credit (Cloud Controls)

When scoring cloud-hosted resilience controls (backup, PITR, failover, region/AZ resilience, managed recovery), assign points by evidence confidence:

- `observed` (in-repo technical evidence): multiplier `1.0`
- `declared` (from `app_cloud_environment.*`): multiplier `0.6`
- `assumed` (provider capability only): multiplier `0.0`

Rules:
- A provider must be evidenced in repo before provider-related controls can receive any credit
- Declared controls can earn partial credit only if provider usage is evidenced in repo
- Provider reputation or generic capability alone cannot earn control points

Examples:
- Supabase endpoint in repo + PITR declared in `app_cloud_environment.json` => partial PITR credit
- Mention of Lovable in stakeholder note but no repo evidence => no hosting resilience credit

---

## Detection Guidance (Condensed)

Before dimension scoring, establish cloud context:

1) Detect provider usage in repo (URLs, SDK imports, connection strings, deployment metadata)
2) Read `app_cloud_environment.*` if present
3) Apply `shared/reference/cloud-environment-baseline.md` to classify controls as observed, declared, or assumed

If deployment appears to be Cloud Landing Zone in Canada Central and is evidenced in repo, baseline platform controls may be credited using evidence-weighted rules.

### 1) Application Resilience
Look for: circuit breakers, retries/backoff, timeout controls, health/liveness/readiness checks, graceful degradation/fallbacks.

### 2) Backup Implementation
Look for: database backup scripts/jobs, storage backup workflows, snapshots, schedules, retention policies, integrity verification.

### 3) Recovery Implementation
Look for: restore scripts, snapshot recovery, point-in-time recovery, failover/switchover automation, tested runbooks.

### 4) Infrastructure Resilience
Look for: multi-AZ, multi-region, load-balancer failover, replication, DR-related IaC resources, stateless architecture patterns.

### 5) DR/BCP Documentation
Look for: DR plans, BCP documents, failover procedures, escalation/contacts, business impact analysis.

### 6) RTO/RPO
Extract explicit RTO/RPO values where available. If absent, flag as a gap with recommendation.

RTO/RPO inference order:
1. Explicit app values from repo artifacts
2. Declared values from `app_cloud_environment.*`
3. Inferred baseline values from `shared/reference/cloud-environment-baseline.md` only when Cloud Landing Zone usage is observed/declared
4. Otherwise mark as not defined

---

## Required Machine-Readable Output

Write `.ai/blueteam/data/dr_resilience_assessment.json` with this schema:

```json
{
  "schema_version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "assessment_name": "dr_resilience_analysis",
  "application_name": "string",
  "overall_score": 0,
  "overall_rating": "excellent | good | moderate | poor | critical",
  "overall_risk": "low | medium | high | critical",
  "dimensions": [
    {
      "key": "application_resilience | backup | recovery | infrastructure | documentation",
      "label": "string",
      "score": 0,
      "max_score": 20,
      "summary": "string",
      "evidence": [
        {
          "title": "string",
          "status": "implemented | partial | missing",
          "paths": ["relative/path"],
          "notes": "string"
        }
      ]
    }
  ],
  "rto_rpo": {
    "rto_defined": false,
    "rpo_defined": false,
    "rto_values": ["string"],
    "rpo_values": ["string"],
    "notes": "string"
  },
  "gaps": [
    {
      "id": "DRG-001",
      "title": "string",
      "severity": "critical | high | medium | low",
      "category": "application_resilience | backup | recovery | infrastructure | documentation | rto_rpo",
      "current_state": "string",
      "target_state": "string",
      "evidence_paths": ["relative/path"],
      "business_impact": "string"
    }
  ],
  "recommendations": [
    {
      "id": "DRR-001",
      "priority": "p1 | p2 | p3 | p4",
      "timeline": "1-2 weeks | 2-4 weeks | 1-3 months | 3-6 months",
      "title": "string",
      "description": "string",
      "addresses_gap_ids": ["DRG-001"],
      "estimated_effort": "string"
    }
  ],
  "metadata": {
    "repo_commit": "string or null",
    "tools_used": ["manual-review"],
    "assumptions": ["string"],
    "cloud_evidence_summary": {
      "providers_observed": ["string"],
      "providers_declared": ["string"],
      "controls_observed_count": 0,
      "controls_declared_count": 0,
      "controls_assumed_count": 0
    }
  }
}
```

ID rules:
- `DRG-NNN` for gaps, sequential from 001
- `DRR-NNN` for recommendations, sequential from 001

---

## Required Human-Readable Reports

Write `.ai/blueteam/reports/dr_resilience_assessment.md` with sections:

0. Scope Notice banner at top (before Assessment Summary)
1. Assessment Summary
2. Resilience Scorecard (dimension table)
3. RTO/RPO Analysis
4. Potential Gaps and Indicators (by severity)
5. Prioritized Recommendations
6. 90-Day Action Plan
7. Evidence Index (path list)

Report tone requirements:
- Use evidence-based wording and avoid definitive claims when based only on repository review
- Prefer phrasing such as "potential", "appears", "not evidenced in reviewed repository artifacts", and "based on available repo evidence"
- Include a short interpretation note stating that external cloud console settings may change conclusions

### Section 4 heading and gap heading conventions

The Section 4 heading MUST be written exactly as:

```
## 4. Potential Gaps (given evidence in repo)
```

Gap headings (`#### DRG-NNN: ...`) fall into two categories with different scoping requirements:

**Absent-artifact gaps**: the real control might plausibly exist outside the repository (e.g., backup schedules managed by infrastructure, DR docs stored in SharePoint, RTO/RPO defined in a STRA, Functions retry in a console-configured setting, autoscaling applied via the cloud console). These gap headings MUST include an explicit repo-scope qualifier:

| Gap category | Required qualifier pattern |
|---|---|
| Backup scripts / schedules | "...found in repo" |
| DR / BCP documentation | "...found in repository" |
| RTO / RPO definitions | "...in any repo artifact" |
| Functions retry / host.json | "...evidenced in repo" |
| HPA / autoscaling manifests | "...found in repo" |

**Direct code-evidence gaps**: the absence is determined from observable source code or IaC (e.g., `replicas: 1` in a template, no Polly import in code, no health endpoint registration). These headings are already accurately scoped by the code reference and do not require an additional qualifier.

Mandatory top banner text intent (Markdown and HTML):
- Indicate the assessment is based on code/repository scan evidence only
- Indicate resilience conclusions may be incomplete where controls are configured outside source control

Then generate `.ai/blueteam/reports/dr_resilience_assessment.html` by running `generate_report_html.js` (see **HTML Report Generation** at the end of this skill file).

Both files MUST be written in the same run.

---

## Overview Integration Contract

The DR artifact is consumed by `skills/12-security-overview-report.md`.

Always include the following fields for overview tab rendering:
- `overall_score`
- `overall_rating`
- `overall_risk`
- `dimensions[]`
- `rto_rpo`
- `gaps[]`
- `recommendations[]`

Severity values for `gaps[]` MUST use exactly: `critical`, `high`, `medium`, `low`.

---

## Recommendation Priority Mapping

| Gap Severity | Recommendation Priority | Timeline   |
| ------------ | ----------------------- | ---------- |
| critical     | p1                      | 1-2 weeks  |
| high         | p2                      | 2-4 weeks  |
| medium       | p3                      | 1-3 months |
| low          | p4                      | 3-6 months |

---

## Risk Acceptance Processing (Post-Assessment)

After writing `.ai/blueteam/reports/dr_resilience_assessment.md` and `.ai/blueteam/data/dr_resilience_assessment.json`, follow **Step 13** of `shared/schemas/artifacts.md` (§ "Extraction Phase Instructions") exactly.

For this skill: the "current assessment identifier" is `dr_resilience_analysis`, and "findings" are DRG-NNN gaps. Scope matching uses `scope.file_path` and `scope.line_reference` where applicable; for broad architectural gaps (e.g., no backup policy document), `scope.line_reference` may be `null`.

If `.ai/blueteam/data/risk_acceptances.json` does not exist, skip Step 13 entirely.

---

## Code-Addressable Gap Classification

Not all DR gaps are equally actionable by developers. Before writing gaps, classify each one:

| Type | Definition | SR + CC required? |
|---|---|---|
| **Code-addressable** | The gap is observable in source code or IaC and can be fully remediated by a developer writing or modifying code (e.g., missing Polly retry, no health endpoint, missing `EnableRetryOnFailure()`, missing `host.json` retry policy) | **Yes**: generate SR + CC entries |
| **Infrastructure-only** | The gap can only be remediated outside source control (e.g., backup schedule configured in Azure portal, pod replica count set via OpenShift console, RTO/RPO defined in STRA/BCP document, DR plan in SharePoint) | No, recommendation only |
| **Hybrid** | Partially code-addressable (e.g., a health endpoint must be coded AND wired to OpenShift probes in the deployment template) | **Yes**: generate SR + CC for the code portion; recommendation for the infra/config portion |

### SR and CC generation rule

For every **code-addressable** or **hybrid** gap identified in this assessment, you MUST generate:

1. A `SR-NNN` entry in `.ai/blueteam/data/security_requirements.json` with `"assessment": "dr_resilience_analysis"` in `sources[]` and the DRG-NNN ID as `finding_id`.
2. Where a specific file and change are identifiable: a `CC-NNN` entry in `.ai/blueteam/data/code_changes.json` with `"assessment": "dr_resilience_analysis"` in `sources[]` and the new SR-NNN in `related_requirement_ids[]`.

Use the `shared/skills/requirements-updater.md` skill to merge these entries correctly.

Common code-addressable DR gap categories:
- Missing application-layer retry / circuit breaker / timeout policies (e.g., Polly, host.json retry)
- Missing health / liveness / readiness endpoints
- Missing database retry-on-failure configuration (e.g., EF Core `EnableRetryOnFailure()`)
- Missing dead-letter queue / poison message handling in Azure Functions
- Single-replica deployment IaC with no autoscaling manifest in repo

---

## Completion Checklist

Before completing, verify:

- `.ai/blueteam/data/dr_resilience_assessment.json` written and valid
- `.ai/blueteam/reports/dr_resilience_assessment.md` written
- `.ai/blueteam/reports/dr_resilience_assessment.html` written
- Cloud controls scored using observed/declared/assumed weighting
- `gaps[]` and `recommendations[]` IDs are sequential and unique
- Every recommendation maps to at least one gap via `addresses_gap_ids`
- Report includes explicit RTO/RPO state (defined or not defined)
- Risk acceptance processing completed (or skipped with note if register absent)
- Section 4 heading is exactly `## 4. Potential Gaps (given evidence in repo)`
- Absent-artifact gap headings (backup, DR docs, RTO/RPO, Functions retry, HPA) include a repo-scope qualifier per the heading conventions table above
- Gap titles in `.ai/blueteam/data/dr_resilience_assessment.json` match the headings in the `.md` report
- **SR/CC completeness**: Every code-addressable or hybrid gap has a corresponding SR entry in `.ai/blueteam/data/security_requirements.json`. Count code-addressable + hybrid gaps; count SR entries with `"assessment": "dr_resilience_analysis"` in `sources[]`; the numbers MUST match.

---

## Completion Output

Return a brief summary:

```markdown
## DR Resilience Assessment Complete

- Overall score: [N]/100 ([rating])
- Overall risk: [low/medium/high/critical]
- Gaps: [N] ([critical] critical, [high] high, [medium] medium, [low] low)
- Recommendations: [N] (P1 [N], P2 [N], P3 [N], P4 [N])
- Artifacts written:
  - .ai/blueteam/data/dr_resilience_assessment.json
  - .ai/blueteam/reports/dr_resilience_assessment.md
  - .ai/blueteam/reports/dr_resilience_assessment.html
- Risk acceptances: [N active, N pending, N expired | skipped (no risk_acceptances.json)]
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
