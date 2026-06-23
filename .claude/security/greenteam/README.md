# Green Team Code Review

Deterministic, multi-round code review modeled on real human-led
reviews. Mirrors blueteam (defensive) and redteam (offensive); green
focuses on code quality, dependency hygiene, test depth, CI gates, and
runtime bugs.

## Two rounds

- **Round 1: Static and dependency hygiene.** No code executes. Catches
  dependency vulnerabilities, committed secrets, dangerous patterns,
  licence exposure, unused / missing dependencies, circular imports,
  missing formatting standards, Go runtime CVEs, OpenAPI drift,
  gitignore gaps, risky env defaults, migration sequence gaps,
  compiled binaries, API baseURL inconsistencies, Go toolchain.

- **Round 2: Test execution + CI + runtime + refinement.** Runs tests,
  parses coverage, enumerates integration tests, audits CI for missing
  gates, scans for runtime bugs. A refinement pass re-frames findings
  with corrected tooling flags and by-design context (build-tag-fenced
  test bypasses, --skipLibCheck for vue-tsc, etc.).

## Quick start

```bash
cd .claude/security/greenteam
npm install

# Full pipeline
node pipeline/run_all.js --target /path/to/repo --verbose

# Generate reports
node scripts/report_generator.js

# Validate the canonical deliverable
node scripts/validate_report.js
```

Output drops in `deliverables/`.

## Layout

```
greenteam/
├── CLAUDE.md             # mandatory execution protocol
├── README.md             # this file
├── package.json          # devDependencies for all scanners
├── pipeline/
│   ├── run_all.js        # orchestrator: drive scanners, refinement pass, emit canonical JSON
│   └── output_schemas.js # Finding shape + ID allocator
├── skills/
│   ├── 01-static-analysis-agent.md
│   ├── 02-dependency-hygiene-agent.md
│   ├── 03-test-execution-agent.md
│   ├── 04-ci-pipeline-audit-agent.md
│   ├── 05-refinement-agent.md
│   └── 06-runtime-bugs-agent.md
├── scripts/              # deterministic scanners (one per concern)
└── deliverables/         # JSON + MD + HTML output
```

## Severity

`CRITICAL | HIGH | MEDIUM | LOW | INFO | CLEARED`. Same scale as
blueteam and redteam.

## Optional tooling

Each scanner falls back gracefully if its tool isn't installed:

- `govulncheck` (Go runtime CVE scan): `go install golang.org/x/vuln/cmd/govulncheck@latest`
- `semgrep` (SAST rules): Linux/Mac: `pip install semgrep`; Windows: WSL
- `redocly cli`, `license-checker`, `depcheck`, `madge`, `prettier`,
  `vue-tsc`: installed via the local devDependencies

The orchestrator records skipped scanners so the absence is visible in
the report.
