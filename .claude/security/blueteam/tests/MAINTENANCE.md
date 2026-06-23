# Test Suite Maintenance Guide

This document describes how to keep the BlueTeam regression test suite
synchronized with changes to the skills, Python scripts, and fixtures.

---

## When to Update Tests

### Skill version bump workflow

Each assertion YAML file contains a `skill_version` field in its header. This
value corresponds to the `version:` front-matter field in the skill's `.md`
file. When a skill is updated and its version number changes:

1. Run `node run_tests.js --status` to identify skills whose assertion YAML
   `skill_version` is out of date.
2. Run the skill against the relevant fixture to regenerate artifacts.
3. Run `node run_tests.js --diff` to review what changed.
4. Run `node run_tests.js --accept` to accept the new baseline (if the changes
   are intentional and correct).
5. Update `skill_version` in the assertion YAML header to match the new skill version.

The `skill_version` field is a governance gate: if it does not match the current
skill version, the `--check` phase emits a version-mismatch warning before
running assertions. This prevents silently running outdated assertions against
a newer skill.

### When `skill_version` must change

Update `skill_version` whenever:
- The skill's `version:` front-matter field changes
- You run `--accept` to update the baseline (always update `skill_version` at
  the same time)
- A skill is renamed (update `skill` field too)

Do NOT change `skill_version` if you are only updating BEHAVIORAL assertions
(adding/removing expected findings) without a skill version change. In that case
update `last_validated` instead.

---

## Assertion Categories

| Category | What it tests | Change tolerance | Consequence of failure |
|----------|--------------|-----------------|----------------------|
| `STABLE` | Guaranteed outputs: file created, ID format (SR-NNN), required JSON fields | Zero tolerance: these are invariants | Skill regression; do not accept without root cause analysis |
| `STRUCTURAL` | Report structure: section headings present, panel IDs, required report sections, schema compliance | Low tolerance: structural changes should be deliberate | Skill was refactored; check if the change is intentional then update assertions |
| `BEHAVIORAL` | Detection quality: expected finding detected, non-suppressible finding reported, chain identified | Moderate tolerance: AI output varies run-to-run | Review skill output; verify the finding is genuinely present or the assertion needs tuning |

---

## Updating After a Skill Change

Follow this procedure whenever a skill's `.md` file is modified:

**(a) Identify the changed skill**

Check the git diff or the skill's changelog comment to understand what changed.
Determine which assertion YAML files cover this skill
(e.g., `integration/assertions/asvs.assertions.yaml` for `skills/05-asvs-level2-assessment.md`).

**(b) Run `--status` to see version mismatch**

```bash
node run_tests.js --status
```

The output will show which assertion YAML files have a `skill_version` that no
longer matches the current skill version. This confirms which files need attention.

**(c) Run the skill against the fixture**

Prepare the fixture and run the skill manually in a Claude session:

```bash
node run_tests.js --prepare --skill asvs --fixture basic_webapp
# ... run the skill in Claude ...
```

**(d) Run `--diff` to review changes**

```bash
node run_tests.js --diff --skill asvs --fixture basic_webapp
```

Review the diff carefully. Verify:
- All expected structural elements are still present (no sections dropped)
- All critical BEHAVIORAL assertions still pass (key findings still detected)
- New artifacts are schema-compliant

**(e) Run `--accept` to update baseline**

If the diff is correct and intentional:

```bash
node run_tests.js --accept --skill asvs --fixture basic_webapp
```

This updates the golden artifacts in `tests/golden/`. Commit the updated golden
files alongside the skill change.

**(f) Manually review BEHAVIORAL assertions for new/removed expected findings**

The `--accept` command updates structural/stable baselines automatically, but
BEHAVIORAL assertions (expected finding detection) must be manually reviewed:

- If the skill now detects a new vulnerability class that the fixture covers,
  add a new BEHAVIORAL assertion for it.
- If the skill no longer reports a previously expected finding (e.g., a
  vulnerability was fixed in the fixture), remove or update the corresponding
  BEHAVIORAL assertion.
- Update `skill_version` and `last_validated` in the assertion YAML header.

---

## Updating After a Python Script Change

When `generate_report_html.js` or `generate_overview_html.js` changes:

1. Run `node run_tests.js --python` to detect failures.
2. If a test fails because the script's HTML structure changed (e.g., a new CSS
   class name, a new element type for a feature), update the assertion in the
   corresponding test file (`tests/unit/test_generate_report_html.js` or
   `tests/unit/test_generate_overview_html.js`).
3. If a new script feature is added (e.g., a new badge type, a new chart
   injection), add a new test that exercises it.
4. Do not update tests to pass around a bug: fix the bug first, then verify
   the test passes.

