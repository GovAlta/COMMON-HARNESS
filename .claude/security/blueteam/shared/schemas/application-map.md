---
title: "AI Schema: application_map.json"
description: Schema sub-file for application_map.json, read by skills/01-application-map.md (not for standalone use).
version: 1.0.0
status: active
parent_skill: shared/schemas/artifacts.md
---

> Sub-file of `shared/schemas/artifacts.md`. Contains only the `application_map.json` schema and field definitions. Load this file instead of the full `shared/schemas/artifacts.md` when you only need the application map schema.

---

## Schema: `.ai/blueteam/data/application_map.json`

This file is written by `skills/01-application-map.md` and consumed as a shared discovery input by the threat model / ASVS / CAS assessment skills. It captures a point-in-time snapshot of the codebase's security-relevant structure, stamped with the git commit hash for staleness detection.

**Staleness rule**: Any assessment skill that reads this file MUST first compare `generated_at_commit` to the output of `git rev-parse HEAD`. If they differ, the map is stale and MUST be regenerated before use. For non-git repositories, compare `generated_at_date` to the current date; if different, regenerate.

```json
{
  "schema_version": "1.0",
  "generated_at_date": "YYYY-MM-DD",
  "generated_at_commit": "40-char sha1 string, or null if not a git repository",
  "has_git_history": true,
  "application_name": "string: from classification YAML or inferred from package.json / repo name",
  "tech_stack": {
    "primary_language": "TypeScript",
    "secondary_languages": ["SQL"],
    "frameworks": ["Express 4.x", "Vue 3"],
    "runtime": "Node.js 20",
    "package_manager": "npm | yarn | pnpm | pip | maven | gradle | go modules | cargo | none",
    "uses_managed_language": true,
    "has_file_uploads": false,
    "has_ai_llm_features": false,
    "ai_llm_details": "null, or description e.g. 'Azure OpenAI chat completion at src/services/ai.ts'",
    "deployment_manifests_found": ["Dockerfile", "render.yaml"],
    "deployment_target_inferred": "cloud_lz | on_premises | unknown"
  },
  "identity_providers": [
    {
      "type": "Enterprise IdP | Corporate OIDC Provider | External Identity Gateway | Custom | Unknown",
      "file": "src/auth/oidc.ts",
      "line": 12,
      "notes": "OIDC client via @azure/msal-node; discovery URL configured"
    }
  ],
  "auth_mechanisms": [
    {
      "type": "JWT | Session | API Key | OAuth/OIDC | Basic | None",
      "file": "src/middleware/auth.ts",
      "line": 18,
      "signature_verified": true,
      "algorithm_hardened": true,
      "notes": "JWT HS256; secret read from JWT_SECRET env var"
    }
  ],
  "endpoints": [
    {
      "path": "/api/users/:id",
      "methods": ["GET"],
      "file": "src/routes/users.ts",
      "line": 42,
      "resource_group": "/api/users",
      "auth_level": "authenticated | unauthenticated | unknown",
      "auth_middleware": ["authenticateJWT", "requireRole('admin')"],
      "auth_first_in_chain": true,
      "uses_elevated_credentials": false,
      "consumes_protected_data": true,
      "protected_data_classification": "Protected B | Protected A | Public | Unknown",
      "notes": "Returns full user record including PHN field"
    }
  ],
  "critical_files": {
    "authentication": ["src/middleware/auth.ts"],
    "authorization": ["src/middleware/rbac.ts"],
    "routing": ["src/routes/index.ts"],
    "configuration": ["src/config/index.ts", ".env.example", "Dockerfile"],
    "data_models": ["src/models/User.ts"],
    "encryption": ["src/utils/crypto.ts"],
    "logging": ["src/utils/logger.ts"],
    "file_uploads": [],
    "ai_llm": [],
    "deployment": ["Dockerfile", "render.yaml"]
  },
  "secrets_findings": [
    {
      "id": "SEC-SCAN-001",
      "type": "JWT Secret | API Key | DB Connection String | Private Key | OAuth Client Secret | Generic High Entropy",
      "file": "src/config/index.ts",
      "line": 14,
      "location": "current_head | history_only",
      "commit_hash": "null, or sha1 string if from git history",
      "severity": "critical | high | medium | low",
      "detection_method": "manual_pattern | tool",
      "tool_used": "gitleaks | trufflehog | detect-secrets | manual",
      "redacted_preview": "sk-[REDACTED]",
      "notes": "OpenAI API key hardcoded in config file"
    }
  ],
  "bot_commits": [
    {
      "commit_hash": "abc123",
      "author": "gpt-engineer-app[bot]",
      "date": "YYYY-MM-DD",
      "security_critical_files_touched": ["src/auth/middleware.ts"],
      "review_evidence": "reviewed | unreviewed | unknown"
    }
  ],
  "gitignore_gaps": [
    {
      "sensitive_pattern": ".env | *.pem | *.key | *credentials*",
      "files_matched": [".env"],
      "any_committed": true,
      "notes": ".env file present in repository and missing from .gitignore"
    }
  ],
  "client_applications": [
    {
      "name": "string: from package.json name field",
      "type": "mobile-rn | web-spa | cli",
      "path": "relative/path/to/package/root",
      "framework": "React Native / Expo | Angular | Vue | Next.js | Create React App | Other",
      "framework_version": "0.81.6",
      "auth_mechanisms": ["expo-auth-session", "expo-local-authentication"],
      "credential_storage": "expo-secure-store | AsyncStorage | WKWebView-cookie | keychain | unknown",
      "credential_storage_encrypted": true,
      "os_permissions_declared": ["camera", "location", "biometric", "contacts", "notifications"],
      "attestation_present": false,
      "certificate_pinning": false,
      "pii_in_local_state": ["PHN", "name"],
      "deep_link_scheme": "string or null",
      "critical_files": ["relative/path/to/auth.ts", "relative/path/to/storage.ts"]
    }
  ]
}
```

