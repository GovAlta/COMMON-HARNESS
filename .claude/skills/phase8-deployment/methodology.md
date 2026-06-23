# Methodology: Phase 8: Deployment

> Companion to `SKILL.md` in this directory. Loaded on demand by `/phase8-deployment`.
> No frontmatter, methodology reference, not a discoverable skill.

Ship the approved build to production. The skill probes for **Nexus** (the
GCP-deployment environment that lets a Claude instance push to Cloud Run);
if found, it uses the cloud path. If not, it uses a local Docker path and
produces a handoff package a human pushes to real prod.

Both paths share the same pre-deploy checks, idempotent-migration runner,
and post-deploy smoke. Only the build-and-push step differs.

The output is two documents , `runbook.md` (executable; reproduces what
just happened) and `release-notes.md` (human-readable; what changed in
this release).

---

## Inputs

- **Required:** `sign-off.md` from `./phases/phase7-user-acceptance/output/`: formal approval. **Hard-block** if missing or contains Reject.
- **Required:** All `§3.5 phase8 Prerequisites` from sign-off.md must be satisfied (each row references its satisfaction artifact). **Hard-block** if any unsatisfied.
- **Required:** `./app/` built (frontend bundle + backend dist exist). **Hard-block** if not.
- **Required:** `./app/server/migrations/NNN_*.sql`: at least one migration file matching the `NNN_<description>.sql` pattern. **Hard-block** if missing or empty.
- **Recommended:** `architecture.md` §3.6 Deployment Topology and §3.5 Auth Flow, informs config surface.
- **Recommended:** `development-report.md` from `./phases/phase5-development/output/`: secret/config inventory and on-call notes.

---

## Phase 1: Pre-deploy gate

Run these before either deploy path. Failures hard-block; do not work around them.

### 1.1 Drift check

```bash
node .claude/skills/sync-docs/check-docs-sync.mjs --root ./app
```

Must report `no drift detected`. Drift between code and openapi.yaml at this stage = consumer contract mismatch in production.

### 1.2 Security scan

```bash
node .claude/security/blueteam/scripts/security-pipeline.js --repo-root ./app --all
```

Must report zero Critical findings. Highs are allowed only if listed in `.ai/reports/risk-acceptance.md` with documented rationale and signer.

### 1.3 Build artifacts present

```bash
cd ./app && npm run build
```

Both frontend bundle (`client/dist/`) and backend output (`server/dist/`) must exist. If `npm run build` doesn't produce them, the script section in `package.json` is misconfigured, fix before deploy.

### 1.4 Migration idempotency proof

