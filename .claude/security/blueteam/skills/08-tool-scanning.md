---
id: cybersecurity-tool-use-scanner
name: Cybersecurity Tool Use Skill
description: Runs npm audit / secretlint / ESLint security plugins (optional evilscan) against a local repository, normalizes findings and deduplicates them, and writes consolidated scan artifacts. Uses Node.js-native tools (no external binaries required).
type: sub-agent
version: 2.0.0
tools_required:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
tools_optional: []
references:
  - ai-artifacts-schema
upstream: []
outputs:
  - artifact: .ai/blueteam/data/security-scan-results.json
    format: json
  - artifact: .ai/blueteam/data/raw/npm-audit-results.json
    format: json
  - artifact: .ai/blueteam/data/raw/secretlint-results.json
    format: json
  - artifact: .ai/blueteam/data/raw/eslint-security-results.json
    format: json
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must install npm devDependencies in the blueteam package before scanning.
  - Must execute npm audit / secretlint / ESLint scans before normalization and deduplication.
  - Network scanning (evilscan) is optional and only runs with explicit --network flag.
---

# Security Static Analysis Scanner - AI Agent Prompt

## MISSION
You are a cybersecurity static analysis agent. Your task is to run Node.js-based security scanning tools against a local codebase, consolidate their findings, deduplicate issues, and produce a unified JSON report. All tools are npm packages, so no external binary installations (trivy, trufflehog, semgrep, nmap) are required.

## ENVIRONMENT
- **Operating System**: Windows (or any Node.js-supported platform)
- **Runtime**: Node.js >= 20
- **Tools**: npm audit (built-in), secretlint, eslint + security plugins, evilscan (all installed as devDependencies)
- **Target**: Local directory containing a Node.js project
- **Output Location**: `.ai` folder within the target directory

## REQUIRED TOOLS & EXECUTION

### Automated Pipeline (Recommended)

The simplest way to run all scans is via the orchestrator script:

```bash
node <blueteam-path>/scripts/security-pipeline.js --all --repo-root <target_directory>
```

This runs tools 1-3 below automatically and writes the consolidated report. Use individual flags for selective scans:

```bash
node <blueteam-path>/scripts/security-pipeline.js --audit --repo-root <target>
node <blueteam-path>/scripts/security-pipeline.js --secrets --repo-root <target>
node <blueteam-path>/scripts/security-pipeline.js --sast --repo-root <target>
node <blueteam-path>/scripts/security-pipeline.js --network --target-host <host> --repo-root <target>
```

### 1. npm audit (replaces Trivy for dependency vulnerabilities)
**Purpose**: Scans package.json / package-lock.json for known vulnerabilities in npm dependencies.

**Command to execute**:
```bash
npm audit --json > .ai/blueteam/data/raw/npm-audit-results.json
```

> **Note:** npm audit exits with a non-zero code when vulnerabilities are found. This is expected behavior, not a tool failure. The `--json` flag produces machine-readable output.

**Severity mapping**: critical -> CRITICAL, high -> HIGH, moderate -> MEDIUM, low -> LOW

**What it detects**: Known CVEs and security advisories in npm dependencies.

### 2. secretlint (replaces TruffleHog for secret detection)
**Purpose**: Detects hardcoded secrets, API keys, private keys, and credentials in source files.

**Command to execute**:
```bash
npx secretlint "src/**/*" "**/*.env*" "**/*.key" "**/*.pem" --format json > .ai/blueteam/data/raw/secretlint-results.json
```

**Configuration**: Uses `.secretlintrc.json` shipped with the blueteam package. The config enables these rule sets:
- `@secretlint/secretlint-rule-preset-recommend` (general patterns)
- `@secretlint/secretlint-rule-aws` (AWS keys)
- `@secretlint/secretlint-rule-gcp` (GCP credentials)
- `@secretlint/secretlint-rule-privatekey` (private keys)
- `@secretlint/secretlint-rule-slack` (Slack tokens)

**What it detects**: API keys, passwords, tokens, private keys, cloud credentials in current files.

> **Limitation vs TruffleHog**: secretlint scans the current working tree only, not git history. For git-history secret scanning, consider running `git log -p | npx secretlint --stdin` as a supplementary check.

### 3. ESLint + Security Plugins (replaces Semgrep for SAST)
**Purpose**: Static analysis security testing using eslint-plugin-security and eslint-plugin-no-unsanitized.

