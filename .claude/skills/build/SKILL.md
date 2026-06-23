---
name: build
description: Scaffold and build an app from the harness's template. Copies template/public into ./app/, optionally strips unused code, and follows the build guides. Sole sanctioned scaffold path — never build by hand.
user-invocable: true
---

# Build from the Template

Scaffold an application into `./app/` using `template/public/`, then follow the build guides in order. This is the harness's **only** sanctioned way to create `./app/`. Non-negotiable rule #1 in `CLAUDE.md` exists because the rest of the harness (`/sync-docs`, `/phase5-development`, `/blueteam`, the guides, the standards) all assume the scaffolded structure that the template produces. Hand-rolled scaffolds break every downstream gate.

## Usage

```
/build                    (alias for /build fullstack)
/build fullstack          (client + server + test + root orchestration files)
/build frontend           (only client/ + a minimal app/package.json)
/build backend            (only server/ + relevant root files)
```

This harness ships exactly one template — `template/public/` — which is a fullstack monorepo (Vue 3 + PrimeVue + Tailwind client, Express + TypeScript + Postgres server, e2e tests, and root-level `install:all` / `dev:all` / `build` / `test` scripts). Earlier harness revisions referenced a `generic` / `goa-public` split; this template absorbed both lines.

## CRITICAL — Read before starting

You MUST copy the template directories using `cp -r` before doing anything else.
Do NOT read template files and rewrite them. Do NOT use the Write tool to create
files that already exist in the template. The workflow is COPY then STRIP (delete/edit),
never READ then REWRITE.

## Steps

### 1. Parse the request

| Invocation | What gets scaffolded |
|------------|----------------------|
| `/build` or `/build fullstack` | `template/public/{client,server,test}/` + root orchestration files → `./app/` |
| `/build frontend` | only `template/public/client/` → `./app/client/` + a minimal `./app/package.json` |
| `/build backend` | only `template/public/server/` → `./app/server/` + relevant root files |

If `./app/` already exists, hard-block. Re-scaffolding clobbers in-progress code. The user must explicitly `rm -rf ./app/` or pass `--force`.

### 2. Create the app directory

```bash
mkdir -p ./app
```

### 3. Copy the template

**For a fullstack scaffold (the common case):**

```bash
# Copy client + server + test subdirs
cp -r ./template/public/client/ ./app/client/
cp -r ./template/public/server/ ./app/server/
# test/ ships in the template root and is the canonical location the
# harness gates (check-test-presence.mjs) look at — copy it across.
[ -d "./template/public/test" ] && cp -r ./template/public/test/ ./app/test/

# CRITICAL: also copy the root-level orchestration files
# (template/public has install:all / dev:all / build / test scripts in package.json
#  + Dockerfile + .gitignore + .gitattributes + .env.example + README.md at its root)
for f in package.json package-lock.json Dockerfile .dockerignore README.md .env.example .gitattributes .gitignore; do
  [ -f "./template/public/$f" ] && cp "./template/public/$f" "./app/$f"
done
```

**For frontend-only scaffolds:** only copy `./template/public/client/ ./app/client/` and skip the root orchestration files. You'll create a minimal `./app/package.json` in Step 4.

**For backend-only scaffolds:** `cp -r ./template/public/server/ ./app/server/` plus the relevant root files (`.env.example`, `Dockerfile`).

**NEVER build from scratch.** Always copy from the template and strip what you don't need.

**CHECKPOINT:** Run `ls -a ./app/` and confirm `client/`, `server/`, `package.json`, `Dockerfile`, `.env.example`, `.gitignore` all exist for a fullstack scaffold. Confirm `cd ./app && npm run install:all` works (proves the root `package.json` wired correctly). Do NOT use the Write tool for any file under `./app/` until Step 5 (Strip).

### 4. Root monorepo config (only for non-fullstack scaffolds)

**Fullstack:** Step 3 already copied `package.json`, `.gitignore`, `.env.example`, `Dockerfile`, etc. from the template root. Verify they exist; only edit if your project needs different scripts (rare). The template's `package.json` already includes `install:all` / `dev:all` / `build` / `test` orchestration via `concurrently`.

**Frontend-only or backend-only scaffolds:** Step 3 didn't copy the orchestration files. Create a minimal `./app/package.json`:
- For frontend-only: point `dev` to `cd client && npm run dev`.
- For backend-only: point `dev` to `cd server && npm run dev`.

Plus a minimal `./app/.gitignore` (`node_modules`, `dist`, `.env`, `*.log`) and `./app/.env.example` (`PORT`, `CORS_ORIGIN`, `NODE_ENV`).

### 5. Strip the template

Use `rm` to delete unused files and `Edit` to modify kept files. Do NOT use `Write` to recreate files from memory — that defeats the template.

**Frontend:** Remove views, components, data files, and composables that aren't needed for the project. Keep the core infrastructure (`lib/api.ts`, `lib/sanitize.ts`, router, `main.ts`, Vite config).

**Backend:** Remove unused controllers, routes, models, services, validators, types, migrations, seeds, keys, scripts, SSE, WebSocket. Keep the middleware stack, `config/`, health routes, utils (logger, app-error, response, async-handler), and `types/express.d.ts`.

**IMPORTANT:** Also strip:
- `openapi.yaml` — rewrite to only document actual endpoints (`/sync-docs` will lint drift)
- Frontend `lib/api.ts` — remove auth/CSRF code if no auth endpoints exist
- Frontend `stores/auth.ts` — delete if no auth
- Test files for deleted modules
- `.env` files (keep `.env.example`)

### 6. Follow the build guides

Load the relevant guides from `.claude/guides/` in order:

| Layer | Path | Order |
|---|---|---|
| Backend (Node) | `.claude/guides/backend/nodejs/01-08*.md` | 01 → 08 sequentially |
| Backend (Go) | `.claude/guides/backend/golang/01-08*.md` | 01 → 08 sequentially |
| Frontend | `.claude/guides/frontend/01-12*.md` | 01 → 12 sequentially |

Cross-check against standards in `.claude/standards/` throughout (architecture, security, coding conventions, testing, accessibility, PWA).

### 7. Initialize git

```bash
cd ./app && git init && git add -A && git commit -m "Initial commit: scaffolded from harness template"
```

## Rules

- **Template first** — never write code from scratch when a template file exists
- **Strip completely** — don't leave zombie code (OpenAPI specs, auth stores, CSRF interceptors)
- **Standards are cross-cutting** — check `.claude/standards/` throughout, not just once
- **Guides are sequential** — follow 01 through 08 (backend) and 01-12 (frontend) in order
- **Parameterized SQL only** — no string interpolation in queries
- **httpOnly cookies** — never store tokens in localStorage
