# Red Team Security Assessment Framework

A CLI pipeline that drives offensive security analysis agents against a target codebase, using the Claude Agent SDK.

> **Prerequisite:** Claude Code must be installed locally and you must be authenticated with your Anthropic account.

---

## Recon tool dispatch order

Every wrapper in `tools/recon/` follows a 3-step dispatcher so the recon pipeline runs end-to-end
on any platform, with or without external CLI binaries installed:

1. **Binary path**: if the canonical CLI (dig, nmap, etc.) is on PATH, use it (richest output).
2. **Node-native fallback**: if the binary is missing, use a pure-Node implementation built on
   `node:dns`, `node:tls`, `node:net`, and `node:http`/`node:https`. Output conforms to the same
   JSON schema as the binary path so downstream agents are agnostic.
3. **Structured error**: if neither path can produce output, return `{ error, target, ... }`
   so the AI agent can recover rather than crash.

Mapping of binary → Node-native fallback:

| Tool                        | Binary path           | Node-native fallback                                      |
|-----------------------------|-----------------------|-----------------------------------------------------------|
| `dns_enum.js`               | `dig`                 | `dns.promises.resolve*` (A/AAAA/MX/NS/TXT/CNAME/SOA)      |
| `whois_lookup.js`           | `whois`               | `whois-json` npm package (TCP/43 client)                  |
| `port_scan.js`              | `nmap -sV -sC`        | `net.Socket` TCP-connect scan over 110 top ports          |
| `tls_scan.js`               | `testssl.sh` / `sslscan` | `tls.connect()` × {TLSv1, 1.1, 1.2, 1.3} + cert parse  |
| `tech_fingerprint.js`       | `httpx` + `whatweb`   | header sniff (Server, X-Powered-By) + body regex sigs     |
| `waf_detect.js`             | `wafw00f`             | 3-probe heuristic (clean / XSS / shellshock UA) + sigs    |
| `subdomain_discovery.js`    | `subfinder`           | crt.sh + ~50-word DNS bruteforce                          |
| `endpoint_discovery.js`     | `feroxbuster`         | robots.txt + sitemap.xml + 80-path bundled wordlist       |
| `http_headers.js`           | (was `curl`)          | pure Node fetch (no binary needed)                        |
| `ct_search.js`              | n/a                   | pure Node fetch against crt.sh (no binary needed)         |

Shared helpers live in `tools/recon/_runner.js` (`whichBin`, `runBin`, `httpFetch`, `httpsTlsInfo`,
`tcpProbe`, `poolMap`, `TOP_PORTS`, `SERVICE_BY_PORT`). To install the optional binaries, run
`bash scripts/install_recon_deps.sh` (Linux/macOS/WSL) or
`pwsh scripts/install_recon_deps.ps1` (Windows).

Additional scanner wrappers in `scripts/` follow the same dispatcher pattern:

| Wrapper                  | Binary path        | Fallback                                            |
|--------------------------|--------------------|-----------------------------------------------------|
| `scripts/semgrep_scan.js`| `semgrep`          | documents pipx install command (no fallback engine) |
| `scripts/trufflehog_scan.js` | `trufflehog`   | Node regex sweep with ~20 secret patterns           |
| `scripts/osv_scan.js`    | `osv-scanner`      | OSV.dev REST API against package-lock/pnpm-lock/requirements.txt/go.sum |
| `scripts/zap_scan.js`    | `docker run owasp/zap2docker-stable` (with `--auto-docker`) | `--report <path>` parses an existing HTML report; otherwise prints manual run guide |

---

## Setup

```bash
# Install dependencies
npm install
```

To install external tools used by the recon agent (all OPTIONAL; Node-native fallbacks exist):

```bash
bash scripts/install_recon_deps.sh    # Linux/macOS/WSL
pwsh scripts/install_recon_deps.ps1   # Windows (winget / scoop / choco)
```

---

## Usage

```
node pipeline/claude_sdk.js <target> [options]
```

### Arguments

| Argument | Required | Default | Description |
|---|---|---|---|
| `target` | Yes | n/a | Path to the target codebase directory |
| `--agents` | No | `all` | Comma-separated agents to run, or `all` |
| `--endpoint` | Conditional | n/a | Target URL/host for POC and recon agents (**required when `poc` is in scope**) |
| `--domain` | Conditional | n/a | Target domain for the recon agent (e.g. `example.com`). Auto-derived from `--endpoint` if omitted. **Required when `recon` is in scope** |
| `--max-budget-usd` | No | n/a | Hard cap on spend **per agent** in USD (e.g. `10.0`) |
| `--identifier` | No | n/a | Run identifier for deliverable filenames (auto-generated if omitted) |
| `--eval` | No | n/a | Run eval framework on each deliverable after agent completes (objective checks only) |
| `--eval-full` | No | n/a | Run eval with both objective and subjective (LLM judge) checks. Implies `--eval` |

