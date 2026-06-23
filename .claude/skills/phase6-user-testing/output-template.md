# Output template: test-plan.md (Phase A) and test-results.md (Phase B)

Read by `validate-step-output.mjs`. Assertions: `## REQUIRED:`, `## OPTIONAL:`, `## TABLE:`, `## MERMAID:`.

This template covers the Phase A artifact (test-plan.md), which is the primary
deliverable that advances the board to `human_review` (from the prior
`ai_working` state). Phase B (test-results.md) is captured separately and
validated against `output-template-results.md` in the same directory.

## REQUIRED: Executive Summary
## REQUIRED: Inputs Consumed
## REQUIRED: Test Scope
## REQUIRED: Personas
## REQUIRED: Manual Test Scripts
## REQUIRED: Automated Test Suite
## REQUIRED: NFR Validation Plan
## REQUIRED: Test Environment
## REQUIRED: Issue Severity Rubric
## REQUIRED: Compliance and Standards
## REQUIRED: Open Questions
## REQUIRED: Handoff Notes
## REQUIRED: Appendix

## TABLE: Test Scope
## TABLE: Personas
## TABLE: Manual Test Scripts
## TABLE: Automated Test Suite
## TABLE: NFR Validation Plan
## TABLE: Issue Severity Rubric
## TABLE: Appendix

The Manual Test Scripts table MUST list every .md file in `./app/test/manual/` with at least: File, Scenario, Persona, FRs covered, Estimated duration.

The Automated Test Suite table MUST map FR coverage with at least: FR ID, AC count, Tests (file + line range), Status. Every must-have FR must appear.

The Test Environment section MUST cite the preview URL and the test-account credential reference (a vault path; NEVER inline credentials).

The Issue Severity Rubric MUST define the three tiers (Critical / Major / Minor) with concrete examples for this project.
