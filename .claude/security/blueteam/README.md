# Blue Team Security Assessment Framework
These agents will produce reports, code to use to implement fixes, and new requirements to use to avoid re-generating "bad code" from your agents.

When reviewing results, start from the .ai/blueteam/reports/security_overview.html report.

**Global Prerequisites**
- Node.js 20+ must be installed and available to the AI
- Run `npm install` in this directory to install dependencies
- Claude Code is required to run all agents

**Agent-Specific Prerequisites:**
The tool scanning skill (`skills/08-tool-scanning.md`) uses Node.js-native tools installed as npm devDependencies -- no external binaries are required. Running `npm install` in this directory installs everything needed:
- **npm audit** (built-in): scans dependencies for known CVEs
- **secretlint**: detects hardcoded secrets, API keys, and credentials
- **ESLint security plugins**: static analysis for JavaScript/TypeScript security anti-patterns
- **evilscan** (optional, network scanning): only runs with explicit `--network` flag

### "Blue Team" Agents
The *Blue Team* agents are the defensive agents -- they help to improve the cybersecurity defenses of the application. These work at the level of the code of the system - they essentially do static analysis and recommend change.

Each agent generates Markdown and HTML reports. A separate skill de-duplicates findings across all skills (these do tend to overlap) and produces a consolidated overall report.

**IMPORTANT**
- These agents are geared for systems at the Protected B level.
- These agents are currently working best with Claude Opus 4.6. They also work with Sonnet.
- These agents, with the exception of the unit test agent, do **NOT** make direct updates to code.
  - Humans must review the outputs, such as via the reports, and decide what to apply.
- These agents **will** work on a local clone of a GitHub repository. **They may not work directly with a remote repository** as they write output to the local file system and make use of Open Source security tools.

