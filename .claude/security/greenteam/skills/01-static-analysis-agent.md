---
name: 01-static-analysis-agent
phase: Round 1
description: Deterministic static analysis; dependency vulnerabilities, committed secrets, dangerous patterns, migration sequence, compiled binaries, gitignore coverage, env defaults, API baseURL consistency, Go toolchain.
---

# Round 1: Static Analysis Agent

This agent runs deterministic static analysis without executing any
application code. Every finding is produced by tooling or pattern
matching against the source tree.

## What it covers

| Concern | Scanner |
|---|---|
| Dependency vulnerabilities (npm) | `scripts/npm_audit_scan.js` |
| Committed credentials in source + .ai/ reports | `scripts/secret_scan.js` |
| Dangerous patterns (innerHTML, eval, SQL string concat) | `scripts/dangerous_patterns_scan.js` |
| Compiled binaries committed to repo | `scripts/gitignore_audit.js` |
| .env / .env.example convention violations | `scripts/gitignore_audit.js` |
| Risky env defaults (devtools enabled in prod) | `scripts/env_default_audit.js` |
| Database migration sequence gaps | `scripts/migration_sequence_scan.js` |
| API baseURL inconsistency across source + tests + CI | `scripts/api_base_url_audit.js` |
| Go toolchain version + ST1005 capitalized errors | `scripts/go_toolchain_audit.js` |

## Execution

```bash
cd .claude/security/greenteam
node scripts/npm_audit_scan.js          --target /path/to/repo --out deliverables/per-scanner/npm_audit_scan.json
node scripts/secret_scan.js             --target /path/to/repo --out deliverables/per-scanner/secret_scan.json
node scripts/dangerous_patterns_scan.js --target /path/to/repo --out deliverables/per-scanner/dangerous_patterns_scan.json
node scripts/gitignore_audit.js         --target /path/to/repo --out deliverables/per-scanner/gitignore_audit.json
node scripts/env_default_audit.js       --target /path/to/repo --out deliverables/per-scanner/env_default_audit.json
node scripts/migration_sequence_scan.js --target /path/to/repo --out deliverables/per-scanner/migration_sequence_scan.json
node scripts/api_base_url_audit.js      --target /path/to/repo --out deliverables/per-scanner/api_base_url_audit.json
node scripts/go_toolchain_audit.js      --target /path/to/repo --out deliverables/per-scanner/go_toolchain_audit.json
```

Or use the orchestrator: `node pipeline/run_all.js --target /path --round 1`.

## After the scanners run

Read each JSON output. For each Finding:
- Confirm it's a real signal, not a tooling artifact.
- Note any false positives in the deliverable so the reader knows what
  was investigated and cleared (the `CLEARED` severity exists for this
  case; Lungfish F-09 is the canonical example).
- Cross-reference against blueteam findings if present.

## What this agent should NOT do

- Don't execute the application or its tests; that's Round 2.
- Don't modify any source file; read-only.
- Don't reproduce real credential values in findings; use `[REDACTED-*]`.
- Don't ignore the AI-tooling-report case: if `.ai/reports/` contains
  committed credentials, that's a CRITICAL finding regardless of
  whether the credentials are still live.
