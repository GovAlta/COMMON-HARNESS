---
name: phase1-requirements
description: "Phase 1 of the build lifecycle. Read every input under ./phases/phase1-requirements/inputs/, classify and analyze each document, and produce a structured FR/NFR/module-decomposition deliverable at ./phases/phase1-requirements/output/requirements.md. Usage: /phase1-requirements [--module moduleName]"
user-invocable: true
---

# /phase1-requirements: Phase 1: Requirements

Read every requirements-relevant document the user has dropped under
`./phases/phase1-requirements/inputs/`, classify and analyze each one, then
produce a structured functional and non-functional requirements document
with module decomposition.

Output: `./phases/phase1-requirements/output/requirements.md`.

## Arguments

- `--module moduleName`: (optional) Scope to a single module. Produces
  `./phases/phase1-requirements/output/modules/<moduleName>-requirements.md`
  in addition to (or instead of) the project-level file.

## Hard-blocks

This skill refuses to proceed when:
- `./phases/phase1-requirements/inputs/` is empty or missing. Drop briefs,
  RFPs, user stories, transcripts, or meeting notes there and re-invoke.

Phase 1 has no upstream phase to depend on, so the only hard-block is the
input corpus itself.

---

## Execution Steps

### Step 0: Load context

1. Load methodology: `.claude/skills/phase1-requirements/methodology.md`
2. Load architectural patterns: `.claude/standards/07-architectural-patterns.md`
3. Confirm the inputs directory exists and is non-empty:

```bash
mkdir -p ./phases/phase1-requirements/inputs \
         ./phases/phase1-requirements/output \
         ./phases/phase1-requirements/output/modules

if [ -z "$(ls -A ./phases/phase1-requirements/inputs 2>/dev/null)" ]; then
  echo "phase1-requirements: no input files. Drop briefs/RFPs/user stories under ./phases/phase1-requirements/inputs/ and re-invoke." >&2
  exit 1
fi
```

### Step 1: Analyze (per `methodology.md`)

Follow Phase 2 of the methodology:

1. **Read every file** under `./phases/phase1-requirements/inputs/`.
2. **Classify each document** (`business_case | user_stories | meeting_notes | technical_brief | regulatory | scope_statement | other`).
3. **Extract from each:**
   - Stakeholders and their concerns
   - Business objectives and success criteria
   - Feature requests and user stories
   - Constraints (budget, timeline, regulatory, technical)
   - Assumptions that need validation
   - Contradictions between documents
4. **Determine the application profile:**
   - Select architectural pattern (Simple / BFF / Enterprise) per `07-architectural-patterns.md`
   - Identify hosting platform
   - Identify SSO requirements (public vs internal)
   - Identify external platform integrations needed

### Step 2: Produce `requirements.md`

Follow Phase 3 of the methodology, writing to
`./phases/phase1-requirements/output/requirements.md` with structure matching
`output-template.md` (the validator script
`.claude/scripts/validate-step-output.mjs phase1-requirements ...`
enforces this).

**All default NFRs from `.claude/standards/` must be included.** Add
project-specific NFRs on top.

**External Dependencies section is MANDATORY.** Enumerate every external
dependency that blocks any must-have FR, identity providers for SSO,
source-control hosts for code commits, third-party API keys, hosting
environment access, signed legal agreements, anything outside the
engineer's control. Each row needs `Status: confirmed | unconfirmed |
pending | blocked`. Unconfirmed deps block `/phase2-planning`. Surfacing
them here is preventative, every blocker that surfaces mid-build costs
weeks.

### Step 3: Module-level requirements (only if `--module` specified)

If working at the module level:

1. Load the master project requirements from `./phases/phase1-requirements/output/requirements.md` (if present).
2. Filter to the FRs mapped to this module.
3. Expand each FR with detailed acceptance criteria, edge cases, UI/UX specifics.
4. Add module-specific NFRs.
5. Write to `./phases/phase1-requirements/output/modules/<module-name>-requirements.md`.

### Step 4: Gate check

Run the phase's mandatory gates:

```bash
node .claude/scripts/check-step-gates.mjs phase1-requirements
```

This executes:
- `check-external-deps.mjs`: every external dependency must have a row in §External Dependencies; unconfirmed deps block the next phase.
- `validate-step-output.mjs phase1-requirements`: output structure correct.

If either gate fails, the next phase cannot proceed. Fix the gap or formally adjust scope; do not paper over.

### Step 5: Report to user

Summarize:
- Number of source documents read and classified (by category).
- Architectural pattern selected and why.
- FR count by MoSCoW priority + NFR count by category.
- Recommended module decomposition (count + names).
- Open questions that need human input before `/phase2-planning`.
- Risks and contradictions found between source documents.

---

## What this skill should NOT do

- Don't invent FRs that aren't traceable to source material. Every FR must cite its source document in the Appendix.
- Don't skip default NFRs from the standards. They're not optional.
- Don't decide implementation specifics, that's `/phase3-architecture`.
- Don't propose milestones or task estimates, that's `/phase2-planning`.
