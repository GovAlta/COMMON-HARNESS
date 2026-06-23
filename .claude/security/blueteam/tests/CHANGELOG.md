# Test Suite Changelog

## 2026-03-21: v1.13.0

### Added
- `scripts/validate_reports.py`: new `_check_sa_gap_enum_values()` check: validates that
  `security_architecture.json` uses canonical snake_case enum values for all structured fields.
  Exits 1 (FAIL) if non-canonical values are found.
  - `gaps[].category` must be one of: `authentication` | `authorization_model` |
    `data_protection` | `perimeter` | `logging` | `api_architecture` | `profile`
  - `gaps[].severity` must be one of: `Critical` | `High` | `Medium` | `Low`
  - `gaps[].status` must be one of: `open` | `risk_accepted`
  - `mode` must be one of: `full` | `describe` | `design` | `minimal`
  - `profile` must be one of: `internal` | `public` | `dual` | `custom` | `unknown`
  - `profile_confidence` must be one of: `high` | `medium` | `low`
- `tests/unit/test_validate_reports.py`: 2 new regression tests:
  - `test_sa_gap_enum_values_canonical_exits_zero`: all canonical values -> exit 0
  - `test_sa_gap_non_canonical_category_exits_one`: Title Case / unknown category values
    (e.g. `"Authorization"`, `"Configuration"`) -> exit 1 with FAIL; canonical gap SA-003 must
    not appear in error output; error message cites silent exclusion from Gap Severity
    Distribution table

### Why
`generate_overview_html.py _tab_security_arch()` builds the Gap Severity Distribution table
using exact string matching against its internal `_CATEGORIES` list. Non-canonical values
(e.g. `"Authorization"` instead of `"authorization_model"`) pass silently: every cell shows 0
and the table appears empty. This went undetected in a previous assessment run where the
originating LLM agent used display names instead of the canonical enum strings, causing the
Security Architecture tab in `security_overview.html` to show a blank distribution table.
The validator now catches this at post-run validation time, before the HTML is used.

---

## 2026-03-21: v1.12.0

### Added
- `tests/unit/test_orchestrator_skill.py`: 6 structural tests verifying `blue-security-orchestrator.md` correctly includes Security Architecture Design skill:
  - `test_orchestrator_file_exists`: file present at expected path
  - `test_sa_ref_in_frontmatter`: `security-architecture-design` in YAML frontmatter references
  - `test_sa_ref_in_appendix_a`: ref and skill filename in Appendix A table
  - `test_sa_ref_in_operation_3_menu`: skill listed in Operation 3 individual skill menu
  - `test_sa_in_operation_5_state_table`: state table row present in Operation 5
  - `test_sa_in_operation_1_steps`: skill referenced in Operation 1 full assessment steps
- `integration/assertions/security_architecture.yaml`: 2 new BEHAVIORAL assertions:
  - `SA-BEH-06`: skill file documents `gitignore_covers_env` check for `.env` files
  - `SA-BEH-07`: skill file uses correct two-tier audit logging scope (PHN/SIN/health/financial for reads)
  - `skill_version` bumped (was `"1.1.0"`, now `"1.2.0"`); total assertions: 29 → 31

### Changed
- `skills/03-security-architecture.md` (v1.1.0 → v1.2.0):
  - Phase 3.3: Added `.env` gitignore check: records `gitignore_covers_env: true|false` for use in Phase 5 gap gating
  - Phase 3.5: Replaced single audit-logging bullet with two-tier scope per CAS LOG-001h (writes = all Protected B; reads = PHN/SIN/health/financial only)
  - Phase 5.1: Added two "do not emit" rules: `.env` gitignored exceptions (Medium max) and general Protected B read logging
  - Phase 5.2 Data protection: Expanded secrets rule to three-part (hardcoded = Critical/High; `.env` = gitignore rule, Medium max; git history = treat as hardcoded)
  - Phase 5.2 Logging: Replaced "data access and modification" with explicit two-tier write/read scope
  - Phase 5.3: Updated High severity example (writes + PHN/SIN/health/financial reads); added Medium example (`.env` not in `.gitignore`)
