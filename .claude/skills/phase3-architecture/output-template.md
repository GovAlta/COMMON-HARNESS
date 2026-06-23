# Output template: architecture.md (+ ADR files)

Read by `validate-step-output.mjs`. Assertions: `## REQUIRED:`, `## OPTIONAL:`, `## TABLE:`, `## MERMAID:`.

## REQUIRED: Executive Summary
## REQUIRED: Inputs Consumed
## REQUIRED: System Context
## REQUIRED: Component Diagram
## REQUIRED: Data Model
## REQUIRED: API Contract Sketch
## REQUIRED: Auth Flow
## REQUIRED: Deployment Topology
## REQUIRED: Tech Stack
## REQUIRED: Architectural Decision Records
## REQUIRED: NFR Coverage Map
## REQUIRED: Threat Model
## REQUIRED: Compliance and Standards
## REQUIRED: Open Questions
## REQUIRED: Handoff Notes
## REQUIRED: Appendix

## MERMAID: System Context
## MERMAID: Component Diagram
## MERMAID: Data Model
## MERMAID: Auth Flow

## TABLE: API Contract Sketch
## TABLE: Tech Stack
## TABLE: Architectural Decision Records
## TABLE: NFR Coverage Map
## TABLE: Threat Model

The Tech Stack table MUST cite a `template/` path for each component, OR reference an ADR justifying divergence.

The ADR table MUST list every ADR with at least: ID, Title, Status, Path. Each ADR is its own .md in `adrs/` next to architecture.md.

The Threat Model MUST cover at least Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege.
