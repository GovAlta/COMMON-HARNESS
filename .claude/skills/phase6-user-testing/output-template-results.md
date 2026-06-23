# Output template: test-results.md (Phase B)

Read by `validate-step-output.mjs` when invoked with `--template output-template-results.md`. Assertions follow the same syntax as `output-template.md`.

This template covers the Phase B artifact (test-results.md), produced after
human testers run the manual scripts and the automated suite is re-run on the
final build.

## REQUIRED: Executive Summary
## REQUIRED: Inputs Consumed
## REQUIRED: Sessions Conducted
## REQUIRED: Task Success Rates
## REQUIRED: Issues Found
## REQUIRED: Quotes and Observations
## REQUIRED: Automated Suite Results
## REQUIRED: NFR Verification Results
## REQUIRED: Severity Rubric Calibration
## REQUIRED: Issues by Disposition
## REQUIRED: Send-back Decision
## REQUIRED: Compliance and Standards
## REQUIRED: Open Questions
## REQUIRED: Handoff Notes
## REQUIRED: Appendix

## TABLE: Sessions Conducted
## TABLE: Task Success Rates
## TABLE: Issues Found
## TABLE: NFR Verification Results
## TABLE: Issues by Disposition
## TABLE: Appendix

The Sessions Conducted table MUST list at least: Date, Persona, Tester, Scenarios run, Duration.

The Task Success Rates table MUST list at least: Scenario, Attempts, Successes, Rate, Threshold, Status. Any below-threshold scenario MUST cross-reference the Issues table.

The Issues Found table MUST list every issue with at least: ID, Source (manual/automated/nfr), Scenario or Test, Severity (Critical|Major|Minor), Description, Repro, Recommended fix.

The Send-back Decision section MUST contain explicit prose stating the decision and citing the Critical issue IDs that triggered it (if send-back) or the Major issues that /phase7-user-acceptance sign-off must acknowledge (if advance).