---

## Adding a New Skill

When a new skill is added to the BlueTeam suite:

- [ ] Add the skill to the `SKILLS` dict in `run_tests.js` with its key, file
  path, and dependencies.
- [ ] Create an assertion YAML file at `integration/assertions/<key>.assertions.yaml`.
  Include at minimum:
    - One STABLE assertion for each artifact file the skill writes
    - One STABLE assertion for the ID format of the primary artifact's entries
    - One STRUCTURAL assertion for each required section in the skill's report
    - At least three BEHAVIORAL assertions for the most critical expected findings
      in the `basic_webapp` fixture
- [ ] Identify or create a fixture that exercises the new skill's detection targets.
  If the existing `basic_webapp` fixture is sufficient, add the new vulnerability
  types to `fixtures/basic_webapp/FIXTURE_MANIFEST.md`.
- [ ] Add the new skill/fixture combination to `fixtures/*/FIXTURE_MANIFEST.md`.
- [ ] Document the skill in the `## Available Skills` table in `README.md`.
- [ ] Add an entry to `CHANGELOG.md`.

---

## Adding a New Vulnerability to a Fixture

When you need to add a new intentional vulnerability to a fixture to improve
detection coverage:

- [ ] Add the vulnerable code to the fixture source (e.g., `fixtures/basic_webapp/src/`).
- [ ] Document it in `fixtures/basic_webapp/FIXTURE_MANIFEST.md`:
    - ASVS chapter(s) it exercises
    - CAS domain(s) if applicable
    - Expected severity (critical/high/medium/low)
    - Whether it is a pass control or fail case
- [ ] Add or update a BEHAVIORAL assertion in the relevant assertion YAML file
  (e.g., `integration/assertions/asvs.assertions.yaml`) asserting that the skill
  detects this vulnerability.
- [ ] Consider whether the vulnerability participates in a multi-step kill chain.
  If so, update `integration/assertions/kill_chain.assertions.yaml` to assert
  that a chain including this step is produced.
- [ ] After running the skill against the updated fixture and verifying detection,
  run `--accept` and update the golden baseline.

---

## AI to Python Migration Path

When a component that was previously implemented inside a skill (AI-driven) is
moved to a Python script:

**(a) Integration tests remain unchanged**

Integration assertions test the artifact contract (what JSON fields are produced,
what structural elements appear in reports), not the implementation method. An
assertion that CC-001 appears in `code_changes.json` remains valid whether the
entry was produced by an AI skill or a Python script.

**(b) Add new unit tests for the Python program**

Add tests in `tests/unit/` for the new Python program. Follow the
patterns established in `test_generate_report_html.js`:
- Use `subprocess.run` with `sys.executable` for isolation
- Use `tmp_path` for temporary directories
- Assert on output file existence and content, not on internal implementation

**(c) Record in CHANGELOG.md**

Add an entry in `tests/CHANGELOG.md` noting:
- Which skill component was migrated
- Which new unit test(s) were added
- Version of the test suite after the migration

---

## Assertion YAML Schema

Assertion YAML files must conform to the following structure:

### Required header fields

| Field | Type | Description |
|-------|------|-------------|
| `skill_version` | string | Version string matching the skill's `version:` front-matter field |
| `last_validated` | string | ISO 8601 date the assertion file was last reviewed against actual output |
| `fixture` | string | Fixture key this assertion set targets (e.g., `basic_webapp`) |
| `description` | string | One-sentence description of what this assertion set covers |

### Category values

| Value | Description |
|-------|-------------|
| `STABLE` | Invariant outputs that must always be true regardless of AI variation |
| `STRUCTURAL` | Report structure elements that should be present in well-formed output |
| `BEHAVIORAL` | Detection quality assertions that may need tuning as the skill evolves |

### Assertion type values

| Type | Description |
|------|-------------|
| `file_exists` | Assert that a file path (relative to repo root) exists |
| `json_valid` | Assert that a JSON file is parseable and optionally schema-compliant |
| `json_field_present` | Assert that a JSON field path (dot-notation) is present and non-empty |
| `json_id_format` | Assert that all `id` fields in a JSON array match a given regex |
| `json_min_count` | Assert that a JSON array has at least N entries |
| `text_present` | Assert that one or more text patterns appear in a file |
| `text_absent` | Assert that a text pattern does NOT appear in a file |
| `section_present` | Assert that a Markdown H2/H3 heading is present in a report file |
| `schema_valid` | Validate a JSON artifact against one of the schemas in `tests/schemas/` |

---

## Context Pressure Refactoring Notes (2026-03-09)

Two context-pressure optimizations were applied to the skill files. These affect
what a skill agent loads and when:

### CAS Builder Selective Loading
`skills/15-cas-compliant-builder.md` v1.1.0 changed Phase 2 from loading the entire
`shared/reference/cas-rule-definitions.md` (105 KB) to loading only the `Platform Context`
section plus the domain sections relevant to the feature being built.

**Assertion impact:** `cas_builder.yaml` now asserts this selective loading behaviour
(`CAS-BLD-STB-06`, `CAS-BLD-STB-07`, `CAS-BLD-STR-08`). If Phase 2 is ever reverted
to full-file loading, these assertions will fail.

**Testing selective loading manually:** When invoking the CAS builder in a session,
check that the agent does NOT load the full `cas_rule_definitions.md`: it should read
only the requested domain section(s) and Platform Context. The `## ITSG-33 Quick
Reference Index` should NOT be loaded for code generation tasks.

### Risk Acceptance Loading Consolidation
`shared/skills/preflight.md` v1.1.0 expanded Step 3 from a 2-line
flag-setter into the canonical RA loading procedure (register read, status rules,
non-suppressible list, finding-level RA check instructions).

Four assessment skills (`skills/04-threat-model.md`,
`skills/05-asvs-level2-assessment.md`, `skills/06-cas-compliance.md`,
`skills/10-dr-resilience.md`) had their inline "Risk Acceptance File Loading
(Pre-Assessment)" sections replaced with a 2-line preflight reference block.

**Assertion impact:** `preflight.yaml` asserts both the preflight's content and that
all 4 skills contain the preflight-deferral phrase "RA register loaded in preflight".
If any skill reintroduces an inline RA loading section alongside the preflight
reference, it will create redundancy but not break assertions.

**If the non-suppressible list changes:** Update `shared/skills/preflight.md`
Step 3 only: do not update the 4 assessment skills individually.

**If a new assessment skill is added:** That skill must either:
  (a) Reference `shared/skills/preflight.md` and include the
      "RA register loaded in preflight" phrase, OR
  (b) Implement its own RA loading matching the non-suppressible list in the preflight.
  Add a `PFL-STR-N` assertion in `preflight.yaml` for the new skill.

---

## Context Pressure Stop-Marker Notes (2026-03-09)

Two additional stop-marker optimizations were applied after the v1.7.0 refactoring round.
Both follow the established `controls_yaml_schema.md` pattern.

### ASVS Chapter Secure Implementation Guide Stop Marker

All 14 `asvs_chapters/asvs_v[N]_*.md` files have a stop marker immediately before
`## Secure Implementation Guide`:

```
> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide`
> section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not
> need implementation patterns.
```

The ASVS orchestrator's per-chapter execution protocol (step 1) instructs it to stop at
this marker. The builder skill loads the full chapter (no change needed: builder needs
both the assessment requirements and the implementation guide).

**If a new ASVS chapter is added:**
- The chapter file must follow the two-section structure: assessment content first,
  then `## Secure Implementation Guide`, with the stop marker between them.
- The builder's `asvs_builder.yaml` STRUCTURAL assertions check that all chapter files
  contain `## Secure Implementation Guide`: add the new chapter to that assertion.

**If the Secure Implementation Guide is removed from a chapter:**
- Remove the stop marker from that chapter file.
- Update `asvs_builder.yaml` assertions accordingly.

### `environment-baseline.md` ASVS Chapter Assumption Mapping Stop Marker

`shared/reference/environment-baseline.md` has a stop marker before `## ASVS Chapter Assumption Mapping`
(line ~195):

```
> **NON-ASVS SKILLS: STOP READING HERE.** The `## ASVS Chapter Assumption Mapping`
> section below is only needed by the ASVS assessment orchestrator and ASVS chapter
> sub-skills.
```

- **Non-ASVS skills** (threat model, CAS, DR, application map, requirements map, both
  builders, and the shared preflight) are all updated to stop at this marker.
- **ASVS orchestrator** explicitly loads the full file (see its "Required reading" line).

**If the `## ASVS Chapter Assumption Mapping` table content changes:**
- Only `skills/05-asvs-level2-assessment.md` and the chapter sub-skills are affected.
- No change needed in non-ASVS skills or the preflight.

**If a new non-ASVS skill is added:**
- Its `environment-baseline.md` load instruction must include:
  `Stop at the \`> **NON-ASVS SKILLS: STOP READING HERE.**\` marker.`

---

## Requirements Mode Testing

The `requirements_map` skill uses the `basic_webapp` fixture but targets only the
`requirements/` subfolder: not the full codebase. This is different from all other
skills that analyze the full application source.

### How to run the requirements_map skill test

