---
id: application-map
name: Application Map Skill
description: Performs shared discovery for BlueTeam assessments and writes a commit-stamped application security map used by downstream skills.
type: sub-agent
version: 1.0.0
tools_required:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
tools_optional: []
references:
  - environment
  - ai-schema-application-map
  - ai-html-report-template
upstream:
  - ref: application-data-store-security-classification
    artifacts:
      - .ai/blueteam/data/security-classification.yaml
outputs:
  - artifact: .ai/blueteam/data/application_map.json
    format: json
  - artifact: .ai/blueteam/data/app_topology.json
    format: json
  - artifact: .ai/blueteam/reports/application_map.md
    format: markdown
  - artifact: .ai/blueteam/reports/application_map.html
    format: html
call_sequence_hard:
  - Must resolve declared upstream dependencies before execution, or fail fast with a dependency error.
  - Must perform staleness check before discovery.
  - If generated_at_commit matches HEAD, must stop and skip regeneration.
---

## Purpose

This skill performs the application discovery work common to the organizational security assessment skills (threat model / ASVS Level 2 / CAS compliance). Running it once before the assessments avoids each skill independently rediscovering the same tech stack / endpoint catalog / auth mechanisms / secrets / git history.

The output (`.ai/blueteam/data/application_map.json`) is stamped with the current git commit hash. Each assessment skill checks this hash before use. If the repository has new commits since the map was generated, the map is regenerated automatically.

**Run this skill:**
- Before running the threat model / ASVS / CAS skills for the first time on a repository
- Any time you want to force a refresh (e.g., after major code changes that have been committed)
- Assessment skills will also trigger regeneration automatically when they detect a stale map

---

## Prerequisites

Before running discovery, load the following context files:

1. `shared/reference/environment-baseline.md`: deployment assumptions (Cloud LZ vs. on-premises). Used to correctly characterize deployment manifests found in code. Stop at the `> **NON-ASVS SKILLS: STOP READING HERE.**` marker; the ASVS Chapter Assumption Mapping section is not needed for map generation.
2. `shared/schemas/application-map.md` and `shared/schemas/html-report-template.md`: application_map.json schema / field definitions / HTML report template.
3. If `.ai/blueteam/data/security-classification.yaml` exists: read it to extract `application.name` and the Protected B data elements, so the endpoint catalog can flag which endpoints consume classified data. If it does not exist, proceed without classification context. The map can still be generated, but `consumes_protected_data` fields will be set to `unknown`.

---

## Staleness Check: When to Regenerate

**BEFORE running any discovery**, check whether an up-to-date map already exists:

1. Check for `.ai/blueteam/data/application_map.json`. If the file does not exist, proceed to discovery.
2. If the file exists, read `generated_at_commit` from the file and run `git rev-parse HEAD` to get the current commit hash, then:
   a. **If they match**, the map is fresh; output "Application map is current (commit [hash]). No regeneration needed." and stop without re-running discovery.
   b. **If they differ**, the map is stale (code has changed); proceed to discovery and overwrite.
   c. **If `generated_at_commit` is null** (non-git repo): compare `generated_at_date` to today's date. If the same day, treat as fresh and stop. If a different day, regenerate.

> **Note on uncommitted changes**: The commit hash check does not detect uncommitted (staged or unstaged) source file modifications. If you have made local changes that have not yet been committed, the existing map will still appear fresh. Commit your changes before running assessments, or manually delete `.ai/blueteam/data/application_map.json` to force regeneration.

---

## Discovery Phases

### Pre-Phase: Monorepo Package Enumeration

Before launching Phase 1 agents, enumerate every `package.json` in the repository (excluding `node_modules/`, `dist/`, `.yarn/cache/`, `.pnp.*`). For each file found, record its path and `name` field. This produces the authoritative package inventory; all Phase 1 agents MUST use it as their starting point rather than independently discovering packages by path.

