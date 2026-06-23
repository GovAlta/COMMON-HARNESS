# RedTeam Offensive Security Assessment Agent: Mandatory Execution Protocol

This directory contains the RedTeam offensive security assessment framework. Before generating
**any** output, you MUST follow the protocol below. Skipping any step produces incomplete
artifacts, missing HTML reports, and an unreliable assessment.

---

## Dual-Analysis Requirement

**Every RedTeam assessment MUST combine TWO forms of analysis:**

1. **AI-driven code analysis**: the LLM reads the target application's source files,
   follows the skill `.md` files in `skills/`, and produces structured JSON deliverables.
2. **Deterministic script execution**: the `.js` scripts in `scripts/` MUST be run to
   generate HTML reports from JSON deliverables and (where applicable) run automated scans.

**AI analysis alone is NOT sufficient.** The HTML generation scripts apply CSS templates,
severity badges, attack chain visualizations, and structural consistency that hand-crafted
output cannot replicate. If you skip the scripts, the deliverables are incomplete.

---

## Pre-Execution Checklist (required before every skill run)

1. **Read the target skill file** (`skills/<skill_name>.md`).
2. **Identify the JSON output schema** defined in the skill, and produce output conforming exactly.
3. **Read the actual source files** of the target application. Do NOT rely on summaries or
   assumptions. You are the only agent with full code access.
4. **Save the JSON deliverable** to the target app's `.ai/redteam/` directory. NEVER write to the harness's own folder. The target repo's `.gitignore` must cover `.ai/`.
5. **Run the corresponding HTML generation script** (see table below).

---

## Skill Execution Order

Run skills in this sequence:

1. `skills/01-recon-agent.md`: reconnaissance and attack surface mapping
2. `skills/02-code-analysis-agent.md`: deep code security analysis (foundational; all
   subsequent agents depend on this output)
3. `skills/05-dependency-analysis-agent.md`: dependency and supply chain analysis
4. `skills/07-sast-analysis-agent.md`: static application security testing
5. `skills/08-secrets-detection-agent.md`: secrets and credential detection
6. `skills/06-infrastructure-analysis-agent.md`: infrastructure security analysis
7. `skills/03-poc-execution-agent.md`: proof-of-concept exploit development (requires
   code analysis output)
8. `skills/04-recommendation-agent.md`: remediation recommendations (requires PoC output)

Skills 3-6 may run in parallel after skill 2 completes.

---

## MANDATORY: Deterministic Script Execution

After each skill produces its JSON deliverable, you MUST run the corresponding HTML
generation script. **Do not hand-craft HTML.**

### Setup (run once per assessment)

```bash
cd <redteam-directory>
npm install                    # Install all dependencies
```

### HTML Report Generation

| Skill | JSON deliverable | HTML generation command |
|---|---|---|
| 01-recon-agent | `recon_deliverable.json` | `node scripts/recon_json_to_html.js <input.json> [output.html]` |
| 02-code-analysis-agent | `code_analysis_deliverable.json` | `node scripts/code_analysis_json_to_html.js <input.json> [output.html]` |
| 03-poc-execution-agent | `poc_deliverable.json` | `node scripts/poc_json_to_html.js <input.json> [output.html]` |
| 04-recommendation-agent | `remediation_report.json` | `node scripts/remediation_json_to_html.js <input.json> [output.html]` |

If the output path is omitted, the script defaults to the input filename with `.html` extension.

### Consolidated overview SPA (run last)

After every JSON deliverable + scanner output is in place under `<target>/.ai/redteam/`, generate the consolidated multi-tab report:

```bash
node scripts/generate_overview_html.js --repo-root <target>
# writes <target>/.ai/redteam/redteam_overview.html
```

The overview SPA aggregates severity counts across every skill and scanner, renders a tab per skill (Recon / Code Analysis / Dependency / SAST / Secrets / Infrastructure / PoC / Remediation), one Scanners tab summarising osv/trufflehog/semgrep/nmap/whatweb/zap output, plus a Sources index linking to each input file. Skills that lack a dedicated per-skill HTML script (Dependency / SAST / Secrets / Infrastructure) are rendered inline by this generator.

### Optional: Network Scanning Scripts

These scripts require network access to the target and should only be run when authorized:

| Script | Purpose | Command |
|---|---|---|
| `scripts/nmap_scan.js` | Port scanning. Uses `nmap` binary if on PATH, else falls back to a Node-native TCP-connect scanner over the top-100 ports | `node scripts/nmap_scan.js <target>` |
| `scripts/whatweb_scan.js` | Web tech fingerprinting via `whatweb` binary (legacy path) | `node scripts/whatweb_scan.js <target>` |
| `scripts/zap_parse.js` | Parse a ZAP HTML report into JSON | `node scripts/zap_parse.js <input>` |
| `scripts/zap_scan.js` | ZAP wrapper: prints manual-run instructions, or chains to `zap_parse.js` via `--report <file>`, or runs `zap-baseline.py` via Docker with `--auto-docker` | `node scripts/zap_scan.js <target> [--report file]` |
| `scripts/semgrep_scan.js` | Semgrep SAST. Uses `semgrep` if installed, else returns `{status:"not_installed"}` with install instructions | `node scripts/semgrep_scan.js <target>` |
| `scripts/trufflehog_scan.js` | Secret scanning. Uses `trufflehog` if installed, else falls back to a Node-native regex sweep (~20 patterns: AWS keys, GitHub tokens, Google API keys, JWT, PEM, Slack, OpenAI) | `node scripts/trufflehog_scan.js <target>` |
| `scripts/osv_scan.js` | Vulnerable dependency scan. Uses `osv-scanner` binary if installed, else falls back to the OSV.dev REST API against `package-lock.json` / `pnpm-lock.yaml` | `node scripts/osv_scan.js <target>` |

### Recon Tools (`tools/recon/*.js`)

Each of the 10 recon tools uses a **3-step dispatcher** (see `tools/recon/_runner.js`):

1. If the binary is on PATH → use it (richest output).
2. Else → Node-native fallback (built-in `dns`, `net`, `tls`, `https`, `whois-json` package).
3. Else → return `{error: "<tool> not found in PATH"}` JSON with exit 0.

This makes the recon phase fully runnable on Windows without apt/brew dependencies. The original Python implementation requires Linux + 10 external CLIs; this port runs identical or richer output on every OS.

### Pipeline orchestrator (`pipeline/claude_sdk.js`)

Drives all 4 agents (recon → code-analysis → poc → recommendation) end-to-end via `@anthropic-ai/claude-agent-sdk`. Two notable behaviors to know about:

- **JSON-fence extraction.** Agents commonly emit `**X COMPLETE**\n\n\`\`\`json\n{...}\n\`\`\`` as `message.result` rather than populating `structured_output`. The orchestrator now tries `structured_output` first, falls back to extracting JSON from the fenced block in `message.result`, and only writes the raw text when neither is available. The extraction helper is `extractJsonFromText()` near the top of the file.
- **Bundled Claude Code binary on Windows.** The platform-specific package `@anthropic-ai/claude-agent-sdk-win32-x64` is now an explicit dependency so the SDK spawns a known-good `claude.exe` rather than relying on whatever's on PATH.

---

## Critical Safety Rules

- **Do NOT read `.env` files** or any files containing actual production secrets.
- **Do NOT reproduce actual API keys, passwords, or tokens**; use `[REDACTED-*]` placeholders.
- **Do NOT execute exploits against production systems.** PoC agents work against local/test
  environments only with explicit authorization.
- **Do NOT modify application source code.** RedTeam is read-only analysis + deliverables.

---

## JSON Deliverable Format Requirements

All JSON deliverables MUST:
- Conform exactly to the schema defined in the skill `.md` file
- Use the field names specified in the schema (no aliases or abbreviations)
- Include severity ratings from the canonical set: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`
- Include specific file paths and line numbers referencing actual code (verified by reading)
- Include `replacement_code` that is copy-pasteable (no vague placeholders)

---

## Post-Execution Validation

After all skills have run and HTML reports have been generated, verify:

1. All JSON deliverables are valid JSON and conform to their schemas
2. All HTML reports were generated by the scripts (not hand-crafted)
3. File paths and line numbers in deliverables reference real files in the target app
4. Severity counts in metadata match actual entry counts
5. Attack chain coverage matrix (in remediation report) accounts for all identified chains

---

## Common Failure Modes

| Failure | Root cause | Prevention |
|---|---|---|
| Missing HTML report | Script not run after JSON generation | Always run the HTML script after saving JSON |
| Wrong file paths in findings | AI hallucinated paths without reading code | Always `Read` the actual file before referencing it |
| `replacement_code` is vague | "Add proper validation" instead of real code | Write copy-pasteable code; read surrounding context first |
| Severity counts don't match | Metadata written before all entries added | Count entries after writing all of them |
| Missing attack chain links | PoC → Remediation chain IDs not propagated | Cross-reference PoC IDs in remediation entries |
| npm install not run | Dependencies missing for HTML scripts | Run `npm install` in redteam directory before first script |