The following agents help with protecting the application:
|Agent|User-callable?|Description|
|-----|--------------|-----------|
|CLAUDE.md|**Read first**|Mandatory execution protocol. Must be read at the start of every session before any skill is invoked. Defines required output filenames, required JSON data artifacts, HTML generation rules (never hand-craft HTML; always run `generate_report_html.js` / `generate_overview_html.js`), skill execution order, and post-execution validation steps. Prevents the most common failure modes: wrong output filenames, missing JSON artifacts, and hand-crafted HTML reports.|
|shared/skills/api-security.md|No|Sub-agent called by other agents that need to secure an API according to cybersecurity standards. Not intended for direct use.|
|shared/schemas/artifacts.md|No|Core JSON schema definitions for `code_changes.json`, `security_requirements.json`, `environment_assumptions.json`, and `risk_acceptances.json`; de-duplication algorithm; 13-step extraction phase instructions (Steps 1-12: artifact writing; Step 13: risk acceptance processing). Referenced by assessment skills. Not intended for direct use. See also: `shared/schemas/application-map.md`, `shared/schemas/kill-chains.md`, `shared/schemas/html-report-template.md`.|
|RISK_ACCEPTANCE_GUIDE.md|N/A|Developer and security-staff reference for the risk acceptance system. Explains inline markers, the risk register schema, governance badges, non-suppressible finding types, review expiry, and the operational playbook. **Can be provisioned to any assessed repository** as a local reference for developers and reviewers.|
|shared/schemas/application-map.md|No|Schema sub-file: `application_map.json` schema and field definitions. Read by `skills/01-application-map.md` only. Not intended for direct use.|
|shared/schemas/kill-chains.md|No|Schema sub-file: `kill_chains.json` schema and field definitions. Read by `skills/07-kill-chain-aggregator.md` only. Not intended for direct use.|
|shared/schemas/html-report-template.md|No|HTML page template, CSS, Markdown→HTML conversion rules, and Mermaid→SVG conversion rules. Read by any skill that generates `.html` report files. Not intended for direct use.|
|shared/schemas/controls-yaml.md|No|Schema reference for the optional `.ai/controls.yaml` compensating controls declaration file. Written by the application team to annotate findings with inline review notes, compensating control descriptions, or known-false-positive markers. Read by all assessment skills. Not intended for direct use.|
|shared/reference/environment-baseline.md|No|Defines the assumed security controls present in all application deployment environments (e.g. Cloud Landing Zone, ARO/OpenShift, Azure). Read by assessment skills to avoid false positives on infrastructure-level controls that are present by policy but not visible in application source code. Not intended for direct use.|
|skills/02-security-classification.md|Yes|Can be used as a sub-agent or stand-alone. Produces a rough draft information security classification for the application and each data store. Does not replace an Information Management assessment or Information Controller decision.|
|skills/13-requirements-map.md|Yes|**Alternative entry point for pre-code threat modeling.** Use instead of `skills/01-application-map.md` when no source code exists yet (requirements/epics phase). Reads requirements documents (Markdown epics, user stories, use cases) and builds a structured system model, writing `application_map.json` with `source: "requirements"`. The threat model skill detects this flag and automatically operates in Requirements Mode (design-level DFDs, Design Threat Instances instead of code examples, no code-change artifacts). When code becomes available, replace by running `skills/01-application-map.md`.|
|skills/01-application-map.md|Yes|**Run once before the three assessment skills.** Discovers the application's tech stack, all API endpoints, authentication mechanisms, critical files, secrets (source + git history), AI/bot-authored commits, and .gitignore gaps. Writes `.ai/blueteam/data/application_map.json` stamped with the current git commit hash. Each assessment skill reads from this map and skips its own redundant discovery phase. The map is regenerated automatically if new commits are detected since the last run.|
|skills/03-security-architecture.md|Yes|**Optional. Run after `skills/01-application-map.md`, before the threat model.** Identifies the deployment profile (internal staff / public citizen / dual portal), describes the implemented security architecture from code and/or requirements documents, and emits SA-NNN architectural gap findings distinct from ASVS/CAS code-level findings. Gap categories: authorization model, data protection, perimeter, logging, API architecture, profile. Writes `security_architecture.json` which feeds forward into the threat model and kill chain aggregator. Also extracts SR-NNN security requirements from each SA-NNN gap (no CC-NNN code changes; architectural gaps require design decisions, not code patches). When present, adds a **Security Arch** tab to the overview SPA.|
|skills/05-asvs-level2-assessment.md|Yes|Assesses the application against OWASP Application Security Verification Standard (ASVS) 4.0.3 Level 2. Produces a findings report with recommended code fixes and requirements updates, plus actionable per-finding verification tests (for example curl commands with placeholders).|
|shared/reference/attack-chain-reference.md|No|Shared MITRE ATT&CK tactic reference tables and kill chain construction standards used by all assessment skills. Centralizes the tactic mappings (ATT&CK tactic → web app realization; ASVS category → tactic; CAS rule → tactic) and common chain patterns so they are maintained in one place. Not intended for direct use.|
|skills/06-cas-compliance.md|Yes|Assesses whether the application meets the Cybersecurity Architecture Standard (CAS) policies. "Operational" items like account naming are not considered. Recommends remediations at the code and requirements level when gaps are found, and emits actionable verification tests for disputed/externally controlled findings.|
|shared/skills/requirements-updater.md|No|Sub-agent skill to assist agents in updating security requirements.|
|skills/08-tool-scanning.md|Yes|Runs the three security scanners (npm audit + secretlint + ESLint security plugins) against a local codebase (optional evilscan for network scanning), consolidates and deduplicates findings, and produces a unified JSON report. All tools are npm packages, so no external binary installations are required.|
|shared/reference/cloud-environment-baseline.md|No|Shared baseline for cloud-hosted resilience assessment. Defines evidence-first cloud credit rules (observed/declared/assumed), Cloud Landing Zone default characteristics, and handling of optional app cloud declarations. Not intended for direct use.|
|skills/10-dr-resilience.md|Yes|Assesses disaster recovery and business continuity resilience controls from source code, IaC, scripts, plus documentation. Produces a 100-point resilience score, a gap inventory, plus a prioritized remediation plan in machine-readable and human-readable formats.|
|skills/04-threat-model.md|Yes|Generates a draft threat model from the code using STRIDE + DREAD. Usable as part of an STRA and to inform threats, risks plus defenses. Appropriate for data classifications up to Protected B. Includes finding-level verification test generation suitable for follow-up validation.|
|shared/skills/information-classification.md|No|Sub-agent skill that provides an AI with the information security classification framework.|
|skills/07-kill-chain-aggregator.md|Yes|**Run after** all three upstream assessments (threat model + CAS + ASVS) have completed. Reads all three assessment reports together and identifies cross-domain kill chains: multi-step attack paths where each step draws on findings from a different assessment skill. These compound paths are invisible to any individual skill. Produces a unified kill chain report, adds chain-level verification test entries, and elevates SR-NNN/CC-NNN priorities where cross-domain chain severity exceeds individual-assessment scoring.|
|shared/skills/preflight.md|No|Shared pre-assessment preflight used by core assessment skills to load baseline assumptions, parse optional controls, check risk acceptance register presence, and evaluate application map staleness where applicable. Not intended for direct use.|
|skills/11-code-fix-generation.md|Yes|**Optional post-processing pass.** Run after assessment skills when `validate_reports.py` warns `N/M CC entries missing replacement_code`. Reads each CC entry in `code_changes.json`, opens the referenced source files, and writes a complete, copy-paste-ready `replacement_code` block so that "Show fix" inline code blocks appear in the Remediation Plan tab of the overview report. Safe to skip if all CC entries already have `replacement_code` populated. Outputs: updated `code_changes.json`, regenerated `code_changes.html` (if `code_changes.md` exists), regenerated `security_overview.html`.|
|skills/12-security-overview-report.md|Yes|**Run last, after all other skills.** Reads all machine-readable `.ai/blueteam/data/` JSON artifacts produced by completed assessment skills and synthesizes a unified overview report. Produces a Markdown summary and a single-page HTML application with ten audience-targeted tabs: Dashboard (leadership + dev metrics), Remediation Plan (report links + Quick Reference summary table + File Hotspots table ranking source files by finding count + CC cards with cross-references and current-code blocks), Common Issues, Attack Chains, one tab per assessment skill, Resiliency & DR, Tool Scans, and Risk Register. Gracefully degrades when optional artifacts (kill chains, scan results, risk acceptances) are absent. Read-only; does not modify any existing artifact.|
|skills/09-security-unit-tests.md|Yes|Router skill for security unit-test coverage. Performs shared discovery/convention checks and dispatches to stack-specific sub-skills (Node/Express, Frontend SPA, Supabase BaaS), then generates/runs tests and writes the coverage report.|
|unit_test_subskills/security_unit_test_shared_core_skill.md|No|Shared core sub-skill for unit-test coverage: test framework discovery, naming/layout conventions, omit-marker handling, generic generation rules, and report contract. Not intended for direct use.|
|unit_test_subskills/security_unit_test_node_express_skill.md|No|Node/Express sub-skill for backend security test generation (authn/authz, endpoint controls, validation, CORS, rate limiting, headers, uploads, logging). Invoked by the router skill.|
|unit_test_subskills/security_unit_test_frontend_spa_skill.md|No|Frontend SPA sub-skill for Vue/React client-side security tests (guards, token storage posture, validation behaviors, auth error handling). Invoked by the router skill.|
|unit_test_subskills/security_unit_test_supabase_baas_skill.md|No|Supabase BaaS sub-skill for edge-function auth/header validation and policy-aware behavior checks. Invoked by the router skill when Supabase is detected.|
|shared/reference/human-process-controls.md|N/A|Informational Markdown file listing process-based controls that must exist outside of code to achieve ASVS Level 2.|

