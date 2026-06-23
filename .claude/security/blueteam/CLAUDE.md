# BlueTeam Security Assessment Agent: Mandatory Execution Protocol

This directory contains the BlueTeam security assessment framework. Before generating
**any** output, you MUST follow the protocol below. Skipping any step is a skill execution
error and will produce incorrectly named files, missing artifacts, and a broken report suite.

---

## Requirements Mode (skills/13-requirements-map.md + threat model)

Requirements Mode is activated automatically when `application_map.json` has `source: "requirements"`. This occurs when `skills/13-requirements-map.md` generates the map (rather than `skills/01-application-map.md`).

| Rule | Standard assessment | Requirements Mode |
|------|--------------------|--------------------|
| Source of DFD data | Code + `application_map.json` | Requirements docs + `application_map.json` |
| DFD label | [none] | `[Design-Level: Not Code-Verified]` |
| Section 7 content | Vulnerable Code Examples | Design Threat Instances (no code snippets) |
| CC entries (code changes) | Required | **Not produced**, so skip Phase 6 Steps 2-5 |
| SR entries (requirements) | Required | Required (each Design Threat Instance → SR entries) |
| SR `design_mode` flag | Not used | `"design_mode": true` in `sources[]` |
| Run `validate_reports.js` | Required | Required (validator already handles 0 CC entries; exits 0) |
| Run `generate_overview_html.js` | Required for full suite | Safe to skip if only threat model has run |

**No special handling needed in HTML generation.** `generate_report_html.js` works normally. `validate_reports.js` already handles 0 CC entries (exits 0 with no WARN). `generate_overview_html.js` already degrades gracefully when `code_changes.json` has 0 entries.

---

## Shared Preflight (shared/skills/preflight.md)

The preflight must be loaded first by all assessment skills. As of v1.1.0 it centralises:

| Preflight step | What it establishes |
|---|---|
| Step 1: baseline | `shared/reference/environment-baseline.md` loaded up to the `> **NON-ASVS SKILLS: STOP READING HERE.**` marker; infrastructure assumptions recorded (ASVS Chapter Assumption Mapping section is NOT loaded by the preflight; the ASVS orchestrator loads it separately) |
| Step 2: Controls file | `shared/schemas/controls-yaml.md` loaded; `.ai/controls.yaml` parsed if present |
| Step 3: RA register | `.ai/blueteam/data/risk_acceptances.json` read (if present); non-suppressible list and finding-level RA check procedure established |
| Step 4: App map check | Application map freshness evaluated; `application_map_state` set |

**Finding-level RA check.** The complete procedure (including the non-suppressible finding type list) now lives in preflight Step 3. Assessment skills reference it with one line: "Apply the RA check from preflight Step 3 when writing each finding." **Do not re-add inline RA loading sections** to assessment skills; the preflight is the authoritative source.

**CAS Builder selective loading.** `skills/15-cas-compliant-builder.md` v1.1.0 loads only the `Platform Context` section plus the relevant domain section(s) from `shared/reference/cas-rule-definitions.md`. Do NOT load the full file (105 KB) for builder invocations.

**CAS Severity Escalation Rules.** `skills/06-cas-compliance.md` has a dedicated *Severity Escalation Rules* table that elevates baseline tiers when the runtime context warrants. Critical triggers: multi-tenant OIDC misconfiguration (`MICROSOFT_TENANT_ID === 'common'` or `tid` claim not validated → IDPV-001 escalates Low → High; combined with Protected B → Critical), social IdP wired to an organizational service (IDPV-001 → Critical), role-hierarchy DB/code mismatch (AUTHZ-005 → Critical), Protected B at rest in unencrypted JSONB / TEXT (ENC-002 → Critical), auth-lifecycle endpoint missing the canonical middleware chain. Document the escalation reason in the finding's `notes` field. This closes the original parity gap with the original implementation where the same baseline rules were left under-escalated by Node's CAS agent.

**ASVS chapter stop markers.** All 14 `asvs_chapters/asvs_v[N]_*.md` files have a `> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.**` marker immediately before `## Secure Implementation Guide`. The ASVS assessment orchestrator stops at this marker; the builder skill reads past it (needs implementation patterns). Saves ~1,907 lines per full ASVS Phase 2 run.