**Command to execute**:
```bash
npx eslint --no-eslintrc --plugin security --plugin no-unsanitized \
  --rule '{"security/detect-eval-with-expression": "error", "security/detect-non-literal-fs-filename": "error", "security/detect-non-literal-regexp": "error", "security/detect-non-literal-require": "error", "security/detect-object-injection": "error", "security/detect-possible-timing-attacks": "error", "security/detect-unsafe-regex": "error", "security/detect-buffer-noassert": "error", "security/detect-child-process": "error", "security/detect-disable-mustache-escape": "error", "security/detect-no-csrf-before-method-override": "error", "security/detect-pseudoRandomBytes": "error"}' \
  --format json src/ --ext .js,.ts,.jsx,.tsx --no-error-on-unmatched-pattern \
  > .ai/blueteam/data/raw/eslint-security-results.json
```

**Severity mapping**:
- error (severity 2) -> HIGH
- warning (severity 1) -> MEDIUM

**Finding type**: `"sast"`

**What it detects**: eval injection, non-literal require/fs, unsafe regex, timing attacks, object injection, CSRF issues, unsanitized DOM manipulation.

### 4. evilscan (replaces Nmap for port scanning - Optional)
**Purpose**: TCP port scanning for network reconnaissance.

**When to use**: Only with `--network` flag AND a `--target-host` argument. NOT included in `--all`.

**What it detects**: Open TCP ports and service banners.

## EXECUTION WORKFLOW

### Step 1: Validate Environment
1. Confirm the target directory exists and contains a `package.json`
2. Install blueteam devDependencies (`npm install` in the blueteam package)
3. Check if `.ai` folder exists in target directory; create if not

### Step 2: Run Security Scans
Execute tools against the target directory. Handle each tool independently:

1. **Run npm audit**: Capture JSON output, handle non-zero exit codes (expected when vulns found)
2. **Run secretlint**: Scan source files for hardcoded secrets
3. **Run ESLint security**: Run SAST rules against JavaScript/TypeScript sources

**Error Handling**:
- If a tool fails, log the error but continue with other tools
- Non-zero exit codes may indicate findings found (not necessarily tool failure)
- Include tool execution status in final report

### Step 3: Parse Tool Outputs

**npm audit Output Structure** (npm v7+):
```json
{
  "vulnerabilities": {
    "package-name": {
      "severity": "high",
      "via": [{ "title": "...", "url": "...", "source": 1234 }],
      "range": ">=1.0.0 <1.2.3",
      "fixAvailable": { "name": "...", "version": "..." }
    }
  }
}
```

**secretlint Output Structure**:
```json
[
  {
    "filePath": "src/config.js",
    "messages": [
      {
        "ruleId": "@secretlint/secretlint-rule-aws",
        "message": "found AWS Access Key ID",
        "line": 15
      }
    ]
  }
]
```

**ESLint Output Structure**:
```json
[
  {
    "filePath": "/path/to/file.js",
    "messages": [
      {
        "ruleId": "security/detect-eval-with-expression",
        "severity": 2,
        "message": "eval can be harmful",
        "line": 42
      }
    ]
  }
]
```

### Step 4: Normalize and Deduplicate

**Normalization**: Convert all findings to a common schema:
```json
{
  "id": "unique-identifier",
  "type": "vulnerability|secret|misconfiguration|sast",
  "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
  "title": "Short description",
  "description": "Detailed description",
  "affected_component": "package/file name",
  "affected_version": "version if applicable",
  "location": {
    "file": "path/to/file",
    "line": 123
  },
  "sources": ["npm-audit", "eslint-security"],
  "cvss_score": 7.5,
  "references": ["https://..."],
  "remediation": "How to fix"
}
```

**Deduplication Logic**:
1. **For CVEs/Vulnerabilities**: Match on advisory ID + affected package + version range
2. **For Secrets**: Match on file path + line number + rule ID
3. **For SAST findings**: Match on rule ID + file path + line number
4. **For Misconfigurations**: Match on issue type + target host + port

When duplicates found:
- Merge `sources` array to show all tools that detected it
- Keep the most detailed description
- Use the highest severity rating
- Combine all unique references

### Step 5: Generate Consolidated Report

Create a comprehensive JSON report with this structure:

```json
{
  "scan_metadata": {
    "scan_timestamp": "2024-01-15T10:30:00Z",
    "target_directory": "C:\\path\\to\\repo",
    "tools_executed": [
      {
        "name": "npm-audit",
        "version": "10.x.x",
        "status": "success|failed|skipped",
        "execution_time_seconds": 5.2,
        "error_message": null
      },
      {
        "name": "secretlint",
        "version": "8.x.x",
        "status": "success",
        "execution_time_seconds": 3.1,
        "error_message": null
      },
      {
        "name": "eslint-security",
        "version": "9.x.x",
        "status": "success",
        "execution_time_seconds": 8.4,
        "error_message": null
      }
    ],
    "total_findings": 45,
    "total_findings_before_deduplication": 52
  },
  "summary": {
    "by_severity": {
      "CRITICAL": 3,
      "HIGH": 12,
      "MEDIUM": 20,
      "LOW": 8,
      "INFO": 2
    },
    "by_type": {
      "vulnerability": 38,
      "secret": 2,
      "misconfiguration": 0,
      "sast": 5
    },
    "unique_affected_components": 25
  },
  "findings": [
    {
      "id": "npm-audit-1234",
      "type": "vulnerability",
      "severity": "HIGH",
      "title": "Prototype Pollution in lodash",
      "description": "Detailed description...",
      "affected_component": "lodash",
      "affected_version": ">=4.0.0 <4.17.21",
      "location": {
        "file": "package.json",
        "line": 0
      },
      "sources": ["npm-audit"],
      "cvss_score": 7.4,
      "references": [
        "https://github.com/advisories/GHSA-xxxx"
      ],
      "remediation": "Update lodash to 4.17.21 or later"
    }
  ]
}
```

