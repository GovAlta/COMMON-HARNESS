# Code Fix Generation Skill

## Purpose

This skill populates the `replacement_code` field for each entry in `.ai/blueteam/data/code_changes.json` that currently has an empty or absent `replacement_code`.  It is a post-processing pass that runs **after** assessment skills (Threat Model / ASVS / CAS / DR) have identified findings and created CC entries; those skills focus on *what* to change, this skill focuses on *how* to change it.

Each CC entry already contains:
- `file_path` + `line_reference`: where the change goes
- `current_code_summary`: what the problematic code looks like today
- `description`: why the change is needed
- `change_type`: add | fix | remove | configure
- `acceptance_criteria`: the definition of done

This skill reads those fields, opens the referenced source files, and writes a concrete code block to `replacement_code` that a developer can copy-paste.

---

## When to Run

Run this skill when `validate_reports.js` reports:

```
WARN  N/M CC entries missing replacement_code; "Show fix" will not appear
```

Also run when a new round of assessment skills adds CC entries that lack `replacement_code`.

---

## Inputs

- `.ai/blueteam/data/code_changes.json`: canonical CC registry
- The source files at the paths listed in each CC entry's `file_path`

---

## Outputs

- `.ai/blueteam/data/code_changes.json`: updated in place; `replacement_code` populated for every entry that previously lacked it
- `.ai/blueteam/reports/code_changes.html`: regenerated via `generate_report_html.js`

Do **not** overwrite `replacement_code` for entries that already have it unless it is demonstrably wrong.

---

## Execution Instructions

### Phase 0: Load and triage

1. Read `.ai/blueteam/data/code_changes.json`. Identify the canonical entries array (`changes` key).
2. Build a work list: every entry where `replacement_code` is null, empty string, or absent.
3. Print the work list to confirm scope before generating any code.

### Phase 1: Per-entry code generation

For each entry in the work list, execute the following steps:

#### Step 1.1: Read the target file

Open `file_path` and read the lines around `line_reference`.  If `line_reference` is a range (e.g., `"100-120"`), read that range plus 10 lines of context on each side.  If it is a single integer, read ±15 lines.

If the file does not exist in the repository, note it as `file_not_found` and skip to the next entry; do not write a placeholder.

#### Step 1.2: Understand the current state

Cross-reference what you see in the file against `current_code_summary`.  If there is a significant mismatch (the code has already been partially fixed, or the line numbers are stale), note the discrepancy in a comment at the top of `replacement_code` and generate the fix based on what you actually see.

#### Step 1.3: Generate replacement_code

Write a complete, self-contained code block that replaces or supplements the lines at `line_reference`.  Rules:

- **Do not truncate**: show the full replacement. Never use `// ... existing code ...` ellipsis inside the block unless the context window genuinely cannot fit the surrounding code.
- **Language fidelity**: match the exact style / indentation / patterns of the surrounding code (C# braces/spacing conventions, TypeScript semicolons, etc.).
- **No stub code**: every method / field / namespace referenced in the replacement must be real and consistent with the project's existing dependencies (read `*.csproj` or `package.json` if needed to confirm packages are already present or note if a package must be added).
- **Scope clarity**: if the fix requires changes in multiple files (e.g., a DI registration in `Program.cs` *and* a service class), include the multi-file changes separated by a file-path comment header:

  ```
  // === apps/finrep-api/Program.cs (line 42) ===
  builder.Services.AddAuthentication(...)...

  // === apps/finrep-api/Controllers/FinancialReportController.cs ===
  [Authorize]
  public class FinancialReportController ...
  ```

- **References**: if a fix requires a NuGet package not yet referenced, prepend a note:
  ```
  // Requires NuGet: Microsoft.Extensions.Http.Polly
  ```
- **Secret redaction**: any literal secret value encountered in the source file (API key, password,
  token, connection string, certificate thumbprint, etc.) MUST be replaced with a `[REDACTED-*]`
  token, even in `// DELETE:` comments that show the old problematic line.  Use a descriptive
  suffix, e.g. `[REDACTED-JWT-KEY]`, `[REDACTED-SQL-PASSWORD]`, `[REDACTED-API-KEY]`.
  Do **not** include the actual secret value anywhere in `replacement_code`.

#### Step 1.4: Write back

Set `entry["replacement_code"] = <generated string>` in the in-memory JSON object.

Do **not** commit to disk after each entry; accumulate all changes and write once at the end of Phase 1.

### Phase 2: Write JSON

Write the updated `.ai/blueteam/data/code_changes.json` with `indent=2, ensure_ascii=False`.
Update `last_updated` to today's ISO date.

### Phase 3: Regenerate HTML report

Run:
```bash
node <BlueTeam>/scripts/generate_report_html.js --file .ai/blueteam/reports/code_changes.md
```

If `code_changes.md` does not yet exist, check whether a skill that produces it has been run (e.g., the CAS skill outputs it). If absent, skip this step and note it in the completion summary.

### Phase 4: Regenerate overview

Run:
```bash
node <BlueTeam>/scripts/generate_overview_html.js --repo-root .
```

---

## Code Fix Quality Standards

| Change type | Expected replacement_code content |
|---|---|
| `add` | Complete new block to insert. Show exact insertion point via comment |
| `fix` | Show the corrected version of the problematic lines; include enough context (function signature + first and last line of method) for a developer to locate it |
| `remove` | Show the lines to delete with a `// DELETE:` comment prefix and the lines to keep |
| `configure` | Show the complete config block (appsettings section, YAML, JSON host.json) after the change |

---

## Entry-by-Entry Notes (common CCDS patterns)

These notes apply specifically to the `ddi-ccds` repository and save re-reading source files:

| CC-ID | Pattern | Key files to read |
|---|---|---|
| CC-001 | Add `AddAuthentication().AddJwtBearer()` + `[Authorize]` | `apps/finrep-api/Program.cs`: compare with working pattern in `apps/auth-api/Startup.cs` |
| CC-002 | Remove hardcoded JWT fallback | `apps/auth-api/Startup.cs:156`, `apps/sc-api/Startup.cs:105` |
| CC-003 | Restore `Forbidden(context)` | `apps/auth-api/Attributes/ApiAuthorizeAttribute.cs` |
| CC-004 | Add `GetApiKeyHeader()` calls | `apps/auth-api/Controllers/ExternalController.cs` |
| CC-005 | Remove credentials from appsettings | `apps/auth-work-api/appsettings.json` |
| CC-006 | Add org-scope check | `apps/auth-api/Controllers/GrantPaymentController.cs` |
| CC-007 | Remove TLS bypass | `apps/auth-api/Services/KeyCloakService.cs`, `apps/sc-api/...` |
| CC-008 | Remove CORS `AllowAnyOrigin()` | `apps/auth-api/Startup.cs`, `apps/finrep-api/Program.cs` |
| CC-009 | Add security headers middleware | the API `Startup.cs` / `Program.cs` files across all apps |
| CC-010 | Magic byte + malware scan | upload controller(s); note: scanner integration may be a stub |
| CC-011 | Add `AddRateLimiter()` | `apps/auth-api/Startup.cs`, `apps/finrep-api/Program.cs` |
| CC-012 | Audit logging service | identify existing logging patterns, add structured events |
| CC-013 | Fix SQL injection | `apps/auth-api/Entities/LicensingContext.cs:684`: change `ExecuteSqlRawAsync($@"...")` to `ExecuteSqlInterpolatedAsync($@"...")` |
| CC-014 | Strip health endpoint disclosure | `apps/auth-api/Controllers/HealthController.cs` |
| CC-015 | Move token to HttpOnly cookie | `apps/sc-app/src/...` Angular token storage |
| CC-016 | FluentValidation | pick one high-risk DTO, show full validator class |
| CC-017 | RS256 via Authority | remove `IssuerSigningKey`, set `Authority` |
| CC-018 | Cache-Control middleware | add `UseNoCacheHeaders()` or equivalent middleware |
| CC-019 | Env gate for swagger/devex | `env.IsDevelopment()` guard |
| CC-020 | Keycloak token revocation | logout endpoint calling `/protocol/openid-connect/revoke` |

---

## Completion Checklist

- [ ] All CC entries in `code_changes.json` have non-empty `replacement_code`
- [ ] No entry's `replacement_code` contains `// TODO`, `// ...`, or similar placeholders
- [ ] `code_changes.json` written with `last_updated` set to today's date
- [ ] `code_changes.html` regenerated (or step skipped with note if `.md` absent)
- [ ] `security_overview.html` regenerated
- [ ] `validate_reports.js` shows PASS for CC replacement_code check

---

## Completion Output

Return a brief summary:

```markdown
## Code Fix Generation Complete

- CC entries updated: N/M (N new replacement_code values written, M already populated)
- Skipped (file not found): [list or "none"]
- Packages required (add to project): [list or "none"]
- Artifacts written: code_changes.json, code_changes.html (if applicable), security_overview.html
```
