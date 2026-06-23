---
name: phase7-user-acceptance
description: "Phase 7 of the build lifecycle. Stakeholder sign-off, generate FR-by-FR UAT script, demo prep, capture written approvals, build the post-launch deferral backlog. Hard-blocks if phase 6 test-results.md is missing or contains unresolved Critical issues. Usage: /phase7-user-acceptance [--module moduleName] [--phase generate|capture]"
user-invocable: true
---

# /phase7-user-acceptance: Phase 7: User Acceptance Testing

Convert the validated build into formal stakeholder sign-off. Two phases:

- **Phase A (generate)**: produce `uat-script.md`: an FR-by-FR pass/fail checklist + demo notes + a "what's deferred" deferral backlog (carrying forward majors from `/phase6-user-testing` and any agreed cuts).
- **Phase B (capture)**: once stakeholders run UAT and drop their results under `./phases/phase7-user-acceptance/inputs/`, capture their pass/fail per FR and signed approval into `sign-off.md`. Advance to `/phase8-deployment` only on full sign-off; otherwise stop and report.

Auto-detects phase based on existing artifacts. Force with `--phase generate` or `--phase capture`.

Output: `./phases/phase7-user-acceptance/output/uat-script.md` (Phase A)
and `./phases/phase7-user-acceptance/output/sign-off.md` (Phase B).

## Arguments

- `--module moduleName`: (optional) Scope to a single module.
- `--phase generate|capture`: (optional) Force the phase.

## Hard-blocks

