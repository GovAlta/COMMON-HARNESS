---
name: sync-docs
description: Audit a project's README/openapi.yaml/CLAUDE.md/migrations/routes for drift between docs and code. Auto-discovers what's there, runs only the checks that apply, and proposes targeted patches before applying them. Use after a feature lands, when CI flags drift, or when a user asks "are docs in sync?".
user-invocable: true
---

# /sync-docs: drift audit + targeted fix

This skill drives `check-docs-sync.mjs` (sibling of this file) to detect and
repair drift between the docs and the code they describe. It is project-
agnostic: the checker auto-discovers whatever exists in the project and
silently skips checks for things that don't.

## When to invoke

- The user says "are docs in sync?", "check docs", "audit docs", "sync docs",
  or similar.
- After landing a feature that touched routes, migrations, models, services,
  validators, error codes, or the OpenAPI spec.
- When the docs-sync CI job or pre-push hook fails and the user wants the
  agent to fix it.

## What the script checks

Each check runs only if its inputs exist in the project:

| Check | Triggers when | What it catches |
|-------|---------------|-----------------|
| `migrations.count` | a `migrations/` dir exists with `NNN_*.sql` files | README/CLAUDE.md `(N Total)` or `N migrations` numbers disagree with files on disk |
| `routes.openapi.missing` | both routes/app entry AND `openapi.yaml` exist | every `router.METHOD('path')` has a matching `paths:` entry in OpenAPI |
| `routes.openapi.orphan` | same | OpenAPI documents a path no route implements (warn) |
| `citations` | routes exist | `GET /xxx` references inside README/CLAUDE.md resolve to a real route |
| `sse.events` | source contains `.broadcast('event')` calls | every broadcast event is mentioned in some doc |
| `errors.undocumented` | source throws `new XxxError(..., NNN, 'CODE')` | each custom error code appears in README/openapi/CLAUDE.md (warn) |
| `version.banner` | README has `Aligned with openapi vX.Y.Z` | matches `info.version` in openapi.yaml |

## Auto-discovery

The script looks for each artifact in common locations. Order of preference:

| Artifact | Looked at |
|----------|-----------|
| Project root | walks up from CWD until it finds `package.json`, `.git`, `pyproject.toml`, or `go.mod` (or pass `--root`) |
| README | `README.md`, `app/README.md`, `docs/README.md` |
| OpenAPI | `openapi.yaml`, `server/openapi.yaml`, `api/openapi.yaml`, `docs/openapi.yaml`, `swagger.yaml` |
| CLAUDE files | `CLAUDE.md`, `server/src/static/CLAUDE.md`, `server/CLAUDE.md`, `app/CLAUDE.md`, `.claude/CLAUDE.md` (collects all that exist) |
| Migrations | `server/migrations`, `migrations`, `db/migrations`, `db/migrate`, `sql/migrations` |
| Routes dir | `server/src/routes`, `src/routes`, `server/routes` |
| App entry | `server/src/app.ts`, `server/src/server.ts`, `src/app.ts`, `app.js`, `server.js` |

## Project overrides

If auto-discovery picks the wrong file (or your project has a non-standard
layout), drop a `.docs-sync.json` in the project root. Any keys you set
override discovery; the rest are still auto-detected.

```json
{
  "readme": "app/README.md",
  "openapi": "server/openapi.yaml",
  "claudeMds": ["CLAUDE.md", "server/src/static/CLAUDE.md"],
  "migrations": { "dir": "server/migrations", "pattern": "^\\d{3}_.*\\.sql$" },
  "routes":     { "dir": "server/src/routes", "glob": "*.routes.{ts,js}" },
  "appEntry": "server/src/app.ts",
  "srcDir":   "server/src",
  "skip":     ["sse.events"]
}
```

`skip` accepts any category listed in the table above to silence checks that
don't apply (e.g. you don't have SSE in this project).

## Workflow

1. **Locate the project** the user wants checked (usually the cwd, or the
   `app/` directory inside a harness setup).

2. **Run the check, capture JSON for triage:**
   ```bash
   node .claude/skills/sync-docs/check-docs-sync.mjs --root <project-dir> --json > /tmp/sync.json
   cat /tmp/sync.json
   ```
   (If a project-local copy exists at `scripts/check-docs-sync.mjs` or wired
   up as `npm run check:docs:json`, prefer that, it lets the user invoke
   the same check without the harness.)

3. **For each issue:** read the source file at the location implied by
   `category` and `message`, read the doc that's missing the reference, and
   plan the smallest patch that closes the gap. Group related gaps in one
   `Edit` when they live in the same file.

4. **Show the user the proposed diff first** before applying. Drift fixes
   are usually unambiguous, but a citation gap sometimes reveals a misnamed
   endpoint or a genuinely missing implementation, those need human
   judgment, not a forced fix.

5. **Apply edits and re-run** to confirm zero drift:
   ```bash
   node .claude/skills/sync-docs/check-docs-sync.mjs --root <project-dir>
   ```
   If new drift surfaces (e.g. adding a doc reference exposed a different
   missing entry), repeat.

6. **Stop when:** the script exits 0 with `no drift detected`.

## Triage hints by category

- `migrations.count`: only the README/CLAUDE.md numbers need updating.
  Never touch the migration files to make a count match.
- `routes.openapi.missing`: a new endpoint was added but `openapi.yaml`
  wasn't updated. Open `openapi.yaml` and add a concise entry next to
  similar paths; copy the `tags:` style of nearby endpoints.
- `routes.openapi.orphan` (warn): OpenAPI describes a path that was
  renamed or removed. Either delete the OpenAPI entry or restore the route.
- `citations`: README/CLAUDE.md references an endpoint that doesn't exist.
  Check for typos in `{paramName}`, dead links from a refactor, or
  shorthand like `POST/DELETE /users/{id}/roles[/{role}]` that mixes two
  routes, split it into two explicit citations.
- `sse.events`: code broadcasts an event that no doc mentions. Add it to
  the SSE listener block in CLAUDE.md and the streaming-endpoint
  description in `openapi.yaml`.
- `errors.undocumented` (warn): a custom error code is thrown but never
  explained to consumers. Add it to the `Errors:` block of the relevant
  endpoint in OpenAPI, or to a domain-error table in README.
- `version.banner`: bump README's `Aligned with openapi vX.Y.Z` or the
  OpenAPI `info.version`, whichever is stale.

## Wiring up automatic checks

For continuous protection inside Claude Code, drop these hooks into the
project's `.claude/settings.json` (a copy-paste snippet is in
`hooks-snippet.json` next to this skill):

- `PostToolUse` on `Edit|Write` runs `--migrations-only` (cheap; surfaces
  migration drift the moment a new SQL file is added).
- `Stop` runs the full check before the conversation ends (so a feature
  can't be declared complete with stale docs).

For repo-level protection, add a pre-push hook (`scripts/git-hooks/pre-push`)
and a CI workflow (`.github/workflows/check-docs-sync.yml`) that run the
same check on every push.

## What this skill should NOT do

- Don't silently bypass the script by relaxing matchers or adding entries
  to `.docs-sync.json#skip` to make the check pass. Skips are for genuine
  not-applicable checks, not papering over real drift.
- Don't invent endpoints, migrations, or error codes to satisfy a citation.
  If the cited thing genuinely doesn't exist, ask the user whether to
  remove the citation or implement the thing.
- Don't commit changes, that's a separate user decision after they've
  seen the diff.