- `Factory Agent/Security/blue-security-orchestrator.md`:
  - Frontmatter: added `security-architecture-design` to references list
  - Section 3 dependency graph: inserted SA Design node between Application Map and three core assessments
  - Operation 1 step 2b: Security Architecture Design *(optional, recommended)* step added
  - Operation 3 menu: added row B (Security Architecture Design); re-lettered old B-K to C-L; updated "Enter A-K" to "Enter A-L"
  - Operation 5 state table: added Security Architecture Design row
  - Appendix A: added `ref:security-architecture-design` → `skills/03-security-architecture.md`

---

## 2026-03-20: v1.11.0

### Added
- `skills/03-security-architecture.md` Phase 6 report template updated with:
  - Callout block at top directing reader to Threat Model for DFD and auth flow diagrams
  - **At-a-Glance Metrics** table: profile, mode, gap counts by severity, SR count, domains with gaps
  - **Section 3.6 Control Coverage Matrix**: 16-row table mapping every structured SA JSON field to pass/warn/fail status indicators
  - **Gap Severity Distribution** heat map table in Section 4: severity × category grid with SA-NNN IDs and column totals
- `scripts/generate_overview_html.py` dashboard enhancements:
  - `sa_verdict()` nested function in `compute_verdicts()`: returns Aligned / Gaps Identified / High-Severity Gaps / Critical Gaps / Not Assessed
  - **Architecture metric card** added to dashboard metric grid (after organizational CAS): shows gap count or "Aligned"; color-coded by highest open gap severity; links to `#panel-security-arch`
  - **Security Architecture row** added to Assessment Verdicts table; shows verdict when SA JSON present, "Not Run" otherwise
- 4 new pytest unit tests in `test_generate_overview_html.py`: Architecture card shows "Aligned", shows gap count + link, shows "N/A" without SA JSON, SA verdict row shows verdict not "Not Run"
- `integration/assertions/security_architecture.yaml`: 3 new STRUCTURAL assertions: SA-STR-10 (Threat Model callout in report), SA-STR-11 (At-a-Glance section), SA-STR-12 (Control Coverage section); assertion count: 26 → 29

---

## 2026-03-20: v1.10.0

### Added
- `integration/assertions/security_architecture.yaml`: 5 new assertions (3 STABLE, 1 STABLE-SCH, 1 BEHAVIORAL):
  - `SA-OUT-05`: `security_requirements.json` exists in `.ai/blueteam/data/`
  - `SA-OUT-06`: `security_requirements.json` is valid JSON
  - `SA-SCH-06`: `generated_by_assessments` in `security_requirements.json` contains `"security_architecture_design"`
  - `SA-BEH-05`: at least 1 SR entry extracted from SA-NNN gaps
  - `skill_version` bumped (was `"1.0.0"`, now `"1.1.0"`)

### Changed
- `skills/03-security-architecture.md` (v1.0.0 → v1.1.0): Added Phase 7b: extracts SR-NNN security requirements from each open SA-NNN gap; no CC entries produced; backfills `gaps[].related_requirement_ids` in `security_architecture.json`; adds `"security_architecture_design"` to `generated_by_assessments[]` in `security_requirements.json`; conditionally regenerates `security_requirements.md` + `.html`
- `scripts/validate_reports.py`: Added `"security_architecture_design"` to `_CANONICAL_ASSESSMENT_NAMES` frozenset and updated the "valid names" print statement
- `shared/schemas/artifacts.md`: Added Security Architecture Design as a 4th source in Step 7 (Extract candidate security requirements)
- `CLAUDE.md` Required JSON Data Artifacts table: Security Architecture Design row updated to include `security_requirements.json`
- `README.md`: `skills/03-security-architecture.md` description updated to mention SR-NNN generation from SA-NNN gaps

---

## 2026-03-20: v1.9.0

### Added
- `security_architecture` skill registered in `run_tests.py` SKILLS dict (done in earlier session);
  `output_files`: `security_architecture.json`, `security_architecture.md`, `security_architecture.html`;
  `requires: ["application_map"]`
- `integration/assertions/security_architecture.yaml`: 22 assertions (5 STABLE+SCH, 7 STRUCTURAL, 4 BEHAVIORAL):
  profile field presence, SA-NNN gap ID format, mode=describe for basic_webapp, ≥1 gap
- `tests/schemas/security_architecture.schema.json`: JSON Schema for `security_architecture.json`
- Semgrep as Scanner 4 in `skills/08-tool-scanning.md`: optional rule-based SAST;
  graceful `not_installed` handling; finding type `"sast"` added to normalized schema
