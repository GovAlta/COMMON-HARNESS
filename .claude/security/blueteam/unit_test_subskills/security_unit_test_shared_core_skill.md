---
id: security-unit-test-shared-core
name: Security Unit Test Shared Core Skill
description: Shared core for security unit-test work: discovery, test conventions, coverage assessment, framework fallback, and output/report contracts.
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
  - security-unit-test-coverage
upstream: []
outputs: []
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must run before any stack-specific security unit-test sub-skill.
  - Must establish repository test conventions before creating new test files.
---

## Shared Discovery Baseline

1. Detect test framework (`vitest`, `jest`, `mocha/chai`) from package/config/files.
2. Locate existing test files and infer naming/layout conventions.
3. Identify testable source files and endpoint inventory where applicable.
4. Scan omit markers:
   - `@security-test-omit-file`
   - `@security-test-omit-test`

## Coverage and generation baseline

- Before writing any tests, record the **pre-existing security test baseline** by counting what is already there:
  - For each stack, grep existing test files for security-related assertions (auth checks, 401/403 assertions, header checks, XSS/injection payloads, logout/session invalidation, PII redaction). Count the number of discrete test cases (`it(`, `[Fact]`, `[Theory]`, `test(`, etc.) that target security controls: not all tests, only security-focused ones.
  - Record `pre_existing_security_tests: N` per stack in the Environment Discovery section of the report.
  - Record `pre_existing_security_tests_total: N` (sum across stacks) in the Executive Summary table alongside the "Tests Written" column.
- Assess current tests against applicable security controls.
- Write only security-focused unit/integration tests within current framework conventions.
- If no framework exists, add fallback framework:
  - TypeScript/ESM: `vitest`
  - CommonJS Node: `jest` (+ `ts-jest` for TS)

## Coverage Computation (run after writing tests, before writing the report)

Derive the following values from the "Existing Test Coverage vs Security Findings" table and the
"Findings Not Covered by Unit Tests" table:

| Variable | Definition |
|---|---|
| `in_scope` | Row count in the coverage table (infra-only findings are NOT in this table) |
| `infra_excluded` | Row count in "Findings Not Covered" (the excluded set) |
| `pre_covered` | Rows where "Covered by Existing Tests?" is "Yes" or "Partial" |
| `pre_partial` | Rows where "Covered by Existing Tests?" is "Partial" only |
| `post_covered` | Rows that have at least one new test after this skill run (always ≤ `in_scope`) |
| `pre_pct` | `round(pre_covered / in_scope * 100)` |
| `post_pct` | `round(post_covered / in_scope * 100)` |
| `gain_pp` | `post_pct − pre_pct` |
| `controls_gained` | `post_covered − pre_covered` |

Repeat the same counts split by stack (e.g. Backend, Frontend) for the per-stack row.

Use these variables to populate the Coverage Dashboard section below.

## Coverage Dashboard (required report section)

Place this section **immediately after the report metadata block and before `## Executive Summary`**.
Fill in all bracketed placeholders with the computed values.

```markdown
---

## Security Control Coverage

> **Denominator:** [in_scope] in-scope testable controls: [infra_excluded] infrastructure-only
> findings are excluded from this metric (e.g. secret scanning, WAF-level controls, cloud storage
> config); see §Findings Not Covered.

| Metric | Pre-Existing Coverage | With Generated Tests Adopted |
|--------|----------------------|-----------------------------|
| **Controls Covered** | [pre_covered] / [in_scope] ([pre_pct]%) | [post_covered] / [in_scope] ([post_pct]%) |
| *of which: Partial* | [pre_partial] |: |
| **Coverage Gain** |: | ↑ +[gain_pp] pp (+[controls_gained] controls) |
| **Security Tests** | [pre_existing_security_tests_total] pre-existing | +[new_tests_total] tests written |

**Per Stack:**

| Stack | In-Scope | Pre-Existing | With Generated Tests |
|-------|----------|--------------|----------------------|
[one row per detected stack, e.g.:]
| Backend (XUnit) | 9 | 0 / 9 (0%) | 9 / 9 (100%) |
| Frontend (Jest) | 2 | 1 / 2 (50%) | 2 / 2 (100%) |

> *"With Generated Tests Adopted" assumes the generated test files have been committed and wired
> into the CI pipeline. Tests are present in the repository from this skill run.*

---
```

## Global constraints

- Never add application feature logic.
- Never remove or weaken existing tests.
- Never force tests into files/paths marked by omit markers.
- Exclude infrastructure-only controls from test generation.

## Required final outputs

- Updated/added test files in project conventions.
- `.ai/blueteam/reports/security_unit_test_coverage.md`: must include the Coverage Dashboard section.
- HTML report generated from markdown via `generate_report_html.py`.
