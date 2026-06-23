---
name: phase4-prototyping
description: "Phase 4 of the build lifecycle. Build a thin end-to-end tracer-bullet slice that validates the architecture's headline assumptions BEFORE committing the full plan to them. Hard-blocks if architecture.md is missing. Produces a working prototype + prototype-report.md (validations confirmed, assumptions falsified, performance baseline, architecture revisions proposed). Usage: /phase4-prototyping [--module moduleName]"
user-invocable: true
---

# /phase4-prototyping: Phase 4: Prototyping

Build the **riskiest end-to-end slice** of the system, the tracer bullet.
to confirm or invalidate the architecture's headline assumptions before
committing the rest of the plan to them. Cuts allowed: no styling polish,
mocked external services, partial error handling, single happy path. The
prototype is throwaway-grade; the *learnings* are what matter.

Output: `./phases/phase4-prototyping/output/prototype-report.md` plus the
prototype code itself in `./app/` (scaffolded via `/build`).

## Arguments

- `--module moduleName`: (optional) Scope to a single module's riskiest
  assumption.

## Hard-blocks

This skill refuses to proceed when:
- `./phases/phase3-architecture/output/architecture.md` is missing. Run
  `/phase3-architecture` first.

Do not pretend an architecture exists when it doesn't.

---

## Execution Steps

### Step 0: Load context

1. Load methodology: `.claude/skills/phase4-prototyping/methodology.md`
2. Load architectural patterns: `.claude/standards/07-architectural-patterns.md` (the prototype must match the chosen pattern)
3. Inspect `template/` to know what's available for scaffolding the slice (the prototype uses templates too, never from scratch).
4. Create the output directory if it does not exist:

```bash
mkdir -p ./phases/phase4-prototyping/output
```

### Step 1: Verify upstream deliverable

```bash
if [ ! -f ./phases/phase3-architecture/output/architecture.md ]; then
  echo "/phase4-prototyping hard-block: ./phases/phase3-architecture/output/architecture.md missing. Run /phase3-architecture first." >&2
  exit 1
fi
```

Pull any ADRs into context too, they document the assumptions you're about to validate:

```bash
ls ./phases/phase3-architecture/output/adrs/*.md 2>/dev/null
```

### Step 2: Scope the tracer bullet (per `methodology.md`)

Read `./phases/phase3-architecture/output/architecture.md`. From its §6
Handoff Notes, identify:

1. **The riskiest architectural assumption**: the one whose failure would force the most rework. Examples: "the integration with GitHub PAT injection works end-to-end," "Postgres BYTEA scales to our file-size requirements," "third-party web components survive Shadow DOM CSP nesting."
2. **The thinnest end-to-end slice** that exercises that assumption, auth → one CRUD → one integration touchpoint.
3. **Explicit cuts**: what the prototype WILL NOT include (no styling, no error UX, no edge-case validation, mocked email, etc.).

Write these to a scope summary (one paragraph) before writing any code. A human reviewer should be able to read the scope summary and say "yes, that's the assumption we need to validate."

### Step 3: Build the slice

1. **If `./app/` doesn't exist yet, run `/build`** to scaffold from `template/`. Pick the minimal template combination needed (e.g. `frontend using public/client and backend using public/server`). Never write a prototype from scratch.
2. **Strip everything you don't need** for the tracer bullet. Delete extra controllers, routes, components, migrations.
3. **Implement the slice end-to-end.** Auth (real or stubbed), one CRUD path, one integration touchpoint. Wire it through, click-test the happy path.
4. **Capture a performance baseline** while you're there: bundle size, startup time, first-meaningful-paint, p95 of one API call. These numbers feed `prototype-report.md` §6.
5. **Document what you mocked vs what's real.** Critical: if the integration was mocked, the prototype DID NOT validate it. Be explicit.
6. **Commit the prototype branch** with a clear message referencing the assumption being validated (e.g. `feat(prototype): tracer-bullet slice for <assumption>`).

### Step 4: Produce `prototype-report.md`

Follow Phase 3 of the methodology, writing to
`./phases/phase4-prototyping/output/prototype-report.md` with structure matching
`output-template.md` (validator:
`.claude/scripts/validate-step-output.mjs phase4-prototyping ...`).

The report's MOST IMPORTANT sections:

- **§3.3 Validations Confirmed**: what the prototype proved works as architected.
- **§3.4 Assumptions Falsified**: what the prototype proved DOESN'T work as architected. (If empty, that's a soft-warning sign: either the architecture holds up under load or the prototype wasn't ambitious enough.)
- **§3.6 Architecture Revisions Proposed**: concrete edits to `architecture.md` the human reviewer should approve before `/phase5-development` starts. May trigger a send-back to `/phase3-architecture`.

### Step 5: Gate check

```bash
node .claude/scripts/check-step-gates.mjs phase4-prototyping
```

This executes:
- `validate-step-output.mjs phase4-prototyping`: output structure correct.

If the gate fails, fix the gap; do not paper over.

### Step 6: Report to user

Summarize:
- Riskiest assumption validated (one sentence)
- Cut list (what was deliberately excluded)
- Validations confirmed (count + 1-line each)
- Assumptions falsified (count + 1-line each, these are the important ones)
- Performance baseline numbers
- Architecture revisions proposed (count + whether they need `/phase3-architecture` send-back or fit as inline edits)
- Open questions for the human reviewer before `/phase5-development`

---

## What this skill should NOT do

- Don't write a "prototype" that's actually production code. The cuts are the point, if you're polishing styles or handling every edge case, you're not validating the assumption faster.
- Don't validate every assumption, pick the riskiest. Validate-everything is `/phase5-development`.
- Don't skip the cuts list. A prototype without explicit cuts becomes "the implementation" and skips the planning honesty of `/phase5-development`.
- Don't hide failures. Falsified assumptions are the prototype's most valuable output, they protect the project from spending weeks down the wrong road.
- Don't skip `/build` and write code from scratch. Even the prototype starts from `template/`.
