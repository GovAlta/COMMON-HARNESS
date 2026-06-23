---
name: phase5-development
description: "Phase 5 of the build lifecycle. Build production code. DELEGATES scaffolding to /build (template-first, never from scratch). Then executes the plan's milestones, follows guides 01-08 in order, applies all standards continuously, runs /sync-docs after each feature, runs /blueteam AND the non-live (static) phases of /redteam before declaring done. Hard-blocks if architecture.md is missing OR ./app/ has not been scaffolded. Usage: /phase5-development [--module moduleName] [--milestone M1|M2|M3|M4]"
user-invocable: true
---

# /phase5-development: Phase 5: Development

Build production code. **This skill is template-first by hard rule**: it
delegates scaffolding to `/build`, then orchestrates the post-scaffold
work: executing the plan's milestones, following guides in order, applying
standards continuously, running drift checks after every feature, and
gating "done" on BOTH `/blueteam` clearing critical findings AND the
non-live (static / pre-publication) phases of `/redteam` clearing
HIGH/CRITICAL findings against `./app/`.

Output: production code under `./app/` plus
`./phases/phase5-development/output/development-report.md`.

## Arguments

- `--module moduleName`: (optional) Scope to a single module's milestones.
- `--milestone <M1|M2|M3|M4>`: (optional) Resume on a specific milestone instead of the next pending one.

## Hard-blocks

This skill refuses to proceed when:
- `./phases/phase3-architecture/output/architecture.md` is missing. Run
  `/phase3-architecture` first.
- `./app/` does not exist OR appears unscaffolded (no `package.json`).

The `./app/` block is the template-enforcement gate, if there's no scaffold, the user is told to run `/build` first. **Do not silently scaffold or write code from scratch.** That violates the harness's #1 rule.

---

## Execution Steps

### Step 0: Load context

1. Load methodology: `.claude/skills/phase5-development/methodology.md`
2. Load standards (re-read on each milestone, they apply continuously):
   - `.claude/standards/01-architecture.md`
   - `.claude/standards/02-security.md`
   - `.claude/standards/03-coding-conventions.md`
   - `.claude/standards/04-testing.md`
   - `.claude/standards/05-accessibility.md`
   - `.claude/standards/06-pwa.md` (only if NFR-PWA is must/should)
3. Identify the relevant guides to load per milestone (see methodology §2.2 for the milestone → guide map).
4. Create the output directory if it does not exist:

```bash
mkdir -p ./phases/phase5-development/output
```

### Step 1: Verify upstream deliverable

```bash
if [ ! -f ./phases/phase3-architecture/output/architecture.md ]; then
  echo "/phase5-development hard-block: ./phases/phase3-architecture/output/architecture.md missing. Run /phase3-architecture first." >&2
  exit 1
fi
```

Also read `./phases/phase2-planning/output/plan.md` if present, milestone
breakdowns + estimates feed milestone execution.

### Step 2: Template enforcement (HARD-BLOCK if `./app/` not scaffolded)

```bash
if [ ! -f ./app/package.json ]; then
  echo "/phase5-development hard-block: ./app/ has not been scaffolded. Run /build first." >&2
  echo "Example: /build fullstack using public/client and public/server." >&2
  echo "The template choice MUST come from architecture.md §3.7 Tech Stack; never scaffold by hand." >&2
  exit 1
fi
```

If `./app/` exists, verify it matches the architecture's chosen template:
- Read `./phases/phase3-architecture/output/architecture.md §3.7 Tech Stack`: note which `template/` paths it cites.
- Compare to `./app/package.json` and structure. If they diverge sharply: stop and ask whether to re-scaffold or realign architecture.

### Step 3: Execute milestones (per `methodology.md`)

Follow Phase 2 of the methodology. Briefly:

1. **Identify the active milestone**: `--milestone` flag if passed, else the next pending milestone in `plan.md` whose tasks have not been demoably completed.
2. **For each task in the milestone (in dependency order):**
   - Load the relevant guide(s): see methodology §2.2 for the milestone → guide map.
   - Apply the relevant standards continuously.
   - Implement (parameterized SQL only; httpOnly cookies only; standards-compliant).
   - Write the test(s) per `04-testing.md` coverage targets.
   - Run `/sync-docs` to confirm no drift in README / openapi.yaml / CLAUDE.md.
   - Commit (atomic, message references the FR/NFR ID being implemented).
