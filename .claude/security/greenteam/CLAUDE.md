# Green Team Code Review: Mandatory Execution Protocol

This directory contains the greenteam deterministic code-review
framework. It mirrors blueteam (defensive) and redteam (offensive) with a
code-quality and process-integrity review modeled on real human-led
reviews.

The framework is multi-round:

- **Round 1: Static and dependency hygiene.** Runs without executing any
  code. Catches dependency vulnerabilities, committed secrets, dangerous
  patterns, licence exposure, unused dependencies, circular imports,
  missing formatting standards, Go runtime vulnerabilities, OpenAPI
  drift, gitignore gaps, risky env defaults, migration sequence gaps,
  compiled binaries, API baseURL inconsistencies, Go toolchain
  declarations.
- **Round 2: Test execution + CI + runtime + refinement.** Runs tests,
  parses coverage, audits CI pipelines for missing gates, scans for
  runtime bugs (no-undef, dead handlers, missing return paths), and
  applies a refinement pass that re-frames findings with corrected
  tooling flags and by-design context (build-tag-fenced test bypasses,
  --skipLibCheck for vue-tsc, etc.).

The refinement pass is the framework's signature. Many "obvious" Round-1
findings turn out to be by-design or fixable with one flag, and many
non-obvious gaps only surface after the tooling is corrected. The
refinement re-runs is what produces the final, audit-trustworthy report.

---

## Mandatory Dual-Analysis Protocol

Every greenteam review MUST combine:

1. **AI-driven analysis**: the LLM reads the target code, follows each
   skill `.md` file, and writes structured findings.
2. **Deterministic script execution**: the `.js` scanners in
   `scripts/` MUST be run; they produce findings that AI reading alone misses and are therefore necessary in addition to AI analysis.

---

## Setup

```bash
cd .claude/security/greenteam && npm install
# Optional binaries the scanners can reach for if installed:
#   govulncheck (Go), semgrep (Linux/Mac/WSL), redocly cli (devDep)
```

Each scanner has graceful fallback when an optional tool is absent. The
orchestrator marks the scanner skipped rather than failing the run.

---

## Execution Order

Outputs land under `<target>/.ai/greenteam/` so the harness stays
pristine across runs. Override with `--out-dir <path>` if needed.

```bash
# 1. Full pipeline (recommended)
node pipeline/run_all.js --target /path/to/repo --verbose

# 2. Round 1 only
node pipeline/run_all.js --target /path/to/repo --round 1

# 3. Round 2 only (test execution + CI audit + refinement)
node pipeline/run_all.js --target /path/to/repo --round 2

# 4. Generate reports (must pass --target so it can find the JSON)
node scripts/report_generator.js --target /path/to/repo --md --html

# 5. Validate the canonical deliverable
node scripts/validate_report.js --target /path/to/repo
```

Outputs:
- `<target>/.ai/greenteam/greenteam_findings.json`
- `<target>/.ai/greenteam/greenteam_findings.md`
- `<target>/.ai/greenteam/greenteam_findings.html`
- `<target>/.ai/greenteam/per-scanner/<scanner>.json`

The target repo should `.gitignore` `.ai/` so scan output is never
committed.

---

## Critical Safety Rules

- **Do NOT read `.env` files** with real credentials. The secret scanner
  is allowed to read them in scan mode; the analysis agents should not.
- **Do NOT reproduce actual API keys, passwords, or tokens** in
  findings. Use `[REDACTED-*]` placeholders.
- **Do NOT modify application source code**; greenteam is read-only.
- **Do NOT execute test suites against production systems.**
- **Do NOT skip the deterministic scripts**; they catch real issues
  that AI analysis misses.

---

## Scripts That MUST Run