### Available agents

Model, effort, and max_turns are configured per-agent in `AGENT_REGISTRY` inside `pipeline/claude_sdk.js`.

| Agent key | Model | Effort | Max turns | Role |
|---|---|---|---|---|
| `recon` | opus-4-6 | high | 50 | External reconnaissance (DNS, subdomains, port scanning, TLS analysis, HTTP headers, WAF detection, technology fingerprinting, endpoint discovery) |
| `code-analysis` | opus-4-6 | high | 30 | Architecture review and security-focused code summary; feeds all downstream agents |
| `poc` | opus-4-6 | high | 50 | Proof-of-concept development and execution against a live target endpoint |
| `recommendation` | opus-4-6 | high | 50 | Remediation recommendations with code-level fixes from PoC findings |

---

## Pipeline execution order

The agents always run in this order regardless of how `--agents` is specified:

```
recon + code-analysis (parallel)  →  poc  →  recommendation
```

Phase 1 runs `recon` and `code-analysis` in parallel since they operate on independent inputs (network target vs. source code). Both deliverables are passed as context to all downstream agents. `poc` runs after Phase 1 completes, and `recommendation` runs last.

---

## Examples

**Full pipeline against a local repo:**
```bash
node pipeline/claude_sdk.js /path/to/target --endpoint https://app.example.com
```

**Recon-only (no source code analysis):**
```bash
node pipeline/claude_sdk.js /path/to/target --agents recon --domain example.com
```

**Recon + code-analysis only:**
```bash
node pipeline/claude_sdk.js /path/to/target --agents recon,code-analysis --domain example.com
```

**POC agent only, against an existing run's deliverables:**
```bash
node pipeline/claude_sdk.js /path/to/target --agents poc --endpoint https://app.example.com --identifier myapp_20260225_120000
```

**Cap spend at $5 per agent:**
```bash
node pipeline/claude_sdk.js /path/to/target --max-budget-usd 5.0 --endpoint https://app.example.com
```

**Run with automatic evaluation (objective checks):**
```bash
node pipeline/claude_sdk.js /path/to/target --agents code-analysis --eval
```

**Run with full evaluation (objective + LLM judge):**
```bash
node pipeline/claude_sdk.js /path/to/target --endpoint https://app.example.com --eval-full
```

---

## Evaluation

The `--eval` and `--eval-full` flags integrate the eval framework directly into the pipeline. After each agent writes its deliverable, the framework automatically scores it.

- `--eval` runs **objective checks only**: fast, deterministic, no API cost
- `--eval-full` runs **objective + subjective** checks, including an LLM judge for qualitative assessment (costs additional API calls)

Eval reports are saved to `./evals/` as `eval_<deliverable>_<timestamp>.json`.

Agents with registered eval configs are `code-analysis`, `poc`, and `recommendation`. Agents without evals (e.g. `recon`) are silently skipped.

You can also run evals standalone:

```bash
# Objective only
node eval_framework/cli.js code-analysis deliverables/code_analysis_deliverable_*.json --skip-subjective

# With LLM judge
node eval_framework/cli.js poc deliverables/poc_testing_*.json

# View eval history
node eval_framework/cli.js history code-analysis
```

---

## Outputs

All deliverables are written to `./deliverables/`:

| Agent | Output file |
|---|---|
| `recon` | `recon_deliverable_{identifier}.json` |
| `code-analysis` | `code_analysis_deliverable_{identifier}.json` |
| `poc` | `poc_testing_{identifier}.json` |
| `recommendation` | `remediation_report_{identifier}.json` |

The `{identifier}` is either the value passed via `--identifier` or an auto-generated string in the format `{target_folder}_{YYYYMMDD_HHMMSS}`.

### HTML reports

Each JSON deliverable can be converted to a self-contained HTML report for human review:

```bash
node scripts/recon_json_to_html.js deliverables/recon_deliverable_*.json
node scripts/code_analysis_json_to_html.js deliverables/code_analysis_deliverable_*.json
node scripts/poc_json_to_html.js deliverables/poc_testing_*.json
node scripts/remediation_json_to_html.js deliverables/remediation_report_*.json
```

Agents run the appropriate converter automatically as a post-processing step.

Logs are written to `./logs/claude_security_pipeline.log` (rotated daily) and mirrored to stdout.

---

## Recon tool wrappers