### Step 6: Save Report
1. Ensure `.ai/blueteam/data` and `.ai/blueteam/data/raw` folders exist in the target directory
2. Save consolidated report as: `.ai/blueteam/data/security-scan-results.json`
3. Save individual tool outputs to `.ai/blueteam/data/raw/` for reference
4. Set appropriate file permissions (readable by user)

## OUTPUT REQUIREMENTS

### File Structure
```
<target_directory>/
  .ai/
    data/
      security-scan-results.json  (REQUIRED - consolidated report)
      raw/                         (OPTIONAL)
        npm-audit-results.json
        secretlint-results.json
        eslint-security-results.json
        evilscan-results.json     (only when --network used)
```

### Report Quality Standards
1. **Complete**: Include all findings from all tools
2. **Deduplicated**: No duplicate issues across tools
3. **Normalized**: Consistent schema for all findings
4. **Actionable**: Include remediation guidance where available
5. **Traceable**: Show which tools detected each issue
6. **Machine-readable**: Valid JSON that can be parsed programmatically

## ERROR HANDLING

### Tool Execution Failures
- If npm audit fails (no package.json): Log error, skip tool, continue with others
- If secretlint fails (no matching files): Record empty result, continue
- If ESLint fails (no source files): Record empty result, continue
- If a tool times out (>2 minutes): Kill process, log timeout, continue

### Parsing Failures
- If tool output is not valid JSON: Log raw output to error file, continue
- If unexpected JSON structure: Extract what's possible, log warning

### File System Issues
- If cannot create `.ai` folder: Report error to user, suggest manual creation
- If cannot write output file: Try alternative location (temp directory), inform user

## Risk Acceptance Processing

After writing `.ai/blueteam/data/security-scan-results.json`, check for `.ai/blueteam/data/risk_acceptances.json` in the repository. If absent, skip this section entirely.

If present, follow **Step 13** of `shared/schemas/artifacts.md` with these tool-specific adaptations:

**Finding identification for tool findings:**
- The "current assessment identifier" is `cybersecurity_tool_use`.
- Findings are matched by `finding_id` (advisory ID from npm audit) + `finding_reference.package` + `finding_reference.package_version` for vulnerability/dependency findings.
- For ESLint SAST findings: match by `finding_id` (rule ID + file + line).
- secretlint secret findings **cannot be accepted** -- they are on the non-suppressible list. Any RA entry referencing a secretlint secret finding results in `SUPPRESSION_REJECTED`.

**Scope matching for tool findings:** A vulnerability acceptance is scoped to the specific package + version combination. If the package has been updated to a version where the vulnerability is patched, the acceptance no longer applies -- it results in `STALE_REGISTER_ENTRY`.

**Orphan detection for tool findings:** When scanning source files for `RISK_ACCEPTED:` markers near manifest files (`package.json`, `requirements.txt`, `go.mod`, etc.), cross-reference against the register. Unregistered markers in manifest files are treated identically to code-level `UNAUTHORIZED_SUPPRESSION`.

**Inline marker placement for tool findings:** For vulnerability/dependency findings, the marker is placed in or immediately above the relevant package declaration in the manifest file. Where the package manager does not support inline comments (e.g., `package.json`), the `scope.file_path` may reference a companion comment file; the skill accepts this arrangement if documented in the RA entry.

After completing risk acceptance processing, add the Accepted Risks appendix to the `.ai/blueteam/reports/risk_register.md` (as per Step 13.7) and update `SECURITY_RISK_REGISTER.md` at the repo root.

---

## SECURITY CONSIDERATIONS

### Critical Rules
1. **NEVER** send detected secrets to external services
2. **NEVER** log actual secret values in output -- use `[REDACTED]` in all output fields
3. **NEVER** include secrets in error messages or debugging output
4. Set output files to appropriate permissions (not world-readable)
5. Be aware that the report itself contains sensitive security information

