---
name: phase2-planning
description: "Phase 2 of the build lifecycle. Read the requirements deliverable from ./phases/phase1-requirements/output/requirements.md, then produce a highly structured plan: roadmap, task breakdown, dependency graph, estimates, critical path, resource plan, and risks. Hard-blocks if requirements.md is missing. Usage: /phase2-planning [--module moduleName]"
user-invocable: true
---

# /phase2-planning: Phase 2: Planning

Take the requirements deliverable, decompose every functional requirement into
implementation tasks (1-3 day chunks), estimate them, sequence them via a
dependency graph, identify the critical path, and produce a roadmap of
milestones.

Output: `./phases/phase2-planning/output/plan.md`.

## Arguments

- `--module moduleName`: (optional) Scope to a single module. Reads
  `./phases/phase1-requirements/output/modules/<moduleName>-requirements.md`
  if present and writes
  `./phases/phase2-planning/output/modules/<moduleName>-plan.md`.

## Hard-blocks

This skill refuses to proceed when:
- `./phases/phase1-requirements/output/requirements.md` is missing. Run
  `/phase1-requirements` first.
- `requirements.md` has unconfirmed external dependencies (rows whose
  `Status` is not `confirmed` in §External Dependencies). Planning cannot
  proceed around silent blockers, either get the dependency confirmed or
  scope-cut the FRs that depend on it (downgrade must → should/wont and
  re-run `/phase1-requirements`).

---

## Execution Steps

### Step 0: Load context

1. Load methodology: `.claude/skills/phase2-planning/methodology.md`
2. Load architectural patterns: `.claude/standards/07-architectural-patterns.md`
3. Load testing standard: `.claude/standards/04-testing.md` (estimates must include test-coverage tasks)
4. Create the output directory if it does not exist:

```bash
mkdir -p ./phases/phase2-planning/output ./phases/phase2-planning/output/modules
```

### Step 1: Verify upstream deliverable

```bash
if [ ! -f ./phases/phase1-requirements/output/requirements.md ]; then
  echo "/phase2-planning hard-block: ./phases/phase1-requirements/output/requirements.md missing. Run /phase1-requirements first." >&2
  exit 1
fi
```

### Step 2: External-dependency hard-block

```bash
# /phase2 cannot plan around unconfirmed external dependencies. Phase 1 must have
# enumerated them in requirements.md §External Dependencies. If any row's
# status != confirmed, planning blocks here. This prevents the common
# "silent blocker becomes /phase5 surprise" pattern (a tenant that wasn't
# provisioned, an API key the sponsor forgot to issue, a hosting account that
# nobody allocated). Fix: get the dep confirmed, OR scope-cut the FR(s) the
# dep blocks (downgrade must → should/wont in requirements.md and re-run /phase1).
node .claude/scripts/check-external-deps.mjs --root . || exit 1
```

### Step 3: Analyze (per `methodology.md`)

Follow Phase 2 of `methodology.md`. Read directly from
`./phases/phase1-requirements/output/requirements.md`:

1. **Read every FR and NFR** in `requirements.md`. Build an FR/NFR catalog with IDs intact (FR-001, NFR-PERF-01, etc.): every task you create MUST cite the FR/NFR it implements.
2. **Decompose each FR into 1-3 day tasks.** A task that's >3 days is too coarse, split it. A task that's <0.5 day is noise, fold it into a parent.
3. **Classify each task by owner profile:**
   - `ai`: Claude can do this end-to-end (most coding, most docs, most boilerplate)
   - `human`: requires judgment, stakeholder access, or signing authority
   - `paired`: Claude drafts, human reviews/decides (typically architecture, security, UX)
4. **Wire dependencies.** A task depends on another if it cannot start until that one is complete. Be honest, over-declaring dependencies serializes the plan; under-declaring creates broken builds.
5. **Group into milestones.** A milestone is a coherent demonstrable slice (NOT a calendar checkpoint). Default progression: M1 = bootstrap + auth, M2 = core domain, M3 = integrations, M4 = polish + a11y + perf.
6. **Compute the critical path** through the dependency graph.
7. **Risk-load every task** as `low | medium | high`. High-risk tasks need explicit mitigation.
8. **Tally NFR coverage.** Every NFR must map to at least one task. Unmapped NFRs are gaps, call them out in §5.

### Step 4: Produce `plan.md`

Follow Phase 3 of `methodology.md`. Write to
`./phases/phase2-planning/output/plan.md` with the standard 7-section
skeleton (matches `output-template.md`):

1. Executive Summary
2. Inputs Consumed
3. **Body** (planning-specific, 7 subsections):
   - 3.1 Roadmap (milestone table with target windows + scope summary)
   - 3.2 Task Breakdown Structure (the master task table)
   - 3.3 Dependency Graph (mermaid)
   - 3.4 Estimation Summary (totals by milestone, by owner profile, by risk)
   - 3.5 Critical Path
   - 3.6 Resource Plan (AI vs human vs paired allocations)
   - 3.7 NFR Coverage Map (NFR ID → task IDs)
4. Compliance & Standards (which standards the plan respects, which are deferred to architecture)
5. Open Questions / Risks
6. Handoff Notes (what /phase3-architecture and /phase5-development will need from this plan)
7. Appendix: Source Doc Traceability

If `--module` was passed, also write
`./phases/phase2-planning/output/modules/<moduleName>-plan.md` filtered to
that module's tasks.

### Step 5: Gate check

```bash
node .claude/scripts/check-step-gates.mjs phase2-planning
```

This executes:
- `check-external-deps.mjs`: re-checks no new unconfirmed deps slipped in.
- `validate-step-output.mjs phase2-planning`: output structure correct.

If any gate fails, the next phase cannot proceed. Fix the gap or formally adjust scope; do not paper over.

### Step 6: Report to user

Summarize:
- Number of FRs/NFRs consumed
- Number of milestones, tasks, dependencies
- Critical path length (days)
- Owner-profile mix (AI / human / paired counts)
- High-risk task count and mitigation summary
- Any NFRs that remained unmapped (gaps to flag)
- Open questions for the human reviewer before `/phase3-architecture`

---

## What this skill should NOT do

- Don't propose tasks for FRs that don't exist in `requirements.md`. If you see a real gap, raise it as an Open Question and ask whether to send back to `/phase1-requirements`.
- Don't invent dependencies to make the graph look pretty, only declare a real one.
- Don't skip the NFR coverage map. NFRs left unmapped at this stage almost always become production incidents.
- Don't commit code or scaffold the project, that's `/phase5-development`.
