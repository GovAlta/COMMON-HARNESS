# Output template, development-report.md

Read by `validate-step-output.mjs`. Assertions: `## REQUIRED:`, `## OPTIONAL:`, `## TABLE:`, `## MERMAID:`.

## REQUIRED: Executive Summary
## REQUIRED: Inputs Consumed
## REQUIRED: Milestone Status
## REQUIRED: Tech Stack Realized
## REQUIRED: FRs and NFRs Closed
## REQUIRED: Commits Reference
## REQUIRED: Test Coverage
## REQUIRED: Standards Compliance
## REQUIRED: sync-docs Final Report
## REQUIRED: blueteam Final Report
## REQUIRED: Outstanding TODOs
## REQUIRED: Performance Metrics
## REQUIRED: Compliance and Standards
## REQUIRED: Open Questions
## REQUIRED: Handoff Notes
## REQUIRED: Appendix

## TABLE: Milestone Status
## TABLE: Tech Stack Realized
## TABLE: FRs and NFRs Closed
## TABLE: Standards Compliance
## TABLE: blueteam Final Report
## TABLE: Performance Metrics
## TABLE: Appendix

The Tech Stack Realized table MUST cite the architecture.md template path each component matches, OR document the divergence with an accepted ADR/revision reference.

The Standards Compliance table MUST list each standard from `.claude/standards/` with a status. Non-pass entries MUST cite a remediation plan with a SPECIFIC follow-up step name and timeline; silent "deferred" is forbidden per harness rule #10.

The sync-docs Final Report MUST contain "no drift detected" verbatim. If it doesn't, this step is incomplete.

The blueteam Final Report MUST show zero Critical findings. Highs are allowed only if they're risk-accepted per `.claude/security/blueteam/RISK_ACCEPTANCE_GUIDE.md` (inline `// RISK_ACCEPTED: RA-NNN` annotations + entries in `.ai/data/risk_acceptances.json`). **A "blueteam not run" row is a step-incomplete signal, not a "deferred" status.**

The Test Coverage section MUST cite backend lines/branches/functions/statements percentages AND frontend equivalents. Targets per `04-testing.md`: backend ≥80%, frontend ≥70%. **"Not measured" is forbidden**: if tests don't exist, write them; if they do, run coverage.

The **FRs and NFRs Closed** table, its `Status` column is restricted to: `complete`, `deferred-to-/phase6-user-testing`, `deferred-to-/phase8-deployment`, or `scope-cut-via-re-plan`. **`deferred` for a must-have FR/NFR is INVALID.** If a must-have cannot ship in /phase5-development, the project must formally re-plan: downgrade the FR/NFR in `requirements.md` (must → should/wont) AND re-run /phase2-planning. The `check-fr-coverage.mjs` and `check-nfr-coverage.mjs` scripts mechanically enforce this , `/phase5-development` cannot advance the board if any must-have lacks code citations or NFR evidence.