- `integration/assertions/cybersecurity_tool_use.yaml`: 7 assertions (4 STABLE, 3 STRUCTURAL)
  verifying Semgrep section presence, `not_installed` handling, `--config=auto` command doc,
  `semgrep-results.json` raw artifact reference
- `cybersecurity_tool_use` registered in `run_tests.py` SKILLS dict (`output_files: []`)
- `tests/schemas/security_scan_results.schema.json`: JSON Schema for `security-scan-results.json`
  with `sast` type added to finding type enum
- ASVS V5 Taint Analysis Phase added to `asvs_v5_input_validation_skill.md` (v1.0.0 → v1.1.0):
  source identification from app_map endpoints, sink pattern catalog, 3-hop data flow tracing,
  data flow trace format in finding evidence
- `integration/assertions/asvs.yaml`: `ASVS-STR-03`: taint/data-flow reference in ASVS report

### Changed
- `scripts/generate_overview_html.py`: `_tab_scans()` filter bar adds `"sast"` type;
  semgrep `not_installed` notice rendered when `tools_executed[]` contains not_installed entry
- `README.md`: Semgrep added as optional prerequisite; step 8 description updated to mention
  SAST findings; agent table description updated
- `tests/unit/test_generate_overview_html.py`: 5 new tests added:
  - `test_security_arch_tab_present_when_sa_json_exists`
  - `test_security_arch_tab_absent_without_sa_json`
  - `test_security_arch_tab_shows_profile_and_gaps`
  - `test_sast_type_in_filter_bar_when_sast_findings_present`
  - `test_semgrep_not_installed_notice_shown`

---

## 2026-03-09: v1.8.0

### Changed (no test suite changes: skill-file-only optimizations)
- All 14 `asvs_chapters/asvs_v[N]_*.md` files: added `> **ASSESSMENT ORCHESTRATOR: STOP
  READING HERE.**` marker immediately before `## Secure Implementation Guide` in each file.
  Saves ~1,907 lines across a full 14-chapter ASVS Phase 2 run (the Implementation Guide
  content is for `skills/14-asvs-compliant-builder.md` only; assessment does not need it).
- `skills/05-asvs-level2-assessment.md` per-chapter execution protocol (step 1): updated to
  stop reading each chapter at the `> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.**`
  marker; also updated its own `environment-baseline.md` load instruction to explicitly read
  the full file including `## ASVS Chapter Assumption Mapping`.
- `shared/reference/environment-baseline.md`: added `> **NON-ASVS SKILLS: STOP READING HERE.**` marker
  before `## ASVS Chapter Assumption Mapping` (line ~195). Saves ~254 lines (~17 KB) per
  invocation for all non-ASVS skills (threat model, CAS, DR resilience, application map,
  requirements map, both builder skills).
- `shared/skills/preflight.md`: Step 1 updated to stop at the
  `> **NON-ASVS SKILLS: STOP READING HERE.**` marker in `environment-baseline.md`.
- Non-ASVS skills updated with explicit stop-marker load instruction for `environment-baseline.md`:
  `skills/04-threat-model.md`, `skills/06-cas-compliance.md`,
  `skills/10-dr-resilience.md`, `skills/14-asvs-compliant-builder.md`,
  `skills/15-cas-compliant-builder.md`, `skills/13-requirements-map.md`, `skills/01-application-map.md`

---

## 2026-03-09: v1.7.0

### Added
- `preflight` entry in `run_tests.py` SKILLS registry (sub-skill; `output_files: []`);
  STABLE + STRUCTURAL assertions verify the preflight contains the canonical RA loading
  procedure and that the 4 assessment skills defer to it
- `integration/assertions/preflight.yaml`: 11 assertions (5 STABLE, 6 STRUCTURAL):
  - STABLE (5): `shared/skills/preflight.md` exists; contains "Risk acceptance
    register loading" step; "Non-suppressible finding types" list; "Finding-level RA check"
    procedure; both `risk_acceptance_mode` values handled
  - STRUCTURAL (6): Threat model, ASVS, CAS, DR resilience skills all contain
    "RA register loaded in preflight" (i.e., defer to preflight, not inline); preflight
    loads `environment-baseline.md` and `controls_yaml_schema.md`