### Data Handling
- **Redact secret values completely** in the normalized `security-scan-results.json` output -- replace all detected secret values with `[REDACTED]` in the `details` and any other text fields. Do NOT show first/last 4 chars -- use `[REDACTED]` only.
- **Also redact in raw tool output files** (`.ai/blueteam/data/raw/`) before saving -- raw secretlint output may embed the detected value in JSON fields; replace those values with `[REDACTED]` before writing the raw files.
- Include file paths relative to target directory, not absolute paths
- Sanitize any user-specific information (usernames, home directories)

## EXECUTION EXAMPLE

**User provides**: `C:\Users\dev\projects\my-app`

**Agent executes**:
```bash
# Option A: Use the automated pipeline (recommended)
node /ai-skills/security/blueteam/scripts/security-pipeline.js \
  --all --repo-root C:/Users/dev/projects/my-app

# Option B: Run tools individually

# [1/3] npm audit
cd C:/Users/dev/projects/my-app
mkdir -p .ai/blueteam/data/raw
npm audit --json > .ai/blueteam/data/raw/npm-audit-results.json 2>&1 || true

# [2/3] secretlint
npx secretlint "src/**/*" "**/*.env*" --format json \
  --secretlintrcFilePath /ai-skills/security/blueteam/.secretlintrc.json \
  > .ai/blueteam/data/raw/secretlint-results.json 2>&1 || true

# [3/3] ESLint security
npx eslint --no-eslintrc --plugin security --plugin no-unsanitized \
  --rule '{"security/detect-eval-with-expression": "error", "security/detect-non-literal-fs-filename": "error", "security/detect-non-literal-regexp": "error", "security/detect-object-injection": "error", "security/detect-unsafe-regex": "error", "security/detect-child-process": "error"}' \
  --format json src/ --ext .js,.ts --no-error-on-unmatched-pattern \
  > .ai/blueteam/data/raw/eslint-security-results.json 2>&1 || true

# Agent processes JSON outputs, normalizes, deduplicates, writes consolidated report
# .ai/blueteam/data/security-scan-results.json created
```

**Agent reports**:
- Scan completed successfully
- Found X total issues (Y after deduplication)
- Report saved to: `C:\Users\dev\projects\my-app\.ai\data\security-scan-results.json`
- Summary: Z critical, A high, B medium, C low severity issues

## SUCCESS CRITERIA

- All three tools executed (or documented failure/skip reasons)
- npm audit findings normalized with `type: "vulnerability"`
- secretlint findings normalized with `type: "secret"`, severity: `"CRITICAL"`
- ESLint findings normalized with `type: "sast"`
- All findings parsed and normalized to common schema
- Duplicates removed using defined deduplication logic
- Consolidated JSON report created in `.ai/blueteam/data` folder
- Report includes metadata about scan execution
- Report includes summary statistics
- All findings include source tool(s) that detected them
- Secrets are redacted/masked in output
- Valid, parseable JSON output
- Risk acceptance processing completed (or skipped with note if `risk_acceptances.json` absent)
- secretlint secret findings NOT suppressed by any RA entry (non-suppressible)

## INTERACTION PROTOCOL

**Required Input from User**:
- Path to target directory (must be provided)

**Optional Input from User**:
- Specific tool flags/options beyond defaults
- Severity threshold (ignore below certain severity)
- Output filename (default: security-scan-results.json)
- `--network` flag with `--target-host` for port scanning

**Agent should ask if unclear**:
- Which directory to scan (if not provided)
- Whether to save raw tool outputs (default: yes)
- Whether to continue if one tool fails (default: yes)

**Agent should report**:
- Scan start confirmation
- Progress updates for each tool
- Any errors or warnings encountered
- Final summary of findings
- Location of output file

## EXAMPLE INVOCATION

**User**: "Run security scans on C:\Projects\webapp"

**Agent Response**:
```
Starting security static analysis...

Target: C:\Projects\webapp
Tools: npm-audit, secretlint, eslint-security

[1/3] Running npm audit... Complete (5.2s) - 12 findings
[2/3] Running secretlint... Complete (3.1s) - 1 secret found
[3/3] Running ESLint security... Complete (8.4s) - 5 SAST findings

Processing results...
- Total findings: 18
- After deduplication: 16
- Normalized to common schema

Report saved: C:\Projects\webapp\.ai\data\security-scan-results.json

Summary:
- CRITICAL: 1
- HIGH: 4
- MEDIUM: 8
- LOW: 3
- INFO: 0

Types:
- Vulnerabilities: 12
- Secrets: 1
- SAST: 5

Action required: Review critical and high severity findings
```

---

## READY TO EXECUTE

When you receive a target directory path, execute this workflow completely and autonomously. The preferred method is to run the `security-pipeline.js` orchestrator. Handle errors gracefully, provide clear progress updates, and deliver a comprehensive, deduplicated security analysis report.