**`environment-baseline.md` stop marker.** `shared/reference/environment-baseline.md` has a `> **NON-ASVS SKILLS: STOP READING HERE.**` marker before `## ASVS Chapter Assumption Mapping` (~line 195). All non-ASVS skills and the preflight stop here; the ASVS orchestrator reads the full file. Saves ~254 lines (~17 KB) per non-ASVS invocation.

---

## Builder Skills (skills/14-asvs-compliant-builder.md / skills/15-cas-compliant-builder.md)

Builder skills generate ASVS- or CAS-compliant code. They operate differently from assessment skills:

| Rule | Assessment skills | Builder skills |
|------|------------------|----------------|
| Write `.ai/blueteam/data/` artifacts | Required | **Not applicable** (outputs code into target repo) |
| Run `generate_report_html.js` | Required for `.html` output | **Not applicable** |
| Run `validate_reports.js` after | Required | **Not applicable** |
| `outputs:` block in skill file | Present | Empty (builder outputs are code files) |

When running a builder skill, skip steps 2-4 of the Pre-Execution Checklist below. The only
required step is reading the skill file itself (step 1). After generating code, append the
ASVS Coverage or CAS Coverage table to the response as instructed in the skill.

---

## Pre-Execution Checklist (required before every skill run)

Before writing any file, complete the following steps **in order**:

1. **Read the target skill file** (`<skill_name>.md` in this directory).
2. **Note the `outputs:` block.** This defines the EXACT filenames to write. Do not
   invent names. Every skill's `outputs:` block is the authoritative source of truth.
   *(Builder skills have an empty `outputs:` block; see Builder Skills section above.)*
3. **Note required JSON data artifacts.** Each skill lists what it must write to
   `.ai/blueteam/data/`. Produce every listed artifact or the downstream overview report will break.
4. **For HTML generation**: run the Python script; do not hand-craft HTML.

---

## HTML Generation Rules (mandatory)

| Report type | Tool to use |
|---|---|
| All individual assessment reports (`threat_model.html`, `asvs_level2_security_assessment.html`, etc.) | `node scripts/generate_report_html.js --repo-root <repo>` |
| Security overview SPA (`security_overview.html`) | `node scripts/generate_overview_html.js --repo-root <repo>` |
| Security requirements report (`security_requirements.md` + `.html`) | `node scripts/generate_requirements_report.js --repo-root <repo>` |
| Code changes report (`code_changes.md` + `.html`) | `node scripts/generate_code_changes_report.js --repo-root <repo>` |

**Never write HTML by hand.** The Node.js scripts apply the CSS template, inject
`Show fix` blocks from `code_changes.json`, handle `[REDACTED-*]` chip rendering, and
maintain structural consistency. Hand-crafted HTML will fail the structural verification
checks in `skills/12-security-overview-report.md § Phase 4`.

---

## Required Output Filename Reference

Read the `outputs:` block of each skill for the authoritative filename. Common errors:

| WRONG (invented name) | CORRECT (from `outputs:` block) |
|---|---|
| `kill_chain_aggregator.md` | `cross_domain_kill_chains.md` |
| `dr_bcp_resilience_assessment.md` | `dr_resilience_assessment.md` |
| `security_overview_report.html` | `security_overview.html` (SPA, not flat HTML) |

---

## Required JSON Data Artifacts

Every skill that produces code changes or security requirements **must** write to
`.ai/blueteam/data/`. These files are consumed by `generate_overview_html.js`; if they are
absent, the overview report will be empty or broken.

| Skill | Must write to `.ai/blueteam/data/` |
|---|---|
| Threat Model, ASVS Level 2, CAS | `code_changes.json`, `security_requirements.json`, `verification_tests.json` |
| Application Map | `application_map.json`, `app_topology.json` |
| Security Architecture Design | `security_architecture.json`, `security_requirements.json` (SR entries extracted from SA-NNN gaps; merged/appended; no CC entries produced) |
| Kill Chain Aggregator | `kill_chains.json`, updates `verification_tests.json` with chain-level checks |
| DR Resilience Analysis | `dr_resilience_assessment.json` |
| Security Tool Scanner | `security-scan-results.json` |
| Classification (Threat Model Step 0.4) | `security-classification.yaml`, `security-classification-details.yaml` |

### app_topology.json zone fields (required)