3. **At end of milestone:** run `/blueteam` (or at minimum `node .claude/security/blueteam/scripts/security-pipeline.js --all`). Critical findings BLOCK the milestone from being marked complete.
4. **After `/blueteam` clears,** run the **non-live (pre-publication) phases of `/redteam`** against `./app/`. The app has not been published yet, so the live-target phases (recon + PoC execution) are out of scope here, they belong post-deploy / pre-prod-cutover. The in-scope static phases are:
   - **SAST** (`skills/07-sast-analysis-agent.md`): `mkdir -p app/.ai/data/redteam-static && node .claude/security/redteam/scripts/semgrep_scan.js ./app > app/.ai/data/redteam-static/semgrep.json`
   - **Dependency / SCA** (`skills/05-dependency-analysis-agent.md`): `node .claude/security/redteam/scripts/osv_scan.js ./app > app/.ai/data/redteam-static/osv.json`
   - **Secrets** (`skills/08-secrets-detection-agent.md`): `node .claude/security/redteam/scripts/trufflehog_scan.js ./app > app/.ai/data/redteam-static/trufflehog.json` (includes git history)
   - **Infrastructure / IaC** (`skills/06-infrastructure-analysis-agent.md`): only if `./app/` has a Dockerfile or `infra/` / `k8s/` / `terraform/` dir. Run checkov / hadolint / kics over those files, normalize to `{findings:[{severity,rule,file}]}`, save to `app/.ai/data/redteam-static/iac.json`. (Auto-skipped by the gate when there's nothing to scan.)
   - **Code Analysis** (`skills/02-code-analysis-agent.md`): security-relevant architectural review of `./app/` source. Invoke the agent: `cd .claude/security/redteam && node pipeline/claude_sdk.js ../../../app --agents code-analysis --identifier phase5_<module-short-id>`. Deliverable lands at `.claude/security/redteam/deliverables/code_analysis_deliverable_phase5_<id>.json`.
   The four scanner outputs MUST be saved at `app/.ai/data/redteam-static/{semgrep,osv,trufflehog,iac}.json`: that's the path the `check-redteam-static.mjs` gate reads. Each file's mtime must be newer than the newest source file under `./app/` (excluding `node_modules`, `dist`, `.ai`, etc.): the gate fails if a scan predates the latest code change.
   Then optionally run the recommendation agent (`skills/04-recommendation-agent.md`) over the resulting deliverables to produce a remediation list.
   **Findings of severity HIGH or CRITICAL BLOCK the milestone.** Acceptable responses:
   - Fix the code, re-run the failing scanner, confirm clear.
   - Formally re-plan per rule #10 (downgrade an FR in `requirements.md` → re-run `/phase2-planning`) if the finding is structural and the scope must shrink.
   - File a `// RISK_ACCEPTED: RA-NNN` per `security/blueteam/RISK_ACCEPTANCE_GUIDE.md` for non-Critical findings that have a documented, time-bound mitigation. CRITICAL findings cannot be risk-accepted at phase 5; they must be fixed.
   Silent deferral (marking a HIGH "won't fix" inline in `development-report.md`) is forbidden , `check-step-gates.mjs` will fail.

### Step 4: Produce `development-report.md`

Per Phase 3 of the methodology, write to
`./phases/phase5-development/output/development-report.md` with structure matching `output-template.md`.

The report's most important sections:
- **§3.1 Milestone Status**: what's complete, in-progress, blocked.
- **§3.5 Test Coverage**: backend %, frontend % (must meet `04-testing.md` targets).
- **§3.6 Standards Compliance**: checklist; non-pass entries cite a SPECIFIC follow-up step + timeline (rule #10 forbids silent "deferred").
- **§3.7 sync-docs Final Report**: must be zero drift before submitting.
- **§3.8 blueteam Final Report**: must be zero criticals before submitting.
- **§3.9 redteam (non-live / pre-publication) Final Report**: must be zero HIGH or CRITICAL findings across code-analysis/SAST/dependency/secrets/IaC scans. Link the deliverables under `.claude/security/redteam/deliverables/` and the HTML reports generated from them. Note any RISK_ACCEPTED items with their RA-NNN IDs.

### Step 5: Gate check (MECHANICAL: DO NOT SKIP)

```bash
node .claude/scripts/check-step-gates.mjs phase5-development
```

This runs every mandatory gate:
- `check-fr-coverage.mjs`: every must-have FR has code citations
- `check-nfr-coverage.mjs`: every NFR has implementation evidence
- `check-docs-sync.mjs`: zero drift between code and docs
- `check-migration-idempotency.mjs`: migrations re-runnable without side effects
- `check-blueteam-pipeline.mjs`: blueteam scan ran and has zero CRITICAL findings
- `check-redteam-static.mjs`: non-live redteam scans (SAST / dependency / secrets / IaC under `app/.ai/data/redteam-static/`, plus the code-analysis agent deliverable under `.claude/security/redteam/deliverables/`) all ran AFTER the most recent source change, parsed cleanly, and have zero HIGH/CRITICAL findings (HIGH may be risk-accepted via `app/.ai/data/risk_acceptances.json`; CRITICAL cannot).
- `validate-step-output.mjs`: development-report.md structurally valid

**If any gate fails, the phase cannot advance.** This is rule #11 (mechanical, not aspirational). The acceptable responses to a gate failure are:
1. **Build the missing piece** (write the code, write the test, update openapi.yaml).
2. **Formally re-plan**: downgrade the FR/NFR in `requirements.md` (must → should/wont), re-run `/phase2-planning` to update the plan, and re-attempt `/phase5-development`.
3. **Stop and ask the user** with a specific message naming what's blocking.

What is NOT acceptable: marking the FR/NFR "deferred" in development-report.md and proceeding anyway. That's silent deferral, the harness's most common failure mode and the one rule #10 + `check-no-silent-deferral.mjs` exist to catch.

### Step 6: Report to user

Summarize:
- Active template (which `template/` was used; whether stack matches architecture)
- Milestones completed vs deferred
- FRs/tasks closed (count)
- Backend + frontend test coverage
- Standards compliance status (per standard, pass/deferred)
- sync-docs status (must be zero drift)
- blueteam status (must be zero criticals)
- redteam (non-live) status, code-analysis / SAST / dependency / secrets / IaC; must be zero HIGH+CRITICAL (or all such findings risk-accepted with RA-NNN). Live phases (recon + PoC) are intentionally deferred to post-deploy.
- Any architecture revisions that landed during development (vs from `/phase4-prototyping`)
- Open questions for `/phase6-user-testing`

---

## What this skill should NOT do

- **Do not scaffold by hand.** Ever. If `./app/` is missing: hard-block and ask the user to run `/build`. The template-first rule is the harness's foundation, breaking it here breaks everything that depends on it (sync-docs, blueteam scans, guide alignment).
- Do not skip `/sync-docs` after each feature. Drift compounds; catching it later costs 10x.
- Do not skip `/blueteam` before declaring done. Critical findings late in development become production incidents.
- Do not skip the non-live `/redteam` static phases (code-analysis/SAST/dependency/secrets/IaC) before declaring done. They run against `./app/` source, no live target required, and catch a different class of vulnerability than blueteam (offensive attacker perspective vs. ASVS controls coverage). The live phases (recon + PoC) are correctly out of scope at phase 5 because nothing has been published yet; they belong to a post-deploy pre-cutover validation.
- Do not silently change the tech stack from what `architecture.md` cited. If the stack needs to change, raise it as a send-back to `/phase3-architecture`.
- Do not commit code that fails lint, type-check, or tests. The pre-commit hooks should catch this; if they don't, fix the hooks first.
- Do not declare the step complete with TODOs in critical paths. TODOs in non-critical paths are fine if documented in §3.6 Outstanding TODOs.