- `cas_builder.yaml`: 2 new STABLE + 1 new STRUCTURAL assertion (total now 15):
  - `CAS-BLD-STB-06` (STABLE): builder skill Phase 2 contains "Platform Context" + "selective"
  - `CAS-BLD-STB-07` (STABLE): cas_rule_definitions.md Section Loading Guide says "Domain Selection
    Guide" + "Do NOT load the full file" for the builder
  - `CAS-BLD-STR-08` (STRUCTURAL): cas_rule_definitions.md has "Domain → Section Heading Map"

### Changed
- `shared/skills/preflight.md` v1.0.0 → v1.1.0: Step 3 expanded from a
  2-line flag-setter to a full risk acceptance register loading procedure:
  - Reads the full RA register when present
  - Documents status rules (active/pending suppress; expired/withdrawn do not)
  - Defines the canonical non-suppressible finding type list (hardcoded secrets, auth bypass,
    PHN/SIN/medical/bank exposure, bulk Protected B extraction, backdoor routes, privilege
    escalation, Critical DR gaps)
  - Provides the inline finding-level RA check procedure (no longer references
    `shared/schemas/artifacts.md` at pre-assessment time, removing an early 52 KB load)
- `skills/15-cas-compliant-builder.md` v1.0.0 → v1.1.0: Phase 2 loading changed from
  "Read `shared/reference/cas-rule-definitions.md`" (full file, 105 KB) to selective loading:
  always load `Platform Context`; load only the domain section(s) relevant to the
  requested feature per the Domain Selection Guide + Domain → Section Heading Map
- `shared/reference/cas-rule-definitions.md`: Section Loading Guide updated: builder row now says
  "Platform Context + requested domain section(s) per Domain Selection Guide" instead
  of "All"; added "Domain → Section Heading Map" table with 10-row domain abbrev. → section
  heading mapping; added ITSG-33 advisory note
- `skills/04-threat-model.md`: "Risk Acceptance File Loading (Pre-Assessment)"
  section (9 lines) replaced with 2-line preflight reference block
- `skills/05-asvs-level2-assessment.md`: same replacement (8 lines → 2-line reference)
- `skills/06-cas-compliance.md`: same replacement (8 lines → 2-line reference)
- `skills/10-dr-resilience.md`: same replacement (8 lines → 2-line reference)
- `cas_builder.yaml` `skill_version` updated to `1.1.0` to match cas_compliant_builder_skill.md

### Context Pressure Savings
- CAS builder: 50-80 KB per invocation (now loads only relevant domain sections vs. full 105 KB file)
- All assessment skills: removed early `ai_artifacts_schema.md` reference in pre-assessment RA
  sections (was implicitly pulling agent to load 52 KB file early; now deferred to Phase 6/8)
- Codebase: ~35 lines of near-identical RA loading boilerplate removed from 4 skill files
  (consolidated into single canonical location in shared_security_preflight_skill.md)

---

## 2026-03-09: v1.6.0

### Added
- `requirements_map` entry in `run_tests.py` SKILLS registry (fixture: `basic_webapp`;
  output_files: `application_map.json`, `app_topology.json`, `application_map.md`)
 : design-level entry point for pre-code threat modeling; invocation comment explains
  that `--prepare` should point Claude at `requirements/employee_portal_epics.md`, not
  the full codebase
- `integration/assertions/requirements_map.yaml`: 13 assertions (5 STABLE, 5 STRUCTURAL, 3 BEHAVIORAL):
  - STABLE (5): `application_map.json` exists, is valid JSON, has `source: "requirements"`,
    `app_topology.json` exists, `app_topology.json` zone objects have `fill` + `label_color`
  - STRUCTURAL (5): report created, Tech Stack section, Entry Points section, Actors/Identity
    section, Security Gaps section
  - BEHAVIORAL (3): at least 1 identity provider detected, at least 1 conceptual endpoint
    detected, `pre_assumed_gaps` field present in `application_map.json`
- `tests/fixtures/basic_webapp/requirements/employee_portal_epics.md`: ~60-line
  Employee Directory requirements document used as the requirements input for semi-automated
  testing of the requirements_map skill; covers 4 epics (Auth, Directory, Management,
  Reporting), 2 data classifications, 2 integrations (Enterprise IdP, Audit Log Service)
- `skills/13-requirements-map.md`: new design-level discovery skill (4 phases: document
  location + staleness check, 3 sequential extractions, artifact synthesis, completion report);
  writes `source: "requirements"` + `pre_assumed_gaps[]` to `application_map.json`