Every zone object in `app_topology.json` MUST include `fill` and `label_color`. Missing
these fields causes `generate_overview_html.js` to crash with `KeyError: 'fill'`.

Standard zone values (from `shared/schemas/application-map.md`):

```json
[
  {"id": "internet",  "label": "Internet Zone (Untrusted)", "fill": "#f0f0f8", "label_color": "#445"},
  {"id": "cloud_lz",  "label": "Cloud Landing Zone - Kubernetes",        "fill": "#eaf3fb", "label_color": "#1a3a5c"},
  {"id": "on_prem",   "label": "On-Premises",           "fill": "#f0f5f0", "label_color": "#1a3a1a"}
]
```

For non-standard deployments, choose hex colours appropriate to the trust level and
include both `fill` and `label_color` in every zone.

### Optional Application Team Files (read by all assessment skills)

These files may be provided by the application team to tune assessment results. Assessment
skills read them automatically when present; they are never generated by assessment agents.

| File | Purpose |
|---|---|
| `.ai/blueteam/data/controls.yaml` | Compensating controls declaration; schema in `shared/schemas/controls-yaml.md`. Annotate specific findings with inline review notes, compensating control descriptions, or known-false-positive explanations. |
| `.ai/blueteam/data/app_cloud_environment.json` | Optional cloud DR declaration for when cloud DR settings are not visible in source but are known by the team. Used by the DR Resilience Analysis skill. |
| `.ai/blueteam/data/risk_acceptances.json` | Risk acceptance register; see `RISK_ACCEPTANCE_GUIDE.md`. Accepted findings appear in an appendix rather than disappearing. |
| `shared/reference/environment-baseline.md` | deployment environment baseline; do not modify. Defines infrastructure-level controls assumed present in all deployments. Prevents false positives on controls enforced by organizational policy but not visible in source. |

---

## Skill Execution Order

Run skills in this sequence. Steps 3-5 may run in any order, but all must complete
before Step 6:

1. `skills/01-application-map.md` (or let Threat Model trigger it automatically)
2. `skills/02-security-classification.md` (Threat Model Step 0.4)
3. `skills/03-security-architecture.md` (**optional but recommended**; reads `application_map.json` + any requirements docs; writes `security_architecture.json`; informs threat model with pre-identified architectural gaps)
4. `skills/04-threat-model.md`
5. `skills/06-cas-compliance.md`
6. `skills/05-asvs-level2-assessment.md`
7. `skills/07-kill-chain-aggregator.md` (requires steps 4-6 complete)
8. `skills/10-dr-resilience.md` (may run in parallel with steps 4-7)
9. **`scripts/security-pipeline.js`**: **MANDATORY deterministic scanning** (may run in parallel with steps 4-8)
10. `skills/09-security-unit-tests.md`
11. `skills/11-code-fix-generation.md`: **optional post-processing**; run when `validate_reports.js`
    reports `WARN N/M CC entries missing replacement_code`. Populates `replacement_code` in
    `code_changes.json` so that "Show fix" blocks appear in the Remediation Plan tab.
    Safe to skip if all CC entries already have `replacement_code` populated.
12. `skills/12-security-overview-report.md`: FINAL; requires all upstream artifacts

---

## MANDATORY: Deterministic Script Execution

**AI analysis alone is NOT sufficient.** Every assessment MUST include deterministic tool
scanning AND script-generated reports. The following scripts are NON-OPTIONAL and must be
executed after the AI assessment skills produce their artifacts:

### Step A: Security Tool Pipeline (replaces manual tool installation)

```bash
cd <blueteam-directory>
npm install                    # Install all dependencies including security tools
node scripts/security-pipeline.js --all --repo-root <target-repo>
```

This runs three scanners against the target codebase (npm audit + secretlint + ESLint with security plugins)
and produces `.ai/blueteam/data/security-scan-results.json` with deterministic findings that AI
analysis may miss. **Do not skip this step.**

The ESLint phase wires `@typescript-eslint/parser` for `.ts` / `.tsx` / `.d.ts` files,
so TypeScript source is fully parsed (not flagged as syntax errors). Without this, every
`.ts` file shows up as `Parsing error: Unexpected token :` and the real security findings
get drowned. The parser is bundled as a devDependency of the blueteam package so no
target-side install is required.

