# Green Team Code Review: Reference

Pointer doc for the greenteam framework. Full execution protocol lives
at `.claude/security/greenteam/CLAUDE.md`.

## What greenteam covers

Multi-round deterministic code review modeled on real human-led reviews:

- **Round 1, Static and dependency hygiene.** Catches dependency
  vulnerabilities, committed secrets, dangerous patterns, licence
  exposure, unused / missing dependencies, circular imports, missing
  formatting standards, Go runtime CVEs, OpenAPI drift, gitignore gaps,
  risky env defaults, migration sequence gaps, compiled binaries, API
  baseURL inconsistencies, Go toolchain declarations, ESLint
  configuration anti-patterns.

- **Round 2, Test execution + CI + runtime + refinement.** Runs the
  target's existing tests, parses coverage shape (asymmetric coverage
  is the signal), enumerates integration tests, audits CI for missing
  gates (lint step, integration job, security scan, SBOM), scans for
  runtime bugs (no-undef, dead handlers, missing return paths,
  console-log leakage), and applies a refinement pass that re-frames
  findings with corrected tooling flags and by-design context.

## When to use it

| Situation | Run |
|---|---|
| Code review before a partner-facing milestone | `/greenteam` (full) |
| Pre-PR sanity check | `/greenteam --round 1` |
| Pre-deploy hygiene | `/greenteam --round 2` |
| Audit refresh | `/greenteam` quarterly |

## Output

- `deliverables/greenteam_findings.json`: canonical machine-readable
- `deliverables/greenteam_findings.md`: human-readable report
- `deliverables/greenteam_findings.html`: HTML report
- `deliverables/per-scanner/<scanner>.json`: raw per-scanner output

## Finding schema

`G-R<round>-<CAT>-NNN`. Severities: `CRITICAL | HIGH | MEDIUM | LOW |
INFO | CLEARED`. Status field: `open | cleared | carried-forward |
by-design`.

## Cross-references

- Blueteam (defensive): `.claude/security/blueteam/`. OWASP ASVS Level
  2 + CAS compliance + threat model + kill chains.
- Redteam (offensive): `.claude/security/redteam/`. Recon + code
  analysis + PoC + remediation.
- Greenteam findings about coverage gaps often inform blueteam's
  security-unit-tests skill (where to add coverage first).
