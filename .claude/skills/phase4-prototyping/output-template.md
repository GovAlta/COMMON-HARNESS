# Output template: prototype-report.md

Read by `validate-step-output.mjs`. Assertions: `## REQUIRED:`, `## OPTIONAL:`, `## TABLE:`, `## MERMAID:`.

## REQUIRED: Executive Summary
## REQUIRED: Inputs Consumed
## REQUIRED: Tracer-Bullet Scope
## REQUIRED: Demo Walkthrough
## REQUIRED: Validations Confirmed
## REQUIRED: Assumptions Falsified
## REQUIRED: Performance Baseline
## REQUIRED: Architecture Revisions Proposed
## REQUIRED: Mock Inventory
## REQUIRED: Working Code Reference
## REQUIRED: Compliance and Standards
## REQUIRED: Open Questions
## REQUIRED: Handoff Notes
## REQUIRED: Appendix

## TABLE: Performance Baseline
## TABLE: Mock Inventory
## TABLE: Working Code Reference
## TABLE: Compliance and Standards
## TABLE: Appendix

The Performance Baseline table MUST cite at least: bundle size, cold-start time, first-meaningful-paint or equivalent, API p95 latency.

The Mock Inventory MUST list every external touchpoint with at least: Touchpoint, Real / Mocked, Validation status. Mocked items MUST flag their validation status as DEFERRED so /phase5-development picks them up.

Either Validations Confirmed OR Assumptions Falsified MUST contain at least one numbered item. A prototype with both empty failed to test anything meaningful.

Architecture Revisions Proposed MAY be empty if no revisions are needed, but the section MUST be present (its absence reads as "we forgot to look").

The **Working Code Reference** table MUST list every file the prototype CREATED OR MODIFIED in `./app/` with at least: File path, Lines added/changed, Purpose, Demo step that exercises it. **An empty table means the prototype was a paper exercise, not a tracer bullet.** Per the methodology, /v4 must produce runnable code that exercises the riskiest assumption. If no code was written, the validation is theoretical and v4's gate will fail. The "paper prototype" pattern (a doc claiming validation without runnable code) is the most common /v4 failure mode; this section is the mechanical fix that prevents it.