### Step B: HTML Report Generation (after all .md reports are written)

```bash
node scripts/generate_report_html.js --repo-root <target-repo>
node scripts/generate_requirements_report.js --repo-root <target-repo>
node scripts/generate_code_changes_report.js --repo-root <target-repo>
node scripts/generate_overview_html.js --repo-root <target-repo>
```

### Step C: Validation (MUST pass before assessment is declared complete)

```bash
node scripts/validate_reports.js --repo-root <target-repo>
```

If the validator reports FAIL issues, fix them and re-run. The assessment is NOT complete
until validation passes. WARN issues (e.g., missing `replacement_code`) are acceptable.

### JSON Artifact Format Requirements

All JSON data artifacts MUST use wrapped object format, not raw arrays:
- `code_changes.json`: `{"entries": [...], "generated_by_assessments": [...], "generated_at_date": "..."}`
- `security_requirements.json`: `{"requirements": [...], "generated_by_assessments": [...], "generated_at_date": "..."}`
- CC entries MUST include: `change_type` (fix|add|remove|refactor), `related_requirement_ids`
- SR entries MUST include: `related_code_change_ids`

Raw arrays will cause `generate_overview_html.js` and `generate_requirements_report.js`
to crash.

---

## Post-Execution Validation

After all skills have run, validate the output:

```bash
node scripts/validate_reports.js --repo-root <repo>
```

Expected output: `RESULT: All N report file(s) present. No broken links.`

If the validator reports issues, fix them before declaring the assessment complete. Do
not proceed to the security overview until the validator passes.

The validator checks:
- All 9 required `.md`/`.html` report pairs are present
- Optional `.md` files have paired `.html` files
- All internal links in `security_overview.html` resolve to real files
- Required JSON data artifacts are present given the existing reports
- `app_topology.json` zone objects have `fill` and `label_color` fields
- CC entries with missing `replacement_code` (**WARN only**, exits 0; run `skills/11-code-fix-generation.md` to fix)
- CC entry field names in `code_changes.json` are canonical: `file_path`, `line_reference`, `description`, `change_type` (one of `fix|add|remove|refactor`), `related_requirement_ids` (**FAIL**, exits 1 if wrong aliases like `file`, `line_range`, `change_description` are used, or required fields are absent; causes Quick Reference, File Hotspots, and card bodies to render empty)
- SR entry field names in `security_requirements.json` are canonical: `related_code_change_ids` not `related_code_changes` (**FAIL**, exits 1 if wrong alias used)
- `sources[].assessment` values in `code_changes.json` / `security_requirements.json` are from the canonical set (**FAIL**, exits 1 if non-canonical; non-canonical names cause ASVS/CAS verdicts to silently show "Pass")

---

## Common Failure Modes (from regression analysis)

The following are confirmed real-world failure modes that have occurred in past sessions.
Each is detectable by `validate_reports.js` after the fix above.

