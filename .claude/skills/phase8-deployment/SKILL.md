---
name: phase8-deployment
description: "Phase 8 of the build lifecycle. Ship to production. Detects Nexus capability (gcloud + GCP project) and deploys to GCP Cloud Run if available; falls back to local Docker build + handoff package + local launch if not. Both paths run idempotent migrations as part of release. Hard-blocks if phase 7 sign-off.md is missing OR has unsatisfied conditional-pass conditions. Usage: /phase8-deployment [--module moduleName] [--mode auto|nexus|local]"
user-invocable: true
---

# /phase8-deployment: Phase 8: Deployment

Ship the approved build to production. The skill probes for **Nexus**
capability (the GCP-deployment environment that lets the Claude instance
push to Cloud Run); if found, it uses the cloud path. If not, it builds
a local Docker image, runs it locally, and produces a deployment handoff
package for a human to push.

Both paths run the project's **idempotent migrations** (`npm run db:migrate`)
as part of release, no exceptions. Migrations are tracked as
`NNN_<description>.sql` files in `migrations/`; running the migrator twice
must be a no-op.

Output: `./phases/phase8-deployment/output/runbook.md`,
`./phases/phase8-deployment/output/release-notes.md`, plus state files /
handoff package depending on mode.

## Arguments

- `--module moduleName`: (optional) Scope to a single module's deploy.
- `--mode auto|nexus|local`: (optional) Force a deploy mode. Auto-detected otherwise.

## Hard-blocks

This skill refuses to proceed when:
- `./phases/phase7-user-acceptance/output/sign-off.md` is missing.
- `sign-off.md` has any "Reject" decisions.
- `sign-off.md` has unsatisfied conditional-pass conditions (the conditions are listed in `§3.5 phase 8 Prerequisites` and must each have a satisfaction reference).
- `./app/` is not built (no `dist/` or equivalent build artifacts).
- `migrations/` directory is missing or empty.

---

## Execution Steps

### Step 0: Load context

1. Load methodology: `.claude/skills/phase8-deployment/methodology.md`
2. Load architecture standard: `.claude/standards/01-architecture.md` (deployment topology, health checks)
3. Create the output directory if it does not exist:

```bash
mkdir -p ./phases/phase8-deployment/output
```

### Step 1: Verify upstream deliverable + content checks

```bash
if [ ! -f ./phases/phase7-user-acceptance/output/sign-off.md ]; then
  echo "/phase8-deployment hard-block: ./phases/phase7-user-acceptance/output/sign-off.md missing. Phase 7 Phase B must complete before /phase8-deployment." >&2
  exit 1
fi

# No Reject decisions
if grep -qE 'Reject' ./phases/phase7-user-acceptance/output/sign-off.md; then
  echo "/phase8-deployment hard-block: sign-off.md contains a Reject decision. Project not approved for deployment." >&2
  exit 1
fi

# All conditional-pass conditions must have a satisfaction reference (rigorous parse: see methodology §1)
# Heuristic: any row in §3.5 phase 8 Prerequisites whose Satisfaction column is empty or "TBD" blocks.
if awk '/§3\.5|## 3\.5/{flag=1; next} flag && /\|/{print}' ./phases/phase7-user-acceptance/output/sign-off.md \
   | grep -qE '\|\s*(TBD|TODO|pending|unsatisfied|)\s*\|\s*$'; then
  echo "/phase8-deployment hard-block: sign-off.md §3.5 phase 8 Prerequisites has unsatisfied conditional-pass conditions." >&2
  exit 1
fi

# Verify ./app/ exists and is built
if [ ! -f ./app/package.json ]; then
  echo "/phase8-deployment hard-block: ./app/ does not exist. Cannot deploy what was not built." >&2
  exit 1
fi

# Verify migrations exist and follow the NNN_*.sql convention
MIG_DIR="./app/server/migrations"
if [ ! -d "$MIG_DIR" ] || [ -z "$(ls $MIG_DIR/*.sql 2>/dev/null)" ]; then
  echo "/phase8-deployment hard-block: $MIG_DIR missing or empty. Cannot deploy without a migration set (rule #9; migrations are mandatory)." >&2
  exit 1
fi
```

### Step 2: Detect Nexus capability

