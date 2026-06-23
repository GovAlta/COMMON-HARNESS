---
id: asvs-v10-malicious-code-subskill
name: ASVS V10 Malicious Code Sub-Skill
description: ASVS chapter V10 malicious code assessment logic consumed by the ASVS Level 2 assessment workflow.
type: sub-agent
version: 1.0.0
tools_required:
  - Read
  - Glob
  - Grep
tools_optional: []
references:
  - asvs-level2-security-assessment
  - attack-chain-reference
upstream:
  - ref: asvs-level2-security-assessment
    artifacts:
      - .ai/blueteam/data/application_map.json
outputs: []
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must run only within ASVS Level 2 Phase 2 chapter dispatch.
---

> Sub-skill for **V10 Malicious Code**. Finding IDs: `[V10-NNN]`. Tactics: `shared/reference/attack-chain-reference.md` §2. Phase 6 normalizes IDs.

---

## Exclusion Conditions

No exclusion conditions — all three V10 sub-categories apply to all applications. V10.3 (AI/bot-authored code) requires `bot_commits[]` from the application map; if empty and no bot commits exist, write `[V10.3 — No bot commits detected]` and PASS.

---

> Environment assumptions for this chapter: see `shared/reference/environment-baseline.md` § "ASVS Chapter Assumption Mapping."

---

## V10 Requirements and Verification Rules

### V10.1 — Malicious Code Search

**V10.1.1** — Verify that a malware scanning tool is used during build or CI/CD to detect potentially malicious code in sourced or developed code, third-party libraries, or external content.
- **CAS Rule:** None.
- **Verification:** Check CI/CD pipeline files (`.github/workflows/`, `azure-pipelines.yml`, `Jenkinsfile`) for SAST/SCA/malware scanning steps. Note whether: (1) SCA scanning (Trivy, npm audit, Snyk) is configured, (2) SAST scanning is configured, (3) secret scanning (Gitleaks, TruffleHog) is configured. Absence of all three is a finding.
- **ATT&CK Tactic:** TA0040 — Impact (supply chain)
- **Severity if failed:** Medium

---

### V10.2 — Application Integrity

**V10.2.1** — Verify that the application source code and third-party libraries do not contain unauthorized phone home or data collection capabilities.
- **CAS Rule:** None.
- **Verification:** Spot-check third-party dependencies for suspicious network calls, telemetry, or data collection. Check `package.json` / `*.csproj` scripts for `postinstall` hooks that make network calls. Note: this is a best-effort check for known malicious packages.
- **ATT&CK Tactic:** TA0010 — Exfiltration
- **Severity if failed:** Critical (confirmed data collection to external party)

**V10.2.2** — Verify that the application does not ask for unnecessary or excessive permissions.
- **CAS Rule:** None.
- **Verification:** Check application permission requests in mobile manifests (`AndroidManifest.xml`, `Info.plist`) or browser extension manifests. For web applications: check permission API usage (camera, microphone, location, notifications).
- **ATT&CK Tactic:** TA0009 — Collection
- **Severity if failed:** Medium

**V10.2.3** — Verify that the application source code and third-party libraries do not contain back doors, such as hardcoded or undocumented accounts or keys, code obfuscation, undocumented binary blobs, rootkits, or anti-debug, unsafe debugging features, or otherwise out of date, insecure, or hidden functionality that could be used maliciously if discovered.
- **CAS Rule:** None.
- **Verification:** Search for hardcoded credentials (cross-reference `secrets_findings[]` from application map). Search for debug backdoors (cross-reference env-var-gated auth bypass from V2). Check for obfuscated code strings or unusual base64-encoded payloads in application logic.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** Critical

**V10.2.4** — Verify that the application source code and third-party libraries do not contain Easter eggs or any other potentially unwanted functionality.
- **CAS Rule:** None.
- **Verification:** NOTE: This is generally not verifiable via automated code review. Flag if Easter egg functionality is discovered incidentally.
- **ATT&CK Tactic:** N/A
- **Severity if failed:** Low / NOT VERIFIABLE