### Changed
- `skills/04-threat-model.md`: 5 targeted edits adding Requirements Mode:
  1. Front-matter `upstream:` block: added `requirements-map-skill` as optional upstream
  2. Phase 0.5: added "Requirements Mode Detection" subsection with `evidence_mode` flag
     and `pre_assumed_gaps[]` → pre-assumed threat mapping table (6 gap types)
  3. Phase 1 DFD construction: added conditional note to skip `critical_files` code reading
     and label diagrams `[Design-Level: Not Code-Verified]` when in design mode
  4. Phase 5 Section 7: added "Design Threat Instances" conditional (replaces Vulnerable Code
     Examples in Requirements Mode; no code snippets; no CC entries produced)
  5. Phase 6 Source Material: added Requirements Mode skip for Steps 2-5 (code changes);
     SR entries produced in Requirements Mode flagged with `"design_mode": true`
- `shared/schemas/application-map.md`: added `source` field documentation in Field
  Definitions table: `"code"` (default) | `"requirements"`; downstream skills use this
  to activate design-level behaviour; `generated_at_commit` note updated to include
  `null` for requirements-generated maps
- `BlueTeam/README.md`: added `skills/13-requirements-map.md` row to agent table before
  `skills/01-application-map.md`; added HOWTO step 0 (requirements-mode entry point);
  added Requirements Mode prompt to sample prompt sequence
- `BlueTeam/CLAUDE.md`: added "Requirements Mode" section analogous to the existing
  "Builder Skills" section; explains automatic activation, no CC entries, no HTML
  generation needed for requirements-mode threat model output
- `tests/MAINTENANCE.md`: added "Requirements Mode Testing" note explaining that
  `--prepare --skill requirements_map` should target `requirements/` subfolder only

---

## 2026-03-09: v1.5.0

### Added
- `asvs_builder` and `cas_builder` entries in `run_tests.py` SKILLS registry
  (no `output_files`; builder skills generate code into target repos, not `.ai/` artifacts)
- `integration/assertions/asvs_builder.yaml`: 19 assertions (5 STABLE, 14 STRUCTURAL):
  - STABLE: skill file exists, Chapter Selection Guide present, Excluded Patterns present,
    all 14 chapter files referenced, environment-baseline.md referenced
  - STRUCTURAL: all 14 ASVS chapter files contain `## Secure Implementation Guide` section
- `integration/assertions/cas_builder.yaml`: 12 assertions (5 STABLE, 7 STRUCTURAL):
  - STABLE: cas_compliant_builder_skill.md exists, shared/reference/cas-rule-definitions.md exists,
    builder skill references rule definitions, Domain Selection Guide present, Excluded Patterns present
  - STRUCTURAL: Section Loading Guide, Platform Context, AUTH-001, LOG-001, ENC-001,
    ITSG-33 index all present in cas_rule_definitions.md; CAS assessment skill references cas_rule_definitions.md

### Changed
- `MAINTENANCE.md`: added "Builder Skills Testing Strategy" section explaining why builder
  skills use a different test approach (no fixture output) and the manual invocation process
- `shared/README.md`: added `cas_rule_definitions.md` entry under "Environment and standards reference files"
- `BlueTeam/README.md`: added `skills/14-asvs-compliant-builder.md` and `skills/15-cas-compliant-builder.md`
  to agent table under new "Builder Skills" subsection; updated "Future Expansion" note
- `BlueTeam/CLAUDE.md`: added "Builder Skills" section noting builder skills do not write `.ai/` artifacts
  and do not need `generate_report_html.py` or `validate_reports.py`

### Notes
- ASVS chapter Secure Implementation Guides: all 14 chapter files now contain
  `## Secure Implementation Guide` sections with organization-specific TypeScript/Node.js patterns
- CAS rule definitions: `shared/reference/cas-rule-definitions.md` extracted from assessment skill (2,479 lines);
  assessment skill shrank from 694 → 479 lines; CAS builder consumes the shared definitions file
- No BEHAVIORAL assertions for builder skills: add when automated invocation is available (see MAINTENANCE.md TODO b)

---

## 2026-03-09: v1.4.0