```bash
NEXUS_AVAILABLE="false"
NEXUS_INDICATORS=()

# 1. gcloud CLI installed AND authenticated AND a project is set
if command -v gcloud >/dev/null 2>&1; then
  ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)
  PROJECT=$(gcloud config get-value project 2>/dev/null)
  if [ -n "$ACCOUNT" ] && [ -n "$PROJECT" ]; then
    NEXUS_AVAILABLE="true"
    NEXUS_INDICATORS+=("gcloud authenticated as $ACCOUNT, project=$PROJECT")
  fi
fi

# 2. Explicit Nexus env vars
if [ -n "${NEXUS_GCP_PROJECT:-}" ] || [ -n "${NEXUS_DEPLOY:-}" ]; then
  NEXUS_AVAILABLE="true"
  NEXUS_INDICATORS+=("NEXUS_GCP_PROJECT=${NEXUS_GCP_PROJECT:-} NEXUS_DEPLOY=${NEXUS_DEPLOY:-}")
fi

# 3. Nexus config file
if [ -f .nexus.config.json ] || [ -f /etc/nexus/config.json ]; then
  NEXUS_AVAILABLE="true"
  NEXUS_INDICATORS+=("Nexus config file present")
fi

# 4. nexus CLI itself
if command -v nexus >/dev/null 2>&1; then
  NEXUS_AVAILABLE="true"
  NEXUS_INDICATORS+=("nexus CLI installed: $(nexus --version 2>/dev/null || echo 'unknown')")
fi

# Override mode if explicitly forced
case "${MODE:-auto}" in
  nexus) NEXUS_AVAILABLE="true";  NEXUS_INDICATORS+=("forced via --mode nexus") ;;
  local) NEXUS_AVAILABLE="false"; NEXUS_INDICATORS+=("forced via --mode local") ;;
esac

echo "Nexus available: $NEXUS_AVAILABLE"
printf '  %s\n' "${NEXUS_INDICATORS[@]}"
```

### Step 3: Pre-deploy checklist (per `methodology.md` §2)

Run these BEFORE any deploy attempt, both paths share this:

1. **Re-run drift checks:** `node .claude/skills/sync-docs/check-docs-sync.mjs --root ./app`: must be zero drift.
2. **Re-run blueteam:** `node .claude/security/blueteam/scripts/security-pipeline.js --repo-root ./app --all`: must be zero criticals.
3. **Re-run non-live redteam scans:** re-emit the four scanner JSONs into `app/.ai/data/redteam-static/` (semgrep, osv, trufflehog, iac if applicable) and re-run the code-analysis agent. Then `node .claude/scripts/check-redteam-static.mjs --root .`: must be zero unanswered HIGH/CRITICAL. Catches regressions introduced between phase 5 sign-off and deploy (dependency bumps, last-minute hotfixes, infra tweaks). Live phases (recon + PoC) are still out of scope at this checklist, they run post-deploy / pre-cutover against the actual deployed URL.
4. **Verify build artifacts:** `cd ./app && npm run build` (frontend bundle + backend dist): must succeed.
5. **Verify migrations are idempotent:** apply them twice in a row to a scratch database; second run must be a no-op (zero rows changed).
6. **Inventory secrets:** every `process.env.X` in the backend must be declared in the deploy environment (Nexus secrets / GCP Secret Manager / local `.env`).
7. **Verify health probe:** the app's `/health/live` and `/health/ready` endpoints respond correctly to local smoke before deploy.

If any check fails, stop with a specific cause and report to the user. Do not paper over.

### Step 4: Execute deploy (Nexus path OR local Docker path)

