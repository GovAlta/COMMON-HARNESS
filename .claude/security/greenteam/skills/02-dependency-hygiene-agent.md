---
name: 02-dependency-hygiene-agent
phase: Round 1
description: Dependency hygiene; licence exposure, unused/missing dependencies, circular imports, formatting standard, Go reachable CVEs, OpenAPI lint, ESLint configuration sanity.
---

# Round 1: Dependency Hygiene Agent

This agent characterises the dependency tree and tooling configuration.
Its findings are typically lower-severity but cumulatively expensive
when ignored.

## What it covers

| Concern | Scanner |
|---|---|
| Licence exposure (GPL/AGPL/LGPL) | `scripts/license_scan.js` |
| Unused / missing dependencies | `scripts/depcheck_scan.js` |
| Circular dependency cycles | `scripts/madge_scan.js` |
| Formatting standard presence (.prettierrc) | `scripts/prettier_check.js` |
| Go reachable runtime vulnerabilities | `scripts/govulncheck_scan.js` |
| OpenAPI ambiguities + drift | `scripts/redocly_scan.js` |
| ESLint config sanity (no config / no rules / hardcoded paths) | `scripts/eslint_config_audit.js` |

## Notes on each scanner

- **license_scan**: emits a positive INFO finding when the scan
  completes cleanly with no GPL/AGPL detected. This matches the
  human-review pattern of explicitly noting clean results so the
  audience knows the check ran.

- **depcheck_scan**: distinguishes unused vs. missing. Watch for
  "framework-future-scope" packages (mapping libraries on a project
  that has no map yet); they should be flagged but at LOW severity.

- **madge_scan**: circular imports in auth flow are HIGH-risk for
  offline-first PWAs (cold-start init order matters). Plain UI code
  cycles are MEDIUM at most.

- **govulncheck**: only flag reachable CVEs (govulncheck's default).
  Unreachable CVEs in deep transitive deps are noise.

- **redocly_scan**: focus on ambiguous paths (overlapping route
  patterns) and self-contradictory schemas (required-but-undefined
  property, invalid examples). Missing 4xx responses across all
  operations is a single team-wide style finding, not N separate
  defects; emit one finding, not N.

- **eslint_config_audit**: the highest-impact finding in this
  agent. "Husky+lint-staged wired with zero rules" is the silent killer
  pattern (R2-B-01 in the Lungfish ground truth).

## Execution

```bash
cd .claude/security/greenteam
node scripts/license_scan.js         --target /path --out deliverables/per-scanner/license_scan.json
node scripts/depcheck_scan.js        --target /path --out deliverables/per-scanner/depcheck_scan.json
node scripts/madge_scan.js           --target /path --out deliverables/per-scanner/madge_scan.json
node scripts/prettier_check.js       --target /path --out deliverables/per-scanner/prettier_check.json
node scripts/govulncheck_scan.js     --target /path --out deliverables/per-scanner/govulncheck_scan.json
node scripts/redocly_scan.js         --target /path --out deliverables/per-scanner/redocly_scan.json
node scripts/eslint_config_audit.js  --target /path --out deliverables/per-scanner/eslint_config_audit.json
```

## What this agent should NOT do

- Don't fail the whole run because an optional tool is missing. Each
  scanner skips gracefully. The orchestrator records the skip.
- Don't emit per-package findings when a single team-wide pattern is
  the actual problem (e.g., 86 endpoints missing 4xx responses is one
  finding).
- Don't treat the absence of a tool as a finding; the scanner just
  skips. But if a tool's CONFIG is broken (R1E-B-01 hardcoded paths),
  that IS a finding (`eslint_config_audit`).