**Classification pass:** For each `package.json`, classify the package based on `dependencies` and `devDependencies`:

| Class | Criteria |
|---|---|
| `mobile-rn` | `react-native` or `expo` present in dependencies |
| `web-spa` | `react`, `vue`, `angular`, or `next` present without `react-native` |
| `backend` | `express`, `fastify`, `koa`, `@nestjs/core`, or any server-framework SDK present |
| `library` | none of the above; typically in a `libs/` or `packages/shared/` directory |

**Route each class to the correct agent:** Agent 2 (Entry Point & Middleware Mapper) processes `backend` packages. Agent 4 (Client Surface Scanner) processes `mobile-rn` and `web-spa` packages. Agent 1 processes all packages for tech stack information.

> **Why this step matters in monorepos**: Client apps are routinely nested 3-4 directory levels deep (e.g., `apps/product/app/packages/mobile/wallet/`). If agents discover packages independently, nested packages are silently skipped. The pre-phase enumeration prevents this class of false negative.

---

### Phase 1: Parallel Structural Discovery

Launch the following three agents simultaneously:

**Agent 1: Tech Stack & Deployment Scanner:**
> "Identify all programming languages / frameworks / runtime versions / package managers present in this codebase. Look at: package.json / package-lock.json / yarn.lock / pnpm-lock.yaml (Node.js), requirements.txt / pyproject.toml / Pipfile (Python), go.mod (Go), pom.xml / build.gradle (Java), *.csproj / Directory.*.props (.NET), Cargo.toml (Rust). Report: primary language / secondary languages / framework names and versions / runtime / package manager.
>
> Also find all deployment manifests: Dockerfile, docker-compose.yml, render.yaml, fly.toml, vercel.json, netlify.toml, .platform.app.yaml, Kubernetes YAML files, Terraform / Bicep / ARM templates. For each manifest found, note whether it indicates a cloud deployment (Azure, AWS, GCP) or on-premises deployment.
>
> Identify whether any AI/LLM integrations are present: search for imports or references to 'openai', '@anthropic-ai', 'azure-openai', 'google-generativeai', 'langchain', 'llamaindex', 'anthropic', 'vertexai'. If found, report the files and describe the integration.
>
> Identify whether file upload functionality exists: search for 'multer', 'IFormFile', 'multipart', 'file_get_contents', 'UploadedFile', 'FormData', 'fileInput', 'type=\"file\"'. Report file paths if found.
>
> Report `uses_managed_language: true` if the primary language is TypeScript, JavaScript, Python, Go, Java, C#, Ruby, or Kotlin (memory-managed languages that cannot have buffer overflows or memory safety issues at the application level)."

