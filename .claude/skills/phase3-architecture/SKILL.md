---
name: phase3-architecture
description: "Phase 3 of the build lifecycle. Read requirements.md and plan.md from prior phase outputs, then produce a structured architecture deliverable: system context, components, data model, API contract, auth flow, deployment topology, tech stack (aligned with template/), ADRs, NFR-to-component mapping, and a STRIDE-lite threat model. Hard-blocks if either prior artifact is missing. Usage: /phase3-architecture [--module moduleName]"
user-invocable: true
---

# /phase3-architecture: Phase 3: Architecture

Take the requirements + plan, design the technical solution, and produce
`architecture.md` plus one ADR per major decision. Tech-stack choices must
align with what `template/` can scaffold, if you'd choose something the
template doesn't have, justify it explicitly and propose adding it to
`template/` rather than going off-piste during development.

Output: `./phases/phase3-architecture/output/architecture.md` plus one ADR
per major decision under
`./phases/phase3-architecture/output/adrs/ADR-NNN-<slug>.md`.

## Arguments

- `--module moduleName`: (optional) Scope to a single module. Reads the
  module's plan and requirements files if present; writes
  `./phases/phase3-architecture/output/modules/<moduleName>-architecture.md`.

## Hard-blocks

This skill refuses to proceed when:
- `./phases/phase1-requirements/output/requirements.md` is missing. Run
  `/phase1-requirements` first.
- `./phases/phase2-planning/output/plan.md` is missing. Run
  `/phase2-planning` first.

Do not invent a plan or requirements just to keep going.

---

## Execution Steps

### Step 0: Load context

1. Load methodology: `.claude/skills/phase3-architecture/methodology.md`
2. Load standards (read in this order, each later one overrides earlier defaults for its scope):
   - `.claude/standards/01-architecture.md` (monorepo layout, layers, health checks)
   - `.claude/standards/02-security.md` (ASVS L2, JWT, CSRF, RBAC)
   - `.claude/standards/07-architectural-patterns.md` (Simple/BFF/Enterprise, pick the same pattern selected in requirements)
   - `.claude/standards/06-pwa.md` (only if NFR-PWA is must/should)
3. **Inspect `template/` to know what's actually scaffold-able.** This bounds the tech stack:

```bash
ls -la ./template/public/client/ # frontend template (Vue 3 + PrimeVue)
ls -la ./template/public/server/ # backend template (Express + TS + Postgres)
```

The architecture's tech stack section MUST list which template directory provides which component. Anything outside the templates needs explicit justification.

4. Create the output directories if they do not exist:

```bash
mkdir -p ./phases/phase3-architecture/output \
         ./phases/phase3-architecture/output/adrs \
         ./phases/phase3-architecture/output/modules
```

### Step 1: Verify upstream deliverables

```bash
if [ ! -f ./phases/phase1-requirements/output/requirements.md ]; then
  echo "/phase3-architecture hard-block: ./phases/phase1-requirements/output/requirements.md missing. Run /phase1-requirements first." >&2
  exit 1
fi

if [ ! -f ./phases/phase2-planning/output/plan.md ]; then
  echo "/phase3-architecture hard-block: ./phases/phase2-planning/output/plan.md missing. Run /phase2-planning first." >&2
  exit 1
fi
```

### Step 2: Analyze (per `methodology.md`)

Follow Phase 2 of `methodology.md`. Read directly from
`./phases/phase1-requirements/output/requirements.md` and
`./phases/phase2-planning/output/plan.md`:

1. **Confirm pattern**: Simple, BFF, or Enterprise. Match what the requirements selected. If you'd change it, the change must be argued in §5 Open Questions before you write the rest.
2. **Decompose into components**: for each FR cluster, name the component(s) it lives in (one component MUST own each FR cluster).
3. **Design the data model**: entities, relationships, soft-delete strategy, audit columns, sequencing of migrations to match the plan's milestones.
4. **Sketch the API contract**: list every endpoint by method + path + brief purpose. This sketch is what `/phase5-development` will turn into `openapi.yaml` later. Group endpoints by component.
5. **Design the auth flow**: SSO providers, JWT lifecycle, refresh strategy, CSRF approach, session storage. Use a sequence diagram.
6. **Map deployment topology**: which services run where (container, function, VM), which talk to which, where state lives, how secrets are injected.
7. **Lock the tech stack**: for every component, name the library/runtime AND the template directory that scaffolds it. Stack outside templates needs explicit justification (and a proposed addition to `template/`).
8. **Run a STRIDE-lite threat model**: for each major component or trust boundary, list one Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege threat plus mitigation.
9. **Write one ADR per major decision**: pattern choice, data store, auth strategy, and any non-obvious library choice.
10. **Map every NFR to one or more components.** NFRs unmapped at architecture time are gaps, call them out in §5.

### Step 3: Produce `architecture.md` + ADRs

Write `./phases/phase3-architecture/output/architecture.md` with the standard 7-section skeleton (body has 10 subsections, see methodology §3). Write each ADR to `./phases/phase3-architecture/output/adrs/ADR-NNN-<slug>.md` using the ADR template in the methodology.

Structure must match `output-template.md` (the validator script
`.claude/scripts/validate-step-output.mjs phase3-architecture ...` enforces
this).

### Step 4: Gate check

```bash
node .claude/scripts/check-step-gates.mjs phase3-architecture
```

This executes:
- `check-ia-section.mjs`: Information Architecture section present.
- `validate-step-output.mjs phase3-architecture`: output structure correct.

If any gate fails, the next phase cannot proceed. Fix the gap; do not paper over.

### Step 5: Report to user

Summarize:
- Application pattern (Simple/BFF/Enterprise) and rationale
- Number of components, endpoints, entities, ADRs
- Auth strategy and session model
- Deployment target
- Stack alignment with `template/` (which template provides each component)
- High-risk threats from the STRIDE-lite pass and their mitigations
- NFR coverage gaps from §3.9 (any NFR with no component owner)
- Open questions for the human reviewer before `/phase4-prototyping`

---

## What this skill should NOT do

- Don't choose a stack `template/` can't scaffold without an explicit ADR justifying the divergence and a proposal to add it to `template/`.
- Don't design endpoints that don't trace to FRs, that's gold-plating.
- Don't skip the ADRs. "We chose Postgres" with no ADR is a future-you mystery.
- Don't write code or scaffold the project, that's `/phase4-prototyping` (validation slice) and `/phase5-development` (full build via `/build`).
- Don't hide NFR gaps in the body, surface them in §5 with proposed mitigations.