Migrations are mandatory (CLAUDE.md rule #9). Apply twice to a scratch database; second run must change zero rows.

```bash
# Spin up a scratch Postgres
echo "POSTGRES_PASSWORD=$(openssl rand -hex 8)" > /tmp/scratch.env
docker run -d --name scratch-pg --env-file /tmp/scratch.env -p 5433:5432 postgres:16
sleep 5
export DATABASE_URL=postgres://localhost:5433/postgres

cd ./app && npm run db:migrate          # first apply
FIRST=$(psql "$DATABASE_URL" -tc "SELECT COUNT(*) FROM schema_migrations")

npm run db:migrate                       # second apply (must be a no-op)
SECOND=$(psql "$DATABASE_URL" -tc "SELECT COUNT(*) FROM schema_migrations")

if [ "$FIRST" != "$SECOND" ]; then
  echo "FAIL; migrations not idempotent. Second run added rows."
  exit 1
fi
docker rm -f scratch-pg
```

If migrations are not idempotent, **do not deploy**. Find the offending statement (likely a `CREATE TABLE` without `IF NOT EXISTS`, or an `INSERT` without `ON CONFLICT`) and fix it. The harness's `check-docs-sync` already counts migration files; a custom linter for idempotent SQL may be added later, but the proof above is the canonical check.

### 1.5 Secret/config inventory

Every `process.env.X` referenced by the backend must be declared in the deploy environment. Build the inventory:

```bash
grep -rh "process\.env\." ./app/server/src --include="*.ts" \
  | grep -oE "process\.env\.[A-Z_][A-Z0-9_]*" | sort -u > /tmp/env-vars-needed.txt
```

Compare against:
- `./app/.env.example` (declares the surface)
- The deploy environment (Nexus secrets, GCP Secret Manager refs, or local `.env` for the local path)

Any var in the code that's not in the deploy environment = startup-time failure waiting to happen. Surface in §5 Open Questions if missing.

### 1.6 Health probe sanity

Locally, before deploy:

```bash
cd ./app && npm run dev:server &  # background
sleep 5
curl -fsS http://localhost:3001/health/live
curl -fsS http://localhost:3001/health/ready
```

Both must return 200. If `/ready` returns non-200 because it can't connect to a dependency, document the dependency in the runbook and confirm the deploy environment provides it.

---

## Phase 2: Nexus / GCP Cloud Run path

### 2.1 Nexus capability detection

The skill probes (in order):
1. `gcloud` CLI installed AND `gcloud auth list --filter=status:ACTIVE` returns an account AND `gcloud config get-value project` returns a project.
2. Env vars `NEXUS_GCP_PROJECT` or `NEXUS_DEPLOY` set.
3. Config file at `.nexus.config.json` or `/etc/nexus/config.json`.
4. A `nexus` CLI in PATH.

Any of the above selects the cloud path; otherwise use the local path. `--mode nexus` or `--mode local` overrides detection.

### 2.2 Cloud build + push

```bash
PROJECT="${NEXUS_GCP_PROJECT:-$(gcloud config get-value project)}"
REGION="${NEXUS_GCP_REGION:-us-central1}"
TAG=$(git -C app rev-parse --short HEAD)
IMAGE="gcr.io/$PROJECT/velo-${MODULE_ID:0:8}:$TAG"

gcloud builds submit --tag "$IMAGE" ./app
```

The Dockerfile must:
- Use a slim base (`node:22-slim`)
- Run as non-root user
- COPY source + run `npm ci --omit=dev` + `npm run build`
- Expose `PORT` (default 3001, Cloud Run sets `$PORT`)
- Have a `HEALTHCHECK` instruction
- Set the entrypoint to start the server

### 2.3 Migrations as a one-shot Cloud Run job

```bash
gcloud run jobs create velo-${MODULE_ID:0:8}-migrate \
  --image "$IMAGE" \
  --command npm,run,db:migrate \
  --region "$REGION" \
  --set-secrets "DATABASE_URL=db-url:latest" \
  || gcloud run jobs update velo-${MODULE_ID:0:8}-migrate --image "$IMAGE"

gcloud run jobs execute velo-${MODULE_ID:0:8}-migrate --region "$REGION" --wait
```

Migrations run BEFORE the service deploys to its new revision, a failed migration aborts the deploy without serving broken code.

### 2.4 Service deploy

```bash
gcloud run deploy velo-${MODULE_ID:0:8} \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --service-account "velo-runner@$PROJECT.iam.gserviceaccount.com" \
  --set-secrets "DATABASE_URL=db-url:latest,JWT_KEY=jwt-key:latest,..." \
  --set-env-vars "NODE_ENV=production,LOG_LEVEL=info" \
  --port 3001 \
  --max-instances 10 \
  --min-instances 1 \
  --cpu 1 --memory 512Mi \
  --allow-unauthenticated  # adjust per security model
```

### 2.5 Cloud monitoring

After deploy, verify Cloud Logging is receiving requests, Cloud Monitoring uptime check is configured against `/health/ready`, and Error Reporting is wired up. If not, document in `runbook.md §3.7 Monitoring` as a follow-up work item.

---

## Phase 3: Local Docker path

When Nexus is unavailable, the skill builds locally and prepares a handoff package a human pushes to the eventual production environment.

### 3.1 Build the image

```bash
TAG=$(git -C app rev-parse --short HEAD)
IMAGE="velo-${MODULE_ID:0:8}:$TAG"
docker build -t "$IMAGE" ./app
```

Same Dockerfile requirements as 2.2.

### 3.2 Run migrations

```bash
docker run --rm \
  --env-file ./app/.env \
  --network=host \
  "$IMAGE" \
  npm run db:migrate
```

The `.env` must declare a real `DATABASE_URL` (e.g., a local Postgres, or a dev-environment URL). The pre-deploy idempotency proof from §1.4 already verified this is safe.

### 3.3 Local launch

```bash
docker run -d \
  --name "velo-${MODULE_ID:0:8}" \
  -p 3001:3001 \
  --env-file ./app/.env \
  "$IMAGE"
```

The skill captures the local URL (`http://localhost:3001`) for the smoke phase.

### 3.4 Handoff package

For the human to deploy to actual production:

```
./phases/phase8-deployment/output/handoff/
├── Dockerfile
├── migrations/        # Full set of NNN_*.sql files
├── .env.example       # Required env vars (real values redacted)
├── IMAGE.txt          # Image tag built locally
├── README.txt         # 1-page pointer to runbook.md
└── runbook.md         # Detailed deploy steps for the target environment
```

Plus a tarball: `handoff.tar.gz` ready to share with the operator (e.g., via shared drive or chat).

The runbook explicitly tells the human:
1. Which container registry to push to
2. What env vars the target environment needs
3. How to run the migrations against the production DB
4. How to verify health probes
5. How to roll back

---

## Phase 4: Post-deploy

### 4.1 Smoke test

Both paths:

```bash
curl -fsS "$DEPLOY_URL/health/live"   # liveness; process is running
curl -fsS "$DEPLOY_URL/health/ready"  # readiness; DB + dependencies reachable
curl -fsS "$DEPLOY_URL/api/v1/_meta/sync"  # confirms the meta endpoint reports
```

Failure of any: roll back per the runbook's rollback section. Do not advance the board.

### 4.2 Rollback plan

The runbook MUST document rollback: cloud path uses `gcloud run services update-traffic velo-... --to-revisions <prior-revision>=100`, and local path uses `docker run` against the prior tag.

For both paths, document migration rollback strategy:
- Forward-only is the default (no `down` migrations).
- For breaking changes (column drops), use the **expand-and-contract** pattern across two releases: release N adds the new column + double-writes; release N+1 stops reading the old column; release N+2 drops the old column. This way every in-between state is forward-rollback-safe.

If a migration is genuinely irreversible and a release rollback is needed, the rollback procedure includes manual database surgery, document it explicitly in §3.6 Rollback Plan.

### 4.3 Monitoring + alerting verification

Cloud path: confirm Cloud Logging, Monitoring uptime, and Error Reporting are wired. Local path: document that monitoring is the human's responsibility post-handoff.

For both: confirm an alert routes to a real human (PagerDuty, Slack, email, whatever the team uses). Untested alerting infrastructure looks live and is silently dead until the first incident.

### 4.4 On-call setup

`runbook.md §3.8 On-call` documents:
- Primary on-call contact (name + channel)
- Escalation path
- Runbook URL location for production responders
- Known-issue list (carry-forward from sign-off.md `§3.4 Updated Deferral Backlog`)

---

## Phase 5: Output structure

Two artifacts. Both share the standard 7-section skeleton + Compliance.

### runbook.md

Standard skeleton. Body:

#### 3.1 Deploy Summary

Mode (Nexus/local), image tag, deploy time, deploy URL, deployer (the AI account or human).

#### 3.2 Pre-deploy Checklist Outcomes

Each Phase 1 check + result. Empty rows are NOT allowed.

#### 3.3 Migration Apply

Every migration file in `migrations/` listed with applied-status (`applied` or `N/A`) and idempotency-proof timestamp. Confirms the rule #9 contract was honored.

#### 3.4 Build + Push

Cloud path: `gcloud builds submit` log reference. Local path: `docker build` output reference + image tag + handoff package location.

#### 3.5 Service Deploy

Cloud path: Cloud Run service name, revision, traffic split. Local path: container name, port mapping, restart policy.

#### 3.6 Rollback Plan

Concrete commands to revert (cloud uses traffic revert, local uses prior-tag run), plus migration rollback strategy if any expand-and-contract is in flight.

#### 3.7 Monitoring

What's monitored, where alerts go, who's on-call.

#### 3.8 On-call

Primary, escalation path, runbook reference for production responders.

### release-notes.md

Standard skeleton. Body:

#### 3.1 What Changed

User-facing changes since the last release. Pulled from FRs closed in /v5 development-report.md. Translated to user-language ("you can now share a project with a teammate" , not "FR-014 implemented").

#### 3.2 What's Improved

Performance gains, NFR improvements, fixed bugs from /v6 issue triage.

#### 3.3 Known Issues

Carry-forward from sign-off.md deferral backlog (Major + post-launch buckets). Each with a tracking reference.

#### 3.4 Migration Notes

Any operational notes, e.g., "this release adds an `email_verified` column with a default of false; backfill is scheduled in release N+1."

#### 3.5 How to Verify

A short "after this release lands, you should see X" verification list, for support staff to confirm the release worked.

---

## Quality bar

The deploy is good when:
- Pre-deploy gate (Phase 1) passed cleanly, no shortcuts.
- Migrations applied and proven idempotent.
- Health probes green post-deploy.
- Monitoring + alerting verified to fire on a real failure.
- Rollback plan tested at least once on a non-prod environment.
- Runbook stands alone, a fresh on-call could redo the deploy from it.
- Release notes describe user-visible changes in user-language.

The deploy is bad when:
- Migrations failed or weren't run ("we'll do them later").
- Smoke test wasn't run, or was skipped because it was "obvious."
- "Nexus path" was claimed but no actual cloud deploy occurred (vibes-based deploy).
- Rollback plan is "open the runbook" without specific commands.
- Release notes are commit messages dumped into a file.
- On-call section is empty.
