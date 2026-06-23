# Output template: plan.md

Read by `validate-step-output.mjs`. Assertions: `## REQUIRED:`, `## OPTIONAL:`, `## TABLE:`, `## MERMAID:`.

## REQUIRED: Executive Summary
## REQUIRED: Inputs Consumed
## REQUIRED: Roadmap
## REQUIRED: Task Breakdown
## REQUIRED: Dependency Graph
## REQUIRED: Estimation Summary
## REQUIRED: Critical Path
## REQUIRED: Resource Plan
## REQUIRED: NFR Coverage Map
## REQUIRED: Compliance and Standards
## REQUIRED: Open Questions
## REQUIRED: Handoff Notes
## REQUIRED: Appendix

## TABLE: Roadmap
## TABLE: Task Breakdown
## TABLE: Estimation Summary
## TABLE: NFR Coverage Map
## TABLE: Appendix
## MERMAID: Dependency Graph

The Roadmap MUST be a table with at least: Milestone, Scope summary, Demo statement, Target window, FRs covered.

The Task Breakdown MUST be a table with at least: Task ID, Milestone, FR/NFR, Description, Owner, Estimate (d), Depends on, Risk.

The Dependency Graph MUST contain a ```mermaid block.

The Critical Path section MUST list the total length in days AND list the tasks on the path in order.

The NFR Coverage Map MUST be a table with at least: NFR ID, Title, Task IDs covering it, Coverage status. NFRs with zero tasks must be flagged as GAPs and also appear in Open Questions.