| Failure | Root cause | Prevention |
|---|---|---|
| Wrong report filename | `outputs:` block not read | Read skill file before generating |
| Missing `code_changes.json` | Skill output schema not followed | Check `outputs:` block for all artifact files |
| Hand-crafted HTML | Node.js script not run | Always run `generate_report_html.js` |
| `security_overview.html` is flat HTML | `skills/12-security-overview-report.md` not read | Read Phase 4 of the skill (it's a 10-tab SPA) |
| `security-classification.md` missing | Classification skill Phase 4 skipped | Execute Phase 4 of `skills/02-security-classification.md` |
| `KeyError: 'fill'` in overview generator | `app_topology.json` zones missing `fill` | Include `fill` and `label_color` in every zone |
| "Show fix" blocks absent from Remediation tab | `replacement_code` not populated in `code_changes.json` | Run `skills/11-code-fix-generation.md` after assessment skills complete |
| `security_requirements.md` count inconsistencies | MD regenerated by hand; JSON key named `entries` instead of `requirements` | Use `scripts/generate_requirements_report.js` for all MD regeneration; use canonical key `requirements` |
| `code_changes.md` shows fewer entries than overview report | `code_changes.md` was written by one skill only; later skills (CAS, ASVS) added CC entries only to JSON | Run `scripts/generate_code_changes_report.js --repo-root <repo>` after all assessment skills complete to regenerate from the full JSON |
| ASVS/CAS verdict shows "Pass" in overview when detailed report shows "Fail" | `sources[].assessment` written with short/wrong name (e.g. `asvs_level2`, `cybersecurity_architecture_standards`) | Use canonical names: `asvs_level2_security_assessment`, `cybersecurity_architecture_standard_compliance`; validator now checks this and exits 1 |
| Quick Reference file/line/type/requirements columns all show placeholder dashes; Detailed Change card body blank; no SR cross-ref links | CC entry field names wrong: `file` instead of `file_path`; `line_range` instead of `line_reference`; `change_description` instead of `description`; `change_type` and `related_requirement_ids` absent | Use exact schema names from `shared/schemas/artifacts.md`; validator now checks this and exits 1 |
| SR cards show no "Related changes: CC-NNN" back-links | SR entry uses `related_code_changes` instead of `related_code_change_ids` | Use `related_code_change_ids`; validator now checks this and exits 1 |
| CAS compliance chip bar shows wrong fail/pass/risk counts | (1) `<!-- chip-source -->` placed before a section heading; regex previously required `<table>` immediately after comment; now fixed to allow any HTML between comment and table. (2) AI skill wrote wrong counts in Section 7 Verdict Summary and Section 18 chip-source table (WEB-001 had a placeholder-dash priority hiding Medium/Low risks; Section 3 listed NON-COMPLIANT item as COMPLIANT; ASSUMED COMPLIANT count was off) | After writing Section 18, verify: `NON-COMPLIANT` count equals body Section 2 findings; `COMPLIANT` count equals items not in Section 2; no rule row uses a placeholder-dash priority unless it is genuinely not NON-COMPLIANT; Section 7 counts match Section 18 exactly |
| ASVS detail report Assessment Summary counts wrong | AI skill wrote incorrect total/severity breakdown in the Assessment Summary table (e.g. Medium: 5 when only 4 medium findings in body) | After writing all findings, count each severity level from the body and write those counts; do not estimate |
| Kill chain exec summary SR/CC counts wrong | LLM wrote elevation counts freehand instead of counting from Priority Elevations table | Derive counts by counting table rows (SR-prefix → SR count, CC-prefix → CC count); validator checks `kill_chains.json` elevation count vs. MD table |
| ASVS chapter summary footer counts wrong | LLM estimated FAIL/PARTIAL counts instead of counting from chapter table rows | After writing chapter table, count FAIL/PARTIAL/ASSUMED PASS rows and write exact numbers; validator checks footer vs. table |
| CAS compliance Total row arithmetic wrong | LLM summed columns freehand | After writing compliance table, sum each column from data rows and write Total row; validator checks arithmetic |
| Attack Chains tab shows wrong KC IDs/titles/severities | LLM sourced kill chains from `threat_model.md` or `cross_domain_kill_chains.md` instead of `kill_chains.json` | Source ALL KC data exclusively from `kill_chains.json`; validator checks overview KC IDs against JSON |
| `security_requirements.md` shows wrong title ("Child Care Designated Services") and blank dates; CAS Rules / ASVS columns show placeholder dashes | `generate_requirements_report.js` had hardcoded subtitle and wrong field names (`cas_rules`→`cas_rules`, `asvs_requirements`→`asvs_refs`, `requirement_text`→`normative_text`, `last_updated`→`generated_at_date`) | Fixed in script; regenerate with `scripts/generate_requirements_report.js --repo-root <repo>` |
| `security_requirements.md` has fewer entries than JSON | CAS/ASVS skills add SR entries to JSON after the initial threat model run; MD is not auto-regenerated | Run `scripts/generate_requirements_report.js --repo-root <repo>` after all assessment skills complete |
| Gap Severity Distribution table in Security Architecture tab shows all zeros | `security_architecture.json` gaps use Title Case or non-canonical `category` values (e.g. `"Authorization"` instead of `"authorization_model"`, `"Configuration"` with no canonical match). `generate_overview_html.js` uses exact string matching against its internal `_CATEGORIES` list -- non-matching gaps are silently dropped. `validate_reports.js` now detects this and exits 1 | Use canonical snake_case category names from skill Phase 5.3: `authentication` | `authorization_model` | `data_protection` | `perimeter` | `logging` | `api_architecture` | `profile` |