**Agent 2: Entry Point & Middleware Mapper:**
> "Find ALL routes and API endpoints in this codebase. Look for:
> - Express/Koa/Fastify/Hapi: router.get/post/put/patch/delete, app.use with path argument
> - Spring: @RequestMapping, @GetMapping, @PostMapping, @RestController
> - ASP.NET: [Route], [HttpGet], [HttpPost], [ApiController], MapGet/MapPost
> - FastAPI/Flask/Django: @app.route, @router.get, urlpatterns
> - GraphQL: type Query, type Mutation, type Subscription schema definitions
> - WebSocket: ws.on('connection'), io.on('connection'), @WebSocketGateway
> - SSE: response.writeHead with 'text/event-stream'
> - Webhook handlers: any endpoint named 'webhook', 'callback', 'notify', 'event'
>
> For each endpoint, record: path pattern, HTTP method(s), file path, line number, plus `resource_group`. Derive `resource_group` from the path by removing any trailing action segment and preserving parameter placeholders; the goal is a normalized resource identifier shared by all HTTP verbs that operate on the same resource. Examples: `/api/applications/:id/adjudicate` becomes `/api/applications/:id`; `/api/applications/:id/request-info` becomes `/api/applications/:id`; `/api/applications` stays `/api/applications`; `/api/users/:id/roles/:roleId` becomes `/api/users/:id`. When in doubt, the resource group is the longest prefix of the path that ends at a parameter placeholder or the path root.
>
> For each endpoint, determine auth level: trace backward from the route handler through the middleware chain. If a JWT/session/API-key verification middleware appears BEFORE the handler, mark as 'authenticated'. If no such middleware exists, mark as 'unauthenticated'. If you cannot determine, mark as 'unknown'.
>
> CRITICAL: For every middleware chain on a protected route group, determine whether the authentication check is the FIRST middleware. Record `auth_first_in_chain: true` only if auth middleware is literally registered first in the chain before any other middleware (config checks, feature flags, validation, logging). Record `false` if any non-auth middleware precedes the auth check.
>
> For endpoints that appear unauthenticated, check whether they use elevated credentials (service role keys, admin API keys, third-party API keys for email/SMS/AI/payment) without first verifying the caller's identity. Mark `uses_elevated_credentials: true` for any such endpoint. These are critical vulnerabilities, not just architectural notes.
>
> If classification files exist at `.ai/blueteam/data/security-classification-details.yaml`, cross-reference each endpoint against the `data_elements[]` and `data_stores[]` to flag `consumes_protected_data: true` for endpoints that handle Protected A/B data."

**Agent 3: Authentication & Security Pattern Hunter:**
> "Map all authentication and authorization implementations in this codebase.
>
> For authentication: find JWT validation code (jsonwebtoken.verify, jose.jwtVerify, JwtSecurityTokenHandler.ValidateToken), session middleware (express-session, passport, next-auth, connect-pg-simple), OAuth/OIDC client setup (passport strategies, @azure/msal-node, google-auth-library, node-openid-client). For each: record file, line, the identity provider type (Enterprise IdP e.g. MS Entra ID if azure/msal; Corporate OIDC Provider if 'example.com' or 'idm.example'; External Identity Gateway if 'dig-gateway' or 'partner'; Custom otherwise). For JWT: determine whether `algorithm` is hardened (explicit 'RS256'/'ES256' rather than 'none' or missing), and whether the secret is from an environment variable (good) or hardcoded (finding).
>
> For authorization: find RBAC/ABAC middleware, role-check functions, permission validators, row-level security implementations, database query filters that scope by user ID.
>
> Identify all security-critical files and categorize them:
> - Authentication files: auth middleware, JWT handlers, session management, IdP client setup
> - Authorization files: RBAC logic, role definitions, permission checks
> - Routing files: main router files, route registration files
> - Configuration files: config.ts/js, settings.py, appsettings.json, .env.example, environment variable references
> - Data model files: ORM models, database schema files, migration files
> - Encryption files: any file importing crypto, bcrypt, argon2, AES, RSA, TLS setup
> - Logging files: logger setup, audit log implementations
> - File upload handlers (if any)
> - AI/LLM integration files (if any)
> - Deployment files: Dockerfile, render.yaml, fly.toml, k8s manifests
>
> Report file paths for each category."

