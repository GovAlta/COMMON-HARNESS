# Output template, requirements.md

This file is read by `validate-step-output.mjs` to check that a generated
`requirements.md` has the structure the skill promises. Lines beginning with
`## REQUIRED:`, `## OPTIONAL:`, `## TABLE:`, or `## MERMAID:` are assertions;
everything else is documentation.

## REQUIRED: Executive Summary
## REQUIRED: Inputs Consumed
## REQUIRED: Stakeholders
## REQUIRED: Application Profile
## REQUIRED: Functional Requirements
## REQUIRED: Non-Functional Requirements
## REQUIRED: Module Decomposition
## REQUIRED: External Dependencies
## REQUIRED: Compliance and Standards
## REQUIRED: Open Questions
## REQUIRED: Handoff Notes
## REQUIRED: Appendix

## TABLE: Functional Requirements
## TABLE: Non-Functional Requirements
## TABLE: Module Decomposition
## TABLE: External Dependencies
## TABLE: Appendix

The FRs section MUST be a table with at least these columns: ID, Title, Priority (MoSCoW), Module, Acceptance Criteria.

The NFRs section MUST be a table with at least these columns: ID, Category, Target / Threshold, Source.

The Module Decomposition section MUST be a table with at least: Module, Scope summary, FRs included, Dependencies on other modules.

The Appendix MUST contain a Source Doc Traceability table mapping each FR/NFR back to its source document.

The External Dependencies table MUST list every external dependency that blocks any must-have FR with at least these columns: Dependency, Required for FR(s), Owner, Status, ETA / Confirmed. Status values: `confirmed` (good, can proceed), `unconfirmed` / `pending` / `blocked` (bad , `/phase2-planning` will hard-block via `check-external-deps.mjs`). Examples: Microsoft tenant for SSO, GitHub repo for code commits, third-party API keys, hosting environment access. **An empty table is invalid**: every project has at least the hosting environment as an external dep. Per harness rule #10, unconfirmed deps must be resolved BEFORE /phase2-planning, not silently dropped during /phase5-development.
