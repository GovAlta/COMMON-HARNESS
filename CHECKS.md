# Harness Checks Catalogue

This file lists every check the four-team harness runs against a target
codebase. Use it when reviewing a findings report, deciding whether a
finding qualifies for an auto-fix, or sizing build-agent provisioning.

Each row carries four columns:

- **Check**: the scanner's filename without `.js`. Look on disk under `_harness/HARNESS/.claude/security/<team>/`.
- **What it does**: one or two plain sentences.
- **Mode**: *Deterministic* (rule-based or exec wrapper, identical input yields identical output) or *Probabilistic* (LLM-driven, output may vary between runs).
- **External deps**: binaries, CLI tools, or npm packages the scanner shells out to. "None" means pure Node and filesystem walk; the scanner ships everything it needs.

## Team summary

| Team | Discipline | Checks | Mode mix |
|------|------------|-------:|----------|
| Green | Code quality, hygiene, dependency health | 30 | All deterministic |
| Yellow | Writing style and AI smell | 12 | All deterministic (regex and heuristic) |
| Red | External-perspective adversarial recon | 10 plus an LLM exploitation planner | 10 deterministic, 1 probabilistic |
| Blue | Defensive architecture review plus ASVS / CAS audit | 15 skill phases plus scanner reuse | Mostly probabilistic (LLM judgement) |

Yellow's `rule12_ai_smell` is regex-driven and deterministic despite its
fuzzy-sounding name. The probabilistic surface in the harness lives in
the Red Team's Claude-SDK-driven exploitation planner and in most of
the Blue Team's skill phases, where an LLM does the reasoning.

## Green Team: code quality and dependency health

30 deterministic checks. Each runs in its own subprocess, emits a JSON
findings document, and joins the team report. Scanners ship with
zero-finding fall-throughs when the relevant package manager is absent (no `go.mod`,
no `package.json`, no Python source, and so on) so cross-stack runs
stay quiet.

