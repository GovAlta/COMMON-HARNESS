---
name: redteam
description: Run a red team offensive security assessment on the app: reconnaissance, code analysis, exploit development, and remediation recommendations.
user-invocable: true
---

# Red Team Security Assessment

Run the full offensive security assessment pipeline against `./app/` or a target URL.

## Usage

```
/redteam                              # Assess ./app/ code + local endpoints
/redteam --target https://example.com # Assess a live target
/redteam --phase 3                    # Resume from Phase 3 (PoC execution)
```

## Prerequisites

```bash
cd .claude/security/redteam && npm install
# External recon binaries are OPTIONAL. Every tool has a Node-native fallback.
# On Linux/macOS:
bash scripts/install_recon_deps.sh
# On Windows:
pwsh scripts/install_recon_deps.ps1
```

## End-to-end orchestrator (recommended invocation)

For an authenticated run that drives all 4 agents in sequence via the
Anthropic Agent SDK:

```bash
cd .claude/security/redteam
node pipeline/claude_sdk.js <target-path> \
  --agents all \
  --endpoint http://localhost:3000 \
  --domain localhost \
  --identifier my_run
```

The orchestrator extracts JSON from \`\`\`json fences when agents emit
markdown-wrapped output (common pattern), so all four deliverables in
`deliverables/` end up as valid JSON ready for the HTML generators.

## Pipeline

Execute in phase order. Read `.claude/security/redteam/CLAUDE.md` for the full protocol.

| Phase | Agent(s) | Parallelism | Skill File |
|-------|----------|-------------|------------|
| 1 | Recon + Code Analysis | Parallel | `skills/01-recon-agent.md` + `skills/02-code-analysis-agent.md` |
| 2 | Dependency + Infrastructure + SAST + Secrets | Parallel | `skills/05-*` through `skills/08-*` |
| 3 | PoC Execution | Sequential (needs Phase 1) | `skills/03-poc-execution-agent.md` |
| 4 | Remediation | Sequential (needs Phase 3) | `skills/04-recommendation-agent.md` |

## For each agent:

1. Read the agent skill .md file for instructions
2. Perform the analysis (AI-driven + tool-backed where applicable)
3. Write structured findings to `deliverables/` as JSON

## Recon Tools (Phase 1)

10 JavaScript recon wrappers in `.claude/security/redteam/tools/recon/`, each implementing a 3-step dispatcher (external binary → Node-native fallback → structured error JSON):

`dns_enum.js`, `whois_lookup.js`, `subdomain_discovery.js`, `port_scan.js`, `tls_scan.js`, `http_headers.js`, `tech_fingerprint.js`, `waf_detect.js`, `endpoint_discovery.js`, `ct_search.js`

Additional standalone scanner wrappers in `scripts/`: `nmap_scan.js` (TCP-connect fallback), `semgrep_scan.js`, `trufflehog_scan.js` (with regex sweep fallback), `osv_scan.js` (with OSV.dev REST fallback), `zap_scan.js` (manual-run guide / `--auto-docker`). See `.claude/references/security-redteam.md` for the full matrix.

## HTML Report Generation

After each agent completes, generate its HTML report:

```bash
cd .claude/security/redteam
node scripts/recon_json_to_html.js deliverables/recon_deliverable.json
node scripts/code_analysis_json_to_html.js deliverables/code_analysis_deliverable.json
node scripts/poc_json_to_html.js deliverables/poc_testing.json
node scripts/remediation_json_to_html.js deliverables/remediation_report.json
```

## Cross-Framework Integration

After red team completes, findings should cross-reference with blue team:
- Red team PoC results validate blue team findings
- Red team attack chains correlate with blue team kill chains (KC-NNN)
- Both use severity scale: CRITICAL, HIGH, MEDIUM, LOW, INFO

## Safety Rules

- Do not read `.env` files or production secrets
- Use `[REDACTED-*]` placeholders for credential values
- Do not execute exploits against production systems without explicit authorization
- Do not modify application source code during assessment
- All HTML reports must be script-generated, never hand-crafted