### Field Definitions: Application Map

| Field | Required | Description |
|---|---|---|
| `schema_version` | Yes | Schema version: `"1.0"` |
| `source` | No | `"code"` (default, absent = treat as code) or `"requirements"`. Indicates whether this map was generated by `skills/01-application-map.md` (code analysis) or `skills/13-requirements-map.md` (requirements document analysis). Downstream skills use this field to activate design-level (Requirements Mode) behaviour. |
| `generated_at_date` | Yes | ISO date of generation |
| `generated_at_commit` | Yes | `git rev-parse HEAD` output at generation time; `null` if not a git repo or if generated from requirements documents |
| `has_git_history` | Yes | `true` if `.git/` directory exists and history was scanned |
| `application_name` | Yes | Inferred from classification YAML (`application.name`), package.json `name`, or repository directory name: in that order of preference |
| `tech_stack.uses_managed_language` | Yes | `true` if primary language is managed/memory-safe (TypeScript, Python, Go, Java, C#, Ruby): used by ASVS to exclude V5.4 |
| `tech_stack.deployment_target_inferred` | Yes | `cloud_lz` if Azure/AWS/GCP deployment manifests found; `on_premises` if IIS/on-prem indicators found; `unknown` otherwise |
| `identity_providers[]` | Yes | All detected IdP integrations; empty array if none found |
| `auth_mechanisms[]` | Yes | All detected authentication mechanisms; include one entry per distinct implementation |
| `endpoints[]` | Yes | All detected routes/API endpoints: REST, GraphQL, WebSocket, SSE, webhook. `auth_first_in_chain`: `true` if auth middleware precedes all other middleware; `false` if any non-auth middleware runs before auth check; `null` if ordering cannot be determined |
| `endpoints[].resource_group` | Yes | Normalized resource path derived from `path` by removing any trailing action segments and preserving parameter placeholders. Examples: `/api/applications/:id/adjudicate` → `/api/applications/:id`; `/api/applications` → `/api/applications`; `/api/users/:id/roles/:roleId` → `/api/users/:id`. Assessment skills use this field to group all endpoints by resource and verify authorization checks are uniform across all HTTP verbs for each resource group. |
| `endpoints[].uses_elevated_credentials` | Yes | `true` if the endpoint uses service role keys, admin API keys, or privileged credentials regardless of caller authentication status |
| `critical_files.*` | Yes | All arrays may be empty; never omit a key |
| `secrets_findings[]` | Yes | Empty array if no secrets found; do not omit the field |
| `secrets_findings[].location` | Yes | `current_head` = secret is in current working tree; `history_only` = secret was deleted from HEAD but present in git history |
| `bot_commits[]` | Yes | Empty array if no bot-authored commits detected |
| `bot_commits[].review_evidence` | Yes | `reviewed` if there is a review approval event on the commit's PR; `unreviewed` if no review found; `unknown` if PR data not available |
| `gitignore_gaps[]` | Yes | Empty array if no gaps found |
| `client_applications[]` | Yes | All detected client-side application packages (mobile-rn, web-spa, cli). Empty array if none found. Never omit the field. |
| `client_applications[].type` | Yes | `mobile-rn` = React Native / Expo; `web-spa` = browser SPA (React, Angular, Vue, Next.js); `cli` = command-line tool |
| `client_applications[].credential_storage` | Yes | Primary mechanism for storing auth tokens/credentials on the device. `expo-secure-store` and `keychain` are encrypted OS-backed stores. `AsyncStorage` is **unencrypted**: agents MUST flag this as a finding when Protected A/B data is involved. |
| `client_applications[].credential_storage_encrypted` | Yes | `true` only if the identified storage uses OS-level encryption (Keychain, Keystore, expo-secure-store). `false` for `AsyncStorage`, in-memory-only, or unknown storage. |
| `client_applications[].attestation_present` | Yes | `true` if Play Integrity, DeviceCheck/AppAttest, or equivalent device attestation API is integrated in the package. |
| `client_applications[].certificate_pinning` | Yes | `true` if a network security config, TrustKit, or native TLS pinning mechanism is configured. |

### Regeneration Rules

This file is always fully replaced on regeneration: it is a complete snapshot, not an incrementally merged artifact. Downstream skills must never attempt to merge their own data into it.

---

## Schema: `.ai/blueteam/data/app_topology.json`

This file is written by `skills/01-application-map.md` alongside `application_map.json`. It provides the application architecture topology consumed by `generate_overview_html.js` to render the Data Flow Diagram (DFD) in `security_overview.html`, and is a full replacement on each regeneration.

**Portability contract:** `generate_overview_html.js` silently omits the DFD when this file is absent. The file may be hand-edited after generation to adjust layout, add `detail_only` connections, or correct labels.

```json
{
  "schema_version": "1.0",
  "canvas_width": 660,
  "zones": [
    {
      "id": "internet",
      "label": "Internet Zone (Untrusted)",
      "fill": "#f0f0f8",
      "label_color": "#445"
    }
  ],
  "components": [
    {
      "id": "authapi",
      "zone": "cloud_lz",
      "row": 1,
      "label": "auth-api",
      "sublabel": ".NET · JWT auth",
      "cc_path_fragment": "apps/auth-api/",
      "status": null
    }
  ],
  "connections": [
    {
      "from": "browser",
      "to": "waf",
      "warning": false,
      "label": null,
      "from_dx": 0,
      "to_dx": 0,
      "detail_only": false
    }
  ]
}
```

### Field Definitions: app_topology.json

| Field | Required | Description |
|---|---|---|
| `schema_version` | Yes | Schema version: `"1.0"` |
| `canvas_width` | Yes | SVG canvas width in pixels. `660` for standard panel width. |
| `zones[]` | Yes | Trust zones rendered as swimlane bands, top to bottom in array order |
| `zones[].id` | Yes | Unique zone identifier (e.g., `internet`, `cloud_lz`, `on_prem`) |
| `zones[].label` | Yes | Human-readable zone label displayed at top-left of the band |
| `zones[].fill` | Yes | Background hex colour for the zone band |
| `zones[].label_color` | Yes | Text hex colour for the zone label |
| `components[]` | Yes | Application components (services, clients, data stores, IdPs) |
| `components[].id` | Yes | Unique component identifier (lowercase, no spaces) |
| `components[].zone` | Yes | ID of the zone this component belongs to |
| `components[].row` | Yes | Row index within the zone (0 = top). Components sharing the same zone+row are laid out side-by-side, evenly spaced. |
| `components[].label` | Yes | Primary display label |
| `components[].sublabel` | No | Secondary label line (technology, auth status, etc.). Omit or set `null` if not needed. |
| `components[].cc_path_fragment` | No | Relative path prefix (e.g., `apps/auth-api/`) used by the DFD renderer to derive live security status from `code_changes.json`. Omit for infrastructure components with no source code in the repository. |
| `components[].status` | No | Override security status: `critical`, `high`, `medium`, `low`, or `pass`. `null` (or omit) means the renderer derives status from `cc_items` via `cc_path_fragment`. Use to hard-code status for components with no `cc_path_fragment` (e.g., `"status": "critical"` for an anonymous caller component). |
| `connections[]` | Yes | Directed edges between components |
| `connections[].from` | Yes | Source component id |
| `connections[].to` | Yes | Destination component id |
| `connections[].warning` | No | `true` renders as red dashed arrow: use for security-critical paths (unauthenticated access, bypassed controls). Default `false`. |
| `connections[].label` | No | Edge label text. Shown only when renderer is in `detail=True` mode (Threat Model tab), unless `detail_only` is also `false`. Omit or `null` for unlabelled edges. |
| `connections[].from_dx` | No | Horizontal pixel offset from the source component's bottom-centre for the arrow departure point. Positive = right, negative = left. Default `0`. |
| `connections[].to_dx` | No | Horizontal pixel offset from the destination component's top-centre for the arrow arrival point. Positive = right, negative = left. Default `0`. |
| `connections[].detail_only` | No | `true` suppresses this connection entirely in compact (Dashboard) mode: it appears only in the Threat Model tab's detail DFD. Use for internal security-annotated paths (e.g., TLS bypass arrows) that would clutter the dashboard view. Default `false`. |

### Standard organizational Zone Definitions

Use these exact values for Cloud Landing Zone deployments:

```json
[
  {"id": "internet",  "label": "Internet Zone (Untrusted)", "fill": "#f0f0f8", "label_color": "#445"},
  {"id": "cloud_lz",  "label": "Cloud Landing Zone: Kubernetes",        "fill": "#eaf3fb", "label_color": "#1a3a5c"},
  {"id": "on_prem",   "label": "On-Premises",           "fill": "#f0f5f0", "label_color": "#1a3a1a"}
]
```

For non-organizational or non-Cloud-LZ deployments, use descriptive zone labels appropriate to the actual deployment topology.

### Derivation Rules (for `skills/01-application-map.md`)

The following rules derive `app_topology.json` from the synthesized `application_map.json`:

**Zones:**
- Always include `internet`.
- Include `cloud_lz` if `tech_stack.deployment_target_inferred == "cloud_lz"`.
- Include `on_prem` if any `identity_providers[]` entry notes indicate an on-premises IdP (e.g., `access.example.com`, `Keycloak`, `ADFS`), or if any data store connection strings reference an on-premises host.
- Stack zones: `internet` first (row 0), `cloud_lz` second, `on_prem` last.

**Components: fixed (Internet zone, row 0):**
- Always add `browser` (label: "Browser Clients", sublabel: application's user persona, e.g., "Staff / Facility Owners").
- Add `anon` (label: "Anonymous Caller", sublabel: "No credentials required", `status: "critical"`) only if `endpoints[]` contains any entries with `auth_level: "unauthenticated"` that serve non-public data.

**Components: WAF (Cloud LZ, row 0):**
- Add `waf` (label: "Cloudflare WAF", sublabel: "(Assumed)") if the app is public-facing and `cloud_lz` zone is present. This corresponds to organizational environment baseline assumption WAF-001.

**Components: API services (Cloud LZ, rows 1+):**
- Group `endpoints[]` entries by the common prefix of their `file` paths up to and including the second path segment (e.g., `apps/auth-api/Controllers/...` → prefix `apps/auth-api/`).
- Each distinct prefix = one service component. Assign sequential rows starting at row 1.
- `id`: derive from the prefix: strip `apps/`, trailing slash, convert hyphens to nothing (e.g., `apps/auth-api/` → `authapi`).
- `cc_path_fragment`: the raw prefix (e.g., `apps/auth-api/`).
- `sublabel`: derive from `auth_mechanisms[]`: if the service's endpoints are all `auth_level: "authenticated"`, use `"[Language] · JWT auth"` (or the detected auth type); if any are `auth_level: "unauthenticated"`, use `"[Language] · No auth"`.

**Components: data stores (Cloud LZ or on_prem, last row):**
- Add one component per distinct data store technology detected (SQL Server, Cosmos DB, Redis, etc.).
- Assign to `cloud_lz` if cloud-managed; `on_prem` if on-premises host detected in connection strings.
- Group multiple instances of the same technology into one component (e.g., "SQL Server ×2" with sublabel listing the database names).
- No `cc_path_fragment` (infrastructure: not source-code-tracked).

**Components: Identity Providers (on_prem zone, row 0):**
- Add one component per entry in `identity_providers[]`.
- Use the `type` field and `notes` to derive label and sublabel (e.g., `type: "Custom"`, notes containing "Keycloak" → label "Keycloak IdP", sublabel from the notes URL if present).

**Connections:**
- `browser → waf` (if waf exists), else `browser → [first authenticated service]`.
- `anon → [each unauthenticated service]`: `warning: true`, `label: "Unrestricted: no JWT required"`, `to_dx: 55` (offset right to avoid overlap when multiple services in the row).
- `waf → [each service]` (one connection per service, no label, not warning).
- `[service] → [its data store(s)]`: infer from which data model files are referenced by each service's endpoint files.
- `[authenticated service] → [IdP]`: add for each service that uses an OAuth/OIDC or JWT mechanism referencing the IdP. If a TLS certificate validation bypass pattern is detected for this service's IdP connection (`ServerCertificateCustomValidationCallback = ... => true`, or equivalent), set `warning: true`, `label: "TLS bypass (CC-NNN)"`, `from_dx: -55`, `detail_only: true`.

---