| Check | What it does | Mode | External deps |
|-------|--------------|------|---------------|
| `api_base_url_audit` | Cross-checks the API base URL across frontend source, tests, CI env, env templates, and Go backend defaults. Flags any drift so dev/staging/prod values stay aligned. | Deterministic | None |
| `broken_file_deps_scan` | Looks for `"name": "file:../..."` local path dependencies that would not resolve outside the monorepo. | Deterministic | None |
| `ci_pipeline_audit` | Reads every `.github/workflows/*.yml` and asserts presence of the canonical security gates (SAST, dep audit, secret scan, build, test). | Deterministic | None |
| `console_log_scan` | Counts `console.*` calls in production source paths so debug output does not leak into shipped bundles. | Deterministic | None |
| `dangerous_patterns_scan` | Pattern-based SAST for JS/TS/Vue (`innerHTML=`, `eval(`, `document.write(`, `dangerouslySetInnerHTML`) and for Go (`fmt.Sprintf` with SQL fragments). | Deterministic | None |
| `depcheck_scan` | Finds unused or missing npm dependencies. Prefers `depcheck` if available and falls back to scanning imports across `src/`. | Deterministic | `depcheck` (npm, optional) |
| `env_default_audit` | Flags risky defaults in committed `.env*` files such as `JWT_SECRET=changeme`. | Deterministic | None |
| `eslint_config_audit` | Detects ESLint configuration anti-patterns (missing rules, blanket `eslint-disable`, no-undef silenced). | Deterministic | None |
| `eslint_scan` | Runs ESLint on the project and emits one finding per (file, rule, severity). Severity 2 maps to MEDIUM (HIGH for `no-undef`); severity 1 maps to LOW. | Deterministic | `eslint` (project's own version) |
| `gitignore_audit` | Verifies `.gitignore` covers the conventional set: `node_modules`, `dist`, `.env`, `coverage`, `.ai`, build artifacts. | Deterministic | None |
| `golangci_audit` | Verifies Go projects ship a `.golangci.yml` and that it enables the expected linter set. | Deterministic | None |
| `go_test_bypass_audit` | Detects paired build-tag-fenced bypass files (for example `*testbypass_dev.go` and `*testbypass_prod.go`) that disable auth in tests. | Deterministic | None |
| `go_test_coverage_scan` | Per-package Go coverage via `go test ./... -short -cover`. Parses output and flags packages below the threshold. | Deterministic | `go` toolchain |
| `go_toolchain_audit` | Reads `go.mod` for `go` and `toolchain` directives and emits INFO so the dashboard shows the version in use. | Deterministic | None |
| `govulncheck_scan` | Wraps `govulncheck -json ./...` and emits HIGH per reachable vulnerability with the import trace attached. | Deterministic | `govulncheck` (`go install golang.org/x/vuln/cmd/govulncheck@latest`) |
| `integration_test_enum` | Walks `*.go` files, identifies files with `//go:build integration`, and reports the size of the integration-test surface so reviewers can spot orphaned suites. | Deterministic | None |
| `java_patterns_scan` | Pattern-based SAST for Java and JSP (SQL injection, XXE, weak crypto, unsafe deserialisation). Covers the common, serious set without requiring a Java toolchain. | Deterministic | None |
| `license_scan` | Detects copyleft packages (GPL / AGPL / LGPL) in npm dependency trees. Prefers `license-checker` and falls back to reading `node_modules/<pkg>/package.json`. | Deterministic | `license-checker` (optional, npm) |
| `madge_scan` | Detects circular module imports in JS and TS. Skips silently if `madge` is not installed. | Deterministic | `madge` (optional, npm) |
| `migration_sequence_scan` | Detects gaps in numbered SQL migration sequences (for example `001_*.sql` jumping to `005_*.sql`). | Deterministic | None |
| `npm_audit_scan` | Wraps `npm audit --json` per `package.json` tree. Emits one finding per advisory with severity preserved. | Deterministic | `npm` (project's own) |
| `osv_scan` | Dependency vulnerability scan via OSV.dev across Maven, Gradle, pip, Poetry, Pipenv, Cargo, RubyGems, Composer, NuGet plus npm. | Deterministic | Network access to api.osv.dev |
| `prettier_check` | Detects packages with no enforced formatting standard (no `.prettierrc`, no Prettier in `package.json`). | Deterministic | None |
| `python_patterns_scan` | Pattern-based SAST for Python (`subprocess` with shell-true, `eval`, `pickle.load`, SQL string concatenation). Covers the common, serious set without requiring `bandit`. | Deterministic | None |
| `redocly_scan` | Lints OpenAPI documents via `@redocly/cli`. Emits MEDIUM per error and LOW per warning. | Deterministic | `@redocly/cli` (npx, on-demand) |
| `secret_scan` | Credential and API-key detection across the working tree. Catches AI-tooling artifacts under `.ai/reports/` that quote live secrets verbatim. | Deterministic | None |
| `semgrep_scan` | Optional SAST scanner. Runs `semgrep --config p/security-audit p/javascript p/typescript p/golang --json`. Skipped if `semgrep` is not installed (Windows needs WSL). | Deterministic | `semgrep` (optional) |
| `vitest_coverage_scan` | Runs `vitest --coverage` and emits HIGH per source file with more than 100 lines and less than 20% line coverage. Catches the "test exists but exercises nothing" pattern. | Deterministic | `vitest` (project's own) |
| `vue_tsc_scan` | Runs `vue-tsc --noEmit --skipLibCheck` on Vue and TS projects and parses the TS errors. Catches type drift the build would not fail on. | Deterministic | `vue-tsc` (project's own) |
| `websocket_audit` | Defensive review of WebSocket handlers covering rate limiting, error leakage to client, and unauthenticated message types. | Deterministic | None |

## Yellow Team: writing style and AI smell

12 deterministic rule scanners. Each walks the target tree, extracts
prose segments (Markdown body, JSDoc, Go doc comments, Vue templates),
and flags matches against one style rule. Shared utilities live in
`pipeline/walker.js` (file walk and prose extraction) and
`pipeline/output_schemas.js` (canonical finding shape).

| Check | What it does | Mode | External deps |
|-------|--------------|------|---------------|
| `rule01_not_x_but_y` | Detects "this is not X, it is Y" and "not just X, but Y" constructions. The most reliable single signal of AI prose. | Deterministic | None |
| `rule02_em_dash` | Detects em dashes and en dashes. Both are forbidden in prose. | Deterministic | None |
| `rule03_tetracolon` | Detects four-part parallel structures used as rhetorical flourish. | Deterministic | None |
| `rule04_cinematic_sentences` | Detects runs of short declarative sentences used for dramatic effect, the "movie-trailer voice-over" tic. | Deterministic | None |
| `rule05_rhetorical_anchor` | Detects "this is the moment", "this is where", or "this is how" anchors that almost never carry unique meaning. | Deterministic | None |
| `rule06_banned_vocabulary` | Detects banned words, banned sentence openers, and cliché adjective phrases against a configurable wordlist. | Deterministic | None |
| `rule07_rule_of_three` | Detects three-item "X, Y, and Z" lists used as rhetorical flourish rather than enumeration. | Deterministic | None |
| `rule08_participial_tail` | Detects sentences that close with a comma plus a participle phrase summarising what the sentence already said. | Deterministic | None |
| `rule09_ensure_hedge` | Detects "ensure" used as a verb hedge. Most uses work better with a direct verb. | Deterministic | None |
| `rule10_intensifier` | Detects vague intensifiers in prose. The word list lives in the script source. | Deterministic | None |
| `rule11_decorations_emoji` | Detects emojis and decorative box-drawing or ASCII-art noise in documentation. | Deterministic | None |
| `rule12_ai_smell` | Detects five composite AI-prose tics: sycophantic openings, foreshadowing or recap openers, over-explanation tells, hedge-stacks (three or more weakening modals in one sentence), and assistant-identity disclaimers. The exact phrase templates live in the script source. Regex-driven and deterministic despite the name. | Deterministic | None |

## Red Team: external adversarial recon

The Red Team runs two layers. The first is a deterministic recon pass
of 10 tools under `tools/recon/`. The second is a probabilistic
exploitation planner under `pipeline/claude_sdk.js`. The recon tools
follow the same dispatch pattern: prefer the richest binary if
available, fall back to a native Node implementation otherwise. This
keeps the harness usable on a build agent without any optional tooling
installed.

### Recon tools (deterministic)

| Check | What it does | Mode | External deps |
|-------|--------------|------|---------------|
| `ct_search` | Certificate-transparency log search via crt.sh. Returns every cert ever issued for the target's domain. Strong signal for subdomain enumeration. | Deterministic | Network access to crt.sh |
| `dns_enum` | DNS record enumeration. Prefers `dig` and falls back to Node `dns.promises`. AXFR and DNSSEC limitations are noted in the output. | Deterministic | `dig` (optional), Node `dns` |
| `endpoint_discovery` | Endpoint and directory discovery. Combines `feroxbuster` (optional), `robots.txt`, `sitemap.xml`, and a bundled 80-path wordlist covering admin / API / health / debug / config / source-control routes. | Deterministic | `feroxbuster` (optional) |
| `http_headers` | Audits HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, plus other modern response headers. Pure Node fetch, no binaries needed. | Deterministic | None (Node fetch) |
| `port_scan` | TCP port scan. Prefers `nmap -sV -sC` (service and version detection) and falls back to Node `net.Socket` over the harness's TOP_PORTS list. | Deterministic | `nmap` (optional) |
| `subdomain_discovery` | Combines `subfinder` (optional), crt.sh, and a bundled subdomain bruteforce wordlist of about 50 entries. Always-on paths are crt.sh and bruteforce; subfinder is bonus. | Deterministic | `subfinder` (optional), crt.sh |
| `tech_fingerprint` | Technology fingerprinting. Prefers `httpx` and `whatweb` and falls back to Node header and body sniffing (Server, X-Powered-By, HTML signatures). | Deterministic | `httpx`, `whatweb` (optional) |
| `tls_scan` | TLS and SSL analysis. Prefers `testssl.sh` or `sslscan` and falls back to a Node `tls.connect()` probe enumerating TLS 1.0 through 1.3 and parsing the peer certificate. | Deterministic | `testssl.sh` or `sslscan` (optional) |
| `waf_detect` | WAF detection. Prefers `wafw00f` and falls back to a heuristic probe of three requests covering signatures from Cloudflare, Akamai, AWS WAF, Azure, Sucuri plus Incapsula. | Deterministic | `wafw00f` (optional) |
| `whois_lookup` | WHOIS lookup. Prefers the `whois` binary, falls back to the `whois-json` npm package, and emits a structured error on total failure. Output fields are normalised regardless of source. | Deterministic | `whois` binary or `whois-json` (npm) |

### Exploitation planner (probabilistic)

| Check | What it does | Mode | External deps |
|-------|--------------|------|---------------|
| `pipeline/claude_sdk` | The Red Team's LLM orchestrator. Reads the recon output, plans attack paths (auth bypass, RCE chains, data exfil routes), and writes structured exploitation reports under `.ai/redteam/deliverables/`. The plans are LLM-generated and may differ across runs as the underlying model evolves. | Probabilistic | `@anthropic-ai/sdk`, Anthropic API key |

## Blue Team: defensive architecture and ASVS or CAS audit

The Blue Team runs 15 numbered skill phases. An LLM works through each
phase against the target and produces architecture maps, threat
models, and ASVS or CAS conformance reports. Each skill writes its
output to a fixed location so subsequent phases can consume it. Most
phases shell out to the Green Team's deterministic scanners for raw
evidence and use the LLM only for interpretation.

| Skill | What it does | Mode | External deps |
|-------|--------------|------|---------------|
| `01-application-map` | Builds a structured map of the application: entry points, services, data flows, trust boundaries. | Probabilistic | `@anthropic-ai/sdk` |
| `02-security-classification` | Classifies each component by sensitivity (public, internal, confidential, restricted) and assigns the applicable controls. | Probabilistic | `@anthropic-ai/sdk` |
| `03-security-architecture` | Produces an architecture-level security review covering auth model, session handling, secrets management, and trust boundaries. | Probabilistic | `@anthropic-ai/sdk` |
| `04-threat-model` | STRIDE-style threat model across the application map. Lists threats per asset with proposed mitigations. | Probabilistic | `@anthropic-ai/sdk` |
| `05-asvs-level2-assessment` | ASVS Level 2 conformance assessment. Walks every L2 requirement and writes pass, fail, or N/A with evidence. | Probabilistic judgement, deterministic evidence | `@anthropic-ai/sdk` plus Green Team scanners |
| `06-cas-compliance` | CSA Cloud Application Security (CAS) compliance assessment. Same shape as ASVS but for cloud-app controls. | Probabilistic judgement, deterministic evidence | `@anthropic-ai/sdk` plus Green Team scanners |
| `07-kill-chain-aggregator` | Aggregates findings from all Blue scanners and Red recon into a Lockheed kill-chain view: recon, weaponise, deliver, exploit, install, C2, action. | Probabilistic | `@anthropic-ai/sdk` |
| `08-tool-scanning` | Orchestrates the tool-scanning suite. Invokes the Green Team's deterministic scanners over the same target and folds their output into the Blue report. | Deterministic orchestration of deterministic scanners | All Green Team external deps |
| `09-security-unit-tests` | Generates security unit tests per ASVS L2 requirement, targeted at the application's actual endpoints. | Probabilistic | `@anthropic-ai/sdk` |
| `10-dr-resilience` | DR and resilience assessment covering failure-mode analysis, recovery objectives, and backup posture. | Probabilistic | `@anthropic-ai/sdk` |
| `11-code-fix-generation` | For each finding (including the deterministic scanner findings), proposes a patch as a unified diff with rationale. | Probabilistic | `@anthropic-ai/sdk` |
| `12-security-overview-report` | Composes the top-level Blue Team report: executive summary, findings, kill chain, ASVS or CAS status, prioritised remediation roadmap. | Probabilistic | `@anthropic-ai/sdk` |
| `13-requirements-map` | Maps every codified requirement (business / functional / non-functional) onto the application map so audit gaps are visible. | Probabilistic | `@anthropic-ai/sdk` |
| `14-asvs-compliant-builder` | Generates a per-finding remediation plan that, when applied, brings the application to ASVS L2. Pairs with skill 05. | Probabilistic | `@anthropic-ai/sdk` |
| `15-cas-compliant-builder` | Same as skill 14 but for CAS instead of ASVS. | Probabilistic | `@anthropic-ai/sdk` |

## How deterministic works in practice

A deterministic check runs twice on the same input and returns
byte-identical output. Most of the harness is deterministic by
construction: the Green Team scanners are pure Node and filesystem
walks plus subprocess wrappers around tools that are themselves
deterministic. The Yellow Team rules are regex walks. The Red Team
recon tools are network probes, so their output varies with network
state, but the parsing is fixed.

The probabilistic surface lives in the Blue Team skill set and the Red
Team exploitation planner. Both call the Claude SDK and ask the model
to produce a structured artefact (threat model, exploitation plan,
ASVS verdict). The same prompt and the same model version will not
return byte-identical output across runs because model temperature
and recent fine-tuning shifts can both move the report. The artefacts
these phases produce are expert opinion requiring human review.

## Run order (typical full sweep)

1. Green runs first (two to five minutes depending on toolchain availability). It produces the deterministic evidence base.
2. Yellow runs in parallel with Green (about 30 seconds, pure regex).
3. Red recon runs in parallel with Green (one to three minutes, bounded by network round-trips). The Claude SDK exploitation pass runs after recon completes.
4. Blue runs last, consumes Green and Red output, and emits the per-phase reports.

Wall-clock total for a clean target on a build agent with the optional
tooling installed is 15 to 20 minutes. Without the optional binaries
(semgrep / govulncheck / nmap and similar) the harness still runs and
skips the tool-specific scanners with a note in the report.

## Where to find this in the repo

- Scanner sources: `_harness/HARNESS/.claude/security/<team>/scripts/` (Green, Yellow), `tools/recon/` (Red), `skills/` (Blue, Yellow, Red high-level skills).
- Pipeline runners: `_harness/HARNESS/.claude/security/<team>/pipeline/`.
- Reference docs (per team, longer-form): `_harness/HARNESS/.claude/references/security-<team>.md`.
- Latest findings: `_harness/results/scan-2/<team>/` plus the per-app `.ai/<team>/` directories inside each app repo.