```bash
if [ "$NEXUS_AVAILABLE" = "true" ]; then
  # ---- NEXUS / GCP CLOUD RUN PATH ----
  # See methodology §3 for the full sequence.

  SHORT_ID=$(git -C app rev-parse --short HEAD)
  IMAGE="gcr.io/${NEXUS_GCP_PROJECT:-$(gcloud config get-value project)}/app-${SHORT_ID}:${SHORT_ID}"
  SVC_NAME="app-${SHORT_ID}"

  # 1. Build + push
  gcloud builds submit --tag "$IMAGE" ./app

  # 2. Run migrations as a one-shot job
  gcloud run jobs create "${SVC_NAME}-migrate" \
    --image "$IMAGE" \
    --command npm,run,db:migrate \
    --region "${NEXUS_GCP_REGION:-us-central1}" \
    --set-env-vars "DATABASE_URL=${DATABASE_URL}" \
    || gcloud run jobs update "${SVC_NAME}-migrate" --image "$IMAGE"
  gcloud run jobs execute "${SVC_NAME}-migrate" --region "${NEXUS_GCP_REGION:-us-central1}" --wait

  # 3. Deploy the service
  gcloud run deploy "$SVC_NAME" \
    --image "$IMAGE" \
    --region "${NEXUS_GCP_REGION:-us-central1}" \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars "$(grep -v '^#' ./app/.env.production | tr '\n' ',' | sed 's/,$//')"

  DEPLOY_URL=$(gcloud run services describe "$SVC_NAME" \
    --region "${NEXUS_GCP_REGION:-us-central1}" --format='value(status.url)')

else
  # ---- LOCAL DOCKER PATH ----
  # See methodology §4 for the full sequence.

  SHORT_ID=$(git -C app rev-parse --short HEAD)
  TAG="app-${SHORT_ID}:${SHORT_ID}"

  # 1. Build the image
  docker build -t "$TAG" ./app

  # 2. Run migrations against the configured DATABASE_URL
  docker run --rm --env-file ./app/.env "$TAG" npm run db:migrate

  # 3. Launch locally
  docker run -d --name "app-${SHORT_ID}" -p 3001:3001 --env-file ./app/.env "$TAG"

  DEPLOY_URL="http://localhost:3001"

  # 4. Build the handoff package: for a human to deploy to real prod
  mkdir -p ./phases/phase8-deployment/output/handoff
  cp ./app/Dockerfile          ./phases/phase8-deployment/output/handoff/
  cp -r ./app/server/migrations ./phases/phase8-deployment/output/handoff/
  cp ./app/.env.example        ./phases/phase8-deployment/output/handoff/
  echo "Image tag: $TAG" > ./phases/phase8-deployment/output/handoff/IMAGE.txt
  echo "Build instructions in runbook.md" > ./phases/phase8-deployment/output/handoff/README.txt
  tar czf ./phases/phase8-deployment/output/handoff.tar.gz -C ./phases/phase8-deployment/output handoff
fi

echo "Deploy target: $DEPLOY_URL"
```

### Step 5: Post-deploy smoke + monitoring

```bash
# Smoke test
curl -fsS "$DEPLOY_URL/health/live"  || { echo "liveness fail"; exit 1; }
curl -fsS "$DEPLOY_URL/health/ready" || { echo "readiness fail"; exit 1; }

# Hit one real endpoint to confirm DB connectivity
curl -fsS "$DEPLOY_URL/api/v1/_meta/sync" || { echo "meta endpoint fail"; exit 1; }

# Verify monitoring/alerting (Nexus path) or document local-monitoring stub
if [ "$NEXUS_AVAILABLE" = "true" ]; then
  gcloud run services describe "$SVC_NAME" \
    --region "${NEXUS_GCP_REGION:-us-central1}" --format=json > ./phases/phase8-deployment/output/cloud-run-state.json
fi
```

### Step 6: Produce `runbook.md` + `release-notes.md`

Per `methodology.md` §5, write both to
`./phases/phase8-deployment/output/` with structure matching
`output-template.md` (runbook) and `output-template-release.md` (release
notes).

### Step 7: Gate check

```bash
node .claude/scripts/check-step-gates.mjs phase8-deployment
```

### Step 8: Report to user

Summarize:
- Deploy mode (Nexus/GCP or local Docker)
- Indicators that triggered the mode
- Migrations applied (count + idempotency confirmation)
- Smoke test results
- Live URL
- Monitoring + alerting status
- Local-path: handoff package location for human to push to real prod
- Open questions (e.g., domain mapping, certs, on-call rotation if not yet set up)

---

## What this skill should NOT do

- Don't deploy with unsatisfied conditional-pass conditions from `/phase7-user-acceptance`. Hard-block.
- Don't skip migrations. Both paths run them; both paths verify they're idempotent.
- Don't deploy with sync-docs drift, blueteam criticals, or unanswered redteam-static HIGH/CRITICAL. Re-run all three before deploy.
- Don't fabricate a "Nexus" path if the indicators don't show it. Local Docker + handoff is a legitimate completion, don't pretend cloud worked.
- Don't skip the smoke test. A green deploy that doesn't respond is a worse failure than a red deploy.
- Don't delete migrations or rename them, they're the audit trail. New work means a new NNN_*.sql file.