| Script | Phase | Purpose |
|---|---|---|
| `pipeline/run_all.js` | Orchestrator | Drive every scanner; aggregate; refinement pass; produce canonical JSON |
| `scripts/npm_audit_scan.js` | Round 1 | npm audit vulnerabilities per package.json tree |
| `scripts/secret_scan.js` | Round 1 | Credentials in source + AI-generated reports under .ai/ |
| `scripts/dangerous_patterns_scan.js` | Round 1 | innerHTML, eval, document.write, SQL string concat |
| `scripts/license_scan.js` | Round 1 | GPL/AGPL/LGPL exposure |
| `scripts/depcheck_scan.js` | Round 1 | Unused / missing dependencies |
| `scripts/madge_scan.js` | Round 1 | Circular dependency cycles |
| `scripts/prettier_check.js` | Round 1 | Formatting standard presence |
| `scripts/govulncheck_scan.js` | Round 1 | Go reachable CVEs |
| `scripts/redocly_scan.js` | Round 1 | OpenAPI ambiguities + drift |
| `scripts/gitignore_audit.js` | Round 1 | .env coverage, .env.example convention, compiled binaries |
| `scripts/migration_sequence_scan.js` | Round 1 | Numbered migration gaps |
| `scripts/env_default_audit.js` | Round 1 | Risky defaults (VITE_ENABLE_DEVTOOLS=true, etc.) |
| `scripts/api_base_url_audit.js` | Round 1 | /api vs /api/v1 inconsistency across source / tests / CI |
| `scripts/go_toolchain_audit.js` | Round 1 | go.mod version + ST1005 capitalized error strings |
| `scripts/eslint_config_audit.js` | Round 1/2 | Husky-runs-lint-with-zero-rules; hardcoded plugin paths |
| `scripts/vue_tsc_scan.js` | Round 2 | TypeScript type-check with --skipLibCheck handling |
| `scripts/eslint_scan.js` | Round 2 | Full ESLint pass (parsed --format json) |
| `scripts/vitest_coverage_scan.js` | Round 2 | Vitest with --coverage.reportOnFailure; per-file shape analysis |
| `scripts/go_test_coverage_scan.js` | Round 2 | Go per-package coverage |
| `scripts/integration_test_enum.js` | Round 2 | //go:build integration enumeration |
| `scripts/go_test_bypass_audit.js` | Round 2 | Build-tag-fenced test-bypass detection |
| `scripts/ci_pipeline_audit.js` | Round 2 | .github/workflows gap audit |
| `scripts/console_log_scan.js` | Round 2 | console.* in production paths |
| `scripts/refinement_pass.js` | Refinement | Downgrade by-design findings; re-frame |
| `scripts/report_generator.js` | Output | JSON → MD + HTML |
| `scripts/validate_report.js` | Validation | Schema check on canonical deliverable |

---

## Finding Schema

See `pipeline/output_schemas.js` for the canonical Finding shape; every
scanner emits an array of Finding objects that the orchestrator then wraps in
the deliverable shape.

ID convention: `G-R<round>-<CATEGORY>-NNN` (e.g., `G-R1-DEP-001`).

Severity scale: `CRITICAL | HIGH | MEDIUM | LOW | INFO | CLEARED`.

Status field: `open | cleared | carried-forward | by-design`. The
refinement pass sets `by-design` when a finding is mathematically
correct but reflects an intentional design (e.g., test-bypass-fenced auth
coverage).

---

## How Refinement Works

The refinement pass operates on the merged Round 1 + Round 2 findings.
It applies rules like:

1. **Test-bypass downgrade.** If `go_test_bypass_audit` confirmed
   build-tag-fenced bypass + fence test, every HIGH/CRITICAL Go test
   coverage finding for auth/security packages is downgraded to LOW with
   `status: "by-design"` and an evidence note pointing at the integration
   test enumeration.
2. **vue-tsc --skipLibCheck downgrade.** If `vue_tsc_scan` proved the
   abort is in node_modules and source is clean with `--skipLibCheck`,
   downgrade the HIGH "all type errors masked" to LOW.
3. **CI env override sanity.** If the API baseURL audit shows CI sets
   the env that makes tests pass green while source default is wrong, do
   NOT clear the finding. CI overriding a wrong default in source is a
   tooling band-aid, not a fix. Severity stays HIGH.

The refinement rules are encoded in `scripts/refinement_pass.js`.

---

## When greenteam blocks a release

A release that fails greenteam should block on:
- Any `CRITICAL` finding open and not in `risk_acceptances.json`.
- Any `HIGH` SECRET / AI finding (committed credential).
- Any `HIGH` DEP finding with an automated fix available and not applied.
- Refinement-derived `LOW` findings with `status: by-design` are
  informational; they should appear in the report but do not block.