### Added
- 8 new unit tests in `test_validate_reports.py`:
  - `test_cas_table_arithmetic_correct_exits_zero`: correct CAS Total row → exit 0
  - `test_cas_table_arithmetic_wrong_total_exits_one`: wrong CAS Total → exit 1, CAS ARITHMETIC ERROR
  - `test_asvs_chapter_summary_correct_exits_zero`: matching ASVS footer → exit 0
  - `test_asvs_chapter_summary_wrong_count_exits_one`: mismatched ASVS footer → exit 1, ASVS CHAPTER SUMMARY ERROR
  - `test_kill_chain_elevation_count_correct_exits_zero`: matching elevation counts → exit 0
  - `test_kill_chain_elevation_count_mismatch_exits_one`: mismatched elevation counts → exit 1, ELEVATION COUNT MISMATCH
  - `test_kill_chain_overview_ids_correct_exits_zero`: matching overview KC IDs → exit 0
  - `test_kill_chain_overview_ids_mismatch_exits_one`: wrong KC ID in overview → exit 1, KC MISMATCH

### Changed
- `scripts/validate_reports.py`: 4 new semantic consistency checks:
  - `_check_cas_table_arithmetic()`: verifies CAS compliance Total row vs. column sums
  - `_check_asvs_chapter_summary()`: verifies ASVS Chapter Summary footer vs. chapter table
  - `_check_kill_chain_elevation_consistency()`: verifies Priority Elevations table row count vs. `kill_chains.json`
  - `_check_kill_chain_overview_consistency()`: verifies overview Attack Chains KC IDs/severities vs. `kill_chains.json`
- `skills/07-kill-chain-aggregator.md`: exec summary elevation counts must be derived from Priority Elevations table, not freehand
- `skills/12-security-overview-report.md`: added source-authority warning to List C: Kill Chains
- `CLAUDE.md`: 4 new rows in Common Failure Modes table
- `README.md`: validator description updated to mention semantic checks (step 13)

---

## 2026-03-07: v1.3.0

### Added
- 3 new unit tests in `test_generate_report_html.py` (tests 17-19):
  - `test_new_header_repo_strip_present`: 12px `.repo-strip` div present in every report
  - `test_new_header_app_name_promoted_to_h1`: app name from markdown becomes H1; report
    title demoted to `.report-type` subtitle
  - `test_new_header_fallback_app_name_not_em_dash`: H1 falls back to prettified repo name
    (never shows bare em-dash) when no app name found in markdown
- 2 new unit tests in `test_generate_overview_html.py` (tests 19-20):
  - `test_new_header_repo_strip_in_overview`: 12px `.repo-strip` present in overview SPA
  - `test_new_header_overview_app_name_in_h1`: app name (from `security-classification.yaml`)
    is H1; "Security Assessment Overview" is in `.report-type` subtitle
- `overview_report.yaml`: 3 new BEHAVIORAL assertions:
  - `OVW-BEH-07`: 12px repo-strip div present
  - `OVW-BEH-08`: app name as H1 + "Security Assessment Overview" as subtitle
  - `OVW-BEH-09`: repo badge and branch·SHA present in header meta

### Changed
- `generate_report_html.py`: header redesign:
  - Added `_REPO_COLOUR_PALETTE`, `_repo_colour()`, `_prettify_repo_name()`, `_repo_identity()`
  - 12px repo-strip with deterministic palette colour above the organizational blue header
  - App name promoted to H1 (26px bold); report title demoted to 13px uppercase subtitle
  - Repo badge (monospace pill) + branch·SHA added to right-side meta block
  - Fallback chain: app name from markdown → prettified repo name → "-" (last resort)
  - `convert()` accepts `repo_identity` dict; `main()` calls `_repo_identity()` once and
    threads it through all conversions in a run
- `generate_overview_html.py`: same header redesign:
  - Added `subprocess` import + same identity helpers
  - `build_spa()` accepts `repo_name`, `branch`, `sha`, `repo_colour` kwargs
  - App name from `security-classification.yaml` as H1; fallback to prettified repo name
  - `main()` calls `_repo_identity()` and passes result to `build_spa()`

---

## 2026-03-07: v1.2.0

### Added
- 2 new unit tests in `test_generate_report_html.py`:
  - `test_coverage_bars_main_table_becomes_cards`: verifies main Coverage Dashboard table is
    replaced by a 2-card flex layout (`display:flex`, `font-size:40px`) with correct colors and %
  - `test_coverage_bars_per_stack_adds_inline_bars`: verifies per-stack table retains its
    structure with `height:6px` inline progress bars added
