# Security Assessment Framework: Top-Level Protocol

This directory contains two complementary assessment frameworks that MUST be used together
for a complete security assessment:

| Framework | Directory | Purpose |
|---|---|---|
| **BlueTeam** | `blueteam/` | Defensive assessment: threat modeling, ASVS/CAS compliance, DR resilience, kill chain analysis, security unit tests, code fix generation, and the consolidated security overview SPA |
| **RedTeam** | `redteam/` | Offensive assessment: code analysis, PoC exploitation, dependency/infrastructure/SAST/secrets analysis, and remediation recommendations |

---

## Mandatory Dual-Analysis Protocol

**Every security assessment MUST combine:**

1. **AI-driven analysis**: the LLM reads the target app's source files, follows the skill
   `.md` files, and produces structured findings (JSON + Markdown artifacts).
2. **Deterministic script execution**: the `.js` scripts in each framework's `scripts/`
   directory MUST be run to generate HTML reports, run automated scans (npm audit, secretlint,
   ESLint security plugins), and validate output. **AI analysis alone is NOT sufficient.**

Each framework has its own `CLAUDE.md` with detailed execution protocols. Read them:

- `blueteam/CLAUDE.md`: covers skill execution order, mandatory script pipeline, JSON
  artifact schemas, HTML generation rules, and post-execution validation
- `redteam/CLAUDE.md`: covers skill execution order, JSON deliverable schemas, HTML
  generation scripts, and safety rules

---

## Setup (run once per assessment)

```bash
# Install both frameworks' dependencies
cd blueteam && npm install && cd ..
cd redteam && npm install && cd ..
```

---

## Execution Order (full assessment)

### Phase 1: BlueTeam Assessment

Run blueteam skills in order (see `blueteam/CLAUDE.md` for details):

1. Application Map → Security Classification → Security Architecture
2. Threat Model → CAS Compliance → ASVS Level 2
3. Kill Chain Aggregator (after steps above)
4. DR Resilience Analysis (parallel with steps 2-3)
5. **`node blueteam/scripts/security-pipeline.js --all --repo-root <target>`** (MANDATORY)
6. Security Unit Tests
7. Code Fix Generation (if validator reports missing `replacement_code`)
8. Security Overview Report (FINAL; requires all upstream artifacts)
9. **Report generation scripts** (MANDATORY; see blueteam/CLAUDE.md)
10. **`node blueteam/scripts/validate_reports.js --repo-root <target>`** (MUST pass)

### Phase 2: RedTeam Assessment

Run redteam skills in order (see `redteam/CLAUDE.md` for details):

1. Recon Agent → Code Analysis Agent (foundational)
2. Dependency Analysis, SAST, Secrets Detection, Infrastructure Analysis (parallel)
3. PoC Execution Agent (requires code analysis output)
4. Recommendation Agent (requires PoC output)
5. **HTML generation scripts for each deliverable** (MANDATORY)

### Phase 3: Cross-Reference

After both phases complete, verify:
- RedTeam findings that overlap with BlueTeam CC entries are cross-referenced
- Kill chains identified by BlueTeam are validated against RedTeam PoC results
- Remediation recommendations from RedTeam align with BlueTeam code changes

---

## Critical Safety Rules (both frameworks)

- **Do NOT read `.env` files** or any files containing actual production secrets
- **Do NOT reproduce actual API keys, passwords, or tokens**; use `[REDACTED-*]` placeholders
- **Do NOT modify application source code** (except adding test files for security unit tests)
- **Do NOT execute exploits against production systems**
- **Do NOT skip the deterministic scripts**; they catch real issues that AI analysis misses

---

## Scripts That MUST Run

| Script | Framework | Purpose |
|---|---|---|
| `blueteam/scripts/security-pipeline.js` | BlueTeam | npm audit + secretlint + ESLint security with `@typescript-eslint/parser` wired so .ts files are parsed (not flagged as syntax errors); deterministic scanning |
| `blueteam/scripts/generate_report_html.js` | BlueTeam | HTML from all .md assessment reports |
| `blueteam/scripts/generate_requirements_report.js` | BlueTeam | Security requirements summary |
| `blueteam/scripts/generate_code_changes_report.js` | BlueTeam | Code changes summary |
| `blueteam/scripts/generate_overview_html.js` | BlueTeam | 10-tab security overview SPA |
| `blueteam/scripts/validate_reports.js` | BlueTeam | Validation (MUST pass before done) |
| `redteam/pipeline/claude_sdk.js` | RedTeam | End-to-end orchestrator. Runs recon → code-analysis → poc → recommendation via `@anthropic-ai/claude-agent-sdk`. Extracts JSON from `\`\`\`json` fences in `message.result` when `structured_output` is null (markdown-wrapper bug fix). |
| `redteam/scripts/code_analysis_json_to_html.js` | RedTeam | Code analysis HTML report |
| `redteam/scripts/remediation_json_to_html.js` | RedTeam | Remediation HTML report |
| `redteam/scripts/poc_json_to_html.js` | RedTeam | PoC results HTML report |
| `redteam/scripts/recon_json_to_html.js` | RedTeam | Recon HTML report |
| `redteam/scripts/{semgrep,trufflehog,osv,zap}_scan.js` | RedTeam | Standalone scanner wrappers with Node-native fallback (OSV.dev API, built-in regex secret patterns, manual-run guide for ZAP) so no apt/brew binaries are strictly required. |