**Agent 4: Client Surface Scanner:**
> "Using the classified package inventory from the Pre-Phase step, process every package classified as `mobile-rn` or `web-spa`.
>
> **For each `mobile-rn` package:**
>
> - **Framework and version**: read `react-native` and `expo` version from `package.json`.
> - **Navigation**: check for `expo-router`, `@react-navigation/native`, or `react-native-navigation`. Note deep-link scheme from `app.json` / `app.config.ts` (`scheme` field).
> - **Auth mechanism**: search for imports of `expo-auth-session`, `expo-local-authentication`, `@react-native-google-signin/google-signin`, `react-native-app-auth`, `react-native-biometrics`. Note each one found with its file path and line number.
> - **Credential storage**: search for imports of `expo-secure-store`, `@react-native-async-storage/async-storage`, `react-native-keychain`. Flag any use of `AsyncStorage` as **unencrypted**: record `credential_storage_encrypted: false`. This is a finding when the app handles Protected A/B data.
> - **Sensitive data in local state**: search for variable names, object keys, or Zustand/Redux store keys matching `phn`, `healthNumber`, `credential`, `token`, `jwt`, `sin`, `birthDate`, `dateOfBirth`, `mvid`, `licenseNumber` in component files, store files, and context providers. Report each match with file path and line number.
> - **OS permissions**: read `app.json` `ios.infoPlist` and `android.permissions` fields. Also check `android/app/src/main/AndroidManifest.xml` if present. List every declared permission; flag `camera` / `location` / `contacts` / `biometric` explicitly.
> - **Attestation / integrity**: search for `react-native-google-play-integrity`, `expo-device`, `DeviceCheck`, `AppAttest`, `SafetyNet`. Set `attestation_present: true` if any is found; `false` otherwise.
> - **Certificate pinning**: search for `react-native-ssl-pinning`, `TrustKit`, `network_security_config.xml`, `NSExceptionDomains`. Set `certificate_pinning: true` if any is found; `false` otherwise.
>
> **For each `web-spa` package:**
>
> - **Auth mechanism**: search for `@azure/msal-browser`, `@auth0/auth0-react`, `next-auth`, `react-oidc-context`, `openid-client`, or direct `sessionStorage`/`localStorage` token writes.
> - **Sensitive data in localStorage**: search for `.setItem(` calls where the key string contains `phn`, `token`, `credential`, `user`, `id`, `jwt`. Flag any that store Protected B field values in `localStorage` (unencrypted on-disk browser storage).
>
> Report all findings per package with file paths and line numbers. Write one `client_applications[]` entry per package processed."

---

### Phase 2: Parallel Sensitive Analysis

After Phase 1 completes, launch the following agents simultaneously:

**Agent 4: Secrets Scanner (Current Source):**
> "Search all source files, configuration files, and non-gitignored environment files for hardcoded secrets. Do NOT report values from `node_modules/`, `vendor/`, `.git/`, `dist/`, `build/`, or `test*/` directories.
>
> Search for these patterns (report file path, line number, and a REDACTED preview):
> - `eyJ`: base64-encoded JWT (likely a hardcoded token)
> - `AKIA`, `ASIA`, `AGPA`: AWS access key prefixes
> - `sk-` at start of a string value: OpenAI/Anthropic API key prefix
> - `ghp_`, `gho_`, `ghs_`: GitHub Personal Access Token prefixes
> - `AIza`: Google API key prefix
> - `xoxb-`, `xoxp-`, `xapp-`: Slack token prefixes
> - Connection strings containing 'password=', 'pwd=', 'Password=' with non-placeholder values
> - Private key blocks: `-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN PRIVATE KEY-----`, `-----BEGIN EC PRIVATE KEY-----`
> - Variable assignments where the left side contains 'secret', 'password', 'api_key', 'apikey', 'token', 'credential', 'private_key' and the right side is a literal string (not an environment variable reference, not a placeholder like 'changeme', 'your-key-here', 'xxx', 'placeholder', 'example', 'test')
> - High-entropy strings (length > 20, mixed case + digits) in assignment contexts matching the above variable name patterns
>
> For each finding: classify severity as critical (cloud provider keys, private keys, OAuth secrets), high (database passwords, JWT signing secrets), medium (internal API keys, webhook secrets), low (ambiguous/low-confidence). Assign id SEC-SCAN-001 incrementing."