- 4 new unit tests in `test_generate_overview_html.py` (tests 13-16):
  - `test_unit_test_coverage_card_shows_pct_with_link`: "Unit Test Cvg" card shows pre-existing %
    with `badge-critical` styling and link to `security_unit_test_coverage.html`
  - `test_unit_tests_tab_present_when_coverage_report_exists`: `panel-unit-tests` present and
    total tab count ≥ 11
  - `test_unit_tests_tab_content`: verdict banner, coverage bar labels, per-stack table rows,
    run status badges, and report link present in Unit Tests tab
  - `test_unit_tests_tab_absent_without_coverage_report`: tab omitted when coverage report absent;
    dashboard card shows N/A
- `security_unit_test.yaml`: 2 new assertions (`SCUT-STR-10`, `SCUT-BEH-07`):
  - `SCUT-STR-10` (STRUCTURAL): HTML Coverage Dashboard rendered as 2-card flex layout
  - `SCUT-BEH-07` (BEHAVIORAL): HTML Coverage Dashboard shows pre-existing and projected labels
- `overview_report.yaml`: 3 new assertions:
  - `OVW-STR-09`: Unit Tests tab panel (`panel-unit-tests`) present
  - `OVW-BEH-05`: "Unit Test Cvg" dashboard card present
  - `OVW-BEH-06`: Link to `security_unit_test_coverage.html` present in overview

### Changed
- `run_tests.py`: added `security_unit_test` to `overview_report["requires"]`; overview now
  depends on the coverage report being generated first
- `overview_report.yaml`: `OVW-STR-01` min raised from 10 → 11 (Unit Tests tab is now standard
  when `security_unit_test` has run); header note updated accordingly; `last_validated` updated
- `generate_report_html.py`: added `_inject_coverage_bars()` post-processor: replaces the main
  Coverage Dashboard table with a 2-card flex layout; adds inline mini-bars to the per-stack table
- `generate_overview_html.py`: added `_read_ut_stats()` parser, `_tab_unit_tests()` function,
  "Unit Test Cvg" dashboard card, and Unit Tests tab (`panel-unit-tests`) inserted before
  Security Reqs in the SPA
- `security_unit_test_coverage.md`: added "Security Control Coverage" section with Coverage
  Dashboard table (pre/post % + gain) and per-stack breakdown table

---

## 2026-03-07: v1.1.0

### Added
- `security_unit_test` skill entry in `run_tests.py` SKILLS registry (depends on `asvs`, `cas`)
- `integration/assertions/security_unit_test.yaml`: 12 assertions (2 STABLE, 5 STRUCTURAL, 5 BEHAVIORAL)
  covering output artifact existence, required report sections, omit-marker documentation, and test
  run results
- Two BEHAVIORAL assertions (`SCUT-BEH-01`, `SCUT-BEH-02`) specifically targeting the new
  pre-existing security test baseline count feature added to `security_unit_test_shared_core_skill.md`:
  checks that `pre_existing_security_tests` appears per-stack in Environment Discovery and that
  `pre_existing_security_tests_total` appears in the Executive Summary table

### Changed
- `security_unit_test_shared_core_skill.md`: added mandatory pre-existing security test baseline
  count requirement: agents must count and record security-focused test cases that existed before
  any new tests were written, per stack and as a total in the Executive Summary table

---

## 2026-03-05: v1.0.0 Initial Release

### Added
- `basic_webapp` fixture: organizational Employee Directory (TypeScript/Express/SQLite) with 24 intentional
  vulnerabilities and 14 pass controls across all ASVS chapters, CAS domains, and threat model scenarios
- `risk_acceptance_app` fixture: existing 13-TC risk acceptance test harness (subsumed from
  `risk_acceptance_tests.zip`: that file is now superseded by this test suite)
- Assertion sets for: application_map, threat_model, asvs, cas, kill_chain, risk_acceptance, overview_report
- JSON schemas for all `.ai/blueteam/data/` artifacts
- Python unit tests for generate_report_html.py and generate_overview_html.py
- run_tests.py orchestrator with --prepare, --check, --python, --all, --status, --diff, --accept,
  --lint-assertions, --list modes
- MAINTENANCE.md, ASSERTION_AUTHORING.md documentation

### Notes
- ASVS assertions test at orchestrator level only; per-chapter (V1-V14) assertions are a TODO
- CI/CD automation of skill invocation is a future enhancement