#### Output Folders
All skills write their output into subfolders of `.ai/` within the target application's repository:

| Folder | Contents |
|--------|----------|
| `.ai/blueteam/data/` | Machine-readable data files reused across sessions: application map (`application_map.json`), security classification YAMLs, code change and security requirement JSON artifacts (`code_changes.json`, `security_requirements.json`), verification test catalog (`verification_tests.json`), kill chain inventory (`kill_chains.json`), DR resilience assessment (`dr_resilience_assessment.json`), optional app cloud declaration (`app_cloud_environment.json`), environment assumptions, security scan results, **risk acceptances** (`risk_acceptances.json`, authored by the application team; read by all assessment skills) |
| `.ai/blueteam/reports/` | Human-readable Markdown and HTML reports: application map, threat model, information security classification, ASVS assessment, CAS compliance report, cross-domain kill chains, DR resilience assessment report, security unit test coverage report, code changes and security requirements summaries, **risk register** (`risk_register.md` / `risk_register.html`), **unified overview report** (`security_overview.md` / `security_overview.html`) |
| `.ai/blueteam/data/raw/` | Raw output from individual security scanning tools (npm audit, secretlint, ESLint security) |

#### Risk Acceptance

The Blue Team agents support a formal **risk acceptance** mechanism. When a team cannot or will not remediate a known finding, they can:

1. Add an inline `// RISK_ACCEPTED: RA-001` marker above the flagged line in source code.
2. Add the corresponding entry to `.ai/blueteam/data/risk_acceptances.json` with a business justification, compensating controls, responsible party, and a mandatory review date.

Accepted findings move to an **Accepted Risks appendix** in assessment reports rather than disappearing; they remain visible in every subsequent run. The **Risk Register tab** in the unified overview report (`security_overview.html`) provides a consolidated view across all assessments.

See **`RISK_ACCEPTANCE_GUIDE.md`** in this folder for full instructions. This file can be provisioned to any assessed repository as a local reference.

#### Builder Skills (code generation)

The following skills generate ASVS- and CAS-compliant code rather than assessing existing code. They are used **before** writing new features so that security controls are built in from the start.

|Skill|User-callable?|Description|
|-----|--------------|-----------|
|skills/14-asvs-compliant-builder.md|Yes|Generates ASVS Level 2-compliant TypeScript/Node.js code. Reads the relevant ASVS chapter files on-demand (each chapter has a `## Secure Implementation Guide` section) and applies secure defaults (enterprise IdP integration, secret management, structured logging, PII redaction, AES-256-GCM field encryption). Produces annotated code with `[OK] VN.N.N` inline references and an ASVS coverage table. Does **not** write `.ai/` artifacts (outputs code into the target repository).|
|skills/15-cas-compliant-builder.md|Yes|Generates Cybersecurity Architecture Standards-compliant TypeScript/Node.js code. Reads `shared/reference/cas-rule-definitions.md` (all 57 CAS rules with implementation patterns) and produces annotated code with `[OK] CAS:RULE-NNN` inline references and a CAS coverage table. Does **not** write `.ai/` artifacts (outputs code into the target repository).|

**Sample prompts:**

```
Using the skill at "<path-to-ai-skills>/security/blueteam/skills/14-asvs-compliant-builder.md",
write a secure file upload endpoint for the application in the current directory.

Using the skill at "<path-to-ai-skills>/security/blueteam/skills/15-cas-compliant-builder.md",
implement audit logging that satisfies CAS LOG requirements for the application in the current directory.
```

#### Future Expansion
- Remove the use of MITRE ATT&CK framework and just have the AI develop its own kill / attack chains
- Add KICS to the scanning tools used in the "tool use" skill to enable better infrastructure-as-code scanning
- Make the Blue Team agents address cybersecurity at the level of the design and the architecture
- Make the Blue Team agents address cybersecurity directly at the level of the requirements

#### HOWTO: Running the Blue Team agents
**Running the Agents:**
The following is a recommended approach to running the Blue Team agents locally. The code for the application must exist, of course. This assumes that you are using Claude Code to run things.

0. Read `CLAUDE.md`: "Read the file at *folder/CLAUDE.md* and confirm the mandatory execution protocol before proceeding."
    - Loads the required output filenames, JSON data artifacts, and HTML generation rules before any output is generated.
    - **This must be the first action in every session.** Skipping this step is the root cause of incorrect report filenames, missing data artifacts, and hand-crafted HTML.

**If starting from requirements (no code yet):**
- Run `skills/13-requirements-map.md` instead of step 4's auto-trigger of `skills/01-application-map.md`:
  "Using the skill at *folder/skills/13-requirements-map.md*, map the system described in requirements/my_epics.md"
  - This writes `application_map.json` with `source: "requirements"`.
  - Then run the threat model skill (step 4 below); it will automatically detect Requirements Mode.
  - The threat model will produce Design Threat Instances (design-level analysis) instead of Vulnerable Code Examples, and will produce security requirements (SR entries) without code-change artifacts (CC entries).
  - When code becomes available, run `skills/01-application-map.md` to regenerate the map as a code-based map, then re-run the threat model for a full code-verified assessment.

1. If the code is in GitHub, clone the target repo locally.
2. Make the Blue Team agents available locally (both primary agents and sub-agents), such as by cloning the harness repo from GitHub.
3. Change into the directory with the target application's code.
3b. *(Optional)* Run the security_architecture_design_skill: "Using the skill at *folder/skills/03-security-architecture.md*, assess the security architecture of the application in the current directory".
    - Requires `skills/01-application-map.md` to have run first (auto-triggered by step 4 if skipped, but you can also run it explicitly first and then run this skill before the assessments).
    - Produces `.ai/blueteam/data/security_architecture.json`, `.ai/blueteam/reports/security_architecture.md`, and `.ai/blueteam/reports/security_architecture.html`. Adds a **Security Arch** tab to the overview SPA.