**V10.2.5** — Verify that the application source code and third-party libraries do not contain time bombs by searching for date and time related functions.
- **CAS Rule:** None.
- **Verification:** NOTE: This is generally not verifiable via automated code review. Check for suspicious date-conditional logic in security-critical code paths.
- **ATT&CK Tactic:** TA0040 — Impact
- **Severity if failed:** High (if suspicious time-bomb pattern found), NOT VERIFIABLE (if none found)

**V10.2.6** — Verify that the application source code and third-party libraries do not contain malicious code that specifically searches for or attempts to steal passwords, access tokens, personal, or authentication credentials.
- **CAS Rule:** None.
- **Verification:** Same scope as V10.2.3. Specifically check for unusual credential-harvesting patterns (reads env vars + writes to external URL, reads local credential files).
- **ATT&CK Tactic:** TA0006 — Credential Access
- **Severity if failed:** Critical

---

### V10.3 — Application Integrity and Code Provenance

**V10.3.1** — Verify that if the application has a client or server auto-update feature, updates should be obtained over secure channels and digitally signed.
- **CAS Rule:** None.
- **Verification:** Check for auto-update mechanisms. Verify update sources use HTTPS and signature verification.
- **ATT&CK Tactic:** TA0040 — Impact
- **Severity if failed:** Critical (if unsigned updates over HTTP)

**V10.3.2** — Verify that the application employs integrity protections, such as code signing or subresource integrity. The application must not load or execute code from untrusted sources.
- **CAS Rule:** None.
- **Verification:** Check HTML for `<script>` tags loading external resources without `integrity` (SRI) attribute. Check for CDN-hosted scripts without SRI hashes.
- **ATT&CK Tactic:** TA0040 — Impact (supply chain)
- **Severity if failed:** Medium

**V10.3.3** — **[AI/Bot Code Provenance — ALWAYS VERIFY]** Verify that code generated by AI coding tools or CI/CD automation (e.g., GitHub Copilot, GPT Engineer, Cursor, Codegen bots, Dependabot) was security-reviewed before merge, particularly for commits that modify security-critical files.
- **CAS Rule:** Unreviewed bot commits touching security-critical files (authentication, authorization, encryption, configuration) are a confirmed finding. AI coding tools have a documented pattern of introducing hardcoded secrets, insecure defaults, and disabled security controls.
- **Verification:** Read `bot_commits[]` from the application map. For each bot commit that touches `critical_files.authentication`, `critical_files.authorization`, `critical_files.encryption`, or `critical_files.configuration`:
  1. Identify the specific files modified in the commit.
  2. Verify the change appears benign (dependency update, configuration formatting) vs. security-sensitive (new auth logic, config changes, token handling).
  3. Flag any bot commit that introduced or modified: auth bypass conditions, environment variable checks in auth code, secrets/credentials, JWT handling, API key generation.
  4. Check whether the commit was followed by a human reviewer approval (PR review comment from non-bot account).
  If `bot_commits[]` is empty: write `[V10.3 — No bot commits detected, PASS]` and mark as PASS.
- **ATT&CK Tactic:** TA0001 — Initial Access
- **Severity if failed:** High (unreviewed security-critical bot commit), Critical (if bot commit introduced auth bypass or hardcoded secret)

---

## ATT&CK Tactic Summary

Note: Derived from `shared/reference/attack-chain-reference.md` Section 2. Update this file if that file changes.

| Finding Pattern | Primary Tactic | Kill Chain Stage |
|----------------|----------------|-----------------|
| Bot commit introducing auth bypass | TA0001 Initial Access | Unreviewed backdoor in auth path |
| Bot commit introducing hardcoded secret | TA0006 Credential Access | Credential exposure from bot-authored code |
| External script without SRI | TA0040 Impact (supply chain) | CDN compromise → malicious script execution |
| Suspicious phone-home dependency | TA0010 Exfiltration | Data exfiltration via malicious package |
| Missing CI/CD malware/SCA scanning | TA0040 Impact | Undetected malicious or vulnerable dependencies |

---

