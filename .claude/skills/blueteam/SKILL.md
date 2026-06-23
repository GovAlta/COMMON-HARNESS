---
name: blueteam
description: Run a blue team defensive security assessment on the app: OWASP ASVS Level 2, CAS compliance, threat modeling, kill chains, deterministic scanning, and HTML report generation.
user-invocable: true
---

# Blue Team Security Assessment

Run the full defensive security assessment pipeline against `./app/`.

## Usage

```
/blueteam                          # Assess ./app/ with full pipeline
/blueteam --target /path/to/app    # Assess a different target
/blueteam --step 5                 # Resume from step 5 (ASVS assessment)
```

## Prerequisites

```bash
cd .claude/security/blueteam && npm install
```

## Pipeline

Execute these steps in order. Read `.claude/security/blueteam/CLAUDE.md` for the full protocol.

| Step | Skill | File |
|------|-------|------|
| 1 | Load preflight | `.claude/security/blueteam/shared/skills/preflight.md` |
| 2 | Application map | `.claude/security/blueteam/skills/01-application-map.md` |
| 3 | Security classification | `.claude/security/blueteam/skills/02-security-classification.md` |
| 4 | Security architecture (optional) | `.claude/security/blueteam/skills/03-security-architecture.md` |
| 5 | Threat model | `.claude/security/blueteam/skills/04-threat-model.md` |
| 6 | ASVS Level 2 assessment | `.claude/security/blueteam/skills/05-asvs-level2-assessment.md` |
| 7 | CAS compliance | `.claude/security/blueteam/skills/06-cas-compliance.md` |
| 8 | Kill chain aggregation | `.claude/security/blueteam/skills/07-kill-chain-aggregator.md` |
| 9 | Deterministic tool scans (MANDATORY) | `.claude/security/blueteam/skills/08-tool-scanning.md` |
| 10 | Security unit tests | `.claude/security/blueteam/skills/09-security-unit-tests.md` |
| 11 | DR resilience | `.claude/security/blueteam/skills/10-dr-resilience.md` |
| 12 | Code fix generation (optional) | `.claude/security/blueteam/skills/11-code-fix-generation.md` |
| 13 | Requirements map | `.claude/security/blueteam/skills/13-requirements-map.md` |
| 14 | Overview report (FINAL) | `.claude/security/blueteam/skills/12-security-overview-report.md` |

## For each step:

1. Read the skill .md file for instructions
2. Perform the AI-driven analysis
3. Write structured findings to the target's `.ai/data/` and `.ai/reports/` directories

## Mandatory Deterministic Scans (Step 9)

AI analysis alone is NEVER sufficient. Run these scripts:

```bash
cd .claude/security/blueteam

# Run all security scans
node scripts/security-pipeline.js --repo-root /path/to/target --all

# Generate HTML reports
node scripts/generate_report_html.js --repo-root /path/to/target
node scripts/generate_overview_html.js --repo-root /path/to/target
node scripts/generate_requirements_report.js --repo-root /path/to/target
node scripts/generate_code_changes_report.js --repo-root /path/to/target

# Validate
node scripts/validate_reports.js --repo-root /path/to/target
```

## Safety Rules

- Do not read `.env` files or production secrets
- Use `[REDACTED-*]` placeholders for credential values
- Do not modify application source code during assessment
- All HTML reports must be script-generated, never hand-crafted