When running `--prepare --skill requirements_map`, the fixture is prepared normally
(copied to `tests/fixtures/tmp/basic_webapp/`). However, the skill invocation must be
targeted at the requirements subfolder, not the root:

```bash
node run_tests.js --prepare --skill requirements_map --fixture basic_webapp
# Then in a Claude session:
# "Using the skill at .../requirements_map_skill.md, map the system described
#  in requirements/employee_portal_epics.md in the current directory"
# Then validate:
node run_tests.js --check --skill requirements_map
```

**Important:** Do NOT invoke the requirements_map skill with a generic "map the
application in the current directory" prompt: it will search the full codebase and
may generate a code-based map instead of a requirements-based map. Always point the
skill explicitly at `requirements/employee_portal_epics.md`.

**Expected behavior with the fixture:**
- The skill should locate `requirements/employee_portal_epics.md`
- Extract 1 identity provider (Enterprise IdP e.g. MS Entra ID), at least 4 conceptual endpoints
  (employees list, search, profile, admin CRUD, export, audit)
- Identify `pre_assumed_gaps[]` entries (audit log integration has no explicit
  credential story in the epics)
- Write `application_map.json` with `source: "requirements"` and `app_topology.json`
  with Cloud Landing Zone zone

**Version tracking:** The `requirements_map.yaml` assertions file tracks `skill_version: "1.0.0"`.
Update this field when the skill's front-matter version changes.

---

## Builder Skills Testing Strategy

Builder skills (`skills/14-asvs-compliant-builder.md`, `skills/15-cas-compliant-builder.md`) require
a different testing approach than assessment skills because they do not produce `.ai/` data
artifacts: they generate source code directly into the target repository.

### What the test suite checks automatically

The STABLE and STRUCTURAL assertions in `integration/assertions/asvs_builder.yaml` and
`integration/assertions/cas_builder.yaml` verify:

- The skill files themselves exist and are well-formed (no missing required sections)
- All 14 ASVS chapter files contain `## Secure Implementation Guide` sections
- `shared/reference/cas-rule-definitions.md` is present and contains required sections (AUTH, LOG, ENC, ITSG-33)
- The CAS assessment skill references `shared/reference/cas-rule-definitions.md`

Run with:
```bash
node run_tests.js --check --skill asvs_builder
node run_tests.js --check --skill cas_builder
```

### Manual functional testing (BEHAVIORAL coverage)

Because generated code varies per-invocation and depends on the user's request, there are
no automated BEHAVIORAL assertions. Functional correctness is verified manually:

1. Prepare the basic_webapp fixture: `node run_tests.js --prepare --skill asvs_builder`
2. In a Claude session, invoke the builder skill against the fixture:
   `"Using the skill at .../asvs_compliant_builder_skill.md, write a secure login route for the application in the current directory"`
3. Review the generated code for:
   - Presence of `// [OK] VN.N.N` annotations on security control lines
   - organization-specific defaults applied (Enterprise IdP e.g. Entra ID, Key Vault, pino logging, etc.)
   - ASVS Coverage table appended to output
   - No excluded patterns generated (no `rejectUnauthorized: false`, no PHN/SIN in logs, etc.)
4. Optionally run `skills/05-asvs-level2-assessment.md` against the generated code to verify
   the generated controls pass assessment

Add BEHAVIORAL assertions here once automated invocation is available (see TODO item b below).

---

## TODO / Future Enhancements

The following items are known gaps that have been deferred for future work:

**(a) Per-chapter ASVS assertions**
Current ASVS assertions operate at the orchestrator level only (V1-V14 combined).
Per-chapter assertions (one YAML file per ASVS chapter sub-skill) would improve
precision but require significantly more fixture coverage. Planned for a future
sprint once the `basic_webapp` fixture has comprehensive chapter coverage
documented in `FIXTURE_MANIFEST.md`.

**(b) Full CI/CD pipeline automation for skill invocation**
The `--prepare` and skill invocation steps currently require a manual Claude
session. Automating these via the Claude API (or the Claude Code SDK non-interactive
mode) is a planned enhancement that would enable end-to-end regression testing
in CI without human intervention.

**(c) Golden snapshot diffing for HTML structure**
The current `--diff` mode compares JSON artifacts. A future enhancement would
diff the generated `.html` report files against golden HTML snapshots, normalizing
timestamps and generated IDs to make the comparison deterministic.

**(d) Additional fixtures for API-only and multi-tier apps**
The `basic_webapp` fixture is a monolithic Express/SQLite application. Additional
fixtures covering: a pure REST API (no server-side rendering), a multi-tier app
(separate frontend/backend/database repos), and a mobile app with a React Native
client would improve coverage of ASVS chapters V6, V7, V9, and the mobile-rn
fields in `application_map.json`.