## Cross-Chapter Reference Notes

| This chapter finding | Combines with | Combined chain risk |
|---------------------|---------------|---------------------|
| V10.3.3 bot commit introduced hardcoded secret | V6.4 secrets in source | Same finding — consolidate; V6 chapter entry is primary, V10 provides provenance context |
| V10.3.3 bot commit introduced auth bypass | V2.2.4 env-var-gated bypass | Bot commits are the provenance finding; V2 is the primary vulnerability finding |
| V10.2.3 hardcoded backdoor credentials | V2.10 service authentication | Same root cause — cross-reference |

---

> **ASSESSMENT ORCHESTRATOR: STOP READING HERE.** The `## Secure Implementation Guide` section below is for `skills/14-asvs-compliant-builder.md` only. Assessment skills do not need implementation patterns.

## Secure Implementation Guide

> **For builder skills only.** Assessment skills use the full chapter file above. This section provides implementation patterns for generating ASVS V10-compliant code.

### When to apply this chapter
Load V10 when setting up CI/CD pipelines, configuring dependency management, implementing CODEOWNERS, or adding SRI integrity checks for CDN-hosted resources.

### CI/CD Security Pipeline (V10.1.1, V10.3.2)

```yaml
# .github/workflows/security.yml — ✓ V10.1.1, V10.3.2 compliant
name: Security Checks
on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  security:
    runs-on: ubuntu-latest
    permissions:
      contents: read          # ✓ V10.3.2: minimum permissions
      security-events: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0      # needed for git history analysis

      # ✓ V10.1.1: dependency lockfile validation
      - name: Verify lockfile integrity
        run: npm ci --ignore-scripts  # ci enforces lockfile; --ignore-scripts prevents postinstall attacks

      # ✓ V10.3.3: secret detection in commits
      - name: Scan for secrets
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}

      # ✓ V10.3.2: SCA scan for malicious packages
      - name: OSV Scan
        uses: google/osv-scanner-action@v1
        with:
          scan-args: --lockfile=package-lock.json
```

### CODEOWNERS for Security-Sensitive Files (V10.3.3)

```
# CODEOWNERS — ✓ V10.3.3: require human security review on security-critical paths
# Security team must review changes to auth and crypto code
/src/middleware/authenticate.*     @security-team
/src/middleware/authorize.*        @security-team
/src/crypto/                       @security-team
/.github/workflows/                @security-team
/Dockerfile                        @security-team
/src/config/                       @security-team
```

### Subresource Integrity for CDN Resources (V10.3.1)

```html
<!-- ✓ V10.3.1: SRI hash prevents CDN-hosted script tampering -->
<script
  src="https://cdn.example.com/library@1.2.3/dist/lib.min.js"
  integrity="sha384-<base64-hash-from-build-tool>"
  crossorigin="anonymous"></script>
<!-- Generate SRI hash: openssl dgst -sha384 -binary lib.min.js | openssl base64 -A -->
```

### Dependency Lockfile Integrity (V10.1.1)

```bash
# Use npm ci (not npm install) in CI/CD — enforces exact lockfile versions ✓ V10.1.1
npm ci --ignore-scripts
# --ignore-scripts prevents postinstall/prepare lifecycle scripts from running
# which can contain arbitrary code from third-party packages
```

### Common anti-patterns
- `npm install` in CI/CD instead of `npm ci` — allows lockfile drift and version range exploitation
- No CODEOWNERS on `authenticate.ts`, `Dockerfile`, or workflow files
- CDN resources without SRI `integrity` attribute
- No secret scanning in CI/CD pipeline
- Bot/AI commits on security files without human review (CODEOWNERS should gate these)

### Organization-specific patterns
- GitHub Enterprise: CODEOWNERS is enforced by branch protection rules; security team code owners are required for auth and crypto files
- CI/CD pipelines: TruffleHog and Trivy scans are required steps (run via `skills/08-tool-scanning.md`)
- Dependency lockfiles (`package-lock.json`, `yarn.lock`) must be committed and enforced with `npm ci` / `yarn install --frozen-lockfile`