4. Run the threat_model_skill: "Using the skill at *folder/skills/04-threat-model.md*, assess the threats to the application in the current directory".
    - The threat model skill will automatically trigger `skills/01-application-map.md` if `.ai/blueteam/data/application_map.json` is absent or stale, so no manual pre-step is required. However, you can also run the application map skill explicitly first: "Using the skill at *folder/skills/01-application-map.md*, map the application in the current directory".
    - Produces `.ai/blueteam/reports/threat_model.md` (threat model), `.ai/blueteam/reports/security-classification.md` (human-readable classification report), `.ai/blueteam/data/security-classification.yaml` / `.ai/blueteam/data/security-classification-details.yaml` (machine-readable classification data reused by subsequent skills), and `.ai/blueteam/data/application_map.json` / `.ai/blueteam/reports/application_map.md` (application discovery map reused by subsequent skills).
5. Run the cybersecurity_architecture_standards_skill: "Using the skill at *folder/skills/06-cas-compliance.md*, assess the application in the current directory".
    - Reads `.ai/blueteam/data/application_map.json` to skip redundant discovery. Will regenerate the map first if code has changed since the threat model run.
    - Produces `.ai/blueteam/reports/cybersecurity_architecture_standard_compliance.md` with non-compliances, compliances, things to check, recommended code fixes and requirements updates. Machine-readable artifacts are written to `.ai/blueteam/data/`.
6. Run the asvs_level2_assessment_skill: "Using the skill at *folder/skills/05-asvs-level2-assessment.md*, assess the application in the current directory against the ASVS Level 2 standard".
    - Reads `.ai/blueteam/data/application_map.json` to skip Phase 1 discovery. Will regenerate the map first if code has changed.
    - Produces `.ai/blueteam/reports/asvs_level2_security_assessment.md` with non-compliances, compliances, things to check, recommended code fixes and requirements updates. Machine-readable artifacts are written to `.ai/blueteam/data/`.
7. Run the kill_chain_aggregator_skill: "Using the skill at *folder/skills/07-kill-chain-aggregator.md*, analyze the kill chains across all security assessments for the application in the current directory".
    - Reads the outputs of steps 4-6 together and identifies cross-domain kill chains: multi-step attack paths that span findings from more than one assessment. Produces `.ai/blueteam/reports/cross_domain_kill_chains.md`, `.ai/blueteam/data/kill_chains.json`, and updates any SR-NNN/CC-NNN priorities elevated by cross-domain chain severity. **Requires steps 4, 5, plus 6 to have completed first.**
8. Run the cybersecurity_tool_use_skill: "Using the skill at *folder/skills/08-tool-scanning.md*, run security scans on the application in the current directory".
    - Produces `.ai/blueteam/data/security-scan-results.json` with consolidated, deduplicated findings from the three scanners (npm audit + secretlint + ESLint security plugins). Optional evilscan network scanning runs with the `--network` flag. All tools are npm packages installed via `npm install`, so no external binaries are required.
9. Run the security_unit_test_skill: "Using the skill at *folder/skills/09-security-unit-tests.md*, assess and improve security unit test coverage for the application in the current directory".
    - Adds or augments unit tests to close security control coverage gaps. Produces `.ai/blueteam/reports/security-test-coverage-report.md`.
10. Run the DR_Resilience_Analysis_Skill: "Using the skill at *folder/skills/10-dr-resilience.md*, assess disaster recovery and business continuity resilience for the application in the current directory".
    - Optionally create `.ai/blueteam/data/app_cloud_environment.json` first when cloud DR settings are not visible in source but are known by the team.
    - Produces `.ai/blueteam/data/dr_resilience_assessment.json`, `.ai/blueteam/reports/dr_resilience_assessment.md`, and `.ai/blueteam/reports/dr_resilience_assessment.html`.
11. *(Optional)* Run the code_fix_generation_skill: "Using the skill at *folder/skills/11-code-fix-generation.md*, populate replacement_code for all CC entries in the current directory".
    - Run this step when `validate_reports.py` reports `WARN N/M CC entries missing replacement_code`. The skill reads each CC entry in `.ai/blueteam/data/code_changes.json`, opens the referenced source files, and writes a complete code block to `replacement_code` for each entry. This enables "Show fix" inline code in the Remediation Plan tab. Skip this step if all CC entries already have `replacement_code` populated.