This skill refuses to proceed when:
- `./phases/phase6-user-testing/output/test-results.md` is missing.
- `test-results.md §3.10 Decision` says `send-back` (means phase 6 didn't pass, UAT pointless).
- `test-results.md` has any unresolved Critical issues.

For Phase B specifically:
- `./phases/phase7-user-acceptance/output/uat-script.md` from Phase A must exist.
- At least one stakeholder UAT result must be present under
  `./phases/phase7-user-acceptance/inputs/`.

---

## Execution Steps

### Step 0: Load context

1. Load methodology: `.claude/skills/phase7-user-acceptance/methodology.md`
2. Load testing standard: `.claude/standards/04-testing.md`
3. Create the directories if they do not exist:

```bash
mkdir -p ./phases/phase7-user-acceptance/inputs ./phases/phase7-user-acceptance/output
```

### Step 1: Verify upstream deliverable + content checks

```bash
if [ ! -f ./phases/phase6-user-testing/output/test-results.md ]; then
  echo "/phase7-user-acceptance hard-block: ./phases/phase6-user-testing/output/test-results.md missing. Phase 6 Phase B must complete before UAT." >&2
  exit 1
fi

# No send-back decision
if grep -qE 'Decision[^|]*\|[^|]*send.back' ./phases/phase6-user-testing/output/test-results.md \
   || grep -qiE '^[-*]?\s*Decision:\s*send.back' ./phases/phase6-user-testing/output/test-results.md; then
  echo "/phase7-user-acceptance hard-block: test-results.md decision is send-back, not advance. UAT cannot start." >&2
  exit 1
fi

# No unresolved Criticals
if grep -qE 'Critical[^|]*\|[^|]*\|[^|]*\|[^|]*\|' ./phases/phase6-user-testing/output/test-results.md \
   && ! grep -qE 'Critical.*resolved' ./phases/phase6-user-testing/output/test-results.md; then
  echo "/phase7-user-acceptance hard-block: test-results.md appears to contain unresolved Critical issues. Fix in /phase5-development and re-run /phase6-user-testing." >&2
  exit 1
fi
```

Also read (for context):
- `./phases/phase1-requirements/output/requirements.md`: for the FR list.
- `./phases/phase3-architecture/output/architecture.md`: for component context.

### Step 2: Resolve phase

```bash
PHASE="${PHASE:-auto}"

if [ "$PHASE" = "auto" ]; then
  if [ -f ./phases/phase7-user-acceptance/output/uat-script.md ] \
     && [ -n "$(ls -A ./phases/phase7-user-acceptance/inputs 2>/dev/null)" ]; then
    PHASE="capture"
  else
    PHASE="generate"
  fi
fi
echo "Operating in phase: $PHASE"
```

---

## Phase A: Generate (PHASE=generate)

### Step 3A: Build the UAT script (per `methodology.md` §2)

1. **Read every must-have and should-have FR** from `./phases/phase1-requirements/output/requirements.md`.
2. **Build the FR-by-FR checklist:** one row per FR, with the AC text restated, a "demonstrate by doing" step, and pass/fail/conditional columns the stakeholder will fill.
3. **Build the deferral backlog:** carry forward every Major from `/phase6-user-testing` (must-fix-before-`/phase8-deployment`) AND every Minor (post-launch) AND any agreed scope cuts from prior phases. Stakeholder reviews and confirms the deferral list.
4. **Write the demo prep notes:** a 30-60 minute walkthrough script that exercises the 5-7 most stakeholder-relevant flows. Time-box each segment.
5. **Build the sign-off table skeleton:** rows for each stakeholder who needs to sign, with name, role, decision (approve / approve-with-conditions / reject), date, and note column.

### Step 4A: Produce `uat-script.md`

Write to `./phases/phase7-user-acceptance/output/uat-script.md` per
`output-template.md`.

### Step 5A: Gate check

```bash
node .claude/scripts/check-step-gates.mjs phase7-user-acceptance
```

Tell the human: run the UAT session, drop signed results under
`./phases/phase7-user-acceptance/inputs/`, then re-invoke
`/phase7-user-acceptance` (Phase B).

---

## Phase B: Capture (PHASE=capture)

### Step 3B: Read stakeholder UAT results

Read every file under `./phases/phase7-user-acceptance/inputs/`:
- Filled-in / marked-up copies of `uat-script.md`
- Signed approval PDFs or screenshots
- Stakeholder note files (one per signer is common)

### Step 4B: Compute outcome

For each FR row in `uat-script.md`:
- Pass / Fail / Conditional-pass

Aggregate to overall decision:
- **All pass** → advance to `/phase8-deployment`.
- **Any fail OR any conditional-pass with non-trivial condition** → either:
  - Send-back to `/phase5-development` if the failure is implementation-level (must rebuild)
  - Send-back to `/phase6-user-testing` if the failure is testing-coverage-level (need more validation)
  - Advance to `/phase8-deployment` with documented exception if stakeholder explicitly accepted the risk

### Step 5B: Produce `sign-off.md`

Write to `./phases/phase7-user-acceptance/output/sign-off.md` per
`output-template-signoff.md`. Capture:

- Per-FR outcome
- Per-stakeholder signature (name, role, decision, date)
- Conditional-pass conditions (each one becomes a phase 8 prerequisite, listed in §3.5 phase 8 Prerequisites with a satisfaction reference)
- Updated deferral backlog (anything stakeholders moved between buckets)

### Step 6B: Gate check

```bash
node .claude/scripts/check-step-gates.mjs phase7-user-acceptance
```

### Step 7: Report to user

Summarize:
- Phase executed
- FRs covered, demo flows, stakeholder count
- Outcomes: passes, fails, conditional-passes
- Deferral backlog size (must-fix-before-`/phase8-deployment` vs post-launch)
- Decision: advance, send-back-to-`/phase5-development`, or send-back-to-`/phase6-user-testing`

---

## What this skill should NOT do

- Don't UAT a build with unresolved Critical issues from `/phase6-user-testing`. Hard-block first.
- Don't fabricate stakeholder approval. If a sign-off cell is empty, the FR is not signed off.
- Don't reinterpret a "conditional-pass" as a "pass" to keep schedule. Conditions become `/phase8-deployment` prerequisites or post-launch backlog entries.
- Don't advance to `/phase8-deployment` if any required signer's row is incomplete.
- Don't deploy or scaffold, that's `/phase8-deployment` and `/build` respectively.
