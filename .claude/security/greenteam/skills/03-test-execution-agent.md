---
name: 03-test-execution-agent
phase: Round 2
description: Run the target's test suites; TypeScript type-check (with --skipLibCheck), full ESLint, Vitest coverage (with --coverage.reportOnFailure so coverage drops survive failing tests), Go test coverage, integration test enumeration.
---

# Round 2: Test Execution Agent

This agent runs the target's existing test suites and parses the
results. Coverage shape, not just coverage count, is the signal. A
codebase with 95% coverage on building blocks and 3% coverage on the
orchestration that ships data to a server is a different audit risk than
a codebase with flat 30% everywhere.

## What it covers

| Concern | Scanner |
|---|---|
| TypeScript type-check correctness | `scripts/vue_tsc_scan.js` |
| ESLint findings (errors + warnings) | `scripts/eslint_scan.js` |
| Vitest per-file coverage shape | `scripts/vitest_coverage_scan.js` |
| Go per-package coverage | `scripts/go_test_coverage_scan.js` |
| Integration test enumeration (//go:build integration) | `scripts/integration_test_enum.js` |

## Tooling-flag corrections

The agent runs two passes for several tools, mirroring the Lungfish
Round-2-Refined story:

- **vue-tsc**: first pass without `--skipLibCheck` (catches the
  csstype JSDoc TS1010 abort and similar third-party crashes). Second
  pass with `--skipLibCheck` (the true source-code result). If source
  is clean with the flag but the CI command does not pass the flag,
  emit LOW with `status: by-design` plus a tooling fix note.

- **Vitest**: always run with `--coverage.reportOnFailure`. Vitest
  silently drops the coverage table when any test fails; without the
  flag, a single broken test masks the entire coverage shape.

- **go test**: run with `-short` first (fast, no DB), then enumerate
  integration tests separately. Do NOT report `internal/auth: 0.2%`
  as CRITICAL without first running `go_test_bypass_audit` (next
  agent). Coverage that is by-design will be downgraded by the
  refinement pass.

## What "coverage shape" means

A scanner emits per-file coverage. The agent reads the per-file shape
and flags asymmetry: low coverage on orchestration files (views, sync
engines, workflow pages) while building-block files (lib, composables,
parsers, validators) are well-covered. This is the
R2-A-10 / R2-A-11 pattern in the Lungfish ground truth (`useSync.ts` at
3.14%, workflow pages at 0%, while composables are 98%+).

For an offline-first PWA the orchestration coverage is the single most
important number; it is the bridge between local data and the server.
For a server, the equivalent shape is "services / controllers tested
while adapters and integration glue are not".

## What this agent should NOT do

- Don't report `internal/auth: 0.2%` as CRITICAL before the test-bypass
  audit has run. That number is by-design when the bypass pattern is
  present.
- Don't drop test failures silently. Every failing test becomes a
  finding with the assertion message in evidence.
- Don't run integration tests that require a live database without
  explicit authorization. Just enumerate them.
- Don't trust npm test as the entry point; many codebases have tests
  installed but no `test` script in package.json. Try `npx vitest run`
  directly when the script is absent.