The recon agent uses Node.js wrapper scripts in `tools/recon/` that normalize CLI tool output to structured JSON. Each script can also be run standalone for testing:

```bash
node tools/recon/dns_enum.js example.com
node tools/recon/subdomain_discovery.js example.com
node tools/recon/port_scan.js example.com
node tools/recon/tls_scan.js example.com:443
node tools/recon/http_headers.js https://example.com
node tools/recon/tech_fingerprint.js https://example.com
node tools/recon/waf_detect.js https://example.com
node tools/recon/endpoint_discovery.js https://example.com
node tools/recon/ct_search.js example.com
node tools/recon/whois_lookup.js example.com
```

**External tools are OPTIONAL.** Every recon script has a Node-native fallback (see "Recon tool dispatch order" near the top of this README). Installing `dig`, `whois`, `nmap`, `testssl.sh`, `subfinder`, `httpx`, `whatweb`, `wafw00f`, `feroxbuster` provides richer output but is not required. Run `scripts/install_recon_deps.sh` (Linux/macOS/WSL) or `scripts/install_recon_deps.ps1` (Windows) to install whichever are available via your package manager.

---

## Project structure

```
redteam/
├── README.md                          # This file
├── package.json                       # Node.js dependencies
├── skills/                            # Agent skill definitions (Claude prompts)
│   ├── 01-recon-agent.md              # External reconnaissance
│   ├── 02-code-analysis-agent.md      # Source code security review
│   ├── 03-poc-execution-agent.md      # Proof-of-concept development
│   ├── 04-recommendation-agent.md     # Remediation recommendations
│   ├── 05-dependency-analysis-agent.md
│   ├── 06-infrastructure-analysis-agent.md
│   ├── 07-sast-analysis-agent.md
│   └── 08-secrets-detection-agent.md
├── pipeline/                          # Pipeline orchestration
│   ├── claude_sdk.js                  # Pipeline entrypoint
│   └── output_schemas.js             # JSON schemas for structured agent output
├── eval_framework/                    # Evaluation framework
│   ├── README.md
│   ├── index.js                       # Module exports
│   ├── cli.js                         # CLI: node eval_framework/cli.js
│   ├── runner.js                      # Orchestrator for objective + subjective eval
│   ├── types.js                       # CheckResult, EvalReport, EvalContext
│   ├── scoring.js                     # Scoring, grading, report building
│   ├── subjective.js                  # LLM judge evaluator
│   ├── parsing.js                     # Markdown section parser
│   ├── filetree.js                    # File-tree suffix index for path checks
│   ├── history.js                     # Eval history viewer
│   └── agents/                        # Per-agent eval configs and checks
│       ├── index.js
│       ├── code_analysis.js
│       ├── poc_execution.js
│       └── recommendation.js
├── tools/
│   └── recon/                         # Recon tool wrapper scripts (dispatcher pattern)
│       ├── _runner.js                 # Shared helpers (whichBin, httpFetch, tls probes, tcpProbe)
│       ├── dns_enum.js
│       ├── whois_lookup.js
│       ├── subdomain_discovery.js
│       ├── port_scan.js
│       ├── tls_scan.js
│       ├── http_headers.js
│       ├── tech_fingerprint.js
│       ├── waf_detect.js
│       ├── endpoint_discovery.js
│       └── ct_search.js
├── scripts/                           # Report generators & utilities
│   ├── install_recon_deps.sh          # Recon dependency installer (Linux/macOS)
│   ├── install_recon_deps.ps1         # Recon dependency installer (Windows)
│   ├── recon_json_to_html.js          # Recon JSON → HTML converter
│   ├── code_analysis_json_to_html.js  # Code analysis JSON → HTML converter
│   ├── poc_json_to_html.js            # PoC JSON → HTML converter
│   ├── remediation_json_to_html.js    # Remediation JSON → HTML converter
│   ├── nmap_scan.js                   # nmap output parser
│   ├── whatweb_scan.js                # WhatWeb output parser
│   ├── zap_parse.js                   # OWASP ZAP output parser
│   ├── zap_scan.js                    # ZAP dispatcher (docker / parse / manual)
│   ├── semgrep_scan.js                # Semgrep wrapper
│   ├── trufflehog_scan.js             # Trufflehog wrapper + Node regex fallback
│   └── osv_scan.js                    # osv-scanner wrapper + OSV.dev API fallback
├── sample/                            # Example outputs
│   ├── readme.md
│   ├── remediation_report_ET002.json
│   └── remediation_report_ET002.html
├── deliverables/                      # Agent deliverables (created at runtime)
├── evals/                             # Evaluation reports (created at runtime)
└── logs/                              # Log files (created at runtime)
```