12. Run the security_overview_report_skill: "Using the skill at *folder/skills/12-security-overview-report.md*, generate an overview security report for the application in the current directory".
    - Reads all available `.ai/blueteam/data/` JSON artifacts from completed skills. Produces `.ai/blueteam/reports/security_overview.md` (a unified Markdown summary) and `.ai/blueteam/reports/security_overview.html` (a single-page application with ten audience-targeted tabs, including Resiliency & DR). Does not require all skills to have run; it reports on whichever assessments have completed and notes what is still pending. **This should be the last skill run** so that all assessment data is available.
13. *(Post-run)* Validate the output: `node scripts/validate_reports.js --repo-root <repo>` verifies all required `.md`/`.html` report pairs, JSON data artifacts, and internal links are present. The validator also checks semantic consistency: CAS compliance Total row arithmetic, ASVS chapter summary footer counts, kill chain elevation table vs. JSON, and kill chain IDs/severities in the overview vs. `kill_chains.json`.

This will provide you with the following for the in-scope application:

- An overview of the application and any defensive security issues that it has, with recommended remediations
- An application security map (tech stack, endpoint catalog, auth mechanisms, secrets findings, bot commit flags)
- *(Optional)* A security architecture assessment: deployment profile identification, architecture description, and SA-NNN architectural gap findings distinct from code-level findings
- A threat model
- An information security classification
- An assessment of compliance to ASVS Level 2
- An assessment of compliance to cybersecurity standards
- A cross-domain kill chain analysis identifying compound attack paths invisible to any individual assessment
- A DR and business continuity resilience analysis with scorecard, gap list, plus prioritized recommendations
- A consolidated vulnerability scan report (CVEs, secrets, misconfigurations)
- Security unit test coverage with gaps closed
- Recommendations for requirements updates and code changes for the above
- A unified overview report (`security_overview.html`) providing a single entry point across all findings, with audience-targeted views for leadership, developers, security architects, and resiliency stakeholders
- A risk register (`risk_register.md` / `risk_register.html` / Risk Register tab in the overview SPA) when `.ai/blueteam/data/risk_acceptances.json` is present, listing all accepted, pending, expired plus anomalous risk acceptances across all assessments

#### Sample Prompt Sequence for Running All Blue Team Skills
The following prompt sequence will run all Blue Team skills. Run time will vary by application size. Replace `<BT>` with the actual path to the `security/blueteam` directory.

**Alternative: Requirements Mode entry point (no code yet)**
```
Read "<BT>/CLAUDE.md" and confirm the mandatory execution protocol before proceeding with any skill.

Using the skill at "<BT>/skills/13-requirements-map.md", map the system described in requirements/my_epics.md in the current directory

Using the skill at "<BT>/skills/04-threat-model.md", assess the threats to the system in the current directory
```

**Standard sequence (code exists):**
```
Read "<BT>/CLAUDE.md" and confirm the mandatory execution protocol before proceeding with any skill.

Using the skill at "<BT>/skills/03-security-architecture.md", assess the security architecture of the application in the current directory

Using the skill at "<BT>/skills/04-threat-model.md", assess the threats to the application in the current directory

Using the skill at "<BT>/skills/06-cas-compliance.md", assess the application in the current directory

Using the skill at "<BT>/skills/05-asvs-level2-assessment.md", assess the application in the current directory against the ASVS Level 2 standard

Using the skill at "<BT>/skills/07-kill-chain-aggregator.md", analyze the kill chains across all security assessments for the application in the current directory

Using the skill at "<BT>/skills/09-security-unit-tests.md", assess and improve security unit test coverage for the application in the current directory. Run the resulting unit test suite as well.

Using the skill at "<BT>/skills/08-tool-scanning.md", run security scans on the application in the current directory

Using the skill at "<BT>/skills/10-dr-resilience.md", assess disaster recovery and business continuity resilience for the application in the current directory

Using the skill at "<BT>/skills/11-code-fix-generation.md", populate replacement_code for all CC entries in the current directory

Using the skill at "<BT>/skills/12-security-overview-report.md", generate an overview security report for the application in the current directory
```