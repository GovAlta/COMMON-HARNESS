---
name: greenteam
description: "Run a green team deterministic code review against a target codebase, multi-round static and dynamic analysis (Round 1: npm audit, secrets, dangerous patterns, dependencies, licences, circular imports, formatting, govulncheck, OpenAPI lint, gitignore, env defaults, migrations, compiled binaries, API baseURL audit, Go toolchain; Round 2: type checking, ESLint, vitest coverage, go test coverage, integration test enumeration, test-bypass audit, CI pipeline audit, console-log scan, refinement re-framing). Mirrors the blueteam / redteam pipeline shape. Modeled on real human-led code reviews. Usage: /greenteam [--target /path/to/repo] [--round 1|2|all]"
user-invocable: true
---

# Green Team Code Review

Run the full deterministic code-review pipeline against `./app/` (or a
target path / URL). Greenteam complements blueteam (defensive security)
and redteam (offensive security) with a code-quality and process-integrity
review modeled on real human-led code reviews. Two rounds:

- **Round 1, Static and dependency hygiene.** npm audit, secret scan,
  dangerous pattern scan, licence audit, unused-dependency detection,
  circular-import detection, formatting standard check, Go vulnerability
  scan, OpenAPI lint, gitignore audit, .env default audit, migration
  sequence check, compiled-binary check, API baseURL consistency, Go
  toolchain audit.
- **Round 2, Test execution + coverage + CI gaps + runtime bugs +
  refinement.** Type checking with `--skipLibCheck` correction, ESLint
  (with config-audit fallback), Vitest coverage with
  `--coverage.reportOnFailure`, Go test coverage with build-tag-fenced
  test-bypass detection, integration-test enumeration, CI pipeline gap
  audit (no lint step, no integration job, no security scan, no SBOM),
  console-log scan in production paths, refinement re-framing.

## Usage

```
/greenteam                              # Assess ./app/ with full pipeline
/greenteam --target /path/to/app        # Assess a different target
/greenteam --round 1                    # Round 1 only (static)
/greenteam --round 2                    # Round 2 only (test execution + CI + refinement)
/greenteam --skip madge_scan,semgrep_scan  # Skip specific scanners
```

## Prerequisites

```bash
cd .claude/security/greenteam && npm install
# Optional tooling (each scanner falls back gracefully when absent):
#   - govulncheck  (Go: `go install golang.org/x/vuln/cmd/govulncheck@latest`)
#   - semgrep      (Linux/Mac: `pip install semgrep`; Windows: WSL)
#   - redocly cli  (installed via the local devDependency)
#   - license-checker, depcheck, madge, prettier, vue-tsc: devDependencies
```

## Pipeline

Read `.claude/security/greenteam/CLAUDE.md` for the full execution protocol.

| Phase | Agent | Skill File |
|-------|-------|------------|
| 1 | Static analysis (dependency vulns, secrets, dangerous patterns, migrations, binaries) | `skills/01-static-analysis-agent.md` |
| 2 | Dependency hygiene (licences, unused deps, circular imports, formatting, Go toolchain) | `skills/02-dependency-hygiene-agent.md` |
| 3 | Test execution (type-check, ESLint, vitest + go test coverage) | `skills/03-test-execution-agent.md` |
| 4 | CI pipeline audit (missing lint step, no integration test job, no security scan, no SBOM) | `skills/04-ci-pipeline-audit-agent.md` |
| 5 | Refinement pass (re-frame findings with corrected tooling flags + by-design context) | `skills/05-refinement-agent.md` |
| 6 | Runtime bugs (no-undef, dead handlers, missing return paths, console leakage) | `skills/06-runtime-bugs-agent.md` |

## End-to-end orchestrator (recommended invocation)

```bash
cd .claude/security/greenteam
node pipeline/run_all.js --target /path/to/repo --verbose
# Then:
node scripts/report_generator.js --html
node scripts/validate_report.js
```

Output drops:
- `deliverables/greenteam_findings.json`: canonical machine-readable
- `deliverables/greenteam_findings.md`: human-readable markdown report
- `deliverables/greenteam_findings.html`: HTML report
- `deliverables/per-scanner/<scanner>.json`: raw output per scanner

## For each agent

1. Read the agent skill .md file for what it covers.
2. Run the deterministic scanner(s) the agent owns.
3. Append findings to the deliverable.

## Severity scale

`CRITICAL | HIGH | MEDIUM | LOW | INFO | CLEARED`. Matches blueteam /
redteam.

## Cross-framework integration

After greenteam completes, findings can cross-reference with blueteam and
redteam:
- Greenteam SECRET / AI findings may overlap with blueteam ASVS V14 / V8
  controls and redteam secrets-detection agent.
- Greenteam COV / TEST findings inform blueteam's security-unit-tests
  skill (where to add coverage first).
- Greenteam CI findings (no security scan in pipeline) parallel
  blueteam's security-pipeline.js gate.

## Safety rules

- Do not read `.env` files or production secrets. Use `[REDACTED-*]`
  placeholders for any matched credential value.
- Do not execute test suites that require live external services without
  explicit authorization.
- Do not modify application source code during assessment (the scanners
  are read-only).
- All HTML reports must be script-generated, never hand-crafted.