**Agent 5: Git History & Bot Commit Analyzer:**
> "This agent runs only if a `.git/` directory exists at the repository root.
>
> **Part A: Git History Secrets Scan:**
> Run: `git log -p --all -S 'AKIA' --oneline` (and repeat for patterns: 'sk-', 'ghp_', 'BEGIN RSA PRIVATE KEY', 'password=', 'secret=', 'api_key=')
> For each match: record commit hash / author / date / file / line plus a redacted preview. Mark `location: history_only` if the pattern no longer exists in HEAD.
>
> Also run: `git log --all --diff-filter=D --name-only --pretty=format:` to list all deleted files. Flag any deleted `.env`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, or `*secret*` files.
>
> **Part B: Bot/AI Commit Detection:**
> Run: `git log --all --format='%H|%ae|%an|%ad' | grep -iE 'bot\]|\\[bot\\]|dependabot|renovate|gpt-engineer|copilot|cursor|devin|github-actions'`
> For each bot commit found: run `git diff-tree --no-commit-id -r --name-only {commit_hash}` to get the list of changed files. Flag any bot commit that touches files in the `critical_files` categories (authentication, authorization, encryption, configuration). For `review_evidence`: run `git log --format='%s' {commit_hash}`. If the commit message contains 'Merge pull request' or 'Reviewed-by:', mark as `reviewed`; otherwise `unknown`.
>
> **Part C: .gitignore Coverage:**
> Read `.gitignore` (if present). Check whether these sensitive patterns are covered: `.env`, `.env.*` (not `.env.example`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*secret*`, `credentials.json`. For each missing pattern: check whether any actual files matching that pattern exist anywhere in the repository (use glob search). If files exist and the pattern is not in .gitignore, report as a gap with `any_committed` set based on whether `git ls-files` shows the file as tracked."

---

### Phase 3: Synthesis and Output

Combine all agent outputs:

1. **Resolve endpoint-to-classification cross-reference**: For endpoints flagged by Agent 2 as consuming protected data, verify against Agent 3's data model findings.

2. **Deduplicate secrets findings**: If Agent 4 and Agent 5 both found the same secret at the same file:line (now in current HEAD and also visible in history), record a single entry with `location: current_head`.

3. **Assign `deployment_target_inferred`**:
   - `cloud_lz`: if Dockerfile/container manifests reference Azure Container Apps, App Service, AWS ECS, GCP Cloud Run, or if terraform/bicep files reference `azurerm`, `aws`, `google` providers
   - `on_premises`: if IIS / Windows Service / bare-metal deployment indicators found with no cloud references
   - `unknown`: if no deployment manifests found or cannot determine

4. **Write `.ai/blueteam/data/application_map.json`**: Use the schema defined in `shared/schemas/application-map.md`. Set `generated_at_commit` to the output of `git rev-parse HEAD` (or `null` if no git). Set `generated_at_date` to today's date. Populate `client_applications[]` from Agent 4's output: one entry per discovered `mobile-rn` or `web-spa` package. If no client packages were found, write `"client_applications": []`. **Never omit this field.** Note: an agent that detects `react-native` or `expo` in `tech_stack` but produces an empty `client_applications[]` is in an inconsistent state; investigate and resolve before proceeding.

4b. **Write `.ai/blueteam/data/app_topology.json`** using the derivation rules in `shared/schemas/application-map.md` (section "Schema: `.ai/blueteam/data/app_topology.json`") to derive the application topology from the synthesized `application_map.json`; this file drives the DFD rendered in `security_overview.html`, so apply derivation rules in order (zones, then components, then connections). If the topology cannot be reliably derived (e.g., services cannot be grouped from endpoint paths), write the file with an empty `components[]` and `connections[]` rather than omitting it; the renderer will still show the zone bands.

5. **Write `.ai/blueteam/reports/application_map.md` and `.ai/blueteam/reports/application_map.html`**: Use the report format below. After writing the `.md`, generate the corresponding `.html` using the HTML template in `shared/schemas/html-report-template.md`.

---

## Required Output: `.ai/blueteam/reports/application_map.md`

```markdown
# Application Security Map: [Application Name]

**Generated:** [YYYY-MM-DD]. **Commit:** [short commit hash or "non-git repository"]
**Classification:** [from .ai/blueteam/data/security-classification.yaml, or "Not yet classified"]

---

## Technology Stack

| Field | Value |
|---|---|
| Primary Language | [language + version] |
| Secondary Languages | [list or None] |
| Frameworks | [list] |
| Runtime | [runtime + version] |
| Package Manager | [name] |
| Deployment Target | [cloud_lz / on_premises / unknown] |
| File Uploads | [Yes (mechanism) / No] |
| AI/LLM Features | [Yes (description) / No] |

---

## Identity Providers

[Table of detected IdPs with file references, or "None detected"]

| Type | File | Notes |
|---|---|---|
| [type] | [file:line] | [notes] |

---

## Authentication Mechanisms

| Type | File | Signature Verified | Algorithm Hardened | Notes |
|---|---|---|---|---|
| [type] | [file:line] | [Yes/No/N/A] | [Yes/No/N/A] | [notes] |

---

## Endpoint Catalog

[Table of all endpoints. Flag unauthenticated endpoints and those with auth ordering issues.]

| Resource Group | Path | Method(s) | Auth Level | Auth First? | Elevated Creds? | Protected Data | File |
|---|---|---|---|---|---|---|---|
| /api/users | /api/users/:id | GET | authenticated | Yes | No | Protected B | src/routes/users.ts:42 |

**Unauthenticated endpoints using elevated credentials:** [list or None; these are critical]
**Endpoints where auth is not first in middleware chain:** [list or None]

---

## Critical File Index

| Category | Files |
|---|---|
| Authentication | [list] |
| Authorization | [list] |
| Routing | [list] |
| Configuration | [list] |
| Data Models | [list] |
| Encryption | [list] |
| Logging | [list] |
| File Uploads | [list or None] |
| AI/LLM | [list or None] |
| Deployment | [list] |

---

## Secrets Findings

[Only include this section if secrets_findings[] is non-empty. Use redacted values only.]

**[N] secrets finding(s) detected. Review required before proceeding with assessment.**

| ID | Type | File | Line | Location | Severity |
|---|---|---|---|---|---|
| SEC-SCAN-001 | [type] | [file] | [line] | [current_head/history_only] | [severity] |

---

## Bot/AI-Authored Commits Touching Security Files

[Only include if bot_commits[] is non-empty.]

| Commit | Author | Date | Security Files Touched | Review Status |
|---|---|---|---|---|
| [short hash] | [author] | [date] | [file list] | [reviewed/unreviewed/unknown] |

---

## .gitignore Gaps

[Only include if gitignore_gaps[] is non-empty.]

| Missing Pattern | Files Matched | Committed to Repo |
|---|---|---|
| [pattern] | [files] | [Yes/No] |
```

---

## Completion Report

After writing both output files, print:

```
## Application Map Generation Complete

**Application:** [name]
**Commit stamped:** [full commit hash or null]
**Date:** [YYYY-MM-DD]

**Discovery summary:**
- Technology stack: [primary language + framework]
- Deployment target: [cloud_lz / on_premises / unknown]
- Endpoints cataloged: [N] ([N] authenticated, [N] unauthenticated, [N] unknown)
- Identity providers detected: [N]
- Auth mechanisms detected: [N]
- Critical files indexed: [N total across all categories]
- Secrets findings: [N] ([N] current_head, [N] history_only)
- Bot commits touching security files: [N]
- .gitignore gaps: [N]

**Files written:**
- .ai/blueteam/data/application_map.json
- .ai/blueteam/data/app_topology.json
- .ai/blueteam/reports/application_map.md
- .ai/blueteam/reports/application_map.html

**Next steps:**
Assessment skills will now read from this map rather than performing independent discovery. If code is committed after this point, re-run this skill (or any assessment skill; it will detect the stale map and regenerate automatically).
```
